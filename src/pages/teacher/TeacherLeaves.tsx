import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  AlertCircle,
  FileText,
  Ban,
} from 'lucide-react';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, TeacherLeaveRequest, TeacherLeaveType } from '../../types';
import {
  Badge,
  Modal,
  FormField,
  Input,
  Select,
  Spinner,
  Textarea,
  Button,
} from '../../components/ui';
import { useToast } from '../../components/Toast';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { logActivity } from '../../services/activityService';
import { fmtDate } from '../../lib/utils';

type TeacherLeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

const DEFAULT_CASUAL_LEAVE_QUOTA = 12;

function countDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const diff = differenceInCalendarDays(parseISO(endDate), parseISO(startDate));
  return diff < 0 ? 0 : diff + 1;
}

function currentYearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function leaveTypeLabel(type: TeacherLeaveType): string {
  const map: Record<TeacherLeaveType, string> = {
    casual: 'Casual Leave',
    medical: 'Medical Leave',
    emergency: 'Emergency Leave',
    half_day: 'Half Day',
    comp_off: 'Comp Off',
    earned: 'Earned Leave',
  };
  return map[type] ?? type;
}

function statusColor(status: TeacherLeaveStatus): string {
  switch (status) {
    case 'approved': return 'var(--leaf)';
    case 'rejected': return 'var(--coral)';
    case 'pending': return '#F59E0B';
    case 'cancelled': return 'var(--ink-3)';
    default: return 'var(--ink-3)';
  }
}

