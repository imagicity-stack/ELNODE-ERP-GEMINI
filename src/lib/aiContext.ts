import { collection, getDocs, query, orderBy, where, limit } from 'firebase/firestore';
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

// ─── Teacher context ─────────────────────────────────────────────────────────

export async function buildTeacherContext(teacherId: string, classIds: string[] = []) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const safeClassIds = classIds.slice(0, 10);

  const baseQueries = [
    getDocs(query(collection(db, 'homework'), where('teacherId', '==', teacherId), orderBy('dueDate', 'desc'), limit(20))),
    getDocs(query(collection(db, 'attendance'), where('date', '==', today))),
    getDocs(query(collection(db, 'exams'), where('status', '==', 'scheduled'), orderBy('startDate', 'asc'), limit(5))),
    getDocs(query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(5))),
  ] as const;

  const classQueries = safeClassIds.length > 0 ? [
    getDocs(query(collection(db, 'students'), where('classId', 'in', safeClassIds))),
    getDocs(query(collection(db, 'examResults'), where('classId', 'in', safeClassIds), limit(50))),
  ] : [];

  const [hwSnap, attSnap, examSnap, noticeSnap] = await Promise.all(baseQueries);
  const [studSnap, examResultsSnap] = classQueries.length > 0
    ? await Promise.all(classQueries)
    : [null, null];

  const homework = hwSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const todayAtt = attSnap.docs.map(d => d.data() as any);
  const exams = examSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const notices = noticeSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const students = studSnap ? studSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) : [];
  const examResults = examResultsSnap ? examResultsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) : [];

  const myClassAttendance = safeClassIds.length > 0
    ? todayAtt.filter(a => safeClassIds.includes(a.classId))
    : todayAtt;
  const presentToday = myClassAttendance.filter(a => a.status === 'present').length;
  const absentToday = myClassAttendance.filter(a => a.status === 'absent').length;

  const avgExamScore = examResults.length > 0
    ? Math.round(examResults.reduce((s: number, r: any) => s + (r.percentage || 0), 0) / examResults.length)
    : null;

  return {
    role: 'teacher',
    generatedAt: now.toISOString(),
    teacherId,
    summary: {
      classCount: classIds.length,
      studentCount: students.length,
      homeworkAssigned: homework.length,
      presentToday,
      absentToday,
      upcomingExams: exams.length,
      avgExamScore,
    },
    recentHomework: homework.slice(0, 10).map((h: any) => ({
      subject: h.subjectId,
      classId: h.classId,
      dueDate: h.dueDate,
      description: h.content,
      submissionsCount: h.submissions?.length || 0,
    })),
    upcomingExams: exams.map((e: any) => ({
      name: e.name,
      type: e.type,
      startDate: e.startDate,
      classIds: e.classIds,
    })),
    recentNotices: notices.map((n: any) => ({
      title: n.title,
      date: n.createdAt,
      content: n.content,
    })),
    todayAttendance: { present: presentToday, absent: absentToday, total: myClassAttendance.length },
    classPerformance: classIds.map(cId => {
      const res = examResults.filter((r: any) => r.classId === cId);
      const avg = res.length > 0
        ? Math.round(res.reduce((s: number, r: any) => s + (r.percentage || 0), 0) / res.length)
        : null;
      return { classId: cId, avgScore: avg, examResultCount: res.length };
    }),
  };
}

// ─── Student context ──────────────────────────────────────────────────────────

