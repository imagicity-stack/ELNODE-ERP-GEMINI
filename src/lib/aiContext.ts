import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

interface AIContext {
  generatedAt: string;
  period: { from: string; to: string; label: string };
  summary: {
    totalIncome: number;
    totalExpenses: number;
    totalSalaries: number;
    netProfit: number;
    feeRequestsCount: number;
    overdueCount: number;
    studentsCount: number;
    staffCount: number;
  };
  expensesByCategory: Record<string, number>;
  topExpenses: Array<{ date: string; category: string; biller: string; description?: string; amount: number; mode?: string }>;
  recentPayments: Array<{ date: string; studentId: string; amount: number; method: string; receiptNumber?: string }>;
  overdueFeeRequests: Array<{ studentId: string; month: string; dueDate: string; outstanding: number }>;
  salariesThisMonth: Array<{ employeeName: string; role: string; netAmount: number; paidAmount: number; status: string }>;
  monthlyTrend: Array<{ month: string; income: number; expenses: number; salaries: number; net: number }>;
}

function monthKey(dateStr: string): string {
  return (dateStr || '').slice(0, 7);
}

export async function buildAIContext(periodLabel = 'This Month'): Promise<AIContext> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let from: Date, to: Date;
  if (periodLabel === 'This Month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (periodLabel === 'Last Month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (periodLabel === 'This Quarter') {
    const q = Math.floor(now.getMonth() / 3);
    from = new Date(now.getFullYear(), q * 3, 1);
    to = new Date(now.getFullYear(), q * 3 + 3, 0);
  } else {
    from = new Date(now.getFullYear(), 0, 1);
    to = new Date(now.getFullYear(), 11, 31);
  }

  const range = { from: fmt(from), to: fmt(to), label: periodLabel };
  const todayStr = fmt(now);

  const [expSnap, paySnap, salSnap, reqSnap, studSnap, teacherSnap, staffSnap] = await Promise.all([
    getDocs(query(collection(db, 'expenses'), orderBy('date', 'desc'))),
    getDocs(query(collection(db, 'feePayments'), orderBy('date', 'desc'))),
    getDocs(collection(db, 'salaries')),
    getDocs(collection(db, 'feeRequests')),
    getDocs(collection(db, 'students')),
    getDocs(collection(db, 'teachers')),
    getDocs(collection(db, 'staff')),
  ]);

  const allExpenses = expSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const allPayments = paySnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const allSalaries = salSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const allRequests = reqSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const inRange = (date: string) => date >= range.from && date <= range.to;

  const periodExpenses = allExpenses.filter(e => e.date && inRange(e.date));
  const periodPayments = allPayments.filter(p => p.date && inRange(p.date));
  const monthPrefix = range.from.slice(0, 7);
  const periodSalaries = allSalaries.filter(s => s.month && s.month.startsWith(monthPrefix));

  const totalIncome = periodPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalExpenses = periodExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalSalaries = periodSalaries.reduce((s, e) => s + (e.netAmount || 0), 0);
  const netProfit = totalIncome - totalExpenses - totalSalaries;

  const expensesByCategory: Record<string, number> = {};
  for (const e of periodExpenses) {
    const k = e.category || 'other';
    expensesByCategory[k] = (expensesByCategory[k] || 0) + (e.amount || 0);
  }

  const topExpenses = [...periodExpenses]
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 10)
    .map(e => ({
      date: e.date,
      category: e.category,
      biller: e.biller,
      description: e.description,
      amount: e.amount,
      mode: e.paymentMode,
    }));

  const recentPayments = periodPayments.slice(0, 15).map(p => ({
    date: p.date,
    studentId: p.studentId,
    amount: p.amount,
    method: p.method,
    receiptNumber: p.receiptNumber,
  }));

  const overdueFeeRequests = allRequests
    .filter(r => r.dueDate && r.dueDate < todayStr && r.status !== 'paid')
    .slice(0, 25)
    .map(r => ({
      studentId: r.studentId,
      month: r.month,
      dueDate: r.dueDate,
      outstanding: (r.totalAmount || 0) - (r.paidAmount || 0) - (r.waivedAmount || 0) + (r.fineAmount || 0),
    }));

  const salariesThisMonth = periodSalaries.map(s => ({
    employeeName: s.employeeName,
    role: s.employeeRole,
    netAmount: s.netAmount,
    paidAmount: s.paidAmount || 0,
    status: s.status,
  }));

  // 6-month trend
  const monthlyMap: Record<string, { income: number; expenses: number; salaries: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    monthlyMap[k] = { income: 0, expenses: 0, salaries: 0 };
  }
  for (const p of allPayments) {
    const k = monthKey(p.date);
    if (monthlyMap[k]) monthlyMap[k].income += p.amount || 0;
  }
  for (const e of allExpenses) {
    const k = monthKey(e.date);
    if (monthlyMap[k]) monthlyMap[k].expenses += e.amount || 0;
  }
  for (const s of allSalaries) {
    const k = s.month;
    if (monthlyMap[k]) monthlyMap[k].salaries += s.netAmount || 0;
  }
  const monthlyTrend = Object.entries(monthlyMap).map(([month, v]) => ({
    month,
    income: v.income,
    expenses: v.expenses,
    salaries: v.salaries,
    net: v.income - v.expenses - v.salaries,
  }));

  return {
    generatedAt: now.toISOString(),
    period: range,
    summary: {
      totalIncome,
      totalExpenses,
      totalSalaries,
      netProfit,
      feeRequestsCount: allRequests.length,
      overdueCount: overdueFeeRequests.length,
      studentsCount: studSnap.size,
      staffCount: teacherSnap.size + staffSnap.size,
    },
    expensesByCategory,
    topExpenses,
    recentPayments,
    overdueFeeRequests,
    salariesThisMonth,
    monthlyTrend,
  };
}
