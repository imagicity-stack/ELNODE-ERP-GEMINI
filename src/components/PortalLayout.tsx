import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { 
  LayoutDashboard, 
  Users, 
  GraduationCap, 
  BookOpen, 
  Calendar, 
  CreditCard, 
  ClipboardCheck, 
  FileText, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  Bell, 
  Search,
  UserCircle,
  MessageSquare,
  Home,
  CheckSquare,
  FileUp,
  Wallet,
  Clock,
  Briefcase,
  UserPlus,
  Megaphone,
  ShieldCheck,
  LayoutGrid,
  DollarSign
} from 'lucide-react';
import { cn } from '../lib/utils';
import { APP_NAME, SCHOOL_NAME, APP_LOGO } from '../constants';
import { UserRole } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface NavItem {
  label: string;
  icon: any;
  path: string;
  roles: UserRole[];
  section?: string;
}

const navItems: NavItem[] = [
  // Admin Section
  { label: 'Dashboard', icon: LayoutGrid, path: '', roles: ['super_admin'], section: 'Admin' },
  { label: 'Students', icon: Users, path: '/students', roles: ['super_admin'], section: 'Admin' },
  { label: 'Faculty', icon: Briefcase, path: '/teachers', roles: ['super_admin'], section: 'Admin' },
  { label: 'Staff', icon: Users, path: '/staff', roles: ['super_admin'], section: 'Admin' },
  { label: 'Classes', icon: GraduationCap, path: '/classes', roles: ['super_admin'], section: 'Admin' },
  { label: 'Subjects', icon: BookOpen, path: '/subjects', roles: ['super_admin'], section: 'Admin' },
  { label: 'Houses', icon: Home, path: '/houses', roles: ['super_admin'], section: 'Admin' },
  
  // Academic Section
  { label: 'Admissions', icon: UserPlus, path: '/admissions', roles: ['super_admin'], section: 'Academic' },
  { label: 'Exams', icon: FileText, path: '/exams', roles: ['super_admin'], section: 'Academic' },
  { label: 'Grading', icon: CheckSquare, path: '/grading-scales', roles: ['super_admin'], section: 'Academic' },
  { label: 'Calendar', icon: Calendar, path: '/calendar', roles: ['super_admin'], section: 'Academic' },
  
  // Communication Section
  { label: 'Notices', icon: Megaphone, path: '/notices', roles: ['super_admin'], section: 'Communication' },
  
  // Finance Section
  { label: 'Fee Structure', icon: Settings, path: '/fees', roles: ['super_admin'], section: 'Finance' },
  { label: 'Fee Collection', icon: Wallet, path: '/fee-collection', roles: ['super_admin', 'accounts'], section: 'Finance' },
  { label: 'Dashboard', icon: LayoutGrid, path: '', roles: ['accounts'], section: 'Finance' },
  { label: 'Expenses', icon: CreditCard, path: '/expenses', roles: ['super_admin', 'accounts'], section: 'Finance' },
  { label: 'Salaries', icon: DollarSign, path: '/salaries', roles: ['super_admin', 'accounts'], section: 'Finance' },
  { label: 'Reports', icon: FileText, path: '/reports', roles: ['super_admin', 'accounts'], section: 'Finance' },

  // Teacher Portal
  { label: 'Overview', icon: LayoutGrid, path: '', roles: ['teacher'] },
  { label: 'My Classes', icon: GraduationCap, path: '/classes', roles: ['teacher'] },
  { label: 'Attendance', icon: ClipboardCheck, path: '/attendance', roles: ['teacher'] },
  { label: 'Exams', icon: FileText, path: '/exams', roles: ['teacher'] },
  { label: 'Notices', icon: Megaphone, path: '/notices', roles: ['teacher'] },
  { label: 'Calendar', icon: Calendar, path: '/calendar', roles: ['teacher'] },

  // Student Portal
  { label: 'Dashboard', icon: LayoutGrid, path: '', roles: ['student'] },
  { label: 'My Subjects', icon: BookOpen, path: '/subjects', roles: ['student'] },
  { label: 'Attendance', icon: Clock, path: '/attendance', roles: ['student'] },
  { label: 'Fees', icon: Wallet, path: '/fees', roles: ['student'] },
  { label: 'Exams', icon: FileText, path: '/exams', roles: ['student'] },
  { label: 'Notices', icon: Megaphone, path: '/notices', roles: ['student'] },
  { label: 'Calendar', icon: Calendar, path: '/calendar', roles: ['student'] },

  // Parent Portal
  { label: 'Dashboard', icon: LayoutGrid, path: '', roles: ['parent'] },
  { label: 'Attendance', icon: Clock, path: '/attendance', roles: ['parent'] },
  { label: 'Fees', icon: Wallet, path: '/fees', roles: ['parent'] },
  { label: 'Homework', icon: CheckSquare, path: '/homework', roles: ['parent'] },
  { label: 'Exams', icon: FileText, path: '/exams', roles: ['parent'] },
  { label: 'Notices', icon: Megaphone, path: '/notices', roles: ['parent'] },
  { label: 'Calendar', icon: Calendar, path: '/calendar', roles: ['parent'] },
];

