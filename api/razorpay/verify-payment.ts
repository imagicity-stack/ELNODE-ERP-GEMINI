import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
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

class FSClient {
  private base: string;
  private auth: string;

  constructor(projectId: string, dbId: string, token: string) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;
    this.auth = `Bearer ${token}`;
  }

  private h() { return { Authorization: this.auth, 'Content-Type': 'application/json' }; }

  async getDoc(col: string, id: string): Promise<{ exists: boolean; data: Record<string, any> }> {
    const r = await fetch(`${this.base}/${col}/${id}`, { headers: this.h() });
    if (r.status === 404) return { exists: false, data: {} };
    if (!r.ok) throw new Error(`Firestore GET ${col}/${id} → ${r.status}: ${await r.text()}`);
    const doc = await r.json();
    return { exists: true, data: fromFS(doc.fields) };
  }

  async addDoc(col: string, data: Record<string, any>): Promise<string> {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) fields[k] = toFS(v);
    const r = await fetch(`${this.base}/${col}`, {
      method: 'POST', headers: this.h(), body: JSON.stringify({ fields }),
    });
    if (!r.ok) throw new Error(`Firestore ADD ${col} → ${r.status}: ${await r.text()}`);
    const doc = await r.json();
    return (doc.name as string).split('/').pop()!;
  }

  async updateDoc(col: string, id: string, data: Record<string, any>): Promise<void> {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) fields[k] = toFS(v);
    const mask = Object.keys(data).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const r = await fetch(`${this.base}/${col}/${id}?${mask}`, {
      method: 'PATCH', headers: this.h(), body: JSON.stringify({ fields }),
    });
    if (!r.ok) throw new Error(`Firestore UPDATE ${col}/${id} → ${r.status}: ${await r.text()}`);
  }
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
  try {
    const sa: ServiceAccount = JSON.parse(saRaw);
    const dbId = process.env.FIRESTORE_DATABASE_ID ?? 'ai-studio-cb22793f-2766-4225-bb0a-411c4a36f1b5';

    step = 'get-access-token';
    const token = await getAccessToken(sa);
    const db = new FSClient(sa.project_id, dbId, token);

    step = 'fetch-fee-request';
    const { exists, data: feeRequest } = await db.getDoc('feeRequests', feeRequestId);
    if (!exists) return res.status(404).json({ error: 'Fee request not found' });
    if (feeRequest.studentId !== studentId)
      return res.status(403).json({ error: 'Fee request does not belong to this student' });

    const now = new Date().toISOString();
    const receiptNumber = `REC-${Date.now()}`;

    step = 'record-payment';
    const paymentId = await db.addDoc('feePayments', {
      studentId, classId: classId || '', feeRequestId,
      feeHead: feeHead || 'Academic Fee', amount,
      date: now.split('T')[0], method: 'online',
      transactionId: razorpay_payment_id, orderId: razorpay_order_id,
      receiptNumber,
      remarks: `Online Payment${month ? ` - ${month}` : ''}`,
      verifiedAt: now,
    });

    step = 'update-fee-request';
    const newPaidAmount = (feeRequest.paidAmount || 0) + amount;
    const totalRequired = feeRequest.totalAmount - (feeRequest.waivedAmount || 0);
    const newStatus = newPaidAmount >= totalRequired ? 'paid' : 'partially_paid';
    await db.updateDoc('feeRequests', feeRequestId, { paidAmount: newPaidAmount, status: newStatus, updatedAt: now });

    if (newStatus === 'paid') {
      step = 'update-student-fee-status';
      await db.updateDoc('students', studentId, { feeStatus: 'paid', updatedAt: now });
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

        await sendWhatsApp(student.parentDetails.phone, 'payment_confirmed', [
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

    return res.status(200).json({ success: true, receiptNumber, paymentId });
  } catch (err: any) {
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
