import { doc, runTransaction } from 'firebase/firestore';
import type { DocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/** Shared reference to the single receipt counter document. */
export const receiptCounterRef = () => doc(db, 'counters', 'receipts');

/** Format a raw counter number into a padded receipt string (e.g. "EHSREC0042"). */
export function formatReceiptNumber(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(4, '0')}`;
}

/**
 * Compute the next counter value from a snapshot of the counter doc.
 * The counter stores `lastNumber`, initialised to `startFrom - 1` on first use
 * so the very first receipt gets number `startFrom`.
 */
export function nextReceiptNumberFromSnap(
  snap: DocumentSnapshot,
  startFrom: number,
): number {
  const current: number = snap.exists()
    ? ((snap.data() as any)?.lastNumber ?? startFrom - 1)
    : startFrom - 1;
  return current + 1;
}

/**
 * Atomically increments the receipt counter and returns the next receipt number.
 * Use this for standalone reservations. To reserve a receipt as part of a larger
 * transaction (so the number is only consumed when that work commits), use
 * `receiptCounterRef` + `nextReceiptNumberFromSnap` + `formatReceiptNumber`
 * inside your own runTransaction instead.
 */
export async function getNextReceiptNumber(
  prefix: string,
  startFrom: number,
): Promise<string> {
  const ref = receiptCounterRef();
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const nextNum = nextReceiptNumberFromSnap(snap, startFrom);
    tx.set(ref, { lastNumber: nextNum }, { merge: true });
    return nextNum;
  });
  return formatReceiptNumber(prefix, next);
}
