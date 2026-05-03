import {
  Users,
  BookOpen,
  CheckSquare,
  Clock,
  Calendar,
  TrendingUp,
  Bell,
  ArrowRight,
  ClipboardCheck,
  FileText
} from 'lucide-react';
import { UserProfile, Teacher, Attendance, Homework, Notice, Timetable } from '../../types';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  Button,
  EmptyState,
} from '../../components/ui';

interface TeacherDashboardProps {
  user: UserProfile;
}

export default function TeacherDashboard({ user }: TeacherDashboardProps) {
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [attendanceCount, setAttendanceCount] = useState({ marked: 0, total: 0 });
  const [pendingHomework, setPendingHomework] = useState<Homework[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [classPerformance, setClassPerformance] = useState<Record<string, { avg: number, trend: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch Teacher Profile
        const teacherDoc = await getDoc(doc(db, 'teachers', user.uid));
        if (teacherDoc.exists()) {
          const tData = { id: teacherDoc.id, ...teacherDoc.data() } as Teacher;
          setTeacherData(tData);

          // Fetch Total Students in Teacher's Classes
          let totalStudentsCount = 0;
          if (tData.classes && tData.classes.length > 0) {
            const studentsSnap = await getDocs(query(
              collection(db, 'students'),
              where('classId', 'in', tData.classes)
            ));
            totalStudentsCount = studentsSnap.size;
          }

          // Fetch Today's Attendance Summary
          const today = new Date().toISOString().split('T')[0];
          const attendanceSnap = await getDocs(query(
            collection(db, 'attendance'),
            where('date', '==', today),
            where('status', '==', 'present')
          ));

          // Filter attendance by teacher's students (simplified)
          setAttendanceCount({ marked: attendanceSnap.size, total: totalStudentsCount });

          // Fetch Pending Homework
          const homeworkSnap = await getDocs(query(
            collection(db, 'homework'),
            where('teacherId', '==', user.uid),
            orderBy('dueDate', 'desc'),
            limit(5)
          ));
          setPendingHomework(homeworkSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Homework)));

          // Fetch Schedule (Simplified: looking at timetable for first class)
          if (tData.classes && tData.classes.length > 0) {
            const timetableSnap = await getDocs(query(
              collection(db, 'timetable'),
              where('classId', '==', tData.classes[0])
            ));
            if (!timetableSnap.empty) {
              const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
              const timetable = timetableSnap.docs[0].data() as Timetable;
              const todaySchedule = timetable.schedule.find(s => s.day === dayName);
              if (todaySchedule) {
                setSchedule(todaySchedule.periods.filter(p => p.teacherId === user.uid));
              }
            }

            // Fetch Class Performance (Exam Results)
            const performanceData: Record<string, { avg: number, trend: number }> = {};
            for (const cls of tData.classes) {
              const resultsSnap = await getDocs(query(
                collection(db, 'examResults'),
                where('classId', '==', cls)
              ));
              if (!resultsSnap.empty) {
                const totalPercentage = resultsSnap.docs.reduce((acc, doc) => acc + (doc.data().percentage || 0), 0);
                performanceData[cls] = {
                  avg: Math.round(totalPercentage / resultsSnap.size),
                  trend: 5 // Placeholder trend
                };
              }
            }
            setClassPerformance(performanceData);
          }
        }

        // Fetch Notices
        const noticesSnap = await getDocs(query(
          collection(db, 'notices'),
          where('targetRoles', 'array-contains', 'teacher'),
          orderBy('createdAt', 'desc'),
          limit(3)
        ));
        setNotices(noticesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice)));

      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user.uid]);

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <PageHeader
        title={`Welcome, ${user.name}!`}
        subtitle="Check your schedule and manage your classes below."
        icon={Users}
        iconColor="gradient-blue"
        actions={
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Role</p>
            <p className="text-sm font-bold text-emerald-600">{user.role}</p>
          </div>
        }
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Total Classes"
          value={teacherData?.classes?.length || 0}
          icon={BookOpen}
          gradient="gradient-blue"
          index={0}
        />
        <StatCard
          label="Attendance Marked"
          value={attendanceCount.marked}
          icon={ClipboardCheck}
          gradient="gradient-emerald"
          index={1}
        />
        <StatCard
          label="Active Homework"
          value={pendingHomework.length}
          icon={CheckSquare}
          gradient="gradient-amber"
          index={2}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Today's Schedule */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                Today's Schedule
              </h3>
              <Link to="/teacher/timetable" className="text-sm text-blue-600 font-medium hover:underline">View Full</Link>
            </div>
            <div className="space-y-4">
              {schedule.length > 0 ? schedule.map((period, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl group hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-600 flex flex-col items-center justify-center text-[10px] font-bold leading-tight">
                      <span>{period.time.split(' - ')[0]}</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{period.subjectId}</h4>
                      <p className="text-xs text-slate-500">{period.time}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      to="/teacher/attendance"
                      className="px-3 py-1 bg-emerald-600 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-emerald-700"
                    >
                      Mark Attendance
                    </Link>
                  </div>
                </div>
              )) : (
                <EmptyState
                  icon={Clock}
                  title="No classes today"
                  description="No classes are scheduled for today."
                />
              )}
            </div>
          </Card>

          {/* Homework to Review */}
          <Card>
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-blue-500" />
              Recent Homework
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pendingHomework.map((hw) => (
                <div key={hw.id} className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="info">{hw.subjectId}</Badge>
                    <span className="text-[10px] text-slate-400">{new Date(hw.dueDate).toLocaleDateString()}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-3 line-clamp-1">{hw.content}</h4>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500">{hw.submissions?.length || 0} Submissions</span>
                    <Link to="/teacher/homework" className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600">
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
              {pendingHomework.length === 0 && (
                <div className="col-span-full">
                  <EmptyState
                    icon={FileText}
                    title="No homework assignments"
                    description="No homework assignments found."
                  />
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar: Announcements & Performance */}
        <div className="space-y-8">
          {/* Recent Notices */}
          <Card>
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-500" />
              Staff Notices
            </h3>
            <div className="space-y-6">
              {notices.map((notice) => (
                <div key={notice.id} className="relative pl-6 border-l-2 border-blue-100">
                  <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-blue-500"></div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-bold text-slate-900">{notice.title}</h4>
                    <span className="text-xs text-slate-400">{new Date(notice.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{notice.content}</p>
                </div>
              ))}
              {notices.length === 0 && (
                <EmptyState
                  icon={Bell}
                  title="No recent notices"
                  description="No staff notices at this time."
                />
              )}
            </div>
          </Card>

          {/* Class Performance */}
          <Card>
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Class Performance
            </h3>
            <div className="space-y-4">
              {teacherData?.classes?.map((cls, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{cls}</p>
                    <p className="text-[10px] text-slate-400">Average Score: {classPerformance[cls]?.avg || '--'}%</p>
                  </div>
                  <div className={cn(
                    "text-xs font-bold flex items-center gap-1",
                    (classPerformance[cls]?.trend || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                  )}>
                    {classPerformance[cls]?.trend ? `${classPerformance[cls].trend > 0 ? '+' : ''}${classPerformance[cls].trend}%` : '0%'}
                    <TrendingUp className={cn("w-3 h-3", (classPerformance[cls]?.trend || 0) < 0 && "rotate-180")} />
                  </div>
                </div>
              ))}
              {(!teacherData?.classes || teacherData.classes.length === 0) && (
                <EmptyState
                  icon={BookOpen}
                  title="No classes assigned"
                  description="No classes have been assigned yet."
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
