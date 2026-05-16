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
  PageHeader,
  Card,
  Button,
  Badge,
  Modal,
  FormField,
  Input,
  Select,
  Spinner,
  EmptyState,
  Textarea,
} from '../../components/ui';
import { useToast } from '../../components/Toast';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { logActivity } from '../../services/activityService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Default casual leave quota; individual teachers may have `casualLeaveQuota`
// set on their teacher doc (loaded at runtime and stored in teacherQuota state).
const DEFAULT_CASUAL_LEAVE_QUOTA = 12;

function countDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  // differenceInCalendarDays is DST-safe (date-fns operates on midnight UTC)
  const diff = differenceInCalendarDays(parseISO(endDate), parseISO(startDate));
  return diff < 0 ? 0 : diff + 1; // inclusive
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

// ─── Status Badge ─────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeacherLeaves({ user }: { user: UserProfile }) {
  const { showToast } = useToast();

  // State
  const [leaves, setLeaves] = useState<TeacherLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [viewLeave, setViewLeave] = useState<TeacherLeaveRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [casualLeaveQuota, setCasualLeaveQuota] = useState(DEFAULT_CASUAL_LEAVE_QUOTA);

  // Form state
  const [leaveType, setLeaveType] = useState<TeacherLeaveType>('casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [substitutePreference, setSubstitutePreference] = useState('');

  const totalDays = countDays(startDate, endDate);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      const teacherId = user.teacherId ?? user.uid;

      // Load per-teacher casual leave quota if set on the teacher doc
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

  // ─── Statistics ─────────────────────────────────────────────────────────────

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

  // ─── Apply Leave ────────────────────────────────────────────────────────────

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

  // ─── Cancel Leave ────────────────────────────────────────────────────────────

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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Mobile UI ─────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        {/* Mobile Header */}
        <div className="bg-gradient-to-br from-teal-600 to-emerald-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-200">Teacher Portal</p>
          <h1 className="text-xl font-bold mt-0.5">My Leaves</h1>
          <p className="text-xs text-teal-100 mt-0.5">{totalApplied} applied this year · {pendingCount} pending</p>

          {/* Stats row */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{totalApplied}</p>
              <p className="text-[9px] text-white/70 uppercase">Applied</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{approvedDays}</p>
              <p className="text-[9px] text-white/70 uppercase">Approved</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{pendingCount}</p>
              <p className="text-[9px] text-white/70 uppercase">Pending</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{availableCasual}</p>
              <p className="text-[9px] text-white/70 uppercase">Casual</p>
            </div>
          </div>

          <button
            onClick={() => setApplyModalOpen(true)}
            className="mt-3 w-full py-2.5 rounded-xl bg-white/20 backdrop-blur border border-white/30 text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" /> Apply for Leave
          </button>
        </div>

        {/* Mobile Leave Cards */}
        <div className="px-4 pt-4 space-y-2.5">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading...</div>
          ) : leaves.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No leave requests yet</p>
              <p className="text-xs text-slate-400 mt-1">Tap "Apply for Leave" to get started</p>
            </div>
          ) : (
            leaves.map(leave => (
              <div key={leave.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">{leaveTypeLabel(leave.leaveType)}</p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <CalendarDays className="w-3 h-3" />
                      {format(new Date(leave.startDate), 'd MMM')}
                      {leave.endDate !== leave.startDate ? ` → ${format(new Date(leave.endDate), 'd MMM')}` : ''}
                      <span className="ml-1 text-slate-400">({leave.totalDays}d)</span>
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{leave.reason}</p>
                  </div>
                  <StatusBadge status={leave.status} remarks={leave.principalRemarks} />
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setViewLeave(leave)}
                    className="flex-1 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold active:scale-95 transition-transform"
                  >
                    View Details
                  </button>
                  {leave.status === 'pending' && (
                    <button
                      onClick={() => handleCancel(leave)}
                      disabled={cancelling === leave.id}
                      className="flex-1 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                    >
                      {cancelling === leave.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Desktop UI ────────────────────────────────────────────────────── */}
      <div className="hidden md:block space-y-6">
        <PageHeader
          title="My Leaves"
          subtitle="Apply and track your leave requests"
          icon={CalendarDays}
          iconColor="bg-teal-500"
          actions={
            <Button variant="primary" icon={Plus} onClick={() => setApplyModalOpen(true)}>
              Apply for Leave
            </Button>
          }
        />

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500 rounded-lg text-white">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Applied</p>
                <h3 className="text-2xl font-black text-slate-900">{totalApplied}</h3>
                <p className="text-[10px] text-slate-400">this year</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500 rounded-lg text-white">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Approved Days</p>
                <h3 className="text-2xl font-black text-emerald-600">{approvedDays}</h3>
                <p className="text-[10px] text-slate-400">days off granted</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-amber-50 to-white border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500 rounded-lg text-white">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending</p>
                <h3 className="text-2xl font-black text-amber-600">{pendingCount}</h3>
                <p className="text-[10px] text-slate-400">awaiting approval</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-teal-50 to-white border-teal-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-500 rounded-lg text-white">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Casual Available</p>
                <h3 className="text-2xl font-black text-teal-600">{availableCasual}</h3>
                <p className="text-[10px] text-slate-400">of {CASUAL_LEAVE_QUOTA} remaining</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Leaves Table */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">Leave History</h2>
            <span className="text-xs text-slate-400 font-medium">{leaves.length} requests</span>
          </div>

          {loading ? (
            <Spinner />
          ) : leaves.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No leave requests yet"
              description="Apply for leave using the button above and it will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Leave Type</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Dates</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Days</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Reason</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-right py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map(leave => (
                    <tr key={leave.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors group">
                      <td className="py-4 px-6">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{leaveTypeLabel(leave.leaveType)}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Submitted {format(new Date(leave.submittedAt), 'd MMM yyyy')}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1">
                          <CalendarDays className="w-3.5 h-3.5 text-teal-500" />
                          {format(new Date(leave.startDate), 'd MMM')}
                          {leave.endDate !== leave.startDate
                            ? ` – ${format(new Date(leave.endDate), 'd MMM')}`
                            : ''}
                        </p>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-sm font-bold text-slate-700">{leave.totalDays}</span>
                        <span className="text-xs text-slate-400 ml-1">day{leave.totalDays !== 1 ? 's' : ''}</span>
                      </td>
                      <td className="py-4 px-4 max-w-[220px]">
                        <p className="text-sm text-slate-600 truncate">{leave.reason}</p>
                      </td>
                      <td className="py-4 px-4">
                        <StatusBadge status={leave.status} remarks={leave.principalRemarks} />
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => setViewLeave(leave)}
                          >
                            View
                          </Button>
                          {leave.status === 'pending' && (
                            <Button
                              variant="danger"
                              size="xs"
                              loading={cancelling === leave.id}
                              onClick={() => handleCancel(leave)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Apply Leave Modal ─────────────────────────────────────────────── */}
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
                You have used all {CASUAL_LEAVE_QUOTA} casual leave days for this year.
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

      {/* ── View Leave Modal ──────────────────────────────────────────────── */}
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
              <Card className="p-4 bg-slate-50 border-none shadow-none">
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
              </Card>

              <Card className="p-4 bg-slate-50 border-none shadow-none">
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
              </Card>
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
