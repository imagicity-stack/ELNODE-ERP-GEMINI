import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Student, ExtendedStudentProfile } from '../types';

/**
 * The school's operational records (fee WhatsApp confirmations, receipts,
 * follow-ups, contact lists) read `students/{id}.parentDetails` — NOT the
 * extended `studentProfiles` doc that the self-service profile editors write to.
 *
 * So when a parent/student (or admin) edits contact details in the extended
 * profile, mirror the canonical contact fields back onto the student record so
 * the "actual" profile the school uses stays in sync. Empty profile fields fall
 * back to the existing value (never wiped).
 */

type ParentDetails = NonNullable<Student['parentDetails']>;

const firstNonEmpty = (...vals: (string | undefined)[]): string => {
  for (const v of vals) {
    const s = (v ?? '').toString().trim();
    if (s) return s;
  }
  return '';
};

export function deriveParentDetails(
  existing: Partial<ParentDetails> | undefined,
  profile: Partial<ExtendedStudentProfile>,
): ParentDetails {
  const ex = existing || {};
  return {
    fatherName: firstNonEmpty(profile.father?.name, ex.fatherName),
    motherName: firstNonEmpty(profile.mother?.name, ex.motherName),
    phone: firstNonEmpty(profile.father?.phone, profile.mother?.phone, profile.guardian?.phone, ex.phone),
    email: firstNonEmpty(profile.father?.email, profile.mother?.email, ex.email),
  };
}

/**
 * Sync the canonical `students/{id}.parentDetails` from the extended profile a
 * parent/student/admin just saved. No-ops if nothing changed. Non-fatal: a
 * failure here never blocks the (already successful) profile save.
 */
export async function syncStudentContactFromProfile(
  student: Pick<Student, 'id' | 'parentDetails'> | null | undefined,
  profile: Partial<ExtendedStudentProfile>,
): Promise<void> {
  if (!student?.id) return;
  const ex = student.parentDetails || ({} as Partial<ParentDetails>);
  const next = deriveParentDetails(ex, profile);
  if (ex.fatherName === next.fatherName && ex.motherName === next.motherName
    && ex.phone === next.phone && ex.email === next.email) return;
  try {
    await updateDoc(doc(db, 'students', student.id), { parentDetails: next, updatedAt: new Date().toISOString() });
  } catch { /* non-fatal — the studentProfiles save already succeeded */ }
}
