import { collection, addDoc, doc, updateDoc, query, orderBy, limit, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ActivityLog, ActivitySection, UserProfile } from '../types';

interface LocationInfo {
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  isp?: string;
}

let _locationCache: LocationInfo | null = null;
let _locationFetchPromise: Promise<LocationInfo | null> | null = null;

const getLocationInfo = (): Promise<LocationInfo | null> => {
  if (_locationCache) return Promise.resolve(_locationCache);
  if (_locationFetchPromise) return _locationFetchPromise;

  _locationFetchPromise = fetch('https://ipapi.co/json/', { cache: 'no-store' })
    .then(r => r.json())
    .then(d => {
      _locationCache = {
        ip: d.ip || 'unknown',
        city: d.city,
        region: d.region,
        country: d.country_name,
        isp: d.org,
      };
      return _locationCache;
    })
    .catch(() => null);

  return _locationFetchPromise;
};

// Pre-warm on module load (best-effort)
getLocationInfo().catch(() => {});

/**
 * Fire-and-forget enhancement: ask Gemini (server-side endpoint) to generate a richer
 * one-sentence description for this audit log, then patch it onto the log document.
 *
 * The endpoint receives ONLY this single event's metadata — it never sees data from
 * other portals or other users.
 */
const enhanceWithGemini = (
  logId: string,
  ctx: { userRole: string; userName: string; section: string; action: string; details: string; metadata?: any }
) => {
  // Fully detached — never block logActivity
  (async () => {
    try {
      const res = await fetch('/api/ai/describe-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ctx),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const description: string | undefined = data?.description?.trim();
      if (description && description.length > 0 && description.length < 500) {
        await updateDoc(doc(db, 'activityLogs', logId), { aiDescription: description });
      }
    } catch {
      // Silent: the basic log is already persisted
    }
  })();
};

export const logActivity = async (
  user: UserProfile | null,
  action: string,
  section: ActivitySection,
  details: string,
  metadata?: any
) => {
  if (!user) return;

  try {
    const loc = await getLocationInfo();

    const rawLog: Record<string, any> = {
      timestamp: serverTimestamp(),
      userId: user.uid,
      userName: user.name,
      userRole: user.role,
      action,
      section,
      details,
      userAgent: navigator.userAgent,
    };

    if (loc) {
      rawLog.ip = loc.ip;
      if (loc.city || loc.region || loc.country) {
        rawLog.location = [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
      }
      if (loc.isp) rawLog.isp = loc.isp;
    }

    if (metadata !== undefined) rawLog.metadata = metadata;

    const log = Object.fromEntries(Object.entries(rawLog).filter(([, v]) => v !== undefined));

    const ref = await addDoc(collection(db, 'activityLogs'), log);

    enhanceWithGemini(ref.id, {
      userRole: user.role,
      userName: user.name,
      section,
      action,
      details,
      metadata,
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
};

export const subscribeActivityLogs = (
  opts: {
    section?: ActivitySection;
    limitCount?: number;
    onData: (logs: ActivityLog[]) => void;
    onError?: (err: any) => void;
  }
) => {
  const logsRef = collection(db, 'activityLogs');
  const n = opts.limitCount ?? 500;

  const q = opts.section
    ? query(logsRef, where('section', '==', opts.section), orderBy('timestamp', 'desc'), limit(n))
    : query(logsRef, orderBy('timestamp', 'desc'), limit(n));

  return onSnapshot(
    q,
    snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog));
      opts.onData(docs);
    },
    err => {
      console.error('ActivityLogs subscription error:', err);
      opts.onError?.(err);
    }
  );
};
