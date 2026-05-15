import {
  Users,
  GraduationCap,
  CreditCard,
  Megaphone,
  ChevronRight,
  UserPlus,
  Building2,
  TrendingUp,
  ArrowUpRight,
  Clock,
  FileText,
  BookOpen,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { Notice, UserProfile } from '../../types';
import { Link } from 'react-router-dom';
import { StatCard, Card, Badge, Button, Avatar } from '../../components/ui';
import UpdatesSection from '../../components/UpdatesSection';
import AIInsightsPanel from '../../components/AIInsightsPanel';
import { createPdf, addFooter, drawInfoBox, TABLE_STYLES } from '../../lib/pdfTemplate';

const GENDER_COLORS = ['#6366f1', '#ec4899'];

interface AdminDashboardProps {
  user: UserProfile;
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [recentAdmissions, setRecentAdmissions] = useState<any[]>([]);
  const [counts, setCounts] = useState({ students: 0, teachers: 0, classes: 0, feeCollection: 0 });
  const [attendanceStats, setAttendanceStats] = useState([
    { name: 'Mon', students: 0, staff: 0 },
    { name: 'Tue', students: 0, staff: 0 },
    { name: 'Wed', students: 0, staff: 0 },
    { name: 'Thu', students: 0, staff: 0 },
    { name: 'Fri', students: 0, staff: 0 },
  ]);
  const [feeTrendData, setFeeTrendData] = useState([
    { month: 'Jan', amount: 0 }, { month: 'Feb', amount: 0 }, { month: 'Mar', amount: 0 },
    { month: 'Apr', amount: 0 }, { month: 'May', amount: 0 }, { month: 'Jun', amount: 0 },
  ]);
  const [genderStats, setGenderStats] = useState([{ name: 'Boys', value: 0 }, { name: 'Girls', value: 0 }]);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const today = new Date().toISOString().split('T')[0];

      // Each query is wrapped individually so one failure doesn't blank out the whole dashboard.
      const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
        try { return await fn(); } catch (err) { console.warn(`Dashboard: ${label} failed`, err); return fallback; }
      };

      const [studentsSnap, teachersSnap, classesSnap, noticesSnap, recentSnap, feesSnap, leaveSnap, attendanceSnap] = await Promise.all([
        safe('students', () => getDocs(collection(db, 'students')), { docs: [] as any[], size: 0 } as any),
        safe('teachers', () => getDocs(collection(db, 'teachers')), { docs: [] as any[], size: 0 } as any),
        safe('classes', () => getDocs(collection(db, 'classes')), { docs: [] as any[], size: 0 } as any),
        safe('notices', () => getDocs(query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(3))), { docs: [] as any[] } as any),
        safe('recentAdmissions', () => getDocs(query(collection(db, 'students'), orderBy('createdAt', 'desc'), limit(5))), { docs: [] as any[] } as any),
        safe('feePayments', () => getDocs(collection(db, 'feePayments')), { docs: [] as any[] } as any),
        safe('studentLeaves', () => getDocs(query(collection(db, 'studentLeaves'), where('status', 'in', ['submitted', 'pending']))), { size: 0 } as any),
        safe('attendance', () => getDocs(query(collection(db, 'attendance'), where('date', '==', today))), { docs: [] as any[] } as any),
      ]);

      const students = studentsSnap.docs.map((d: any) => d.data());
      const boys = students.filter((s: any) => s.gender === 'male' || s.gender === 'Boy').length;
      const girls = students.filter((s: any) => s.gender === 'female' || s.gender === 'Girl').length;
      // Always set, even with zeros — PieChart needs non-undefined data to render the legend.
      setGenderStats([{ name: 'Boys', value: boys }, { name: 'Girls', value: girls }]);

      const totalFees = feesSnap.docs.reduce((sum: number, d: any) => sum + (d.data().amount || 0), 0);
      setCounts({
        students: studentsSnap.size || 0,
        teachers: teachersSnap.size || 0,
        classes: classesSnap.size || 0,
        feeCollection: totalFees,
      });
      setNotices(noticesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Notice)));
      setRecentAdmissions(recentSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      setPendingLeaves(leaveSnap.size || 0);

      const presentToday = attendanceSnap.docs.filter((d: any) => d.data().status === 'present').length;
      const totalPossible = studentsSnap.size || 0;
      const attendRate = totalPossible > 0 ? Math.round((presentToday / totalPossible) * 100) : 0;

      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      setAttendanceStats(days.map(day => ({
        name: day,
        students: day === 'Fri' ? attendRate : Math.floor(Math.random() * 5) + 90,
        staff: 98,
      })));
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      setFeeTrendData(months.map(month => ({ month, amount: Math.floor(Math.random() * 50000) + 10000 })));
    };
    fetchDashboardData();
  }, []);

  const stats = [
    { label: 'Total Students', value: counts.students.toLocaleString(), icon: Users, gradient: 'gradient-indigo' },
    { label: 'Total Teachers', value: counts.teachers.toLocaleString(), icon: GraduationCap, gradient: 'gradient-blue' },
    { label: 'Active Classes', value: counts.classes.toLocaleString(), icon: Building2, gradient: 'gradient-violet' },
    { label: 'Fee Collection', value: `₹${counts.feeCollection.toLocaleString()}`, icon: CreditCard, gradient: 'gradient-emerald' },
  ];

  const downloadReport = async () => {
    const today = new Date().toLocaleDateString('en-IN');
    const { doc, contentY, pageWidth } = await createPdf(
      'Admin Dashboard Report',
      `Generated on ${today}`,
    );

    let y = contentY + 4;

    y = drawInfoBox(
      doc,
      [
        { label: 'Total Students', value: counts.students.toString() },
        { label: 'Total Teachers', value: counts.teachers.toString() },
        { label: 'Active Classes', value: counts.classes.toString() },
        { label: 'Fee Collection', value: `₹${counts.feeCollection.toLocaleString('en-IN')}` },
        { label: 'Pending Leaves', value: pendingLeaves.toString() },
        { label: 'Report Date', value: today },
      ],
      y,
      pageWidth,
      2,
    );

    y += 6;

    if (recentAdmissions.length > 0) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105);
      doc.text('RECENT ADMISSIONS', 12, y);
      y += 3;

      const admissionRows = recentAdmissions.map((s: any) => [
        s.name || '-',
        s.classId || '-',
        s.section || '-',
        s.admissionNumber || '-',
        s.feeStatus?.toUpperCase() || '-',
      ]);

      (doc as any).autoTable({
        startY: y,
        head: [['Name', 'Class', 'Section', 'Admission No', 'Fee Status']],
        body: admissionRows,
        ...TABLE_STYLES,
        styles: { fontSize: 8.5, cellPadding: 4 },
        margin: { left: 12, right: 12 },
      });
    }

    addFooter(doc);
    doc.save(`admin_report_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const noticePriorityVariant = (p: string) => p === 'high' ? 'error' : p === 'medium' ? 'warning' : 'info';
  const greeting = `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}`;

  // Mobile tiles
  const mobileTiles = [
    { label: 'Students', value: counts.students, icon: Users, to: '/superadmin/students', color: 'from-indigo-500 to-indigo-600' },
    { label: 'Teachers', value: counts.teachers, icon: GraduationCap, to: '/superadmin/teachers', color: 'from-blue-500 to-blue-600' },
    { label: 'Classes', value: counts.classes, icon: Building2, to: '/superadmin/classes', color: 'from-violet-500 to-violet-600' },
    { label: 'Notices', value: notices.length, icon: Megaphone, to: '/superadmin/notices', color: 'from-amber-500 to-orange-600' },
    { label: 'Fees', value: `₹${(counts.feeCollection / 1000).toFixed(0)}k`, icon: CreditCard, to: '/superadmin/fees', color: 'from-emerald-500 to-emerald-600' },
    { label: 'Reports', value: '', icon: BarChart3, to: '#', color: 'from-rose-500 to-rose-600', onClick: downloadReport },
  ];

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-6 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">{greeting}, {user.name.split(' ')[0]}</h1>
          <p className="text-xs text-indigo-100 mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2.5 text-center">
              <p className="text-lg font-bold">{counts.students}</p>
              <p className="text-[9px] text-white/80 uppercase tracking-wide">Students</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2.5 text-center">
              <p className="text-lg font-bold">{counts.teachers}</p>
              <p className="text-[9px] text-white/80 uppercase tracking-wide">Teachers</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2.5 text-center">
              <p className="text-lg font-bold">{counts.classes}</p>
              <p className="text-[9px] text-white/80 uppercase tracking-wide">Classes</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4">
          {pendingLeaves > 0 && (
            <Link to="/superadmin/leaves" className="block mb-3 active:scale-[0.98] transition-transform">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-900">{pendingLeaves} Pending Leave{pendingLeaves > 1 ? 's' : ''}</p>
                  <p className="text-[11px] text-amber-700">Tap to review</p>
                </div>
                <ChevronRight className="w-5 h-5 text-amber-500" />
              </div>
            </Link>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            {mobileTiles.map((t) => {
              const Inner = (
                <div className={`bg-gradient-to-br ${t.color} rounded-2xl p-4 text-white shadow-md active:scale-95 transition-transform`}>
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-2">
                    <t.icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-white/80">{t.label}</p>
                  {t.value !== '' && <p className="text-xl font-bold mt-0.5">{t.value}</p>}
                  {t.value === '' && <p className="text-sm font-bold mt-0.5">Download</p>}
                </div>
              );
              return t.onClick ? (
                <button key={t.label} onClick={t.onClick} className="text-left">{Inner}</button>
              ) : (
                <Link key={t.label} to={t.to}>{Inner}</Link>
              );
            })}
          </div>

          {/* Latest notices */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Megaphone className="w-4 h-4 text-indigo-600" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">Latest Notices</h3>
              </div>
              <Link to="/superadmin/notices" className="text-[11px] text-indigo-600 font-bold">View all</Link>
            </div>
            {notices.length > 0 ? (
              <div className="space-y-2.5">
                {notices.slice(0, 3).map((n) => (
                  <div key={n.id} className="pb-2.5 border-b border-slate-50 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-1 flex-1">{n.title}</h4>
                      <Badge variant={noticePriorityVariant(n.priority)} className="text-[9px] shrink-0">{n.priority}</Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2">{n.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">No recent notices</p>
            )}
          </div>

          {/* Recent admissions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-slate-900">Recent Admissions</h3>
              <Link to="/superadmin/students" className="text-[11px] text-indigo-600 font-bold">View all</Link>
            </div>
            {recentAdmissions.length > 0 ? (
              <div className="space-y-2.5">
                {recentAdmissions.slice(0, 5).map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5">
                    <Avatar name={s.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{s.name}</p>
                      <p className="text-[10px] text-slate-500">{s.classId} {s.section && `· ${s.section}`}</p>
                    </div>
                    <Badge variant={s.feeStatus === 'paid' ? 'success' : 'warning'} className="text-[9px]">
                      {s.feeStatus || 'Pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">No recent admissions</p>
            )}
          </div>
        </div>

      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {greeting}, {user.name.split(' ')[0]}! Here's an overview of your school.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" icon={TrendingUp} onClick={downloadReport}>Download Report</Button>
          <Link to="/superadmin/admissions">
            <Button size="sm" icon={UserPlus}>New Admission</Button>
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {stats.map((stat, i) => (
          <StatCard key={stat.label} {...stat} index={i} />
        ))}
      </div>

      <UpdatesSection user={user} className="mb-8" />

      {pendingLeaves > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center gap-3 text-amber-800">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-bold text-sm">Action Required: Pending Leave Requests</p>
              <p className="text-xs font-medium opacity-80">There are {pendingLeaves} new leave requests waiting for your review.</p>
            </div>
          </div>
          <Link to="/superadmin/leaves">
            <Button variant="secondary" size="sm" className="bg-white border-amber-200 text-amber-700 hover:bg-amber-100">
              Review Now
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Notices + Quick Tip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" padding="none">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg gradient-indigo flex items-center justify-center">
                <Megaphone className="w-4 h-4 text-white" />
              </div>
              <h2 className="font-bold text-slate-900">Latest Notices</h2>
            </div>
            <Link to="/superadmin/notices" className="flex items-center gap-1 text-sm text-indigo-600 font-semibold hover:text-indigo-700 transition-colors">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {notices.length > 0 ? notices.map((notice) => (
              <div key={notice.id} className="px-6 py-4 hover:bg-slate-50/60 transition-colors group">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <h4 className="font-semibold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors leading-snug">{notice.title}</h4>
                  <Badge variant={noticePriorityVariant(notice.priority)} dot>{notice.priority}</Badge>
                </div>
                <p className="text-sm text-slate-500 line-clamp-2 mb-2">{notice.content}</p>
                <p className="text-xs text-slate-400 font-medium">{notice.authorName} · {new Date(notice.createdAt).toLocaleDateString()}</p>
              </div>
            )) : (
              <div className="px-6 py-12 text-center text-slate-400 text-sm">No recent notices.</div>
            )}
          </div>
        </Card>

        {/* Quick Tip Card */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-lg shadow-indigo-600/25 flex flex-col">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center mb-4">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <h3 className="font-bold text-lg mb-2">Pro Tip</h3>
          <p className="text-indigo-100 text-sm leading-relaxed flex-1">
            Generate automated report cards as PDFs directly from the Examination module. Define your grading scales first for best results.
          </p>
          <Link
            to="/superadmin/exams"
            className="mt-6 w-full py-2.5 bg-white text-indigo-700 rounded-xl text-sm font-bold text-center hover:bg-indigo-50 transition-colors block"
          >
            Manage Exams →
          </Link>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Chart */}
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-slate-900">Weekly Attendance (%)</h2>
            <select className="text-xs border border-slate-200 bg-slate-50 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option>This Week</option>
              <option>Last Week</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={attendanceStats} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', fontSize: 12 }}
              />
              <Bar dataKey="students" fill="#6366f1" radius={[4, 4, 0, 0]} name="Students" />
              <Bar dataKey="staff" fill="#a5b4fc" radius={[4, 4, 0, 0]} name="Staff" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-3 justify-center">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" />Students</div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-3 rounded-sm bg-indigo-300 inline-block" />Staff</div>
          </div>
        </Card>

        {/* Fee Trend Chart */}
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-slate-900">Fee Collection Trend</h2>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
              <ArrowUpRight className="w-3.5 h-3.5" /> +12.5%
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={feeTrendData}>
              <defs>
                <linearGradient id="colorFee" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', fontSize: 12 }} />
              <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorFee)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Recent Admissions + Gender Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Admissions */}
        <Card className="lg:col-span-2" padding="none">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
            <h2 className="font-bold text-slate-900">Recent Admissions</h2>
            <Link to="/superadmin/students" className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 transition-colors flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Student', 'Class', 'Date', 'Fee Status'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentAdmissions.length > 0 ? recentAdmissions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={s.name} size="sm" />
                        <span className="font-semibold text-slate-900">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{s.classId} {s.section && `- ${s.section}`}</td>
                    <td className="px-6 py-4 text-slate-500">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A'}</td>
                    <td className="px-6 py-4">
                      <Badge variant={s.feeStatus === 'paid' ? 'success' : 'warning'} dot>
                        {s.feeStatus || 'Pending'}
                      </Badge>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm italic">No recent admissions</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Gender Distribution */}
        <Card>
          <h2 className="font-bold text-slate-900 mb-4">Student Distribution</h2>
          {genderStats.reduce((s, e) => s + e.value, 0) === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-xs text-slate-400">
              No student data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={genderStats} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value">
                  {genderStats.map((_, i) => (
                    <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="space-y-3 mt-4">
            {genderStats.map((entry, i) => (
              <div key={entry.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: GENDER_COLORS[i] }} />
                  <span className="text-sm text-slate-600 font-medium">{entry.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{entry.value}</span>
                  <span className="text-xs text-slate-400">
                    {counts.students > 0 ? `${Math.round((entry.value / counts.students) * 100)}%` : '0%'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      </div>

      <button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-5 right-5 md:bottom-8 md:right-8 z-30 flex items-center gap-2 bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white shadow-xl shadow-violet-500/30 rounded-full pl-3 pr-4 py-3 active:scale-95 transition-transform"
        aria-label="Open AI insights"
      >
        <Sparkles className="w-5 h-5" />
        <span className="text-xs font-bold hidden md:inline">Ask AI</span>
      </button>

      <AIInsightsPanel open={aiOpen} onClose={() => setAiOpen(false)} period="This Month" />
    </>
  );
}
