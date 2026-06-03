import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// ────────────────────────────────────────────────────────────────────────────
// Razorpay webhook — the SERVER-SIDE safety net for payment recording.
//
// The client `handler` callback (which calls /verify-payment) can be lost when
// a mobile PWA is backgrounded/reloaded during the Razorpay redirect. In that
// case the money is captured at Razorpay but never reaches Firestore. This
// webhook is called server-to-server by Razorpay on `payment.captured`,
// independent of the client, and records the payment using the SAME
// deterministic idempotency id (`rzp_<payment_id>`) so it never double-records
// alongside the client path.
//
// Razorpay dashboard → Settings → Webhooks:
//   URL:    https://<your-domain>/api/razorpay/webhook
//   Secret: set RAZORPAY_WEBHOOK_SECRET to the same value in Vercel env
//   Events: payment.captured
// ────────────────────────────────────────────────────────────────────────────

// Disable Vercel's body parser — webhook signature must be verified against the
// EXACT raw request bytes.
export const config = { api: { bodyParser: false } };

const DEFAULT_FIRESTORE_DATABASE_ID = 'ai-studio-cb22793f-2766-4225-bb0a-411c4a36f1b5';

// ── Types ───────────────────────────────────────────────────────────────────
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}
interface FineSlab {
  startDay: number; endDay?: number; fixedPenalty: number;
  percentagePenalty: number; isHigherOf: boolean; escalationRate?: number;
}
interface FineConfig { isEnabled: boolean; gracePeriodDays: number; slabs: FineSlab[]; }

// ── Raw body reader ─────────────────────────────────────────────────────────
async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ── JWT / OAuth2 (no firebase-admin) ────────────────────────────────────────
let _tokenCache: { token: string; expiresAt: number } | null = null;
function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 120_000) return _tokenCache.token;
  const iat = Math.floor(now / 1000);
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
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

// ── Firestore REST helpers ──────────────────────────────────────────────────
function toFS(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean')  return { booleanValue: v };
  if (typeof v === 'number')   return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string')   return { stringValue: v };
  if (Array.isArray(v))        return { arrayValue: { values: v.map(toFS) } };
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
    if ('stringValue'  in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue'  in v) out[k] = v.doubleValue;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('nullValue'    in v) out[k] = null;
    else if ('arrayValue'   in v) out[k] = (v.arrayValue?.values || []).map((x: any) => fromFS({ _: x })._);
    else if ('mapValue'     in v) out[k] = fromFS(v.mapValue?.fields);
  }
  return out;
}
function toFSFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFS(v);
  return fields;
}

class FSClient {
  private base: string; private auth: string; public docPrefix: string;
  constructor(projectId: string, dbId: string, token: string) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;
    this.docPrefix = `projects/${projectId}/databases/${dbId}/documents`;
    this.auth = `Bearer ${token}`;
  }
  private h() { return { Authorization: this.auth, 'Content-Type': 'application/json' }; }
  docName(col: string, id: string): string { return `${this.docPrefix}/${col}/${id}`; }
  async getDoc(col: string, id: string): Promise<{ exists: boolean; data: Record<string, any> }> {
    const r = await fetch(`${this.base}/${col}/${id}`, { headers: this.h() });
    if (r.status === 404) return { exists: false, data: {} };
    if (!r.ok) throw new Error(`Firestore GET ${col}/${id} → ${r.status}: ${await r.text()}`);
    const doc = await r.json();
    return { exists: true, data: fromFS(doc.fields) };
  }
  async commit(writes: any[]): Promise<void> {
    const r = await fetch(`${this.base}:commit`, {
      method: 'POST', headers: this.h(), body: JSON.stringify({ writes }),
    });
    if (!r.ok) {
      const text = await r.text();
      const err: any = new Error(`Firestore commit → ${r.status}: ${text}`);
      err.status = r.status; err.body = text;
      throw err;
    }
  }
}

