import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Download, TrendingUp, TrendingDown, Scale, Loader2, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { UserProfile } from '../../types';
import { useFinancials, PERIOD_OPTIONS, PeriodKey, getDateRange, inr } from './financialData';
import { computeSummary, incomeByHead, expenseByCategory, monthlyTrend, buildLedger, FinancialArrays } from './compute';
import { downloadIncomeExpenditurePdf } from './exporters';
import { Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { cn } from '../../lib/utils';

export default function CADashboard({ user }: { user: UserProfile }) {
  const data = useFinancials();
  const [period, setPeriod] = useState<PeriodKey>('this_fy');
  const [exporting, setExporting] = useState(false);
  const { showToast } = useToast();

  const range = useMemo(() => getDateRange(period), [period]);
  const fa: FinancialArrays = data;
  const summary = useMemo(() => computeSummary(fa, range), [fa, range]);
  const trend = useMemo(() => monthlyTrend(fa, range), [fa, range]);
  const heads = useMemo(() => incomeByHead(fa, range).slice(0, 6), [fa, range]);
  const cats = useMemo(() => expenseByCategory(fa, range).slice(0, 6), [fa, range]);
  const recent = useMemo(() => buildLedger(fa, range).slice(-8).reverse(), [fa, range]);

  if (data.loading) return <Spinner />;

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadIncomeExpenditurePdf(fa, range);
      showToast('Income & Expenditure statement downloaded', 'success');
    } catch {
      showToast('Failed to generate statement', 'error');
    } finally {
      setExporting(false);
    }
  };

  const greeting = user.name ? `Welcome, ${user.name.split(' ')[0]}` : 'Welcome';
  const maxHead = Math.max(1, ...heads.map(h => h.amount));
  const maxCat = Math.max(1, ...cats.map(c => c.amount));

  return (
    <div className="pad stack" style={{ gap: 'var(--space-5)' }}>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="eyebrow">{greeting} · {range.label}</div>
          <h1>Financial Overview</h1>
        </div>
        <button className="btn ghost" onClick={handleExport} disabled={exporting} style={{ width: 'auto' }}>
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          <span className="hidden sm:inline">Income &amp; Expenditure</span>
        </button>
      </div>

      {/* Period chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PERIOD_OPTIONS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)} className={cn('chip', period === p.key ? 'solid' : '')}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Receipts" value={inr(summary.receipts)} tone="leaf" icon={<ArrowDownRight size={16} />} sub="Cash in" />
        <KpiCard label="Total Payments" value={inr(summary.payments)} tone="coral" icon={<ArrowUpRight size={16} />} sub="Cash out" />
        <KpiCard
          label={summary.net >= 0 ? 'Surplus' : 'Deficit'}
          value={inr(Math.abs(summary.net))}
          tone={summary.net >= 0 ? 'leaf' : 'coral'}
          icon={<Scale size={16} />}
          sub={summary.net >= 0 ? 'Receipts exceed payments' : 'Payments exceed receipts'}
        />
        <KpiCard label="Collection Rate" value={`${summary.collectionRate.toFixed(1)}%`} tone="accent" icon={<TrendingUp size={16} />} sub={`${inr(summary.outstanding)} outstanding`} />
      </div>

      {/* Secondary stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat label="Fee Income" value={inr(summary.feeIncome)} />
        <MiniStat label="Advance Fees" value={inr(summary.advanceIncome)} />
        <MiniStat label="Salaries Paid" value={inr(summary.salaryTotal)} />
        <MiniStat label="Fee Defaulters" value={String(summary.defaulters)} />
      </div>

      {/* Trend chart — desktop */}
      <div className="hidden lg:block">
        <div className="card stack">
          <div className="eyebrow">Receipts vs Payments — Monthly</div>
          {trend.length === 0 ? (
            <p className="muted tiny">No transactions in this period.</p>
          ) : (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="caRecv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--leaf)" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="var(--leaf)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="caPay" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--coral)" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="var(--coral)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--ink)' }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--ink)' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--paper)', borderRadius: 10, border: '1px solid var(--line)' }}
                    formatter={(v: any, n: any) => [inr(v), n === 'receipts' ? 'Receipts' : 'Payments']}
                  />
                  <Area type="monotone" dataKey="receipts" stroke="var(--leaf)" strokeWidth={2.5} fill="url(#caRecv)" />
                  <Area type="monotone" dataKey="payments" stroke="var(--coral)" strokeWidth={2.5} fill="url(#caPay)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Income & expense breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card stack">
          <div className="eyebrow">Income by Head</div>
          {heads.length === 0 ? <p className="muted tiny">No income recorded.</p> : heads.map(h => (
            <BreakdownRow key={h.name} label={h.name} value={h.amount} pct={(h.amount / maxHead) * 100} color="var(--leaf)" />
          ))}
        </div>
        <div className="card stack">
          <div className="eyebrow">Expense by Category</div>
          {cats.length === 0 ? <p className="muted tiny">No expenses recorded.</p> : cats.map(c => (
            <BreakdownRow key={c.name} label={c.name} value={c.amount} pct={(c.amount / maxCat) * 100} color="var(--coral)" />
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      <div>
        <div className="section-head"><h2>Recent Transactions</h2></div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {recent.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }} className="muted tiny">No transactions in this period.</div>
          ) : recent.map((e, i) => (
            <div key={i} className="row" style={{ alignItems: 'center' }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0,
                background: e.credit ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)',
                color: e.credit ? 'var(--leaf)' : 'var(--coral)',
              }}>
                {e.credit ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.particulars}</div>
                <div className="mono tiny muted">{e.date} · {e.ref}</div>
              </div>
              <div style={{ fontWeight: 700, color: e.credit ? 'var(--leaf)' : 'var(--coral)', fontSize: 14 }}>
                {e.credit ? '+' : '−'}{inr(e.credit || e.debit)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone: 'leaf' | 'coral' | 'accent'; icon: React.ReactNode }) {
  const color = tone === 'leaf' ? 'var(--leaf)' : tone === 'coral' ? 'var(--coral)' : 'var(--ink)';
  return (
    <div className="card stack" style={{ gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="eyebrow">{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <span className="t-num" style={{ fontSize: 24, color }}>{value}</span>
      {sub && <span className="tiny muted">{sub}</span>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stack" style={{ gap: 2 }}>
      <span className="eyebrow">{label}</span>
      <span className="t-num" style={{ fontSize: 18 }}>{value}</span>
    </div>
  );
}

function BreakdownRow({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{label}</span>
        <span className="tiny" style={{ color }}>{inr(value)}</span>
      </div>
      <div style={{ height: 6, background: 'var(--line)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 9999, transition: 'width .4s ease' }} />
      </div>
    </div>
  );
}
