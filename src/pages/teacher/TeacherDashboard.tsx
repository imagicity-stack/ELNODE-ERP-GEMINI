import {
  Users,
  BookOpen,
  CheckSquare,
  Clock,
  Calendar,
  Bell,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Sparkles,
  PenLine,
} from 'lucide-react';
import { UserProfile, Teacher, Attendance, Homework, Notice, Timetable, TimetableConfig, Exam } from '../../types';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { useData } from '../../contexts/DataContext';
import { Spinner } from '../../components/ui';
import AIInsightsPanel from '../../components/AIInsightsPanel';
import { buildTeacherContext } from '../../lib/aiContext';
import { nameFrom } from '../../lib/displayNames';

interface TeacherDashboardProps {
  user: UserProfile;
}

export default function TeacherDashboard({ user }: TeacherDashboardProps) {
  const { teacherData, timetableConfig: config, notices, subjectsMap: subjects, classesMap: classes, loading: globalLoading } = useData();
  const [attendanceCount, setAttendanceCount] = useState({ marked: 0, total: 0 });
  const [pendingHomework, setPendingHomework] = useState<Homework[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [classPerformance, setClassPerformance] = useState<Record<string, { avg: number, trend: number }>>({});
  const [localLoading, setLocalLoading] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!teacherData) return;

      setLocalLoading(true);
      try {
        const teacherIdForFetch = teacherData.id;

        let totalStudentsCount = 0;
        if (teacherData.classes && teacherData.classes.length > 0) {
          const studentsSnap = await getDocs(query(
            collection(db, 'students'),
            where('classId', 'in', teacherData.classes)
          ));
          totalStudentsCount = studentsSnap.size;
        }

        const today = new Date().toISOString().split('T')[0];
        const attendanceSnap = await getDocs(query(
          collection(db, 'attendance'),
          where('date', '==', today),
          where('status', '==', 'present')
        ));

        setAttendanceCount({ marked: attendanceSnap.size, total: totalStudentsCount });

        const homeworkSnap = await getDocs(query(
          collection(db, 'homework'),
          where('teacherId', '==', teacherIdForFetch),
          orderBy('dueDate', 'desc'),
          limit(5)
        ));
        setPendingHomework(homeworkSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Homework)));

        const ttSnap = await getDocs(collection(db, 'timetable'));
        const allTimetables = ttSnap.docs.map(d => d.data() as Timetable);
        const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const teachersSchedule: any[] = [];

        allTimetables.forEach(tt => {
          const daySchedule = tt.schedule.find(s => s.day === dayName);
          if (daySchedule) {
            const myPeriods = daySchedule.periods
              .filter(p => p.teacherId === teacherIdForFetch)
              .map(p => ({ ...p, classId: tt.classId }));
            teachersSchedule.push(...myPeriods);
          }
        });

        setSchedule(teachersSchedule);

        const examsSnap = await getDocs(query(
          collection(db, 'exams'),
          where('status', '==', 'scheduled'),
          orderBy('startDate', 'asc'),
          limit(3)
        ));
        setExams(examsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)));

        const performanceData: Record<string, { avg: number, trend: number }> = {};
        if (teacherData.classes && teacherData.classes.length > 0) {
          for (const cls of teacherData.classes) {
            try {
              const resultsSnap = await getDocs(query(
                collection(db, 'examResults'),
                where('classId', '==', cls)
              ));
              if (!resultsSnap.empty) {
                const totalPercentage = resultsSnap.docs.reduce((acc, doc) => acc + (doc.data().percentage || 0), 0);
                performanceData[cls] = {
                  avg: Math.round(totalPercentage / resultsSnap.size),
                  trend: 5
                };
              }
            } catch (e) {
              console.error(`Performance fetch error for class ${cls}:`, e);
            }
          }
        }
        setClassPerformance(performanceData);

      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLocalLoading(false);
      }
    };

    fetchDashboardData();
  }, [teacherData]);

  if (globalLoading && !teacherData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Spinner size="lg" />
        <p className="muted text-sm animate-pulse">Initializing dashboard...</p>
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  const quickActions = [
    { to: '/teacher/attendance', label: 'Attendance', icon: ClipboardCheck },
    { to: '/teacher/timetable', label: 'Timetable', icon: Calendar },
    { to: '/teacher/exams', label: 'Exams', icon: FileText },
    { to: '/teacher/homework', label: 'Homework', icon: PenLine },
    { to: '/teacher/classes', label: 'Classes', icon: GraduationCap },
    { to: '/teacher/notes', label: 'Notes', icon: BookOpen },
  ];

  return (
    <>
      <div className="topbar">
        <div className="pad">
          <p className="eyebrow mobile-only">{todayName}</p>
          <h1 className="display">{greeting}, {user.name?.split(' ')[0]}</h1>
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: '2rem' }}>
        <div className="stack">
          {/* Hero ink card */}
          <div
            className="card"
            style={{ background: 'var(--ink)', color: 'var(--cream)', padding: '1.5rem' }}
          >
            <p className="eyebrow" style={{ color: 'var(--cream)', opacity: 0.6 }}>
              Today · {todayName}
            </p>
            <p className="t-num" style={{ fontSize: '3rem', lineHeight: 1, marginTop: '0.25rem', color: 'var(--accent)' }}>
              {schedule.length}
            </p>
            <p className="text-sm font-semibold" style={{ marginTop: '0.25rem', opacity: 0.85 }}>
              {schedule.length === 1 ? 'class' : 'classes'} today
            </p>
            <p className="text-xs" style={{ marginTop: '0.75rem', opacity: 0.6 }}>
              {attendanceCount.total} students total
            </p>
          </div>

          {/* Two-col stat row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="card" style={{ padding: '1rem' }}>
              <p className="eyebrow">Attendance</p>
              <p className="t-num" style={{ fontSize: '1.75rem', marginTop: '0.25rem' }}>
                {attendanceCount.marked}
              </p>
              <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                present today
              </p>
            </div>
            <div className="card" style={{ padding: '1rem' }}>
              <p className="eyebrow">Homework</p>
              <p className="t-num" style={{ fontSize: '1.75rem', marginTop: '0.25rem' }}>
                {pendingHomework.length}
              </p>
              <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                assigned
              </p>
            </div>
          </div>

          {/* Quick-action tiles */}
          <div>
            <p className="section-head">Quick Access</p>
            <div className="hscroll" style={{ gap: '0.5rem', paddingBottom: '0.5rem' }}>
              {quickActions.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="card"
                  style={{
                    minWidth: '5rem',
                    padding: '0.875rem 0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem',
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.8} style={{ color: 'var(--ink)' }} />
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--ink)', textAlign: 'center' }}>
                    {label}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Upcoming homework */}
          {pendingHomework.length > 0 && (
            <div>
              <p className="section-head">Recent Homework</p>
              <div className="stack" style={{ gap: '0.5rem' }}>
                {pendingHomework.slice(0, 3).map((hw) => (
                  <Link
                    key={hw.id}
                    to="/teacher/homework"
                    className="card"
                    style={{ padding: '0.875rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none' }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {hw.content}
                      </p>
                      <p className="muted" style={{ fontSize: '0.7rem', marginTop: '0.125rem' }}>
                        {nameFrom(classes, hw.classId)} · {nameFrom(subjects, hw.subjectId)}
                      </p>
                    </div>
                    <p className="muted mono tiny" style={{ marginLeft: '0.75rem', flexShrink: 0 }}>
                      {new Date(hw.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Notice strip */}
          {notices.length > 0 && (
            <div>
              <p className="section-head">Staff Notices</p>
              <div className="stack" style={{ gap: '0.5rem' }}>
                {notices.slice(0, 2).map((notice) => (
                  <div
                    key={notice.id}
                    className="card"
                    style={{
                      padding: '0.875rem',
                      borderLeft: '3px solid var(--coral)',
                    }}
                  >
                    <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--ink)' }}>
                      {notice.title}
                    </p>
                    <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {notice.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating AI button */}
      <button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-24 right-5 lg:bottom-6 lg:right-6 z-30 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg"
        style={{ background: 'var(--ink)', color: 'var(--cream)' }}
        aria-label="Open AI Insights"
      >
        <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <span className="hidden sm:inline text-sm font-bold">AI Insights</span>
      </button>

      <AIInsightsPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        label="Teacher AI"
        greeting={`Hi ${user.name}! I've loaded your class data. Ask me about attendance, homework, student performance, or upcoming exams.`}
        contextBuilder={() => buildTeacherContext(teacherData?.id || '', teacherData?.classes || [])}
        placeholder="Ask about attendance, homework, exams…"
        suggestedPrompts={[
          'How is attendance looking across my classes today?',
          'Which homework assignments are due soon?',
          'Summarise my students\' exam performance.',
          'Are there any upcoming exams I should prepare for?',
          'Which class has the lowest average score?',
        ]}
        summaryRenderer={(ctx) => ctx?.summary ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="bg-blue-50 rounded-lg p-2">
              <p className="text-[9px] text-blue-700 font-bold uppercase">Classes</p>
              <p className="text-xs font-black text-blue-800 mt-0.5">{ctx.summary.classCount}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2">
              <p className="text-[9px] text-emerald-700 font-bold uppercase">Students</p>
              <p className="text-xs font-black text-emerald-800 mt-0.5">{ctx.summary.studentCount}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-2">
              <p className="text-[9px] text-amber-700 font-bold uppercase">Homework</p>
              <p className="text-xs font-black text-amber-800 mt-0.5">{ctx.summary.homeworkAssigned}</p>
            </div>
          </div>
        ) : null}
      />
    </>
  );
}
