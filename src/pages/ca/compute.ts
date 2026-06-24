/**
 * Pure accounting derivations for the CA portal. No Firestore, no React — just
 * functions over the already-loaded financial arrays so they can be reused by
 * both the on-screen pages and the PDF/CSV report builders.
 *
 * Accounting model (cash basis, the natural fit for a school's books):
 *   • Cash IN  (receipts) = real fee payments + advance payments collected.
 *       Synthetic fee payments created when an advance is later *applied* to a
 *       month carry an `advancePaymentId` and are excluded, so advance money is
 *       never counted twice.
 *   • Cash OUT (payments) = expenses + salary disbursements.
 */

import { Expense, FeePayment, FeeRequest, Salary, AdvancePayment, Student } from '../../types';
import { DateRange, inRange } from './financialData';

export interface FinancialArrays {
  payments: FeePayment[];
  requests: FeeRequest[];
  expenses: Expense[];
  salaries: Salary[];
  advances: AdvancePayment[];
  studentsMap: Record<string, Student>;
}

export type LedgerType = 'fee' | 'advance' | 'expense' | 'salary';

export interface LedgerEntry {
  date: string;
  particulars: string;
  category: string;
  ref: string;
  method: string;
  type: LedgerType;
  debit: number;   // cash out
  credit: number;  // cash in
}

