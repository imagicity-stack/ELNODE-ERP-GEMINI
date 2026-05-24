import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import {
  Home, Users, GraduationCap, BookOpen, Layers, DollarSign,
  ClipboardCheck, FileText, Bell, Settings, BarChart3, Calendar,
  CreditCard, MessageCircle, Activity, User, LogOut,
  UserCheck, Building2, Award, CalendarDays, CalendarClock, History,
  Receipt, Wallet, TrendingUp, LifeBuoy, PhoneCall, Radio,
  Banknote, Gavel, Lock, NotebookPen,
} from 'lucide-react';
import { APP_NAME, SCHOOL_NAME, APP_LOGO } from '../constants';
import { UserProfile } from '../types';
import NotificationCenter from './NotificationCenter';
import { useToast } from './Toast';
import { logActivity } from '../services/activityService';
import { requestNotificationPermission, startNotificationListeners } from '../services/notificationService';

const NAV_SECTIONS = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', icon: Home, path: '' },
    ],
  },
  {
    heading: 'People',
    items: [
      { label: 'Students', icon: Users, path: '/students' },
      { label: 'Teachers', icon: GraduationCap, path: '/teachers' },
      { label: 'Staff', icon: UserCheck, path: '/staff' },
      { label: 'Houses', icon: Building2, path: '/houses' },
      { label: 'Admissions', icon: ClipboardCheck, path: '/admissions' },
    ],
  },
  {
    heading: 'Academic',
    items: [
      { label: 'Classes', icon: BookOpen, path: '/classes' },
      { label: 'Subjects', icon: Layers, path: '/subjects' },
      { label: 'Exams', icon: FileText, path: '/exams' },
      { label: 'Grading Scales', icon: Award, path: '/grading-scales' },
      { label: 'Timetable', icon: CalendarDays, path: '/timetable' },
      { label: 'Lesson Diary', icon: NotebookPen, path: '/diary' },
      { label: 'Calendar', icon: Calendar, path: '/calendar' },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { label: 'Fee Structure', icon: DollarSign, path: '/fees' },
      { label: 'Fee Collection', icon: CreditCard, path: '/fee-collection' },
      { label: 'Payment History', icon: History, path: '/payment-history' },
      { label: 'Expenses', icon: Receipt, path: '/expenses' },
      { label: 'Salaries', icon: Wallet, path: '/salaries' },
      { label: 'Reports', icon: BarChart3, path: '/reports' },
      { label: 'Analytics', icon: TrendingUp, path: '/analytics' },
    ],
  },
  {
    heading: 'Leave & HR',
    items: [
      { label: 'Leave Management', icon: CalendarClock, path: '/leaves' },
      { label: 'Teacher Leaves', icon: ClipboardCheck, path: '/teacher-leaves' },
    ],
  },
  {
    heading: 'Grievances',
    items: [
      { label: 'Grievance Tracker', icon: LifeBuoy, path: '/tracker' },
      { label: 'Fee Follow-up', icon: PhoneCall, path: '/fee-followup' },
    ],
  },
  {
    heading: 'Communication',
    items: [
      { label: 'Notice Board', icon: MessageCircle, path: '/notices' },
      { label: 'Notifications', icon: Bell, path: '/notifications' },
      { label: 'WhatsApp', icon: MessageCircle, path: '/whatsapp' },
      { label: 'Broadcast', icon: Radio, path: '/broadcast' },
    ],
  },
  {
    heading: 'System',
    items: [
      { label: 'Activity Logs', icon: Activity, path: '/activity-logs' },
      { label: 'Payroll Settings', icon: Banknote, path: '/payroll-settings' },
      { label: 'Fine Settings', icon: Gavel, path: '/fine-settings' },
      { label: 'Permissions', icon: Lock, path: '/permissions' },
      { label: 'School Settings', icon: Settings, path: '/school-settings' },
    ],
  },
];

