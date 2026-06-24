import { useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { UserProfile } from '../../types';
import { useFinancials, PERIOD_OPTIONS, PeriodKey, getDateRange, inr } from './financialData';
import {
  computeSummary, incomeByHead, expenseByCategory, monthlyTrend, outstandingDues, FinancialArrays,
} from './compute';
import { useData } from '../../contexts/DataContext';
import { Spinner } from '../../components/ui';
import { cn } from '../../lib/utils';

const PIE_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#ec4899', '#64748b'];

export default function CAAnalytics({ user: _user }: { user: UserProfile }) {
  const data = useFinancials();
  const fa: FinancialArrays = data;
  const { classes } = useData();
  const [period, setPeriod] = useState<PeriodKey>('this_fy');

  const range = useMemo(() => getDateRange(period), [period]);
  const classNameById = useMemo(() => {
    const m: Record<string, string> = {};
    classes.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [classes]);

  const summary = useMemo(() => computeSummary(fa, range), [fa, range]);
  const trend = useMemo(() => monthlyTrend(fa, range), [fa, range]);
  const heads = useMemo(() => incomeByHead(fa, range), [fa, range]);
  const cats = useMemo(() => expenseByCategory(fa, range), [fa, range]);
  const debtors = useMemo(() => outstandingDues(fa, classNameById).slice(0, 10), [fa, classNameById]);

  // Class-wise collected vs outstanding
  const classData = useMemo(() => {
    const map: Record<string, { collected: number; pending: number }> = {};
    fa.payments.filter(p => !p.advancePaymentId).forEach(p => {
      const name = classNameById[p.classId] || 'Unknown';
      if (!map[name]) map[name] = { collected: 0, pending: 0 };
      map[name].collected += p.amount || 0;
    });
    fa.requests.forEach(r => {
      if (r.status !== 'paid') {
        const name = classNameById[r.classId] || 'Unknown';
        if (!map[name]) map[name] = { collected: 0, pending: 0 };
        map[name].pending += (r.totalAmount || 0) - (r.waivedAmount || 0) - (r.paidAmount || 0);
      }
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.collected - a.collected).slice(0, 8);
  }, [fa, classNameById]);

  if (data.loading) return <Spinner />;

  return (
    <div className="pad stack" style={{ gap: 'var(--space-5)' }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{range.label}</div>
          <h1>Analytics</h1>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PERIOD_OPTIONS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)} className={cn('chip', period === p.key ? 'solid' : '')}>{p.label}</button>
        ))}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Receipts</span><span className="t-num" style={{ fontSize: 18, color: 'var(--leaf)' }}>{inr(summary.receipts)}</span></div>
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Payments</span><span className="t-num" style={{ fontSize: 18, color: 'var(--coral)' }}>{inr(summary.payments)}</span></div>
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">{summary.net >= 0 ? 'Surplus' : 'Deficit'}</span><span className="t-num" style={{ fontSize: 18 }}>{inr(Math.abs(summary.net))}</span></div>
        <div className="card stack" style={{ gap: 2 }}><span className="eyebrow">Collection</span><span className="t-num" style={{ fontSize: 18, color: 'var(--ink)' }}>{summary.collectionRate.toFixed(1)}%</span></div>
      </div>

      {/* Trend */}
      <div className="card stack">
        <div className="eyebrow">Receipts vs Payments</div>
        {trend.length === 0 ? <p className="muted tiny">No data.</p> : (
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="aRecv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  <linearGradient id="aPay" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--ink)' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--ink)' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any, n: any) => [inr(v), n === 'receipts' ? 'Receipts' : 'Payments']} contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="receipts" stroke="#10b981" strokeWidth={2.5} fill="url(#aRecv)" name="Receipts" />
                <Area type="monotone" dataKey="payments" stroke="#ef4444" strokeWidth={2.5} fill="url(#aPay)" name="Payments" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Pies: income heads + expense categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PieCard title="Income by Head" rows={heads} />
        <PieCard title="Expense by Category" rows={cats} />
      </div>

      {/* Class-wise bar */}
      <div className="card stack">
        <div className="eyebrow">Class-wise Collected vs Outstanding</div>
        {classData.length === 0 ? <p className="muted tiny">No data.</p> : (
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--ink)' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--ink)' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => inr(v)} contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="collected" fill="#10b981" radius={[4, 4, 0, 0]} name="Collected" />
                <Bar dataKey="pending" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Outstanding" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top debtors */}
      <div className="card stack">
        <div className="eyebrow">Top Outstanding (Debtors)</div>
        {debtors.length === 0 ? <p className="muted tiny">No outstanding dues. 🎉</p> : debtors.map((d, i) => (
          <div key={i} className="row" style={{ padding: '10px 0', borderColor: 'var(--line-2)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
              <div className="tiny muted">{d.className} · {d.month}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {d.overdue && <span className="chip" style={{ padding: '2px 8px', fontSize: 10, background: 'rgba(239,68,68,0.1)', color: 'var(--coral)', borderColor: 'transparent' }}>Overdue</span>}
              <span className="t-num" style={{ color: 'var(--coral)', fontSize: 14 }}>{inr(d.due)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PieCard({ title, rows }: { title: string; rows: { name: string; amount: number }[] }) {
  const top = rows.slice(0, 7);
  const others = rows.slice(7).reduce((s, r) => s + r.amount, 0);
  const pieData = others > 0 ? [...top, { name: 'Others', amount: others }] : top;
  return (
    <div className="card stack">
      <div className="eyebrow">{title}</div>
      {pieData.length === 0 ? <p className="muted tiny">No data.</p> : (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={48} paddingAngle={2}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any, n: any) => [inr(v), n]} contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
