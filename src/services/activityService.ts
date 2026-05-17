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

// Module-level cache. Geolocation is best-effort; we NEVER block log writes on it.
let _locationCache: LocationInfo | null = null;

const fetchLocationOnce = () => {
  // Race against a 3-second timeout so a slow/blocked ipapi.co never stalls anything.
  const fetchPromise = fetch('https://ipapi.co/json/', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (!d) return;
      _locationCache = {
        ip: d.ip || 'unknown',
        city: d.city,
        region: d.region,
        country: d.country_name,
        isp: d.org,
      };
    })
    .catch(() => {});

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  Promise.race([fetchPromise, timeout]).catch(() => {});
};

// Kick off geolocation immediately, but never await it from logActivity.
fetchLocationOnce();

/**
 * Fire-and-forget Gemini enhancement. Patches `aiDescription` onto the log doc.
 * Receives ONLY this single event's metadata — no cross-portal data leakage.
 */
const enhanceWithGemini = (
  logId: string,
  ctx: { userRole: string; userName: string; section: string; action: string; details: string; metadata?: any }
) => {
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
      // Silent — basic log already persisted
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
    // Synchronous read — never await geolocation. First few logs may lack IP data;
    // subsequent logs (after the cache populates) will have it.
    const loc = _locationCache;

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
