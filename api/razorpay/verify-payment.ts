import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface FineSlab {
  startDay: number;
  endDay?: number;
  fixedPenalty: number;
  percentagePenalty: number;
  isHigherOf: boolean;
  escalationRate?: number;
}

interface FineConfig {
  isEnabled: boolean;
  gracePeriodDays: number;
  slabs: FineSlab[];
}

// ── JWT / OAuth2 helper (no firebase-admin, no native modules) ────────────────
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

  _tokenCache = { token: data.access_token, expiresAt: now + 3_000_000 }; // cache 50 min
  return data.access_token;
}

// ── Firestore REST helpers ────────────────────────────────────────────────────
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
  private base: string;
  private auth: string;
  public docPrefix: string; // `projects/.../databases/.../documents`

  constructor(projectId: string, dbId: string, token: string) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;
    this.docPrefix = `projects/${projectId}/databases/${dbId}/documents`;
    this.auth = `Bearer ${token}`;
  }

  private h() { return { Authorization: this.auth, 'Content-Type': 'application/json' }; }

  docName(col: string, id: string): string {
    return `${this.docPrefix}/${col}/${id}`;
  }

  async getDoc(col: string, id: string, txId?: string): Promise<{ exists: boolean; data: Record<string, any> }> {
    const url = txId
      ? `${this.base}/${col}/${id}?transaction=${encodeURIComponent(txId)}`
      : `${this.base}/${col}/${id}`;
    const r = await fetch(url, { headers: this.h() });
    if (r.status === 404) return { exists: false, data: {} };
    if (!r.ok) throw new Error(`Firestore GET ${col}/${id} → ${r.status}: ${await r.text()}`);
    const doc = await r.json();
    return { exists: true, data: fromFS(doc.fields) };
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

  async beginTransaction(): Promise<string> {
    const r = await fetch(`${this.base}:beginTransaction`, {
      method: 'POST', headers: this.h(), body: '{}',
    });
    if (!r.ok) throw new Error(`Firestore beginTx → ${r.status}: ${await r.text()}`);
    const j = await r.json() as { transaction: string };
    return j.transaction;
  }

  async commit(writes: any[], txId?: string): Promise<void> {
    const body: any = { writes };
    if (txId) body.transaction = txId;
    const r = await fetch(`${this.base}:commit`, {
      method: 'POST', headers: this.h(), body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text();
      const err: any = new Error(`Firestore commit → ${r.status}: ${text}`);
      err.status = r.status;
      err.body = text;
      throw err;
    }
  }

  async rollback(txId: string): Promise<void> {
    try {
      await fetch(`${this.base}:rollback`, {
        method: 'POST', headers: this.h(), body: JSON.stringify({ transaction: txId }),
      });
    } catch { /* swallow */ }
  }
}

// ── Fine calculation (server-side, mirrors src/services/fineService.ts) ───────
function calculateFine(invoice: { dueDate: string; totalAmount: number; status?: string },
                       config: FineConfig | null,
                       today: Date = new Date()): number {
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
    const extraDays = daysOverdue - slab.startDay;
    penalty += extraDays * slab.escalationRate;
  }
  return Math.round(penalty);
}

