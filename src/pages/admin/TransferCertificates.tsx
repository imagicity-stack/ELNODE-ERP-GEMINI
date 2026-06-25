import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  FileText, Download, Search, Trash2, RotateCcw, Users, Clock, AlertTriangle, Calendar,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, TransferCertificate } from '../../types';
import { useToast } from '../../components/Toast';
import { Modal, ConfirmModal } from '../../components/ui';
import { downloadTC } from '../../lib/tcCertificate';
import { cancelTC } from '../../services/tcService';
import { logActivity } from '../../services/activityService';
import { cn } from '../../lib/utils';

const PIE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#ec4899', '#64748b'];
const fmtDate = (d?: string) => d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function fyOf(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return '—';
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String(y + 1).slice(2)}`;
}

export default function TransferCertificates({ user }: { user: UserProfile }) {
  const { showToast } = useToast();
  const [tcs, setTcs] = useState<TransferCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [detail, setDetail] = useState<TransferCertificate | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<TransferCertificate | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'transferCertificates'), snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as TransferCertificate)).filter(t => !t.cancelled);
      rows.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
      setTcs(rows);
      setLoading(false);
    }, err => { handleFirestoreError(err, OperationType.LIST, 'transferCertificates'); setLoading(false); });
    return () => unsub();
  }, []);

  // ── Analytics ──
  const thisFY = useMemo(() => fyOf(new Date().toISOString()), []);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const stats = useMemo(() => ({
    total: tcs.length,
    thisFY: tcs.filter(t => fyOf(t.issueDate) === thisFY).length,
    thisMonth: tcs.filter(t => (t.issueDate || '').slice(0, 7) === thisMonth).length,
    duesPending: tcs.filter(t => !t.duesCleared).length,
  }), [tcs, thisFY, thisMonth]);

  const avgTenureYears = useMemo(() => {
    const spans = tcs
      .filter(t => t.admissionDate && t.issueDate)
      .map(t => (new Date(t.issueDate).getTime() - new Date(t.admissionDate!).getTime()) / (365.25 * 86400000))
      .filter(n => n >= 0 && n < 30);
    if (!spans.length) return null;
    return (spans.reduce((s, n) => s + n, 0) / spans.length);
  }, [tcs]);

  const byReason = useMemo(() => {
    const m: Record<string, number> = {};
    tcs.forEach(t => { const r = t.reason || 'Other'; m[r] = (m[r] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [tcs]);

  const byClass = useMemo(() => {
    const m: Record<string, number> = {};
    tcs.forEach(t => { const c = t.className || '—'; m[c] = (m[c] || 0) + 1; });
    return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [tcs]);

  const trend = useMemo(() => {
    const m: Record<string, number> = {};
    tcs.forEach(t => { const k = (t.issueDate || '').slice(0, 7); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).sort().slice(-12).map(k => {
      const [y, mo] = k.split('-');
      return { name: new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), count: m[k] };
    });
  }, [tcs]);

  const reasons = useMemo(() => ['all', ...Array.from(new Set(tcs.map(t => t.reason)))], [tcs]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tcs.filter(t =>
      (reasonFilter === 'all' || t.reason === reasonFilter) &&
      (!q || t.studentName.toLowerCase().includes(q) || (t.admissionNumber || '').toLowerCase().includes(q) || (t.tcNumber || '').toLowerCase().includes(q)),
    );
  }, [tcs, search, reasonFilter]);

  const handleCancel = async () => {
    if (!confirmCancel) return;
    setBusy(true);
    try {
      await cancelTC(confirmCancel.studentId, user);
      await logActivity(user, 'Transfer Certificate Cancelled', 'Super Admin',
        `Cancelled ${confirmCancel.tcNumber} for ${confirmCancel.studentName} — student re-admitted`);
      showToast(`${confirmCancel.studentName} re-admitted; ${confirmCancel.tcNumber} cancelled`, 'success');
      setConfirmCancel(null);
    } catch {
      showToast('Could not cancel the TC', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pad stack" style={{ gap: 18 }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{user.role.replace('_', ' ')} · People</div>
          <h1>Transfer Certificates</h1>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total Issued" value={String(stats.total)} icon={<FileText size={15} />} />
        <Kpi label={`This FY (${thisFY})`} value={String(stats.thisFY)} icon={<Calendar size={15} />} />
        <Kpi label="This Month" value={String(stats.thisMonth)} icon={<Calendar size={15} />} color="var(--leaf)" />
        <Kpi label="Dues Pending at Exit" value={String(stats.duesPending)} icon={<AlertTriangle size={15} />} color={stats.duesPending ? 'var(--coral)' : 'var(--ink)'} />
      </div>

      {avgTenureYears != null && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={16} style={{ color: 'var(--ink-3)' }} />
          <span className="tiny muted">Average tenure at school (admission → leaving):</span>
          <span className="t-num" style={{ fontSize: 16 }}>{avgTenureYears.toFixed(1)} yrs</span>
        </div>
      )}

      {/* Charts */}
      {tcs.length > 0 && (
        <>
          <div className="hidden lg:block card stack">
            <div className="eyebrow">TCs Issued — Monthly</div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 6, right: 8, bottom: 0, left: -22 }}>
                  <defs><linearGradient id="tcG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--ink)' }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--ink)' }} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)' }} />
                  <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5} fill="url(#tcG)" name="TCs" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="card stack">
              <div className="eyebrow">By Reason</div>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byReason} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={2}>
                      {byReason.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card stack">
              <div className="eyebrow">By Class</div>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byClass} margin={{ top: 6, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--ink)' }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--ink)' }} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)' }} />
                    <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} name="TCs" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {reasons.map(r => (
          <button key={r} onClick={() => setReasonFilter(r)} className={cn('chip', reasonFilter === r ? 'solid' : '')}>{r === 'all' ? 'All reasons' : r}</button>
        ))}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, admission no, TC no…"
            style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 13, color: 'var(--ink)' }} />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="card" style={{ height: 120, background: 'var(--cream-2)' }} />
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <Users size={28} style={{ color: 'var(--ink-4)', marginBottom: 8 }} />
          <div style={{ fontWeight: 700 }}>{tcs.length === 0 ? 'No certificates issued yet' : 'No matches'}</div>
          <div className="tiny muted">Issue a TC from a student's row in the Students directory.</div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {filtered.map(t => (
            <div key={t.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--cream-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <FileText size={18} style={{ color: 'var(--ink)' }} />
              </div>
              <button onClick={() => setDetail(t)} style={{ flex: 1, minWidth: 180, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.studentName}</div>
                <div className="tiny muted">
                  <span className="mono">{t.tcNumber}</span> · {t.admissionNumber} · {t.className}{t.section ? ` · ${t.section}` : ''} · {fmtDate(t.issueDate)}
                </div>
              </button>
              <span className="chip" style={{ cursor: 'default', padding: '2px 8px', fontSize: 11 }}>{t.reason}</span>
              {!t.duesCleared && <span className="chip" style={{ cursor: 'default', padding: '2px 8px', fontSize: 11, background: 'rgba(239,68,68,0.1)', color: 'var(--coral)', borderColor: 'transparent' }}>Dues pending</span>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="chip" onClick={() => downloadTC(t)} title="Download TC"><Download size={12} /> PDF</button>
                <button className="chip" onClick={() => setConfirmCancel(t)} title="Cancel TC / Re-admit" style={{ color: 'var(--coral)', borderColor: 'rgba(239,68,68,0.3)' }}><RotateCcw size={12} /> Re-admit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail ? `TC ${detail.tcNumber}` : ''} subtitle={detail?.studentName} size="lg"
        footer={detail ? (
          <div className="flex justify-between gap-3">
            <button className="btn ghost" style={{ width: 'auto', color: 'var(--coral)' }} onClick={() => { const d = detail; setDetail(null); setConfirmCancel(d); }}><Trash2 size={14} /> Cancel / Re-admit</button>
            <button className="btn accent" style={{ width: 'auto' }} onClick={() => detail && downloadTC(detail)}><Download size={14} /> Download PDF</button>
          </div>
        ) : undefined}
      >
        {detail && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {[
              ['Admission No.', detail.admissionNumber], ['School No.', detail.schoolNumber],
              ['Class', `${detail.className}${detail.section ? ` · ${detail.section}` : ''}`], ['Date of Birth', fmtDate(detail.dateOfBirth)],
              ["Father's Name", detail.fatherName], ["Mother's Name", detail.motherName],
              ['Date of Admission', fmtDate(detail.admissionDate)], ['Date of Leaving', fmtDate(detail.lastAttendanceDate)],
              ['Academic Year', detail.academicYear], ['Reason', detail.reason === 'Other' ? detail.reasonDetail : detail.reason],
              ['Qualified for Promotion', detail.qualifiedForPromotion ? `Yes${detail.promotedTo ? ` → ${detail.promotedTo}` : ''}` : 'No'],
              ['Conduct', detail.conduct], ['Dues Cleared', detail.duesCleared ? 'Yes' : 'No'],
              ['Issued By', detail.issuedByName], ['Issued On', fmtDate(detail.issueDate)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3 py-1 border-b border-slate-50">
                <span className="text-slate-400">{k}</span>
                <span className="font-semibold text-slate-700 text-right">{(v as string) || '—'}</span>
              </div>
            ))}
            {detail.remarks && <div className="sm:col-span-2 text-slate-600 pt-1"><span className="text-slate-400">Remarks: </span>{detail.remarks}</div>}
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={handleCancel}
        title="Cancel TC & re-admit student?"
        message={`This cancels ${confirmCancel?.tcNumber} and returns ${confirmCancel?.studentName} to the active student directory.`}
        confirmLabel="Re-admit"
        loading={busy}
      />
    </div>
  );
}

function Kpi({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="card stack" style={{ gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="eyebrow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ color: color || 'var(--ink-3)' }}>{icon}</span>
      </div>
      <span className="t-num" style={{ fontSize: 24, color: color || 'var(--ink)' }}>{value}</span>
    </div>
  );
}
