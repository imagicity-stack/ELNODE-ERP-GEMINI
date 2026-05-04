import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  GraduationCap, 
  Briefcase, 
  Megaphone, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  Clock, 
  FileText,
  ClipboardCheck,
  Zap,
  Activity,
  Award
} from 'lucide-react';
import { 
  collection, 
  query, 
  getDocs, 
  orderBy, 
  limit, 
  where,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile } from '../../types';
import { cn } from '../../lib/utils';

// ─── Stat Cards ───────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon: any;
  gradient: string;
  index: number;
}

const StatCard = ({ label, value, subValue, icon: Icon, gradient, index }: StatCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.1 }}
    className="relative group bg-white rounded-3xl p-6 shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300"
  >
    <div className={cn("absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500", gradient.replace('from-', 'bg-'))} />
    
    <div className="flex items-center gap-4 relative">
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg", gradient)}>
        <Icon className="w-7 h-7" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
          <h3 className="text-3xl font-black text-slate-900 tracking-tight">{value}</h3>
          {subValue && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">{subValue}</span>}
        </div>
      </div>
    </div>
  </motion.div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PrincipalDashboard({ user }: { user: UserProfile }) {
  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    classes: 0,
    notices: 0,
    attendanceToday: '0%',
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    // Real-time Activity Listener
    const activityQ = query(
      collection(db, 'activity_logs'),
      // Filter out financial activities if any sneaky ones leaked in logs
      // But usually logs are academic/auth/admin
      orderBy('timestamp', 'desc'),
      limit(6)
    );

    const unsubActivity = onSnapshot(activityQ, (snap) => {
      setRecentActivity(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Fetch Stats
    const fetchStats = async () => {
      try {
        const [studentSnap, teacherSnap, classSnap, noticeSnap] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'teachers')),
          getDocs(collection(db, 'classes')),
          getDocs(collection(db, 'notices'))
        ]);

        // Mocking attendance percentage for demonstration (Real logic would query today's attendance doc)
        const mockAttendance = 94; 

        setStats({
          students: studentSnap.size,
          teachers: teacherSnap.size,
          classes: classSnap.size,
          notices: noticeSnap.size,
          attendanceToday: `${mockAttendance}%`
        });
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    return () => unsubActivity();
  }, []);

  return (
    <div className="space-y-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 mb-2"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Zap className="w-4 h-4 text-indigo-600 fill-indigo-600" />
            </div>
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Academic Command Center</span>
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-black text-slate-900 tracking-tight"
          >
            Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Principal</span>
          </motion.h1>
          <p className="text-slate-500 mt-2 font-medium">Monitoring academic excellence and institution performance.</p>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100"
        >
          <div className="flex -space-x-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold">
                {String.fromCharCode(64 + i)}
              </div>
            ))}
          </div>
          <div className="pr-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live Viewers</p>
            <p className="text-xs font-bold text-slate-900 leading-none">12 Faculty Members</p>
          </div>
        </motion.div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Total Students"
          value={stats.students}
          subValue="+2.1%"
          icon={Users}
          gradient="bg-gradient-to-br from-indigo-600 to-blue-600"
          index={0}
        />
        <StatCard
          label="Faculty Members"
          value={stats.teachers}
          subValue="Active"
          icon={Briefcase}
          gradient="bg-gradient-to-br from-violet-600 to-purple-600"
          index={1}
        />
        <StatCard
          label="Classes"
          value={stats.classes}
          subValue="Managed"
          icon={GraduationCap}
          gradient="bg-gradient-to-br from-emerald-600 to-teal-600"
          index={2}
        />
        <StatCard
          label="Today Attendance"
          value={stats.attendanceToday}
          subValue="Stable"
          icon={ClipboardCheck}
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          index={3}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Activity & Notices */}
        <div className="lg:col-span-2 space-y-8">
          {/* Main Dashboard Visualizer */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-8 bg-gradient-to-br from-white to-indigo-50/30"
          >
            <div className="w-full md:w-1/3 flex flex-col items-center text-center">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-100" />
                  <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray={440} strokeDashoffset={440 * (1 - 0.85)} className="text-indigo-600 transition-all duration-1000 ease-out" strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-slate-900 tracking-tight">85%</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Success Rate</span>
                </div>
              </div>
              <p className="mt-4 text-sm font-medium text-slate-600">Academic Progression Overall</p>
            </div>
            
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <TrendingUp className="w-5 h-5 text-emerald-500 mb-2" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Academic</p>
                <p className="text-xl font-bold text-slate-900">Excellence</p>
                <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-[90%]" />
                </div>
              </div>
              <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <Users className="w-5 h-5 text-indigo-500 mb-2" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Social</p>
                <p className="text-xl font-bold text-slate-900">Engagement</p>
                <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full w-[75%]" />
                </div>
              </div>
              <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <ClipboardCheck className="w-5 h-5 text-amber-500 mb-2" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Attendance</p>
                <p className="text-xl font-bold text-slate-900">Punctuality</p>
                <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full w-[94%]" />
                </div>
              </div>
              <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <Award className="w-5 h-5 text-rose-500 mb-2" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Extra-Curr</p>
                <p className="text-xl font-bold text-slate-900">Victories</p>
                <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full w-[60%]" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Activity Feed */}
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                  <Activity className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-black text-slate-900">Global Activity Feed</h2>
              </div>
              <button className="text-sm font-bold text-indigo-600 hover:text-indigo-700">View All</button>
            </div>

            <div className="space-y-6">
              {recentActivity.map((activity, idx) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + idx * 0.1 }}
                  className="flex gap-4 relative group"
                >
                  {idx !== recentActivity.length - 1 && (
                    <div className="absolute left-5 top-10 bottom-0 w-px bg-slate-100 -mb-6" />
                  )}
                  <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors">
                    <Zap className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">{activity.description}</p>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {activity.timestamp?.toDate ? activity.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Performed by {activity.userName || activity.userEmail || 'System Component'}</p>
                  </div>
                </motion.div>
              ))}
              {recentActivity.length === 0 && (
                <div className="text-center py-12">
                  <Activity className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-medium">No recent activity detected.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Quick Actions & Notices */}
        <div className="space-y-8">
          {/* Quick Actions */}
          <div className="bg-slate-900 rounded-[2rem] p-8 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-6">Quick Directives</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Megaphone, label: 'Broadcast', color: 'bg-indigo-500' },
                { icon: ClipboardCheck, label: 'Review Staff', color: 'bg-violet-500' },
                { icon: CalendarIcon, label: 'Reschedule', color: 'bg-emerald-500' },
                { icon: FileText, label: 'Reports', color: 'bg-rose-500' },
              ].map((action, i) => (
                <button
                  key={i}
                  className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center text-center group hover:bg-white/10 transition-all"
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform", action.color)}>
                    <action.icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs font-bold text-white/80">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Message / Notice */}
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Megaphone className="w-5 h-5 text-indigo-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Emergency Notice</h2>
            </div>
            <textarea
              placeholder="Type school-wide announcement here..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:outline-none min-h-[120px] resize-none"
            />
            <button className="w-full mt-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all">
              Broadcast Now
            </button>
            <p className="text-[10px] text-center text-slate-400 mt-2 font-medium">This will sync to all portals instantly.</p>
          </div>

          {/* Upcoming Card */}
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2rem] p-8 shadow-xl text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <Award className="w-24 h-24 rotate-12" />
            </div>
            <h2 className="text-lg font-bold mb-4 relative">Council Meeting</h2>
            <div className="flex items-center gap-3 mb-6 relative">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex flex-col items-center justify-center">
                <span className="text-sm font-black">12</span>
                <span className="text-[8px] font-bold uppercase tracking-tighter">May</span>
              </div>
              <div>
                <p className="text-sm font-bold">10:00 AM</p>
                <p className="text-xs text-white/70 font-medium">Board Room • Block A</p>
              </div>
            </div>
            <button className="w-full py-3 bg-white text-indigo-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm relative">
              View Schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
