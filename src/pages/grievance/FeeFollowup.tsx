import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, doc, getDoc,
  setDoc, updateDoc, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, FeeRequest, Student, FollowupLog, FeeFollowupRecord } from '../../types';
import { PageHeader, Card, Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import {
  Wallet, Phone, MessageSquare, Search, ChevronDown,
  Plus, AlertTriangle, CheckCircle2, X, Send,
} from 'lucide-react';
import { cn, fmtMonthYear } from '../../lib/utils';

const statusColor: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  partially_paid: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
};

const contactMethods = [
  { value: 'phone', label: 'Phone Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'in_person', label: 'In Person' },
  { value: 'email', label: 'Email' },
] as const;

export default function FeeFollowup({ user }: { user: UserProfile }) {
  const [requests, setRequests] = useState<FeeRequest[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [followups, setFollowups] = useState<Record<string, FeeFollowupRecord>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState<FeeRequest | null>(null);
  const [logForm, setLogForm] = useState({ note: '', method: 'phone' as const, promisedDate: '' });
  const [escalating, setEscalating] = useState(false);
  const [sendingWA, setSendingWA] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [reqSnap, stuSnap, followupSnap] = await Promise.all([
          getDocs(query(collection(db, 'feeRequests'), where('status', 'in', ['pending', 'overdue', 'partially_paid']))),
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'feeFollowups')),
        ]);
        setRequests(reqSnap.docs.map(d => ({ id: d.id, ...d.data() } as FeeRequest)));
        setStudents(stuSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
        const followupMap: Record<string, FeeFollowupRecord> = {};
        followupSnap.docs.forEach(d => { followupMap[d.id] = { id: d.id, ...d.data() } as FeeFollowupRecord; });
        setFollowups(followupMap);
      } catch (err) {
        console.error('FeeFollowup load error:', err);
        showToast('Failed to load fee data', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const studentMap = Object.fromEntries(students.map(s => [s.id, s]));

  const filtered = requests.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (search) {
      const student = studentMap[r.studentId];
      const q = search.toLowerCase();
      return (
        student?.name.toLowerCase().includes(q) ||
        student?.parentDetails?.fatherName?.toLowerCase().includes(q) ||
        (r.month && fmtMonthYear(r.month).toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getFollowup = (requestId: string) => followups[requestId];

  const handleLogContact = async () => {
    if (!selected || !logForm.note.trim() || submitting) return;
    setSubmitting(true);
    try {
      const student = studentMap[selected.studentId];
      const log: FollowupLog = {
        id: Date.now().toString(),
        note: logForm.note.trim(),
        contactMethod: logForm.method,
        loggedBy: user.name,
        createdAt: new Date().toISOString(),
      };

      const followupId = selected.id;
      const existing = followups[followupId];

      if (existing) {
        const updates: any = {
          logs: arrayUnion(log),
          lastContactedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (logForm.promisedDate) updates.promisedPaymentDate = logForm.promisedDate;
        await updateDoc(doc(db, 'feeFollowups', followupId), updates);
        setFollowups(prev => ({
          ...prev,
          [followupId]: {
            ...existing,
            logs: [...(existing.logs || []), log],
            lastContactedAt: new Date().toISOString(),
            promisedPaymentDate: logForm.promisedDate || existing.promisedPaymentDate,
          },
        }));
      } else {
        const record: FeeFollowupRecord = {
          id: followupId,
          feeRequestId: selected.id,
          studentId: selected.studentId,
          studentName: student?.name || '',
          parentPhone: student?.parentDetails?.phone || '',
          parentName: student?.parentDetails?.fatherName || '',
          classSection: `${student?.classId || ''} ${student?.section || ''}`.trim(),
          amountDue: (selected.totalAmount || 0) - (selected.paidAmount || 0),
          status: selected.status,
          logs: [log],
          promisedPaymentDate: logForm.promisedDate || undefined,
          isEscalated: false,
          lastContactedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'feeFollowups', followupId), record);
        setFollowups(prev => ({ ...prev, [followupId]: record }));
      }

      setLogForm({ note: '', method: 'phone', promisedDate: '' });
      showToast('Contact logged successfully', 'success');
    } catch {
      showToast('Failed to log contact', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEscalate = async (requestId: string) => {
    if (escalating) return;
    setEscalating(true);
    try {
      const existing = followups[requestId];
      if (existing) {
        await updateDoc(doc(db, 'feeFollowups', requestId), { isEscalated: true, updatedAt: new Date().toISOString() });
        setFollowups(prev => ({ ...prev, [requestId]: { ...existing, isEscalated: true } }));
      } else {
        const student = selected ? studentMap[selected.studentId] : null;
        const record: FeeFollowupRecord = {
          id: requestId,
          feeRequestId: requestId,
          studentId: selected?.studentId || '',
          studentName: student?.name || '',
          parentPhone: student?.parentDetails?.phone || '',
          parentName: student?.parentDetails?.fatherName || '',
          classSection: `${student?.classId || ''} ${student?.section || ''}`.trim(),
          amountDue: selected ? ((selected.totalAmount || 0) - (selected.paidAmount || 0)) : 0,
          status: selected?.status || '',
          logs: [],
          isEscalated: true,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'feeFollowups', requestId), record);
        setFollowups(prev => ({ ...prev, [requestId]: record }));
      }
      showToast('Case escalated', 'success');
    } catch {
      showToast('Failed to escalate', 'error');
    } finally {
      setEscalating(false);
    }
  };

  const handleSendWA = async (request: FeeRequest) => {
    if (sendingWA) return;
    const student = studentMap[request.studentId];
    const phone = student?.parentDetails?.phone;
    if (!phone) { showToast('No phone number on record', 'error'); return; }
    setSendingWA(true);
    try {
      const amount = ((request.totalAmount || 0) - (request.paidAmount || 0)).toLocaleString('en-IN');
      const res = await fetch('/api/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          templateName: 'fees_due_reminder',
          parameters: [
            student?.parentDetails?.fatherName || 'Parent',
            `Rs. ${amount}`,
            student?.name || '',
            `${student?.classId || ''} ${student?.section || ''}`.trim(),
            fmtMonthYear(request.month) || '',
            request.dueDate || '',
            'https://ehs.elnode.in/parent/fees',
          ],
        }),
      });
      if (res.ok) {
        showToast('WhatsApp reminder sent', 'success');
        // log it automatically
        const log: FollowupLog = {
          id: Date.now().toString(),
          note: `WhatsApp fee reminder sent (Rs. ${amount})`,
          contactMethod: 'whatsapp',
          loggedBy: user.name,
          createdAt: new Date().toISOString(),
        };
        const existing = followups[request.id];
        if (existing) {
          await updateDoc(doc(db, 'feeFollowups', request.id), {
            logs: arrayUnion(log),
            lastContactedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          setFollowups(prev => ({ ...prev, [request.id]: { ...existing, logs: [...(existing.logs || []), log], lastContactedAt: new Date().toISOString() } }));
        }
      } else {
        showToast('WhatsApp send failed', 'error');
      }
    } catch {
      showToast('Failed to send WhatsApp', 'error');
    } finally {
      setSendingWA(false);
    }
  };

  const selectedStudent = selected ? studentMap[selected.studentId] : null;
  const selectedFollowup = selected ? getFollowup(selected.id) : null;

  return (
    <div>
      <PageHeader
        title="Fee Follow-up Workbench"
        subtitle="Track and follow up on pending fee payments"
        icon={Wallet}
        iconColor="bg-amber-500"
      />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: List */}
        <div className="lg:w-2/5 space-y-4">
          <Card padding="sm">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by student or parent name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
              <option value="partially_paid">Partially Paid</option>
            </select>
          </Card>

          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" /></div>
          ) : filtered.length === 0 ? (
            <Card><p className="text-slate-400 text-sm text-center py-8">No pending fees found</p></Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(r => {
                const student = studentMap[r.studentId];
                const followup = getFollowup(r.id);
                const balance = (r.totalAmount || 0) - (r.paidAmount || 0);
                const isSelected = selected?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected(isSelected ? null : r)}
                    className={cn(
                      'w-full text-left p-4 rounded-2xl border transition-all',
                      isSelected ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-slate-100 bg-white hover:border-amber-200 hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{student?.name || r.studentId}</p>
                        <p className="text-xs text-slate-500">{student?.parentDetails?.fatherName} · {student?.classId} {student?.section}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-900">Rs. {balance.toLocaleString('en-IN')}</p>
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', statusColor[r.status] || 'bg-slate-100 text-slate-600')}>{r.status.replace('_', ' ')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {followup?.isEscalated && <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">ESCALATED</span>}
                      {followup?.lastContactedAt && <span className="text-[10px] text-slate-400">Last contact: {new Date(followup.lastContactedAt).toLocaleDateString('en-IN')}</span>}
                      {followup?.promisedPaymentDate && <span className="text-[10px] text-emerald-600">Promise: {new Date(followup.promisedPaymentDate).toLocaleDateString('en-IN')}</span>}
                    </div>
                    {r.month && <p className="text-[10px] text-slate-400 mt-1">{fmtMonthYear(r.month)}</p>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Detail */}
        <div className="lg:w-3/5">
          {selected && selectedStudent ? (
            <Card>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedStudent.name}</h2>
                  <p className="text-sm text-slate-500">{selectedStudent.parentDetails?.fatherName} · {selectedStudent.classId} {selectedStudent.section}</p>
                  <p className="text-sm text-slate-500">{selectedStudent.parentDetails?.phone}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Fee summary */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Total</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">Rs. {(selected.totalAmount || 0).toLocaleString('en-IN')}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Paid</p>
                  <p className="text-sm font-bold text-emerald-700 mt-0.5">Rs. {(selected.paidAmount || 0).toLocaleString('en-IN')}</p>
                </div>
                <div className="p-3 bg-red-50 rounded-xl text-center">
                  <p className="text-[10px] text-red-500 font-semibold uppercase">Balance</p>
                  <p className="text-sm font-bold text-red-700 mt-0.5">Rs. {((selected.totalAmount || 0) - (selected.paidAmount || 0)).toLocaleString('en-IN')}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => handleSendWA(selected)}
                  disabled={sendingWA}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                  <MessageSquare className="w-4 h-4" />
                  {sendingWA ? 'Sending...' : 'WhatsApp Reminder'}
                </button>
                {selectedFollowup && !selectedFollowup.isEscalated && (
                  <button
                    onClick={() => handleEscalate(selected.id)}
                    disabled={escalating}
                    className="flex items-center gap-2 py-2.5 px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold hover:bg-rose-100 transition-colors disabled:opacity-50"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Escalate
                  </button>
                )}
                {!selectedFollowup && (
                  <button
                    onClick={() => handleEscalate(selected.id)}
                    disabled={escalating}
                    className="flex items-center gap-2 py-2.5 px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold hover:bg-rose-100 transition-colors disabled:opacity-50"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Escalate
                  </button>
                )}
              </div>

              {/* Log contact */}
              <div className="border border-slate-200 rounded-xl p-4 mb-4">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Log Contact</p>
                <textarea
                  value={logForm.note}
                  onChange={e => setLogForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Notes from this interaction..."
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 resize-none mb-2"
                />
                <div className="flex gap-2">
                  <select
                    value={logForm.method}
                    onChange={e => setLogForm(f => ({ ...f, method: e.target.value as any }))}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none bg-white"
                  >
                    {contactMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <input
                    type="date"
                    value={logForm.promisedDate}
                    onChange={e => setLogForm(f => ({ ...f, promisedDate: e.target.value }))}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    placeholder="Promise date"
                    title="Promise-to-pay date"
                  />
                  <Button onClick={handleLogContact} disabled={!logForm.note.trim() || submitting} size="sm">
                    <Send className="w-3.5 h-3.5 mr-1" />
                    {submitting ? 'Saving...' : 'Log'}
                  </Button>
                </div>
              </div>

              {/* Contact history */}
              {selectedFollowup && (selectedFollowup.logs || []).length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Contact History</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {[...selectedFollowup.logs].reverse().map(log => (
                      <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold capitalize">{log.contactMethod.replace('_', ' ')}</span>
                          <span className="text-[10px] text-slate-400">by {log.loggedBy}</span>
                          <span className="text-[10px] text-slate-400 ml-auto">{new Date(log.createdAt).toLocaleDateString('en-IN')}</span>
                        </div>
                        <p className="text-slate-700">{log.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ) : (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <Wallet className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-slate-400 text-sm">Select a fee record to manage follow-up</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
