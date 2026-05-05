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
  Info
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

  const approvedLeaves = leaves.filter(l => l.status === 'approved');
  const totalApprovedDays = approvedLeaves.reduce((sum, l) => sum + l.totalDays, 0);

  return (
    <div className="space-y-6">
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
          <h3 className="text-2xl font-black text-amber-700">{leaves.filter(l => l.status === 'submitted' || l.status === 'pending').length}</h3>
        </Card>
        <Card className="p-4 bg-rose-50 border-rose-100">
          <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Rejected</p>
          <h3 className="text-2xl font-black text-rose-700">{leaves.filter(l => l.status === 'rejected').length}</h3>
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
    </div>
  );
}

function ChevronRight(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
