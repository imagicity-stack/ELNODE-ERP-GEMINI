import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// ── Firebase ID token verification (no firebase-admin) ───────────────────────
let _fbCerts: { certs: Record<string, string>; exp: number } | null = null;
async function getFirebaseCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_fbCerts && _fbCerts.exp > now) return _fbCerts.certs;
  const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new Error('Could not fetch Firebase certs');
  const certs = await r.json() as Record<string, string>;
  const m = (r.headers.get('cache-control') || '').match(/max-age=(\d+)/);
  const ttl = Math.min(m ? Number(m[1]) * 1000 : 3_600_000, 3_600_000);
  _fbCerts = { certs, exp: now + ttl };
  return certs;
}
function b64urlToBuf(s: string): Buffer { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
async function verifyFirebaseToken(authHeader: string | undefined, projectId: string): Promise<{ uid: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ') || !projectId) return null;
  const parts = authHeader.slice(7).trim().split('.');
  if (parts.length !== 3) return null;
  let header: any, payload: any;
  try { header = JSON.parse(b64urlToBuf(parts[0]).toString('utf8')); payload = JSON.parse(b64urlToBuf(parts[1]).toString('utf8')); }
  catch { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;
  let cert: string | undefined;
  try { cert = (await getFirebaseCerts())[header.kid]; } catch { return null; }
  if (!cert) return null;
  let pubKey: any;
  try { pubKey = new crypto.X509Certificate(cert).publicKey; } catch { return null; }
  if (!crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), pubKey, b64urlToBuf(parts[2]))) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (typeof payload.iat !== 'number' || payload.iat > now + 300) return null;
  const uid = payload.user_id || payload.sub;
  return uid ? { uid } : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate the caller (signed-in parent/student) via their Firebase ID token.
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) return res.status(500).json({ error: 'Server not configured' });
  let projectId = '';
  try { projectId = JSON.parse(saRaw).project_id; } catch { /* handled below */ }
  const caller = await verifyFirebaseToken(req.headers.authorization, projectId);
  if (!caller) return res.status(401).json({ error: 'Authentication required' });

  const { amountInPaise, feeRequestId, studentId, kind } = req.body;

  if (!amountInPaise || typeof amountInPaise !== 'number' || amountInPaise < 100) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  // Two flows: regular fee payment requires feeRequestId; advance payment does not.
  if (kind === 'advance') {
    if (!studentId) {
      return res.status(400).json({ error: 'Missing studentId for advance order' });
    }
  } else if (!feeRequestId || !studentId) {
    return res.status(400).json({ error: 'Missing feeRequestId or studentId' });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  console.log('[create-order] env check — KEY_ID present:', !!keyId, '| KEY_SECRET present:', !!keySecret);

  if (!keyId || !keySecret) {
    console.error('[create-order] Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET env vars');
    return res.status(500).json({ error: 'Payment gateway not configured' });
  }

  try {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: kind === 'advance'
          ? `adv_${studentId}_${Date.now()}`.slice(0, 40)
          : `rcpt_${feeRequestId}`.slice(0, 40),
        notes: kind === 'advance'
          ? { kind: 'advance', studentId }
          : { feeRequestId, studentId },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('[create-order] Razorpay API error:', JSON.stringify(err));
      return res.status(502).json({ error: 'Failed to create payment order', detail: err?.error?.description });
    }

    const order = await response.json();
    return res.status(200).json({ orderId: order.id });
  } catch (err) {
    console.error('[create-order] Unexpected error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal server error', detail: err instanceof Error ? err.message : 'Unknown' });
  }
}
