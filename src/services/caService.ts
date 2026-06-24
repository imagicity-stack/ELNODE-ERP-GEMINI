/**
 * Service for provisioning and managing Chartered Accountant (CA) portal accounts.
 *
 * CAs are deliberately kept OUT of the staff/teacher pipeline. A CA record is a
 * pair of documents:
 *   • users/{uid}              — role 'ca', drives login routing + Firestore rules
 *   • chartedAccountants/{uid} — firm / membership metadata + status, used to render
 *                                the roster in Super Admin → CA Portal Access.
 *
 * Auth provisioning reuses the proven "Secondary app" pattern so the admin's own
 * session is never disturbed, and is idempotent if the email already exists with
 * the default password.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { initializeApp, getApp, deleteApp } from 'firebase/app';
import { db, firebaseConfig } from '../firebase';
import { DEFAULT_CA_PASSWORD } from '../constants';
import { CharteredAccountant, UserProfile } from '../types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

export interface CAInput {
  name: string;
  email: string;
  phone?: string;
  firmName?: string;
  membershipNo?: string;
  notes?: string;
}

export function validateCAInput(input: CAInput): string | null {
  const name = input.name?.trim() ?? '';
  if (name.length < 2) return 'Name must be at least 2 characters';
  if (name.length > 80) return 'Name must be under 80 characters';

  const email = input.email?.trim().toLowerCase() ?? '';
  if (!EMAIL_REGEX.test(email)) return 'Enter a valid email address';
  if (email.length > 200) return 'Email is too long';

  if (input.phone) {
    const phone = input.phone.replace(/\D/g, '');
    if (phone && !PHONE_REGEX.test(phone)) return 'Phone must be a 10-digit number';
  }
  return null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Throws if `email` already belongs to a different users document. */
export async function ensureUniqueEmail(email: string, excludeUid?: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const snap = await getDocs(
    query(collection(db, 'users'), where('email', '==', normalized)),
  );
  const conflict = snap.docs.find(d => d.id !== excludeUid);
  if (conflict) {
    throw new Error(`The email ${normalized} is already registered to another account.`);
  }
}

/**
 * Create a Firebase Auth account for `email` with `defaultPassword` using a
 * throwaway "Secondary" app so the current admin session is untouched. Idempotent:
 * if the email already exists with the default password, the existing uid is
 * returned; if it exists with a different password, an explanatory error is thrown.
 */
async function provisionAuthAccount(email: string, defaultPassword: string): Promise<string> {
  const normalized = normalizeEmail(email);
  const SECONDARY_NAME = 'Secondary';
  let secondaryApp;
  try {
    secondaryApp = getApp(SECONDARY_NAME);
  } catch {
    secondaryApp = initializeApp(firebaseConfig, SECONDARY_NAME);
  }
  const secondaryAuth = getAuth(secondaryApp);

  try {
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, normalized, defaultPassword);
      return cred.user.uid;
    } catch (err: any) {
      if (err?.code !== 'auth/email-already-in-use') throw err;
      try {
        const cred = await signInWithEmailAndPassword(secondaryAuth, normalized, defaultPassword);
        return cred.user.uid;
      } catch (signInErr: any) {
        if (signInErr?.code === 'auth/invalid-credential' || signInErr?.code === 'auth/wrong-password') {
          throw new Error(
            `The email ${normalized} is already in use with a different password. ` +
            `Use a different email, or have the existing account removed first.`,
          );
        }
        throw signInErr;
      }
    }
  } finally {
    try { await signOut(secondaryAuth); } catch { /* ignore */ }
    try { await deleteApp(secondaryApp); } catch { /* ignore */ }
  }
}

/**
 * Provision a brand-new CA portal account. Writes both the users/{uid} role doc
 * (with mustChangePassword = true) and the chartedAccountants/{uid} metadata doc.
 * Returns the new uid.
 */
export async function createCA(input: CAInput, createdByUid: string): Promise<string> {
  const validationError = validateCAInput(input);
  if (validationError) throw new Error(validationError);

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const phone = input.phone?.replace(/\D/g, '') || '';

  await ensureUniqueEmail(email);

  const uid = await provisionAuthAccount(email, DEFAULT_CA_PASSWORD);
  const now = new Date().toISOString();

  const userProfile: UserProfile = {
    uid,
    email,
    name,
    role: 'ca',
    phone,
    mustChangePassword: true,
    disabled: false,
    createdAt: now,
  };
  await setDoc(doc(db, 'users', uid), userProfile, { merge: true });

  const caRecord: CharteredAccountant = {
    id: uid,
    uid,
    name,
    email,
    phone: phone || undefined,
    firmName: input.firmName?.trim() || undefined,
    membershipNo: input.membershipNo?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    status: 'active',
    createdAt: now,
    createdBy: createdByUid,
  };
  // Strip undefined keys — Firestore rejects undefined values.
  const cleaned = Object.fromEntries(
    Object.entries(caRecord).filter(([, v]) => v !== undefined),
  ) as unknown as CharteredAccountant;
  await setDoc(doc(db, 'chartedAccountants', uid), cleaned);

  return uid;
}

/** Update editable metadata on an existing CA (does not touch auth). */
export async function updateCA(uid: string, patch: Partial<CAInput>): Promise<void> {
  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.phone !== undefined) updates.phone = patch.phone.replace(/\D/g, '');
  if (patch.firmName !== undefined) updates.firmName = patch.firmName.trim();
  if (patch.membershipNo !== undefined) updates.membershipNo = patch.membershipNo.trim();
  if (patch.notes !== undefined) updates.notes = patch.notes.trim();

  await updateDoc(doc(db, 'chartedAccountants', uid), updates);
  // Keep the login profile's name/phone in sync.
  const userUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) userUpdates.name = patch.name.trim();
  if (patch.phone !== undefined) userUpdates.phone = patch.phone.replace(/\D/g, '');
  await setDoc(doc(db, 'users', uid), userUpdates, { merge: true });
}

/** Suspend or restore CA portal access without deleting the account. */
export async function setCADisabled(uid: string, disabled: boolean): Promise<void> {
  await setDoc(doc(db, 'users', uid), { disabled, updatedAt: serverTimestamp() }, { merge: true });
  await updateDoc(doc(db, 'chartedAccountants', uid), {
    status: disabled ? 'disabled' : 'active',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Revoke a CA entirely: removes the role profile (which blocks login) and the
 * metadata record. The underlying Firebase Auth user cannot be deleted from the
 * client; re-adding the same email later is idempotent and reuses it.
 */
export async function revokeCA(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid));
  await deleteDoc(doc(db, 'chartedAccountants', uid));
}
