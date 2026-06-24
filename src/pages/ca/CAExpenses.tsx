import { useMemo, useState } from 'react';
import { Download, FileText, Search, Loader2 } from 'lucide-react';
import { UserProfile } from '../../types';
import { useFinancials, PERIOD_OPTIONS, PeriodKey, getDateRange, inRange, inr } from './financialData';
import { expenseByCategory, FinancialArrays } from './compute';
import { downloadExpensePdf, exportCsv } from './exporters';
import { Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { cn } from '../../lib/utils';

export default function CAExpenses({ user: _user }: { user: UserProfile }) {
  const data = useFinancials();
  const fa: FinancialArrays = data;
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const { showToast } = useToast();

  const range = useMemo(() => getDateRange(period), [period]);
  const inPeriod = useMemo(() =>
    fa.expenses.filter(e => inRange(e.date, range)).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [fa, range]);

  const categories = useMemo(() => ['all', ...Array.from(new Set(inPeriod.map(e => e.category))).sort()], [inPeriod]);
  const catBreakdown = useMemo(() => expenseByCategory(fa, range), [fa, range]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inPeriod.filter(e =>
      (category === 'all' || e.category === category) &&
      (!q || (e.biller || '').toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q))
    );
  }, [inPeriod, category, search]);

  const total = filtered.reduce((s, e) => s + (e.amount || 0), 0);
  const paid = filtered.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount || 0), 0);
  const pending = total - paid;

  if (data.loading) return <Spinner />;

  const handlePdf = async () => {
    setBusy('pdf');
    try { await downloadExpensePdf(fa, range); showToast('Expense statement downloaded', 'success'); }
    catch { showToast('Failed to export PDF', 'error'); } finally { setBusy(null); }
  };
  const handleCsv = async () => {
    setBusy('csv');
    try {
      await exportCsv(filtered.map(e => ({ Date: e.date, Category: e.category, Biller: e.biller || '', Description: e.description || '', Status: e.status, Mode: e.paymentMode || '', Amount: e.amount || 0 })), `expenses_${range.from}_${range.to}.csv`);
      showToast('Expenses CSV downloaded', 'success');
    } catch { showToast('Failed to export CSV', 'error'); } finally { setBusy(null); }
  };

  return (
    <div className="pad stack" style={{ gap: 'var(--space-5)' }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{range.label} · {filtered.length} entries</div>
          <h1>Expenses</h1>
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

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Total</span><span className="t-num" style={{ fontSize: 18, color: 'var(--coral)' }}>{inr(total)}</span></div>
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Paid</span><span className="t-num" style={{ fontSize: 18 }}>{inr(paid)}</span></div>
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Pending</span><span className="t-num" style={{ fontSize: 18, color: 'var(--ink-3)' }}>{inr(pending)}</span></div>
      </div>

      {/* Category breakdown */}
      {catBreakdown.length > 0 && (
        <div className="card stack">
          <span className="eyebrow">By Category</span>
          {catBreakdown.slice(0, 8).map(c => {
            const max = Math.max(1, ...catBreakdown.map(x => x.amount));
            return (
              <div key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                  <span className="tiny" style={{ color: 'var(--coral)' }}>{inr(c.amount)}</span>
                </div>
                <div style={{ height: 6, background: 'var(--line)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(c.amount / max) * 100}%`, background: 'var(--coral)', borderRadius: 9999 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {categories.map(c => (
          <button key={c} onClick={() => setCategory(c)} className={cn('chip', category === c ? 'accent' : '')} style={{ textTransform: 'capitalize' }}>{c}</button>
        ))}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search biller, description…"
            style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 13, color: 'var(--ink)' }} />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--cream-2)' }}>
                {['Date', 'Category', 'Biller', 'Status', 'Mode', 'Amount'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: i === 5 ? 'right' : 'left', fontWeight: 600, color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--ink-3)' }}>No expenses for this period.</td></tr>
              ) : filtered.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <td className="mono" style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{e.date}</td>
                  <td style={{ padding: '9px 14px', textTransform: 'capitalize' }}>{e.category}</td>
                  <td style={{ padding: '9px 14px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.biller || '—'}</td>
                  <td style={{ padding: '9px 14px' }}>
                    <span className="chip" style={{ padding: '2px 8px', fontSize: 10, background: e.status === 'paid' ? 'rgba(16,185,129,0.12)' : 'var(--cream-2)', color: e.status === 'paid' ? 'var(--leaf)' : 'var(--ink-3)', borderColor: 'transparent', textTransform: 'capitalize' }}>{e.status}</span>
                  </td>
                  <td className="tiny" style={{ padding: '9px 14px', textTransform: 'capitalize', color: 'var(--ink-3)' }}>{(e.paymentMode || '—').replace(/_/g, ' ')}</td>
                  <td className="t-num" style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--coral)', whiteSpace: 'nowrap' }}>{inr(e.amount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
