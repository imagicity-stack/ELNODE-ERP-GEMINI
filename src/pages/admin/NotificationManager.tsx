import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  Bell, Send, GraduationCap, Wallet, Megaphone, CalendarDays, Users, Search, X,
  Trash2, Globe, UserCheck, Layers, AlertTriangle,
} from 'lucide-react';
import {
  PageHeader, Button, FormField, Input, Textarea, Select, EmptyState, ConfirmModal, Avatar,
} from '../../components/ui';
import { AppNotification, NotificationCategory, NotificationTargetType, UserProfile, Class } from '../../types';
import {
  sendNotification, deleteNotification, buildAudience, NOTIFICATION_CATEGORIES,
} from '../../services/notificationCenterService';
import { logActivity } from '../../services/activityService';
import { useToast } from '../../components/Toast';
import { cn } from '../../lib/utils';

const CATEGORY_ICON: Record<string, any> = { GraduationCap, Wallet, Megaphone, CalendarDays, Bell };

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'student', label: 'Students' },
  { value: 'parent', label: 'Parents' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'principal', label: 'Principal' },
  { value: 'office_staff', label: 'Staff' },
];

const TARGET_OPTIONS: { value: NotificationTargetType; label: string; icon: any; desc: string }[] = [
  { value: 'all', label: 'Everyone', icon: Globe, desc: 'All app users' },
  { value: 'role', label: 'By Role', icon: Users, desc: 'Students, parents, etc.' },
  { value: 'class', label: 'By Class', icon: Layers, desc: 'A class / section' },
  { value: 'individual', label: 'Individuals', icon: UserCheck, desc: 'Specific people' },
];

interface SearchUser { uid: string; name: string; email: string; role: string; classId?: string; section?: string; }

