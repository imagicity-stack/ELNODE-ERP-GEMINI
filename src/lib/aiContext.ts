import { collection, getDocs, query, orderBy, where, limit } from 'firebase/firestore';
import { db } from '../firebase';

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmt(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthKey(dateStr: string) { return (dateStr || '').slice(0, 7); }
function pct(num: number, den: number) { return den > 0 ? Math.round((num / den) * 100) : 0; }
function avg(arr: number[]) { return arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0; }
function inr(n: number) { return Math.round(n); }

// Wraps a getDocs call so a single collection failure (permission denied,
// missing index, etc.) returns an empty snapshot instead of crashing the
// entire Promise.all and leaving the user with no AI context at all.
async function safeGet(q: any): Promise<{ docs: any[] }> {
  try {
    return await getDocs(q);
  } catch (e: any) {
    console.warn('[aiContext] collection fetch failed:', e?.code || e?.message);
    return { docs: [] };
  }
}

// ─── Super Admin / Full-School Context ───────────────────────────────────────

export async function buildAIContext(periodLabel = 'This Month') {
  const now = new Date();
  const today = fmt(now);
  const todayMinus30 = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));

  let from: Date, to: Date;
  if (periodLabel === 'This Month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (periodLabel === 'Last Month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to   = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (periodLabel === 'This Quarter') {
    const q = Math.floor(now.getMonth() / 3);
    from = new Date(now.getFullYear(), q * 3, 1);
    to   = new Date(now.getFullYear(), q * 3 + 3, 0);
  } else {
    from = new Date(now.getFullYear(), 0, 1);
    to   = new Date(now.getFullYear(), 11, 31);
  }

  const range = { from: fmt(from), to: fmt(to), label: periodLabel };
  const monthPrefix = range.from.slice(0, 7);
  const inRange = (date: string) => date >= range.from && date <= range.to;

  // ── Parallel Firestore fetches (fault-tolerant — one failure won't crash all) ──
  const [
    studSnap, classSnap, houseSnap, teacherSnap, staffSnap,
    expSnap, paySnap, salSnap, reqSnap, advSnap,
    attTodaySnap, attMonthSnap,
    teachLeaveSnap, studLeaveSnap,
    examSnap, examResultSnap,
    grievanceSnap, noticeSnap, homeworkSnap,
  ] = await Promise.all([
    safeGet(collection(db, 'students')),
    safeGet(collection(db, 'classes')),
    safeGet(collection(db, 'houses')),
    safeGet(collection(db, 'teachers')),
    safeGet(collection(db, 'staff')),
    safeGet(query(collection(db, 'expenses'), orderBy('date', 'desc'))),
    safeGet(query(collection(db, 'feePayments'), orderBy('date', 'desc'))),
    safeGet(collection(db, 'salaries')),
    safeGet(collection(db, 'feeRequests')),
    safeGet(query(collection(db, 'advancePayments'), orderBy('createdAt', 'desc'), limit(100))),
    safeGet(query(collection(db, 'attendance'), where('date', '==', today))),
    safeGet(query(collection(db, 'attendance'), where('date', '>=', todayMinus30))),
    safeGet(query(collection(db, 'teacherLeaves'), orderBy('createdAt', 'desc'), limit(100))),
    safeGet(query(collection(db, 'studentLeaves'), orderBy('createdAt', 'desc'), limit(100))),
    safeGet(query(collection(db, 'exams'), orderBy('startDate', 'desc'), limit(20))),
    safeGet(query(collection(db, 'examResults'), limit(300))),
    safeGet(query(collection(db, 'grievances'), orderBy('createdAt', 'desc'), limit(100))),
    safeGet(query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(15))),
    safeGet(query(collection(db, 'homework'), orderBy('dueDate', 'desc'), limit(100))),
  ]);

  // ── Raw arrays ────────────────────────────────────────────────────────────
  const students    = studSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const classes     = classSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const houses      = houseSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const teachers    = teacherSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const staff       = staffSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const expenses    = expSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const payments    = paySnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const salaries    = salSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const feeReqs     = reqSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const advPayments = advSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const attToday    = attTodaySnap.docs.map(d => d.data() as any);
  const attMonth    = attMonthSnap.docs.map(d => d.data() as any);
  const tLeaves     = teachLeaveSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const sLeaves     = studLeaveSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const exams       = examSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const examResults = examResultSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const grievances  = grievanceSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const notices     = noticeSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const homework    = homeworkSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // Track which collections returned no data (likely permission issues)
  const emptyCollections: string[] = [];
  const check = (name: string, snap: { docs: any[] }) => { if (snap.docs.length === 0) emptyCollections.push(name); };
  check('attendance-today', attTodaySnap);
  check('grievances', grievanceSnap);
  check('teacherLeaves', teachLeaveSnap);
  check('studentLeaves', studLeaveSnap);
  check('examResults', examResultSnap);

  // ── Period filters ────────────────────────────────────────────────────────
  const periodExpenses = expenses.filter(e => e.date && inRange(e.date));
  const periodPayments = payments.filter(p => p.date && inRange(p.date));
  const periodSalaries = salaries.filter(s => s.month && s.month.startsWith(monthPrefix));

  // ── Finance ───────────────────────────────────────────────────────────────
  const totalIncome    = periodPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalExpenses  = periodExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalSalaries  = periodSalaries.reduce((s, s2) => s + (s2.netAmount || 0), 0);
  const netProfit      = totalIncome - totalExpenses - totalSalaries;

  const expensesByCategory: Record<string, number> = {};
  for (const e of periodExpenses) {
    const k = e.category || 'other';
    expensesByCategory[k] = (expensesByCategory[k] || 0) + (e.amount || 0);
  }

  const paymentMethodBreakdown: Record<string, number> = {};
  for (const p of periodPayments) {
    const k = p.method || p.paymentMethod || 'unknown';
    paymentMethodBreakdown[k] = (paymentMethodBreakdown[k] || 0) + (p.amount || 0);
  }

  const discountsGiven = periodPayments.reduce((s, p) => s + (p.discountAmount || 0), 0);
  const fineCollected  = periodPayments.reduce((s, p) => s + (p.fineAmount || 0), 0);
  const advTotal       = advPayments.filter(a => inRange((a.createdAt || '').slice(0, 10))).reduce((s, a) => s + (a.amount || 0), 0);

  // Fee requests
  const overdueFeeReqs   = feeReqs.filter(r => r.dueDate && r.dueDate < today && r.status !== 'paid');
  const pendingFeeReqs   = feeReqs.filter(r => r.status !== 'paid');
  const overdueAmount    = overdueFeeReqs.reduce((s, r) => s + Math.max(0, (r.totalAmount || 0) - (r.paidAmount || 0) - (r.waivedAmount || 0)), 0);
  const collectionRate   = pct(feeReqs.filter(r => r.status === 'paid').length, feeReqs.length);

  const salaryRoleMap: Record<string, { count: number; total: number; unpaid: number }> = {};
  for (const s of periodSalaries) {
    const r = s.employeeRole || 'unknown';
    if (!salaryRoleMap[r]) salaryRoleMap[r] = { count: 0, total: 0, unpaid: 0 };
    salaryRoleMap[r].count++;
    salaryRoleMap[r].total += s.netAmount || 0;
    if (s.status !== 'paid') salaryRoleMap[r].unpaid++;
  }

  // Monthly 6-month trend
  const monthlyMap: Record<string, { income: number; expenses: number; salaries: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k  = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    monthlyMap[k] = { income: 0, expenses: 0, salaries: 0 };
  }
  for (const p of payments)  { const k = monthKey(p.date);  if (monthlyMap[k]) monthlyMap[k].income   += p.amount    || 0; }
  for (const e of expenses)  { const k = monthKey(e.date);  if (monthlyMap[k]) monthlyMap[k].expenses += e.amount    || 0; }
  for (const s of salaries)  { const k = s.month;           if (monthlyMap[k]) monthlyMap[k].salaries += s.netAmount || 0; }

  // ── Enrollment / Students ────────────────────────────────────────────────
  const classMap: Record<string, { name: string; sections: Set<string>; count: number }> = {};
  for (const c of classes) classMap[c.id] = { name: c.name, sections: new Set(), count: 0 };
  const houseMap: Record<string, { name: string; count: number }> = {};
  for (const h of houses) houseMap[h.id] = { name: h.name, count: 0 };

  let genderMale = 0, genderFemale = 0, genderOther = 0, genderUnknown = 0;
  let transportSchool = 0, transportPrivate = 0, transportUnknown = 0;

  for (const s of students) {
    if (classMap[s.classId]) {
      classMap[s.classId].count++;
      if (s.section) classMap[s.classId].sections.add(s.section);
    }
    if (s.houseId && houseMap[s.houseId]) houseMap[s.houseId].count++;
    const g = (s.gender || '').toLowerCase();
    if (g === 'male') genderMale++;
    else if (g === 'female') genderFemale++;
    else if (g === 'other') genderOther++;
    else genderUnknown++;
    const t = (s.transportDetails || '').toLowerCase();
    if (t === 'school') transportSchool++;
    else if (t === 'private') transportPrivate++;
    else transportUnknown++;
  }

  // ── Attendance ────────────────────────────────────────────────────────────
  const attPresent = attToday.filter(a => a.status === 'present').length;
  const attAbsent  = attToday.filter(a => a.status === 'absent').length;
  const attLate    = attToday.filter(a => a.status === 'late').length;

  // Class-wise today attendance
  const attByClass: Record<string, { present: number; absent: number; total: number }> = {};
  for (const a of attToday) {
    if (!attByClass[a.classId]) attByClass[a.classId] = { present: 0, absent: 0, total: 0 };
    attByClass[a.classId].total++;
    if (a.status === 'present') attByClass[a.classId].present++;
    if (a.status === 'absent')  attByClass[a.classId].absent++;
  }

  // Monthly attendance
  const attMonthPresent = attMonth.filter(a => a.status === 'present').length;
  const attMonthTotal   = attMonth.length;
  const avgAttRate      = pct(attMonthPresent, attMonthTotal);

  // Chronic absentees (per-student, last 30 days < 75%)
  const studentAttMap: Record<string, { present: number; total: number }> = {};
  for (const a of attMonth) {
    if (!studentAttMap[a.studentId]) studentAttMap[a.studentId] = { present: 0, total: 0 };
    studentAttMap[a.studentId].total++;
    if (a.status === 'present') studentAttMap[a.studentId].present++;
  }
  const chronicAbsentees = Object.values(studentAttMap).filter(v => pct(v.present, v.total) < 75).length;

  // ── Teacher Leaves ────────────────────────────────────────────────────────
  const tLeavePending  = tLeaves.filter(l => l.status === 'pending').length;
  const tLeaveApproved = tLeaves.filter(l => l.status === 'approved' && (l.createdAt || '').slice(0, 7) === monthPrefix).length;
  const tLeaveType: Record<string, number> = {};
  for (const l of tLeaves) { const t = l.leaveType || 'other'; tLeaveType[t] = (tLeaveType[t] || 0) + 1; }

  // ── Student Leaves ────────────────────────────────────────────────────────
  const sLeavePending  = sLeaves.filter(l => l.status === 'pending').length;
  const sLeaveApproved = sLeaves.filter(l => l.status === 'approved' && (l.createdAt || '').slice(0, 7) === monthPrefix).length;

  // ── Exams ─────────────────────────────────────────────────────────────────
  const upcomingExams = exams.filter(e => (e.startDate || '') >= today).slice(0, 5);
  const recentExams   = exams.filter(e => (e.startDate || '') < today).slice(0, 5);

  const resultPcts = examResults.map(r => r.percentage || 0).filter(p => p > 0);
  const avgExamPct  = avg(resultPcts);
  const passRate    = pct(resultPcts.filter(p => p >= 40).length, resultPcts.length);

  const resultByClass: Record<string, number[]> = {};
  for (const r of examResults) {
    if (!resultByClass[r.classId]) resultByClass[r.classId] = [];
    if (r.percentage > 0) resultByClass[r.classId].push(r.percentage);
  }
  const classwiseExamAvg = Object.entries(resultByClass).map(([cId, pcts]) => ({
    class: classMap[cId]?.name || cId,
    avgScore: avg(pcts),
    count: pcts.length,
  })).sort((a, b) => b.avgScore - a.avgScore).slice(0, 8);

  // ── Homework ──────────────────────────────────────────────────────────────
  const oneWeekAgo = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  const recentHW   = homework.filter(h => (h.dueDate || '') >= oneWeekAgo).length;
  const hwBySubject: Record<string, number> = {};
  for (const h of homework) { const s = h.subjectId || 'unknown'; hwBySubject[s] = (hwBySubject[s] || 0) + 1; }

  // ── Grievances ────────────────────────────────────────────────────────────
  const openGrievances     = grievances.filter(g => g.status !== 'resolved' && g.status !== 'closed');
  const resolvedGrievances = grievances.filter(g => g.status === 'resolved' || g.status === 'closed');
  const grievanceTypes: Record<string, number> = {};
  for (const g of grievances) { const t = g.type || g.category || 'other'; grievanceTypes[t] = (grievanceTypes[t] || 0) + 1; }

  // ── Teachers ──────────────────────────────────────────────────────────────
  const subjectCoverage: Record<string, number> = {};
  const classCoverage: Record<string, number>   = {};
  for (const t of teachers) {
    for (const s of (t.subjects || [])) subjectCoverage[s] = (subjectCoverage[s] || 0) + 1;
    for (const c of (t.classes  || [])) classCoverage[c]   = (classCoverage[c]   || 0) + 1;
  }
  const thirtyDaysAgo = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
  const recentJoined  = teachers.filter(t => (t.joiningDate || t.createdAt || '') >= thirtyDaysAgo).length;

  // ── Build final context object ────────────────────────────────────────────
  return {
    generatedAt: now.toISOString(),
    period: range,
    _dataWarnings: emptyCollections.length > 0
      ? `Some collections returned no data (possible permission issue or empty): ${emptyCollections.join(', ')}. Deploy firestore.rules if recently changed.`
      : null,

    school: {
      totalStudents:   students.length,
      totalTeachers:   teachers.length,
      totalStaff:      staff.length,
      totalClasses:    classes.length,
      totalHouses:     houses.length,
      enrollmentByClass: Object.values(classMap)
        .filter(c => c.count > 0)
        .map(c => ({ class: `Class ${c.name}`, students: c.count, sections: [...c.sections].join(', ') }))
        .sort((a, b) => b.students - a.students),
      genderBreakdown: { male: genderMale, female: genderFemale, other: genderOther, unknown: genderUnknown },
      transportBreakdown: { school: transportSchool, private: transportPrivate, unknown: transportUnknown },
      houseBreakdown: Object.values(houseMap).map(h => ({ house: h.name, count: h.count })),
    },

    finance: {
      period: {
        income:   inr(totalIncome),
        expenses: inr(totalExpenses),
        salaries: inr(totalSalaries),
        net:      inr(netProfit),
      },
      feeCollection: {
        totalRequests:  feeReqs.length,
        paidCount:      feeReqs.filter(r => r.status === 'paid').length,
        pendingCount:   pendingFeeReqs.length,
        overdueCount:   overdueFeeReqs.length,
        overdueAmount:  inr(overdueAmount),
        collectedThisPeriod: inr(totalIncome),
        collectionRate, // %
        discountsGiven: inr(discountsGiven),
        fineCollected:  inr(fineCollected),
        advancePaymentsThisPeriod: inr(advTotal),
      },
      paymentMethods: Object.fromEntries(Object.entries(paymentMethodBreakdown).map(([k, v]) => [k, inr(v)])),
      expensesByCategory: Object.fromEntries(Object.entries(expensesByCategory).map(([k, v]) => [k, inr(v)])),
      topExpenses: [...periodExpenses].sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 10).map(e => ({
        date: e.date, category: e.category, biller: e.biller, amount: inr(e.amount || 0),
      })),
      salaryByRole: Object.entries(salaryRoleMap).map(([role, v]) => ({
        role, count: v.count, totalNet: inr(v.total), unpaidCount: v.unpaid,
      })),
      overdueFeeRequests: overdueFeeReqs.slice(0, 20).map(r => ({
        studentId: r.studentId,
        month: r.month,
        dueDate: r.dueDate,
        outstanding: inr(Math.max(0, (r.totalAmount || 0) - (r.paidAmount || 0) - (r.waivedAmount || 0))),
      })),
      monthlyTrend: Object.entries(monthlyMap).map(([month, v]) => ({
        month,
        income:   inr(v.income),
        expenses: inr(v.expenses),
        salaries: inr(v.salaries),
        net:      inr(v.income - v.expenses - v.salaries),
      })),
    },

    attendance: {
      today: {
        date:    today,
        present: attPresent,
        absent:  attAbsent,
        late:    attLate,
        total:   attToday.length,
        rate:    pct(attPresent, attToday.length),
      },
      last30Days: {
        avgAttendanceRate: avgAttRate,
        totalRecordsAnalyzed: attMonthTotal,
        chronicAbsenteesCount: chronicAbsentees,
      },
      classwiseToday: Object.entries(attByClass).map(([cId, v]) => ({
        class: classMap[cId]?.name || cId,
        present: v.present,
        absent:  v.absent,
        total:   v.total,
        rate:    pct(v.present, v.total),
      })).sort((a, b) => a.rate - b.rate).slice(0, 10),
    },

    leaves: {
      teachers: {
        pendingApproval: tLeavePending,
        approvedThisMonth: tLeaveApproved,
        byType: tLeaveType,
        recentPending: tLeaves.filter(l => l.status === 'pending').slice(0, 5).map(l => ({
          teacher: l.teacherName || l.teacherId,
          type: l.leaveType,
          from: l.startDate,
          to: l.endDate,
        })),
      },
      students: {
        pendingApproval: sLeavePending,
        approvedThisMonth: sLeaveApproved,
        recentPending: sLeaves.filter(l => l.status === 'pending').slice(0, 5).map(l => ({
          student: l.studentName || l.studentId,
          reason: l.reason,
          from: l.startDate,
          to: l.endDate,
        })),
      },
    },

    exams: {
      upcoming: upcomingExams.map(e => ({
        name: e.name, type: e.type, startDate: e.startDate,
        classes: (e.classIds || []).map((c: string) => classMap[c]?.name || c),
      })),
      recentCompleted: recentExams.map(e => ({
        name: e.name, type: e.type, date: e.startDate, status: e.status,
      })),
      results: {
        totalRecorded: examResults.length,
        avgPercentage: avgExamPct,
        passingRate: passRate,
        classwiseAverage: classwiseExamAvg,
      },
    },

    academic: {
      homework: {
        totalAssigned: homework.length,
        assignedThisWeek: recentHW,
        bySubject: Object.entries(hwBySubject).map(([s, c]) => ({ subject: s, count: c })).sort((a, b) => b.count - a.count).slice(0, 8),
      },
      notices: {
        recentCount: notices.length,
        recent: notices.slice(0, 8).map(n => ({
          title: n.title,
          date: (n.createdAt || '').slice(0, 10),
          targets: n.targetRoles || [],
        })),
      },
    },

    grievances: {
      total:    grievances.length,
      open:     openGrievances.length,
      resolved: resolvedGrievances.length,
      resolutionRate: pct(resolvedGrievances.length, grievances.length),
      byType: grievanceTypes,
      recentOpen: openGrievances.slice(0, 5).map(g => ({
        type: g.type || g.category,
        date: (g.createdAt || '').slice(0, 10),
        status: g.status,
      })),
    },

    teachers: {
      total:        teachers.length,
      recentJoined,
      classCoverage: Object.entries(classCoverage).map(([cId, n]) => ({
        class: classMap[cId]?.name || cId, teacherCount: n,
      })),
      classesWithNoTeacher: classes.filter(c => !classCoverage[c.id]).map(c => c.name),
    },
  };
}

