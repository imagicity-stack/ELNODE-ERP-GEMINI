import { useMemo, useState } from 'react';
import { Download, FileText, Search, Loader2 } from 'lucide-react';
import { UserProfile } from '../../types';
import { useFinancials, PERIOD_OPTIONS, PeriodKey, getDateRange, monthInRange, inr } from './financialData';
import { FinancialArrays } from './compute';
import { downloadPayrollPdf, exportCsv } from './exporters';
import { Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { cn } from '../../lib/utils';
import { fmtMonthYear } from '../../lib/utils';

const STATUS_FILTERS = ['all', 'paid', 'partially_paid', 'pending'];

export default function CAPayroll({ user: _user }: { user: UserProfile }) {
  const data = useFinancials();
  const fa: FinancialArrays = data;
  const [period, setPeriod] = useState<PeriodKey>('this_fy');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const { showToast } = useToast();

  const range = useMemo(() => getDateRange(period), [period]);
  const inPeriod = useMemo(() =>
    fa.salaries.filter(s => monthInRange(s.month, range)).sort((a, b) => (b.month || '').localeCompare(a.month || '')),
    [fa, range]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inPeriod.filter(s =>
      (status === 'all' || s.status === status) &&
      (!q || (s.employeeName || '').toLowerCase().includes(q) || (s.employeeRole || '').toLowerCase().includes(q))
    );
  }, [inPeriod, status, search]);

  const totals = useMemo(() => ({
    net: filtered.reduce((s, e) => s + (e.netAmount || 0), 0),
    paid: filtered.reduce((s, e) => s + (e.paidAmount || 0), 0),
    balance: filtered.reduce((s, e) => s + (e.balanceAmount || 0), 0),
  }), [filtered]);

  if (data.loading) return <Spinner />;

  const handlePdf = async () => {
    setBusy('pdf');
    try { await downloadPayrollPdf(fa, range); showToast('Payroll register downloaded', 'success'); }
    catch { showToast('Failed to export PDF', 'error'); } finally { setBusy(null); }
  };
  const handleCsv = async () => {
    setBusy('csv');
    try {
      await exportCsv(filtered.map(s => ({
        Month: s.month, Employee: s.employeeName, Role: s.employeeRole,
        Base: s.baseAmount || 0, Allowances: s.allowances || 0,
        Deductions: (s.deductions?.pf || 0) + (s.deductions?.tax || 0) + (s.deductions?.leaveDeduction || 0) + (s.deductions?.other || 0),
        Net: s.netAmount || 0, Paid: s.paidAmount || 0, Balance: s.balanceAmount || 0, Status: s.status,
      })), `payroll_${range.from}_${range.to}.csv`);
      showToast('Payroll CSV downloaded', 'success');
    } catch { showToast('Failed to export CSV', 'error'); } finally { setBusy(null); }
  };

  return (
    <div className="pad stack" style={{ gap: 'var(--space-5)' }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{range.label} · {filtered.length} records</div>
          <h1>Payroll</h1>
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

      <div className="grid grid-cols-3 gap-3">
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Net Payable</span><span className="t-num" style={{ fontSize: 18 }}>{inr(totals.net)}</span></div>
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Disbursed</span><span className="t-num" style={{ fontSize: 18, color: 'var(--leaf)' }}>{inr(totals.paid)}</span></div>
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Balance</span><span className="t-num" style={{ fontSize: 18, color: 'var(--coral)' }}>{inr(totals.balance)}</span></div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {STATUS_FILTERS.map(s => (
          <button key={s} onClick={() => setStatus(s)} className={cn('chip', status === s ? 'accent' : '')} style={{ textTransform: 'capitalize' }}>{s.replace('_', ' ')}</button>
        ))}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee, role…"
            style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 13, color: 'var(--ink)' }} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 680 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--cream-2)' }}>
                {['Month', 'Employee', 'Role', 'Net Pay', 'Paid', 'Status'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: i === 3 || i === 4 ? 'right' : 'left', fontWeight: 600, color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--ink-3)' }}>No payroll records for this period.</td></tr>
              ) : filtered.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <td className="mono tiny" style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{fmtMonthYear(s.month)}</td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.employeeName}</td>
                  <td className="tiny" style={{ padding: '9px 14px', textTransform: 'capitalize', color: 'var(--ink-3)' }}>{s.employeeRole}</td>
                  <td className="t-num" style={{ padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(s.netAmount || 0)}</td>
                  <td className="t-num" style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--leaf)', whiteSpace: 'nowrap' }}>{inr(s.paidAmount || 0)}</td>
                  <td style={{ padding: '9px 14px' }}>
                    <span className="chip" style={{ padding: '2px 8px', fontSize: 10, textTransform: 'capitalize', background: s.status === 'paid' ? 'rgba(16,185,129,0.12)' : 'var(--cream-2)', color: s.status === 'paid' ? 'var(--leaf)' : 'var(--ink-3)', borderColor: 'transparent' }}>{(s.status || '').replace('_', ' ')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