export default function NotificationManager({ user }: { user: UserProfile }) {
  const { showToast } = useToast();

  const [category, setCategory] = useState<NotificationCategory>('notice');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high'>('normal');
  const [targetType, setTargetType] = useState<NotificationTargetType>('all');
  const [link, setLink] = useState('');
  const [sending, setSending] = useState(false);

  // Role target
  const [roles, setRoles] = useState<string[]>([]);
  // Class target
  const [classes, setClasses] = useState<Class[]>([]);
  const [classId, setClassId] = useState('');
  const [section, setSection] = useState('');
  // Individual target
  const [allUsers, setAllUsers] = useState<SearchUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<SearchUser[]>([]);

  // History
  const [history, setHistory] = useState<AppNotification[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    getDocs(collection(db, 'classes'))
      .then((snap) => setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Class))))
      .catch(() => {});

    const unsub = onSnapshot(
      query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification))),
      () => {}
    );
    return () => unsub();
  }, []);

  // Lazy-load users the first time individual targeting is chosen.
  useEffect(() => {
    if (targetType !== 'individual' || usersLoaded) return;
    getDocs(collection(db, 'users'))
      .then((snap) => {
        setAllUsers(
          snap.docs.map((d) => {
            const u = d.data() as any;
            return { uid: d.id, name: u.name || u.email || 'User', email: u.email || '', role: u.role || '', classId: u.classId, section: u.section };
          })
        );
        setUsersLoaded(true);
      })
      .catch(() => showToast('Could not load users', 'error'));
  }, [targetType, usersLoaded, showToast]);

  const selectedClass = classes.find((c) => c.id === classId);
  const sectionOptions = selectedClass?.sections?.map((s) => s.name || 'A') || [];

  const userResults = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return [];
    return allUsers
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .filter((u) => !selectedUsers.some((s) => s.uid === u.uid))
      .slice(0, 8);
  }, [userSearch, allUsers, selectedUsers]);

  const toggleRole = (r: string) =>
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const audiencePreview = useMemo(() => {
    return buildAudience(targetType, {
      roles,
      classId,
      section: section || undefined,
      className: selectedClass?.name,
      userIds: selectedUsers.map((u) => u.uid),
      userLabels: selectedUsers.map((u) => u.name),
    });
  }, [targetType, roles, classId, section, selectedClass, selectedUsers]);

  const canSend = useMemo(() => {
    if (!title.trim() || !body.trim()) return false;
    if (targetType === 'role') return roles.length > 0;
    if (targetType === 'class') return !!classId;
    if (targetType === 'individual') return selectedUsers.length > 0;
    return true; // 'all'
  }, [title, body, targetType, roles, classId, selectedUsers]);

  const resetForm = () => {
    setTitle(''); setBody(''); setLink(''); setPriority('normal');
    setRoles([]); setClassId(''); setSection(''); setSelectedUsers([]); setUserSearch('');
  };

  const handleSend = async () => {
    if (!canSend) return;
    const { audience, summary } = audiencePreview;
    if (audience.length === 0) { showToast('Select at least one recipient', 'error'); return; }
    setSending(true);
    try {
      await sendNotification({
        title, body, category, priority, targetType, audience, targetSummary: summary,
        link: link.trim() || undefined,
        sender: { uid: user.uid, name: user.name },
      });
      logActivity(user, 'Notification Sent', 'Super Admin',
        `Sent "${title}" to ${summary}`, { category, targetType });
      showToast(`Notification sent to ${summary}`, 'success');
      resetForm();
    } catch (e: any) {
      showToast(e?.message || 'Failed to send notification', 'error');
    } finally {
      setSending(false);
    }
  };

  const performDelete = async () => {
    if (!deleteId) return;
    try { await deleteNotification(deleteId); showToast('Notification deleted', 'success'); }
    catch { showToast('Failed to delete', 'error'); }
    finally { setDeleteId(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Center"
        subtitle="Compose and broadcast notifications to any audience"
        icon={Bell}
        iconColor="bg-indigo-500"
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Composer ───────────────────────────────────────────────── */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
          {/* Category */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Category</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategory[]).map((key) => {
                const cat = NOTIFICATION_CATEGORIES[key];
                const Icon = CATEGORY_ICON[cat.icon] || Bell;
                const active = category === key;
                return (
                  <button
                    key={key}
                    onClick={() => setCategory(key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all',
                      active ? `${cat.bg} ${cat.color} border-current` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" /> {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          <FormField label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Term 1 results are out" maxLength={120} />
          </FormField>

          <FormField label="Message" required>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Write the notification message…" maxLength={1000} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                <option value="normal">Normal</option>
                <option value="high">Urgent</option>
              </Select>
            </FormField>
            <FormField label="Open link (optional)" hint="In-app route, e.g. /notices">
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/notices" />
            </FormField>
          </div>

          {/* Target type */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Send to</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TARGET_OPTIONS.map((opt) => {
                const active = targetType === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTargetType(opt.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 px-2 py-3 rounded-xl border text-center transition-all',
                      active ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-bold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target detail */}
          {targetType === 'role' && (
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => toggleRole(r.value)}
                  className={cn(
                    'px-3 py-2 rounded-xl text-xs font-semibold border transition-all',
                    roles.includes(r.value) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {targetType === 'class' && (
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Class" required>
                <Select value={classId} onChange={(e) => { setClassId(e.target.value); setSection(''); }}>
                  <option value="">Select class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>Class {c.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Section" hint="Leave blank for whole class">
                <Select value={section} onChange={(e) => setSection(e.target.value)} disabled={!classId}>
                  <option value="">All sections</option>
                  {sectionOptions.map((s) => <option key={s} value={s}>Section {s}</option>)}
                </Select>
              </FormField>
            </div>
          )}

          {targetType === 'individual' && (
            <div>
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedUsers.map((u) => (
                    <span key={u.uid} className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg">
                      {u.name}
                      <button onClick={() => setSelectedUsers((prev) => prev.filter((x) => x.uid !== u.uid))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={usersLoaded ? 'Search by name or email…' : 'Loading users…'}
                  disabled={!usersLoaded}
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
                {userResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
                    {userResults.map((u) => (
                      <button
                        key={u.uid}
                        onClick={() => { setSelectedUsers((prev) => [...prev, u]); setUserSearch(''); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left"
                      >
                        <Avatar name={u.name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{u.name}</p>
                          <p className="text-[11px] text-slate-400 truncate">{u.email} · {u.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recipient summary + send */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Sending to <span className="font-bold text-slate-700">{audiencePreview.summary}</span>
            </p>
            <Button icon={Send} onClick={handleSend} loading={sending} disabled={!canSend}>
              Send Notification
            </Button>
          </div>
        </div>

        {/* ── History ────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-sm font-bold text-slate-900 mb-3">Recently sent</p>
          {history.length === 0 ? (
            <EmptyState icon={Megaphone} title="No notifications yet" description="Sent notifications will appear here." />
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {history.map((n) => {
                const cat = NOTIFICATION_CATEGORIES[n.category] || NOTIFICATION_CATEGORIES.general;
                const Icon = CATEGORY_ICON[cat.icon] || Bell;
                return (
                  <div key={n.id} className="flex gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 group">
                    <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', cat.bg)}>
                      <Icon className={cn('w-4 h-4', cat.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 truncate flex-1">{n.title}</p>
                        {n.priority === 'high' && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1">{n.body}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {n.targetSummary} · {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button
                      onClick={() => setDeleteId(n.id)}
                      className="self-start p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={performDelete}
        title="Delete notification?"
        message="This removes it from the notification center for all recipients."
      />
    </div>
  );
}