// ─── Teacher context ──────────────────────────────────────────────────────────

export async function buildTeacherContext(teacherId: string, classIds: string[] = []) {
  const now = new Date();
  const today = fmt(now);
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

  const homework    = hwSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const todayAtt    = attSnap.docs.map(d => d.data() as any);
  const exams       = examSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const notices     = noticeSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const students    = studSnap ? studSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) : [];
  const examResults = examResultsSnap ? examResultsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) : [];

  const myClassAttendance = safeClassIds.length > 0
    ? todayAtt.filter(a => safeClassIds.includes(a.classId))
    : todayAtt;
  const presentToday = myClassAttendance.filter(a => a.status === 'present').length;
  const absentToday  = myClassAttendance.filter(a => a.status === 'absent').length;

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
      subject: h.subjectId, classId: h.classId, dueDate: h.dueDate,
      description: h.content, submissionsCount: h.submissions?.length || 0,
    })),
    upcomingExams: exams.map((e: any) => ({ name: e.name, type: e.type, startDate: e.startDate, classIds: e.classIds })),
    recentNotices: notices.map((n: any) => ({ title: n.title, date: n.createdAt, content: n.content })),
    todayAttendance: { present: presentToday, absent: absentToday, total: myClassAttendance.length },
    classPerformance: classIds.map(cId => {
      const res = examResults.filter((r: any) => r.classId === cId);
      const avgScore = res.length > 0
        ? Math.round(res.reduce((s: number, r: any) => s + (r.percentage || 0), 0) / res.length)
        : null;
      return { classId: cId, avgScore, examResultCount: res.length };
    }),
  };
}

