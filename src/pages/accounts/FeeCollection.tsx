import { UserProfile, Student, Fee, FeePayment, FeeRequest, FeeStructure, PaymentMethod } from '../../types';
import { Search, Filter, Download, IndianRupee, CreditCard, User, Calendar, MoreVertical, CheckCircle2, Clock, AlertCircle, Plus, X, Receipt, Trash2, Save, History } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, orderBy, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { generateFeeReceipt } from '../../lib/receiptGenerator';
import { useToast } from '../../components/Toast';

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fee Collection</h1>
          <p className="text-gray-500 text-sm">Track and manage student fee payments.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-all">
            <Download className="w-4 h-4" />
            Export Collection Report
          </button>
        </div>
      </div>

      {/* Collection Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Today\'s Collection', value: `₹${(todayCollection || 0).toLocaleString()}`, count: `${payments.filter(p => p.date === new Date().toISOString().split('T')[0]).length} Payments`, color: 'blue', icon: IndianRupee },
          { label: 'This Month', value: `₹${(monthCollection || 0).toLocaleString()}`, count: `${payments.filter(p => p.date.startsWith(new Date().toISOString().slice(0, 7))).length} Payments`, color: 'emerald', icon: CheckCircle2 },
          { label: 'Pending Dues', value: `₹${(feeRequests.filter(f => f.status !== 'paid').reduce((sum, f) => sum + f.totalAmount, 0) || 0).toLocaleString()}`, count: `${feeRequests.filter(f => f.status !== 'paid').length} Requests`, color: 'amber', icon: AlertCircle },
          { label: 'Overdue', value: `₹${(feeRequests.filter(f => f.status === 'overdue').reduce((sum, f) => sum + f.totalAmount, 0) || 0).toLocaleString()}`, count: `${feeRequests.filter(f => f.status === 'overdue').length} Requests`, color: 'red', icon: Clock },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              stat.color === 'blue' && "bg-blue-50 text-blue-600",
              stat.color === 'emerald' && "bg-emerald-50 text-emerald-600",
              stat.color === 'amber' && "bg-amber-50 text-amber-600",
              stat.color === 'red' && "bg-red-50 text-red-600",
            )}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-[10px] text-gray-500 font-medium">{stat.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by student name or school number..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">School No.</th>
                <th className="px-6 py-4">Total Fee</th>
                <th className="px-6 py-4">Paid</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredStudents.map((student) => {
                const studentRequest = feeRequests.find(r => r.studentId === student.id && r.status !== 'paid');
                const totalFee = studentRequest?.totalAmount || 0;
                const paidAmount = payments
                  .filter(p => p.studentId === student.id)
                  .reduce((sum, p) => sum + p.amount, 0);

                return (
                  <tr key={student.id} className="group hover:bg-gray-50 transition-all">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                          {student.name.charAt(0)}
                        </div>
                        <span className="text-sm font-bold text-gray-900">{student.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{student.schoolNumber}</td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">₹{(totalFee || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-emerald-600 font-bold">₹{(paidAmount || 0).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                        student.feeStatus === 'paid' && "bg-emerald-50 text-emerald-600",
                        student.feeStatus === 'pending' && "bg-amber-50 text-amber-600",
                        student.feeStatus === 'overdue' && "bg-red-50 text-red-600",
                      )}>
                        {student.feeStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!studentRequest ? (
                          <button 
                            onClick={() => openRequestModal(student)}
                            className="flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all"
                          >
                            <Plus className="w-3 h-3" />
                            Generate Request
                          </button>
                        ) : (
                          <button 
                            onClick={() => {
                              setSelectedStudent(student);
                              setPaymentData({ ...paymentData, amount: studentRequest.totalAmount.toString() });
                              setIsModalOpen(true);
                            }}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all"
                          >
                            <Plus className="w-3 h-3" />
                            Mark as Paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Payments */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b bg-gray-50/50 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            Recent Payments
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                <th className="px-6 py-4">Receipt No.</th>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Method</th>
                <th className="px-6 py-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.slice(0, 10).map((tx) => {
                const student = students.find(s => s.id === tx.studentId);
                return (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-all">
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{tx.receiptNumber}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{student?.name || 'Unknown'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{tx.date}</td>
                    <td className="px-6 py-4 text-sm font-bold text-emerald-600">₹{(tx.amount || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">{tx.method.replace('_', ' ')}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDownloadReceipt(tx)}
                        className="p-2 hover:bg-blue-50 rounded-lg text-blue-600"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No payment history found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isRequestModalOpen && selectedStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRequestModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Generate Fee Request</h2>
                    <p className="text-xs text-gray-500">{selectedStudent.name} ({selectedStudent.schoolNumber})</p>
                  </div>
                </div>
                <button onClick={() => setIsRequestModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleCreateRequest} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Billing Month</label>
                    <input 
                      type="text" required
                      value={requestData.month}
                      onChange={(e) => setRequestData({...requestData, month: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input 
                      type="date" required
                      value={requestData.dueDate}
                      onChange={(e) => setRequestData({...requestData, dueDate: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Fee Heads</h3>
                    <button 
                      type="button"
                      onClick={() => setRequestData({
                        ...requestData,
                        heads: [...requestData.heads, { name: '', amount: 0, discount: 0, finalAmount: 0 }]
                      })}
                      className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add Custom Head
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {requestData.heads.map((head, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-end p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="col-span-4">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Head Name</label>
                          <input 
                            type="text" required
                            value={head.name}
                            onChange={(e) => {
                              const newHeads = [...requestData.heads];
                              newHeads[index].name = e.target.value;
                              setRequestData({...requestData, heads: newHeads});
                            }}
                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Amount</label>
                          <input 
                            type="number" required
                            value={head.amount}
                            onChange={(e) => {
                              const newHeads = [...requestData.heads];
                              newHeads[index].amount = Number(e.target.value);
                              newHeads[index].finalAmount = newHeads[index].amount - newHeads[index].discount;
                              setRequestData({...requestData, heads: newHeads});
                            }}
                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Discount</label>
                          <input 
                            type="number"
                            value={head.discount}
                            onChange={(e) => {
                              const newHeads = [...requestData.heads];
                              newHeads[index].discount = Number(e.target.value);
                              newHeads[index].finalAmount = newHeads[index].amount - newHeads[index].discount;
                              setRequestData({...requestData, heads: newHeads});
                            }}
                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Final</label>
                          <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-900">
                            ₹{(head.finalAmount || 0).toLocaleString()}
                          </div>
                        </div>
                        <div className="col-span-1">
                          <button 
                            type="button"
                            onClick={() => {
                              const newHeads = requestData.heads.filter((_, i) => i !== index);
                              setRequestData({...requestData, heads: newHeads});
                            }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-blue-600 rounded-2xl text-white flex items-center justify-between shadow-xl shadow-blue-600/20">
                  <div>
                    <p className="text-xs opacity-70 font-bold uppercase tracking-widest">Total Request Amount</p>
                    <h3 className="text-3xl font-black mt-1">₹{(requestData.heads.reduce((sum, h) => sum + h.finalAmount, 0) || 0).toLocaleString()}</h3>
                  </div>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="px-8 py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-lg disabled:opacity-50"
                  >
                    {loading ? 'Generating...' : 'Generate Request'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && selectedStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                    <IndianRupee className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Capture Payment</h2>
                    <p className="text-xs text-gray-500">{selectedStudent.name} ({selectedStudent.schoolNumber})</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleRecordPayment} className="p-8 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                  <input 
                    type="number" required
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({...paymentData, amount: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select 
                    value={paymentData.method}
                    onChange={(e) => setPaymentData({...paymentData, method: e.target.value as any})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="upi">UPI</option>
                    <option value="net_banking">Net Banking</option>
                  </select>
                </div>
                {paymentData.method !== 'cash' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                    <input 
                      type="text" required
                      placeholder="Transaction ID / Cheque No."
                      value={paymentData.referenceNumber}
                      onChange={(e) => setPaymentData({...paymentData, referenceNumber: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input 
                    type="date" required
                    value={paymentData.date}
                    onChange={(e) => setPaymentData({...paymentData, date: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <textarea 
                    value={paymentData.remarks}
                    onChange={(e) => setPaymentData({...paymentData, remarks: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none h-20 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-4 pt-6 border-t">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="px-8 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Processing...' : 'Capture Payment'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
