import { collection, addDoc, getDocs, query, orderBy, limit, where, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ActivityLog, ActivitySection, UserProfile } from '../types';

export const logActivity = async (
  user: UserProfile | null,
  action: string,
  section: ActivitySection,
  details: string,
  metadata?: any
) => {
  if (!user) return;

  try {
    const rawLog: any = {
      timestamp: serverTimestamp(),
      userId: user.uid,
      userName: user.name,
      userRole: user.role,
      action,
      section,
      details,
      userAgent: navigator.userAgent,
      ...(metadata !== undefined ? { metadata } : {}),
    };

    // Strip undefined values so Firestore addDoc never receives them
    const log = JSON.parse(JSON.stringify(rawLog));

    await addDoc(collection(db, 'activityLogs'), log);
  } catch (err) {
    console.error('Failed to log activity:', err);
    // Silent fail for logging to avoid breaking main UX
  }
};

export const getActivityLogs = async (section?: ActivitySection, limitCount: number = 100) => {
  try {
    const logsRef = collection(db, 'activityLogs');
    let q;
    if (section) {
      q = query(
        logsRef,
        where('section', '==', section),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
    } else {
      q = query(logsRef, orderBy('timestamp', 'desc'), limit(limitCount));
    }

    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as ActivityLog));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'activityLogs');
    return [];
  }
};