function StatusBadge({ status, remarks }: { status: TeacherLeaveStatus; remarks?: string }) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="warning" className="flex items-center gap-1 whitespace-nowrap">
          <Clock className="w-3 h-3" /> Awaiting Principal
        </Badge>
      );
    case 'approved':
      return (
        <Badge variant="success" className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Approved
        </Badge>
      );
    case 'rejected':
      return (
        <div className="space-y-1">
          <Badge variant="error" className="flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Rejected
          </Badge>
          {remarks && (
            <p className="text-[10px] text-red-600 leading-snug max-w-[160px]">{remarks}</p>
          )}
        </div>
      );
    case 'cancelled':
      return (
        <Badge className="flex items-center gap-1 bg-slate-100 text-slate-500">
          <Ban className="w-3 h-3" /> Cancelled
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function TeacherLeaves({ user }: { user: UserProfile }) {
  const { showToast } = useToast();

  const [leaves, setLeaves] = useState<TeacherLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [viewLeave, setViewLeave] = useState<TeacherLeaveRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [casualLeaveQuota, setCasualLeaveQuota] = useState(DEFAULT_CASUAL_LEAVE_QUOTA);

  const [leaveType, setLeaveType] = useState<TeacherLeaveType>('casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [substitutePreference, setSubstitutePreference] = useState('');

  const totalDays = countDays(startDate, endDate);

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      const teacherId = user.teacherId ?? user.uid;

      if (user.teacherId) {
        const teacherSnap = await getDoc(doc(db, 'teachers', user.teacherId));
        if (teacherSnap.exists()) {
          const quota = teacherSnap.data().casualLeaveQuota;
          if (typeof quota === 'number' && quota >= 0) {
            setCasualLeaveQuota(quota);
          }
        }
      }

      const q = query(
        collection(db, 'teacherLeaves'),
        where('teacherId', '==', teacherId),
        orderBy('submittedAt', 'desc'),
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as TeacherLeaveRequest));
      setLeaves(list);
    } catch (err) {
      console.error('Error fetching teacher leaves:', err);
      showToast('Failed to load leave requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yearStart = currentYearStart();
  const thisYearLeaves = leaves.filter(l => l.submittedAt >= yearStart && l.status !== 'cancelled');
  const totalApplied = thisYearLeaves.length;
  const approvedDays = thisYearLeaves
    .filter(l => l.status === 'approved')
    .reduce((sum, l) => sum + l.totalDays, 0);
  const pendingCount = leaves.filter(l => l.status === 'pending').length;
  const usedCasualDays = thisYearLeaves
    .filter(l => l.leaveType === 'casual' && l.status === 'approved')
    .reduce((sum, l) => sum + l.totalDays, 0);
  const availableCasual = Math.max(0, casualLeaveQuota - usedCasualDays);

  const resetForm = () => {
    setLeaveType('casual');
    setStartDate('');
    setEndDate('');
    setReason('');
    setSubstitutePreference('');
  };

  const handleApply = async () => {
    if (!startDate || !endDate) {
      showToast('Please select start and end dates', 'error');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      showToast('End date cannot be before start date', 'error');
      return;
    }
    if (!reason.trim()) {
      showToast('Please provide a reason for leave', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const now = new Date().toISOString();
      const teacherId = user.teacherId ?? user.uid;
      const payload: Omit<TeacherLeaveRequest, 'id'> = {
        teacherId,
        teacherName: user.name,
        leaveType,
        startDate,
        endDate,
        totalDays,
        reason: reason.trim(),
        substitutePreference: substitutePreference.trim() || undefined,
        status: 'pending',
        submittedAt: now,
        updatedAt: now,
      };

      await addDoc(collection(db, 'teacherLeaves'), payload);

      await logActivity(
        user,
        'Leave Applied',
        'Teachers',
        `${leaveTypeLabel(leaveType)} applied for ${totalDays} day(s) from ${startDate} to ${endDate}`,
        { leaveType, startDate, endDate, totalDays }
      );

      showToast('Leave application submitted successfully', 'success');
      setApplyModalOpen(false);
      resetForm();
      fetchLeaves();
    } catch (err) {
      console.error('Error submitting leave:', err);
      showToast('Failed to submit leave application', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (leave: TeacherLeaveRequest) => {
    try {
      setCancelling(leave.id);
      await updateDoc(doc(db, 'teacherLeaves', leave.id), {
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      });

      await logActivity(
        user,
        'Leave Cancelled',
        'Teachers',
        `Cancelled ${leaveTypeLabel(leave.leaveType)} leave request for ${fmtDate(leave.startDate)}`,
        { leaveId: leave.id }
      );

      showToast('Leave request cancelled', 'success');
      fetchLeaves();
    } catch (err) {
      console.error('Error cancelling leave:', err);
      showToast('Failed to cancel leave request', 'error');
    } finally {
      setCancelling(null);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="pad">
          <p className="eyebrow">{pendingCount > 0 ? `${pendingCount} pending` : `${totalApplied} this year`}</p>
          <h1 className="display">Leaves</h1>
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: '2rem' }}>
        <div className="stack">
          {/* Stats + apply row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem' }}>
            <div className="card" style={{ padding: '0.875rem', textAlign: 'center' }}>
              <p className="t-num" style={{ fontSize: '1.5rem' }}>{totalApplied}</p>
              <p className="eyebrow" style={{ marginTop: '0.25rem' }}>Applied</p>
            </div>
            <div className="card" style={{ padding: '0.875rem', textAlign: 'center' }}>
              <p className="t-num" style={{ fontSize: '1.5rem', color: 'var(--leaf)' }}>{approvedDays}</p>
              <p className="eyebrow" style={{ marginTop: '0.25rem' }}>Approved</p>
            </div>
            <div className="card" style={{ padding: '0.875rem', textAlign: 'center' }}>
              <p className="t-num" style={{ fontSize: '1.5rem', color: '#F59E0B' }}>{pendingCount}</p>
              <p className="eyebrow" style={{ marginTop: '0.25rem' }}>Pending</p>
            </div>
            <div className="card" style={{ padding: '0.875rem', textAlign: 'center' }}>
              <p className="t-num" style={{ fontSize: '1.5rem' }}>{availableCasual}</p>
              <p className="eyebrow" style={{ marginTop: '0.25rem' }}>Casual</p>
            </div>
          </div>

          <button
            onClick={() => setApplyModalOpen(true)}
            className="btn accent"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}
          >
            <Plus className="w-4 h-4" />
            Apply for Leave
          </button>

          {/* Leave cards */}
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : leaves.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <CalendarDays className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ink-3)' }} />
              <p style={{ fontWeight: 700, color: 'var(--ink)' }}>No leave requests yet</p>
              <p className="muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                Apply for leave using the button above.
              </p>
            </div>
          ) : (
            <div className="stack" style={{ gap: '0.5rem' }}>
              {leaves.map(leave => (
                <div
                  key={leave.id}
                  className="card"
                  style={{ padding: '1rem', borderLeft: `3px solid ${statusColor(leave.status)}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)' }}>
                        {leaveTypeLabel(leave.leaveType)}
                      </p>
                      <p className="muted" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                        <CalendarDays className="w-3 h-3" />
                        {format(new Date(leave.startDate), 'd MMM')}
                        {leave.endDate !== leave.startDate ? ` → ${format(new Date(leave.endDate), 'd MMM')}` : ''}
                        <span style={{ marginLeft: '0.25rem' }}>({leave.totalDays}d)</span>
                      </p>
                      <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {leave.reason}
                      </p>
                    </div>
                    <StatusBadge status={leave.status} remarks={leave.principalRemarks} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button
                      onClick={() => setViewLeave(leave)}
                      className="btn ghost"
                      style={{ flex: 1, fontSize: '0.75rem' }}
                    >
                      View Details
                    </button>
                    {leave.status === 'pending' && (
                      <button
                        onClick={() => handleCancel(leave)}
                        disabled={cancelling === leave.id}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          borderRadius: '0.625rem',
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--coral)',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          opacity: cancelling === leave.id ? 0.5 : 1,
                        }}
                      >
                        {cancelling === leave.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Apply Leave Modal */}
      <Modal
        isOpen={applyModalOpen}
        onClose={() => { setApplyModalOpen(false); resetForm(); }}
        title="Apply for Leave"
        subtitle="Submit a leave request for principal approval"
        size="md"
      >
        <div className="space-y-4">
          <FormField label="Leave Type" required>
            <Select
              value={leaveType}
              onChange={e => setLeaveType(e.target.value as TeacherLeaveType)}
            >
              <option value="casual">Casual Leave</option>
              <option value="medical">Medical Leave</option>
              <option value="emergency">Emergency Leave</option>
              <option value="half_day">Half Day</option>
              <option value="comp_off">Comp Off</option>
              <option value="earned">Earned Leave</option>
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" required>
              <Input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
                }}
              />
            </FormField>
            <FormField label="End Date" required>
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </FormField>
          </div>

          {totalDays > 0 && (
            <div className="px-3 py-2 bg-teal-50 border border-teal-100 rounded-xl flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-teal-600 shrink-0" />
              <p className="text-sm text-teal-800 font-semibold">
                {totalDays} day{totalDays !== 1 ? 's' : ''} of leave
              </p>
            </div>
          )}

          <FormField label="Reason" required>
            <Textarea
              placeholder="Briefly describe the reason for your leave request..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
            />
          </FormField>

          <FormField
            label="Substitute Preference"
            hint="Optional — suggest a colleague who can cover your classes"
          >
            <Textarea
              placeholder="e.g. Mr. Sharma can take my 10A Math periods on Monday..."
              value={substitutePreference}
              onChange={e => setSubstitutePreference(e.target.value)}
              rows={2}
            />
          </FormField>

          {leaveType === 'casual' && availableCasual === 0 && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800">
                You have used all {casualLeaveQuota} casual leave days for this year.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => { setApplyModalOpen(false); resetForm(); }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={submitting}
              onClick={handleApply}
            >
              Submit Application
            </Button>
          </div>
        </div>
      </Modal>

      {/* View Leave Modal */}
      <Modal
        isOpen={!!viewLeave}
        onClose={() => setViewLeave(null)}
        title="Leave Request Details"
        subtitle={viewLeave ? leaveTypeLabel(viewLeave.leaveType) : ''}
        size="md"
      >
        {viewLeave && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 border-none shadow-none rounded-xl">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Duration</p>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-100 rounded-lg">
                    <CalendarDays className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 leading-none">
                      {format(new Date(viewLeave.startDate), 'd MMM')}
                      {viewLeave.endDate !== viewLeave.startDate
                        ? ` – ${format(new Date(viewLeave.endDate), 'd MMM')}`
                        : ''}
                    </h4>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">
                      {viewLeave.totalDays} day{viewLeave.totalDays !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-none shadow-none rounded-xl">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Status</p>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <StatusBadge status={viewLeave.status} />
                    <p className="text-[10px] text-slate-500 font-bold mt-1.5 uppercase">
                      {format(new Date(viewLeave.submittedAt), 'd MMM yyyy')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Reason</p>
              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <p className="text-sm text-slate-600 leading-relaxed italic">"{viewLeave.reason}"</p>
              </div>
            </div>

            {viewLeave.substitutePreference && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Substitute Preference</p>
                <div className="p-4 bg-white border border-slate-200 rounded-xl">
                  <p className="text-sm text-slate-600 leading-relaxed">{viewLeave.substitutePreference}</p>
                </div>
              </div>
            )}

            {viewLeave.principalRemarks && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Principal's Remarks</p>
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <p className="text-sm text-indigo-900 font-medium">{viewLeave.principalRemarks}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              {viewLeave.status === 'pending' && (
                <Button
                  variant="danger"
                  size="sm"
                  loading={cancelling === viewLeave.id}
                  onClick={() => {
                    setViewLeave(null);
                    handleCancel(viewLeave);
                  }}
                >
                  Cancel Request
                </Button>
              )}
              <Button variant="secondary" onClick={() => setViewLeave(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
