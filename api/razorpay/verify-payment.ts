import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const FIRESTORE_DB_ID = process.env.FIRESTORE_DATABASE_ID ?? 'ai-studio-cb22793f-2766-4225-bb0a-411c4a36f1b5';

function toField(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string') return { stringValue: val };
  return { stringValue: String(val) };
}

function fromFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = v.doubleValue;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('nullValue' in v) out[k] = null;
    else out[k] = v;
  }
  return out;
}

async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }).toString(),
  });

  const data: any = await res.json();
  if (!data.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

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

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) return res.status(500).json({ error: 'Firebase not configured' });

  // Verify Razorpay HMAC signature
  const expected = crypto.createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (expected !== razorpay_signature)
    return res.status(400).json({ error: 'Payment signature verification failed' });

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    const token = await getGoogleAccessToken(serviceAccount);
    const base = `https://firestore.googleapis.com/v1/projects/${serviceAccount.project_id}/databases/${FIRESTORE_DB_ID}/documents`;
    const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Fetch feeRequest
    const feeReqRes = await fetch(`${base}/feeRequests/${feeRequestId}`, { headers: auth });
    if (!feeReqRes.ok) return res.status(404).json({ error: 'Fee request not found' });
    const feeReqDoc: any = await feeReqRes.json();
    const feeRequest = fromFields(feeReqDoc.fields ?? {});

    if (feeRequest.studentId !== studentId)
      return res.status(403).json({ error: 'Fee request does not belong to this student' });

    const now = new Date().toISOString();
    const receiptNumber = `REC-${Date.now()}`;

    // Write feePayment
    const paymentFields: Record<string, any> = {
      studentId: toField(studentId), classId: toField(classId || ''),
      feeRequestId: toField(feeRequestId), feeHead: toField(feeHead || 'Academic Fee'),
      amount: toField(amount), date: toField(now.split('T')[0]),
      method: toField('online'), transactionId: toField(razorpay_payment_id),
      orderId: toField(razorpay_order_id), receiptNumber: toField(receiptNumber),
      remarks: toField(`Online Payment${month ? ` - ${month}` : ''}`),
      verifiedAt: toField(now),
    };
    const paymentRes = await fetch(`${base}/feePayments`, {
      method: 'POST', headers: auth, body: JSON.stringify({ fields: paymentFields }),
    });
    if (!paymentRes.ok) {
      const err = await paymentRes.json();
      console.error('[verify-payment] feePayments write failed:', JSON.stringify(err));
      throw new Error('Failed to record payment');
    }
    const paymentData: any = await paymentRes.json();
    const paymentId = paymentData.name?.split('/').pop() ?? '';

    // Update feeRequest paid amount + status
    const newPaid = (Number(feeRequest.paidAmount) || 0) + amount;
    const total = Number(feeRequest.totalAmount) - (Number(feeRequest.waivedAmount) || 0);
    const newStatus = newPaid >= total ? 'paid' : 'partially_paid';

    await fetch(
      `${base}/feeRequests/${feeRequestId}?updateMask.fieldPaths=paidAmount&updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt`,
      { method: 'PATCH', headers: auth, body: JSON.stringify({ fields: {
        paidAmount: toField(newPaid), status: toField(newStatus), updatedAt: toField(now),
      }})}
    );

    if (newStatus === 'paid') {
      await fetch(
        `${base}/students/${studentId}?updateMask.fieldPaths=feeStatus&updateMask.fieldPaths=updatedAt`,
        { method: 'PATCH', headers: auth, body: JSON.stringify({ fields: {
          feeStatus: toField('paid'), updatedAt: toField(now),
        }})}
      );
    }

    return res.status(200).json({ success: true, receiptNumber, paymentId });
  } catch (err) {
    console.error('[verify-payment] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({
      error: 'Payment was verified but could not be recorded. Contact support.',
      transactionId: razorpay_payment_id,
    });
  }
}
