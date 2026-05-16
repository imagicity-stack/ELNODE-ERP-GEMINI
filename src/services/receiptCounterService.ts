import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

const COUNTER_REF = () => doc(db, 'counters', 'receipts');

/**
 * Atomically increments the receipt counter and returns the next receipt number.
 * The counter document stores `lastNumber`; it is initialised to `startFrom - 1`
 * on first use so that the very first receipt gets number `startFrom`.
 */
export async function getNextReceiptNumber(
  prefix: string,
  startFrom: number,
): Promise<string> {
  const ref = COUNTER_REF();
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current: number = snap.exists()
      ? (snap.data().lastNumber ?? startFrom - 1)
      : startFrom - 1;
    const nextNum = current + 1;
    tx.set(ref, { lastNumber: nextNum }, { merge: true });
    return nextNum;
  });
  return `${prefix}${String(next).padStart(4, '0')}`;
}