const titleCase = (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/** "Real" fee payments — excludes synthetic advance-application rows. */
export function realPayments(payments: FeePayment[]): FeePayment[] {
  return payments.filter(p => !p.advancePaymentId);
}

/**
 * Build the chronological day book for a period. Salary rows are expanded from
 * each salary's paymentHistory so part-payments appear on their actual dates;
 * salaries with no history fall back to a single row on the 1st of the month.
 */
export function buildLedger(data: FinancialArrays, range: DateRange): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  realPayments(data.payments).forEach(p => {
    if (!inRange(p.date, range)) return;
    const student = data.studentsMap[p.studentId];
    entries.push({
      date: p.date,
      particulars: `Fee — ${student?.name || p.studentId}`,
      category: p.feeHead || 'Tuition Fees',
      ref: p.receiptNumber || '—',
      method: titleCase(p.method || ''),
      type: 'fee',
      debit: 0,
      credit: p.amount || 0,
    });
  });

  data.advances.forEach(a => {
    if (!inRange(a.date, range)) return;
    const student = data.studentsMap[a.studentId];
    entries.push({
      date: a.date,
      particulars: `Advance fee — ${student?.name || a.studentId}`,
      category: 'Advance Fees',
      ref: a.receiptNumber || '—',
      method: titleCase(a.paymentMethod || ''),
      type: 'advance',
      debit: 0,
      credit: a.totalAmount || 0,
    });
  });

  data.expenses.forEach(e => {
    if (!inRange(e.date, range)) return;
    entries.push({
      date: e.date,
      particulars: `${titleCase(e.category)} — ${e.biller || '—'}`,
      category: titleCase(e.category),
      ref: e.receiptNumber || '—',
      method: titleCase(e.paymentMode || ''),
      type: 'expense',
      debit: e.amount || 0,
      credit: 0,
    });
  });

  data.salaries.forEach(s => {
    const history = s.paymentHistory && s.paymentHistory.length > 0
      ? s.paymentHistory
      : (s.paidAmount > 0 ? [{ amount: s.paidAmount, date: `${s.month}-01`, method: 'bank_transfer' }] : []);
    history.forEach(h => {
      if (!inRange(h.date, range)) return;
      entries.push({
        date: h.date,
        particulars: `Salary — ${s.employeeName} (${titleCase(s.employeeRole)})`,
        category: 'Salary & Wages',
        ref: s.receiptNumber || '—',
        method: titleCase(h.method || ''),
        type: 'salary',
        debit: h.amount || 0,
        credit: 0,
      });
    });
  });

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

export interface Summary {
  receipts: number;          // total cash in
  feeIncome: number;
  advanceIncome: number;
  fineIncome: number;
  payments: number;          // total cash out
  expenseTotal: number;
  salaryTotal: number;
  net: number;               // receipts - payments (surplus / deficit)
  expected: number;          // total invoiced (feeRequests)
  collectionRate: number;    // collected / expected %
  outstanding: number;       // unpaid dues
  defaulters: number;        // students with pending/overdue requests
}

export function computeSummary(data: FinancialArrays, range: DateRange): Summary {
  const rp = realPayments(data.payments).filter(p => inRange(p.date, range));
  const feeIncome = rp.reduce((s, p) => s + (p.amount || 0), 0);
  const advanceIncome = data.advances.filter(a => inRange(a.date, range))
    .reduce((s, a) => s + (a.totalAmount || 0), 0);
  const fineIncome = data.requests
    .filter(r => r.status === 'paid' && inRange(r.dueDate, range))
    .reduce((s, r) => s + (r.fineAmount || 0), 0);

  const expenseTotal = data.expenses.filter(e => inRange(e.date, range))
    .reduce((s, e) => s + (e.amount || 0), 0);

  let salaryTotal = 0;
  data.salaries.forEach(s => {
    const history = s.paymentHistory && s.paymentHistory.length > 0
      ? s.paymentHistory
      : (s.paidAmount > 0 ? [{ amount: s.paidAmount, date: `${s.month}-01` }] : []);
    history.forEach(h => { if (inRange(h.date, range)) salaryTotal += h.amount || 0; });
  });

  const receipts = feeIncome + advanceIncome;
  const payments = expenseTotal + salaryTotal;

  // Expected vs collected uses all-time invoices for an honest collection rate.
  const expected = data.requests.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const collectedAll = realPayments(data.payments).reduce((s, p) => s + (p.amount || 0), 0);
  const outstanding = data.requests
    .filter(r => r.status !== 'paid')
    .reduce((s, r) => s + ((r.totalAmount || 0) - (r.waivedAmount || 0) - (r.paidAmount || 0)), 0);
  const defaulterIds = new Set<string>();
  data.requests.forEach(r => { if (r.status === 'pending' || r.status === 'overdue') defaulterIds.add(r.studentId); });

  return {
    receipts, feeIncome, advanceIncome, fineIncome,
    payments, expenseTotal, salaryTotal,
    net: receipts - payments,
    expected,
    collectionRate: expected > 0 ? (collectedAll / expected) * 100 : 0,
    outstanding: Math.max(0, outstanding),
    defaulters: defaulterIds.size,
  };
}

/** Income broken down by fee head (uses allocations where available). */
export function incomeByHead(data: FinancialArrays, range: DateRange): { name: string; amount: number }[] {
  const heads: Record<string, number> = {};
  realPayments(data.payments).filter(p => inRange(p.date, range)).forEach(p => {
    if (p.allocations && p.allocations.length > 0) {
      p.allocations.forEach(a => { heads[a.headName || 'Other'] = (heads[a.headName || 'Other'] || 0) + (a.amount || 0); });
    } else {
      const h = p.feeHead || 'Tuition Fees';
      heads[h] = (heads[h] || 0) + (p.amount || 0);
    }
  });
  const adv = data.advances.filter(a => inRange(a.date, range)).reduce((s, a) => s + (a.totalAmount || 0), 0);
  if (adv > 0) heads['Advance Fees'] = (heads['Advance Fees'] || 0) + adv;
  return Object.entries(heads).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}

/** Expenses broken down by category. */
export function expenseByCategory(data: FinancialArrays, range: DateRange): { name: string; amount: number }[] {
  const cats: Record<string, number> = {};
  data.expenses.filter(e => inRange(e.date, range)).forEach(e => {
    const c = titleCase(e.category || 'Other');
    cats[c] = (cats[c] || 0) + (e.amount || 0);
  });
  return Object.entries(cats).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}

export interface DebtorRow {
  studentId: string;
  name: string;
  className: string;
  month: string;
  due: number;
  status: string;
  dueDate: string;
  overdue: boolean;
}

/** Outstanding fee dues (debtors) across all unpaid invoices. */
export function outstandingDues(
  data: FinancialArrays,
  classNameById: Record<string, string>,
): DebtorRow[] {
  const today = new Date().toISOString().slice(0, 10);
  return data.requests
    .filter(r => r.status !== 'paid')
    .map(r => {
      const due = (r.totalAmount || 0) - (r.waivedAmount || 0) - (r.paidAmount || 0);
      const student = data.studentsMap[r.studentId];
      return {
        studentId: r.studentId,
        name: student?.name || r.studentId,
        className: classNameById[r.classId] || '—',
        month: r.month || '—',
        due: Math.max(0, due),
        status: r.status,
        dueDate: r.dueDate || '',
        overdue: !!r.dueDate && r.dueDate < today,
      };
    })
    .filter(r => r.due > 0)
    .sort((a, b) => b.due - a.due);
}

/** Monthly receipts vs payments series for trend charts (chronological). */
export function monthlyTrend(data: FinancialArrays, range: DateRange): { name: string; receipts: number; payments: number }[] {
  const months: Record<string, { receipts: number; payments: number }> = {};
  const key = (d: string) => d.slice(0, 7);
  const bump = (d: string, field: 'receipts' | 'payments', amt: number) => {
    const k = key(d);
    if (!months[k]) months[k] = { receipts: 0, payments: 0 };
    months[k][field] += amt;
  };
  realPayments(data.payments).filter(p => inRange(p.date, range)).forEach(p => bump(p.date, 'receipts', p.amount || 0));
  data.advances.filter(a => inRange(a.date, range)).forEach(a => bump(a.date, 'receipts', a.totalAmount || 0));
  data.expenses.filter(e => inRange(e.date, range)).forEach(e => bump(e.date, 'payments', e.amount || 0));
  data.salaries.forEach(s => {
    const history = s.paymentHistory && s.paymentHistory.length > 0
      ? s.paymentHistory : (s.paidAmount > 0 ? [{ amount: s.paidAmount, date: `${s.month}-01` }] : []);
    history.forEach(h => { if (inRange(h.date, range)) bump(h.date, 'payments', h.amount || 0); });
  });
  return Object.keys(months).sort().map(k => {
    const [y, m] = k.split('-');
    const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    return { name: label, receipts: months[k].receipts, payments: months[k].payments };
  });
}