const TABS = [
  { label: 'Home', icon: Home, path: '' },
  { label: 'Students', icon: Users, path: '/students' },
  { label: 'Fees', icon: CreditCard, path: '/fee-collection' },
  { label: 'Notices', icon: Bell, path: '/notices' },
  { label: 'Me', icon: User, path: '/profile' },
];

export default function AdminShell({ children, user }: { children: React.ReactNode; user: UserProfile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const mainRef = useRef<HTMLElement>(null);
  const BASE = '/' + location.pathname.split('/')[1];
  const userName = user.name || user.email || 'Admin';
  const initials = userName.charAt(0).toUpperCase();

  const isActive = (path: string) =>
    location.pathname === `${BASE}${path}` || (path === '' && location.pathname === BASE);

  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [location.pathname]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      await requestNotificationPermission();
      if (auth.currentUser) {
        unsub = startNotificationListeners(
          auth.currentUser.uid, 'admin', [],
          (title, body) => showToast(`${title}: ${body}`, 'info')
        );
      }
    })();
    return () => { if (unsub) unsub(); };
  }, []);

  const handleLogout = async () => {
    try {
      await logActivity(user, 'User Logged Out', 'Admin', `${user.name} signed out of the Admin portal`);
    } catch { /* non-fatal */ }
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="eh-app min-h-screen flex" style={{ background: 'var(--cream)' }}>
      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 z-30"
        style={{ background: 'var(--paper)', borderRight: '1px solid var(--line)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16" style={{ borderBottom: '1px solid var(--line)' }}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--ink)' }}
          >
            <img src={APP_LOGO} className="w-6 h-6 object-contain" alt={APP_NAME} referrerPolicy="no-referrer" />
          </div>
          <div className="min-w-0">
            <p className="display text-sm leading-none truncate" style={{ fontSize: 15 }}>{APP_NAME}</p>
            <p className="eyebrow mt-1 truncate">{SCHOOL_NAME}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-hide">
          {NAV_SECTIONS.map((section, si) => (
            <div key={section.heading} className={si > 0 ? 'mt-4' : ''}>
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-4)' }}>
                {section.heading}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.label + item.path}
                      to={`${BASE}${item.path}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                      style={
                        active
                          ? { background: 'var(--ink)', color: 'var(--cream)' }
                          : { color: 'var(--ink-3)' }
                      }
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--cream-2)'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.7} />
                      <span className="text-[13px] font-semibold">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 space-y-1" style={{ borderTop: '1px solid var(--line)' }}>
          <Link
            to={`${BASE}/profile`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
            style={isActive('/profile') ? { background: 'var(--ink)', color: 'var(--cream)' } : { color: 'var(--ink-2)' }}
          >
            <div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
              {user.photoURL ? <img src={user.photoURL} alt={userName} className="w-full h-full object-cover rounded-full" /> : initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate leading-none">{userName}</p>
              <p className="eyebrow mt-0.5">Admin</p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
            style={{ color: 'var(--ink-3)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--coral)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-3)'; }}
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            <span className="text-[13px] font-semibold">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Desktop top strip with notification center */}
        <div
          className="hidden lg:flex items-center justify-end gap-3 px-8 h-16 shrink-0 sticky top-0 z-20"
          style={{ background: 'var(--cream)' }}
        >
          <NotificationCenter user={user} />
        </div>

        {/* Scrollable content — pages render their own topbar on mobile */}
        <main ref={mainRef} className="flex-1 overflow-y-auto pb-24 lg:pb-8">
          <div className="lg:max-w-7xl lg:mx-auto lg:px-10">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom tab bar ───────────────────────────────── */}
      <nav className="tabbar lg:hidden fixed bottom-0 inset-x-0 z-30">
        {TABS.map((t) => {
          const active = isActive(t.path);
          return (
            <button
              key={t.label}
              className={'tab' + (active ? ' active' : '')}
              onClick={() => navigate(`${BASE}${t.path}`)}
            >
              <t.icon size={22} strokeWidth={active ? 2.2 : 1.6} />
              <span>{t.label}</span>
              <span className="dot" />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
