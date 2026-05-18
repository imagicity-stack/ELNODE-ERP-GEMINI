import { useState, useEffect } from 'react';
import { Users, GraduationCap, Briefcase, ClipboardCheck, Zap } from 'lucide-react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile } from '../../types';
import UpdatesSection from '../../components/UpdatesSection';

export default function PrincipalDashboard({ user }: { user: UserProfile }) {
  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    classes: 0,
    attendanceToday: '—',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const [studentSnap, teacherSnap, classSnap, attendanceSnap] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'teachers')),
          getDocs(collection(db, 'classes')),
          getDocs(query(collection(db, 'attendance'), where('date', '==', today))),
        ]);

        const totalStudents = studentSnap.size;
        const present = attendanceSnap.docs.filter(d => d.data().status === 'present').length;
        const pct = totalStudents > 0 ? Math.round((present / totalStudents) * 100) : 0;

        setStats({
          students: totalStudents,
          teachers: teacherSnap.size,
          classes: classSnap.size,
          attendanceToday: `${pct}%`,
        });
      } catch (err) {
        console.error('PrincipalDashboard stats error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const statCards = [
    { label: 'Total Students',    value: stats.students,       icon: Users,          color: 'bg-indigo-600' },
    { label: 'Faculty',           value: stats.teachers,       icon: Briefcase,      color: 'bg-violet-600' },
    { label: 'Classes',           value: stats.classes,        icon: GraduationCap,  color: 'bg-emerald-600' },
    { label: "Today's Attendance", value: stats.attendanceToday, icon: ClipboardCheck, color: 'bg-amber-500' },
  ];

  return (
    <>
      {/* ── Mobile ── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-4 pt-5 pb-6 text-white">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-md bg-indigo-500/30 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-indigo-200 fill-indigo-300" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Principal Portal</p>
          </div>
          <h1 className="text-xl font-bold">Welcome, {(user.name || user.email || 'User').split(' ')[0]}</h1>
          <p className="text-xs text-indigo-100 mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>

          {/* Stat tiles */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {statCards.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/10">
                <Icon className="w-4 h-4 text-white/60 mb-1" />
                <p className="text-lg font-bold leading-tight">
                  {loading ? '…' : value}
                </p>
                <p className="text-[10px] text-white/70 uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Updates feed */}
        <div className="px-4 pt-4">
          <UpdatesSection user={user} />
        </div>

        {loading && (
          <div className="fixed top-0 left-0 right-0 h-0.5 bg-indigo-500 animate-pulse z-50" />
        )}
      </div>

      {/* ── Desktop ── */}
      <div className="hidden md:block space-y-8 pb-12">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Zap className="w-4 h-4 text-indigo-600 fill-indigo-600" />
            </div>
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Principal Dashboard</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">
            Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">{(user.name || user.email || 'User').split(' ')[0]}</span>
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center gap-4"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md ${color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
                <p className="text-3xl font-black text-slate-900 tracking-tight">
                  {loading ? '…' : value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Updates feed */}
        <UpdatesSection user={user} className="rounded-[2rem]" />
      </div>
    </>
  );
}
