import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Inlined to avoid a cross-directory JSON import that can fail Vercel's bundler
// at module-load time (uncatchable FUNCTION_INVOCATION_FAILED). Mirrors
// firebase-applet-config.json's firestoreDatabaseId.
const DEFAULT_FIRESTORE_DATABASE_ID = 'ai-studio-cb22793f-2766-4225-bb0a-411c4a36f1b5';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface AdvanceMonthlyEntry {
  month: string;
  heads: { name: string; amount: number }[];
  consumed: boolean;
}

// ── JWT / OAuth2 helper (mirrors verify-payment.ts) ──────────────────────────
let _tokenCache: { token: string; expiresAt: number } | null = null;

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 120_000) return _tokenCache.token;

  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp: iat + 3600,
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
  if (!data.access_token) throw new Error(`OAuth2 token error: ${data.error || 'unknown'}`);

  _tokenCache = { token: data.access_token, expiresAt: now + 3_000_000 };
  return data.access_token;
}

// ── Firestore REST helpers ────────────────────────────────────────────────────
function toFS(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFS) } };
  if (typeof v === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFS(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function fromFS(fields: Record<string, any> = {}): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = v.doubleValue;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('nullValue' in v) out[k] = null;
    else if ('arrayValue' in v) out[k] = (v.arrayValue?.values || []).map((x: any) => fromFS({ _: x })._);
    else if ('mapValue' in v) out[k] = fromFS(v.mapValue?.fields);
  }
  return out;
}

function toFSFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFS(v);
  return fields;
}

class FSClient {
  private base: string;
  private auth: string;
  public docPrefix: string;

  constructor(projectId: string, dbId: string, token: string) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;
    this.docPrefix = `projects/${projectId}/databases/${dbId}/documents`;
    this.auth = `Bearer ${token}`;
  }

  private h() { return { Authorization: this.auth, 'Content-Type': 'application/json' }; }

  docName(col: string, id: string): string {
    return `${this.docPrefix}/${col}/${id}`;
  }

  async getDoc(col: string, id: string): Promise<{ exists: boolean; data: Record<string, any> }> {
    const r = await fetch(`${this.base}/${col}/${id}`, { headers: this.h() });
    if (r.status === 404) return { exists: false, data: {} };
    if (!r.ok) throw new Error(`Firestore GET ${col}/${id} → ${r.status}: ${await r.text()}`);
    const doc = await r.json();
    return { exists: true, data: fromFS(doc.fields) };
  }

  async commit(writes: any[]): Promise<void> {
    const r = await fetch(`${this.base}:commit`, {
      method: 'POST',
      headers: this.h(),
      body: JSON.stringify({ writes }),
    });
    if (!r.ok) {
      const text = await r.text();
      const err: any = new Error(`Firestore commit → ${r.status}: ${text}`);
      err.status = r.status;
      err.body = text;
      throw err;
    }
  }

  async runQuery(structuredQuery: any): Promise<Array<{ id: string; data: Record<string, any> }>> {
    const r = await fetch(`${this.base}:runQuery`, {
      method: 'POST',
      headers: this.h(),
      body: JSON.stringify({ structuredQuery }),
    });
    if (!r.ok) throw new Error(`Firestore runQuery → ${r.status}: ${await r.text()}`);
    const arr = await r.json() as any[];
    return arr.filter(x => x.document).map(x => ({
      id: x.document.name.split('/').pop()!,
      data: fromFS(x.document.fields || {}),
    }));
  }
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────
function formatPhone(raw: string): string {
  const n = raw.replace(/\D/g, '');
  if (n.length === 10) return '91' + n;
  if (n.length === 11 && n.startsWith('0')) return '91' + n.slice(1);
  return n.startsWith('91') ? n : '91' + n;
}

