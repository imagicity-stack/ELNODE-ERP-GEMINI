import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const FIRESTORE_DB_ID = process.env.FIRESTORE_DATABASE_ID ?? '(default)';

function getDb() {
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore(FIRESTORE_DB_ID);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    feeRequestId,
    studentId,
    classId,
    amount,       // in rupees (number)
    feeHead,
    month,
  } = req.body;

  // Validate required fields
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields' });
  }
  if (!feeRequestId || !studentId || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Missing or invalid payment metadata' });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return res.status(500).json({ error: 'Payment gateway not configured' });
  }

  // Verify Razorpay HMAC signature
  const expectedSig = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSig !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment signature verification failed' });
  }

  // Signature valid — write to Firestore via Admin SDK (client cannot tamper)
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const receiptNumber = `REC-${Date.now()}`;

    // Verify feeRequest exists and belongs to the student
    const feeRequestRef = db.collection('feeRequests').doc(feeRequestId);
    const feeRequestSnap = await feeRequestRef.get();

    if (!feeRequestSnap.exists) {
      return res.status(404).json({ error: 'Fee request not found' });
    }

    const feeRequest = feeRequestSnap.data()!;
    if (feeRequest.studentId !== studentId) {
      return res.status(403).json({ error: 'Fee request does not belong to this student' });
    }

    // Record payment
    const paymentRef = await db.collection('feePayments').add({
      studentId,
      classId: classId || '',
      feeRequestId,
      feeHead: feeHead || 'Academic Fee',
      amount,
      date: now.split('T')[0],
      method: 'online',
      transactionId: razorpay_payment_id,
      orderId: razorpay_order_id,
      receiptNumber,
      remarks: `Online Payment${month ? ` - ${month}` : ''}`,
      verifiedAt: now,
    });

    // Update feeRequest paid amount and status
    const newPaidAmount = (feeRequest.paidAmount || 0) + amount;
    const totalRequired = feeRequest.totalAmount - (feeRequest.waivedAmount || 0);
    const newStatus = newPaidAmount >= totalRequired ? 'paid' : 'partially_paid';

    await feeRequestRef.update({
      paidAmount: newPaidAmount,
      status: newStatus,
      updatedAt: now,
    });

    // Mark student fee status as paid if fully settled
    if (newStatus === 'paid') {
      await db.collection('students').doc(studentId).update({
        feeStatus: 'paid',
        updatedAt: now,
      });
    }

    return res.status(200).json({ success: true, receiptNumber, paymentId: paymentRef.id });
  } catch (err) {
    console.error('verify-payment Firestore error:', err);
    // Payment was verified but DB write failed — critical to surface this
    return res.status(500).json({
      error: 'Payment was verified but could not be recorded. Contact support.',
      transactionId: razorpay_payment_id,
    });
  }
}