// ─── Student context ──────────────────────────────────────────────────────────

export async function buildStudentContext(studentId: string, classId: string) {
  const now  = new Date();
  const today = fmt(now);

  const [attSnap, feeSnap, hwSnap, resultSnap, noticeSnap] = await Promise.all([
    getDocs(query(collection(db, 'attendance'), where('studentId', '==', studentId))),
    getDocs(query(collection(db, 'feeRequests'), where('studentId', '==', studentId), orderBy('dueDate', 'desc'), limit(10))),
    classId ? getDocs(query(collection(db, 'homework'), where('classId', '==', classId), orderBy('dueDate', 'desc'), limit(10))) : Promise.resolve({ docs: [] }),
    getDocs(query(collection(db, 'examResults'), where('studentId', '==', studentId), limit(10))),
    getDocs(query(collection(db, 'notices'), where('targetRoles', 'array-contains', 'student'), orderBy('createdAt', 'desc'), limit(5))),
  ]);

  const attendance  = attSnap.docs.map(d => d.data() as any);
  const feeRequests = feeSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const homework    = hwSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const examResults = resultSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const notices     = noticeSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const totalDays   = attendance.length;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const attendancePct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  const pendingFees     = feeRequests.filter(f => f.status !== 'paid');
  const pendingFeeAmount = pendingFees.reduce((s: number, f: any) => s + ((f.totalAmount || 0) - (f.paidAmount || 0)), 0);
  const overdueFees     = pendingFees.filter(f => f.dueDate && f.dueDate < today);

  const avgScore = examResults.length > 0
    ? Math.round(examResults.reduce((s: number, r: any) => s + (r.percentage || 0), 0) / examResults.length)
    : null;

  return {
    role: 'student', generatedAt: now.toISOString(), studentId, classId,
    summary: { attendancePct, totalDays, presentDays, absentDays: totalDays - presentDays,
      pendingFeeAmount, pendingFeeCount: pendingFees.length, overdueFeeCount: overdueFees.length,
      homeworkPending: homework.length, avgExamScore: avgScore },
    feeRequests: feeRequests.map((f: any) => ({
      month: f.month, totalAmount: f.totalAmount, paidAmount: f.paidAmount || 0,
      outstanding: (f.totalAmount || 0) - (f.paidAmount || 0), dueDate: f.dueDate, status: f.status,
    })),
    recentHomework: homework.map((h: any) => ({ subject: h.subjectId, dueDate: h.dueDate, description: h.content })),
    examResults: examResults.map((r: any) => ({
      examId: r.examId, percentage: r.percentage, grade: r.overallGrade,
      totalMarks: r.totalMarks, obtainedMarks: r.obtainedMarks,
    })),
    recentNotices: notices.map((n: any) => ({ title: n.title, date: n.createdAt, content: n.content })),
  };
}

