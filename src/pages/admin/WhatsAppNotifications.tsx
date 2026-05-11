import React, { useState, useEffect } from 'react';
import {
  MessageSquare, Send, Users, AlertCircle, CheckCircle2,
  Clock, Filter, RefreshCw, Phone,
} from 'lucide-react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, Student, FeeRequest, Class } from '../../types';
import { useToast } from '../../components/Toast';
import { PageHeader, Card, Button, FormField, Select, StatCard } from '../../components/ui';
import { logActivity } from '../../services/activityService';

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
    id: 'fee_due_reminder',
    label: 'Fee Due Reminder',
    description: 'For pending / partially paid fees — sent before or on the due date',
    statuses: ['pending', 'partially_paid'],
    includeOverdue: false,
  },
  {
    id: 'fee_overdue_notice',
    label: 'Overdue Fee Notice',
    description: 'Stronger reminder for fees past the due date',
    statuses: ['pending', 'partially_paid', 'overdue'],
    includeOverdue: true,
  },
] as const;

function buildParams(template: typeof TEMPLATES[number]['id'], r: RecipientRow): string[] {
  if (template === 'fee_due_reminder') {
    return [r.parentName, r.amount, r.studentName, r.classSection, r.month, r.dueDate, PAYMENT_LINK];
  }
  return [r.parentName, r.amount, r.studentName, r.classSection, r.month, r.dueDate, PAYMENT_LINK];
}

export default function WhatsAppNotifications({ user }: { user: UserProfile }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [requests, setRequests] = useState<FeeRequest[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);

  const [template, setTemplate] = useState<typeof TEMPLATES[number]['id']>('fee_due_reminder');
  const [classFilter, setClassFilter] = useState('all');

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

  const recipients: RecipientRow[] = requests
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
      if (classFilter !== 'all' && student.classId !== classFilter) return [];

      const cls = classes.find(c => c.id === student.classId);
      const classSection = `${cls?.name || student.classId} - ${student.section}`;
      const outstanding = r.totalAmount - (r.paidAmount || 0) - (r.waivedAmount || 0) + (r.fineAmount || 0);
      if (outstanding <= 0) return [];

      return [{
        phone: student.parentDetails.phone,
        parentName: student.parentDetails.fatherName || 'Parent',
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

  const pendingCount = requests.filter(r => r.status === 'pending' || r.status === 'partially_paid').length;
  const overdueCount = requests.filter(r => r.dueDate && r.dueDate < today && r.status !== 'paid').length;
  const noPhoneCount = students.filter(s => !s.parentDetails?.phone).length;

  const handleSend = async () => {
    if (recipients.length === 0) {
      showToast('No recipients match the current filter', 'error');
      return;
    }
    if (!confirm(`Send "${selectedTemplate.label}" to ${recipients.length} parent(s)?`)) return;

    setSending(true);
    setProgress({ done: 0, total: recipients.length, failed: 0 });

    let failed = 0;
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
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
      setProgress({ done: i + 1, total: recipients.length, failed });
      if (i < recipients.length - 1) await new Promise(res => setTimeout(res, 500));
    }

    try {
      await addDoc(collection(db, 'whatsappLogs'), {
        templateName: template,
        filter: classFilter === 'all' ? 'All Classes' : classes.find(c => c.id === classFilter)?.name || classFilter,
        total: recipients.length,
        failed,
        sentBy: user.uid,
        sentByName: user.displayName || user.email || 'Admin',
        sentAt: serverTimestamp(),
      });
      await logActivity(user, 'WhatsApp Blast Sent', `${template} sent to ${recipients.length - failed}/${recipients.length} parents`);
    } catch { /* non-fatal */ }

    setSending(false);
    showToast(
      failed === 0
        ? `Successfully sent to ${recipients.length} parent(s)`
        : `Sent ${recipients.length - failed}/${recipients.length} — ${failed} failed`,
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
              <p className="text-xl font-black">{recipients.length}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Recipients</p>
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

          {/* Class filter */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Filter by Class</p>
            <select
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
            >
              <option value="all">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Recipients preview */}
          <div className={`flex items-center gap-3 p-4 rounded-2xl ${recipients.length > 0 ? 'bg-green-50 border border-green-100' : 'bg-slate-50 border border-slate-100'}`}>
            <Users className={`w-5 h-5 ${recipients.length > 0 ? 'text-green-600' : 'text-slate-400'}`} />
            <div>
              <p className="text-sm font-bold text-slate-800">
                {recipients.length} parent{recipients.length !== 1 ? 's' : ''} will receive this message
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

          {/* Recipients list on mobile */}
          {recipients.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Recipients Preview</p>
              {recipients.slice(0, 5).map((r, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{r.parentName}</p>
                    <p className="text-xs text-slate-500">{r.studentName} · {r.classSection}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-800">{r.amount}</p>
                    <p className="text-[10px] text-slate-400">Due {r.dueDate}</p>
                  </div>
                </div>
              ))}
              {recipients.length > 5 && (
                <p className="text-xs text-center text-slate-400 font-medium">+{recipients.length - 5} more</p>
              )}
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 safe-area-bottom">
          <button
            onClick={handleSend}
            disabled={sending || recipients.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-50"
          >
            {sending
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</>
              : <><Send className="w-4 h-4" /> Send to {recipients.length} Parent{recipients.length !== 1 ? 's' : ''}</>}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Filter by Class">
              <Select
                value={classFilter}
                onChange={e => setClassFilter(e.target.value)}
              >
                <option value="all">All Classes</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className={`flex items-center gap-3 p-4 rounded-xl ${
            recipients.length > 0 ? 'bg-green-50 border border-green-100' : 'bg-slate-50 border border-slate-100'
          }`}>
            <Users className={`w-5 h-5 ${recipients.length > 0 ? 'text-green-600' : 'text-slate-400'}`} />
            <div>
              <p className="text-sm font-bold text-slate-800">
                {recipients.length} parent{recipients.length !== 1 ? 's' : ''} will receive this message
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
            disabled={sending || recipients.length === 0}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
          >
            {sending
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</>
              : <><Send className="w-4 h-4" /> Send to {recipients.length} Parent{recipients.length !== 1 ? 's' : ''}</>}
          </Button>
        </Card>

        {recipients.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Recipients Preview</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Parent</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recipients.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.parentName}</td>
                      <td className="px-4 py-3 text-slate-600">{r.studentName}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{r.classSection}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{r.amount}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{r.dueDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
