import { Capacitor } from '@capacitor/core';
import { doc, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { audienceTokensForUser } from './notificationCenterService';

export type PushPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

// ─── Audience token sync ────────────────────────────────────────────────────
// Stores the precomputed audience tokens on the user doc so the send-push API
// can query users by audience without composite indexes.
export async function syncAudienceTokens(user: UserProfile): Promise<void> {
  try {
    const tokens = audienceTokensForUser(user);
    await setDoc(
      doc(db, 'users', user.uid),
      { audienceTokens: tokens, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (e) {
    console.warn('Failed to sync audience tokens:', e);
  }
}

// ─── Permission helpers ─────────────────────────────────────────────────────
export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === 'granted') return 'granted';
    if (receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

export async function requestPushPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { receive } = await PushNotifications.requestPermissions();
    return receive === 'granted';
  } catch {
    return false;
  }
}

// ─── Registration ───────────────────────────────────────────────────────────
// Registers for FCM, saves the token, and sets up notification listeners.
// Safe to call multiple times — Capacitor deduplicates listener registration.
export async function registerForPush(user: UserProfile): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    PushNotifications.addListener('registration', async (token) => {
      try {
        await setDoc(
          doc(db, 'users', user.uid),
          { fcmTokens: arrayUnion(token.value) },
          { merge: true }
        );
      } catch (e) {
        console.warn('Failed to store FCM token:', e);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('FCM registration error:', err);
    });

    // Foreground: the in-app NotificationCenter already shows via Firestore
    // real-time listener — no duplicate toast needed.
    PushNotifications.addListener('pushNotificationReceived', (_n) => {});

    // Background/quit: store link for App to navigate after mount
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const link = action.notification.data?.link;
      if (link) {
        sessionStorage.setItem('push_nav_link', link);
        window.dispatchEvent(new CustomEvent('push_navigate', { detail: { link } }));
      }
    });

    await PushNotifications.register();
  } catch (e) {
    console.warn('Push registration failed:', e);
  }
}

export async function removeFcmToken(uid: string, token: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) });
  } catch {}
}
