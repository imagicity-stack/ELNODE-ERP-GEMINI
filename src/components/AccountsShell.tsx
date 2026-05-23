import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import {
  Home, CreditCard, History, Receipt, DollarSign, BarChart3,
  TrendingUp, RefreshCw, MessageCircle, User, LogOut,
} from 'lucide-react';
import { APP_NAME, SCHOOL_NAME, APP_LOGO } from '../constants';
import { UserProfile } from '../types';
import NotificationCenter from './NotificationCenter';
import { useToast } from './Toast';
import { logActivity } from '../services/activityService';
import { requestNotificationPermission, startNotificationListeners } from '../services/notificationService';

const BASE = '/accounts';

const NAV = [
  { label: 'Dashboard', icon: Home, path: '' },
  { label: 'Fee Collection', icon: CreditCard, path: '/fee-collection' },
  { label: 'Payment History', icon: History, path: '/payment-history' },
  { label: 'Expenses', icon: Receipt, path: '/expenses' },
  { label: 'Salaries', icon: DollarSign, path: '/salaries' },
  { label: 'Reports', icon: BarChart3, path: '/reports' },
  { label: 'Analytics', icon: TrendingUp, path: '/analytics' },
  { label: 'Reconciliation', icon: RefreshCw, path: '/reconciliation' },
  { label: 'WhatsApp', icon: MessageCircle, path: '/whatsapp' },
];

const TABS = [
  { label: 'Home', icon: Home, path: '' },
  { label: 'Fees', icon: CreditCard, path: '/fee-collection' },
  { label: 'History', icon: History, path: '/payment-history' },
  { label: 'Reports', icon: BarChart3, path: '/reports' },
  { label: 'Me', icon: User, path: '/profile' },
];

export default function AccountsShell({ children, user }: { children: React.ReactNode; user: UserProfile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const mainRef = useRef<HTMLElement>(null);
  const userName = user.name || user.email || 'Accounts';
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
          auth.currentUser.uid, 'accounts', [],
          (title, body) => showToast(`${title}: ${body}`, 'info')
        );
      }
    })();
    return () => { if (unsub) unsub(); };
  }, []);

  const handleLogout = async () => {
    try {
      await logActivity(user, 'User Logged Out', 'Accounts', `${user.name} signed out of the Accounts portal`);
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
        <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-hide space-y-1">
          {NAV.map((item) => {
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
              <p className="eyebrow mt-0.5">Accounts</p>
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
          <div className="lg:max-w-3xl lg:mx-auto lg:px-8">
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