async function sendWhatsApp(phone: string, template: string, params: string[]): Promise<void> {
  const token = process.env.WATI_API_TOKEN;
  if (!token) return;
  await fetch(
    `https://live-mt-server.wati.io/10155007/api/v1/sendTemplateMessage?whatsappNumber=${formatPhone(phone)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_name: template,
        broadcast_name: template,
        parameters: params.map((value, i) => ({ name: String(i + 1), value })),
      }),
    },
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    razorpay_order_id, razorpay_payment_id, razorpay_signature,
    studentId, classId, parentId, academicYear,
    monthlyBreakdown, totalAmount, remarks,
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields' });
  }
  if (!studentId || typeof totalAmount !== 'number' || totalAmount <= 0) {
    return res.status(400).json({ error: 'Missing or invalid advance metadata' });
  }
  if (!Array.isArray(monthlyBreakdown) || monthlyBreakdown.length === 0) {
    return res.status(400).json({ error: 'monthlyBreakdown must be a non-empty array' });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return res.status(500).json({ error: 'Payment gateway not configured' });

  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) return res.status(500).json({ error: 'Firebase not configured' });

  // Verify Razorpay HMAC
  const expectedSig = crypto.createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (expectedSig !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment signature verification failed' });
  }

  // Validate sum of monthlyBreakdown matches totalAmount (anti-tamper)
  const sum = monthlyBreakdown.reduce((acc: number, m: AdvanceMonthlyEntry) =>
    acc + (m.heads || []).reduce((s, h) => s + (h.amount || 0), 0), 0);
  if (Math.abs(sum - totalAmount) > 0.01) {
    return res.status(400).json({ error: 'Total amount does not match monthlyBreakdown sum' });
  }

  // Bind the recorded advance to what Razorpay actually captured. The HMAC proves
  // the (order, payment) pair is authentic but not the amount; totalAmount and the
  // monthly breakdown are client-written. Refetch the server-created order and
  // require captured amount + studentId to match, so a ₹1 payment can't be turned
  // into a large advance credit.
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) return res.status(500).json({ error: 'Payment gateway not configured' });
  const expectedPaise = Math.round(totalAmount * 100);
  const orderResp = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpay_order_id)}`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64') },
  });
  if (!orderResp.ok) return res.status(502).json({ error: 'Could not verify the payment with the gateway' });
  const order: any = await orderResp.json();
  if (Number(order.amount_paid || 0) < Number(order.amount || 0))
    return res.status(400).json({ error: 'Payment has not been captured' });
  if (Number(order.amount) !== expectedPaise)
    return res.status(400).json({ error: 'Payment amount does not match the order' });
  if ((order.notes?.studentId || '') !== studentId)
    return res.status(403).json({ error: 'Payment order does not match this student' });

  let step = 'parse-service-account';
  try {
    const sa: ServiceAccount = JSON.parse(saRaw);
    // DB id resolution: Vercel env var (FIREBASE_DATABASE_ID) takes precedence so the
    // target database can be swapped per environment for testing; FIRESTORE_DATABASE_ID
    // is kept as a transitional fallback; the committed applet config is the default.
    const dbId = process.env.FIREBASE_DATABASE_ID
      || process.env.FIRESTORE_DATABASE_ID
      || DEFAULT_FIRESTORE_DATABASE_ID;

    step = 'get-access-token';
    const token = await getAccessToken(sa);
    const db = new FSClient(sa.project_id, dbId, token);

    // Idempotency: deterministic doc id keyed on razorpay payment id
    const advanceDocId = `adv_rzp_${razorpay_payment_id}`;

    step = 'idempotency-check';
    const existing = await db.getDoc('advancePayments', advanceDocId);
    if (existing.exists) {
      return res.status(200).json({
        success: true,
        receiptNumber: existing.data.receiptNumber,
        advanceId: advanceDocId,
        idempotent: true,
      });
    }

    // Server-side duplicate-month check: reject if any selected month already has
    // an unconsumed advance for this student (the client should already block this
    // but never trust the client).
    step = 'duplicate-month-check';
    const existingAdvances = await db.runQuery({
      from: [{ collectionId: 'advancePayments' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'studentId' },
          op: 'EQUAL',
          value: { stringValue: studentId },
        },
      },
    });
    const alreadyCovered = new Set<string>();
    for (const adv of existingAdvances) {
      const breakdown: AdvanceMonthlyEntry[] = (adv.data.monthlyBreakdown || []) as any;
      for (const e of breakdown) {
        if (!e.consumed) alreadyCovered.add(e.month);
      }
    }
    const requested: string[] = (monthlyBreakdown as AdvanceMonthlyEntry[]).map(e => e.month);
    const dupes = requested.filter(m => alreadyCovered.has(m));
    if (dupes.length > 0) {
      return res.status(409).json({
        error: `Already covered by an active advance: ${dupes.join(', ')}`,
      });
    }

    // Receipt number from configured advance prefix + sequential counter
    step = 'load-advance-counter';
    const [settingsDoc, advCounterDoc] = await Promise.all([
      db.getDoc('settings', 'global'),
      db.getDoc('counters', 'advance'),
    ]);
    const settingsData = settingsDoc.exists ? settingsDoc.data : {};
    const advCfg = (settingsData.receiptConfig as any)?.advanceReceipt || {};
    const advPrefix = advCfg.prefix || 'EHSADV';
    const advStartFrom = Number(advCfg.startFrom ?? 1);
    const lastAdvNum = advCounterDoc.exists ? Number(advCounterDoc.data.lastNumber || 0) : 0;
    const nextAdvNum = Math.max(lastAdvNum + 1, advStartFrom);
    const receiptNumber = `${advPrefix}${String(nextAdvNum).padStart(4, '0')}`;
    const now = new Date().toISOString();

    step = 'commit';
    await db.commit([
      {
        update: {
          name: db.docName('advancePayments', advanceDocId),
          fields: toFSFields({
            studentId,
            classId: classId || '',
            parentId: parentId || '',
            academicYear: academicYear || '2024-25',
            monthlyBreakdown: (monthlyBreakdown as AdvanceMonthlyEntry[]).map(e => ({
              month: e.month,
              heads: e.heads,
              consumed: false,
            })),
            totalAmount,
            paymentMethod: 'online',
            referenceNumber: razorpay_payment_id,
            receiptNumber,
            date: now.split('T')[0],
            remarks: remarks || '',
            createdBy: parentId || 'parent',
            createdAt: now,
            status: 'active',
            transactionId: razorpay_payment_id,
            orderId: razorpay_order_id,
          }),
        },
        currentDocument: { exists: false },
      },
      // Increment advance receipt counter atomically with the payment
      {
        update: {
          name: db.docName('counters', 'advance'),
          fields: toFSFields({ lastNumber: nextAdvNum }),
        },
      },
    ]);

    // WhatsApp confirmation — fire-and-forget
    try {
      const { exists: sExists, data: student } = await db.getDoc('students', studentId);
      if (sExists && student.parentDetails?.phone) {
        const monthSummary = requested.join(', ');
        await sendWhatsApp(student.parentDetails.phone, 'payments_confirmed', [
          student.parentDetails?.fatherName || 'Parent',
          `₹${totalAmount.toLocaleString('en-IN')}`,
          student.name,
          `${student.classId || ''} - ${student.section || ''}`.trim(),
          receiptNumber,
          now.split('T')[0],
          `Advance: ${monthSummary}`,
        ]);
      }
    } catch (waErr) {
      console.error('[verify-advance-payment] WhatsApp non-fatal:', waErr);
    }

    return res.status(200).json({
      success: true,
      receiptNumber,
      advanceId: advanceDocId,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`[verify-advance-payment] FAILED step="${step}":`, msg);
    return res.status(500).json({
      error: 'Payment was verified but the advance could not be recorded. Contact support.',
      transactionId: razorpay_payment_id,
      _step: step,
      _detail: msg,
    });
  }
}