// ─── Parent context ────────────────────────────────────────────────────────────

export async function buildParentContext(studentId: string, studentName?: string, classId = '') {
  const now  = new Date();
  const today = fmt(now);

  const [attSnap, feeSnap, hwSnap, resultSnap, noticeSnap] = await Promise.all([
    getDocs(query(collection(db, 'attendance'), where('studentId', '==', studentId))),
    getDocs(query(collection(db, 'feeRequests'), where('studentId', '==', studentId), orderBy('dueDate', 'desc'), limit(10))),
    classId ? getDocs(query(collection(db, 'homework'), where('classId', '==', classId), orderBy('dueDate', 'desc'), limit(5))) : Promise.resolve({ docs: [] }),
    getDocs(query(collection(db, 'examResults'), where('studentId', '==', studentId), limit(10))),
    getDocs(query(collection(db, 'notices'), where('targetRoles', 'array-contains', 'parent'), orderBy('createdAt', 'desc'), limit(5))),
  ]);

  const attendance  = attSnap.docs.map(d => d.data() as any);
  const feeRequests = feeSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const homework    = hwSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const examResults = resultSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const notices     = noticeSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const totalDays   = attendance.length;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const attendancePct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  const pendingFees      = feeRequests.filter(f => f.status !== 'paid');
  const pendingFeeAmount = pendingFees.reduce((s: number, f: any) => s + ((f.totalAmount || 0) - (f.paidAmount || 0)), 0);
  const overdueFees      = pendingFees.filter(f => f.dueDate && f.dueDate < today);

  const avgScore = examResults.length > 0
    ? Math.round(examResults.reduce((s: number, r: any) => s + (r.percentage || 0), 0) / examResults.length)
    : null;

  return {
    role: 'parent', generatedAt: now.toISOString(), studentId,
    studentName: studentName || 'your child', classId,
    summary: { attendancePct, totalDays, presentDays, absentDays: totalDays - presentDays,
      pendingFeeAmount, pendingFeeCount: pendingFees.length, overdueFeeCount: overdueFees.length,
      homeworkActive: homework.length, avgExamScore: avgScore },
    feeRequests: feeRequests.map((f: any) => ({
      month: f.month, totalAmount: f.totalAmount, paidAmount: f.paidAmount || 0,
      outstanding: (f.totalAmount || 0) - (f.paidAmount || 0), dueDate: f.dueDate, status: f.status,
    })),
    recentHomework: homework.map((h: any) => ({ subject: h.subjectId, dueDate: h.dueDate, description: h.content })),
    examResults: examResults.map((r: any) => ({ examId: r.examId, percentage: r.percentage, grade: r.overallGrade })),
    recentNotices: notices.map((n: any) => ({ title: n.title, date: n.createdAt, content: n.content })),
  };
}
