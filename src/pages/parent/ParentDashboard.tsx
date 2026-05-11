import {
  CreditCard,
  ClipboardCheck,
  CheckSquare,
  Bell,
  UserCircle,
  FileText,
  Users,
  DollarSign as DollarIcon,
  Calendar,
  BookOpen,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { UserProfile, Student, Notice, FeeRequest, Attendance, Homework, ExamResult } from '../../types';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  PageHeader,
  Card,
  StatCard,
  Badge,
  EmptyState,
} from '../../components/ui';
import UpdatesSection from '../../components/UpdatesSection';
import AIInsightsPanel from '../../components/AIInsightsPanel';
import { buildParentContext } from '../../lib/aiContext';

interface ParentDashboardProps {
  user: UserProfile;
  selectedStudent: Student | null;
}

export default function ParentDashboard({ user, selectedStudent }: ParentDashboardProps) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [feeRequests, setFeeRequests] = useState<FeeRequest[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!selectedStudent) return;
      setLoading(true);
      try {
        // Fetch Notices
        const noticesQ = query(
          collection(db, 'notices'),
          where('targetRoles', 'array-contains', 'parent'),
          orderBy('createdAt', 'desc'),
          limit(3)
        );
        const noticesSnap = await getDocs(noticesQ);
        setNotices(noticesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice)));

        // Fetch Fee Requests
        const feesQ = query(
          collection(db, 'feeRequests'),
          where('studentId', '==', selectedStudent.id),
          orderBy('dueDate', 'desc'),
          limit(4)
        );
        const feesSnap = await getDocs(feesQ);
        setFeeRequests(feesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeRequest)));

        // Fetch Attendance
        const attendanceQ = query(
          collection(db, 'attendance'),
          where('studentId', '==', selectedStudent.id)
        );
        const attendanceSnap = await getDocs(attendanceQ);
        setAttendance(attendanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance)));

        // Fetch Homework
        const homeworkQ = query(
          collection(db, 'homework'),
          where('classId', '==', selectedStudent.classId),
          orderBy('dueDate', 'desc'),
          limit(2)
        );
        const homeworkSnap = await getDocs(homeworkQ);
        setHomework(homeworkSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Homework)));

        // Fetch Exam Results
        const examResultsQ = query(
          collection(db, 'examResults'),
          where('studentId', '==', selectedStudent.id),
          limit(4)
        );
        const examResultsSnap = await getDocs(examResultsQ);
        setExamResults(examResultsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamResult)));

      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'dashboard-data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedStudent]);

  if (!selectedStudent) {
    return (
      <EmptyState
        icon={Users}
        title="No Students Linked"
        description="There are no student profiles linked to this parent account. Please contact the administration."
      />
    );
  }

  // Calculate Stats
  const pendingFees = feeRequests.filter(f => f.status === 'pending').reduce((sum, f) => sum + f.totalAmount, 0);
  const totalDays = attendance.length;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const attendancePercentage = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : '--';

  const pendingFeesCount = feeRequests.filter(f => f.status !== 'paid').length;
  const unreadNoticesCount = notices.length;

  const mobileTiles = [
    {
      to: '/parent/fees',
      label: 'Fees',
      icon: CreditCard,
      hint: pendingFees > 0 ? `₹${pendingFees.toLocaleString('en-IN')} due` : 'All paid',
      urgent: pendingFees > 0,
      bg: 'from-violet-500 to-violet-700',
    },
    {
      to: '/parent/attendance',
      label: 'Attendance',
      icon: ClipboardCheck,
      hint: totalDays > 0 ? `${attendancePercentage}% present` : 'No data',
      bg: 'from-emerald-500 to-emerald-700',
    },
    {
      to: '/parent/exams',
      label: 'Results',
      icon: FileText,
      hint: examResults.length > 0 ? `${examResults.length} exams` : 'No results',
      bg: 'from-indigo-500 to-indigo-700',
    },
    {
      to: '/parent/diary',
      label: 'Homework',
      icon: CheckSquare,
      hint: homework.length > 0 ? `${homework.length} active` : 'None pending',
      bg: 'from-amber-500 to-amber-700',
    },
    {
      to: '/parent/timetable',
      label: 'Timetable',
      icon: Calendar,
      hint: 'Class schedule',
      bg: 'from-sky-500 to-sky-700',
    },
    {
      to: '/parent/notices',
      label: 'Notices',
      icon: Bell,
      hint: unreadNoticesCount > 0 ? `${unreadNoticesCount} updates` : 'No new',
      bg: 'from-rose-500 to-rose-700',
    },
  ];

  return (
    <>
      {/* ─── Mobile Simplified UI ───────────────────────────────────────────── */}
      <div className="md:hidden space-y-5 -mx-4 -mt-4">
        {/* Greeting card */}
        <div className="bg-gradient-to-br from-violet-600 to-indigo-700 px-5 pt-6 pb-8 text-white rounded-b-3xl shadow-lg">
          <p className="text-xs font-medium text-violet-100 uppercase tracking-widest">Welcome</p>
          <h1 className="text-2xl font-bold mt-1">{selectedStudent.name}</h1>
          <p className="text-xs text-violet-100 mt-1">School No. {selectedStudent.schoolNumber}</p>

          {pendingFees > 0 && (
            <Link
              to="/parent/fees"
              className="mt-5 flex items-center justify-between bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-3 active:bg-white/25 transition-all"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-100">Pay Now</p>
                <p className="text-lg font-bold leading-tight">₹{pendingFees.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white text-violet-700 rounded-full px-3 py-1.5 text-xs font-bold flex items-center gap-1">
                Pay <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          )}
        </div>

        {/* Big action tiles — 2 columns */}
        <div className="grid grid-cols-2 gap-3 px-4">
          {mobileTiles.map(({ to, label, icon: Icon, hint, urgent, bg }) => (
            <Link
              key={to}
              to={to}
              className={`relative bg-gradient-to-br ${bg} rounded-2xl p-4 text-white shadow-md active:scale-95 transition-transform min-h-[110px] flex flex-col justify-between`}
            >
              <Icon className="w-7 h-7" strokeWidth={2.25} />
              <div>
                <p className="text-base font-bold leading-tight">{label}</p>
                <p className="text-[11px] text-white/80 mt-0.5">{hint}</p>
              </div>
              {urgent && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-yellow-300 rounded-full animate-pulse" />
              )}
            </Link>
          ))}
        </div>

        {/* Recent notices preview */}
        {notices.length > 0 && (
          <div className="px-4 pb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-violet-600" />
                Latest Notices
              </h3>
              <Link to="/parent/notices" className="text-xs text-violet-600 font-bold">See all</Link>
            </div>
            <div className="space-y-2">
              {notices.slice(0, 2).map((notice) => (
                <div key={notice.id} className="bg-white border border-slate-100 rounded-xl p-3">
                  <p className="text-sm font-bold text-slate-900 line-clamp-1">{notice.title}</p>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{notice.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Parent Dashboard"
        subtitle={`Monitoring progress for ${selectedStudent.name}`}
        icon={UserCircle}
        iconColor="gradient-violet"
        actions={
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">School Number</p>
            <p className="text-sm font-bold text-violet-600">{selectedStudent.schoolNumber}</p>
          </div>
        }
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Pending Fees"
          value={`₹${pendingFees}`}
          icon={CreditCard}
          gradient="gradient-violet"
          index={0}
        />
        <StatCard
          label="Attendance"
          value={`${attendancePercentage}%`}
          icon={ClipboardCheck}
          gradient="gradient-violet"
          index={1}
        />
        <StatCard
          label="Homework"
          value={`${homework.length} Active`}
          icon={CheckSquare}
          gradient="gradient-violet"
          index={2}
        />
      </div>

      <UpdatesSection user={user} className="mb-8" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Fee Tracking */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-violet-600" />
                Fee Status &amp; Payments
              </h3>
              <Link to="/parent/fees" className="text-sm text-violet-600 font-medium hover:underline">View All</Link>
            </div>
            <div className="space-y-4">
              {feeRequests.length > 0 ? feeRequests.map((fee) => (
                <div key={fee.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${fee.status === 'paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                      <DollarIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{fee.month} Fees</h4>
                      <p className="text-xs text-slate-500">Due: {fee.dueDate} • ₹{fee.totalAmount}</p>
                    </div>
                  </div>
                  <Badge variant={fee.status === 'paid' ? 'success' : 'warning'}>
                    {fee.status}
                  </Badge>
                </div>
              )) : (
                <p className="text-sm text-slate-500 italic text-center py-4">No fee records found.</p>
              )}
            </div>
          </Card>

          {/* Exam Results */}
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-violet-600" />
                Recent Exam Results
              </h3>
              <Link to="/parent/exams" className="text-sm text-violet-600 font-bold hover:underline">View Full Report</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {examResults.length > 0 ? examResults.map((result) => (
                <div key={result.id} className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-all">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Overall Result</p>
                  <div className="flex items-end justify-between mt-2">
                    <h4 className="text-xl font-bold text-slate-900">{result.percentage}%</h4>
                    <span className="text-lg font-black text-violet-600">{result.overallGrade}</span>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-slate-500 italic text-center py-4 col-span-2">No exam results found.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar: Attendance & Notices */}
        <div className="space-y-8">
          {/* School Notices */}
          <Card>
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Bell className="w-5 h-5 text-violet-600" />
              School Notices
            </h3>
            <div className="space-y-4">
              {notices.length > 0 ? notices.map((notice) => (
                <div key={notice.id} className="p-3 bg-slate-50 rounded-xl border border-transparent hover:border-violet-100 hover:bg-white hover:shadow-sm transition-all group">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-violet-600">{notice.title}</h4>
                    <span className="text-[8px] text-slate-400">{new Date(notice.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 line-clamp-2">{notice.content}</p>
                </div>
              )) : (
                <p className="text-xs text-slate-500 italic text-center py-4">No recent notices.</p>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-violet-600" />
              Attendance Summary
            </h3>
            <div className="flex items-center justify-center mb-6">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100"
                    strokeDasharray="100, 100"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="text-violet-600"
                    strokeDasharray={`${attendancePercentage}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-slate-900">{attendancePercentage}%</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Present</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Total Days</span>
                <span className="font-bold text-slate-900">{totalDays}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Present</span>
                <span className="font-bold text-emerald-600">{presentDays}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Absent</span>
                <span className="font-bold text-red-600">{totalDays - presentDays}</span>
              </div>
            </div>
          </Card>

          {/* Recent Homework */}
          <Card>
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-violet-600" />
              Homework Updates
            </h3>
            <div className="space-y-4">
              {homework.length > 0 ? homework.map((hw) => (
                <div key={hw.id} className="p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-violet-600 uppercase">{hw.subjectId}</span>
                    <span className="text-[10px] text-slate-400">{hw.dueDate}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">{hw.content.substring(0, 50)}...</h4>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                    <span className="text-[10px] font-medium text-slate-500">Due soon</span>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-slate-500 italic text-center py-4">No pending homework.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
      </div>

      {/* AI Insights floating button */}
      <button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white px-4 py-3 rounded-2xl shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 active:scale-95 transition-all text-sm font-bold"
        aria-label="Open AI Insights"
      >
        <Sparkles className="w-4 h-4" />
        <span className="hidden sm:inline">Ask AI</span>
      </button>

      <AIInsightsPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        label="Parent AI"
        greeting={`Hello! I can see ${selectedStudent.name}'s attendance, fees, homework, and exam results. What would you like to know?`}
        contextBuilder={() => buildParentContext(selectedStudent.id, selectedStudent.name, selectedStudent.classId)}
        placeholder="Ask about fees, attendance, results…"
        suggestedPrompts={[
          `What is ${selectedStudent.name}'s attendance percentage?`,
          'Are there any pending fee payments?',
          'How did my child perform in recent exams?',
          'What homework is due this week?',
          'Is there anything urgent I should be aware of?',
        ]}
        summaryRenderer={(ctx) => ctx?.summary ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className={`rounded-lg p-2 ${ctx.summary.attendancePct >= 75 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <p className={`text-[9px] font-bold uppercase ${ctx.summary.attendancePct >= 75 ? 'text-emerald-700' : 'text-rose-700'}`}>Attendance</p>
              <p className={`text-xs font-black mt-0.5 ${ctx.summary.attendancePct >= 75 ? 'text-emerald-800' : 'text-rose-800'}`}>{ctx.summary.attendancePct}%</p>
            </div>
            <div className={`rounded-lg p-2 ${ctx.summary.pendingFeeAmount > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
              <p className={`text-[9px] font-bold uppercase ${ctx.summary.pendingFeeAmount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>Fees Due</p>
              <p className={`text-xs font-black mt-0.5 ${ctx.summary.pendingFeeAmount > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                {ctx.summary.pendingFeeAmount > 0 ? `₹${(ctx.summary.pendingFeeAmount / 1000 | 0)}k` : 'Clear'}
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <p className="text-[9px] text-blue-700 font-bold uppercase">Avg Score</p>
              <p className="text-xs font-black text-blue-800 mt-0.5">{ctx.summary.avgExamScore != null ? `${ctx.summary.avgExamScore}%` : '--'}</p>
            </div>
          </div>
        ) : null}
      />
    </>
  );
}
