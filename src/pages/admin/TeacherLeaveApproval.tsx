import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardCheck,
  Search,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  AlertCircle,
  RotateCcw,
  ChevronDown,
  Users,
} from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  getDoc,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  UserProfile,
  TeacherLeaveRequest,
  SubstituteAssignment,
  Teacher,
  Timetable,
  TimetableConfig,
} from '../../types';
import {
  Card,
  Button,
  Input,
  Badge,
  PageHeader,
  Modal,
  FormField,
  Textarea,
  Select,
} from '../../components/ui';
import { useToast } from '../../components/Toast';
import { format, addDays, parseISO, isWithinInterval, startOfMonth, endOfMonth, isSunday } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { logActivity } from '../../services/activityService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubstituteRow {
  date: string;        // ISO date e.g. '2025-12-01'
  slotId: string;
  slotLabel: string;
  slotStartTime: string;
  classId: string;
  subjectId: string;
  originalTeacherId: string;
  substituteTeacherId: string; // '' = TBD
  substituteTeacherName: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDatesInRange(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  let current = parseISO(startDate);
  const end = parseISO(endDate);
  while (current <= end) {
    if (!isSunday(current)) {
      result.push(format(current, 'yyyy-MM-dd'));
    }
    current = addDays(current, 1);
  }
  return result;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getLeaveTypeBadge(type: string) {
  const map: Record<string, { label: string; variant: 'success' | 'error' | 'warning' | 'info' | 'indigo' | 'purple' | 'default' }> = {
    casual:    { label: 'Casual',    variant: 'info' },
    medical:   { label: 'Medical',   variant: 'error' },
    emergency: { label: 'Emergency', variant: 'error' },
    half_day:  { label: 'Half Day',  variant: 'warning' },
    comp_off:  { label: 'Comp Off',  variant: 'purple' },
    earned:    { label: 'Earned',    variant: 'indigo' },
  };
  const entry = map[type] ?? { label: type, variant: 'default' as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="warning" className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> Pending
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
        <Badge variant="error" className="flex items-center gap-1">
          <XCircle className="w-3 h-3" /> Rejected
        </Badge>
      );
    case 'cancelled':
      return <Badge variant="default">Cancelled</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeacherLeaveApproval({ user }: { user: UserProfile }) {
  const { showToast } = useToast();

  // ── data
  const [leaves, setLeaves] = useState<TeacherLeaveRequest[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [timetableConfig, setTimetableConfig] = useState<TimetableConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // ── filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── approval modal
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<TeacherLeaveRequest | null>(null);
  const [principalRemarks, setPrincipalRemarks] = useState('');
  const [substituteRows, setSubstituteRows] = useState<SubstituteRow[]>([]);
  const [isApproving, setIsApproving] = useState(false);

  // ── reject modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // ── revoke modal
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);

  // ─── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [leavesSnap, teachersSnap, timetablesSnap, configSnap] = await Promise.all([
        getDocs(query(collection(db, 'teacherLeaves'), orderBy('submittedAt', 'desc'))),
        getDocs(collection(db, 'teachers')),
        getDocs(collection(db, 'timetable')),
        getDoc(doc(db, 'timetableSettings', 'global')),
      ]);

      setLeaves(leavesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as TeacherLeaveRequest)));
      setTeachers(teachersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Teacher)));
      setTimetables(timetablesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Timetable)));
      if (configSnap.exists()) {
        setTimetableConfig({ id: configSnap.id, ...configSnap.data() } as TimetableConfig);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'teacherLeaves');
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── Derived stats ────────────────────────────────────────────────────────

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const today = format(now, 'yyyy-MM-dd');

  const pendingCount = useMemo(() => leaves.filter((l) => l.status === 'pending').length, [leaves]);

  const approvedThisMonth = useMemo(
    () =>
      leaves.filter(
        (l) =>
          l.status === 'approved' &&
          l.approvedAt &&
          l.approvedAt >= monthStart &&
          l.approvedAt <= monthEnd + 'T23:59:59'
      ).length,
    [leaves, monthStart, monthEnd]
  );

  const rejectedThisMonth = useMemo(
    () =>
      leaves.filter(
        (l) =>
          l.status === 'rejected' &&
          l.approvedAt &&
          l.approvedAt >= monthStart &&
          l.approvedAt <= monthEnd + 'T23:59:59'
      ).length,
    [leaves, monthStart, monthEnd]
  );

  const teachersOnLeaveToday = useMemo(
    () =>
      new Set(
        leaves
          .filter(
            (l) =>
              l.status === 'approved' && l.startDate <= today && l.endDate >= today
          )
          .map((l) => l.teacherId)
      ).size,
    [leaves, today]
  );

  // ─── Filters ─────────────────────────────────────────────────────────────

  const filteredLeaves = useMemo(() => {
    return leaves.filter((leave) => {
      const matchStatus = filterStatus === 'all' || leave.status === filterStatus;
      const matchSearch =
        !searchQuery ||
        leave.teacherName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [leaves, filterStatus, searchQuery]);

  // ─── Build substitute rows ────────────────────────────────────────────────

  const buildSubstituteRows = (leave: TeacherLeaveRequest): SubstituteRow[] => {
    if (!timetableConfig) return [];
    const dates = getDatesInRange(leave.startDate, leave.endDate);
    const rows: SubstituteRow[] = [];

    for (const dateStr of dates) {
      const dayOfWeek = format(parseISO(dateStr), 'EEEE'); // e.g. 'Monday'

      for (const timetable of timetables) {
        const daySchedule = timetable.schedule.find(
          (s) => s.day.toLowerCase() === dayOfWeek.toLowerCase()
        );
        if (!daySchedule) continue;

        for (const period of daySchedule.periods) {
          if (period.teacherId !== leave.teacherId) continue;

          const slot = timetableConfig.slots.find((s) => s.id === period.slotId);
          if (!slot || slot.type !== 'period') continue;

          // Avoid duplicate rows for same date+slot (shouldn't happen, but guard)
          const alreadyExists = rows.some(
            (r) => r.date === dateStr && r.slotId === period.slotId && r.classId === timetable.classId
          );
          if (alreadyExists) continue;

          rows.push({
            date: dateStr,
            slotId: period.slotId,
            slotLabel: slot.label,
            slotStartTime: slot.startTime,
            classId: timetable.classId,
            subjectId: period.subjectId,
            originalTeacherId: leave.teacherId,
            substituteTeacherId: '',
            substituteTeacherName: '',
          });
        }
      }
    }

    // Sort by date, then slot start time
    rows.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.slotStartTime.localeCompare(b.slotStartTime);
    });

    return rows;
  };

  // ─── Open approval modal ──────────────────────────────────────────────────

  const openApprovalModal = (leave: TeacherLeaveRequest) => {
    setSelectedLeave(leave);
    setPrincipalRemarks('');
    setSubstituteRows(buildSubstituteRows(leave));
    setApprovalModalOpen(true);
  };

  // ─── Update substitute row ────────────────────────────────────────────────

  const updateSubstituteRow = (index: number, teacherId: string) => {
    const teacher = teachers.find((t) => t.id === teacherId);
    setSubstituteRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              substituteTeacherId: teacherId,
              substituteTeacherName: teacher?.name ?? '',
            }
          : row
      )
    );
  };

  const assignAllTBD = () => {
    setSubstituteRows((prev) =>
      prev.map((row) =>
        row.substituteTeacherId === ''
          ? { ...row, substituteTeacherId: 'TBD', substituteTeacherName: 'TBD' }
          : row
      )
    );
  };

  // ─── Approve ─────────────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!selectedLeave) return;
    try {
      setIsApproving(true);
      const now = new Date().toISOString();
      const batch = writeBatch(db);

      // 1. Update leave doc
      const leaveRef = doc(db, 'teacherLeaves', selectedLeave.id);
      batch.update(leaveRef, {
        status: 'approved',
        approvedBy: user.uid,
        approvedAt: now,
        principalRemarks: principalRemarks.trim() || null,
        substituteAssigned: true,
        attendanceSynced: true,
        updatedAt: now,
      });

      // 2. Create attendance records (one per leave day)
      const dates = getDatesInRange(selectedLeave.startDate, selectedLeave.endDate);
      for (const dateStr of dates) {
        const attendanceRef = doc(collection(db, 'attendance'));
        batch.set(attendanceRef, {
          date: dateStr,
          employeeId: selectedLeave.teacherId,
          type: 'staff',
          status: 'approved_leave',
          leaveId: selectedLeave.id,
          remarks: 'Teacher leave approved by principal',
          classId: null,
          createdAt: now,
        });
      }

      // 3. Create substitute assignment docs
      for (const row of substituteRows) {
        const subRef = doc(collection(db, 'substituteAssignments'));
        const isTBD = !row.substituteTeacherId || row.substituteTeacherId === 'TBD';
        const assignment: Omit<SubstituteAssignment, 'id'> = {
          leaveId: selectedLeave.id,
          date: row.date,
          slotId: row.slotId,
          classId: row.classId,
          originalTeacherId: row.originalTeacherId,
          substituteTeacherId: isTBD ? undefined : row.substituteTeacherId,
          substituteTeacherName: isTBD ? undefined : row.substituteTeacherName,
          status: isTBD ? 'unassigned' : 'assigned',
          assignedBy: user.uid,
          createdAt: now,
          updatedAt: now,
        };
        // Strip undefined fields for Firestore
        batch.set(subRef, JSON.parse(JSON.stringify(assignment)));
      }

      await batch.commit();

      await logActivity(
        user,
        'Teacher Leave Approved',
        'Principal',
        `Approved leave for ${selectedLeave.teacherName} (${selectedLeave.startDate} to ${selectedLeave.endDate})`,
        { leaveId: selectedLeave.id, teacherId: selectedLeave.teacherId }
      );

      showToast(`Leave approved for ${selectedLeave.teacherName}`, 'success');
      setApprovalModalOpen(false);
      setSelectedLeave(null);
      loadAll();
    } catch (error) {
      console.error('Error approving leave:', error);
      showToast('Failed to approve leave', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  // ─── Reject ──────────────────────────────────────────────────────────────

  const handleReject = async () => {
    if (!selectedLeave) return;
    if (!rejectRemarks.trim()) {
      showToast('Please provide a reason for rejection', 'error');
      return;
    }
    try {
      setIsRejecting(true);
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'teacherLeaves', selectedLeave.id), {
        status: 'rejected',
        approvedBy: user.uid,
        approvedAt: now,
        principalRemarks: rejectRemarks.trim(),
        updatedAt: now,
      });

      await logActivity(
        user,
        'Teacher Leave Rejected',
        'Principal',
        `Rejected leave for ${selectedLeave.teacherName} (${selectedLeave.startDate} to ${selectedLeave.endDate})`,
        { leaveId: selectedLeave.id, teacherId: selectedLeave.teacherId }
      );

      showToast(`Leave rejected for ${selectedLeave.teacherName}`, 'success');
      setRejectModalOpen(false);
      setRejectRemarks('');
      setSelectedLeave(null);
      loadAll();
    } catch (error) {
      console.error('Error rejecting leave:', error);
      showToast('Failed to reject leave', 'error');
    } finally {
      setIsRejecting(false);
    }
  };

  // ─── Revoke ──────────────────────────────────────────────────────────────

  const handleRevoke = async () => {
    if (!selectedLeave) return;
    try {
      setIsRevoking(true);
      const now = new Date().toISOString();
      const batch = writeBatch(db);

      // Revert leave to pending
      batch.update(doc(db, 'teacherLeaves', selectedLeave.id), {
        status: 'pending',
        substituteAssigned: false,
        attendanceSynced: false,
        principalRemarks: revokeReason.trim() || null,
        updatedAt: now,
      });

      // Delete substitute assignments for this leave
      const subSnap = await getDocs(
        query(collection(db, 'substituteAssignments'), where('leaveId', '==', selectedLeave.id))
      );
      subSnap.docs.forEach((d) => batch.delete(d.ref));

      // Delete attendance docs created for this leave
      const attSnap = await getDocs(
        query(
          collection(db, 'attendance'),
          where('leaveId', '==', selectedLeave.id),
          where('type', '==', 'staff')
        )
      );
      attSnap.docs.forEach((d) => batch.delete(d.ref));

      await batch.commit();

      await logActivity(
        user,
        'Teacher Leave Revoked',
        'Principal',
        `Revoked approved leave for ${selectedLeave.teacherName} (${selectedLeave.startDate} to ${selectedLeave.endDate})`,
        { leaveId: selectedLeave.id, teacherId: selectedLeave.teacherId }
      );

      showToast(`Leave revoked for ${selectedLeave.teacherName}`, 'success');
      setRevokeModalOpen(false);
      setRevokeReason('');
      setSelectedLeave(null);
      loadAll();
    } catch (error) {
      console.error('Error revoking leave:', error);
      showToast('Failed to revoke leave', 'error');
    } finally {
      setIsRevoking(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const teacherMap = useMemo(
    () => Object.fromEntries(teachers.map((t) => [t.id, t])),
    [teachers]
  );

  const statusFilters = ['all', 'pending', 'approved', 'rejected', 'cancelled'];

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-violet-600 to-indigo-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-200">
            Principal Portal
          </p>
          <h1 className="text-xl font-bold mt-0.5">Teacher Leave Approval</h1>
          <p className="text-xs text-violet-100 mt-0.5">
            {leaves.length} total · {pendingCount} pending
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{pendingCount}</p>
              <p className="text-[9px] text-white/70 uppercase">Pending</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{approvedThisMonth}</p>
              <p className="text-[9px] text-white/70 uppercase">Approved</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{rejectedThisMonth}</p>
              <p className="text-[9px] text-white/70 uppercase">Rejected</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{teachersOnLeaveToday}</p>
              <p className="text-[9px] text-white/70 uppercase">Today</p>
            </div>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search teacher..."
            className="mt-3 w-full px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-sm text-white placeholder:text-white/60 focus:outline-none focus:bg-white/20"
          />
        </div>

        <div className="px-4 pt-3 overflow-x-auto flex gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {statusFilters.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition-transform capitalize ${
                filterStatus === s
                  ? 'bg-violet-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="px-4 pt-4 space-y-2.5">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading...</div>
          ) : filteredLeaves.length === 0 ? (
            <div className="py-12 text-center">
              <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No leave requests</p>
            </div>
          ) : (
            filteredLeaves.map((leave) => {
              const teacher = teacherMap[leave.teacherId];
              return (
                <div
                  key={leave.id}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      {teacher?.photoURL ? (
                        <img
                          src={teacher.photoURL}
                          alt={leave.teacherName}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-xs shrink-0">
                          {getInitials(leave.teacherName)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {leave.teacherName}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {leave.startDate === leave.endDate
                            ? leave.startDate
                            : `${leave.startDate} → ${leave.endDate}`}{' '}
                          · {leave.totalDays}d
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(leave.status)}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    {getLeaveTypeBadge(leave.leaveType)}
                    <p className="text-[11px] text-slate-500 line-clamp-1 flex-1">
                      {leave.reason}
                    </p>
                  </div>
                  {leave.status === 'pending' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openApprovalModal(leave)}
                        className="py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => {
                          setSelectedLeave(leave);
                          setRejectModalOpen(true);
                        }}
                        className="py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                  {leave.status === 'approved' && (
                    <button
                      onClick={() => {
                        setSelectedLeave(leave);
                        setRevokeModalOpen(true);
                      }}
                      className="mt-2 w-full py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Revoke
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Desktop UI ───────────────────────────────────────────────── */}
      <div className="hidden md:block space-y-6">
        <PageHeader
          title="Teacher Leave Approval"
          subtitle="Review, approve and manage teacher leave requests with substitute assignments"
          icon={ClipboardCheck}
          iconColor="bg-violet-500"
        />

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-white border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500 rounded-lg text-white">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Pending
                </p>
                <h3 className="text-2xl font-black text-slate-900">{pendingCount}</h3>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500 rounded-lg text-white">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Approved (Month)
                </p>
                <h3 className="text-2xl font-black text-emerald-600">{approvedThisMonth}</h3>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-rose-50 to-white border-rose-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500 rounded-lg text-white">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Rejected (Month)
                </p>
                <h3 className="text-2xl font-black text-rose-600">{rejectedThisMonth}</h3>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-violet-50 to-white border-violet-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500 rounded-lg text-white">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  On Leave Today
                </p>
                <h3 className="text-2xl font-black text-violet-600">{teachersOnLeaveToday}</h3>
              </div>
            </div>
          </Card>
        </div>

        {/* Filter + Table */}
        <Card className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
            <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
              {statusFilters.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap capitalize ${
                    filterStatus === s
                      ? 'bg-violet-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search teacher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">
                    Teacher
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">
                    Leave Type
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">
                    Dates
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">
                    Reason
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-500 uppercase">
                    Submitted
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-bold text-slate-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {filteredLeaves.map((leave) => {
                    const teacher = teacherMap[leave.teacherId];
                    return (
                      <motion.tr
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={leave.id}
                        className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {teacher?.photoURL ? (
                              <img
                                src={teacher.photoURL}
                                alt={leave.teacherName}
                                className="w-8 h-8 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-xs shrink-0">
                                {getInitials(leave.teacherName)}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-slate-900 group-hover:text-violet-600 transition-colors text-sm uppercase tracking-tight">
                                {leave.teacherName}
                              </p>
                              {teacher?.classes && teacher.classes.length > 0 && (
                                <p className="text-[10px] text-slate-400 font-bold uppercase">
                                  {teacher.classes.slice(0, 3).join(', ')}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">{getLeaveTypeBadge(leave.leaveType)}</td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-slate-900 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-violet-500" />
                              {format(parseISO(leave.startDate), 'MMM d')}
                              {leave.endDate !== leave.startDate
                                ? ` – ${format(parseISO(leave.endDate), 'MMM d')}`
                                : ''}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                              {leave.totalDays} {leave.totalDays === 1 ? 'Day' : 'Days'}
                            </p>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 max-w-[200px]">
                          <p className="text-xs text-slate-600 line-clamp-2">{leave.reason}</p>
                        </td>
                        <td className="py-3.5 px-4">{getStatusBadge(leave.status)}</td>
                        <td className="py-3.5 px-4">
                          <p className="text-xs text-slate-500">
                            {format(parseISO(leave.submittedAt), 'MMM d, yyyy')}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {leave.status === 'pending' && (
                              <>
                                <Button
                                  variant="success"
                                  size="xs"
                                  onClick={() => openApprovalModal(leave)}
                                >
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                                </Button>
                                <Button
                                  variant="danger"
                                  size="xs"
                                  onClick={() => {
                                    setSelectedLeave(leave);
                                    setRejectModalOpen(true);
                                  }}
                                >
                                  <XCircle className="w-3 h-3 mr-1" /> Reject
                                </Button>
                              </>
                            )}
                            {leave.status === 'approved' && (
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => {
                                  setSelectedLeave(leave);
                                  setRevokeModalOpen(true);
                                }}
                              >
                                <RotateCcw className="w-3 h-3 mr-1" /> Revoke
                              </Button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
                {filteredLeaves.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-bold">
                      No leave requests found matching the filters.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ─── Approval Modal ──────────────────────────────────────────── */}
      <Modal
        isOpen={approvalModalOpen}
        onClose={() => {
          if (!isApproving) setApprovalModalOpen(false);
        }}
        title="Approve Leave Request"
        subtitle={`Teacher: ${selectedLeave?.teacherName}`}
        size="lg"
      >
        {selectedLeave && (
          <div className="space-y-6">
            {/* Section 1: Leave Summary */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                Leave Summary
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Teacher</p>
                  <p className="text-sm font-bold text-slate-900">{selectedLeave.teacherName}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Type</p>
                  {getLeaveTypeBadge(selectedLeave.leaveType)}
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Dates</p>
                  <p className="text-sm font-bold text-slate-900">
                    {format(parseISO(selectedLeave.startDate), 'MMM d')}
                    {selectedLeave.endDate !== selectedLeave.startDate
                      ? ` – ${format(parseISO(selectedLeave.endDate), 'MMM d')}`
                      : ''}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Duration</p>
                  <p className="text-sm font-bold text-slate-900">
                    {selectedLeave.totalDays} {selectedLeave.totalDays === 1 ? 'Day' : 'Days'}
                  </p>
                </div>
              </div>
              <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Reason</p>
                <p className="text-sm text-slate-700">{selectedLeave.reason}</p>
              </div>
              {selectedLeave.substitutePreference && (
                <div className="mt-3 bg-amber-50 rounded-xl p-3 border border-amber-100">
                  <p className="text-[10px] text-amber-700 font-bold uppercase mb-1">
                    Teacher's Substitute Suggestion
                  </p>
                  <p className="text-sm text-amber-900">{selectedLeave.substitutePreference}</p>
                </div>
              )}
            </div>

            {/* Section 2: Principal Remarks */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                Principal Remarks (Optional)
              </p>
              <Textarea
                placeholder="Add any remarks or instructions..."
                value={principalRemarks}
                onChange={(e) => setPrincipalRemarks(e.target.value)}
                rows={2}
              />
            </div>

            {/* Section 3: Substitute Assignment */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Substitute Assignment ({substituteRows.length} period
                  {substituteRows.length !== 1 ? 's' : ''})
                </p>
                {substituteRows.length > 0 && (
                  <button
                    onClick={assignAllTBD}
                    className="text-xs text-violet-600 font-bold hover:underline"
                  >
                    Mark all remaining as TBD
                  </button>
                )}
              </div>

              {substituteRows.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-4 text-center text-sm text-slate-500 border border-slate-100">
                  No periods found for this teacher in the timetable for the leave dates.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                            Date
                          </th>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                            Period
                          </th>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                            Class
                          </th>
                          <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                            Assign Substitute
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {substituteRows.map((row, idx) => (
                          <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">
                              {format(parseISO(row.date), 'EEE, MMM d')}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="font-bold text-slate-800">{row.slotLabel}</span>
                              <span className="text-slate-400 ml-1">({row.slotStartTime})</span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-600 font-bold">
                              {row.classId}
                            </td>
                            <td className="px-3 py-2 min-w-[180px]">
                              <select
                                value={row.substituteTeacherId}
                                onChange={(e) => updateSubstituteRow(idx, e.target.value)}
                                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                              >
                                <option value="">-- TBD --</option>
                                {teachers
                                  .filter((t) => t.id !== selectedLeave.teacherId)
                                  .map((t) => {
                                    const teachesSubject = t.subjects?.includes(row.subjectId);
                                    return (
                                      <option key={t.id} value={t.id}>
                                        {t.name}
                                        {teachesSubject ? ' (Subject match)' : ''}
                                      </option>
                                    );
                                  })}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <Button
                variant="secondary"
                onClick={() => setApprovalModalOpen(false)}
                disabled={isApproving}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                loading={isApproving}
                onClick={handleApprove}
                className="bg-emerald-600 hover:bg-emerald-700 font-bold"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Confirm Approval
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Reject Modal ─────────────────────────────────────────────── */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => {
          if (!isRejecting) {
            setRejectModalOpen(false);
            setRejectRemarks('');
          }
        }}
        title="Reject Leave Request"
        subtitle={`Teacher: ${selectedLeave?.teacherName}`}
        size="sm"
      >
        <div className="space-y-4">
          {selectedLeave && (
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-sm">
              <p className="font-bold text-slate-800">{selectedLeave.teacherName}</p>
              <p className="text-slate-500 mt-0.5">
                {format(parseISO(selectedLeave.startDate), 'MMM d')}
                {selectedLeave.endDate !== selectedLeave.startDate
                  ? ` – ${format(parseISO(selectedLeave.endDate), 'MMM d')}`
                  : ''}{' '}
                · {selectedLeave.totalDays}d ·{' '}
                <span className="capitalize">{selectedLeave.leaveType.replace('_', ' ')}</span>
              </p>
            </div>
          )}
          <FormField label="Reason for Rejection" hint="Required — will be shared with the teacher">
            <Textarea
              placeholder="e.g. Insufficient notice period, critical exam week, etc."
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
              rows={3}
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-1">
            <Button
              variant="secondary"
              onClick={() => {
                setRejectModalOpen(false);
                setRejectRemarks('');
              }}
              disabled={isRejecting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={isRejecting}
              onClick={handleReject}
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              Reject Leave
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Revoke Modal ─────────────────────────────────────────────── */}
      <Modal
        isOpen={revokeModalOpen}
        onClose={() => {
          if (!isRevoking) {
            setRevokeModalOpen(false);
            setRevokeReason('');
          }
        }}
        title="Revoke Approved Leave"
        subtitle={`This will revert the leave to Pending and delete substitute assignments`}
        size="sm"
      >
        <div className="space-y-4">
          {selectedLeave && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-sm">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-amber-900">
                    Revoking leave for {selectedLeave.teacherName}
                  </p>
                  <p className="text-amber-700 mt-0.5 text-xs">
                    All substitute assignments and attendance records created for this leave will be
                    deleted. The leave will be returned to Pending status.
                  </p>
                </div>
              </div>
            </div>
          )}
          <FormField label="Reason for Revocation (Optional)">
            <Textarea
              placeholder="e.g. Leave cancelled by teacher, emergency staffing requirement..."
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              rows={3}
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-1">
            <Button
              variant="secondary"
              onClick={() => {
                setRevokeModalOpen(false);
                setRevokeReason('');
              }}
              disabled={isRevoking}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={isRevoking}
              onClick={handleRevoke}
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Revoke Approval
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
