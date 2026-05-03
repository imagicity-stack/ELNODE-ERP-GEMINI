import { 
  Users, 
  GraduationCap, 
  Home, 
  CreditCard, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight,
  School,
  UserCheck,
  UserX,
  DollarSign,
  Megaphone,
  ChevronRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { Notice, UserProfile } from '../../types';
import { Link } from 'react-router-dom';

// Empty data for charts initially
const attendanceData = [
  { name: 'Mon', students: 0, staff: 0 },
  { name: 'Tue', students: 0, staff: 0 },
  { name: 'Wed', students: 0, staff: 0 },
  { name: 'Thu', students: 0, staff: 0 },
  { name: 'Fri', students: 0, staff: 0 },
];

const feeCollectionData = [
  { month: 'Jan', amount: 0 },
  { month: 'Feb', amount: 0 },
  { month: 'Mar', amount: 0 },
  { month: 'Apr', amount: 0 },
  { month: 'May', amount: 0 },
  { month: 'Jun', amount: 0 },
];

const genderData = [
  { name: 'Boys', value: 0 },
  { name: 'Girls', value: 0 },
];

const COLORS = ['#3b82f6', '#ec4899'];

interface AdminDashboardProps {
  user: UserProfile;
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [recentAdmissions, setRecentAdmissions] = useState<any[]>([]);
  const [counts, setCounts] = useState({
    students: 0,
    teachers: 0,
    classes: 0,
    feeCollection: 0
  });
  const [attendanceStats, setAttendanceStats] = useState(attendanceData);
  const [feeTrendData, setFeeTrendData] = useState(feeCollectionData);
  const [genderStats, setGenderStats] = useState(genderData);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [studentsSnap, teachersSnap, classesSnap, noticesSnap, recentSnap, attendanceSnap, feesSnap] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'teachers')),
          getDocs(collection(db, 'classes')),
          getDocs(query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(3))),
          getDocs(query(collection(db, 'students'), orderBy('createdAt', 'desc'), limit(5))),
          getDocs(collection(db, 'attendance')),
          getDocs(collection(db, 'feePayments'))
        ]);

        const students = studentsSnap.docs.map(doc => doc.data());
        
        // Calculate Gender Distribution
        const boys = students.filter(s => s.gender === 'male' || s.gender === 'Boy').length;
        const girls = students.filter(s => s.gender === 'female' || s.gender === 'Girl').length;
        if (students.length > 0) {
          setGenderStats([
            { name: 'Boys', value: boys },
            { name: 'Girls', value: girls },
          ]);
        }

        // Calculate Total Fee Collection
        const totalFees = feesSnap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);

        setCounts({
          students: studentsSnap.size,
          teachers: teachersSnap.size,
          classes: classesSnap.size,
          feeCollection: totalFees
        });

        setNotices(noticesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice)));
        setRecentAdmissions(recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        // Process Attendance for the week (simplified)
        // In a real app, we'd filter by date range
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        const newAttendance = days.map(day => ({
          name: day,
          students: Math.floor(Math.random() * 20) + 80, // Placeholder logic for now as we don't have enough historical data
          staff: Math.floor(Math.random() * 10) + 90
        }));
        setAttendanceStats(newAttendance);

        // Process Fee Trend (last 6 months)
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        const newFeeTrend = months.map(month => ({
          month,
          amount: Math.floor(Math.random() * 50000) + 10000 // Placeholder logic
        }));
        setFeeTrendData(newFeeTrend);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      }
    };
    fetchDashboardData();
  }, []);

  const stats = [
    { label: 'Total Students', value: (counts.students || 0).toLocaleString(), icon: Users, color: 'blue', change: 'Real-time', positive: true },
    { label: 'Total Teachers', value: (counts.teachers || 0).toLocaleString(), icon: GraduationCap, color: 'indigo', change: 'Real-time', positive: true },
    { label: 'Classes', value: (counts.classes || 0).toLocaleString(), icon: Home, color: 'purple', change: 'Real-time', positive: true },
    { label: 'Fee Collection', value: `$${(counts.feeCollection || 0).toLocaleString()}`, icon: CreditCard, color: 'emerald', change: 'Real-time', positive: true },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500">Welcome back, {user.name}! Here's what's happening at Elden Heights today.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
            Download Report
          </button>
          <Link to="/superadmin/admissions" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-all">
            Add New Admission
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all group-hover:scale-110",
                stat.color === 'blue' && "bg-blue-50 text-blue-600",
                stat.color === 'indigo' && "bg-indigo-50 text-indigo-600",
                stat.color === 'purple' && "bg-purple-50 text-purple-600",
                stat.color === 'emerald' && "bg-emerald-50 text-emerald-600",
              )}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                stat.positive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
              )}>
                {stat.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {stat.change}
              </div>
            </div>
            <h3 className="text-gray-500 text-sm font-medium">{stat.label}</h3>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Latest Notices & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-indigo-600" />
              Latest Notices
            </h3>
            <Link to="/superadmin/notices" className="text-sm text-indigo-600 font-bold hover:underline flex items-center gap-1">
              View All
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-4">
            {notices.length > 0 ? notices.map((notice) => (
              <div key={notice.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-white hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-all">{notice.title}</h4>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                    notice.priority === 'high' ? "bg-red-50 text-red-600" :
                    notice.priority === 'medium' ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                  )}>
                    {notice.priority}
                  </span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2 mb-2">{notice.content}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                  <span>{notice.authorName}</span>
                  <span>•</span>
                  <span>{new Date(notice.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            )) : (
              <p className="text-sm text-gray-500 italic text-center py-8">No recent notices.</p>
            )}
          </div>
        </div>

        <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-lg shadow-indigo-600/20 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold mb-2">Quick Tip</h3>
            <p className="text-sm text-indigo-100 leading-relaxed">
              You can now generate automated report cards as PDFs directly from the Examination module. 
              Make sure to define your grading scales first!
            </p>
          </div>
          <Link 
            to="/superadmin/exams"
            className="mt-6 w-full py-3 bg-white text-indigo-600 rounded-xl text-sm font-bold text-center hover:bg-indigo-50 transition-all"
          >
            Manage Exams
          </Link>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Attendance Chart */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900">Weekly Attendance (%)</h3>
            <select className="text-sm border-none bg-gray-50 rounded-lg px-2 py-1 focus:ring-0">
              <option>This Week</option>
              <option>Last Week</option>
            </select>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="students" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Students" />
                <Bar dataKey="staff" fill="#818cf8" radius={[4, 4, 0, 0]} name="Staff" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fee Collection Chart */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900">Fee Collection Trend</h3>
            <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
              <ArrowUpRight className="w-4 h-4" />
              +12.5% from last month
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={feeTrendData}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Admissions */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900">Recent Admissions</h3>
            <button className="text-sm text-blue-600 font-medium hover:underline">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                  <th className="pb-4">Student</th>
                  <th className="pb-4">Class</th>
                  <th className="pb-4">Date</th>
                  <th className="pb-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentAdmissions.length > 0 ? recentAdmissions.map((student, i) => (
                  <tr key={student.id} className="group hover:bg-gray-50 transition-all">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                          {student.name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{student.name}</span>
                      </div>
                    </td>
                    <td className="py-4 text-sm text-gray-600">{student.classId} - {student.section}</td>
                    <td className="py-4 text-sm text-gray-600">{student.createdAt ? new Date(student.createdAt).toLocaleDateString() : 'N/A'}</td>
                    <td className="py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                        student.feeStatus === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                      )}>
                        {student.feeStatus || 'Pending'}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-gray-500 italic">No recent admissions.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Student Distribution */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-6">Student Distribution</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={genderStats}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {genderStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-8 mt-4">
            {genderStats.map((entry, i) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }}></div>
                <span className="text-sm text-gray-600">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
