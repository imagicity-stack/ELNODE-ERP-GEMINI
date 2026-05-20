import React, { useState, useEffect, useMemo } from 'react';
import {
  MessageSquare, Send, Users, AlertCircle, CheckCircle2,
  Clock, Filter, RefreshCw, Phone, Search, X, CheckSquare, Square,
} from 'lucide-react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, Student, FeeRequest, Class } from '../../types';
import { useToast } from '../../components/Toast';
import { PageHeader, Card, Button, StatCard } from '../../components/ui';
import { logActivity } from '../../services/activityService';
import { fmtDate } from '../../lib/utils';

const PAYMENT_LINK = 'https://ehs.elnode.in/parent/fees';

interface RecipientRow {
  phone: string;
  parentName: string;
  studentName: string;
  classSection: string;
  amount: string;
  month: string;
  dueDate: string;
  requestId: string;
}

const TEMPLATES = [
  {
    id: 'fees_due_reminder',
    label: 'Fee Due Reminder',
    description: 'For pending / partially paid fees — sent before or on the due date',
    statuses: ['pending', 'partially_paid'],
    includeOverdue: false,
  },
  {
    id: 'fees_overdue_notice',
    label: 'Overdue Fee Notice',
    description: 'Stronger reminder for fees past the due date',
    statuses: ['pending', 'partially_paid', 'overdue'],
    includeOverdue: true,
  },
] as const;

function buildParams(template: typeof TEMPLATES[number]['id'], r: RecipientRow): string[] {
  if (template === 'fees_due_reminder') {
    return [r.parentName, r.amount, r.studentName, r.classSection, r.month, r.dueDate, PAYMENT_LINK];
  }
  return [r.parentName, r.amount, r.studentName, r.classSection, r.month, r.dueDate, PAYMENT_LINK];
}

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
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
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

