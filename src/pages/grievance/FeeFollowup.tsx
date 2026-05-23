import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, doc,
  setDoc, updateDoc, arrayUnion,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, FeeRequest, Student, FollowupLog, FeeFollowupRecord } from '../../types';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import {
  Wallet, Phone, MessageSquare, Search, AlertTriangle, X, Send,
} from 'lucide-react';
import { cn, fmtMonthYear } from '../../lib/utils';
import { logActivity } from '../../services/activityService';

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

const FILTER_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'pending', label: 'Pending' },
  { value: 'partially_paid', label: 'Part Paid' },
];

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

  const totalOutstanding = requests.reduce((sum, r) => sum + Math.max(0, (r.totalAmount || 0) - (r.paidAmount || 0)), 0);
  const overdueCount = requests.filter(r => r.status === 'overdue').length;

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
      const studentName = student?.name || '';
      logActivity(
        user,
        'Fee Followup Logged',
        'Accounts',
        `Contacted parent of ${studentName} regarding fee`,
        { studentId: selected.studentId, type: logForm.method, outcome: logForm.note.trim() }
      );
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
      const escStudent = selected ? studentMap[selected.studentId] : null;
      const escStudentName = escStudent?.name || '';
      logActivity(
        user,
        'Fee Case Escalated',
        'Accounts',
        `Escalated fee case for ${escStudentName} due to non-payment`,
        { studentId: selected?.studentId || '', escalationLevel: 1 }
      );
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
        const studentName = student?.name || '';
        logActivity(
          user,
          'Fee Reminder Sent (WhatsApp)',
          'Accounts',
          `WhatsApp reminder sent to ${studentName}`,
          { studentId: request.studentId, phone }
        );
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
    <div className="pad stack" style={{ gap: 'var(--space-5)' }}>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="eyebrow">{overdueCount > 0 ? `${overdueCount} overdue` : 'All clear'}</div>
          <h1>Fee Follow-up</h1>
        </div>
      </div>

      {/* Hero stat */}
      <div className="card" style={{ background: 'var(--ink)', color: 'var(--cream)', borderRadius: 16, padding: '20px 24px' }}>
        <p className="eyebrow" style={{ color: 'var(--cream-2)', marginBottom: 4 }}>Total Outstanding</p>
        <p className="t-num" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
          ₹{totalOutstanding.toLocaleString('en-IN')}
        </p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
          {requests.length} open fee request{requests.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTER_CHIPS.map(c => (
          <button
            key={c.value}
            onClick={() => setFilterStatus(c.value)}
            className={cn('chip', filterStatus === c.value ? 'solid' : '')}
            style={{ cursor: 'pointer' }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search style={{ width: 14, height: 14, position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
        <input
          type="text"
          placeholder="Search by student or parent name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', paddingLeft: 36, paddingRight: 12, height: 40,
            border: '1px solid var(--line)', borderRadius: 10, fontSize: 13,
            outline: 'none', background: 'var(--cream-2)', color: 'var(--ink)', boxSizing: 'border-box',
          }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <div className="animate-spin" style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--line)', borderTopColor: 'var(--accent)', margin: '0 auto' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <Wallet style={{ width: 32, height: 32, margin: '0 auto 8px', color: 'var(--line)' }} />
          <p className="muted">No pending fees found</p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          {filtered.map(r => {
            const student = studentMap[r.studentId];
            const followup = getFollowup(r.id);
            const balance = (r.totalAmount || 0) - (r.paidAmount || 0);
            const isSelected = selected?.id === r.id;
            const overdaysDiff = r.dueDate ? Math.floor((Date.now() - new Date(r.dueDate).getTime()) / 86400000) : null;

            return (
              <div
                key={r.id}
                className="card stack"
                style={{
                  gap: 'var(--space-3)',
                  border: isSelected ? '2px solid var(--accent)' : undefined,
                  cursor: 'pointer',
                }}
                onClick={() => setSelected(isSelected ? null : r)}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{student?.name || r.studentId}</p>
                    <p className="eyebrow" style={{ marginTop: 2 }}>{student?.classId} {student?.section}</p>
                    {student?.parentDetails?.phone && (
                      <p className="mono tiny muted" style={{ marginTop: 2 }}>{student.parentDetails.phone}</p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p className="t-num" style={{ fontSize: 18, fontWeight: 800, color: 'var(--coral)' }}>
                      ₹{balance.toLocaleString('en-IN')}
                    </p>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
                      {r.status === 'overdue' && overdaysDiff !== null && overdaysDiff > 0 && (
                        <span className="chip" style={{ background: 'var(--coral)', color: '#fff', fontSize: 11 }}>
                          {overdaysDiff}d overdue
                        </span>
                      )}
                      <span className={cn('chip', r.status === 'overdue' ? '' : '')} style={{
                        fontSize: 11,
                        background: r.status === 'overdue' ? 'rgba(var(--coral-rgb),0.15)' : r.status === 'pending' ? '#fef3c7' : '#dbeafe',
                        color: r.status === 'overdue' ? 'var(--coral)' : r.status === 'pending' ? '#92400e' : '#1e40af',
                      }}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </div>
                    {followup?.isEscalated && (
                      <span className="chip" style={{ background: 'var(--coral)', color: '#fff', fontSize: 10, marginTop: 4, display: 'inline-block' }}>ESCALATED</span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handleSendWA(r)}
                    disabled={sendingWA}
                    className="btn ghost"
                    style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                  >
                    <MessageSquare style={{ width: 13, height: 13 }} />
                    {sendingWA ? 'Sending…' : 'WhatsApp'}
                  </button>
                  {student?.parentDetails?.phone && (
                    <a
                      href={`tel:${student.parentDetails.phone}`}
                      className="btn ghost"
                      style={{ flex: 1, justifyContent: 'center', fontSize: 12, textDecoration: 'none' }}
                    >
                      <Phone style={{ width: 13, height: 13 }} />
                      Call
                    </a>
                  )}
                </div>

                {/* Detail panel */}
                {isSelected && selectedStudent && (
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }} onClick={e => e.stopPropagation()}>
                    {/* Fee summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                      {[
                        { label: 'Total', value: `₹${(r.totalAmount || 0).toLocaleString('en-IN')}`, color: 'var(--ink)' },
                        { label: 'Paid', value: `₹${(r.paidAmount || 0).toLocaleString('en-IN')}`, color: 'var(--leaf)' },
                        { label: 'Balance', value: `₹${balance.toLocaleString('en-IN')}`, color: 'var(--coral)' },
                      ].map(s => (
                        <div key={s.label} className="card" style={{ textAlign: 'center', padding: '10px 8px' }}>
                          <p className="eyebrow" style={{ marginBottom: 4 }}>{s.label}</p>
                          <p className="t-num" style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Escalate */}
                    {!selectedFollowup?.isEscalated && (
                      <button
                        onClick={() => handleEscalate(r.id)}
                        disabled={escalating}
                        className="btn ghost"
                        style={{ marginBottom: 12, fontSize: 12, color: 'var(--coral)', borderColor: 'var(--coral)' }}
                      >
                        <AlertTriangle style={{ width: 13, height: 13 }} />
                        {escalating ? 'Escalating…' : 'Escalate Case'}
                      </button>
                    )}

                    {/* Log contact */}
                    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                      <p className="eyebrow" style={{ marginBottom: 8 }}>Log Contact</p>
                      <textarea
                        value={logForm.note}
                        onChange={e => setLogForm(f => ({ ...f, note: e.target.value }))}
                        placeholder="Notes from this interaction..."
                        rows={2}
                        style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 13, resize: 'none', outline: 'none', background: 'var(--cream-2)', color: 'var(--ink)', boxSizing: 'border-box', marginBottom: 8 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select
                          value={logForm.method}
                          onChange={e => setLogForm(f => ({ ...f, method: e.target.value as any }))}
                          style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontSize: 12, background: 'var(--cream-2)', color: 'var(--ink)', outline: 'none' }}
                        >
                          {contactMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <input
                          type="date"
                          value={logForm.promisedDate}
                          onChange={e => setLogForm(f => ({ ...f, promisedDate: e.target.value }))}
                          style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontSize: 12, background: 'var(--cream-2)', color: 'var(--ink)', outline: 'none' }}
                          title="Promise-to-pay date"
                        />
                        <Button onClick={handleLogContact} disabled={!logForm.note.trim() || submitting} size="sm">
                          <Send style={{ width: 13, height: 13 }} />
                          {submitting ? 'Saving...' : 'Log'}
                        </Button>
                      </div>
                    </div>

                    {/* Contact history */}
                    {selectedFollowup && (selectedFollowup.logs || []).length > 0 && (
                      <div>
                        <p className="eyebrow" style={{ marginBottom: 8 }}>Contact History</p>
                        <div className="stack" style={{ gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                          {[...selectedFollowup.logs].reverse().map(log => (
                            <div key={log.id} style={{ padding: '10px 12px', background: 'var(--cream-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <span className="chip" style={{ fontSize: 11 }}>{log.contactMethod.replace('_', ' ')}</span>
                                <span className="tiny muted">by {log.loggedBy}</span>
                                <span className="tiny muted" style={{ marginLeft: 'auto' }}>{new Date(log.createdAt).toLocaleDateString('en-IN')}</span>
                              </div>
                              <p style={{ fontSize: 13, color: 'var(--ink)' }}>{log.note}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
