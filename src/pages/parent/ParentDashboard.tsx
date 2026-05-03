import { 
  CreditCard, 
  ClipboardCheck, 
  CheckSquare, 
  Bell, 
  UserCircle, 
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Clock,
  FileText,
  Users,
  DollarSign as DollarIcon
} from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile, Student, Notice, FeeRequest, Attendance, Homework, ExamResult } from '../../types';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';

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
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-dashed border-gray-200">
        <Users className="w-12 h-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-bold text-gray-900">No Students Linked</h3>
        <p className="text-gray-500 text-center max-w-xs">
          There are no student profiles linked to this parent account. Please contact the administration.
        </p>
      </div>
    );
  }

  // Calculate Stats
  const pendingFees = feeRequests.filter(f => f.status === 'pending').reduce((sum, f) => sum + f.totalAmount, 0);
  const totalDays = attendance.length;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const attendancePercentage = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : '--';

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parent Dashboard</h1>
          <p className="text-gray-500">Monitoring progress for <span className="text-indigo-600 font-bold">{selectedStudent.name}</span>.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">School Number</p>
            <p className="text-sm font-bold text-indigo-600">{selectedStudent.schoolNumber}</p>
          </div>
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
            <UserCircle className="w-6 h-6" />
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
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Pending Fees</p>
            <p className="text-2xl font-bold text-gray-900">₹{pendingFees}</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Attendance</p>
            <p className="text-2xl font-bold text-gray-900">{attendancePercentage}%</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <CheckSquare className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Homework</p>
            <p className="text-2xl font-bold text-gray-900">{homework.length} Active</p>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Fee Tracking */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                Fee Status & Payments
              </h3>
              <Link to="/parent/fees" className="text-sm text-indigo-600 font-medium hover:underline">View All</Link>
            </div>
            <div className="space-y-4">
              {feeRequests.length > 0 ? feeRequests.map((fee) => (
                <div key={fee.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      fee.status === 'paid' ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                    )}>
                      <DollarIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">{fee.month} Fees</h4>
                      <p className="text-xs text-gray-500">Due: {fee.dueDate} • ₹{fee.totalAmount}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                    fee.status === 'pending' ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                  )}>
                    {fee.status}
                  </span>
                </div>
              )) : (
                <p className="text-sm text-gray-500 italic text-center py-4">No fee records found.</p>
              )}
            </div>
          </div>

          {/* Exam Results */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Recent Exam Results
              </h3>
              <Link to="/parent/exams" className="text-sm text-indigo-600 font-bold hover:underline">View Full Report</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {examResults.length > 0 ? examResults.map((result) => (
                <div key={result.id} className="p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-all">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Overall Result</p>
                  <div className="flex items-end justify-between mt-2">
                    <h4 className="text-xl font-bold text-gray-900">{result.percentage}%</h4>
                    <span className="text-lg font-black text-indigo-600">{result.overallGrade}</span>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-gray-500 italic text-center py-4 col-span-2">No exam results found.</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Attendance & Notices */}
        <div className="space-y-8">
          {/* School Notices */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Bell className="w-5 h-5 text-indigo-600" />
              School Notices
            </h3>
            <div className="space-y-4">
              {notices.length > 0 ? notices.map((notice) => (
                <div key={notice.id} className="p-3 bg-gray-50 rounded-xl border border-transparent hover:border-indigo-100 hover:bg-white hover:shadow-sm transition-all group">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-bold text-gray-900 group-hover:text-indigo-600">{notice.title}</h4>
                    <span className="text-[8px] text-gray-400">{new Date(notice.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 line-clamp-2">{notice.content}</p>
                </div>
              )) : (
                <p className="text-xs text-gray-500 italic text-center py-4">No recent notices.</p>
              )}
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-indigo-600" />
              Attendance Summary
            </h3>
            <div className="flex items-center justify-center mb-6">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full" viewBox="0 0 36 36">
                  <path
                    className="text-gray-100"
                    strokeDasharray="100, 100"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="text-indigo-600"
                    strokeDasharray={`${attendancePercentage}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-gray-900">{attendancePercentage}%</span>
                  <span className="text-[8px] font-bold text-gray-400 uppercase">Present</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Total Days</span>
                <span className="font-bold text-gray-900">{totalDays}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Present</span>
                <span className="font-bold text-emerald-600">{presentDays}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Absent</span>
                <span className="font-bold text-red-600">{totalDays - presentDays}</span>
              </div>
            </div>
          </div>

          {/* Recent Homework */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-indigo-600" />
              Homework Updates
            </h3>
            <div className="space-y-4">
              {homework.length > 0 ? homework.map((hw) => (
                <div key={hw.id} className="p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase">{hw.subjectId}</span>
                    <span className="text-[10px] text-gray-400">{hw.dueDate}</span>
                  </div>
                  <h4 className="text-sm font-bold text-gray-900">{hw.content.substring(0, 50)}...</h4>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                    <span className="text-[10px] font-medium text-gray-500">Due soon</span>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-gray-500 italic text-center py-4">No pending homework.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
