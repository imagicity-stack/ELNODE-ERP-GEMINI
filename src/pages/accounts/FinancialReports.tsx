import { UserProfile, Expense, FeePayment, Salary } from '../../types';
import { Download, FileText, PieChart, TrendingUp, Calendar, Filter, Loader2, Sparkles } from 'lucide-react';
import AIInsightsPanel from '../../components/AIInsightsPanel';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { createPdf, addFooter, TABLE_STYLES } from '../../lib/pdfTemplate';
import { useToast } from '../../components/Toast';
import { fmtMonthYear } from '../../lib/utils';
import {
  PageHeader,
  Card,
  Button,
  FormField,
  Select,
} from '../../components/ui';

interface FinancialReportsProps {
  user: UserProfile;
}

type ReportType = 'fee_collection' | 'expense_statement' | 'payroll_summary' | 'profit_loss';

function getMonthRange(range: string): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (range === 'This Month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: fmt(from), to: fmt(to) };
  }
  if (range === 'Last Month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(from), to: fmt(to) };
  }
  if (range === 'This Quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const from = new Date(now.getFullYear(), q * 3, 1);
    const to = new Date(now.getFullYear(), q * 3 + 3, 0);
    return { from: fmt(from), to: fmt(to) };
  }
  // This Year
  return {
    from: `${now.getFullYear()}-01-01`,
    to: `${now.getFullYear()}-12-31`,
  };
}

