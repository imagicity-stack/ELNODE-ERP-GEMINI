import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendWatiTemplate } from '../_wati';

function getDb() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
    initializeApp({ credential: cert(serviceAccount) });
  }
  const dbId = process.env.FIRESTORE_DATABASE_ID ?? 'ai-studio-cb22793f-2766-4225-bb0a-411c4a36f1b5';
  return getFirestore(dbId);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    razorpay_order_id, razorpay_payment_id, razorpay_signature,
    feeRequestId, studentId, classId, amount, feeHead, month,
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields' });
  if (!feeRequestId || !studentId || typeof amount !== 'number' || amount <= 0)
    return res.status(400).json({ error: 'Missing or invalid payment metadata' });

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return res.status(500).json({ error: 'Payment gateway not configured' });

  if (!process.env.FIREBASE_SERVICE_ACCOUNT)
    return res.status(500).json({ error: 'Firebase not configured' });

  const expectedSig = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (expected !== razorpay_signature)
    return res.status(400).json({ error: 'Payment signature verification failed' });

  try {
    const db = getDb();
    const now = new Date().toISOString();
    const receiptNumber = `REC-${Date.now()}`;

    const feeRequestRef = db.collection('feeRequests').doc(feeRequestId);
    const feeRequestSnap = await feeRequestRef.get();
    if (!feeRequestSnap.exists) return res.status(404).json({ error: 'Fee request not found' });

    const feeRequest = feeRequestSnap.data()!;
    if (feeRequest.studentId !== studentId)
      return res.status(403).json({ error: 'Fee request does not belong to this student' });

    const paymentRef = await db.collection('feePayments').add({
      studentId, classId: classId || '', feeRequestId,
      feeHead: feeHead || 'Academic Fee', amount,
      date: now.split('T')[0], method: 'online',
      transactionId: razorpay_payment_id, orderId: razorpay_order_id,
      receiptNumber,
      remarks: `Online Payment${month ? ` - ${month}` : ''}`,
      verifiedAt: now,
    });

    const newPaidAmount = (feeRequest.paidAmount || 0) + amount;
    const totalRequired = feeRequest.totalAmount - (feeRequest.waivedAmount || 0);
    const newStatus = newPaidAmount >= totalRequired ? 'paid' : 'partially_paid';

    await feeRequestRef.update({ paidAmount: newPaidAmount, status: newStatus, updatedAt: now });

    if (newStatus === 'paid') {
      await db.collection('students').doc(studentId).update({ feeStatus: 'paid', updatedAt: now });
    }

    // ── Auto WhatsApp: payment_confirmed (fire-and-forget, non-fatal) ──────────
    try {
      const studentSnap = await db.collection('students').doc(studentId).get();
      if (studentSnap.exists) {
        const student = studentSnap.data()!;
        const phone = student.parentDetails?.phone;
        if (phone) {
          let classSection = student.classId || '';
          try {
            const classSnap = await db.collection('classes').doc(student.classId).get();
            if (classSnap.exists) {
              classSection = `${classSnap.data()!.name} - ${student.section || ''}`.trim();
            }
          } catch { /* class fetch is best-effort */ }

          await sendWatiTemplate(phone, 'payment_confirmed', [
            student.parentDetails?.fatherName || 'Parent',
            `₹${amount.toLocaleString('en-IN')}`,
            student.name,
            classSection,
            receiptNumber,
            now.split('T')[0],
            'Online',
          ]);
        }
      }
    } catch (waErr) {
      console.error('[verify-payment] WhatsApp send failed (non-fatal):', waErr);
    }

    return res.status(200).json({ success: true, receiptNumber, paymentId: paymentRef.id });
  } catch (err) {
    console.error('verify-payment Firestore error:', err);
    return res.status(500).json({
      error: 'Payment was verified but could not be recorded. Contact support.',
      transactionId: razorpay_payment_id,
    });
  }
}
