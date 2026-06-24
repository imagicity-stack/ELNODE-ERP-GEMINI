import { useMemo, useState } from 'react';
import { Download, FileText, Search, Loader2 } from 'lucide-react';
import { UserProfile } from '../../types';
import { useFinancials, PERIOD_OPTIONS, PeriodKey, getDateRange, inRange, inr } from './financialData';
import { realPayments, FinancialArrays } from './compute';
import { downloadFeeCollectionPdf, exportCsv } from './exporters';
import { Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { cn } from '../../lib/utils';

interface Receipt {
  date: string; receipt: string; name: string; head: string; method: string; amount: number; kind: 'Fee' | 'Advance';
}

export default function CAIncome({ user: _user }: { user: UserProfile }) {
  const data = useFinancials();
  const fa: FinancialArrays = data;
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const { showToast } = useToast();

  const range = useMemo(() => getDateRange(period), [period]);

  const receipts: Receipt[] = useMemo(() => {
    const fees = realPayments(fa.payments).filter(p => inRange(p.date, range)).map(p => ({
      date: p.date, receipt: p.receiptNumber || '—',
      name: fa.studentsMap[p.studentId]?.name || p.studentId,
      head: p.feeHead || 'Tuition Fees',
      method: (p.method || '').replace(/_/g, ' '),
      amount: p.amount || 0, kind: 'Fee' as const,
    }));
    const adv = fa.advances.filter(a => inRange(a.date, range)).map(a => ({
      date: a.date, receipt: a.receiptNumber || '—',
      name: fa.studentsMap[a.studentId]?.name || a.studentId,
      head: 'Advance Fees',
      method: (a.paymentMethod || '').replace(/_/g, ' '),
      amount: a.totalAmount || 0, kind: 'Advance' as const,
    }));
    return [...fees, ...adv].sort((x, y) => y.date.localeCompare(x.date));
  }, [fa, range]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter(r => !q || r.name.toLowerCase().includes(q) || r.receipt.toLowerCase().includes(q) || r.head.toLowerCase().includes(q));
  }, [receipts, search]);

  const byMethod = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach(r => { const k = r.method.toUpperCase() || 'OTHER'; m[k] = (m[k] || 0) + r.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const total = filtered.reduce((s, r) => s + r.amount, 0);

  if (data.loading) return <Spinner />;

  const handlePdf = async () => {
    setBusy('pdf');
    try { await downloadFeeCollectionPdf(fa, range); showToast('Fee collection register downloaded', 'success'); }
    catch { showToast('Failed to export PDF', 'error'); } finally { setBusy(null); }
  };
  const handleCsv = async () => {
    setBusy('csv');
    try {
      await exportCsv(filtered.map(r => ({ Date: r.date, Receipt: r.receipt, Student: r.name, Head: r.head, Type: r.kind, Mode: r.method, Amount: r.amount })), `income_register_${range.from}_${range.to}.csv`);
      showToast('Income CSV downloaded', 'success');
    } catch { showToast('Failed to export CSV', 'error'); } finally { setBusy(null); }
  };

  return (
    <div className="pad stack" style={{ gap: 'var(--space-5)' }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{range.label} · {filtered.length} receipts</div>
          <h1>Income &amp; Receipts</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={handleCsv} disabled={!!busy} style={{ width: 'auto' }}>
            {busy === 'csv' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}<span className="hidden sm:inline">CSV</span>
          </button>
          <button className="btn ghost" onClick={handlePdf} disabled={!!busy} style={{ width: 'auto' }}>
            {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}<span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PERIOD_OPTIONS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)} className={cn('chip', period === p.key ? 'solid' : '')}>{p.label}</button>
        ))}
      </div>

      {/* Total + method breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="card stack" style={{ gap: 4 }}>
          <span className="eyebrow">Total Collected</span>
          <span className="t-num" style={{ fontSize: 26, color: 'var(--leaf)' }}>{inr(total)}</span>
          <span className="tiny muted">{filtered.length} receipts in {range.label}</span>
        </div>
        <div className="card stack lg:col-span-2" style={{ gap: 8 }}>
          <span className="eyebrow">By Payment Mode</span>
          {byMethod.length === 0 ? <p className="muted tiny">No receipts.</p> : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {byMethod.map(([m, amt]) => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="tiny" style={{ color: 'var(--ink-3)' }}>{m}</span>
                  <span className="t-num" style={{ fontSize: 14 }}>{inr(amt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student, receipt no, head…"
          style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 13, color: 'var(--ink)' }} />
      </div>

      {/* Register table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--cream-2)' }}>
                {['Date', 'Receipt', 'Student', 'Head', 'Mode', 'Amount'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: i === 5 ? 'right' : 'left', fontWeight: 600, color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--ink-3)' }}>No receipts for this period.</td></tr>
              ) : filtered.slice(0, 400).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <td className="mono" style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td className="mono tiny" style={{ padding: '9px 14px', color: 'var(--ink-3)' }}>{r.receipt}</td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</td>
                  <td style={{ padding: '9px 14px' }}>
                    {r.head}
                    {r.kind === 'Advance' && <span className="chip" style={{ marginLeft: 6, padding: '2px 8px', fontSize: 10 }}>Advance</span>}
                  </td>
                  <td className="tiny" style={{ padding: '9px 14px', textTransform: 'capitalize', color: 'var(--ink-3)' }}>{r.method}</td>
                  <td className="t-num" style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--leaf)', whiteSpace: 'nowrap' }}>{inr(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length > 400 && <p className="tiny muted">Showing first 400 rows on screen — export to PDF/CSV for the complete register.</p>}
    </div>
  );
}