export async function buildStudentContext(studentId: string, classId: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const [attSnap, feeSnap, hwSnap, resultSnap, noticeSnap] = await Promise.all([
    getDocs(query(collection(db, 'attendance'), where('studentId', '==', studentId))),
    getDocs(query(collection(db, 'feeRequests'), where('studentId', '==', studentId), orderBy('dueDate', 'desc'), limit(10))),
    classId ? getDocs(query(collection(db, 'homework'), where('classId', '==', classId), orderBy('dueDate', 'desc'), limit(10))) : Promise.resolve({ docs: [] }),
    getDocs(query(collection(db, 'examResults'), where('studentId', '==', studentId), limit(10))),
    getDocs(query(collection(db, 'notices'), where('targetRoles', 'array-contains', 'student'), orderBy('createdAt', 'desc'), limit(5))),
  ]);

  const attendance = attSnap.docs.map(d => d.data() as any);
  const feeRequests = feeSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const homework = hwSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const examResults = resultSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const notices = noticeSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const totalDays = attendance.length;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const attendancePct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  const pendingFees = feeRequests.filter(f => f.status !== 'paid');
  const pendingFeeAmount = pendingFees.reduce((s: number, f: any) => s + ((f.totalAmount || 0) - (f.paidAmount || 0)), 0);
  const overdueFees = pendingFees.filter(f => f.dueDate && f.dueDate < today);

  const avgScore = examResults.length > 0
    ? Math.round(examResults.reduce((s: number, r: any) => s + (r.percentage || 0), 0) / examResults.length)
    : null;

  return {
    role: 'student',
    generatedAt: now.toISOString(),
    studentId,
    classId,
    summary: {
      attendancePct,
      totalDays,
      presentDays,
      absentDays: totalDays - presentDays,
      pendingFeeAmount,
      pendingFeeCount: pendingFees.length,
      overdueFeeCount: overdueFees.length,
      homeworkPending: homework.length,
      avgExamScore: avgScore,
    },
    feeRequests: feeRequests.map((f: any) => ({
      month: f.month,
      totalAmount: f.totalAmount,
      paidAmount: f.paidAmount || 0,
      outstanding: (f.totalAmount || 0) - (f.paidAmount || 0),
      dueDate: f.dueDate,
      status: f.status,
    })),
    recentHomework: homework.map((h: any) => ({
      subject: h.subjectId,
      dueDate: h.dueDate,
      description: h.content,
    })),
    examResults: examResults.map((r: any) => ({
      examId: r.examId,
      percentage: r.percentage,
      grade: r.overallGrade,
      totalMarks: r.totalMarks,
      obtainedMarks: r.obtainedMarks,
    })),
    recentNotices: notices.map((n: any) => ({ title: n.title, date: n.createdAt, content: n.content })),
  };
}

// ─── Parent context ────────────────────────────────────────────────────────────

export async function buildParentContext(studentId: string, studentName?: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // First get the student's classId
  const studentSnap = await getDocs(query(collection(db, 'students'), where('__name__', '==', studentId)));
  const studentData = studentSnap.docs[0]?.data() as any;
  const classId = studentData?.classId || '';

  const [attSnap, feeSnap, hwSnap, resultSnap, noticeSnap] = await Promise.all([
    getDocs(query(collection(db, 'attendance'), where('studentId', '==', studentId))),
    getDocs(query(collection(db, 'feeRequests'), where('studentId', '==', studentId), orderBy('dueDate', 'desc'), limit(10))),
    classId ? getDocs(query(collection(db, 'homework'), where('classId', '==', classId), orderBy('dueDate', 'desc'), limit(5))) : Promise.resolve({ docs: [] }),
    getDocs(query(collection(db, 'examResults'), where('studentId', '==', studentId), limit(10))),
    getDocs(query(collection(db, 'notices'), where('targetRoles', 'array-contains', 'parent'), orderBy('createdAt', 'desc'), limit(5))),
  ]);

  const attendance = attSnap.docs.map(d => d.data() as any);
  const feeRequests = feeSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const homework = hwSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const examResults = resultSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const notices = noticeSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const totalDays = attendance.length;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const attendancePct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  const pendingFees = feeRequests.filter(f => f.status !== 'paid');
  const pendingFeeAmount = pendingFees.reduce((s: number, f: any) => s + ((f.totalAmount || 0) - (f.paidAmount || 0)), 0);
  const overdueFees = pendingFees.filter(f => f.dueDate && f.dueDate < today);

  const avgScore = examResults.length > 0
    ? Math.round(examResults.reduce((s: number, r: any) => s + (r.percentage || 0), 0) / examResults.length)
    : null;

  return {
    role: 'parent',
    generatedAt: now.toISOString(),
    studentId,
    studentName: studentName || studentData?.name || 'your child',
    classId,
    summary: {
      attendancePct,
      totalDays,
      presentDays,
      absentDays: totalDays - presentDays,
      pendingFeeAmount,
      pendingFeeCount: pendingFees.length,
      overdueFeeCount: overdueFees.length,
      homeworkActive: homework.length,
      avgExamScore: avgScore,
    },
    feeRequests: feeRequests.map((f: any) => ({
      month: f.month,
      totalAmount: f.totalAmount,
      paidAmount: f.paidAmount || 0,
      outstanding: (f.totalAmount || 0) - (f.paidAmount || 0),
      dueDate: f.dueDate,
      status: f.status,
    })),
    recentHomework: homework.map((h: any) => ({
      subject: h.subjectId,
      dueDate: h.dueDate,
      description: h.content,
    })),
    examResults: examResults.map((r: any) => ({
      examId: r.examId,
      percentage: r.percentage,
      grade: r.overallGrade,
    })),
    recentNotices: notices.map((n: any) => ({ title: n.title, date: n.createdAt, content: n.content })),
  };
}
