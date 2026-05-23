/**
 * POST /api/notifications/send-push
 *
 * Sends FCM push notifications to all users whose `audienceTokens` field
 * contains at least one token from the notification's `audience` array.
 *
 * Uses plain fetch + manual JWT auth — no firebase-admin SDK dependency.
 *
 * Body: {
 *   notificationId: string,
 *   audience: string[],        // e.g. ['all'] | ['role:student'] | ['class:X:A']
 *   title: string,
 *   body: string,
 *   category: string,
 *   priority: 'normal' | 'high',
 *   link?: string,
 * }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

// ─── JWT / OAuth2 ────────────────────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: [
      'https://www.googleapis.com/auth/firebase.messaging',
      'https://www.googleapis.com/auth/datastore',
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const sig = b64url(signer.sign(sa.private_key));
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json() as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`OAuth2 error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ─── Firestore REST ──────────────────────────────────────────────────────────

interface FirestoreValue {
  stringValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  nullValue?: null;
}

function strVal(s: string): FirestoreValue { return { stringValue: s }; }

async function queryFcmTokens(
  projectId: string,
  token: string,
  audience: string[]
): Promise<string[]> {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  // Build ARRAY_CONTAINS_ANY filter over audienceTokens
  const filter = audience.length === 1
    ? {
        fieldFilter: {
          field: { fieldPath: 'audienceTokens' },
          op: 'ARRAY_CONTAINS',
          value: strVal(audience[0]),
        },
      }
    : {
        fieldFilter: {
          field: { fieldPath: 'audienceTokens' },
          op: 'ARRAY_CONTAINS_ANY',
          value: {
            arrayValue: { values: audience.map(strVal) },
          },
        },
      };

  const body = {
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: filter,
      select: {
        fields: [{ fieldPath: 'fcmTokens' }],
      },
      limit: 2000,
    },
  };

  const res = await fetch(`${base}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Firestore runQuery failed: ${res.status} ${err}`);
  }

  const rows = await res.json() as Array<{ document?: { fields?: Record<string, FirestoreValue> } }>;
  const tokens = new Set<string>();

  for (const row of rows) {
    const fcmField = row.document?.fields?.fcmTokens;
    const values = fcmField?.arrayValue?.values ?? [];
    for (const v of values) {
      if (v.stringValue) tokens.add(v.stringValue);
    }
  }

  return Array.from(tokens);
}

// ─── FCM v1 send ─────────────────────────────────────────────────────────────

async function sendFcmBatch(
  projectId: string,
  accessToken: string,
  fcmTokens: string[],
  payload: {
    title: string;
    body: string;
    data: Record<string, string>;
    priority: 'normal' | 'high';
  }
): Promise<{ sent: number; failed: number }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const CONCURRENCY = 20;
  let sent = 0;
  let failed = 0;

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < fcmTokens.length; i += CONCURRENCY) {
    const batch = fcmTokens.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map((fcmToken) =>
        fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: fcmToken,
              notification: {
                title: payload.title,
                body: payload.body,
              },
              data: payload.data,
              android: {
                priority: payload.priority === 'high' ? 'high' : 'normal',
                notification: {
                  channel_id: 'elnode_default',
                  icon: 'ic_launcher',
                  color: '#4F46E5',
                  sound: 'default',
                },
              },
            },
          }),
        }).then((r) => {
          if (r.ok) return 'ok';
          // Stale token — not a hard error
          return r.json().then((d: any) => `fail:${d?.error?.status || r.status}`);
        })
      )
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value === 'ok') sent++;
      else failed++;
    }
  }

  return { sent, failed };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT not set' });

  let sa: ServiceAccount;
  try { sa = JSON.parse(saRaw); } catch {
    return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT is not valid JSON' });
  }

  const { notificationId, audience, title, body, category, priority = 'normal', link } = req.body as {
    notificationId: string;
    audience: string[];
    title: string;
    body: string;
    category: string;
    priority?: 'normal' | 'high';
    link?: string;
  };

  if (!audience?.length || !title || !body) {
    return res.status(400).json({ error: 'Missing required fields: audience, title, body' });
  }

  try {
    const accessToken = await getAccessToken(sa);

    const fcmTokens = await queryFcmTokens(sa.project_id, accessToken, audience);

    if (fcmTokens.length === 0) {
      return res.status(200).json({ sent: 0, failed: 0, message: 'No FCM tokens found for audience' });
    }

    const result = await sendFcmBatch(sa.project_id, accessToken, fcmTokens, {
      title,
      body,
      priority,
      data: {
        notificationId: notificationId || '',
        category: category || 'general',
        link: link || '',
        priority,
      },
    });

    return res.status(200).json({
      ...result,
      recipients: fcmTokens.length,
    });
  } catch (err: any) {
    console.error('[send-push] error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
