import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Lock, BadgeCheck, Building2, Hash, Mail, Phone } from 'lucide-react';
import { db } from '../../firebase';
import { UserProfile, CharteredAccountant } from '../../types';
import { ChangePasswordForm } from './passwordChange';

export default function CAProfile({ user }: { user: UserProfile }) {
  const [ca, setCa] = useState<CharteredAccountant | null>(null);
  const initials = (user.name || user.email || 'C')[0].toUpperCase();

  useEffect(() => {
    getDoc(doc(db, 'chartedAccountants', user.uid))
      .then(d => { if (d.exists()) setCa({ id: d.id, ...d.data() } as CharteredAccountant); })
      .catch(() => { /* metadata is optional */ });
  }, [user.uid]);

  const rows: { icon: any; label: string; value?: string }[] = [
    { icon: Mail, label: 'Email (login)', value: user.email },
    { icon: Phone, label: 'Phone', value: ca?.phone || user.phone },
    { icon: Building2, label: 'Firm', value: ca?.firmName },
    { icon: Hash, label: 'ICAI Membership No.', value: ca?.membershipNo },
  ].filter(r => r.value);

  return (
    <div className="pad stack" style={{ gap: 'var(--space-5)', maxWidth: 640 }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">Chartered Accountant</div>
          <h1>My Profile</h1>
        </div>
      </div>

      {/* Identity card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div className="avatar" style={{ width: 64, height: 64, fontSize: 26 }}>
          {user.photoURL ? <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover rounded-full" /> : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>{user.name || 'Chartered Accountant'}</div>
          <span className="chip solid" style={{ marginTop: 6, display: 'inline-flex', padding: '3px 10px', fontSize: 11 }}>
            <BadgeCheck size={12} /> CA Portal · Read-only
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="card stack">
        <div className="eyebrow">Account Details</div>
        {rows.map((r, i) => {
          const Icon = r.icon;
          return (
            <div key={i} className="row" style={{ padding: '12px 0', borderColor: 'var(--line-2)' }}>
              <Icon size={16} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
              <span className="tiny muted" style={{ flex: 1 }}>{r.label}</span>
              <span style={{ fontWeight: 600, fontSize: 13, textAlign: 'right' }}>{r.value}</span>
            </div>
          );
        })}
        <p className="tiny muted">Account details are maintained by the school administration. Contact them for changes.</p>
      </div>

      {/* Change password */}
      <div className="card stack">
        <div className="section-head" style={{ padding: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <Lock size={16} /> Change Password
          </span>
        </div>
        {user.mustChangePassword && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', color: '#92400e', fontSize: 13 }}>
            You're still using the default password. Please set a new one.
          </div>
        )}
        <ChangePasswordForm user={user} />
      </div>
    </div>
  );
}
