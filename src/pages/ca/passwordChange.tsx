import { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, ShieldCheck, KeyRound } from 'lucide-react';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { DEFAULT_CA_PASSWORD, APP_LOGO } from '../../constants';
import { UserProfile } from '../../types';
import { logActivity } from '../../services/activityService';

/**
 * Self-service password change for a CA. Re-authenticates with the current
 * password, sets the new one, and clears the `mustChangePassword` flag so the
 * first-login gate doesn't reappear.
 */
export function ChangePasswordForm({
  user,
  onSuccess,
  prefillCurrent,
}: {
  user: UserProfile;
  onSuccess?: () => void;
  prefillCurrent?: string;
}) {
  const [current, setCurrent] = useState(prefillCurrent || '');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (next !== confirm) { setError('New passwords do not match'); return; }
    if (next.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (next === DEFAULT_CA_PASSWORD) { setError('Please choose a password different from the default'); return; }

    setLoading(true);
    try {
      const cu = auth.currentUser;
      if (!cu || !cu.email) { setError('Session expired — please sign in again.'); return; }
      const cred = EmailAuthProvider.credential(cu.email, current);
      await reauthenticateWithCredential(cu, cred);
      await updatePassword(cu, next);
      await updateDoc(doc(db, 'users', cu.uid), { mustChangePassword: false, updatedAt: new Date().toISOString() });
      try { await logActivity(user, 'Password Changed', 'Accounts', `${user.name} updated their CA portal password`); } catch { /* non-fatal */ }
      setSuccess('Password updated successfully.');
      setCurrent(''); setNext(''); setConfirm('');
      onSuccess?.();
    } catch (err: any) {
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') setError('Current password is incorrect.');
      else if (err?.code === 'auth/weak-password') setError('Password is too weak.');
      else setError('Could not change password. Please sign out and try again.');
    } finally {
      setLoading(false);
    }
  };

  const field = (
    label: string, value: string, set: (v: string) => void,
    show: boolean, toggle: () => void, placeholder: string,
  ) => (
    <div className="stack" style={{ gap: 6 }}>
      <label className="eyebrow">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'} value={value} onChange={e => set(e.target.value)}
          placeholder={placeholder} required
          style={{ width: '100%', padding: '11px 38px 11px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 14, color: 'var(--ink)' }}
        />
        <button type="button" onClick={toggle} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
      {field('Current Password', current, setCurrent, showCurrent, () => setShowCurrent(s => !s), '••••••••')}
      {field('New Password', next, setNext, showNext, () => setShowNext(s => !s), 'Min. 6 characters')}
      {field('Confirm New Password', confirm, setConfirm, showNext, () => setShowNext(s => !s), 'Repeat new password')}
      {error && <div style={{ color: 'var(--coral)', fontSize: 13 }}>{error}</div>}
      {success && <div style={{ color: 'var(--leaf)', fontSize: 13 }}>{success}</div>}
      <button type="submit" className="btn accent" disabled={loading}>
        {loading ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
        {loading ? 'Updating…' : 'Update Password'}
      </button>
    </form>
  );
}

/**
 * Full-screen gate shown on first login while the account still has the default
 * password. The CA cannot reach the portal until they set a new one.
 */
export function ForcePasswordChangeGate({ user, onDone }: { user: UserProfile; onDone: () => void }) {
  return (
    <div className="eh-app min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--cream)' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--ink)', display: 'grid', placeItems: 'center' }}>
            <img src={APP_LOGO} style={{ width: 26, height: 26, objectFit: 'contain' }} alt="" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h2 className="display" style={{ fontSize: 20 }}>Secure your account</h2>
            <p className="tiny muted" style={{ marginTop: 2 }}>Set a new password to continue</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: 'var(--cream-2)', marginBottom: 16 }}>
          <Lock size={15} style={{ color: 'var(--ink-3)', marginTop: 1, flexShrink: 0 }} />
          <p className="tiny" style={{ color: 'var(--ink-2)' }}>
            You're signed in with the default password. For your security, please choose a new one before accessing the CA portal.
          </p>
        </div>

        <ChangePasswordForm user={user} prefillCurrent={DEFAULT_CA_PASSWORD} onSuccess={onDone} />

        <p className="tiny muted" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <ShieldCheck size={12} style={{ color: 'var(--leaf)' }} /> Your password is encrypted and never visible to the school.
        </p>
      </div>
    </div>
  );
}
