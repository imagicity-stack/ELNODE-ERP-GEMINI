import { UserProfile, Student, Class, Fee, FeePayment, FeeRequest, FeeStructure, PaymentMethod, FeeHead, FineConfig } from '../../types';
import { Download, IndianRupee, CheckCircle2, Clock, AlertCircle, Plus, Receipt, Trash2, History, ShieldOff, Scale, MessageSquare, Search, Users, ChevronDown, ChevronUp } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, orderBy, setDoc, deleteDoc, getDoc, runTransaction, onSnapshot } from 'firebase/firestore';
import { calculateFine, getEffectiveTotal } from '../../services/fineService';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { generateFeeReceipt } from '../../lib/receiptGenerator';
import { createPdf, addFooter, TABLE_STYLES } from '../../lib/pdfTemplate';
import { fmtMonthYear } from '../../lib/utils';
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
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
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

  const fetchData = () => {
    // No-op: live data via onSnapshot. Kept so existing call sites still type-check.
  };

  useEffect(() => {
    setLoading(true);
    const onErr = (err: any) => { handleFirestoreError(err, OperationType.LIST, 'feeRequests'); setLoading(false); };

    const unsubs = [
      onSnapshot(collection(db, 'students'), (s) => setStudents(s.docs.map(d => ({ id: d.id, ...d.data() } as Student))), onErr),
      onSnapshot(collection(db, 'feeRequests'), (s) => { setFeeRequests(s.docs.map(d => ({ id: d.id, ...d.data() } as FeeRequest))); setLoading(false); }, onErr),
      onSnapshot(query(collection(db, 'feePayments'), orderBy('date', 'desc')), (s) => setPayments(s.docs.map(d => ({ id: d.id, ...d.data() } as FeePayment))), onErr),
      onSnapshot(collection(db, 'feeStructures'), (s) => setFeeStructures(s.docs.map(d => ({ id: d.id, ...d.data() } as FeeStructure))), onErr),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map(d => ({ id: d.id, ...d.data() } as Class))), onErr),
      onSnapshot(collection(db, 'feeHeads'), (s) => setGlobalHeads(s.docs.map(d => ({ ...d.data() } as FeeHead))), onErr),
    ];

    // fine-config is a static singleton — one-time read is sufficient
    getDoc(doc(db, 'fine-config', 'global')).then(fineSnap => {
      if (fineSnap.exists()) setFineConfig(fineSnap.data() as FineConfig);
    }).catch(onErr);

    // Check for search param in URL
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get('search');
    if (searchParam) {
      setSearchTerm(searchParam);
    }

    return () => unsubs.forEach(u => u());
  }, []);

  const exportCollectionReport = async () => {
    const total = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const today = new Date().toLocaleDateString('en-IN');
    const { doc, contentY } = await createPdf('Fee Collection Report', `As of ${today}`);

    const rows = payments.map((p) => {
      const student = students.find((s) => s.id === p.studentId);
      return [
        p.receiptNumber || '-',
        p.date,
        student?.name || p.studentId,
        student?.classId ? `${student.classId}-${student.section}` : '-',
        p.feeHead || '-',
        (p.method || '').replace('_', ' ').toUpperCase(),
        `₹${(p.amount || 0).toLocaleString('en-IN')}`,
      ];
    });

    (doc as any).autoTable({
      startY: contentY + 2,
      head: [['Receipt', 'Date', 'Student', 'Class', 'Fee Head', 'Method', 'Amount']],
      body: rows,
      foot: [[
        { content: `Total: ${payments.length} payments`, colSpan: 6, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: `₹${total.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', textColor: [5, 150, 105] } },
      ]],
      ...TABLE_STYLES,
      footStyles: { fillColor: [209, 250, 229], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: 12, right: 12 },
    });

    addFooter(doc);
    doc.save(`fee_collection_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleDownloadReceipt = (payment: FeePayment) => {
    const request = feeRequests.find(r => r.id === payment.feeRequestId);
    const student = students.find(s => s.id === payment.studentId);
    if (request && student) {
      generateFeeReceipt(payment, request, student);
    } else {
      showToast('Could not find fee request or student details for this payment.', 'error');
    }
  };

  const handleSendWhatsApp = async (payment: FeePayment) => {
    const student = students.find(s => s.id === payment.studentId);
    const cls = classes.find(c => c.id === student?.classId);
    if (!student?.parentDetails?.phone) {
      showToast('No phone number on record for this student', 'error');
      return;
    }
    const classSection = `${cls?.name || student.classId} - ${student.section}`;
    try {
      const res = await fetch('/api/whatsapp/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: student.parentDetails.phone,
          templateName: 'payment_confirmed',
          parameters: [
            student.parentDetails.fatherName || 'Parent',
            `₹${payment.amount.toLocaleString('en-IN')}`,
            student.name,
            classSection,
            payment.receiptNumber,
            new Date(payment.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
            payment.method.replace(/_/g, ' '),
          ],
        }),
      });
      if (!res.ok) throw new Error();
      showToast('WhatsApp receipt sent!', 'success');
    } catch {
      showToast('Failed to send WhatsApp message', 'error');
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
      if (!Number.isFinite(payAmount) || payAmount <= 0) {
        showToast('Enter a valid payment amount', 'error');
        setLoading(false);
        return;
      }

      const receiptNumber = `REC-${Date.now()}`;
      const requestRef = doc(db, 'feeRequests', pendingRequest.id);

      // Pre-fetch prior payments for this fee request so we can allocate the new
      // amount across the request's heads (derived bookkeeping; authoritative
      // totals stay on the transactional fee-request read below).
      const priorPaymentsSnap = await getDocs(query(
        collection(db, 'feePayments'),
        where('feeRequestId', '==', pendingRequest.id)
      ));
      const priorPayments = priorPaymentsSnap.docs.map(d => d.data() as FeePayment);

      // Atomic transaction: re-read the fee request, validate against latest state,
      // create payment + update request together. Prevents stale-read overpayments.
      const txResult = await runTransaction(db, async (tx) => {
        const fresh = await tx.get(requestRef);
        if (!fresh.exists()) throw new Error('Fee request no longer exists');
        const freshData = { id: fresh.id, ...(fresh.data() as Omit<FeeRequest, 'id'>) } as FeeRequest;

        if (freshData.status === 'paid') {
          throw new Error('This fee request is already fully paid');
        }

        const currentFine = fineConfig ? calculateFine(freshData, fineConfig) : 0;
        const totalRequired = freshData.totalAmount + currentFine - (freshData.waivedAmount || 0);
        const alreadyPaid = freshData.paidAmount || 0;
        const remaining = totalRequired - alreadyPaid;

        if (payAmount > remaining + 0.001) {
          throw new Error(`Payment amount exceeds remaining balance (₹${remaining.toFixed(2)})`);
        }

        const newPaidAmount = alreadyPaid + payAmount;
        const newStatus: FeeRequest['status'] =
          newPaidAmount + 0.001 >= totalRequired ? 'paid' : 'partially_paid';

        // ── Allocate the new payment across the request's heads (FIFO).
        // Uses balances derived from prior payments' allocations. Falls back to
        // the user-selected head if the request has no head breakdown.
        const headBalances = new Map<string, number>();
        (freshData.heads || []).forEach(h => {
          headBalances.set(h.name, (h.finalAmount ?? h.amount ?? 0));
        });
        for (const p of priorPayments) {
          if (p.allocations && p.allocations.length) {
            for (const a of p.allocations) {
              const cur = headBalances.get(a.headName) ?? 0;
              headBalances.set(a.headName, Math.max(0, cur - (a.amount || 0)));
            }
          } else if (p.feeHead && headBalances.has(p.feeHead)) {
            const cur = headBalances.get(p.feeHead) ?? 0;
            headBalances.set(p.feeHead, Math.max(0, cur - (p.amount || 0)));
          }
        }

        const allocations: { headName: string; amount: number }[] = [];
        let remainingToAllocate = payAmount;
        // Prefer the user-selected head first, then walk the rest in declared order.
        const orderedHeads = (freshData.heads || []).map(h => h.name);
        const ordered = orderedHeads.includes(paymentData.head)
          ? [paymentData.head, ...orderedHeads.filter(n => n !== paymentData.head)]
          : orderedHeads;

        for (const name of ordered) {
          if (remainingToAllocate <= 0.001) break;
          const bal = headBalances.get(name) ?? 0;
          if (bal <= 0) continue;
          const take = Math.min(bal, remainingToAllocate);
          allocations.push({ headName: name, amount: Number(take.toFixed(2)) });
          remainingToAllocate -= take;
        }
        // Any leftover (e.g. fine portion, or request had no heads) gets a fallback row
        if (remainingToAllocate > 0.001) {
          allocations.push({
            headName: paymentData.head || 'Other',
            amount: Number(remainingToAllocate.toFixed(2)),
          });
        }

        const paymentDoc: Omit<FeePayment, 'id'> = {
          studentId: selectedStudent.id,
          classId: selectedStudent.classId,
          feeRequestId: pendingRequest.id,
          feeHead: paymentData.head,
          amount: payAmount,
          fineAmount: 0, // Fine snapshot lives on the FeeRequest; payments record cash collected
          allocations,
          date: paymentData.date,
          method: paymentData.method,
          referenceNumber: paymentData.referenceNumber,
          receiptNumber,
          remarks: paymentData.remarks,
        };

        const newPayRef = doc(collection(db, 'feePayments'));
        tx.set(newPayRef, paymentDoc);
        tx.update(requestRef, {
          paidAmount: newPaidAmount,
          fineAmount: currentFine,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        });

        return { paymentId: newPayRef.id, newStatus, paymentDoc };
      });

      const paymentDoc = txResult.paymentDoc;

      logActivity(
        user,
        'Recorded Fee Payment',
        'Accounts',
        `Collected ₹${payAmount.toLocaleString()} from ${selectedStudent.name} for ${paymentData.head}`,
        { studentId: selectedStudent.id, feeHead: paymentData.head, amount: payAmount }
      );

      // Recompute student.feeStatus from the latest set of requests (best-effort,
      // derived field — done after the atomic write so it never blocks payment).
      try {
        const allReqSnap = await getDocs(query(
          collection(db, 'feeRequests'),
          where('studentId', '==', selectedStudent.id)
        ));
        const allReqs = allReqSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<FeeRequest, 'id'>) } as FeeRequest));
        const stillPending = allReqs.some(r =>
          r.id === pendingRequest.id ? txResult.newStatus !== 'paid' : r.status !== 'paid'
        );
        await updateDoc(doc(db, 'students', selectedStudent.id), {
          feeStatus: stillPending ? 'pending' : 'paid',
        });
      } catch (statusErr) {
        console.warn('[FeeCollection] derived student.feeStatus update failed:', statusErr);
      }

      await logActivity(
        user,
        'RECORD_PAYMENT',
        'Accounts',
        `Recorded payment of ₹${payAmount} for ${selectedStudent.name} (${selectedStudent.schoolNumber})`,
        { studentId: selectedStudent.id }
      );

      setIsModalOpen(false);
      fetchData();

      // Auto-send WhatsApp receipt to parent (cash, bank, online — any method)
      try {
        const parentPhone = selectedStudent.parentDetails?.phone;
        if (parentPhone) {
          const cls = classes.find(c => c.id === selectedStudent.classId);
          const classSection = `${cls?.name || selectedStudent.classId} - ${selectedStudent.section}`;
          await fetch('/api/whatsapp/send-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: parentPhone,
              templateName: 'payment_confirmed',
              parameters: [
                selectedStudent.parentDetails?.fatherName || 'Parent',
                `₹${payAmount.toLocaleString('en-IN')}`,
                selectedStudent.name,
                classSection,
                paymentDoc.receiptNumber,
                new Date(paymentData.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
                (paymentData.method || '').replace(/_/g, ' '),
              ],
            }),
          });
        }
      } catch { /* non-fatal — payment is already recorded */ }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg && !msg.toLowerCase().includes('firestore') && !msg.toLowerCase().includes('permission')) {
        showToast(msg, 'error');
      } else {
        handleFirestoreError(err, OperationType.WRITE, 'feePayments');
      }
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
        // Preserve createdAt and immutable bookkeeping fields on edit
        const editPayload: Partial<FeeRequest> = {
          ...requestPayload,
          updatedAt: new Date().toISOString(),
        } as Partial<FeeRequest>;
        await updateDoc(doc(db, 'feeRequests', currentRequestId), editPayload);
        showToast('Fee request updated successfully!', 'success');
        await logActivity(
          user,
          'UPDATE_FEE_REQUEST',
          'Accounts',
          `Updated fee request for ${selectedStudent.name} (${fmtMonthYear(requestData.month)})`,
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
          `Generated fee request for ${selectedStudent.name} (${fmtMonthYear(requestData.month)})`,
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

      const paymentRef = doc(db, 'feePayments', paymentId);
      const requestRef = payment.feeRequestId ? doc(db, 'feeRequests', payment.feeRequestId) : null;

      // Atomic delete + rollback. Re-reads request inside the transaction so
      // the rolled-back paidAmount reflects current DB state, not stale UI cache.
      await runTransaction(db, async (tx) => {
        const payDoc = await tx.get(paymentRef);
        if (!payDoc.exists()) {
          // Already deleted — nothing to do, treat as success
          return;
        }

        if (requestRef) {
          const reqDoc = await tx.get(requestRef);
          if (reqDoc.exists()) {
            const reqData = reqDoc.data() as FeeRequest;
            const newPaidAmount = Math.max(0, (reqData.paidAmount || 0) - payment.amount);
            const newStatus: FeeRequest['status'] = newPaidAmount === 0 ? 'pending' : 'partially_paid';
            tx.update(requestRef, {
              paidAmount: newPaidAmount,
              status: newStatus,
              updatedAt: new Date().toISOString(),
            });
          }
        }

        tx.delete(paymentRef);
      });

      // Recompute derived student.feeStatus (best-effort, post-transaction)
      try {
        const allReqSnap = await getDocs(query(
          collection(db, 'feeRequests'),
          where('studentId', '==', payment.studentId)
        ));
        const stillPending = allReqSnap.docs.some(d => {
          const r = d.data() as FeeRequest;
          if (d.id === payment.feeRequestId) return true; // just rolled back
          return r.status !== 'paid';
        });
        await updateDoc(doc(db, 'students', payment.studentId), {
          feeStatus: stillPending ? 'pending' : 'paid',
        });
      } catch (statusErr) {
        console.warn('[FeeCollection] derived student.feeStatus update failed after delete:', statusErr);
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
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg && !msg.toLowerCase().includes('firestore') && !msg.toLowerCase().includes('permission')) {
        showToast(msg, 'error');
      } else {
        handleFirestoreError(err, OperationType.DELETE, 'feePayments');
      }
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

  const totalOutstanding = feeRequests
    .filter(f => f.status !== 'paid')
    .reduce((sum, f) => sum + (f.totalAmount - (f.paidAmount || 0)), 0);

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-4 pt-5 pb-6 text-white rounded-b-3xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Accountant Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Fee Collection</h1>

          <div className="mt-4 bg-white/15 backdrop-blur rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Total Outstanding</p>
            <p className="text-3xl font-black mt-1">₹{totalOutstanding.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-emerald-100/90 mt-1">across {feeRequests.filter(f => f.status !== 'paid').length} pending requests</p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((todayCollection/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Today</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((monthCollection/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Month</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">{students.length}</p>
              <p className="text-[9px] text-white/80">Students</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search student name or roll no..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        <div className="px-4 overflow-x-auto flex gap-2 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setSelectedClass('all')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap active:scale-95 transition-transform ${selectedClass === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            All Classes
          </button>
          {classes.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedClass(c.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap active:scale-95 transition-transform ${selectedClass === c.id ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="px-4 pt-2 space-y-2.5">
          {filteredStudents.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No students found</p>
              <p className="text-xs text-slate-500 mt-1">Try a different search or class</p>
            </div>
          ) : (
            filteredStudents.slice(0, 50).map((student) => {
              const studentRequests = feeRequests.filter(r => r.studentId === student.id && r.status !== 'paid');
              const totalFee = studentRequests.reduce((sum, r) => sum + r.totalAmount, 0);
              const currentFine = studentRequests.reduce((sum, r) => sum + (fineConfig ? calculateFine(r, fineConfig) : 0), 0);
              const waiverAmount = studentRequests.reduce((sum, r) => sum + (r.waivedAmount || 0), 0);
              const paidAmount = studentRequests.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
              const balance = totalFee + currentFine - waiverAmount - paidAmount;
              const studentRequest = studentRequests[0];
              const className = classes.find(c => c.id === student.classId)?.name || student.classId;

              return (
                <div key={student.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={student.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{student.name}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {className} • {student.section} • #{student.schoolNumber}
                      </p>
                    </div>
                    <Badge
                      variant={student.feeStatus === 'paid' ? 'success' : student.feeStatus === 'overdue' ? 'error' : 'warning'}
                      className="text-[9px] shrink-0"
                    >
                      {studentRequest?.status?.replace('_', ' ') || student.feeStatus}
                    </Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 rounded-lg py-1.5">
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Due</p>
                      <p className="text-xs font-bold text-slate-900">₹{(totalFee + currentFine - waiverAmount).toLocaleString()}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg py-1.5">
                      <p className="text-[9px] text-emerald-700 uppercase tracking-widest font-bold">Paid</p>
                      <p className="text-xs font-bold text-emerald-700">₹{paidAmount.toLocaleString()}</p>
                    </div>
                    <div className="bg-rose-50 rounded-lg py-1.5">
                      <p className="text-[9px] text-rose-700 uppercase tracking-widest font-bold">Balance</p>
                      <p className="text-xs font-bold text-rose-700">₹{balance.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    {!studentRequest ? (
                      <button
                        onClick={() => openRequestModal(student)}
                        className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                      >
                        <Plus className="w-3.5 h-3.5" /> Generate Request
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => openRequestModal(student, studentRequest)}
                          className="py-2 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform"
                        >
                          <Receipt className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => {
                            setSelectedStudent(student);
                            const pending = feeRequests.find(r => r.studentId === student.id && r.status !== 'paid');
                            const structure = feeStructures.find(fs => fs.classId === student.classId);
                            const defaultHead =
                              pending?.heads?.[0]?.name ||
                              structure?.heads?.[0]?.name ||
                              globalHeads[0]?.name ||
                              'Tuition Fees';
                            setPaymentData({ ...paymentData, amount: balance.toString(), head: defaultHead });
                            setIsModalOpen(true);
                          }}
                          className="flex-1 py-2 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform shadow-sm"
                        >
                          <IndianRupee className="w-3.5 h-3.5" /> Collect ₹{balance.toLocaleString()}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Payment history toggle */}
                  <button
                    onClick={() => setExpandedStudentId(expandedStudentId === student.id ? null : student.id)}
                    className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    <History className="w-3.5 h-3.5" />
                    Payment History
                    {expandedStudentId === student.id
                      ? <ChevronUp className="w-3.5 h-3.5" />
                      : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {expandedStudentId === student.id && (() => {
                    const studentPayments = payments.filter(p => p.studentId === student.id);
                    return (
                      <div className="mt-2 border-t border-slate-100 pt-2 space-y-1.5">
                        {studentPayments.length === 0 ? (
                          <p className="text-center text-[11px] text-slate-400 py-2">No payments recorded yet</p>
                        ) : studentPayments.map(p => (
                          <div key={p.id} className="flex items-center justify-between px-1 py-1">
                            <div>
                              <p className="text-xs font-bold text-slate-800">₹{(p.amount || 0).toLocaleString()}</p>
                              <p className="text-[10px] text-slate-400">{p.head} · {p.method} · {p.date}</p>
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">PAID</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })
          )}
        </div>

        <button
          onClick={exportCollectionReport}
          className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          aria-label="Export"
        >
          <Download className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Fee Collection"
        subtitle="Track and manage student fee payments"
        icon={IndianRupee}
        iconColor="gradient-amber"
        actions={
          <Button variant="primary" icon={Download} onClick={exportCollectionReport}>
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

                const studentPayments = payments.filter(p => p.studentId === student.id);
                const isExpanded = expandedStudentId === student.id;
                return (
                  <React.Fragment key={student.id}>
                  <Tr>
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
                  {/* Expandable payment history row */}
                  <Tr>
                    <Td colSpan={7} className="!py-0 !px-0">
                      <button
                        onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/40 transition-colors"
                      >
                        <History className="w-3 h-3" />
                        {isExpanded ? 'Hide history' : 'Show payment history'}
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </Td>
                  </Tr>
                  {isExpanded && (
                    studentPayments.length === 0
                      ? (
                        <Tr>
                          <Td colSpan={7} className="text-center text-xs text-slate-400 py-3 bg-slate-50/60">
                            No payments recorded yet
                          </Td>
                        </Tr>
                      )
                      : studentPayments.map(p => (
                        <Tr key={`hist-${p.id}`} className="bg-slate-50/60">
                          <Td colSpan={2}>
                            <div className="flex items-center gap-2 pl-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <div>
                                <p className="text-xs font-bold text-slate-700">{p.head}</p>
                                <p className="text-[10px] text-slate-400">{p.method}{p.referenceNumber ? ` · Ref: ${p.referenceNumber}` : ''}</p>
                              </div>
                            </div>
                          </Td>
                          <Td className="text-xs text-slate-500">{p.date}</Td>
                          <Td className="font-bold text-emerald-600 text-xs">₹{(p.amount || 0).toLocaleString()}</Td>
                          <Td colSpan={3} className="text-[10px] text-slate-400 italic">{p.remarks || '—'}</Td>
                        </Tr>
                      ))
                  )}
                  </React.Fragment>
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
                          title="Download receipt"
                        />
                        <IconButton
                          icon={MessageSquare}
                          onClick={() => handleSendWhatsApp(tx)}
                          variant="ghost"
                          title="Send WhatsApp receipt"
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
      </div>

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
              {(() => {
                // Prefer heads from the active pending fee request for this student.
                // Fall back to the student's class fee structure, then to the global heads.
                const pending = selectedStudent
                  ? feeRequests.find(r => r.studentId === selectedStudent.id && r.status !== 'paid')
                  : null;
                const structure = selectedStudent
                  ? feeStructures.find(fs => fs.classId === selectedStudent.classId)
                  : null;

                const sourceHeads =
                  (pending?.heads && pending.heads.length > 0 && pending.heads.map(h => h.name)) ||
                  (structure?.heads && structure.heads.length > 0 && structure.heads.map(h => h.name)) ||
                  (globalHeads.length > 0 && globalHeads.map(h => h.name)) ||
                  ['Tuition Fees', 'Transport Fees', 'Examination Fees', 'Hostel Fees', 'Academic Fees', 'Miscellaneous'];

                const unique = Array.from(new Set(sourceHeads as string[]));
                return unique.map(name => (
                  <option key={name} value={name}>{name}</option>
                ));
              })()}
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
    </>
  );
}
