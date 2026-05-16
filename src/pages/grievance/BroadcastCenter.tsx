import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, Student, FeeRequest, Class, BroadcastLog } from '../../types';
import { PageHeader, Card, Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { Megaphone, Users, Send, CheckCircle2, XCircle, Clock, Filter } from 'lucide-react';
import { cn, fmtMonthYear } from '../../lib/utils';

const PAYMENT_LINK = 'https://ehs.elnode.in/parent/fees';

const TEMPLATES = [
  {
    id: 'fee_due_reminder',
    label: 'Fee Due Reminder',
    description: 'Remind parents of upcoming/pending fee dues',
    statuses: ['pending', 'partially_paid'],
  },
  {
    id: 'fee_overdue_notice',
    label: 'Overdue Fee Notice',
    description: 'Stronger notice for overdue fees',
    statuses: ['pending', 'overdue', 'partially_paid'],
  },
  {
    id: 'general_announcement',
    label: 'General Announcement',
    description: 'Send a custom announcement to selected parents',
    statuses: [],
  },
] as const;

type TemplateId = typeof TEMPLATES[number]['id'];

interface Recipient {
  phone: string;
  parentName: string;
  studentName: string;
  classSection: string;
  amount?: string;
  month?: string;
  dueDate?: string;
}

export default function BroadcastCenter({ user }: { user: UserProfile }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [requests, setRequests] = useState<FeeRequest[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [broadcastLogs, setBroadcastLogs] = useState<BroadcastLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [template, setTemplate] = useState<TemplateId>('fee_due_reminder');
  const [classFilter, setClassFilter] = useState('all');
  const [customMessage, setCustomMessage] = useState('');
  const [individualPhone, setIndividualPhone] = useState('');
  const [individualParent, setIndividualParent] = useState('');
  const [mode, setMode] = useState<'bulk' | 'individual'>('bulk');

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  const { showToast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [stuSnap, reqSnap, clsSnap, logSnap] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'feeRequests')),
          getDocs(collection(db, 'classes')),
          getDocs(query(collection(db, 'broadcastLogs'), orderBy('sentAt', 'desc'), limit(20))),
        ]);
        setStudents(stuSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
        setRequests(reqSnap.docs.map(d => ({ id: d.id, ...d.data() } as FeeRequest)));
        setClasses(clsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
        setBroadcastLogs(logSnap.docs.map(d => ({ id: d.id, ...d.data() } as BroadcastLog)));
      } catch {
        showToast('Failed to load data', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedTemplate = TEMPLATES.find(t => t.id === template)!;
  const studentMap = Object.fromEntries(students.map(s => [s.id, s]));

  const recipients: Recipient[] = (() => {
    if (template === 'general_announcement') {
      return students
        .filter(s => classFilter === 'all' || s.classId === classFilter)
        .filter(s => s.parentDetails?.phone)
        .map(s => ({
          phone: s.parentDetails!.phone!,
          parentName: s.parentDetails?.fatherName || 'Parent',
          studentName: s.name,
          classSection: `${s.classId} ${s.section}`.trim(),
        }));
    }
    return requests
      .filter(r => selectedTemplate.statuses.includes(r.status as any))
      .flatMap(r => {
        const student = studentMap[r.studentId];
        if (!student?.parentDetails?.phone) return [];
        if (classFilter !== 'all' && student.classId !== classFilter) return [];
        return [{
          phone: student.parentDetails.phone,
          parentName: student.parentDetails.fatherName || 'Parent',
          studentName: student.name,
          classSection: `${student.classId} ${student.section}`.trim(),
          amount: `Rs. ${((r.totalAmount || 0) - (r.paidAmount || 0)).toLocaleString('en-IN')}`,
          month: fmtMonthYear(r.month),
          dueDate: r.dueDate || '',
        }];
      });
  })();

  const buildParams = (r: Recipient): string[] => {
    if (template === 'general_announcement') {
      return [r.parentName, customMessage, r.studentName, r.classSection, PAYMENT_LINK];
    }
    return [r.parentName, r.amount || '', r.studentName, r.classSection, r.month || '', r.dueDate || '', PAYMENT_LINK];
  };

  const handleBulkSend = async () => {
    if (sending || recipients.length === 0) return;
    setSending(true);
    setProgress({ done: 0, total: recipients.length, failed: 0 });
    let done = 0;
    let failed = 0;

    for (const r of recipients) {
      try {
        const res = await fetch('/api/whatsapp/send-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: r.phone, templateName: template, parameters: buildParams(r) }),
        });
        if (res.ok) done++; else failed++;
      } catch { failed++; }
      setProgress({ done: done + failed, total: recipients.length, failed });
    }

    // Log
    try {
      const logEntry = {
        templateName: template,
        audience: classFilter === 'all' ? 'All Classes' : classFilter,
        totalSent: done,
        totalFailed: failed,
        sentAt: new Date().toISOString(),
        sentBy: user.name,
      };
      const docRef = await addDoc(collection(db, 'broadcastLogs'), logEntry);
      setBroadcastLogs(prev => [{ id: docRef.id, ...logEntry }, ...prev.slice(0, 19)]);
    } catch {}

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
      const params = template === 'general_announcement'
        ? [individualParent || 'Parent', customMessage, '', '', PAYMENT_LINK]
        : [individualParent || 'Parent', '', '', '', '', '', PAYMENT_LINK];

      const res = await fetch('/api/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, templateName: template, parameters: params }),
      });
      if (res.ok) {
        showToast('Message sent successfully', 'success');
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

            {template === 'general_announcement' && (
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

          {/* Audience (bulk only) */}
          {mode === 'bulk' && (
            <Card>
              <h3 className="text-sm font-bold text-slate-700 mb-3">Audience Filter</h3>
              <select
                value={classFilter}
                onChange={e => setClassFilter(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/20 bg-white mb-4"
              >
                <option value="all">All Classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              {/* Preview */}
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Recipients Preview</p>
                  <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">{recipients.length} contacts</span>
                </div>
                {loading ? (
                  <p className="text-xs text-slate-400">Loading...</p>
                ) : recipients.length === 0 ? (
                  <p className="text-xs text-slate-400">No matching recipients</p>
                ) : (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {recipients.slice(0, 8).map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-medium">{r.parentName} ({r.studentName})</span>
                        <span className="text-slate-400">{r.classSection}</span>
                      </div>
                    ))}
                    {recipients.length > 8 && <p className="text-xs text-slate-400">...and {recipients.length - 8} more</p>}
                  </div>
                )}
              </div>

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
                disabled={sending || recipients.length === 0 || (template === 'general_announcement' && !customMessage.trim())}
                className="w-full mt-4 bg-green-500 hover:bg-green-600 text-white"
              >
                <Send className="w-4 h-4 mr-2" />
                {sending ? `Sending (${progress?.done || 0}/${progress?.total || 0})...` : `Send to ${recipients.length} Contacts`}
              </Button>
            </Card>
          )}

          {/* Individual */}
          {mode === 'individual' && (
            <Card>
              <h3 className="text-sm font-bold text-slate-700 mb-3">Individual Send</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Parent Name (optional)</label>
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
                {template === 'general_announcement' && (
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
                  disabled={sending || !individualPhone.trim() || (template === 'general_announcement' && !customMessage.trim())}
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
            {loading ? (
              <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500" /></div>
            ) : broadcastLogs.length === 0 ? (
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
