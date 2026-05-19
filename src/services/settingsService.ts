import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface SchoolSettings {
  academicYear: string;     // e.g. "2026-27"
  schoolName?: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  receiptPrefix?: string;      // Prefix for receipt numbers (e.g. "EHSREC")
  receiptStartNumber?: number; // Counter starts from this number (e.g. 1)
  // Day of the FOLLOWING month that fee requests default to. e.g. 10 → request
  // generated in May defaults to due date June 10. Range: 1-28. Default: 10.
  defaultFeeDueDay?: number;
  updatedAt?: string;
  updatedBy?: string;
}

const REF = () => doc(db, 'settings', 'global');

export async function getSchoolSettings(): Promise<SchoolSettings> {
  const snap = await getDoc(REF());
  if (snap.exists()) return snap.data() as SchoolSettings;
  return { academicYear: '2026-27' };
}

export async function saveSchoolSettings(data: SchoolSettings): Promise<void> {
  await setDoc(REF(), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
}

/** Returns the default fee request due date as a YYYY-MM-DD string,
 *  computed from `defaultFeeDueDay` (day of the FOLLOWING month).
 *  Falls back to the 10th if no setting or invalid value. */
export function computeDefaultFeeDueDate(dueDay?: number, base: Date = new Date()): string {
  const day = Number.isFinite(dueDay) && dueDay! >= 1 && dueDay! <= 28 ? Math.floor(dueDay!) : 10;
  const d = new Date(base.getFullYear(), base.getMonth() + 1, day);
  return d.toISOString().split('T')[0];
}
