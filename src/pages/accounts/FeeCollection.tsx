import { UserProfile, Student, Fee, FeePayment, FeeRequest, FeeStructure, PaymentMethod } from '../../types';
import { Download, IndianRupee, CheckCircle2, Clock, AlertCircle, Plus, Receipt, Trash2, History } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, orderBy, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { generateFeeReceipt } from '../../lib/receiptGenerator';
import { useToast } from '../../components/Toast';
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
  const [students, setStudents] = useState<Student[]>([]);
  const [feeRequests, setFeeRequests] = useState<FeeRequest[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const { showToast } = useToast();

  const [paymentData, setPaymentData] = useState({
    amount: '',
    method: 'cash' as PaymentMethod,
    date: new Date().toISOString().split('T')[0],
    referenceNumber: '',
    remarks: '',
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
      const [studentsSnap, requestsSnap, paymentsSnap, structuresSnap] = await Promise.all([
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'feeRequests')),
        getDocs(query(collection(db, 'feePayments'), orderBy('date', 'desc'))),
        getDocs(collection(db, 'feeStructures'))
      ]);

      setStudents(studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
      setFeeRequests(requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeRequest)));
      setPayments(paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeePayment)));
      setFeeStructures(structuresSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeStructure)));
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

      const payment: Omit<FeePayment, 'id'> = {
        studentId: selectedStudent.id,
        feeRequestId: pendingRequest.id,
        amount: Number(paymentData.amount),
        date: paymentData.date,
        method: paymentData.method,
        referenceNumber: paymentData.referenceNumber,
        receiptNumber: `REC-${Date.now()}`,
        remarks: paymentData.remarks,
      };

      await addDoc(collection(db, 'feePayments'), payment);

      // Update request status
      await updateDoc(doc(db, 'feeRequests', pendingRequest.id), { status: 'paid' });
      await updateDoc(doc(db, 'students', selectedStudent.id), { feeStatus: 'paid' });

      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'feePayments');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    setLoading(true);
    try {
      const totalAmount = requestData.heads.reduce((sum, h) => sum + h.finalAmount, 0);
      const request: Omit<FeeRequest, 'id'> = {
        studentId: selectedStudent.id,
        classId: selectedStudent.classId,
        academicYear: '2024-25',
        month: requestData.month,
        heads: requestData.heads,
        totalAmount,
        status: 'pending',
        dueDate: requestData.dueDate,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'feeRequests'), request);
      await updateDoc(doc(db, 'students', selectedStudent.id), { feeStatus: 'pending' });

      setIsRequestModalOpen(false);
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'feeRequests');
    } finally {
      setLoading(false);
    }
  };

  const openRequestModal = (student: Student) => {
    setSelectedStudent(student);
    const structure = feeStructures.find(s => s.classId === student.classId);
    if (structure) {
      setRequestData({
        ...requestData,
        heads: structure.heads.map(h => ({
          name: h.name,
          amount: h.amount,
          discount: 0,
          finalAmount: h.amount
        }))
      });
    } else {
      setRequestData({ ...requestData, heads: [] });
    }
    setIsRequestModalOpen(true);
  };

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.schoolNumber.includes(searchTerm)
  );

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
          value={`₹${(feeRequests.filter(f => f.status !== 'paid').reduce((sum, f) => sum + f.totalAmount, 0) || 0).toLocaleString()}`}
          icon={AlertCircle}
          gradient="gradient-amber"
          index={2}
        />
        <StatCard
          label="Overdue"
          value={`₹${(feeRequests.filter(f => f.status === 'overdue').reduce((sum, f) => sum + f.totalAmount, 0) || 0).toLocaleString()}`}
          icon={Clock}
          gradient="gradient-amber"
          index={3}
        />
      </div>

      {/* Transactions Table */}
      <Card padding="none">
        <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by student name or school number..."
            className="max-w-md flex-1"
          />
        </div>
        {filteredStudents.length > 0 ? (
          <Table>
            <Thead>
              <tr>
                <Th>Student</Th>
                <Th>School No.</Th>
                <Th>Total Fee</Th>
                <Th>Paid</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {filteredStudents.map((student) => {
                const studentRequest = feeRequests.find(r => r.studentId === student.id && r.status !== 'paid');
                const totalFee = studentRequest?.totalAmount || 0;
                const paidAmount = payments
                  .filter(p => p.studentId === student.id)
                  .reduce((sum, p) => sum + p.amount, 0);

                return (
                  <Tr key={student.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={student.name} size="sm" />
                        <span className="font-bold text-slate-900">{student.name}</span>
                      </div>
                    </Td>
                    <Td>{student.schoolNumber}</Td>
                    <Td className="font-bold text-slate-900">₹{(totalFee || 0).toLocaleString()}</Td>
                    <Td className="font-bold text-emerald-600">₹{(paidAmount || 0).toLocaleString()}</Td>
                    <Td>
                      <Badge
                        variant={
                          student.feeStatus === 'paid' ? 'success' :
                            student.feeStatus === 'overdue' ? 'error' : 'warning'
                        }
                      >
                        {student.feeStatus}
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
                          Generate Request
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="xs"
                          icon={Plus}
                          onClick={() => {
                            setSelectedStudent(student);
                            setPaymentData({ ...paymentData, amount: studentRequest.totalAmount.toString() });
                            setIsModalOpen(true);
                          }}
                        >
                          Mark as Paid
                        </Button>
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
                <Th className="text-right">Receipt</Th>
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
                      <IconButton
                        icon={Download}
                        onClick={() => handleDownloadReceipt(tx)}
                        variant="ghost"
                      />
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
        onClose={() => setIsRequestModalOpen(false)}
        title="Generate Fee Request"
        subtitle={selectedStudent ? `${selectedStudent.name} (${selectedStudent.schoolNumber})` : ''}
        size="lg"
        footer={
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Total Request Amount</p>
              <p className="text-2xl font-black text-slate-900">₹{(requestData.heads.reduce((sum, h) => sum + h.finalAmount, 0) || 0).toLocaleString()}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setIsRequestModalOpen(false)}>Cancel</Button>
              <Button variant="success" loading={loading} onClick={(e: any) => {
                const form = e.target.closest('.modal-form') || document.querySelector('form[data-request-form]');
                if (form) form.requestSubmit();
              }}>Generate Request</Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleCreateRequest} data-request-form className="space-y-6">
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
              <button
                type="button"
                onClick={() => setRequestData({
                  ...requestData,
                  heads: [...requestData.heads, { name: '', amount: 0, discount: 0, finalAmount: 0 }]
                })}
                className="text-xs font-bold text-amber-600 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Custom Head
              </button>
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
    </div>
  );
}
