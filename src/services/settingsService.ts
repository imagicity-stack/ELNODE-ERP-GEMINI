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