interface PortalLayoutProps {
  children: React.ReactNode;
  role: UserRole;
  userName: string;
  customHeader?: React.ReactNode;
}

export default function PortalLayout({ children, role, userName, customHeader }: PortalLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const filteredNavItems = navItems.filter(item => item.roles.includes(role));
  const basePath = `/${role.replace('_', '')}`;
  
  // Group items by section
  const groupedItems = filteredNavItems.reduce((acc, item) => {
    const section = item.section || 'General';
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-100 transition-all duration-500 ease-in-out lg:static lg:block",
        isSidebarOpen ? "w-72" : "w-24",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="h-full flex flex-col relative">
          {/* Mobile Close Button */}
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-xl text-gray-500 lg:hidden z-50"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="p-8 flex items-center gap-4">
            <div className="w-12 h-12 flex items-center justify-center shrink-0">
              <img 
                src={APP_LOGO} 
                className="w-full h-full object-contain" 
                alt={APP_NAME}
                referrerPolicy="no-referrer"
              />
            </div>
            <div className={cn("transition-opacity duration-300", !isSidebarOpen && "lg:opacity-0 lg:hidden")}>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">{APP_NAME}</h1>
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mt-1">{SCHOOL_NAME}</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-8 overflow-y-auto scrollbar-hide">
            {Object.entries(groupedItems).map(([section, items]) => (
              <div key={section} className="space-y-3">
                {isSidebarOpen && section !== 'General' && (
                  <h3 className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                    {section}
                  </h3>
                )}
                <div className="space-y-1">
                  {items.map((item) => {
                    const fullPath = `${basePath}${item.path}`;
                    const isActive = location.pathname === fullPath || (item.path === '' && location.pathname === basePath);
                    return (
                      <Link
                        key={item.label}
                        to={fullPath}
                        className={cn(
                          "flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative",
                          isActive 
                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                            : "text-gray-500 hover:bg-indigo-50 hover:text-indigo-600"
                        )}
                      >
                        <item.icon className={cn("w-6 h-6 shrink-0 transition-transform duration-300 group-hover:scale-110", isActive ? "text-white" : "text-gray-400 group-hover:text-indigo-600")} />
                        <span className={cn(
                          "text-sm font-bold tracking-tight transition-all duration-300",
                          !isSidebarOpen && "lg:opacity-0 lg:hidden"
                        )}>
                          {item.label}
                        </span>
                        {isActive && (
                          <motion.div 
                            layoutId="activeNav"
                            className="absolute inset-0 bg-indigo-600 rounded-2xl -z-10"
                          />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-50">
            <button
              onClick={handleLogout}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-red-500 hover:bg-red-50 transition-all duration-300 group",
                !isSidebarOpen && "justify-center"
              )}
            >
              <LogOut className="w-6 h-6 shrink-0 group-hover:rotate-12 transition-transform" />
              <span className={cn(
                "text-sm font-bold tracking-tight transition-all duration-300",
                !isSidebarOpen && "lg:opacity-0 lg:hidden"
              )}>
                Sign Out
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-3 hover:bg-gray-100 rounded-2xl text-gray-500 transition-all"
            >
              <Menu className="w-6 h-6" />
            </button>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-3 hover:bg-gray-100 rounded-2xl text-gray-500 transition-all lg:hidden"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative hidden md:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search anything..." 
                className="pl-12 pr-6 py-2.5 bg-gray-50 border-none rounded-2xl text-sm w-80 focus:ring-2 focus:ring-indigo-600/20 transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {customHeader}
            <button className="p-3 hover:bg-gray-100 rounded-2xl text-gray-500 transition-all relative">
              <Bell className="w-6 h-6" />
              <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full" />
            </button>
            <div className="h-8 w-px bg-gray-100 mx-2" />
            <div className="flex items-center gap-4 pl-2">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-black text-gray-900 leading-none">{userName}</p>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">{role.replace('_', ' ')}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-lg border-2 border-white shadow-sm">
                {userName.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
