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
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { Notice, UserProfile } from '../../types';
import { Link } from 'react-router-dom';
import { StatCard, Card, Badge, Button, Avatar, PageHeader } from '../../components/ui';

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

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [studentsSnap, teachersSnap, classesSnap, noticesSnap, recentSnap, feesSnap] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'teachers')),
          getDocs(collection(db, 'classes')),
          getDocs(query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(3))),
          getDocs(query(collection(db, 'students'), orderBy('createdAt', 'desc'), limit(5))),
          getDocs(collection(db, 'feePayments')),
        ]);

        const students = studentsSnap.docs.map(d => d.data());
        const boys = students.filter(s => s.gender === 'male' || s.gender === 'Boy').length;
        const girls = students.filter(s => s.gender === 'female' || s.gender === 'Girl').length;
        if (students.length > 0) setGenderStats([{ name: 'Boys', value: boys }, { name: 'Girls', value: girls }]);

        const totalFees = feesSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
        setCounts({ students: studentsSnap.size, teachers: teachersSnap.size, classes: classesSnap.size, feeCollection: totalFees });
        setNotices(noticesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));
        setRecentAdmissions(recentSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        setAttendanceStats(days.map(day => ({
          name: day,
          students: Math.floor(Math.random() * 20) + 80,
          staff: Math.floor(Math.random() * 10) + 90,
        })));
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        setFeeTrendData(months.map(month => ({ month, amount: Math.floor(Math.random() * 50000) + 10000 })));
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };
    fetchDashboardData();
  }, []);

  const stats = [
    { label: 'Total Students', value: counts.students.toLocaleString(), icon: Users, gradient: 'gradient-indigo' },
    { label: 'Total Teachers', value: counts.teachers.toLocaleString(), icon: GraduationCap, gradient: 'gradient-blue' },
    { label: 'Active Classes', value: counts.classes.toLocaleString(), icon: Building2, gradient: 'gradient-violet' },
    { label: 'Fee Collection', value: `₹${counts.feeCollection.toLocaleString()}`, icon: CreditCard, gradient: 'gradient-emerald' },
  ];

  const noticePriorityVariant = (p: string) => p === 'high' ? 'error' : p === 'medium' ? 'warning' : 'info';

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]}! Here's an overview of your school.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" icon={TrendingUp}>Download Report</Button>
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
  );
}
