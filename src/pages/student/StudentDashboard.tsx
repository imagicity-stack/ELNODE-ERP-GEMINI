import {
  BookOpen,
  Calendar,
  CreditCard,
  CheckSquare,
  Clock,
  TrendingUp,
  Bell,
  ArrowRight,
  ClipboardCheck,
  FileText,
  Users,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { UserProfile, Notice, Homework, Attendance, FeeRequest } from '../../types';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  PageHeader,
  Card,
  StatCard,
  Badge,
  Button,
  Avatar,
  Spinner,
  EmptyState,
} from '../../components/ui';
import UpdatesSection from '../../components/UpdatesSection';
import { useData } from '../../contexts/DataContext';
import AIInsightsPanel from '../../components/AIInsightsPanel';
import { buildStudentContext } from '../../lib/aiContext';

interface StudentDashboardProps {
  user: UserProfile;
}

export default function StudentDashboard({ user }: StudentDashboardProps) {
  const { classesMap } = useData();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [feeRequests, setFeeRequests] = useState<FeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Notices
        const noticesQ = query(
          collection(db, 'notices'),
          where('targetRoles', 'array-contains', 'student'),
          orderBy('createdAt', 'desc'),
          limit(3)
        );
        const noticesSnap = await getDocs(noticesQ);
        setNotices(noticesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice)));

        // Fetch Homework
        if (user.classId) {
          const homeworkQ = query(
            collection(db, 'homework'),
            where('classId', '==', user.classId),
            orderBy('dueDate', 'desc'),
            limit(3)
          );
          const homeworkSnap = await getDocs(homeworkQ);
          setHomework(homeworkSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Homework)));
        }

        // Fetch Attendance
        const attendanceQ = query(
          collection(db, 'attendance'),
          where('studentId', '==', user.studentId || user.uid)
        );
        const attendanceSnap = await getDocs(attendanceQ);
        setAttendance(attendanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance)));

        // Fetch Fee Requests
        const feesQ = query(
          collection(db, 'feeRequests'),
          where('studentId', '==', user.studentId || user.uid),
          where('status', 'in', ['pending', 'partially_paid', 'overdue'])
        );
        const feesSnap = await getDocs(feesQ);
        setFeeRequests(feesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeRequest)));

      } catch (err) {
        console.error("Error fetching student dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.uid, user.classId, user.studentId]);

  const totalDays = attendance.length;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const attendancePercentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
  const pendingFeeAmount = feeRequests.reduce((sum, f) => sum + ((f.totalAmount || 0) - (f.paidAmount || 0)), 0);

  const mobileTiles = [
    {
      to: '/student/attendance',
      label: 'Attendance',
      icon: ClipboardCheck,
      hint: `${attendancePercentage}% present`,
      bg: 'from-emerald-500 to-emerald-700',
    },
    {
      to: '/student/fees',
      label: 'Fees',
      icon: CreditCard,
      hint: pendingFeeAmount > 0 ? `₹${pendingFeeAmount.toLocaleString('en-IN')} due` : 'All clear',
      urgent: pendingFeeAmount > 0,
      bg: 'from-violet-500 to-violet-700',
    },
    {
      to: '/student/homework',
      label: 'Homework',
      icon: CheckSquare,
      hint: homework.length > 0 ? `${homework.length} pending` : 'All done',
      bg: 'from-amber-500 to-amber-700',
    },
    {
      to: '/student/timetable',
      label: 'Timetable',
      icon: Calendar,
      hint: 'Class schedule',
      bg: 'from-sky-500 to-sky-700',
    },
    {
      to: '/student/subjects',
      label: 'Subjects',
      icon: BookOpen,
      hint: 'My subjects',
      bg: 'from-indigo-500 to-indigo-700',
    },
    {
      to: '/student/leave',
      label: 'Leave',
      icon: FileText,
      hint: 'Apply for leave',
      bg: 'from-rose-500 to-rose-700',
    },
  ];

  return (
    <>
      {/* ─── Mobile Simplified UI ───────────────────────────────────────────── */}
      <div className="md:hidden space-y-5 -mx-4 -mt-4">
        {/* Greeting header */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-700 px-5 pt-6 pb-8 text-white rounded-b-3xl shadow-lg">
          <p className="text-xs font-medium text-emerald-100 uppercase tracking-widest">Student Portal</p>
          <h1 className="text-2xl font-bold mt-1">{user.name}</h1>
          <p className="text-xs text-emerald-100 mt-1">
            {classesMap[user.classId] || user.classId || ''}{user.section ? ` · ${user.section}` : ''}
          </p>
          {/* Stats row */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { label: 'Attendance', value: `${attendancePercentage}%` },
              { label: 'Homework', value: `${homework.length} pending` },
              { label: 'Fees Due', value: pendingFeeAmount > 0 ? `₹${pendingFeeAmount.toLocaleString('en-IN')}` : 'Nil' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/15 backdrop-blur-sm rounded-xl px-2 py-2 text-center">
                <p className="text-sm font-bold">{value}</p>
                <p className="text-[9px] text-white/70 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Action tiles */}
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

        {/* Latest notices */}
        {notices.length > 0 && (
          <div className="px-4 pb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-emerald-600" />
                Notices
              </h3>
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
        title={`Hello, ${user.name}!`}
        subtitle="Welcome to your student portal. Check your latest updates below."
        icon={BookOpen}
        iconColor="gradient-emerald"
        actions={
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Class</p>
            <p className="text-sm font-bold text-emerald-600">{classesMap[user.classId] || user.classId || 'N/A'} - {user.section || 'N/A'}</p>
          </div>
        }
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Attendance"
          value={`${attendancePercentage}%`}
          icon={TrendingUp}
          gradient="gradient-emerald"
          index={0}
        />
        <StatCard
          label="Active Homework"
          value={`${homework.length} Active`}
          icon={CheckSquare}
          gradient="gradient-blue"
          index={1}
        />
        <StatCard
          label="Fees Due"
          value={`₹${(pendingFeeAmount || 0).toLocaleString()}`}
          icon={CreditCard}
          gradient="bg-gradient-to-br from-red-500 to-rose-600"
          index={2}
        />
      </div>

      <UpdatesSection user={user} className="mb-8" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Homework Tracking */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                Upcoming Homework
              </h3>
              <Link to="/student/homework" className="text-sm text-emerald-600 font-medium hover:underline">View All</Link>
            </div>
            <div className="space-y-3">
              {homework.length > 0 ? homework.map((hw) => (
                <div key={hw.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-100">
                  <div className="flex items-center gap-4">
                    <Avatar name={hw.subjectId} size="sm" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{hw.content}</h4>
                      <p className="text-xs text-slate-500">{hw.subjectId} • Due {hw.dueDate}</p>
                    </div>
                  </div>
                  <Badge variant="warning">pending</Badge>
                </div>
              )) : (
                <EmptyState
                  icon={CheckSquare}
                  title="No pending homework"
                  description="You're all caught up!"
                />
              )}
            </div>
          </Card>

          {/* Recent Notices */}
          <Card>
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Bell className="w-5 h-5 text-emerald-600" />
              School Notices
            </h3>
            <div className="space-y-6">
              {notices.length > 0 ? notices.map((notice) => (
                <div key={notice.id} className="relative pl-6 border-l-2 border-emerald-100">
                  <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-bold text-slate-900">{notice.title}</h4>
                    <span className="text-xs text-slate-400">{new Date(notice.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{notice.content}</p>
                </div>
              )) : (
                <EmptyState
                  icon={Bell}
                  title="No recent notices"
                  description="Nothing new from the school."
                />
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar: Timetable & Fee */}
        <div className="space-y-8">
          {/* Today's Timetable */}
          <Card>
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              Today's Schedule
            </h3>
            <p className="text-sm text-slate-400 italic text-center py-4">Check your full timetable for details.</p>
            <Link
              to="/student/timetable"
              className="w-full mt-2 py-2 text-sm font-bold text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              Full Timetable
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Card>

          {/* Fee Status Card */}
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-6 rounded-2xl text-white shadow-xl shadow-emerald-600/20">
            <div className="flex items-center justify-between mb-6">
              <CreditCard className="w-6 h-6 opacity-50" />
              <Badge variant="default" className="bg-white/20 text-white border-0 text-[10px] uppercase tracking-widest">
                {feeRequests.length > 0 ? 'Pending' : 'Up to date'}
              </Badge>
            </div>
            <p className="text-xs opacity-80">Outstanding Balance</p>
            <h2 className="text-3xl font-bold mt-1">₹{(pendingFeeAmount || 0).toLocaleString()}</h2>
            {feeRequests.length > 0 && (
              <p className="text-[10px] mt-4 opacity-70">Next Due Date: {feeRequests[0].dueDate}</p>
            )}
            <Link
              to="/student/fees"
              className="block w-full mt-6 py-2.5 bg-white text-emerald-600 rounded-xl text-sm font-bold text-center hover:bg-emerald-50 transition-all"
            >
              View Fee Details
            </Link>
          </div>
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
        label="Student AI"
        greeting={`Hi ${user.name}! I can see your attendance, fee status, homework, and exam results. What would you like to know?`}
        contextBuilder={() => buildStudentContext(user.studentId || user.uid, user.classId || '')}
        placeholder="Ask about your fees, attendance, results…"
        suggestedPrompts={[
          'What is my current attendance percentage?',
          'Do I have any pending fee payments?',
          'What homework is due soon?',
          'How did I perform in my recent exams?',
          'Am I at risk of attendance shortage?',
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
