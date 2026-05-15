import React, { useState, useEffect } from 'react';
import { 
  ClipboardCheck, 
  Search, 
  Filter, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  FileText,
  ChevronRight,
  MoreVertical,
  Download,
  Mail,
  User,
  Eye,
  MessageSquare
} from 'lucide-react';
import { 
  collection, 
  query, 
  getDocs, 
  updateDoc, 
  doc, 
  where, 
  orderBy,
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase';
import { StudentLeaveRequest, UserProfile, LeaveStatus } from '../../types';
import { 
  Card, 
  Button, 
  Input, 
  Badge, 
  PageHeader,
  Modal,
  FormField,
  Textarea
} from '../../components/ui';
import { useToast } from '../../components/Toast';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { usePermissions } from '../../hooks/usePermissions';
import { logActivity } from '../../services/activityService';
import { useData } from '../../contexts/DataContext';

export default function LeaveManagement({ user }: { user: UserProfile }) {
  const { classesMap } = useData();
  const [leaves, setLeaves] = useState<StudentLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<LeaveStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeave, setSelectedLeave] = useState<StudentLeaveRequest | null>(null);
  const [remarks, setRemarks] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const { showToast } = useToast();

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('leaves');

  useEffect(() => {
    fetchLeaves();
  }, []);

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      const leaveRef = collection(db, 'studentLeaves');
      const q = query(leaveRef, orderBy('submittedAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const leaveList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudentLeaveRequest));
      setLeaves(leaveList);
    } catch (error) {
      console.error('Error fetching leaves:', error);
      showToast('Failed to fetch leave requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessLeave = async (status: LeaveStatus) => {
    if (!selectedLeave) return;

    try {
      setIsProcessing(true);
      const leaveDocRef = doc(db, 'studentLeaves', selectedLeave.id);
      
      const updateData: any = {
        status,
        adminRemarks: remarks,
        updatedAt: new Date().toISOString(),
        processedBy: user.uid,
        processedAt: new Date().toISOString(),
      };

      // Connect to attendance if approved
      if (status === 'approved' || status === 'regularized') {
        updateData.attendanceConnectionStatus = 'pending';
      }

      await updateDoc(leaveDocRef, updateData);
      
      // Sync Attendance if approved
      if (status === 'approved' || status === 'regularized') {
        await syncAttendanceWithLeave(selectedLeave, status);
      }

      // Log Activity
      await logActivity(
        user,
        'Leave Request Status Updated',
        'Principal',
        `${status.charAt(0).toUpperCase() + status.slice(1)} leave for ${selectedLeave.studentName}`,
        { 
          studentId: selectedLeave.studentId, 
          status,
          leaveId: selectedLeave.id 
        }
      );

      showToast(`Leave request ${status} successfully`, 'success');
      setProcessModalOpen(false);
      setRemarks('');
      setSelectedLeave(null);
      fetchLeaves();
    } catch (error) {
      console.error('Error processing leave:', error);
      showToast('Failed to process leave request', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const syncAttendanceWithLeave = async (leave: StudentLeaveRequest, status: LeaveStatus) => {
    try {
      const batch = writeBatch(db);
      const attendanceRef = collection(db, 'attendance');
      
      // Find attendance records within the leave dates for this student
      const q = query(
        attendanceRef,
        where('studentId', '==', leave.studentId),
        where('date', '>=', leave.startDate),
        where('date', '<=', leave.endDate)
      );
      
      const snap = await getDocs(q);
      const targetStatus = status === 'regularized' ? 'regularized' : 'approved_leave';

      snap.docs.forEach(d => {
        batch.update(d.ref, { 
          status: targetStatus,
          remarks: `Leave ${status}: ${leave.reasonCategory}`
        });
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error syncing attendance:', error);
    }
  };

  const filteredLeaves = leaves.filter(leave => {
    const matchesStatus = filterStatus === 'all' || leave.status === filterStatus;
    const matchesSearch = leave.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         leave.reason.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: LeaveStatus) => {
    switch (status) {
      case 'submitted':
      case 'pending':
        return <Badge variant="warning" className="flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
      case 'approved':
        return <Badge variant="success" className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</Badge>;
      case 'rejected':
        return <Badge variant="error" className="flex items-center gap-1"><XCircle className="w-3 h-3" /> Rejected</Badge>;
      case 'document_required':
        return <Badge variant="info" className="flex items-center gap-1"><FileText className="w-3 h-3" /> Doc Required</Badge>;
      case 'regularized':
        return <Badge className="flex items-center gap-1 tracking-tight">Regularized</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const pendingCount = leaves.filter(l => l.status === 'submitted' || l.status === 'pending').length;
  const emergencyCount = leaves.filter(l => l.isEmergency && (l.status === 'submitted' || l.status === 'pending')).length;

  const approvedCount = leaves.filter(l => l.status === 'approved').length;
  const rejectedCount = leaves.filter(l => l.status === 'rejected').length;

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Leave Requests</h1>
          <p className="text-xs text-indigo-100 mt-0.5">{leaves.length} total · {pendingCount} pending</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{pendingCount}</p>
              <p className="text-[9px] text-white/70 uppercase">Pending</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{approvedCount}</p>
              <p className="text-[9px] text-white/70 uppercase">Approved</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{rejectedCount}</p>
              <p className="text-[9px] text-white/70 uppercase">Rejected</p>
            </div>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student or reason..."
            className="mt-3 w-full px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-sm text-white placeholder:text-white/60 focus:outline-none focus:bg-white/20"
          />
        </div>

        <div className="px-4 pt-3 overflow-x-auto flex gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {['all', 'submitted', 'approved', 'rejected', 'document_required', 'regularized'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition-transform capitalize ${
                filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {s.replace('_', ' ')}
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
            filteredLeaves.map((leave) => (
              <div key={leave.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{leave.studentName}</p>
                    <p className="text-[11px] text-slate-500">{classesMap[leave.classId] || leave.classId}{leave.section ? ` · ${leave.section}` : ''}</p>
                    <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{leave.reason}</p>
                  </div>
                  {getStatusBadge(leave.status)}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{leave.startDate}{leave.endDate !== leave.startDate ? ` → ${leave.endDate}` : ''}</span>
                  {leave.isEmergency && <span className="text-red-600 font-bold">EMERGENCY</span>}
                </div>
                {!readOnly && (leave.status === 'submitted' || leave.status === 'pending') && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setSelectedLeave(leave); setProcessModalOpen(true); }}
                      className="py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />Review
                    </button>
                    <button
                      onClick={() => { setSelectedLeave(leave); setViewModalOpen(true); }}
                      className="py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />View
                    </button>
                  </div>
                )}
                {(leave.status !== 'submitted' && leave.status !== 'pending') && (
                  <button
                    onClick={() => { setSelectedLeave(leave); setViewModalOpen(true); }}
                    className="mt-2 w-full py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />View details
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-6">
      <PageHeader
        title="Leave Management"
        subtitle="Review and process student leave applications"
        icon={ClipboardCheck}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-lg text-white">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Tasks</p>
              <h3 className="text-2xl font-black text-slate-900">{pendingCount}</h3>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-rose-50 to-white border-rose-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500 rounded-lg text-white">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Emergency</p>
              <h3 className="text-2xl font-black text-rose-600">{emergencyCount}</h3>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-lg text-white">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Approved Today</p>
              <h3 className="text-2xl font-black text-emerald-600">
                {leaves.filter(l => l.status === 'approved' && l.processedAt?.startsWith(new Date().toISOString().split('T')[0])).length}
              </h3>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 rounded-lg text-white">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Requests</p>
              <h3 className="text-2xl font-black text-blue-600">{leaves.length}</h3>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            {['all', 'submitted', 'approved', 'rejected', 'document_required', 'regularized'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  filterStatus === status 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search student or reason..." 
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
                <th className="text-left py-4 px-4 text-xs font-bold text-slate-500 uppercase">Student</th>
                <th className="text-left py-4 px-4 text-xs font-bold text-slate-500 uppercase">Type & Category</th>
                <th className="text-left py-4 px-10 text-xs font-bold text-slate-500 uppercase">Dates</th>
                <th className="text-left py-4 px-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                <th className="text-right py-4 px-4 text-xs font-bold text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filteredLeaves.map((leave) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={leave.id} 
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group"
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                          {leave.studentName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{leave.studentName}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{classesMap[leave.classId] || leave.classId} {leave.section}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-700 capitalize">{leave.leaveType.replace('_', ' ')}</p>
                        <p className="text-[10px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 inline-block font-bold">{leave.reasonCategory}</p>
                      </div>
                    </td>
                    <td className="py-4 px-10">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-900 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-indigo-500" />
                          {format(new Date(leave.startDate), 'MMM d')} - {format(new Date(leave.endDate), 'MMM d')}
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">
                          {leave.totalDays} {leave.totalDays === 1 ? 'Day' : 'Days'}
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {status === 'emergency' && leave.isEmergency && (
                        <div className="mb-1">
                          <Badge variant="error" className="animate-pulse">EMERGENCY</Badge>
                        </div>
                      )}
                      {getStatusBadge(leave.status)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="secondary" 
                          size="xs" 
                          onClick={() => {
                            setSelectedLeave(leave);
                            setViewModalOpen(true);
                          }}
                        >
                          <Eye className="w-3 h-3 mr-1" /> View
                        </Button>
                          {!readOnly && (leave.status === 'submitted' || leave.status === 'pending' || leave.status === 'document_required') && (
                            <>
                              <Button
                                variant="primary"
                                size="xs"
                                onClick={() => {
                                  setSelectedLeave(leave);
                                  setProcessModalOpen(true);
                                }}
                              >
                                <ClipboardCheck className="w-3 h-3 mr-1" /> Process
                              </Button>
                              <Button
                                variant="danger"
                                size="xs"
                                onClick={() => {
                                  setSelectedLeave(leave);
                                  setRemarks('');
                                  setProcessModalOpen(true);
                                }}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filteredLeaves.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 font-bold">
                    No leave requests found matching the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      </div>

      {/* View Details Modal */}
      <Modal
        isOpen={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        title="Leave Request Details"
        subtitle={`Student: ${selectedLeave?.studentName}`}
        size="md"
      >
        {selectedLeave && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <Card className="p-4 bg-slate-50 border-none shadow-none">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Leave Duration</p>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 leading-none">
                      {format(new Date(selectedLeave.startDate), 'MMM dd')} - {format(new Date(selectedLeave.endDate), 'MMM dd')}
                    </h4>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">
                      {selectedLeave.totalDays} Total Days
                    </p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 bg-slate-50 border-none shadow-none">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Leave Category</p>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <FileText className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 leading-none capitalize">
                      {selectedLeave.leaveType.replace('_', ' ')}
                    </h4>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">
                      {selectedLeave.reasonCategory}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Detailed Reason</h4>
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <p className="text-sm text-slate-600 leading-relaxed italic">
                  "{selectedLeave.reason}"
                </p>
              </div>
            </div>

            {selectedLeave.documentUrl && (
              <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <FileText className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Supporting Document</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Medical Cert / Application</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => window.open(selectedLeave.documentUrl, '_blank')}>
                  <Eye className="w-3 h-3 mr-1" /> View Document
                </Button>
              </div>
            )}

            {selectedLeave.adminRemarks && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Admin Remarks</h4>
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <p className="text-sm text-indigo-900 font-medium">{selectedLeave.adminRemarks}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" onClick={() => setViewModalOpen(false)}>Close</Button>
              {!readOnly && (selectedLeave.status === 'submitted' || selectedLeave.status === 'pending') && (
                <Button variant="primary" onClick={() => {
                  setViewModalOpen(false);
                  setProcessModalOpen(true);
                }}>Process Leave</Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Process Modal */}
      <Modal
        isOpen={processModalOpen}
        onClose={() => setProcessModalOpen(false)}
        title="Process Leave Request"
        subtitle={`Update status for ${selectedLeave?.studentName}`}
        size="sm"
      >
        <div className="space-y-4">
          <FormField label="Admin Remarks" hint="Provide feedback for the parent">
            <Textarea 
              placeholder="e.g. Approved as per medical records, or Please upload doctor's note"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={4}
            />
          </FormField>

          <div className="flex flex-col gap-2 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="primary" 
                loading={isProcessing} 
                onClick={() => handleProcessLeave('approved')}
                className="bg-emerald-600 hover:bg-emerald-700 h-10 font-bold uppercase tracking-wider"
              >
                Approve
              </Button>
              <Button 
                variant="danger" 
                loading={isProcessing} 
                onClick={() => handleProcessLeave('rejected')}
                className="h-10 font-bold uppercase tracking-wider"
              >
                Reject
              </Button>
            </div>
            <Button 
              variant="secondary" 
              loading={isProcessing} 
              onClick={() => handleProcessLeave('document_required')}
              className="h-10 font-bold uppercase tracking-wider"
              icon={FileText}
            >
              Request Document
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