export default function WhatsAppNotifications({ user }: { user: UserProfile }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [requests, setRequests] = useState<FeeRequest[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);

  const [template, setTemplate] = useState<typeof TEMPLATES[number]['id']>('fees_due_reminder');

  // Advanced filters (empty array = no constraint)
  const [classFilter, setClassFilter] = useState<string[]>([]);
  const [sectionFilter, setSectionFilter] = useState<string[]>([]);
  const [genderFilter, setGenderFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [minAmount, setMinAmount] = useState('');

  // Explicit per-parent selection, keyed by fee requestId
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  const { showToast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [studSnap, reqSnap, clsSnap] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'feeRequests')),
          getDocs(collection(db, 'classes')),
        ]);
        setStudents(studSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
        setRequests(reqSnap.docs.map(d => ({ id: d.id, ...d.data() } as FeeRequest)));
        setClasses(clsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
      } catch {
        showToast('Failed to load data', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const selectedTemplate = TEMPLATES.find(t => t.id === template)!;

  // Sections available for the currently chosen classes (union). When no class
  // is chosen, offer sections across all classes.
  const availableSections = useMemo(() => {
    const pool = classFilter.length > 0 ? classes.filter(c => classFilter.includes(c.id)) : classes;
    const set = new Set<string>();
    pool.forEach(c => (c.sections || []).forEach(s => s.name && set.add(s.name)));
    return Array.from(set).sort();
  }, [classes, classFilter]);

  const toggleArr = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) =>
    setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));

  const recipients: RecipientRow[] = useMemo(() => {
    const min = parseFloat(minAmount) || 0;
    const term = search.trim().toLowerCase();
    return requests
      .filter(r => {
        if (!selectedTemplate.statuses.includes(r.status as any)) return false;
        if (selectedTemplate.includeOverdue) {
          if (r.status === 'paid') return false;
        } else {
          if (r.dueDate && r.dueDate < today) return false;
        }
        return true;
      })
      .flatMap(r => {
        const student = students.find(s => s.id === r.studentId);
        if (!student?.parentDetails?.phone) return [];
        if (classFilter.length > 0 && !classFilter.includes(student.classId)) return [];
        if (sectionFilter.length > 0 && !sectionFilter.includes(student.section)) return [];
        if (genderFilter.length > 0 && !genderFilter.includes(student.gender || '')) return [];

        const cls = classes.find(c => c.id === student.classId);
        const classSection = `${cls?.name || student.classId} - ${student.section}`;
        const outstanding = r.totalAmount - (r.paidAmount || 0) - (r.waivedAmount || 0) + (r.fineAmount || 0);
        if (outstanding <= 0) return [];
        if (outstanding < min) return [];

        const parentName = student.parentDetails.fatherName || 'Parent';
        if (term && !`${parentName} ${student.name} ${student.parentDetails.phone}`.toLowerCase().includes(term)) return [];

        return [{
          phone: student.parentDetails.phone,
          parentName,
          studentName: student.name,
          classSection,
          amount: `₹${outstanding.toLocaleString('en-IN')}`,
          month: r.month || 'Annual',
          dueDate: r.dueDate
            ? new Date(r.dueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
            : '-',
          requestId: r.id,
        }];
      });
  }, [requests, students, classes, template, classFilter, sectionFilter, genderFilter, minAmount, search, today]);

  // When the filtered set changes, default to "all selected" so the prior
  // send-to-everyone behaviour is preserved; manual checkbox edits persist
  // as long as the filtered set is unchanged.
  const recipientKey = recipients.map(r => r.requestId).join('|');
  useEffect(() => {
    setSelectedIds(new Set(recipients.map(r => r.requestId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientKey]);

  const sendList = useMemo(
    () => recipients.filter(r => selectedIds.has(r.requestId)),
    [recipients, selectedIds],
  );

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const selectAll = () => setSelectedIds(new Set(recipients.map(r => r.requestId)));
  const clearAll = () => setSelectedIds(new Set());
  const allSelected = recipients.length > 0 && sendList.length === recipients.length;

  const clearFilters = () => {
    setClassFilter([]);
    setSectionFilter([]);
    setGenderFilter([]);
    setSearch('');
    setMinAmount('');
  };
  const activeFilterCount =
    classFilter.length + sectionFilter.length + genderFilter.length + (search.trim() ? 1 : 0) + (minAmount.trim() ? 1 : 0);

  const GENDERS = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'other', label: 'Other' },
  ];

  const pendingCount = requests.filter(r => r.status === 'pending' || r.status === 'partially_paid').length;
  const overdueCount = requests.filter(r => r.dueDate && r.dueDate < today && r.status !== 'paid').length;
  const noPhoneCount = students.filter(s => !s.parentDetails?.phone).length;

  const handleSend = async () => {
    if (sendList.length === 0) {
      showToast('Select at least one parent to send to', 'error');
      return;
    }
    if (!confirm(`Send "${selectedTemplate.label}" to ${sendList.length} selected parent(s)?`)) return;

    setSending(true);
    setProgress({ done: 0, total: sendList.length, failed: 0 });

    let failed = 0;
    for (let i = 0; i < sendList.length; i++) {
      const r = sendList[i];
      try {
        const res = await fetch('/api/whatsapp/send-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: r.phone,
            templateName: template,
            parameters: buildParams(template, r),
          }),
        });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: sendList.length, failed });
      if (i < sendList.length - 1) await new Promise(res => setTimeout(res, 500));
    }

    const filterSummary = activeFilterCount === 0
      ? 'All Classes'
      : [
          classFilter.length ? `${classFilter.length} class(es)` : '',
          sectionFilter.length ? `${sectionFilter.length} section(s)` : '',
          genderFilter.length ? genderFilter.join('/') : '',
        ].filter(Boolean).join(', ') || 'Custom';

    try {
      await addDoc(collection(db, 'whatsappLogs'), {
        templateName: template,
        filter: filterSummary,
        total: sendList.length,
        failed,
        sentBy: user.uid,
        sentByName: user.displayName || user.email || 'Admin',
        sentAt: serverTimestamp(),
      });
      await logActivity(user, 'WhatsApp Blast Sent', 'Super Admin', `${template} sent to ${sendList.length - failed}/${sendList.length} parents`, { template, total: sendList.length, failed });
    } catch { /* non-fatal */ }

    setSending(false);
    showToast(
      failed === 0
        ? `Successfully sent to ${sendList.length} parent(s)`
        : `Sent ${sendList.length - failed}/${sendList.length} — ${failed} failed`,
      failed === 0 ? 'success' : 'error',
    );
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-slate-100 rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl" />)}
        </div>
        <div className="h-64 bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-green-600 to-emerald-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-green-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">WhatsApp Blast</h1>
          <p className="text-xs text-green-200 mt-0.5">Send fee reminders to parents</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black text-amber-300">{pendingCount}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Pending</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black text-rose-300">{overdueCount}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Overdue</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black">{sendList.length}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Selected</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-24 space-y-4">
          {/* Template picker */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Select Template</p>
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all active:scale-98 ${template === t.id ? 'border-green-500 bg-green-50' : 'border-slate-100 bg-white'}`}
              >
                <p className="text-sm font-bold text-slate-800">{t.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
              </button>
            ))}
          </div>

          {/* Advanced filters */}
          <div className="space-y-3 bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Filter className="w-3 h-3" /> Filter Recipients
              </p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-[11px] font-bold text-rose-600 flex items-center gap-0.5 active:scale-95">
                  <X className="w-3 h-3" /> Clear ({activeFilterCount})
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

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Min. Outstanding (₹)</p>
              <input
                type="number"
                min={0}
                value={minAmount}
                onChange={e => setMinAmount(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-green-400"
              />
            </div>
          </div>

          {/* Recipients summary */}
          <div className={`flex items-center gap-3 p-4 rounded-2xl ${sendList.length > 0 ? 'bg-green-50 border border-green-100' : 'bg-slate-50 border border-slate-100'}`}>
            <Users className={`w-5 h-5 ${sendList.length > 0 ? 'text-green-600' : 'text-slate-400'}`} />
            <div>
              <p className="text-sm font-bold text-slate-800">
                {sendList.length} of {recipients.length} selected
              </p>
              {noPhoneCount > 0 && (
                <p className="text-xs text-amber-600 mt-0.5">{noPhoneCount} student(s) skipped — no phone number</p>
              )}
            </div>
          </div>

          {/* Progress */}
          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{progress.done} / {progress.total} sent</span>
                {progress.failed > 0 && <span className="text-rose-500">{progress.failed} failed</span>}
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Selectable recipients list on mobile */}
          {recipients.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Select Parents</p>
                <button
                  onClick={allSelected ? clearAll : selectAll}
                  className="text-[11px] font-bold text-green-700 flex items-center gap-1 active:scale-95"
                >
                  {allSelected ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              </div>
              {recipients.map((r) => {
                const checked = selectedIds.has(r.requestId);
                return (
                  <button
                    key={r.requestId}
                    onClick={() => toggleSelect(r.requestId)}
                    className={`w-full text-left rounded-xl border px-4 py-3 flex items-center gap-3 transition-all active:scale-98 ${
                      checked ? 'bg-green-50 border-green-200' : 'bg-white border-slate-100'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                      checked ? 'bg-green-600 border-green-600' : 'border-slate-300 bg-white'
                    }`}>
                      {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{r.parentName}</p>
                      <p className="text-xs text-slate-500 truncate">{r.studentName} · {r.classSection}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-slate-800">{r.amount}</p>
                      <p className="text-[10px] text-slate-400">Due {fmtDate(r.dueDate)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 safe-area-bottom">
          <button
            onClick={handleSend}
            disabled={sending || sendList.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-50"
          >
            {sending
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</>
              : <><Send className="w-4 h-4" /> Send to {sendList.length} Parent{sendList.length !== 1 ? 's' : ''}</>}
          </button>
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block p-6 space-y-6 max-w-3xl">
        <PageHeader
          title="WhatsApp Notifications"
          subtitle="Send fee reminders and notices to parents via WhatsApp"
          icon={MessageSquare}
        />

        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Pending Fees"
            value={pendingCount}
            icon={Clock}
            gradient="bg-gradient-to-br from-amber-500 to-amber-600"
          />
          <StatCard
            label="Overdue"
            value={overdueCount}
            icon={AlertCircle}
            gradient="bg-gradient-to-br from-rose-500 to-rose-600"
          />
          <StatCard
            label="No Phone on Record"
            value={noPhoneCount}
            icon={Phone}
            gradient="bg-gradient-to-br from-slate-500 to-slate-600"
          />
        </div>

        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Send className="w-4 h-4 text-green-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Compose Blast</h3>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select Template</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    template === t.id
                      ? 'border-green-500 bg-green-50'
                      : 'border-slate-100 hover:border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-800">{t.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-100 p-4 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" /> Filter Recipients
              </p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs font-bold text-rose-600 flex items-center gap-1 hover:text-rose-700">
                  <X className="w-3.5 h-3.5" /> Clear filters ({activeFilterCount})
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search parent, student or phone…"
                  className="w-full h-10 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-green-400"
                />
              </div>
              <div>
                <input
                  type="number"
                  min={0}
                  value={minAmount}
                  onChange={e => setMinAmount(e.target.value)}
                  placeholder="Min. outstanding (₹)"
                  className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-green-400"
                />
              </div>
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

          <div className={`flex items-center gap-3 p-4 rounded-xl ${
            sendList.length > 0 ? 'bg-green-50 border border-green-100' : 'bg-slate-50 border border-slate-100'
          }`}>
            <Users className={`w-5 h-5 ${sendList.length > 0 ? 'text-green-600' : 'text-slate-400'}`} />
            <div>
              <p className="text-sm font-bold text-slate-800">
                {sendList.length} of {recipients.length} parent{recipients.length !== 1 ? 's' : ''} selected to receive this message
              </p>
              {noPhoneCount > 0 && (
                <p className="text-xs text-amber-600 mt-0.5">
                  {noPhoneCount} student(s) skipped — no phone number on record
                </p>
              )}
            </div>
          </div>

          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{progress.done} / {progress.total} sent</span>
                {progress.failed > 0 && <span className="text-rose-500">{progress.failed} failed</span>}
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleSend}
            disabled={sending || sendList.length === 0}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
          >
            {sending
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</>
              : <><Send className="w-4 h-4" /> Send to {sendList.length} Parent{sendList.length !== 1 ? 's' : ''}</>}
          </Button>
        </Card>

        {recipients.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                Select Recipients <span className="text-slate-400 font-medium">({sendList.length} of {recipients.length})</span>
              </h3>
              <button
                onClick={allSelected ? clearAll : selectAll}
                className="text-xs font-bold text-green-700 flex items-center gap-1.5 hover:text-green-800"
              >
                {allSelected ? <Square className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={allSelected ? clearAll : selectAll}
                        className="w-4 h-4 rounded text-green-600 focus:ring-green-500/30 cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Parent</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recipients.map((r) => {
                    const checked = selectedIds.has(r.requestId);
                    return (
                      <tr
                        key={r.requestId}
                        onClick={() => toggleSelect(r.requestId)}
                        className={`cursor-pointer ${checked ? 'bg-green-50/50 hover:bg-green-50' : 'hover:bg-slate-50/50'}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(r.requestId)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 rounded text-green-600 focus:ring-green-500/30 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{r.parentName}</td>
                        <td className="px-4 py-3 text-slate-600">{r.studentName}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{r.classSection}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">{r.amount}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(r.dueDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
