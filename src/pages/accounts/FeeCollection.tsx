import { UserProfile, Student, Class, Fee, FeePayment, FeeRequest, FeeStructure, PaymentMethod, FeeHead, FineConfig } from '../../types';
import { Download, IndianRupee, CheckCircle2, Clock, AlertCircle, Plus, Receipt, Trash2, History, ShieldOff, Scale } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, orderBy, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { calculateFine, getEffectiveTotal } from '../../services/fineService';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { generateFeeReceipt } from '../../lib/receiptGenerator';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  IconButton,
  Modal,
  SearchInput,
  FormField,
  Input,
  Select,
  Textarea,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
  Avatar,
  StatCard,
} from '../../components/ui';

interface FeeCollectionProps {
  user: UserProfile;
}

export default function FeeCollection({ user }: FeeCollectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [students, setStudents] = useState<Student[]>([]);
  const [feeRequests, setFeeRequests] = useState<FeeRequest[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [globalHeads, setGlobalHeads] = useState<FeeHead[]>([]);
  const [fineConfig, setFineConfig] = useState<FineConfig | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isEditingRequest, setIsEditingRequest] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const { showToast } = useToast();

  const [paymentData, setPaymentData] = useState({
    amount: '',
    head: 'Tuition Fees',
    method: 'cash' as PaymentMethod,
    date: new Date().toISOString().split('T')[0],
    referenceNumber: '',
    remarks: '',
  });

  const [waiverData, setWaiverData] = useState({
    amount: '',
    reason: '',
    isOpen: false,
    requestId: '',
    studentName: ''
  });

  const [requestData, setRequestData] = useState<{
    month: string;
    dueDate: string;
    heads: { name: string; amount: number; discount: number; finalAmount: number }[];
  }>({
    month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
    dueDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 10).toISOString().split('T')[0],
    heads: [],
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsSnap, requestsSnap, paymentsSnap, structuresSnap, classesSnap, headsSnap, fineSnap] = await Promise.all([
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'feeRequests')),
        getDocs(query(collection(db, 'feePayments'), orderBy('date', 'desc'))),
        getDocs(collection(db, 'feeStructures')),
        getDocs(collection(db, 'classes')),
        getDocs(collection(db, 'feeHeads')),
        getDoc(doc(db, 'fine-config', 'global'))
      ]);

      setStudents(studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
      setFeeRequests(requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeRequest)));
      setPayments(paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeePayment)));
      setFeeStructures(structuresSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeStructure)));
      setClasses(classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class)));
      setGlobalHeads(headsSnap.docs.map(doc => ({ ...doc.data() } as FeeHead)));
      if (fineSnap.exists()) {
        setFineConfig(fineSnap.data() as FineConfig);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'feeRequests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Check for search param in URL
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get('search');
    if (searchParam) {
      setSearchTerm(searchParam);
    }
  }, []);

  const handleDownloadReceipt = (payment: FeePayment) => {
    const request = feeRequests.find(r => r.id === payment.feeRequestId);
    const student = students.find(s => s.id === payment.studentId);
    if (request && student) {
      generateFeeReceipt(payment, request, student);
    } else {
      showToast('Could not find fee request or student details for this payment.', 'error');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    setLoading(true);
    try {
      const pendingRequest = feeRequests.find(r => r.studentId === selectedStudent.id && r.status !== 'paid');
      if (!pendingRequest) throw new Error('No pending fee request found for student');

      const payAmount = Number(paymentData.amount);
      const currentFine = fineConfig ? calculateFine(pendingRequest, fineConfig) : 0;
      const totalRequired = pendingRequest.totalAmount + currentFine - (pendingRequest.waivedAmount || 0);
      const remaining = totalRequired - (pendingRequest.paidAmount || 0);

      if (payAmount > remaining) {
        showToast(`Payment amount exceeds remaining balance (₹${remaining})`, 'error');
        setLoading(false);
        return;
      }

      const paymentDoc: Omit<FeePayment, 'id'> = {
        studentId: selectedStudent.id,
        classId: selectedStudent.classId,
        feeRequestId: pendingRequest.id,
        feeHead: paymentData.head,
        amount: payAmount,
        date: paymentData.date,
        method: paymentData.method,
        referenceNumber: paymentData.referenceNumber,
        receiptNumber: `REC-${Date.now()}`,
        remarks: paymentData.remarks,
      };

      await addDoc(collection(db, 'feePayments'), paymentDoc);
      logActivity(
        user, 
        'Recorded Fee Payment', 
        'Accounts', 
        `Collected ₹${payAmount.toLocaleString()} from ${selectedStudent.name} for ${paymentData.head}`,
        { studentId: selectedStudent.id, feeHead: paymentData.head, amount: payAmount }
      );

      const newPaidAmount = (pendingRequest.paidAmount || 0) + payAmount;
      const newStatus = newPaidAmount >= totalRequired ? 'paid' : 'partially_paid';

      // Update request status
      await updateDoc(doc(db, 'feeRequests', pendingRequest.id), { 
        paidAmount: newPaidAmount,
        fineAmount: currentFine, // Snapshot the fine amount at time of payment
        status: newStatus 
      });

      // Update student status based on all requests
      const studentRequests = feeRequests.filter(r => r.studentId === selectedStudent.id);
      const isStillPending = studentRequests.some(r => r.id !== pendingRequest.id && r.status !== 'paid') || newStatus !== 'paid';
      
      await updateDoc(doc(db, 'students', selectedStudent.id), { 
        feeStatus: isStillPending ? 'pending' : 'paid' 
      });

      await logActivity(
        user,
        'RECORD_PAYMENT',
        'Accounts',
        `Recorded payment of ₹${payAmount} for ${selectedStudent.name} (${selectedStudent.schoolNumber})`,
        { studentId: selectedStudent.id }
      );

      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'feePayments');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrUpdateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    setLoading(true);
    try {
      const totalAmount = requestData.heads.reduce((sum, h) => sum + h.finalAmount, 0);
      const requestPayload: Partial<FeeRequest> = {
        studentId: selectedStudent.id,
        classId: selectedStudent.classId,
        academicYear: '2024-25',
        month: requestData.month,
        heads: requestData.heads,
        totalAmount,
        status: totalAmount > 0 ? 'pending' : 'paid',
        dueDate: requestData.dueDate,
      };

      if (isEditingRequest && currentRequestId) {
        await updateDoc(doc(db, 'feeRequests', currentRequestId), requestPayload);
        showToast('Fee request updated successfully!', 'success');
        await logActivity(
          user,
          'UPDATE_FEE_REQUEST',
          'Accounts',
          `Updated fee request for ${selectedStudent.name} (${requestData.month})`,
          { studentId: selectedStudent.id, month: requestData.month }
        );
      } else {
        const newRequest: Omit<FeeRequest, 'id'> = {
          ...requestPayload,
          paidAmount: 0,
          createdAt: new Date().toISOString(),
        } as Omit<FeeRequest, 'id'>;
        await addDoc(collection(db, 'feeRequests'), newRequest);
        await updateDoc(doc(db, 'students', selectedStudent.id), { feeStatus: 'pending' });
        showToast('Fee request generated successfully!', 'success');
        await logActivity(
          user,
          'GENERATE_FEE_REQUEST',
          'Accounts',
          `Generated fee request for ${selectedStudent.name} (${requestData.month})`,
          { studentId: selectedStudent.id, month: requestData.month }
        );
      }

      setIsRequestModalOpen(false);
      setIsEditingRequest(false);
      setCurrentRequestId(null);
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'feeRequests');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRequest = async (requestId: string, studentId: string) => {
    if (!window.confirm('Are you sure you want to cancel this fee request? Current payments will be orphaned.')) return;
    try {
      const student = students.find(s => s.id === studentId);
      await deleteDoc(doc(db, 'feeRequests', requestId));
      
      // Update student status based on remaining requests
      const remainingRequests = feeRequests.filter(r => r.studentId === studentId && r.id !== requestId);
      const isStillPending = remainingRequests.some(r => r.status !== 'paid');
      await updateDoc(doc(db, 'students', studentId), { feeStatus: isStillPending ? 'pending' : 'paid' });
      
      showToast('Fee request cancelled', 'success');
      
      await logActivity(
        user,
        'CANCEL_FEE_REQUEST',
        'Accounts',
        `Cancelled fee request for ${student?.name || studentId}`,
        { studentId }
      );
      
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'feeRequests');
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!window.confirm('Are you sure you want to delete this payment record? This will revert the paid status of the corresponding fee request.')) return;
    
    setLoading(true);
    try {
      const payment = payments.find(p => p.id === paymentId);
      if (!payment) return;

      const request = feeRequests.find(r => r.id === payment.feeRequestId);
      const student = students.find(s => s.id === payment.studentId);

      // 1. Delete payment doc
      await deleteDoc(doc(db, 'feePayments', paymentId));

      // 2. Rollback request paid amount
      if (request) {
        const newPaidAmount = Math.max(0, (request.paidAmount || 0) - payment.amount);
        const newStatus = newPaidAmount === 0 ? 'pending' : 'partially_paid';
        
        await updateDoc(doc(db, 'feeRequests', request.id), {
          paidAmount: newPaidAmount,
          status: newStatus
        });

        // Update student status based on all requests
        const studentRequests = feeRequests.filter(r => r.studentId === student.id);
        const isStillPending = studentRequests.some(r => {
          if (r.id === request.id) return true; // Just rollbacked to unpaid, so this request is definitely pending
          return r.status !== 'paid';
        });

        await updateDoc(doc(db, 'students', student.id), { 
          feeStatus: isStillPending ? 'pending' : 'paid' 
        });
      }

      await logActivity(
        user,
        'DELETE_PAYMENT',
        'Super Admin',
        `Deleted payment record ${payment.receiptNumber} for ₹${payment.amount}`,
        { studentId: payment.studentId }
      );

      showToast('Payment record deleted successfully', 'success');
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'feePayments');
    } finally {
      setLoading(false);
    }
  };

  const handleWaiveFine = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const request = feeRequests.find(r => r.id === waiverData.requestId);
      if (!request) return;

      const updatedRequest: Partial<FeeRequest> = {
        waivedAmount: (request.waivedAmount || 0) + Number(waiverData.amount),
        waivedBy: user.uid,
        waivedAt: new Date().toISOString(),
        waiverReason: waiverData.reason
      };

      await updateDoc(doc(db, 'feeRequests', request.id), updatedRequest);
      logActivity(
        user, 
        'Waived Penalty', 
        'Super Admin', 
        `Waived ₹${waiverData.amount} for ${waiverData.studentName}`,
        { studentId: request.studentId, amount: waiverData.amount }
      );
      showToast('Penalty waived successfully', 'success');
      setWaiverData({ ...waiverData, isOpen: false });
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'feeRequests');
    } finally {
      setLoading(false);
    }
  };

  const openRequestModal = (student: Student, request?: FeeRequest) => {
    setSelectedStudent(student);
    if (request) {
      setIsEditingRequest(true);
      setCurrentRequestId(request.id);
      setRequestData({
        month: request.month,
        dueDate: request.dueDate,
        heads: request.heads
      });
    } else {
      setIsEditingRequest(false);
      setCurrentRequestId(null);
      const structure = feeStructures.find(s => s.classId === student.classId);
      if (structure) {
        setRequestData({
          month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
          dueDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 10).toISOString().split('T')[0],
          heads: structure.heads.map(h => ({
            name: h.name,
            amount: h.amount,
            discount: 0,
            finalAmount: h.amount
          }))
        });
      } else {
        setRequestData({
          month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
          dueDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 10).toISOString().split('T')[0],
          heads: []
        });
      }
    }
    setIsRequestModalOpen(true);
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.schoolNumber.includes(searchTerm);
    const matchesClass = selectedClass === 'all' || s.classId === selectedClass;
    return matchesSearch && matchesClass;
  });

  const todayCollection = payments
    .filter(p => p.date === new Date().toISOString().split('T')[0])
    .reduce((sum, p) => sum + p.amount, 0);

  const monthCollection = payments
    .filter(p => p.date.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Fee Collection"
        subtitle="Track and manage student fee payments"
        icon={IndianRupee}
        iconColor="gradient-amber"
        actions={
          <Button variant="primary" icon={Download}>
            Export Collection Report
          </Button>
        }
      />

      {/* Collection Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Today's Collection"
          value={`₹${(todayCollection || 0).toLocaleString()}`}
          icon={IndianRupee}
          gradient="gradient-amber"
          index={0}
        />
        <StatCard
          label="This Month"
          value={`₹${(monthCollection || 0).toLocaleString()}`}
          icon={CheckCircle2}
          gradient="gradient-amber"
          index={1}
        />
        <StatCard
          label="Pending Dues"
          value={`₹${(feeRequests.filter(f => f.status !== 'paid').reduce((sum, f) => sum + (f.totalAmount - (f.paidAmount || 0)), 0) || 0).toLocaleString()}`}
          icon={AlertCircle}
          gradient="gradient-amber"
          index={2}
        />
        <StatCard
          label="Overdue"
          value={`₹${(feeRequests.filter(f => f.status === 'overdue').reduce((sum, f) => sum + (f.totalAmount - (f.paidAmount || 0)), 0) || 0).toLocaleString()}`}
          icon={Clock}
          gradient="gradient-amber"
          index={3}
        />
      </div>

      {/* Transactions Table */}
      <Card padding="none">
        <div className="p-4 border-b bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-4 min-w-[300px]">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by student name or school number..."
              className="flex-1"
            />
            <Select 
              value={selectedClass} 
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-40"
            >
              <option value="all">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="secondary" 
              size="sm" 
              icon={Plus}
              onClick={() => {
                // Future enhancement: Bulk generate requests
                showToast("Select a class to generate bulk requests", "info");
              }}
            >
              Bulk Generate
            </Button>
          </div>
        </div>
        {filteredStudents.length > 0 ? (
          <Table>
            <Thead>
              <tr>
                <Th>Student</Th>
                <Th>School No.</Th>
                <Th>Total Due</Th>
                <Th>Paid</Th>
                <Th>Balance</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {filteredStudents.map((student) => {
                const studentRequests = feeRequests.filter(r => r.studentId === student.id && r.status !== 'paid');
                const totalFee = studentRequests.reduce((sum, r) => sum + r.totalAmount, 0);
                const currentFine = studentRequests.reduce((sum, r) => sum + (fineConfig ? calculateFine(r, fineConfig) : 0), 0);
                const waiverAmount = studentRequests.reduce((sum, r) => sum + (r.waivedAmount || 0), 0);
                const paidAmount = studentRequests.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
                const balance = totalFee + currentFine - waiverAmount - paidAmount;
                const studentRequest = studentRequests[0]; 

                return (
                  <Tr key={student.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={student.name} size="sm" />
                        <div>
                          <p className="font-bold text-slate-900 leading-tight">{student.name}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{classes.find(c => c.id === student.classId)?.name || student.classId} - {student.section}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{student.schoolNumber}</Td>
                    <Td>
                      <div className="space-y-1">
                        <p className="font-bold text-slate-900 leading-none">₹{(totalFee || 0).toLocaleString()}</p>
                        {currentFine > 0 && (
                          <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1">
                            <Scale className="w-2.5 h-2.5" />
                            +₹{currentFine.toLocaleString()} Fine
                          </p>
                        )}
                        {waiverAmount > 0 && (
                          <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                            <ShieldOff className="w-2.5 h-2.5" />
                            -₹{waiverAmount.toLocaleString()} Waived
                          </p>
                        )}
                      </div>
                    </Td>
                    <Td className="font-bold text-emerald-600">₹{(paidAmount || 0).toLocaleString()}</Td>
                    <Td className="font-bold text-red-600">₹{(balance || 0).toLocaleString()}</Td>
                    <Td>
                      <Badge
                        variant={
                          student.feeStatus === 'paid' ? 'success' :
                            student.feeStatus === 'overdue' ? 'error' : 'warning'
                        }
                      >
                        {studentRequest?.status || student.feeStatus}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      {!studentRequest ? (
                        <Button
                          variant="success"
                          size="xs"
                          icon={Plus}
                          onClick={() => openRequestModal(student)}
                        >
                          Request
                        </Button>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={Receipt}
                            onClick={() => openRequestModal(student, studentRequest)}
                          >
                            Edit
                          </Button>
                          <IconButton
                            icon={Trash2}
                            variant="danger"
                            size="sm"
                            onClick={() => handleCancelRequest(studentRequest.id, student.id)}
                          />
                          {user.role === 'super_admin' && currentFine > 0 && (
                            <IconButton
                              icon={ShieldOff}
                              variant="secondary"
                              size="sm"
                              onClick={() => setWaiverData({
                                isOpen: true,
                                amount: (currentFine - (studentRequest.waivedAmount || 0)).toString(),
                                reason: '',
                                requestId: studentRequest.id,
                                studentName: student.name
                              })}
                            />
                          )}
                          <Button
                            variant="primary"
                            size="xs"
                            icon={Plus}
                            onClick={() => {
                              setSelectedStudent(student);
                              setPaymentData({ ...paymentData, amount: balance.toString() });
                              setIsModalOpen(true);
                            }}
                          >
                            Collect
                          </Button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        ) : (
          <EmptyState title="No students found" />
        )}
      </Card>

      {/* Recent Payments */}
      <Card padding="none">
        <div className="p-6 border-b bg-slate-50/50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 text-amber-600" />
            Recent Payments
          </h3>
        </div>
        {payments.length > 0 ? (
          <Table>
            <Thead>
              <tr>
                <Th>Receipt No.</Th>
                <Th>Student</Th>
                <Th>Date</Th>
                <Th>Amount</Th>
                <Th>Method</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {payments.slice(0, 10).map((tx) => {
                const student = students.find(s => s.id === tx.studentId);
                return (
                  <Tr key={tx.id}>
                    <Td className="font-bold text-slate-900">{tx.receiptNumber}</Td>
                    <Td>{student?.name || 'Unknown'}</Td>
                    <Td>{tx.date}</Td>
                    <Td className="font-bold text-emerald-600">₹{(tx.amount || 0).toLocaleString()}</Td>
                    <Td className="capitalize">{tx.method.replace('_', ' ')}</Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <IconButton
                          icon={Download}
                          onClick={() => handleDownloadReceipt(tx)}
                          variant="ghost"
                        />
                        {user.role === 'super_admin' && (
                          <IconButton
                            icon={Trash2}
                            onClick={() => handleDeletePayment(tx.id)}
                            variant="danger"
                            size="sm"
                          />
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        ) : (
          <EmptyState title="No payment history found." />
        )}
      </Card>

      {/* Generate Fee Request Modal */}
      <Modal
        isOpen={isRequestModalOpen && !!selectedStudent}
        onClose={() => {
          setIsRequestModalOpen(false);
          setIsEditingRequest(false);
          setCurrentRequestId(null);
        }}
        title={isEditingRequest ? "Modify Fee Request" : "Generate Fee Request"}
        subtitle={selectedStudent ? `${selectedStudent.name} (${selectedStudent.schoolNumber})` : ''}
        size="lg"
        footer={
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Total Request Amount</p>
              <p className="text-2xl font-black text-slate-900">₹{(requestData.heads.reduce((sum, h) => sum + h.finalAmount, 0) || 0).toLocaleString()}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => {
                setIsRequestModalOpen(false);
                setIsEditingRequest(false);
              }}>Cancel</Button>
              <Button 
                variant="success" 
                loading={loading} 
                onClick={(e: any) => {
                  const form = document.querySelector('form[data-request-form]') as HTMLFormElement;
                  if (form) form.requestSubmit();
                }}
              >
                {isEditingRequest ? 'Update Request' : 'Generate Request'}
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleCreateOrUpdateRequest} data-request-form className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Billing Month" required>
              <Input
                type="text"
                required
                value={requestData.month}
                onChange={(e) => setRequestData({ ...requestData, month: e.target.value })}
              />
            </FormField>
            <FormField label="Due Date" required>
              <Input
                type="date"
                required
                value={requestData.dueDate}
                onChange={(e) => setRequestData({ ...requestData, dueDate: e.target.value })}
              />
            </FormField>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Fee Heads</h3>
              <div className="flex items-center gap-3">
                {globalHeads.length > 0 && (
                  <Select
                    value=""
                    onChange={(e) => {
                      const head = globalHeads.find(h => h.name === e.target.value);
                      if (head) {
                        setRequestData({
                          ...requestData,
                          heads: [...requestData.heads, { name: head.name, amount: head.amount, discount: 0, finalAmount: head.amount }]
                        });
                      }
                    }}
                    className="w-48 text-xs"
                  >
                    <option value="">Select Global Head</option>
                    {globalHeads.map(h => (
                      <option key={h.name} value={h.name}>{h.name} (₹{h.amount})</option>
                    ))}
                  </Select>
                )}
                <button
                  type="button"
                  onClick={() => setRequestData({
                    ...requestData,
                    heads: [...requestData.heads, { name: '', amount: 0, discount: 0, finalAmount: 0 }]
                  })}
                  className="text-xs font-bold text-amber-600 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Custom Head
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {requestData.heads.map((head, index) => (
                <div key={index} className="grid grid-cols-12 gap-3 items-end p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="col-span-4">
                    <FormField label="Head Name" required>
                      <Input
                        type="text"
                        required
                        value={head.name}
                        onChange={(e) => {
                          const newHeads = [...requestData.heads];
                          newHeads[index].name = e.target.value;
                          setRequestData({ ...requestData, heads: newHeads });
                        }}
                      />
                    </FormField>
                  </div>
                  <div className="col-span-2">
                    <FormField label="Amount" required>
                      <Input
                        type="number"
                        required
                        value={head.amount}
                        onChange={(e) => {
                          const newHeads = [...requestData.heads];
                          newHeads[index].amount = Number(e.target.value);
                          newHeads[index].finalAmount = newHeads[index].amount - newHeads[index].discount;
                          setRequestData({ ...requestData, heads: newHeads });
                        }}
                      />
                    </FormField>
                  </div>
                  <div className="col-span-2">
                    <FormField label="Discount">
                      <Input
                        type="number"
                        value={head.discount}
                        onChange={(e) => {
                          const newHeads = [...requestData.heads];
                          newHeads[index].discount = Number(e.target.value);
                          newHeads[index].finalAmount = newHeads[index].amount - newHeads[index].discount;
                          setRequestData({ ...requestData, heads: newHeads });
                        }}
                      />
                    </FormField>
                  </div>
                  <div className="col-span-3">
                    <FormField label="Final">
                      <div className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900">
                        ₹{(head.finalAmount || 0).toLocaleString()}
                      </div>
                    </FormField>
                  </div>
                  <div className="col-span-1 pb-1">
                    <IconButton
                      icon={Trash2}
                      variant="danger"
                      onClick={() => {
                        const newHeads = requestData.heads.filter((_, i) => i !== index);
                        setRequestData({ ...requestData, heads: newHeads });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* Capture Payment Modal */}
      <Modal
        isOpen={isModalOpen && !!selectedStudent}
        onClose={() => setIsModalOpen(false)}
        title="Capture Payment"
        subtitle={selectedStudent ? `${selectedStudent.name} (${selectedStudent.schoolNumber})` : ''}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={loading} onClick={(e: any) => {
              const form = document.querySelector('form[data-payment-form]') as HTMLFormElement;
              if (form) form.requestSubmit();
            }}>Capture Payment</Button>
          </div>
        }
      >
        <form onSubmit={handleRecordPayment} data-payment-form className="space-y-5">
          <FormField label="Fee Category (Head)" required>
            <Select
              value={paymentData.head}
              onChange={(e) => setPaymentData({ ...paymentData, head: e.target.value })}
            >
              <option value="Tuition Fees">Tuition Fees</option>
              <option value="Transport Fees">Transport Fees</option>
              <option value="Examination Fees">Examination Fees</option>
              <option value="Hostel Fees">Hostel Fees</option>
              <option value="Academic Fees">Academic Fees</option>
              <option value="Miscellaneous">Miscellaneous</option>
            </Select>
          </FormField>
          <FormField label="Amount (₹)" required>
            <Input
              type="number"
              required
              value={paymentData.amount}
              onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
            />
          </FormField>
          <FormField label="Payment Method" required>
            <Select
              value={paymentData.method}
              onChange={(e) => setPaymentData({ ...paymentData, method: e.target.value as any })}
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="upi">UPI</option>
              <option value="net_banking">Net Banking</option>
            </Select>
          </FormField>
          {paymentData.method !== 'cash' && (
            <FormField label="Reference Number" required>
              <Input
                type="text"
                required
                placeholder="Transaction ID / Cheque No."
                value={paymentData.referenceNumber}
                onChange={(e) => setPaymentData({ ...paymentData, referenceNumber: e.target.value })}
              />
            </FormField>
          )}
          <FormField label="Date" required>
            <Input
              type="date"
              required
              value={paymentData.date}
              onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })}
            />
          </FormField>
          <FormField label="Remarks">
            <Textarea
              value={paymentData.remarks}
              onChange={(e) => setPaymentData({ ...paymentData, remarks: e.target.value })}
              rows={3}
            />
          </FormField>
        </form>
      </Modal>

      {/* Waive Fine Modal */}
      <Modal
        isOpen={waiverData.isOpen}
        onClose={() => setWaiverData({ ...waiverData, isOpen: false })}
        title="Waive Penalty Fine"
        subtitle={`Student: ${waiverData.studentName}`}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setWaiverData({ ...waiverData, isOpen: false })}>Cancel</Button>
            <Button variant="danger" loading={loading} onClick={(e: any) => {
              const form = document.querySelector('form[data-waiver-form]') as HTMLFormElement;
              if (form) form.requestSubmit();
            }}>Confirm Waiver</Button>
          </div>
        }
      >
        <form onSubmit={handleWaiveFine} data-waiver-form className="space-y-4">
          <FormField label="Amount to Waive (₹)" required hint="Enter the amount you wish to waive from the calculated fine">
            <Input 
              type="number"
              required
              value={waiverData.amount}
              onChange={(e) => setWaiverData({ ...waiverData, amount: e.target.value })}
            />
          </FormField>
          <FormField label="Reason for Waiver" required>
            <Textarea 
              required
              value={waiverData.reason}
              onChange={(e) => setWaiverData({ ...waiverData, reason: e.target.value })}
              placeholder="e.g. Negotiated with Parent, Technical Issue, etc."
              rows={3}
            />
          </FormField>
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-[10px] text-amber-700 leading-relaxed italic">
              Warning: This action is permanent and will be logged as a waiver by {user.name}.
            </p>
          </div>
        </form>
      </Modal>
    </div>
  );
}
