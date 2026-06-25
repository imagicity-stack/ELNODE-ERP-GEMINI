import { auth } from '../firebase';

/**
 * Headers for calls to our own /api payment endpoints. Attaches the signed-in
 * user's Firebase ID token so the server can authenticate the caller. Falls back
 * to no Authorization header if (unexpectedly) signed out — the server will then
 * reject with 401.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch { /* leave unauthenticated — server rejects */ }
  return headers;
}
