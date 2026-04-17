import { 
  BookOpen, 
  Calendar, 
  CreditCard, 
  CheckSquare, 
  Clock, 
  TrendingUp, 
  FileText,
  Bell,
  ArrowRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile, Notice, Homework, Attendance, FeeRequest } from '../../types';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';

interface StudentDashboardProps {
  user: UserProfile;
}

export default function StudentDashboard({ user }: StudentDashboardProps) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [feeRequests, setFeeRequests] = useState<FeeRequest[]>([]);
  const [loading, setLoading] = useState(true);

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
          where('status', '==', 'pending'),
          limit(1)
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
  const pendingFeeAmount = feeRequests.reduce((sum, f) => sum + (f.totalAmount || 0), 0);

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hello, {user.name}!</h1>
          <p className="text-gray-500">Welcome to your student portal. Check your latest updates below.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Current Class</p>
            <p className="text-sm font-bold text-blue-600">Class {user.classId || 'N/A'} - {user.section || 'N/A'}</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Attendance</p>
            <p className="text-2xl font-bold text-gray-900">{attendancePercentage}%</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <CheckSquare className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Homework</p>
            <p className="text-2xl font-bold text-gray-900">{homework.length} Active</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Fees Due</p>
            <p className="text-2xl font-bold text-gray-900">₹{(pendingFeeAmount || 0).toLocaleString()}</p>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Homework Tracking */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Upcoming Homework
              </h3>
              <Link to="/student/homework" className="text-sm text-blue-600 font-medium hover:underline">View All</Link>
            </div>
            <div className="space-y-4">
              {homework.length > 0 ? homework.map((hw, i) => (
                <div key={hw.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl group hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs bg-blue-100 text-blue-600"
                    )}>
                      {hw.subjectId.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 line-clamp-1">{hw.content}</h4>
                      <p className="text-xs text-gray-500">{hw.subjectId} • Due {hw.dueDate}</p>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-600">
                    pending
                  </span>
                </div>
              )) : (
                <p className="text-sm text-gray-500 italic text-center py-8">No pending homework.</p>
              )}
            </div>
          </div>

          {/* Recent Notices */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-600" />
              School Notices
            </h3>
            <div className="space-y-6">
              {notices.length > 0 ? notices.map((notice, i) => (
                <div key={notice.id} className="relative pl-6 border-l-2 border-blue-100">
                  <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-blue-600"></div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-bold text-gray-900">{notice.title}</h4>
                    <span className="text-xs text-gray-400">{new Date(notice.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{notice.content}</p>
                </div>
              )) : (
                <p className="text-xs text-gray-500 italic text-center py-4">No recent notices.</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Timetable & Fee */}
        <div className="space-y-8">
          {/* Today's Timetable */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Today's Schedule
            </h3>
            <div className="space-y-4">
              <p className="text-sm text-gray-500 italic text-center py-4">Check your full timetable for details.</p>
            </div>
            <Link to="/student/timetable" className="w-full mt-6 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center justify-center gap-2">
              Full Timetable
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Fee Status Card */}
          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-6 rounded-2xl text-white shadow-xl shadow-blue-600/20">
            <div className="flex items-center justify-between mb-6">
              <CreditCard className="w-6 h-6 opacity-50" />
              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/20 px-2 py-1 rounded">
                {feeRequests.length > 0 ? 'Pending' : 'Up to date'}
              </span>
            </div>
            <p className="text-xs opacity-80">Outstanding Balance</p>
            <h2 className="text-3xl font-bold mt-1">₹{(pendingFeeAmount || 0).toLocaleString()}</h2>
            {feeRequests.length > 0 && (
              <p className="text-[10px] mt-4 opacity-70">Next Due Date: {feeRequests[0].dueDate}</p>
            )}
            <Link to="/student/fees" className="block w-full mt-6 py-2.5 bg-white text-blue-600 rounded-lg text-sm font-bold text-center hover:bg-blue-50 transition-all">
              View Fee Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
