import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
