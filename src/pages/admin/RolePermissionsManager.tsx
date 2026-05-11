import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { RolePermissions, ModulePermission, UserRole, UserProfile } from '../../types';
import {
  ShieldCheck,
  Eye,
  Edit3,
  Save,
  RefreshCcw,
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  ClipboardCheck,
  FileText,
  Megaphone,
  History,
  LayoutGrid,
  Briefcase,
  UserPlus,
  Home,
  Clock,
  CheckSquare,
  Shield,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useToast } from '../../components/Toast';

const MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'students', label: 'Students Management', icon: Users },
  { id: 'teachers', label: 'Faculty Management', icon: Briefcase },
  { id: 'staff', label: 'Staff Management', icon: Shield },
  { id: 'classes', label: 'Classes', icon: GraduationCap },
  { id: 'subjects', label: 'Subjects', icon: BookOpen },
  { id: 'houses', label: 'Houses', icon: Home },
  { id: 'admissions', label: 'Admissions', icon: UserPlus },
  { id: 'exams', label: 'Exams', icon: FileText },
  { id: 'timetable', label: 'Timetable', icon: Clock },
  { id: 'leaves', label: 'Leave Requests', icon: ClipboardCheck },
  { id: 'grading-scales', label: 'Grading Scales', icon: CheckSquare },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'diary', label: 'Class Diary', icon: BookOpen },
  { id: 'notices', label: 'Notices', icon: Megaphone },
  { id: 'activity-logs', label: 'Activity Logs', icon: History },
];

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'principal', label: 'Principal' },
  { value: 'office_staff', label: 'Office Staff' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'accounts', label: 'Accountant' },
];

export default function RolePermissionsManager({ user }: { user: UserProfile }) {
  const [targetRole, setTargetRole] = useState<UserRole>('principal');
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    fetchPermissions();
  }, [targetRole]);

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, 'rolePermissions', targetRole);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setPermissions(docSnap.data() as RolePermissions);
      } else {
        const defaultModules: Record<string, ModulePermission> = {};
        MODULES.forEach(md => {
          let readOnly = targetRole === 'principal';
          if (targetRole === 'principal' && md.id === 'leaves') {
            readOnly = false;
          }
          defaultModules[md.id] = { enabled: true, readOnly };
        });
        const initialData: RolePermissions = {
          id: targetRole,
          modules: defaultModules,
          updatedAt: new Date().toISOString()
        };
        setPermissions(initialData);
      }
    } catch (error) {
      console.error('Error fetching permissions:', error);
      showToast('Failed to load permissions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleModule = (moduleId: string, field: keyof ModulePermission) => {
    if (!permissions) return;

    setPermissions({
      ...permissions,
      modules: {
        ...permissions.modules,
        [moduleId]: {
          ...permissions.modules[moduleId],
          [field]: !permissions.modules[moduleId][field]
        }
      }
    });
  };

  const savePermissions = async () => {
    if (!permissions) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'rolePermissions', targetRole), {
        ...permissions,
        updatedAt: new Date().toISOString()
      });
      showToast('Permissions updated successfully', 'success');
    } catch (error) {
      console.error('Error saving permissions:', error);
      showToast('Failed to save permissions', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Role Permissions</h1>
          <p className="text-xs text-indigo-200 mt-0.5">Configure module-level access control</p>
        </div>

        <div className="px-4 pt-3 pb-2 bg-white border-b border-slate-100">
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] pb-1">
            {ROLES.map(r => (
              <button
                key={r.value}
                onClick={() => setTargetRole(r.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${targetRole === r.value ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pt-3 pb-24 space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCcw className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          ) : (
            MODULES.map((module) => {
              const config = permissions?.modules[module.id] || { enabled: true, readOnly: false };
              return (
                <div
                  key={module.id}
                  className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${config.enabled ? 'border-slate-100' : 'border-slate-200 opacity-60'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${config.enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                        <module.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{module.label}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{module.id}</p>
                      </div>
                    </div>
                    <div
                      onClick={() => handleToggleModule(module.id, 'enabled')}
                      className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${config.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${config.enabled ? 'left-5' : 'left-1'}`} />
                    </div>
                  </div>

                  <button
                    disabled={!config.enabled}
                    onClick={() => handleToggleModule(module.id, 'readOnly')}
                    className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      !config.enabled
                        ? 'bg-slate-100 text-slate-300 pointer-events-none'
                        : config.readOnly
                          ? 'bg-amber-50 text-amber-600 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    }`}
                  >
                    {config.readOnly ? <Eye className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
                    {config.readOnly ? 'VIEW ONLY' : 'FULL ACCESS'}
                  </button>
                </div>
              );
            })
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-800 leading-relaxed">
              These permissions apply immediately to the {targetRole.replace('_', ' ')} portal.
            </p>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 safe-area-bottom">
          <button
            onClick={savePermissions}
            disabled={saving || loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-50"
          >
            {saving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Role Permissions</h1>
            <p className="text-slate-500">Configure module-level access and read-only restrictions.</p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value as UserRole)}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="principal">Principal</option>
              <option value="office_staff">Office Staff</option>
              <option value="teacher">Teacher</option>
              <option value="accounts">Accountant</option>
            </select>

            <button
              onClick={savePermissions}
              disabled={saving || loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200"
            >
              {saving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center h-64 bg-white rounded-2xl shadow-sm border border-slate-100">
            <RefreshCcw className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {MODULES.map((module) => {
              const config = permissions?.modules[module.id] || { enabled: true, readOnly: false };
              return (
                <motion.div
                  key={module.id}
                  layout
                  className={`p-5 rounded-2xl border transition-all ${
                    config.enabled
                      ? 'bg-white border-slate-100 shadow-sm'
                      : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${config.enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                        <module.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">{module.label}</h3>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">ID: {module.id}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleModule(module.id, 'enabled')}
                      className={`w-10 h-6 rounded-full relative transition-colors ${
                        config.enabled ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                        config.enabled ? 'left-5' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center gap-4 pt-4 border-t border-slate-50">
                    <button
                      disabled={!config.enabled}
                      onClick={() => handleToggleModule(module.id, 'readOnly')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                        !config.enabled
                          ? 'bg-slate-100 text-slate-300 pointer-events-none'
                          : config.readOnly
                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      }`}
                    >
                      {config.readOnly ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                      {config.readOnly ? 'VIEW ONLY' : 'FULL ACCESS'}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-bold mb-1">Important Note</p>
            <p>These permissions apply immediately to the {targetRole.replace('_', ' ')} portal. Existing Principal access has been set to "Read Only" by default per your requirements. You can toggle "Full Access" for specific modules as needed.</p>
          </div>
        </div>
      </div>
    </>
  );
}
