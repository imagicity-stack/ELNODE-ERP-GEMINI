import { useMemo, useState } from 'react';
import { Download, FileText, Search, Loader2, ArrowDownUp } from 'lucide-react';
import { UserProfile } from '../../types';
import { useFinancials, PERIOD_OPTIONS, PeriodKey, getDateRange, inr } from './financialData';
import { buildLedger, LedgerType, FinancialArrays } from './compute';
import { downloadLedgerPdf, exportCsv } from './exporters';
import { Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { cn } from '../../lib/utils';

const TYPE_FILTERS: { key: 'all' | LedgerType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fee', label: 'Fees' },
  { key: 'advance', label: 'Advances' },
  { key: 'expense', label: 'Expenses' },
  { key: 'salary', label: 'Salaries' },
];

export default function CALedger({ user: _user }: { user: UserProfile }) {
  const data = useFinancials();
  const fa: FinancialArrays = data;
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [typeFilter, setTypeFilter] = useState<'all' | LedgerType>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const { showToast } = useToast();

  const range = useMemo(() => getDateRange(period), [period]);
  const allEntries = useMemo(() => buildLedger(fa, range), [fa, range]);

  // Running balance is computed across the full period set first, then filtered
  // for display so the visible balance column always reflects true cash position.
  const withBalance = useMemo(() => {
    let bal = 0;
    return allEntries.map(e => { bal += e.credit - e.debit; return { ...e, balance: bal }; });
  }, [allEntries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withBalance.filter(e =>
      (typeFilter === 'all' || e.type === typeFilter) &&
      (!q || e.particulars.toLowerCase().includes(q) || e.ref.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
    ).reverse(); // newest first for display
  }, [withBalance, typeFilter, search]);

  const totals = useMemo(() => ({
    credit: filtered.reduce((s, e) => s + e.credit, 0),
    debit: filtered.reduce((s, e) => s + e.debit, 0),
  }), [filtered]);

  if (data.loading) return <Spinner />;

  const handlePdf = async () => {
    setBusy('pdf');
    try {
      const subset = typeFilter === 'all' ? allEntries : allEntries.filter(e => e.type === typeFilter);
      await downloadLedgerPdf(subset, range);
      showToast('Day book downloaded', 'success');
    } catch { showToast('Failed to export PDF', 'error'); } finally { setBusy(null); }
  };

  const handleCsv = async () => {
    setBusy('csv');
    try {
      const rows = filtered.slice().reverse().map(e => ({
        Date: e.date, Particulars: e.particulars, Category: e.category, Ref: e.ref,
        Mode: e.method, Receipt: e.credit || '', Payment: e.debit || '', Balance: e.balance,
      }));
      await exportCsv(rows, `day_book_${range.from}_${range.to}.csv`);
      showToast('Day book CSV downloaded', 'success');
    } catch { showToast('Failed to export CSV', 'error'); } finally { setBusy(null); }
  };

  return (
    <div className="pad stack" style={{ gap: 'var(--space-5)' }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{range.label} · {filtered.length} entries</div>
          <h1>Day Book</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={handleCsv} disabled={!!busy} style={{ width: 'auto' }}>
            {busy === 'csv' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button className="btn ghost" onClick={handlePdf} disabled={!!busy} style={{ width: 'auto' }}>
            {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>

      {/* Period + type filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PERIOD_OPTIONS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)} className={cn('chip', period === p.key ? 'solid' : '')}>{p.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {TYPE_FILTERS.map(t => (
          <button key={t.key} onClick={() => setTypeFilter(t.key)} className={cn('chip', typeFilter === t.key ? 'accent' : '')}>{t.label}</button>
        ))}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search particulars, ref, category…"
            style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 13, color: 'var(--ink)' }}
          />
        </div>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Receipts</span><span className="t-num" style={{ fontSize: 18, color: 'var(--leaf)' }}>{inr(totals.credit)}</span></div>
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Payments</span><span className="t-num" style={{ fontSize: 18, color: 'var(--coral)' }}>{inr(totals.debit)}</span></div>
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Net</span><span className="t-num" style={{ fontSize: 18 }}>{inr(totals.credit - totals.debit)}</span></div>
      </div>

      {/* Ledger table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--cream-2)' }}>
                {['Date', 'Particulars', 'Ref', 'Mode', 'Receipt', 'Payment', 'Balance'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: i >= 4 ? 'right' : 'left', fontWeight: 600, color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--ink-3)' }}>
                  <ArrowDownUp size={20} style={{ opacity: 0.4, marginBottom: 6 }} /><div>No transactions match your filters.</div>
                </td></tr>
              ) : filtered.map((e, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <td className="mono" style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{e.date}</td>
                  <td style={{ padding: '9px 14px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.particulars}</td>
                  <td className="mono tiny" style={{ padding: '9px 14px', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{e.ref}</td>
                  <td className="tiny" style={{ padding: '9px 14px', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{e.method || '—'}</td>
                  <td className="t-num" style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--leaf)', whiteSpace: 'nowrap' }}>{e.credit ? inr(e.credit) : '—'}</td>
                  <td className="t-num" style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--coral)', whiteSpace: 'nowrap' }}>{e.debit ? inr(e.debit) : '—'}</td>
                  <td className="t-num" style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{inr(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="tiny muted" style={{ paddingBottom: 8 }}>
        Cash-basis day book. Balance is cumulative across the selected period (oldest first); rows are shown newest first.
      </p>
    </div>
  );
}
