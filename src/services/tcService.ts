/**
 * Transfer Certificate (TC) issuance & lifecycle.
 *
 * Issuing a TC atomically (a) allocates a sequential TC number, (b) writes an
 * immutable snapshot to transferCertificates/{studentId}, and (c) archives the
 * student out of the active directory (tcIssued / status: 'transferred').
 * Cancelling reverses it (re-admits the student).
 */

import { doc, runTransaction, writeBatch, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { Student, TransferCertificate, TCReason, UserProfile } from '../types';

export const TC_REASONS: TCReason[] = [
  "Parent's request", 'Relocation', 'Completed schooling', 'Financial reasons',
  'Transfer to another school', 'Medical reasons', 'Disciplinary', 'Other',
];

export const TC_CONDUCT = ['Excellent', 'Very Good', 'Good', 'Satisfactory', 'Needs Improvement'];

const TC_PREFIX = 'TC';

export interface IssueTCForm {
  dateOfBirth?: string;
  admissionDate?: string;
  lastAttendanceDate: string;
  issueDate: string;
  reason: TCReason;
  reasonDetail?: string;
  classLastStudied: string;
  qualifiedForPromotion: boolean;
  promotedTo?: string;
  conduct: string;
  duesCleared: boolean;
  academicYear: string;
  workingDays?: number;
  daysAttended?: number;
  remarks?: string;
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  Object.keys(obj).forEach(k => obj[k] === undefined && delete obj[k]);
  return obj;
}

/**
 * Issue a TC for a student. Atomic: allocates the TC number, writes the TC
 * record, archives the student, and bumps the counter in one transaction.
 * Throws if a TC has already been issued for this student.
 */
export async function issueTC(
  student: Student, className: string, form: IssueTCForm, user: UserProfile,
): Promise<TransferCertificate> {
  const tcRef = doc(db, 'transferCertificates', student.id);
  const studentRef = doc(db, 'students', student.id);
  const counterRef = doc(db, 'counters', 'tc');
  const now = new Date().toISOString();

  return runTransaction(db, async (tx) => {
    const [tcSnap, counterSnap] = await Promise.all([tx.get(tcRef), tx.get(counterRef)]);
    if (tcSnap.exists() && !(tcSnap.data() as any).cancelled) {
      throw new Error('A Transfer Certificate has already been issued for this student.');
    }
    const last = counterSnap.exists() ? Number(counterSnap.data().lastNumber || 0) : 0;
    const next = last + 1;
    const tcNumber = `${TC_PREFIX}${String(next).padStart(4, '0')}`;

    const record: TransferCertificate = stripUndefined({
      id: student.id,
      tcNumber,
      studentId: student.id,
      studentName: student.name,
      admissionNumber: student.admissionNumber,
      schoolNumber: student.schoolNumber,
      classId: student.classId,
      className,
      section: student.section || '',
      gender: student.gender || '',
      dateOfBirth: form.dateOfBirth || '',
      fatherName: student.parentDetails?.fatherName || '',
      motherName: student.parentDetails?.motherName || '',
      parentPhone: student.parentDetails?.phone || '',
      admissionDate: form.admissionDate || '',
      lastAttendanceDate: form.lastAttendanceDate,
      issueDate: form.issueDate,
      reason: form.reason,
      reasonDetail: form.reasonDetail || '',
      classLastStudied: form.classLastStudied,
      qualifiedForPromotion: form.qualifiedForPromotion,
      promotedTo: form.promotedTo || '',
      conduct: form.conduct,
      duesCleared: form.duesCleared,
      academicYear: form.academicYear,
      workingDays: form.workingDays,
      daysAttended: form.daysAttended,
      remarks: form.remarks || '',
      issuedBy: user.uid,
      issuedByName: user.name || user.email || 'Admin',
      createdAt: now,
      cancelled: false,
    });

    tx.set(tcRef, record);
    tx.set(studentRef, {
      tcIssued: true, tcNumber, tcIssuedAt: now, status: 'transferred', updatedAt: now,
    }, { merge: true });
    tx.set(counterRef, { lastNumber: next }, { merge: true });

    return record;
  });
}

/** Cancel a TC and re-admit the student into the active directory. */
export async function cancelTC(studentId: string, _user: UserProfile): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'transferCertificates', studentId));
  batch.set(doc(db, 'students', studentId), {
    tcIssued: false,
    status: 'active',
    tcNumber: deleteField(),
    tcIssuedAt: deleteField(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  await batch.commit();
}