// ── Fine calculation (mirrors verify-payment.ts) ────────────────────────────
function calculateFine(invoice: { dueDate: string; totalAmount: number; status?: string },
                       config: FineConfig | null, today: Date = new Date()): number {
  if (!config || !config.isEnabled) return 0;
  const due = new Date(invoice.dueDate);
  if (isNaN(due.getTime())) return 0;
  const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (daysOverdue <= (config.gracePeriodDays || 0)) return 0;
  const slab = (config.slabs || []).find(s => {
    const after = daysOverdue >= s.startDay;
    const before = s.endDay ? daysOverdue <= s.endDay : true;
    return after && before;
  });
  if (!slab) return 0;
  const fixed = slab.fixedPenalty || 0;
  const percent = (invoice.totalAmount * (slab.percentagePenalty || 0)) / 100;
  let penalty = slab.isHigherOf ? Math.max(fixed, percent) : (fixed + percent);
  if (slab.escalationRate && !slab.endDay) {
    penalty += (daysOverdue - slab.startDay) * slab.escalationRate;
  }
  return Math.round(penalty);
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  let step = 'init';
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    step = 'read-raw-body';
    const raw = await readRawBody(req);

    step = 'verify-signature';
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[webhook] RAZORPAY_WEBHOOK_SECRET not set');
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    const sigHeader = req.headers['x-razorpay-signature'];
    const expected = crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
    if (typeof sigHeader !== 'string' || expected !== sigHeader) {
      console.error('[webhook] signature mismatch');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    step = 'parse-payload';
    const payload = JSON.parse(raw);
    const event: string = payload?.event || '';

    // We only act on captured payments. Acknowledge everything else with 200 so
    // Razorpay does not keep retrying.
    if (event !== 'payment.captured') {
      return res.status(200).json({ ok: true, ignored: event });
    }

    const payment = payload?.payload?.payment?.entity;
    if (!payment?.id) return res.status(200).json({ ok: true, note: 'no payment entity' });

    const razorpay_payment_id: string = payment.id;
    const razorpay_order_id: string = payment.order_id || '';
    const amountPaise: number = Number(payment.amount || 0);
    const amount = Math.round(amountPaise) / 100; // rupees
    const notes = payment.notes || {};
    const feeRequestId: string = notes.feeRequestId || '';
    const studentId: string = notes.studentId || '';
    const kind: string = notes.kind || 'fee';

    // Advance payments cannot be reconstructed from notes alone (no monthly
    // breakdown). They remain client-recorded for now. Acknowledge & skip.
    if (kind === 'advance' || !feeRequestId || !studentId) {
      console.log(`[webhook] skipping non-fee/incomplete payment ${razorpay_payment_id} (kind=${kind})`);
      return res.status(200).json({ ok: true, skipped: true });
    }

    step = 'parse-service-account';
    const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!saRaw) return res.status(500).json({ error: 'Firebase not configured' });
    const sa: ServiceAccount = JSON.parse(saRaw);
    const dbId = process.env.FIREBASE_DATABASE_ID
      || process.env.FIRESTORE_DATABASE_ID
      || DEFAULT_FIRESTORE_DATABASE_ID;

    step = 'get-access-token';
    const token = await getAccessToken(sa);
    const db = new FSClient(sa.project_id, dbId, token);

    const paymentDocId = `rzp_${razorpay_payment_id}`;

    step = 'parallel-reads';
    const [existing, feeRequestSnap, fineCfgDoc, settingsDoc, feeCounterDoc] = await Promise.all([
      db.getDoc('feePayments', paymentDocId),
      db.getDoc('feeRequests', feeRequestId),
      db.getDoc('fineConfig', 'global'),
      db.getDoc('settings', 'global'),
      db.getDoc('counters', 'fee'),
    ]);

    // Already recorded by the client path or a previous webhook delivery — done.
    if (existing.exists) {
      return res.status(200).json({ ok: true, idempotent: true, receiptNumber: existing.data.receiptNumber });
    }

    step = 'validate-fee-request';
    if (!feeRequestSnap.exists) {
      console.error(`[webhook] feeRequest ${feeRequestId} not found for payment ${razorpay_payment_id}`);
      return res.status(200).json({ ok: true, note: 'fee request not found' });
    }
    const feeRequest = feeRequestSnap.data;
    if (feeRequest.studentId !== studentId) {
      console.error(`[webhook] student mismatch for payment ${razorpay_payment_id}`);
      return res.status(200).json({ ok: true, note: 'student mismatch' });
    }
    // If already fully paid, still record the captured payment as an overpayment
    // entry? No — acknowledge and skip; the money is reconciled at Razorpay.
    if (feeRequest.status === 'paid') {
      return res.status(200).json({ ok: true, note: 'already paid' });
    }

    step = 'calculate-fine';
    const fineConfig: FineConfig | null = fineCfgDoc.exists ? (fineCfgDoc.data as FineConfig) : null;
    const fineAmount = calculateFine(
      { dueDate: feeRequest.dueDate, totalAmount: feeRequest.totalAmount, status: feeRequest.status },
      fineConfig,
    );
    const alreadyPaid = feeRequest.paidAmount || 0;
    const totalRequired = (feeRequest.totalAmount || 0) + fineAmount - (feeRequest.waivedAmount || 0);

    const newPaidAmount = alreadyPaid + amount;
    const newStatus = newPaidAmount + 0.001 >= totalRequired ? 'paid' : 'partially_paid';
    const now = new Date().toISOString();

    // Receipt number from configured prefix + sequential counter
    const settingsData = settingsDoc.exists ? settingsDoc.data : {};
    const feeReceiptCfg = (settingsData.receiptConfig as any)?.feeReceipt || {};
    const receiptPrefix = feeReceiptCfg.prefix || settingsData.receiptPrefix || 'EHSREC';
    const receiptStartFrom = Number(feeReceiptCfg.startFrom ?? settingsData.receiptStartNumber ?? 1);
    const lastFeeNum = feeCounterDoc.exists ? Number(feeCounterDoc.data.lastNumber || 0) : 0;
    const nextFeeNum = Math.max(lastFeeNum + 1, receiptStartFrom);
    const receiptNumber = `${receiptPrefix}${String(nextFeeNum).padStart(4, '0')}`;

    step = 'atomic-commit';
    const writes: any[] = [
      {
        update: {
          name: db.docName('feePayments', paymentDocId),
          fields: toFSFields({
            studentId,
            classId: feeRequest.classId || '',
            feeRequestId,
            feeHead: (feeRequest.heads && feeRequest.heads[0]?.name) || 'Academic Fee',
            amount,
            fineAmount,
            date: now.split('T')[0],
            method: 'online',
            transactionId: razorpay_payment_id,
            orderId: razorpay_order_id,
            receiptNumber,
            remarks: `Online Payment (webhook)${feeRequest.month ? ` - ${feeRequest.month}` : ''}`,
            verifiedAt: now,
            source: 'webhook',
          }),
        },
        currentDocument: { exists: false },
      },
      {
        updateMask: { fieldPaths: ['paidAmount', 'status', 'fineAmount', 'updatedAt'] },
        update: {
          name: db.docName('feeRequests', feeRequestId),
          fields: toFSFields({ paidAmount: newPaidAmount, status: newStatus, fineAmount, updatedAt: now }),
        },
      },
      {
        update: {
          name: db.docName('counters', 'fee'),
          fields: toFSFields({ lastNumber: nextFeeNum }),
        },
      },
    ];
    if (newStatus === 'paid') {
      writes.push({
        updateMask: { fieldPaths: ['feeStatus', 'updatedAt'] },
        update: {
          name: db.docName('students', studentId),
          fields: toFSFields({ feeStatus: 'paid', updatedAt: now }),
        },
      });
    }

    try {
      await db.commit(writes);
    } catch (commitErr: any) {
      // Idempotency race with the client path — already recorded, treat as success.
      if (commitErr?.status === 400 && /already exists|FAILED_PRECONDITION/i.test(commitErr.body || '')) {
        return res.status(200).json({ ok: true, idempotent: true });
      }
      throw commitErr;
    }

    console.log(`[webhook] recorded payment ${razorpay_payment_id} → receipt ${receiptNumber}`);
    return res.status(200).json({ ok: true, receiptNumber, newStatus });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`[webhook] FAILED step="${step}":`, msg);
    // Return 500 so Razorpay retries the webhook (it retries failed deliveries).
    return res.status(500).json({ error: 'Webhook processing failed', _step: step, _detail: msg });
  }
}
