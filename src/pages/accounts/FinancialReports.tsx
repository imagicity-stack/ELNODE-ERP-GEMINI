import { UserProfile, Expense, FeePayment, Salary } from '../../types';
import { Download, FileText, PieChart, TrendingUp, Calendar, Filter, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { createPdf, addFooter, TABLE_STYLES } from '../../lib/pdfTemplate';
import { useToast } from '../../components/Toast';
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
      `₹${(p.amount || 0).toLocaleString('en-IN')}`,
    ]);

    (doc as any).autoTable({
      startY: contentY + 2,
      head: [['Receipt No', 'Date', 'Student ID', 'Fee Head', 'Method', 'Amount']],
      body: rows,
      foot: [[
        { content: `Total Collections: ${filtered.length} entries`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: `₹${total.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', textColor: [5, 150, 105] } },
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
      `₹${(e.amount || 0).toLocaleString('en-IN')}`,
    ]);

    (doc as any).autoTable({
      startY: contentY + 2,
      head: [['Date', 'Category', 'Biller', 'Description', 'Status', 'Amount']],
      body: rows,
      foot: [[
        { content: `Total Expenses: ${filtered.length} entries`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: `₹${total.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', textColor: [220, 38, 38] } },
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
      s.month,
      `₹${(s.baseAmount || 0).toLocaleString('en-IN')}`,
      `₹${(s.allowances || 0).toLocaleString('en-IN')}`,
      `₹${((s.deductions?.pf || 0) + (s.deductions?.tax || 0) + (s.deductions?.leaveDeduction || 0) + (s.deductions?.other || 0)).toLocaleString('en-IN')}`,
      `₹${(s.netAmount || 0).toLocaleString('en-IN')}`,
      s.status.toUpperCase(),
    ]);

    (doc as any).autoTable({
      startY: contentY + 2,
      head: [['Employee', 'Role', 'Month', 'Base', 'Allowances', 'Deductions', 'Net Pay', 'Status']],
      body: rows,
      foot: [[
        { content: `${filtered.length} employees`, colSpan: 3, styles: { fontStyle: 'bold' } },
        { content: `₹${totalBase.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold' } },
        { content: '', colSpan: 2 },
        { content: `₹${totalNet.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', textColor: [5, 150, 105] } },
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
      ['Fee Collections (Income)', `₹${totalIncome.toLocaleString('en-IN')}`, ''],
      ['Operating Expenses', `₹${totalExpenses.toLocaleString('en-IN')}`, ''],
      ['Salary Disbursements', `₹${totalSalaries.toLocaleString('en-IN')}`, ''],
      ['Total Costs', `₹${totalCosts.toLocaleString('en-IN')}`, ''],
      ['Net Profit / (Loss)', `₹${Math.abs(netProfit).toLocaleString('en-IN')}`, netProfit >= 0 ? 'PROFIT' : 'LOSS'],
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

  return (
    <div className="space-y-8">
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
  );
}
