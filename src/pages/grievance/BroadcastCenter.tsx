import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, Student, FeeRequest, Class, BroadcastLog } from '../../types';
import { PageHeader, Card, Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import {
  Megaphone, Users, Send, CheckCircle2, XCircle, Filter,
  RefreshCw, Search, X, CheckSquare, Square,
} from 'lucide-react';
import { cn, fmtMonthYear } from '../../lib/utils';
import { logActivity } from '../../services/activityService';

const PAYMENT_LINK = 'https://ehs.elnode.in/parent/fees';

const TEMPLATES = [
  {
    id: 'fees_due_reminder',
    label: 'Fee Due Reminder',
    description: 'Remind parents of upcoming/pending fee dues',
    statuses: ['pending', 'partially_paid'],
  },
  {
    id: 'fees_overdue_notice',
    label: 'Overdue Fee Notice',
    description: 'Stronger notice for overdue fees',
    statuses: ['pending', 'overdue', 'partially_paid'],
  },
  {
    id: 'general_announcement1',
    label: 'General Announcement',
    description: 'Send a custom announcement to selected parents',
    statuses: [],
  },
] as const;

type TemplateId = typeof TEMPLATES[number]['id'];

interface Recipient {
  key: string; // requestId for fee templates, studentId for general_announcement
  phone: string;
  parentName: string;
  studentName: string;
  classSection: string;
  amount?: string;
  month?: string;
  dueDate?: string;
}

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

// Returns the best available parent name from a student record
function resolveParentName(student: Student): string {
  return (
    student.parentDetails?.fatherName?.trim() ||
    student.parentDetails?.motherName?.trim() ||
    'Parent'
  );
}

// Chip-toggle group for advanced filters
function ChipGroup({
  label, options, selected, onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                active ? 'bg-green-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-green-300'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function BroadcastCenter({ user }: { user: UserProfile }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [requests, setRequests] = useState<FeeRequest[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [broadcastLogs, setBroadcastLogs] = useState<BroadcastLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [template, setTemplate] = useState<TemplateId>('fees_due_reminder');
  const [customMessage, setCustomMessage] = useState('');
  const [mode, setMode] = useState<'bulk' | 'individual'>('bulk');

  // Advanced bulk filters
  const [classFilter, setClassFilter] = useState<string[]>([]);
  const [sectionFilter, setSectionFilter] = useState<string[]>([]);
  const [genderFilter, setGenderFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // Per-row selection
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Individual send
  const [individualPhone, setIndividualPhone] = useState('');
  const [individualParent, setIndividualParent] = useState('');
  const [studentQuery, setStudentQuery] = useState('');

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  const { showToast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [stuSnap, reqSnap, clsSnap] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'feeRequests')),
          getDocs(collection(db, 'classes')),
        ]);
        setStudents(stuSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
        setRequests(reqSnap.docs.map(d => ({ id: d.id, ...d.data() } as FeeRequest)));
        setClasses(clsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
      } catch (err) {
        console.error('BroadcastCenter: failed to load main data', err);
        showToast('Failed to load student/fee data', 'error');
      } finally {
        setLoading(false);
      }

      try {
        const logSnap = await getDocs(
          query(collection(db, 'broadcastLogs'), orderBy('sentAt', 'desc'), limit(20)),
        );
        setBroadcastLogs(logSnap.docs.map(d => ({ id: d.id, ...d.data() } as BroadcastLog)));
      } catch (err) {
        console.warn('BroadcastCenter: could not load broadcast history', err);
      }
    })();
  }, []);

  const selectedTemplate = TEMPLATES.find(t => t.id === template)!;
  const classNameMap = useMemo(
    () => Object.fromEntries(classes.map(c => [c.id, c.name])),
    [classes],
  );
  const studentMap = useMemo(
    () => Object.fromEntries(students.map(s => [s.id, s])),
    [students],
  );

  // Sections available across selected classes (or all classes if none selected)
  const availableSections = useMemo(() => {
    const pool = classFilter.length > 0 ? classes.filter(c => classFilter.includes(c.id)) : classes;
    const set = new Set<string>();
    pool.forEach(c => (c.sections || []).forEach(s => s.name && set.add(s.name)));
    return Array.from(set).sort();
  }, [classes, classFilter]);

  const toggleArr = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
  ) => setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));

  const clearFilters = () => {
    setClassFilter([]);
    setSectionFilter([]);
    setGenderFilter([]);
    setSearch('');
  };
  const activeFilterCount =
    classFilter.length + sectionFilter.length + genderFilter.length + (search.trim() ? 1 : 0);

  // Full filtered recipient list
  const recipients: Recipient[] = useMemo(() => {
    const term = search.trim().toLowerCase();

    const passesFilters = (s: Student) => {
      if (classFilter.length > 0 && !classFilter.includes(s.classId)) return false;
      if (sectionFilter.length > 0 && !sectionFilter.includes(s.section)) return false;
      if (genderFilter.length > 0 && !genderFilter.includes(s.gender || '')) return false;
      if (!s.parentDetails?.phone) return false;
      return true;
    };

    if (template === 'general_announcement1') {
      return students
        .filter(s => passesFilters(s))
        .filter(s => {
          if (!term) return true;
          const pn = resolveParentName(s);
          return `${pn} ${s.name} ${s.parentDetails?.phone || ''}`.toLowerCase().includes(term);
        })
        .map(s => ({
          key: s.id,
          phone: s.parentDetails!.phone,
          parentName: resolveParentName(s),
          studentName: s.name,
          classSection: `${classNameMap[s.classId] || s.classId} ${s.section}`.trim(),
        }));
    }

    return requests
      .filter(r => (selectedTemplate.statuses as readonly string[]).includes(r.status))
      .flatMap(r => {
        const student = studentMap[r.studentId];
        if (!passesFilters(student)) return [];
        const parentName = resolveParentName(student);
        if (term && !`${parentName} ${student.name} ${student.parentDetails?.phone || ''}`.toLowerCase().includes(term)) return [];
        return [{
          key: r.id,
          phone: student.parentDetails!.phone,
          parentName,
          studentName: student.name,
          classSection: `${classNameMap[student.classId] || student.classId} ${student.section}`.trim(),
          amount: `Rs. ${((r.totalAmount || 0) - (r.paidAmount || 0)).toLocaleString('en-IN')}`,
          month: fmtMonthYear(r.month),
          dueDate: r.dueDate || '',
        }];
      });
  }, [students, requests, template, classFilter, sectionFilter, genderFilter, search, classNameMap, studentMap]);

  // Auto-select all when filtered set changes
  const recipientKey = recipients.map(r => r.key).join('|');
  useEffect(() => {
    setSelectedKeys(new Set(recipients.map(r => r.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientKey]);

  const sendList = useMemo(
    () => recipients.filter(r => selectedKeys.has(r.key)),
    [recipients, selectedKeys],
  );

  const toggleSelect = (key: string) =>
    setSelectedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const allSelected = recipients.length > 0 && sendList.length === recipients.length;
  const selectAll = () => setSelectedKeys(new Set(recipients.map(r => r.key)));
  const clearAll = () => setSelectedKeys(new Set());

  // Individual send: student lookup by name / phone
  const studentSuggestions = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(s => s.parentDetails?.phone)
      .filter(s => {
        const pn = resolveParentName(s);
        return `${s.name} ${pn} ${s.parentDetails?.phone || ''}`.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [students, studentQuery]);

  const selectStudent = (s: Student) => {
    setIndividualPhone(s.parentDetails?.phone || '');
    setIndividualParent(resolveParentName(s));
    setStudentQuery('');
  };

  const buildParams = (r: Recipient): string[] => {
    if (template === 'general_announcement1') {
      return [r.parentName, customMessage, r.studentName, r.classSection, PAYMENT_LINK];
    }
    return [r.parentName, r.amount || '', r.studentName, r.classSection, r.month || '', r.dueDate || '', PAYMENT_LINK];
  };

  const handleBulkSend = async () => {
    if (sending || sendList.length === 0) return;
    if (!confirm(`Send "${selectedTemplate.label}" to ${sendList.length} selected parent(s)?`)) return;
    setSending(true);
    setProgress({ done: 0, total: sendList.length, failed: 0 });
    let done = 0;
    let failed = 0;

    for (const r of sendList) {
      try {
        const res = await fetch('/api/whatsapp/send-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: r.phone, templateName: template, parameters: buildParams(r) }),
        });
        if (res.ok) done++; else failed++;
      } catch { failed++; }
      setProgress({ done: done + failed, total: sendList.length, failed });
    }

    const filterSummary = activeFilterCount === 0 ? 'All Classes' :
      [classFilter.length ? `${classFilter.length} class(es)` : '',
       sectionFilter.length ? `Sec: ${sectionFilter.join('/')}` : '',
       genderFilter.length ? genderFilter.join('/') : ''].filter(Boolean).join(', ');

    try {
      const logEntry = {
        templateName: template,
        audience: filterSummary,
        totalSent: done,
        totalFailed: failed,
        sentAt: new Date().toISOString(),
        sentBy: user.name,
      };
      const docRef = await addDoc(collection(db, 'broadcastLogs'), logEntry);
      setBroadcastLogs(prev => [{ id: docRef.id, ...logEntry }, ...prev.slice(0, 19)]);
    } catch {}

    logActivity(user, 'Broadcast Sent (Bulk)', 'Super Admin',
      `Bulk broadcast sent to ${done}/${sendList.length} recipients`, { count: sendList.length, channel: 'whatsapp', template });

    showToast(`Sent to ${done} recipients${failed > 0 ? `, ${failed} failed` : ''}`, done > 0 ? 'success' : 'error');
    setSending(false);
    setProgress(null);
  };

  const handleIndividualSend = async () => {
    if (sending || !individualPhone.trim()) return;
    const phone = individualPhone.replace(/\D/g, '');
    if (phone.length < 10) { showToast('Enter a valid phone number', 'error'); return; }
    setSending(true);
    try {
      const params = template === 'general_announcement1'
        ? [individualParent || 'Parent', customMessage, '', '', PAYMENT_LINK]
        : [individualParent || 'Parent', '', '', '', '', '', PAYMENT_LINK];

      const res = await fetch('/api/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, templateName: template, parameters: params }),
      });
      if (res.ok) {
        showToast('Message sent successfully', 'success');
        logActivity(user, 'Broadcast Sent (Individual)', 'Super Admin',
          `Individual broadcast sent to ${individualParent || phone}`,
          { recipientId: phone, recipientName: individualParent || 'Parent', channel: 'whatsapp' });
        try {
          const logEntry = {
            templateName: template,
            audience: `Individual: ${phone}`,
            totalSent: 1,
            totalFailed: 0,
            sentAt: new Date().toISOString(),
            sentBy: user.name,
          };
          const docRef = await addDoc(collection(db, 'broadcastLogs'), logEntry);
          setBroadcastLogs(prev => [{ id: docRef.id, ...logEntry }, ...prev.slice(0, 19)]);
        } catch {}
        setIndividualPhone('');
        setIndividualParent('');
      } else {
        showToast('Send failed', 'error');
      }
    } catch {
      showToast('Send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-slate-100 rounded" />
        <div className="h-64 bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="WhatsApp Broadcast Center"
        subtitle="Send bulk or individual WhatsApp messages via WATI (outbound only)"
        icon={Megaphone}
        iconColor="bg-green-500"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Mode toggle */}
          <Card padding="sm">
            <div className="flex rounded-xl overflow-hidden border border-slate-200">
              <button
                onClick={() => setMode('bulk')}
                className={cn('flex-1 py-2.5 text-sm font-semibold transition-colors', mode === 'bulk' ? 'bg-green-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}
              >
                <Users className="w-4 h-4 inline mr-2" />Bulk Send
              </button>
              <button
                onClick={() => setMode('individual')}
                className={cn('flex-1 py-2.5 text-sm font-semibold transition-colors', mode === 'individual' ? 'bg-green-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}
              >
                <Send className="w-4 h-4 inline mr-2" />Individual
              </button>
            </div>
          </Card>

          {/* Template selection */}
          <Card>
            <h3 className="text-sm font-bold text-slate-700 mb-3">Select Template</h3>
            <div className="space-y-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={cn(
                    'w-full text-left p-3 rounded-xl border transition-all',
                    template === t.id ? 'border-green-400 bg-green-50' : 'border-slate-200 hover:border-green-200 hover:bg-slate-50',
                  )}
                >
                  <p className={cn('text-sm font-bold', template === t.id ? 'text-green-700' : 'text-slate-900')}>{t.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                </button>
              ))}
            </div>

            {template === 'general_announcement1' && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Message Content</label>
                <textarea
                  value={customMessage}
                  onChange={e => setCustomMessage(e.target.value)}
                  placeholder="Enter your announcement message..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 resize-none"
                />
              </div>
            )}
          </Card>

          {/* Bulk mode: advanced filters + selectable recipient list */}
          {mode === 'bulk' && (
            <Card>
              {/* Advanced filters */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                    <Filter className="w-4 h-4 text-slate-400" /> Audience Filter
                  </h3>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="text-xs font-bold text-rose-600 flex items-center gap-1 hover:text-rose-700"
                    >
                      <X className="w-3.5 h-3.5" /> Clear ({activeFilterCount})
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search parent, student or phone…"
                    className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-green-400"
                  />
                </div>

                <ChipGroup
                  label="Class"
                  options={classes.map(c => ({ value: c.id, label: c.name }))}
                  selected={classFilter}
                  onToggle={v => toggleArr(setClassFilter, v)}
                />
                <ChipGroup
                  label="Section"
                  options={availableSections.map(s => ({ value: s, label: s }))}
                  selected={sectionFilter}
                  onToggle={v => toggleArr(setSectionFilter, v)}
                />
                <ChipGroup
                  label="Gender"
                  options={GENDERS}
                  selected={genderFilter}
                  onToggle={v => toggleArr(setGenderFilter, v)}
                />
              </div>

              {/* Recipient count + bulk controls */}
              <div className="flex items-center justify-between py-2 border-y border-slate-100 mb-3">
                <p className="text-xs font-bold text-slate-600">
                  <span className="text-green-700">{sendList.length}</span>
                  <span className="text-slate-400"> / {recipients.length} selected</span>
                </p>
                <button
                  onClick={allSelected ? clearAll : selectAll}
                  className="text-xs font-bold text-green-700 flex items-center gap-1 hover:text-green-800"
                >
                  {allSelected ? <Square className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              </div>

              {/* Selectable recipient list */}
              {recipients.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No matching recipients</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {recipients.map(r => {
                    const checked = selectedKeys.has(r.key);
                    return (
                      <button
                        key={r.key}
                        onClick={() => toggleSelect(r.key)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
                          checked ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200',
                        )}
                      >
                        <div className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                          checked ? 'bg-green-600 border-green-600' : 'border-slate-300 bg-white',
                        )}>
                          {checked && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{r.parentName}</p>
                          <p className="text-[11px] text-slate-500 truncate">{r.studentName} · {r.classSection}</p>
                        </div>
                        {r.amount && (
                          <p className="text-xs font-black text-slate-700 shrink-0">{r.amount}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Progress */}
              {progress && (
                <div className="mt-4 p-3 bg-blue-50 rounded-xl">
                  <div className="flex justify-between text-xs text-blue-700 mb-1">
                    <span>Sending... {progress.done}/{progress.total}</span>
                    {progress.failed > 0 && <span className="text-red-500">{progress.failed} failed</span>}
                  </div>
                  <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <Button
                onClick={handleBulkSend}
                disabled={sending || sendList.length === 0 || (template === 'general_announcement1' && !customMessage.trim())}
                className="w-full mt-4 bg-green-500 hover:bg-green-600 text-white"
              >
                {sending
                  ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />{`Sending (${progress?.done || 0}/${progress?.total || 0})…`}</>
                  : <><Send className="w-4 h-4 mr-2" />{`Send to ${sendList.length} Contact${sendList.length !== 1 ? 's' : ''}`}</>}
              </Button>
            </Card>
          )}

          {/* Individual send */}
          {mode === 'individual' && (
            <Card>
              <h3 className="text-sm font-bold text-slate-700 mb-3">Individual Send</h3>
              <div className="space-y-3">
                {/* Student search / autocomplete */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Search Student / Parent
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={studentQuery}
                      onChange={e => setStudentQuery(e.target.value)}
                      placeholder="Type student or parent name…"
                      className="w-full h-10 pl-9 pr-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                    />
                  </div>
                  {studentSuggestions.length > 0 && (
                    <div className="mt-1 border border-slate-200 rounded-xl shadow-sm bg-white overflow-hidden">
                      {studentSuggestions.map(s => (
                        <button
                          key={s.id}
                          onClick={() => selectStudent(s)}
                          className="w-full text-left px-3 py-2.5 hover:bg-green-50 transition-colors flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{s.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {resolveParentName(s)} · {classNameMap[s.classId] || s.classId}
                            </p>
                          </div>
                          <span className="text-xs text-slate-400 font-mono shrink-0">{s.parentDetails?.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Parent Name</label>
                  <input
                    type="text"
                    value={individualParent}
                    onChange={e => setIndividualParent(e.target.value)}
                    placeholder="Parent name for personalisation"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={individualPhone}
                    onChange={e => setIndividualPhone(e.target.value)}
                    placeholder="91XXXXXXXXXX"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                  />
                </div>
                {template === 'general_announcement1' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Message</label>
                    <textarea
                      value={customMessage}
                      onChange={e => setCustomMessage(e.target.value)}
                      rows={3}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-none"
                    />
                  </div>
                )}
                <Button
                  onClick={handleIndividualSend}
                  disabled={sending || !individualPhone.trim() || (template === 'general_announcement1' && !customMessage.trim())}
                  className="w-full bg-green-500 hover:bg-green-600 text-white"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {sending ? 'Sending...' : 'Send Message'}
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Send Log */}
        <div>
          <Card>
            <h3 className="text-sm font-bold text-slate-700 mb-4">Send History</h3>
            {broadcastLogs.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-8">No broadcasts yet</p>
            ) : (
              <div className="space-y-3">
                {broadcastLogs.map(log => (
                  <div key={log.id} className="p-3 border border-slate-100 rounded-xl">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs font-bold text-slate-900 leading-tight">{log.templateName.replace('_', ' ')}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-xs text-emerald-600 font-bold">{log.totalSent}</span>
                        {log.totalFailed > 0 && (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                            <span className="text-xs text-red-600 font-bold">{log.totalFailed}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">{log.audience}</p>
                    <p className="text-[10px] text-slate-400 mt-1">by {log.sentBy} · {new Date(log.sentAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
