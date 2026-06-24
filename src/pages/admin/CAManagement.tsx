import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
  UserPlus, ShieldCheck, Building2, Hash, Mail, Phone, Copy, Check,
  Ban, RotateCcw, Trash2, KeyRound, Eye, Calculator,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, CharteredAccountant } from '../../types';
import { DEFAULT_CA_PASSWORD } from '../../constants';
import { createCA, setCADisabled, revokeCA, CAInput } from '../../services/caService';
import { logActivity } from '../../services/activityService';
import { useToast } from '../../components/Toast';
import {
  Modal, ConfirmModal, FormField, Input, Textarea, Button, EmptyState,
} from '../../components/ui';

const EMPTY: CAInput = { name: '', email: '', phone: '', firmName: '', membershipNo: '', notes: '' };

export default function CAManagement({ user }: { user: UserProfile }) {
  const [cas, setCas] = useState<CharteredAccountant[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CAInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<CharteredAccountant | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { showToast } = useToast();

  const isSuperAdmin = user.role === 'super_admin';

  useEffect(() => {
    const q = query(collection(db, 'chartedAccountants'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setCas(snap.docs.map(d => ({ id: d.id, ...d.data() } as CharteredAccountant)));
      setLoading(false);
    }, err => {
      handleFirestoreError(err, OperationType.LIST, 'chartedAccountants');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const set = (k: keyof CAInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const openAdd = () => { setForm(EMPTY); setFormError(null); setCreated(null); setModalOpen(true); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await createCA(form, user.uid);
      await logActivity(user, 'CA Account Created', 'Super Admin',
        `Provisioned CA portal access for ${form.name} (${form.email.trim().toLowerCase()})`);
      setCreated({ email: form.email.trim().toLowerCase() });
      showToast('CA portal account created', 'success');
    } catch (err: any) {
      setFormError(err?.message || 'Could not create the CA account');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (ca: CharteredAccountant) => {
    setBusyId(ca.id);
    try {
      const disable = ca.status !== 'disabled';
      await setCADisabled(ca.id, disable);
      await logActivity(user, disable ? 'CA Access Suspended' : 'CA Access Restored', 'Super Admin',
        `${disable ? 'Suspended' : 'Restored'} CA portal access for ${ca.name}`);
      showToast(disable ? 'Access suspended' : 'Access restored', 'success');
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async () => {
    if (!confirmRevoke) return;
    setRevoking(true);
    try {
      await revokeCA(confirmRevoke.id);
      await logActivity(user, 'CA Access Revoked', 'Super Admin',
        `Revoked CA portal access for ${confirmRevoke.name} (${confirmRevoke.email})`);
      showToast('CA access revoked', 'success');
      setConfirmRevoke(null);
    } catch {
      showToast('Failed to revoke access', 'error');
    } finally {
      setRevoking(false);
    }
  };

  const copyCreds = (email: string) => {
    navigator.clipboard?.writeText(`Portal: ${window.location.origin}/login\nEmail: ${email}\nPassword: ${DEFAULT_CA_PASSWORD}`)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => showToast('Copy failed', 'error'));
  };

  return (
    <div className="pad stack" style={{ gap: 20, maxWidth: 920 }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{user.role.replace('_', ' ')} · System</div>
          <h1>CA Portal Access</h1>
        </div>
        {isSuperAdmin && (
          <button className="btn accent" onClick={openAdd} style={{ width: 'auto' }}>
            <UserPlus size={15} /> Add CA
          </button>
        )}
      </div>

      {/* Explainer */}
      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--cream-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Calculator size={20} style={{ color: 'var(--ink)' }} />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <p style={{ fontWeight: 700, fontSize: 14 }}>Dedicated, read-only access for your Chartered Accountant</p>
          <p className="tiny muted">
            A CA gets their own portal — financial dashboards, books of accounts, analytics and downloadable
            statements — with <b>view-only</b> access and <b>no edit rights</b>. CAs are managed here, separately
            from staff, teachers and students.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <span className="chip" style={{ cursor: 'default' }}><Eye size={12} /> View &amp; download only</span>
            <span className="chip" style={{ cursor: 'default' }}><KeyRound size={12} /> Default password: <b className="mono">{DEFAULT_CA_PASSWORD}</b></span>
            <span className="chip" style={{ cursor: 'default' }}><ShieldCheck size={12} /> Forced password change on first login</span>
          </div>
        </div>
      </div>

      {/* Roster */}
      {loading ? (
        <div className="card" style={{ height: 120, background: 'var(--cream-2)' }} />
      ) : cas.length === 0 ? (
        <div className="card">
          <EmptyState icon={Calculator} title="No CA accounts yet"
            description="Add your Chartered Accountant to give them secure, read-only access to the school's books." />
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {cas.map(ca => {
            const disabled = ca.status === 'disabled';
            return (
              <div key={ca.id} className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', opacity: disabled ? 0.7 : 1 }}>
                <div className="avatar" style={{ width: 44, height: 44, fontSize: 18 }}>{(ca.name || 'C')[0].toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{ca.name}</span>
                    <span className="chip" style={{ padding: '2px 8px', fontSize: 10, cursor: 'default', background: disabled ? 'var(--cream-2)' : 'rgba(16,185,129,0.12)', color: disabled ? 'var(--ink-3)' : 'var(--leaf)', borderColor: 'transparent' }}>
                      {disabled ? 'Suspended' : 'Active'}
                    </span>
                  </div>
                  <div className="stack" style={{ gap: 3, marginTop: 6 }}>
                    <span className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Mail size={12} /> {ca.email}</span>
                    {ca.phone && <span className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Phone size={12} /> {ca.phone}</span>}
                    {ca.firmName && <span className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Building2 size={12} /> {ca.firmName}</span>}
                    {ca.membershipNo && <span className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Hash size={12} /> ICAI {ca.membershipNo}</span>}
                  </div>
                </div>
                {isSuperAdmin && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="chip" onClick={() => copyCreds(ca.email)} title="Copy login details">
                      <Copy size={12} /> Credentials
                    </button>
                    <button className="chip" onClick={() => handleToggle(ca)} disabled={busyId === ca.id}
                      title={disabled ? 'Restore access' : 'Suspend access'}>
                      {disabled ? <RotateCcw size={12} /> : <Ban size={12} />}
                      {disabled ? 'Restore' : 'Suspend'}
                    </button>
                    <button className="chip" onClick={() => setConfirmRevoke(ca)} title="Revoke access"
                      style={{ color: 'var(--coral)', borderColor: 'rgba(239,68,68,0.3)' }}>
                      <Trash2 size={12} /> Revoke
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / success modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
        title={created ? 'CA account ready' : 'Add Chartered Accountant'}
        subtitle={created ? 'Share these credentials with your CA' : 'Provision dedicated read-only portal access'}
        size="md"
      >
        {created ? (
          <div className="stack" style={{ gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(16,185,129,0.1)' }}>
              <Check size={18} style={{ color: 'var(--leaf)' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>Account created successfully.</span>
            </div>
            <div className="card" style={{ background: 'var(--cream)', display: 'grid', gap: 8 }}>
              <CredRow label="Portal URL" value={`${window.location.origin}/login`} />
              <CredRow label="Email" value={created.email} />
              <CredRow label="Temporary Password" value={DEFAULT_CA_PASSWORD} mono />
            </div>
            <p className="tiny muted">
              The CA signs in from the <b>Staff / CA</b> tab and will be required to change this password on first login.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={() => copyCreds(created.email)} className="flex-1">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy credentials'}
              </Button>
              <Button onClick={() => setModalOpen(false)} className="flex-1">Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="stack" style={{ gap: 14 }}>
            <div className="form-grid">
              <FormField label="Full Name" required>
                <Input value={form.name} onChange={set('name')} placeholder="CA Ramesh Kumar" required />
              </FormField>
              <FormField label="Email" required>
                <Input type="email" value={form.email} onChange={set('email')} placeholder="ramesh@firm.com" required />
              </FormField>
              <FormField label="Phone">
                <Input value={form.phone} onChange={set('phone')} placeholder="10-digit mobile" />
              </FormField>
              <FormField label="Firm Name">
                <Input value={form.firmName} onChange={set('firmName')} placeholder="Kumar & Associates" />
              </FormField>
              <FormField label="ICAI Membership No.">
                <Input value={form.membershipNo} onChange={set('membershipNo')} placeholder="e.g. 123456" />
              </FormField>
            </div>
            <FormField label="Notes">
              <Textarea value={form.notes} onChange={set('notes')} placeholder="Optional internal note" rows={2} />
            </FormField>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'var(--cream-2)' }}>
              <KeyRound size={14} style={{ color: 'var(--ink-3)' }} />
              <span className="tiny muted">A login is created with default password <b className="mono">{DEFAULT_CA_PASSWORD}</b>.</span>
            </div>
            {formError && <div style={{ color: 'var(--coral)', fontSize: 13 }}>{formError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" loading={saving}>Create CA Account</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!confirmRevoke}
        onClose={() => setConfirmRevoke(null)}
        onConfirm={handleRevoke}
        title="Revoke CA access?"
        message={`This removes portal access for ${confirmRevoke?.name || 'this CA'}. They will no longer be able to sign in. You can re-add them later with the same email.`}
        confirmLabel="Revoke"
        loading={revoking}
      />
    </div>
  );
}

function CredRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span className="tiny muted">{label}</span>
      <span className={mono ? 'mono' : ''} style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
