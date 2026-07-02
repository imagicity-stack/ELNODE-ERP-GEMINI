import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Guards against leaking raw Firestore document ids into the UI.
 *
 * Several collections (homework, timetable, teacher.classes/subjects, …) store
 * raw document ids. Rendering those directly shows meaningless 20-character
 * strings ("0DL7Ees93OJ2AoedPnid") in portals, PDFs and notifications.
 *
 * React components should resolve ids through DataContext's `classesMap` /
 * `subjectsMap` (live snapshots, available to every signed-in role) with
 * `nameFrom(...)`. Non-React code (e.g. notification text) can use the
 * one-shot cached `getNameMaps()`.
 */

// Firestore auto-ids are exactly 20 chars of [A-Za-z0-9].
const FIRESTORE_ID_RE = /^[A-Za-z0-9]{20}$/;

/** True if a value looks like a raw Firestore auto-id. */
export function looksLikeDocId(value: unknown): boolean {
  return typeof value === 'string' && FIRESTORE_ID_RE.test(value);
}

/**
 * Show a stored value unless it looks like a raw document id, in which case
 * show `fallback`. Legacy records that stored real names (e.g. "Nursery")
 * pass through untouched.
 */
export function maskDocId(value: string | undefined | null, fallback = '—'): string {
  if (!value) return fallback;
  return looksLikeDocId(value) ? fallback : value;
}

/** Resolve an id from an id→name map; masks unresolvable raw ids. */
export function nameFrom(
  map: Record<string, string> | undefined | null,
  id: string | undefined | null,
  fallback = '—',
): string {
  if (!id) return fallback;
  return map?.[id] || maskDocId(id, fallback);
}

export interface NameMaps {
  classNames: Record<string, string>;
  subjectNames: Record<string, string>;
}

let _mapsPromise: Promise<NameMaps> | null = null;

/** One-shot (session-cached) id→name maps for code outside React components. */
export function getNameMaps(): Promise<NameMaps> {
  if (!_mapsPromise) {
    _mapsPromise = (async () => {
      const [clsSnap, subSnap] = await Promise.all([
        getDocs(collection(db, 'classes')),
        getDocs(collection(db, 'subjects')),
      ]);
      const classNames: Record<string, string> = {};
      const subjectNames: Record<string, string> = {};
      clsSnap.docs.forEach(d => { const n = (d.data() as any).name; if (n) classNames[d.id] = n; });
      subSnap.docs.forEach(d => { const n = (d.data() as any).name; if (n) subjectNames[d.id] = n; });
      return { classNames, subjectNames };
    })().catch(err => {
      _mapsPromise = null; // allow retry on a later call
      throw err;
    });
  }
  return _mapsPromise;
}
