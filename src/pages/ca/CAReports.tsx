import { useMemo, useState } from 'react';
import {
  Download, FileText, FileSpreadsheet, Loader2, Scale, BookOpen,
  TrendingUp, Receipt, Wallet, AlertTriangle, FileBarChart,
} from 'lucide-react';
import { UserProfile } from '../../types';
import { useFinancials, PERIOD_OPTIONS, PeriodKey, getDateRange, inRange, monthInRange, inr } from './financialData';
import {
  buildLedger, realPayments, outstandingDues, computeSummary, FinancialArrays,
} from './compute';
import {
  downloadIncomeExpenditurePdf, downloadReceiptsPaymentsPdf, downloadFeeCollectionPdf,
  downloadExpensePdf, downloadPayrollPdf, downloadOutstandingPdf, downloadLedgerPdf, exportCsv,
} from './exporters';
import { useData } from '../../contexts/DataContext';
import { Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { cn } from '../../lib/utils';

type Fmt = 'pdf' | 'csv';

export default function CAReports({ user: _user }: { user: UserProfile }) {
  const data = useFinancials();
  const fa: FinancialArrays = data;
  const { classes } = useData();
  const [period, setPeriod] = useState<PeriodKey>('this_fy');
  const [busy, setBusy] = useState<string | null>(null);
  const { showToast } = useToast();

  const range = useMemo(() => getDateRange(period), [period]);
  const classNameById = useMemo(() => {
    const m: Record<string, string> = {};
    classes.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [classes]);
  const summary = useMemo(() => computeSummary(fa, range), [fa, range]);

  if (data.loading) return <Spinner />;

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try { await fn(); showToast('Download ready', 'success'); }
    catch { showToast('Failed to generate file', 'error'); }
    finally { setBusy(null); }
  };

  const reports: {
    id: string; title: string; desc: string; icon: any; accent: string;
    pdf?: () => Promise<void>; csv?: () => Promise<void>;
  }[] = [
    {
      id: 'ie', title: 'Income & Expenditure', desc: 'Period surplus/deficit with income heads and expenditure categories.',
      icon: Scale, accent: 'var(--leaf)',
      pdf: () => downloadIncomeExpenditurePdf(fa, range),
    },
    {
      id: 'rp', title: 'Receipts & Payments', desc: 'Cash account — collections received against payments made.',
      icon: TrendingUp, accent: 'var(--accent)',
      pdf: () => downloadReceiptsPaymentsPdf(fa, range),
    },
    {
      id: 'ledger', title: 'Day Book / Ledger', desc: 'Chronological cash book with running balance for the period.',
      icon: BookOpen, accent: 'var(--ink)',
      pdf: () => downloadLedgerPdf(buildLedger(fa, range), range),
      csv: () => {
        let bal = 0;
        const rows = buildLedger(fa, range).map(e => { bal += e.credit - e.debit; return { Date: e.date, Particulars: e.particulars, Category: e.category, Ref: e.ref, Mode: e.method, Receipt: e.credit || '', Payment: e.debit || '', Balance: bal }; });
        return exportCsv(rows, `day_book_${range.from}_${range.to}.csv`);
      },
    },
    {
      id: 'fees', title: 'Fee Collection Register', desc: 'All fee receipts in the period, by student and head.',
      icon: Receipt, accent: 'var(--leaf)',
      pdf: () => downloadFeeCollectionPdf(fa, range),
      csv: () => exportCsv(
        realPayments(fa.payments).filter(p => inRange(p.date, range)).map(p => ({
          Receipt: p.receiptNumber || '', Date: p.date, Student: fa.studentsMap[p.studentId]?.name || p.studentId,
          Head: p.feeHead || '', Mode: p.method || '', Amount: p.amount || 0,
        })), `fee_collection_${range.from}_${range.to}.csv`),
    },
    {
      id: 'exp', title: 'Expense Statement', desc: 'Expenditure ledger grouped by category with totals.',
      icon: FileText, accent: 'var(--coral)',
      pdf: () => downloadExpensePdf(fa, range),
      csv: () => exportCsv(
        fa.expenses.filter(e => inRange(e.date, range)).map(e => ({
          Date: e.date, Category: e.category, Biller: e.biller || '', Description: e.description || '', Status: e.status, Amount: e.amount || 0,
        })), `expenses_${range.from}_${range.to}.csv`),
    },
    {
      id: 'pay', title: 'Payroll Register', desc: 'Salary disbursements with net pay and balances.',
      icon: Wallet, accent: 'var(--accent)',
      pdf: () => downloadPayrollPdf(fa, range),
      csv: () => exportCsv(
        fa.salaries.filter(s => monthInRange(s.month, range)).map(s => ({
          Month: s.month, Employee: s.employeeName, Role: s.employeeRole, Net: s.netAmount || 0, Paid: s.paidAmount || 0, Status: s.status,
        })), `payroll_${range.from}_${range.to}.csv`),
    },
    {
      id: 'debtors', title: 'Outstanding Fees (Debtors)', desc: 'All unpaid dues as on today, across every class. (Period-independent.)',
      icon: AlertTriangle, accent: 'var(--coral)',
      pdf: () => downloadOutstandingPdf(fa, classNameById),
      csv: () => exportCsv(
        outstandingDues(fa, classNameById).map(d => ({
          Student: d.name, Class: d.className, Month: d.month, DueDate: d.dueDate, Status: d.overdue ? 'overdue' : d.status, Outstanding: d.due,
        })), `outstanding_fees_${new Date().toISOString().slice(0, 10)}.csv`),
    },
  ];

  return (
    <div className="pad stack" style={{ gap: 'var(--space-5)' }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{range.label}</div>
          <h1>Reports &amp; Statements</h1>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--ink)', color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <FileBarChart size={22} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div className="eyebrow" style={{ color: 'var(--cream)', opacity: 0.7 }}>Period Snapshot</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 4, flexWrap: 'wrap' }}>
            <span><b className="t-num" style={{ fontSize: 18 }}>{inr(summary.receipts)}</b> <span className="tiny" style={{ opacity: 0.7 }}>receipts</span></span>
            <span><b className="t-num" style={{ fontSize: 18 }}>{inr(summary.payments)}</b> <span className="tiny" style={{ opacity: 0.7 }}>payments</span></span>
            <span><b className="t-num" style={{ fontSize: 18 }}>{inr(Math.abs(summary.net))}</b> <span className="tiny" style={{ opacity: 0.7 }}>{summary.net >= 0 ? 'surplus' : 'deficit'}</span></span>
          </div>
        </div>
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PERIOD_OPTIONS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)} className={cn('chip', period === p.key ? 'solid' : '')}>{p.label}</button>
        ))}
      </div>

      {/* Report cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {reports.map(r => {
          const Icon = r.icon;
          return (
            <div key={r.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'var(--cream-2)', color: r.accent }}>
                  <Icon size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{r.title}</p>
                  <p className="tiny muted" style={{ marginTop: 2 }}>{r.desc}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {r.pdf && (
                  <button className="btn ghost" style={{ flex: 1 }} disabled={!!busy} onClick={() => run(`${r.id}-pdf`, r.pdf!)}>
                    {busy === `${r.id}-pdf` ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
                  </button>
                )}
                {r.csv && (
                  <button className="btn ghost" style={{ flex: 1 }} disabled={!!busy} onClick={() => run(`${r.id}-csv`, r.csv!)}>
                    {busy === `${r.id}-csv` ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} CSV
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="tiny muted" style={{ paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <FileText size={12} /> All statements are branded, computer-generated, and reflect cash-basis books for {range.label}.
      </p>
    </div>
  );
}