// ── WATI (inlined to avoid cross-directory import bundling issues) ─────────────
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
    feeRequestId, studentId, classId, amount, feeHead, month,
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    return res.status(400).json({ error: 'Missing payment fields' });
  if (!feeRequestId || !studentId || typeof amount !== 'number' || amount <= 0)
    return res.status(400).json({ error: 'Missing or invalid payment metadata' });

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return res.status(500).json({ error: 'Payment gateway not configured' });

  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) return res.status(500).json({ error: 'Firebase not configured' });

  // Verify Razorpay HMAC
  const expectedSig = crypto.createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (expectedSig !== razorpay_signature)
    return res.status(400).json({ error: 'Payment signature verification failed' });

  let step = 'parse-service-account';
  let txId: string | undefined;
  let db: FSClient | undefined;
  try {
    const sa: ServiceAccount = JSON.parse(saRaw);
    const dbId = process.env.FIRESTORE_DATABASE_ID ?? 'ai-studio-cb22793f-2766-4225-bb0a-411c4a36f1b5';

    step = 'get-access-token';
    const token = await getAccessToken(sa);
    db = new FSClient(sa.project_id, dbId, token);

    // ── Idempotency check: deterministic payment doc id keyed on razorpay payment id
    const paymentDocId = `rzp_${razorpay_payment_id}`;

    step = 'idempotency-check';
    const existing = await db.getDoc('feePayments', paymentDocId);
    if (existing.exists) {
      // Webhook retry — payment already recorded. Return success without duplicating.
      return res.status(200).json({
        success: true,
        receiptNumber: existing.data.receiptNumber,
        paymentId: paymentDocId,
        idempotent: true,
      });
    }

    // ── Begin Firestore transaction for consistent paidAmount update
    step = 'begin-transaction';
    txId = await db.beginTransaction();

    step = 'fetch-fee-request';
    const { exists, data: feeRequest } = await db.getDoc('feeRequests', feeRequestId, txId);
    if (!exists) {
      await db.rollback(txId);
      return res.status(404).json({ error: 'Fee request not found' });
    }
    if (feeRequest.studentId !== studentId) {
      await db.rollback(txId);
      return res.status(403).json({ error: 'Fee request does not belong to this student' });
    }
    if (feeRequest.status === 'paid') {
      await db.rollback(txId);
      return res.status(409).json({ error: 'Fee request is already fully paid' });
    }

    // ── Server-side fine recalculation (do not trust client-supplied amount)
    step = 'load-fine-config';
    const fineCfgDoc = await db.getDoc('fineConfig', 'global');
    const fineConfig: FineConfig | null = fineCfgDoc.exists
      ? (fineCfgDoc.data as FineConfig)
      : null;
    const fineAmount = calculateFine(
      { dueDate: feeRequest.dueDate, totalAmount: feeRequest.totalAmount, status: feeRequest.status },
      fineConfig,
    );

    const alreadyPaid = feeRequest.paidAmount || 0;
    const totalRequired = (feeRequest.totalAmount || 0) + fineAmount - (feeRequest.waivedAmount || 0);
    const remaining = Math.max(0, totalRequired - alreadyPaid);

    if (amount > remaining + 0.001) {
      await db.rollback(txId);
      return res.status(400).json({
        error: 'Payment amount exceeds remaining balance',
        remaining,
      });
    }

    const newPaidAmount = alreadyPaid + amount;
    const newStatus = newPaidAmount + 0.001 >= totalRequired ? 'paid' : 'partially_paid';
    const now = new Date().toISOString();
    const receiptNumber = `REC-${Date.now()}`;

    // ── Atomic commit: payment + fee request + student status all-or-nothing
    step = 'atomic-commit';
    const writes: any[] = [
      // 1. Create payment with idempotency precondition (must not already exist)
      {
        update: {
          name: db.docName('feePayments', paymentDocId),
          fields: toFSFields({
            studentId,
            classId: classId || '',
            feeRequestId,
            feeHead: feeHead || 'Academic Fee',
            amount,
            fineAmount,
            date: now.split('T')[0],
            method: 'online',
            transactionId: razorpay_payment_id,
            orderId: razorpay_order_id,
            receiptNumber,
            remarks: `Online Payment${month ? ` - ${month}` : ''}`,
            verifiedAt: now,
          }),
        },
        currentDocument: { exists: false },
      },
      // 2. Update fee request paid amount + status + snapshot fine
      {
        updateMask: { fieldPaths: ['paidAmount', 'status', 'fineAmount', 'updatedAt'] },
        update: {
          name: db.docName('feeRequests', feeRequestId),
          fields: toFSFields({
            paidAmount: newPaidAmount,
            status: newStatus,
            fineAmount,
            updatedAt: now,
          }),
        },
      },
    ];

    // 3. If fully paid, mark student feeStatus = 'paid' in the same commit
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
      await db.commit(writes, txId);
    } catch (commitErr: any) {
      // Idempotency race: another worker already recorded this payment between
      // our pre-check and the commit. Return success with the existing record.
      if (commitErr?.status === 400 && /already exists|FAILED_PRECONDITION/i.test(commitErr.body || '')) {
        const dup = await db.getDoc('feePayments', paymentDocId);
        if (dup.exists) {
          return res.status(200).json({
            success: true,
            receiptNumber: dup.data.receiptNumber,
            paymentId: paymentDocId,
            idempotent: true,
          });
        }
      }
      throw commitErr;
    }

    // Auto WhatsApp — fire-and-forget, never blocks payment success
    try {
      const { exists: sExists, data: student } = await db.getDoc('students', studentId);
      if (sExists && student.parentDetails?.phone) {
        let classSection = student.classId || '';
        try {
          const { exists: cExists, data: cls } = await db.getDoc('classes', student.classId);
          if (cExists) classSection = `${cls.name} - ${student.section || ''}`.trim();
        } catch { /* best-effort */ }

        await sendWhatsApp(student.parentDetails.phone, 'payments_confirmed', [
          student.parentDetails?.fatherName || 'Parent',
          `₹${amount.toLocaleString('en-IN')}`,
          student.name,
          classSection,
          receiptNumber,
          now.split('T')[0],
          'Online',
        ]);
      }
    } catch (waErr) {
      console.error('[verify-payment] WhatsApp non-fatal:', waErr);
    }

    return res.status(200).json({
      success: true,
      receiptNumber,
      paymentId: paymentDocId,
      fineAmount,
      newStatus,
    });
  } catch (err: any) {
    if (txId && db) await db.rollback(txId);
    const msg = err?.message || String(err);
    console.error(`[verify-payment] FAILED step="${step}":`, msg);
    return res.status(500).json({
      error: 'Payment was verified but could not be recorded. Contact support.',
      transactionId: razorpay_payment_id,
      _step: step,
      _detail: msg,
    });
  }
}
