import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  FileText,
  Eye,
  TrendingDown,
  Info,
  ChevronRight
} from 'lucide-react';
import {
  collection,
  query,
  getDocs,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from '../../firebase';
import { StudentLeaveRequest, UserProfile, LeaveStatus } from '../../types';
import {
  Card,
  Badge,
  PageHeader,
  Modal,
  Button
} from '../../components/ui';
import { useToast } from '../../components/Toast';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

export default function StudentLeaves({ user }: { user: UserProfile }) {
  const [leaves, setLeaves] = useState<StudentLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingLeave, setViewingLeave] = useState<StudentLeaveRequest | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (user.studentId) {
      fetchStudentLeaves();
    }
  }, [user.studentId]);

  const fetchStudentLeaves = async () => {
    try {
      setLoading(true);
      const leaveRef = collection(db, 'studentLeaves');
      const q = query(
        leaveRef,
        where('studentId', '==', user.studentId),
        orderBy('submittedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const leaveList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudentLeaveRequest));
      setLeaves(leaveList);
    } catch (error) {
      console.error('Error fetching student leaves:', error);
      showToast('Failed to fetch leave history', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: LeaveStatus) => {
    switch (status) {
      case 'submitted':
      case 'pending':
        return <Badge variant="warning">Submitted</Badge>;
      case 'approved':
        return <Badge variant="success">Approved</Badge>;
      case 'rejected':
        return <Badge variant="error">Rejected</Badge>;
      case 'document_required':
        return <Badge variant="info">Docs Requested</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const mobileStatusStyle = (status: LeaveStatus) => {
    switch (status) {
      case 'approved': return { bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', label: 'Approved' };
      case 'rejected': return { bg: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500', label: 'Rejected' };
      case 'document_required': return { bg: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', label: 'Docs Needed' };
      default: return { bg: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', label: 'Pending' };
    }
  };

  const approvedLeaves = leaves.filter(l => l.status === 'approved');
  const totalApprovedDays = approvedLeaves.reduce((sum, l) => sum + l.totalDays, 0);
  const pendingCount = leaves.filter(l => l.status === 'submitted' || l.status === 'pending').length;
  const rejectedCount = leaves.filter(l => l.status === 'rejected').length;

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 px-4 pt-5 pb-6 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Student Portal</p>
          <h1 className="text-xl font-bold mt-0.5">My Leaves</h1>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black">{totalApprovedDays}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Days</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black text-emerald-300">{approvedLeaves.length}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Approved</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black text-amber-300">{pendingCount}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Pending</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black text-rose-300">{rejectedCount}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Rejected</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-24 space-y-3">
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-700 leading-relaxed">
                Student portal is view-only. For leave applications, ask your parent to use the Parent Portal.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : leaves.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
              <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-500">No leave records</p>
            </div>
          ) : (
            leaves.map((leave) => {
              const style = mobileStatusStyle(leave.status);
              return (
                <button
                  key={leave.id}
                  onClick={() => setViewingLeave(leave)}
                  className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                >
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 capitalize">{leave.leaveType.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {format(new Date(leave.startDate), 'MMM d')} – {format(new Date(leave.endDate), 'MMM d, yyyy')} · {leave.totalDays} {leave.totalDays === 1 ? 'day' : 'days'}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${style.bg}`}>
                    {style.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-6">
        <PageHeader
          title="My Leaves"
          subtitle="View your leave history and upcoming approved leaves"
          icon={ClipboardCheck}
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-emerald-50 border-emerald-100">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Total Approved Days</p>
            <h3 className="text-2xl font-black text-emerald-700">{totalApprovedDays}</h3>
          </Card>
          <Card className="p-4 bg-indigo-50 border-indigo-100">
            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Approved Requests</p>
            <h3 className="text-2xl font-black text-indigo-700">{approvedLeaves.length}</h3>
          </Card>
          <Card className="p-4 bg-amber-50 border-amber-100">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Pending Review</p>
            <h3 className="text-2xl font-black text-amber-700">{pendingCount}</h3>
          </Card>
          <Card className="p-4 bg-rose-50 border-rose-100">
            <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Rejected</p>
            <h3 className="text-2xl font-black text-rose-700">{rejectedCount}</h3>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-[0.15em] px-1">Recent Applications</h3>
            <div className="space-y-3">
              {leaves.length === 0 && !loading && (
                <Card className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                  No leave records to show.
                </Card>
              )}
              {leaves.map((leave) => (
                <Card key={leave.id} className="p-4 flex items-center justify-between hover:border-indigo-200 transition-colors cursor-pointer group" onClick={() => setViewingLeave(leave)}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      leave.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                      leave.status === 'rejected' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 capitalize leading-none mb-1">{leave.leaveType.replace('_', ' ')}</h4>
                      <p className="text-xs text-slate-500 font-medium">
                        {format(new Date(leave.startDate), 'MMM d')} - {format(new Date(leave.endDate), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {getStatusBadge(leave.status)}
                      <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase">{leave.totalDays} {leave.totalDays === 1 ? 'Day' : 'Days'}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <Card className="p-5 border-indigo-100 bg-indigo-50/30">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-4 h-4 text-indigo-500" />
                <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-widest">Attendance Impact</h4>
              </div>
              <div className="space-y-4">
                <div className="p-3 bg-white rounded-xl border border-indigo-100 shadow-sm">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Leaves this month</p>
                  <p className="text-lg font-black text-slate-900">
                    {leaves.filter(l => l.status === 'approved' && l.startDate.includes(new Date().toISOString().slice(0, 7))).reduce((sum, l) => sum + l.totalDays, 0)} Days
                  </p>
                </div>
                <p className="text-[10px] text-indigo-600 font-medium italic leading-relaxed">
                  Note: Approved leaves are counted as excused absences and do not negatively impact your conduct grade.
                </p>
              </div>
            </Card>

            <Card className="p-5 border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-slate-400" />
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Information</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Student portal is view-only. For any leave applications or changes, please ask your parent to log in to their Parent Portal.
              </p>
            </Card>
          </div>
        </div>
      </div>

      {/* Shared Detail Modal */}
      <Modal
        isOpen={!!viewingLeave}
        onClose={() => setViewingLeave(null)}
        title="Leave Review"
        subtitle={viewingLeave?.studentName}
        size="sm"
      >
        {viewingLeave && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase">Status</p>
                {getStatusBadge(viewingLeave.status)}
              </div>
              <div className="text-right">
                <p className="text-[9px] text-slate-400 font-bold uppercase">Processed At</p>
                <p className="text-xs font-bold text-slate-600">{viewingLeave.processedAt ? format(new Date(viewingLeave.processedAt), 'do MMM') : '-'}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[9px] text-slate-400 font-bold uppercase">School Remarks</p>
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                {viewingLeave.adminRemarks ? (
                  <p className="text-xs text-indigo-900 font-bold leading-relaxed">{viewingLeave.adminRemarks}</p>
                ) : (
                  <p className="text-xs text-slate-400 italic">No remarks from the school yet.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border border-slate-100 rounded-xl">
                <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Start Date</p>
                <p className="text-sm font-bold text-slate-900">{format(new Date(viewingLeave.startDate), 'do MMM')}</p>
              </div>
              <div className="p-3 border border-slate-100 rounded-xl">
                <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">End Date</p>
                <p className="text-sm font-bold text-slate-900">{format(new Date(viewingLeave.endDate), 'do MMM')}</p>
              </div>
            </div>

            <Button variant="secondary" className="w-full" onClick={() => setViewingLeave(null)}>Close</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