export default function FinancialReports({ user }: FinancialReportsProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [dateRange, setDateRange] = useState('This Month');
  const [generating, setGenerating] = useState<ReportType | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      try {
        const [expSnap, paySnap, salSnap] = await Promise.all([
          getDocs(query(collection(db, 'expenses'), orderBy('date', 'desc'))),
          getDocs(query(collection(db, 'feePayments'), orderBy('date', 'desc'))),
          getDocs(collection(db, 'salaries')),
        ]);
        setExpenses(expSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense)));
        setPayments(paySnap.docs.map((d) => ({ id: d.id, ...d.data() } as FeePayment)));
        setSalaries(salSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Salary)));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'financial_reports');
      }
    };
    fetch();
  }, []);

  const inRange = (date: string, range: { from: string; to: string }) =>
    date >= range.from && date <= range.to;

  const generateFeeCollectionReport = async () => {
    const range = getMonthRange(dateRange);
    const filtered = payments.filter((p) => inRange(p.date, range));
    const total = filtered.reduce((s, p) => s + (p.amount || 0), 0);

    const { doc, contentY, pageWidth } = await createPdf(
      'Fee Collection Report',
      `Period: ${range.from} to ${range.to}`,
    );

    const rows = filtered.map((p) => [
      p.receiptNumber || '-',
      p.date,
      p.studentId,
      p.feeHead || '-',
      (p.method || '').replace('_', ' ').toUpperCase(),
      `Rs. ${(p.amount || 0).toLocaleString('en-IN')}`,
    ]);

    (doc as any).autoTable({
      startY: contentY + 2,
      head: [['Receipt No', 'Date', 'Student ID', 'Fee Head', 'Method', 'Amount']],
      body: rows,
      foot: [[
        { content: `Total Collections: ${filtered.length} entries`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: `Rs. ${total.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', textColor: [5, 150, 105] } },
      ]],
      ...TABLE_STYLES,
      footStyles: { fillColor: [209, 250, 229], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9 },
      margin: { left: 12, right: 12 },
    });

    addFooter(doc);
    doc.save(`fee_collection_${range.from}_${range.to}.pdf`);
  };

  const generateExpenseReport = async () => {
    const range = getMonthRange(dateRange);
    const filtered = expenses.filter((e) => inRange(e.date, range));
    const total = filtered.reduce((s, e) => s + (e.amount || 0), 0);

    const { doc, contentY } = await createPdf(
      'Expense Statement',
      `Period: ${range.from} to ${range.to}`,
    );

    const rows = filtered.map((e) => [
      e.date,
      e.category,
      e.biller,
      e.description || '-',
      e.status.toUpperCase(),
      `Rs. ${(e.amount || 0).toLocaleString('en-IN')}`,
    ]);

    (doc as any).autoTable({
      startY: contentY + 2,
      head: [['Date', 'Category', 'Biller', 'Description', 'Status', 'Amount']],
      body: rows,
      foot: [[
        { content: `Total Expenses: ${filtered.length} entries`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: `Rs. ${total.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', textColor: [220, 38, 38] } },
      ]],
      ...TABLE_STYLES,
      footStyles: { fillColor: [254, 226, 226], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9 },
      margin: { left: 12, right: 12 },
    });

    addFooter(doc);
    doc.save(`expense_statement_${range.from}_${range.to}.pdf`);
  };

  const generatePayrollReport = async () => {
    const range = getMonthRange(dateRange);
    const monthPrefix = range.from.slice(0, 7);
    const filtered = salaries.filter((s) => s.month && s.month.startsWith(monthPrefix));
    const totalNet = filtered.reduce((s, e) => s + (e.netAmount || 0), 0);
    const totalBase = filtered.reduce((s, e) => s + (e.baseAmount || 0), 0);

    const { doc, contentY } = await createPdf(
      'Payroll Summary',
      `Period: ${range.from} to ${range.to}`,
    );

    const rows = filtered.map((s) => [
      s.employeeName,
      s.employeeRole,
      fmtMonthYear(s.month),
      `Rs. ${(s.baseAmount || 0).toLocaleString('en-IN')}`,
      `Rs. ${(s.allowances || 0).toLocaleString('en-IN')}`,
      `Rs. ${((s.deductions?.pf || 0) + (s.deductions?.tax || 0) + (s.deductions?.leaveDeduction || 0) + (s.deductions?.other || 0)).toLocaleString('en-IN')}`,
      `Rs. ${(s.netAmount || 0).toLocaleString('en-IN')}`,
      s.status.toUpperCase(),
    ]);

    (doc as any).autoTable({
      startY: contentY + 2,
      head: [['Employee', 'Role', 'Month', 'Base', 'Allowances', 'Deductions', 'Net Pay', 'Status']],
      body: rows,
      foot: [[
        { content: `${filtered.length} employees`, colSpan: 3, styles: { fontStyle: 'bold' } },
        { content: `Rs. ${totalBase.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold' } },
        { content: '', colSpan: 2 },
        { content: `Rs. ${totalNet.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', textColor: [5, 150, 105] } },
        { content: '' },
      ]],
      ...TABLE_STYLES,
      styles: { fontSize: 8, cellPadding: 3 },
      footStyles: { fillColor: [209, 250, 229], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9 },
      margin: { left: 12, right: 12 },
    });

    addFooter(doc);
    doc.save(`payroll_summary_${monthPrefix}.pdf`);
  };

  const generatePLReport = async () => {
    const range = getMonthRange(dateRange);
    const totalIncome = payments.filter((p) => inRange(p.date, range)).reduce((s, p) => s + (p.amount || 0), 0);
    const totalExpenses = expenses.filter((e) => inRange(e.date, range)).reduce((s, e) => s + (e.amount || 0), 0);
    const monthPrefix = range.from.slice(0, 7);
    const totalSalaries = salaries.filter((s) => s.month?.startsWith(monthPrefix)).reduce((s, e) => s + (e.netAmount || 0), 0);
    const totalCosts = totalExpenses + totalSalaries;
    const netProfit = totalIncome - totalCosts;

    const { doc, contentY, pageWidth } = await createPdf(
      'Profit & Loss Statement',
      `Period: ${range.from} to ${range.to}`,
    );

    const summaryRows = [
      ['Fee Collections (Income)', `Rs. ${totalIncome.toLocaleString('en-IN')}`, ''],
      ['Operating Expenses', `Rs. ${totalExpenses.toLocaleString('en-IN')}`, ''],
      ['Salary Disbursements', `Rs. ${totalSalaries.toLocaleString('en-IN')}`, ''],
      ['Total Costs', `Rs. ${totalCosts.toLocaleString('en-IN')}`, ''],
      ['Net Profit / (Loss)', `Rs. ${Math.abs(netProfit).toLocaleString('en-IN')}`, netProfit >= 0 ? 'PROFIT' : 'LOSS'],
    ];

    (doc as any).autoTable({
      startY: contentY + 2,
      head: [['Description', 'Amount', 'Status']],
      body: summaryRows,
      ...TABLE_STYLES,
      bodyStyles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 55, halign: 'right' },
        2: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.row.index === 4) {
          data.cell.styles.textColor = netProfit >= 0 ? [5, 150, 105] : [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: 12, right: 12 },
    });

    addFooter(doc);
    doc.save(`profit_loss_${range.from}_${range.to}.pdf`);
  };

  const handleGenerate = async (type: ReportType) => {
    setGenerating(type);
    try {
      if (type === 'fee_collection') await generateFeeCollectionReport();
      else if (type === 'expense_statement') await generateExpenseReport();
      else if (type === 'payroll_summary') await generatePayrollReport();
      else if (type === 'profit_loss') await generatePLReport();
      showToast('Report downloaded successfully!', 'success');
    } catch {
      showToast('Failed to generate report. Please try again.', 'error');
    } finally {
      setGenerating(null);
    }
  };

  const reports: { type: ReportType; title: string; desc: string; icon: any; gradient: string }[] = [
    {
      type: 'fee_collection',
      title: 'Fee Collection Report',
      desc: 'Detailed breakdown of all fee payments received by students.',
      icon: TrendingUp,
      gradient: 'bg-amber-50 text-amber-600',
    },
    {
      type: 'expense_statement',
      title: 'Expense Statement',
      desc: 'Complete record of school expenditures and bills.',
      icon: FileText,
      gradient: 'bg-red-50 text-red-600',
    },
    {
      type: 'payroll_summary',
      title: 'Payroll Summary',
      desc: 'Monthly salary disbursements and deductions for all staff.',
      icon: PieChart,
      gradient: 'bg-emerald-50 text-emerald-600',
    },
    {
      type: 'profit_loss',
      title: 'Profit & Loss',
      desc: 'Overall financial health: income vs expenditure analysis.',
      icon: TrendingUp,
      gradient: 'bg-violet-50 text-violet-600',
    },
  ];

  const range = getMonthRange(dateRange);
  const totalIncome = payments.filter((p) => inRange(p.date, range)).reduce((s, p) => s + (p.amount || 0), 0);
  const totalExpenseAmt = expenses.filter((e) => inRange(e.date, range)).reduce((s, e) => s + (e.amount || 0), 0);
  const monthPrefix = range.from.slice(0, 7);
  const totalSalariesAmt = salaries.filter((s) => s.month?.startsWith(monthPrefix)).reduce((s, e) => s + (e.netAmount || 0), 0);
  const netProfit = totalIncome - (totalExpenseAmt + totalSalariesAmt);
  const ranges = ['This Month', 'Last Month', 'This Quarter', 'This Year'];

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-4 pt-5 pb-6 text-white rounded-b-3xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Accountant Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Financial Reports</h1>
          <p className="text-[11px] text-emerald-100/90 mt-1">{dateRange} snapshot</p>

          <div className="mt-4 bg-white/15 backdrop-blur rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Net {netProfit >= 0 ? 'Profit' : 'Loss'}</p>
            <p className="text-3xl font-black mt-1">₹{Math.abs(netProfit).toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-emerald-100/90 mt-1">
              Income ₹{((totalIncome/1000)|0).toLocaleString()}k − Costs ₹{(((totalExpenseAmt+totalSalariesAmt)/1000)|0).toLocaleString()}k
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((totalIncome/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Income</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((totalExpenseAmt/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Expense</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((totalSalariesAmt/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Salary</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Date Range</p>
          <div className="overflow-x-auto flex gap-2 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {ranges.map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap active:scale-95 transition-transform ${dateRange === r ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pt-2 space-y-3">
          {reports.map((report) => {
            const Icon = report.icon;
            const isLoading = generating === report.type;
            return (
              <button
                key={report.type}
                onClick={() => handleGenerate(report.type)}
                disabled={!!generating}
                className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex items-center gap-3 active:scale-[0.98] transition-transform disabled:opacity-60 text-left"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${report.gradient}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{report.title}</p>
                  <p className="text-[11px] text-slate-500 leading-snug">{report.desc}</p>
                </div>
                <div className="shrink-0">
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Download className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Financial Reports"
        subtitle="Generate and download school financial statements"
        icon={FileText}
        iconColor="gradient-amber"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {reports.map((report) => {
            const Icon = report.icon;
            const isLoading = generating === report.type;
            return (
              <Card key={report.type} hover>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${report.gradient}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{report.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-6">{report.desc}</p>
                <button
                  onClick={() => handleGenerate(report.type)}
                  disabled={!!generating}
                  className="flex items-center gap-2 text-xs font-bold text-amber-600 uppercase tracking-widest hover:text-amber-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {isLoading ? 'Generating…' : 'Generate Report'}
                </button>
              </Card>
            );
          })}
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Filter className="w-5 h-5 text-amber-600" />
              Report Settings
            </h3>
            <div className="space-y-6">
              <FormField label="Date Range">
                <Select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                  <option>This Month</option>
                  <option>Last Month</option>
                  <option>This Quarter</option>
                  <option>This Year</option>
                </Select>
              </FormField>
              <div className="pt-4 border-t border-slate-100 space-y-3">
                {reports.map((r) => {
                  const isLoading = generating === r.type;
                  return (
                    <Button
                      key={r.type}
                      variant="secondary"
                      className="w-full justify-center"
                      icon={isLoading ? Loader2 : Download}
                      onClick={() => handleGenerate(r.type)}
                      disabled={!!generating}
                    >
                      {isLoading ? 'Generating…' : r.title}
                    </Button>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      </div>
      </div>

      {/* Floating AI Insights button */}
      <button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-5 right-5 md:bottom-8 md:right-8 z-30 group flex items-center gap-2 bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white shadow-xl shadow-violet-500/30 rounded-full pl-3 pr-4 py-3 active:scale-95 transition-transform"
        aria-label="Open AI insights"
      >
        <Sparkles className="w-5 h-5" />
        <span className="text-xs font-bold hidden md:inline">Ask AI</span>
      </button>

      <AIInsightsPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        period={dateRange as any}
      />
    </>
  );
}
