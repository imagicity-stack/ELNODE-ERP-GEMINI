import { UserProfile, Student, FeeRequest, FeePayment, FineConfig, AdvancePayment, FeeStructure, FeeHead } from '../../types';
import { CreditCard, IndianRupee, Receipt, AlertCircle, CheckCircle2, Clock, Download, Wallet, Scale, ShieldOff, CalendarDays } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, orderBy, getDoc } from 'firebase/firestore';
import { calculateFine, getEffectiveTotal } from '../../services/fineService';
import { getAdvancePaymentsForStudent } from '../../services/advancePaymentService';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { generateFeeReceipt } from '../../lib/receiptGenerator';
import { fmtDate } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  IconButton,
  Alert,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
  StatCard,
  Spinner,
  Modal,
  FormField,
} from '../../components/ui';

interface ParentFeesProps {
  user: UserProfile;
  selectedStudent: Student | null;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function ParentFees({ user, selectedStudent }: ParentFeesProps) {
  const [feeRequests, setFeeRequests] = useState<FeeRequest[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [fineConfig, setFineConfig] = useState<FineConfig | null>(null);
  const [advancePayments, setAdvancePayments] = useState<AdvancePayment[]>([]);
  const [availableHeads, setAvailableHeads] = useState<FeeHead[]>([]);
  const [loading, setLoading] = useState(false);

  // Advance payment modal state (parent-initiated, online)
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceSelectedMonths, setAdvanceSelectedMonths] = useState<string[]>([]);
  const [advanceSelectedHeads, setAdvanceSelectedHeads] = useState<string[]>([]);
  const [advanceProcessing, setAdvanceProcessing] = useState(false);
  const { showToast } = useToast();

  const fetchData = async () => {
    if (!selectedStudent?.id) return;
    setLoading(true);
    try {
      const requestsQuery = query(collection(db, 'feeRequests'), where('studentId', '==', selectedStudent.id));
      const paymentsQuery = query(collection(db, 'feePayments'), where('studentId', '==', selectedStudent.id), orderBy('date', 'desc'));

      const [requestsSnap, paymentsSnap, fineSnap, advances, structSnap] = await Promise.all([
        getDocs(requestsQuery).catch(err => { handleFirestoreError(err, OperationType.LIST, 'feeRequests'); throw err; }),
        getDocs(paymentsQuery).catch(err => { handleFirestoreError(err, OperationType.LIST, 'feePayments'); throw err; }),
        getDoc(doc(db, 'fine-config', 'global')),
        getAdvancePaymentsForStudent(selectedStudent.id).catch(() => [] as AdvancePayment[]),
        getDocs(query(collection(db, 'feeStructures'), where('classId', '==', selectedStudent.classId))).catch(() => null),
      ]);

      setFeeRequests(requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeRequest)));
      setPayments(paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeePayment)));
      if (fineSnap.exists()) {
        setFineConfig(fineSnap.data() as FineConfig);
      }
      setAdvancePayments(advances);
      if (structSnap && !structSnap.empty) {
        const struct = structSnap.docs[0].data() as FeeStructure;
        setAvailableHeads(struct.heads || []);
      } else {
        // Fallback to global heads if no class structure
        try {
          const ghSnap = await getDocs(collection(db, 'feeHeads'));
          setAvailableHeads(ghSnap.docs.map(d => d.data() as FeeHead));
        } catch { setAvailableHeads([]); }
      }
    } catch (err) {
      console.error('Error fetching parent fee data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedStudent?.id]);

  const handleDownloadReceipt = (payment: FeePayment) => {
    const request = feeRequests.find(r => r.id === payment.feeRequestId);
    if (request && selectedStudent) {
      generateFeeReceipt(payment, request, selectedStudent);
    } else {
      showToast('Could not find fee request details for this payment.', 'error');
    }
  };

  const handlePayNow = async (request: FeeRequest) => {
    if (!window.Razorpay) {
      showToast('Payment gateway is loading. Please try again in a few seconds.', 'error');
      return;
    }

    const currentFine = fineConfig ? calculateFine(request, fineConfig) : 0;
    const remainingAmount = request.totalAmount + currentFine - (request.waivedAmount || 0) - (request.paidAmount || 0);
    if (remainingAmount <= 0) {
      showToast('This fee request is already fully paid.', 'info');
      return;
    }

    const amountInPaise = Math.round(remainingAmount * 100);
    if (amountInPaise < 100) {
      showToast('Minimum payment amount is ₹1.', 'error');
      return;
    }

    let orderId: string;
    try {
      const orderRes = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountInPaise, feeRequestId: request.id, studentId: request.studentId }),
      });
      if (!orderRes.ok) throw new Error('Order creation failed');
      const { orderId: id } = await orderRes.json();
      orderId = id;
    } catch {
      showToast('Could not initiate payment. Please try again.', 'error');
      return;
    }

    const options = {
      key: (import.meta as any).env.VITE_RAZORPAY_KEY_ID || '',
      order_id: orderId,
      currency: 'INR',
      name: 'School Fee Payment',
      description: `Fees for ${request.month} - ${selectedStudent?.name}`,
      theme: { color: '#EF4444' },
      handler: async function (response: any) {
        try {
          const verifyRes = await fetch('/api/razorpay/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              feeRequestId: request.id,
              studentId: request.studentId,
              classId: selectedStudent?.classId || '',
              amount: remainingAmount,
              feeHead: request.heads[0]?.name || 'Academic Fee',
              month: request.month,
            }),
          });

          if (!verifyRes.ok) {
            const err = await verifyRes.json();
            showToast(err.error || 'Payment verification failed. Contact support.', 'error');
            return;
          }

          const { receiptNumber } = await verifyRes.json();
          logActivity(user, 'Paid Fees Online', 'Parents', `Paid ₹${remainingAmount.toLocaleString()} for ${request.heads[0]?.name || 'Academic Fee'} via Razorpay`);
          showToast(`Payment successful! Receipt: ${receiptNumber}`, 'success');
          fetchData();
        } catch {
          showToast('Payment was processed but could not be recorded. Please contact support.', 'error');
        }
      },
      prefill: { name: user.name, email: user.email },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  // ── Advance payment helpers ────────────────────────────────────────────────

  const getUpcomingMonths = (): string[] => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push(d.toLocaleString('default', { month: 'long', year: 'numeric' }));
    }
    return months;
  };

  const calcAdvanceTotal = (): { perMonth: number; total: number } => {
    const perMonth = availableHeads
      .filter(h => advanceSelectedHeads.includes(h.name))
      .reduce((s, h) => s + (h.amount || 0), 0);
    return { perMonth, total: perMonth * advanceSelectedMonths.length };
  };

  const monthsAlreadyCovered = (): Set<string> => {
    const s = new Set<string>();
    advancePayments.forEach(adv =>
      (adv.monthlyBreakdown || []).forEach(e => {
        if (!e.consumed) s.add(e.month);
      })
    );
    return s;
  };

  const openAdvanceModal = () => {
    setAdvanceSelectedMonths([]);
    setAdvanceSelectedHeads([]);
    setIsAdvanceModalOpen(true);
  };

  const handlePayAdvanceOnline = async () => {
    if (!selectedStudent) return;
    if (advanceSelectedMonths.length === 0) {
      showToast('Pick at least one month', 'info');
      return;
    }
    if (advanceSelectedHeads.length === 0) {
      showToast('Pick at least one fee head', 'info');
      return;
    }
    if (!window.Razorpay) {
      showToast('Payment gateway is loading. Please try again.', 'error');
      return;
    }

    const { total } = calcAdvanceTotal();
    const amountInPaise = Math.round(total * 100);
    if (amountInPaise < 100) {
      showToast('Minimum payment is ₹1', 'error');
      return;
    }

    const monthlyBreakdown = advanceSelectedMonths.map(m => ({
      month: m,
      heads: availableHeads
        .filter(h => advanceSelectedHeads.includes(h.name))
        .map(h => ({ name: h.name, amount: h.amount })),
    }));

    setAdvanceProcessing(true);
    try {
      // Create Razorpay order
      const orderRes = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountInPaise,
          kind: 'advance',
          studentId: selectedStudent.id,
        }),
      });
      if (!orderRes.ok) {
        showToast('Could not initiate payment. Try again.', 'error');
        setAdvanceProcessing(false);
        return;
      }
      const { orderId } = await orderRes.json();

      const options = {
        key: (import.meta as any).env.VITE_RAZORPAY_KEY_ID || '',
        order_id: orderId,
        currency: 'INR',
        name: 'School Fee — Advance',
        description: `Advance for ${advanceSelectedMonths.join(', ')}`,
        theme: { color: '#7C3AED' },
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch('/api/razorpay/verify-advance-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                studentId: selectedStudent.id,
                classId: selectedStudent.classId,
                parentId: user.uid,
                academicYear: '2024-25',
                monthlyBreakdown,
                totalAmount: total,
                remarks: `Online advance via parent portal`,
              }),
            });
            if (!verifyRes.ok) {
              const err = await verifyRes.json();
              showToast(err.error || 'Verification failed. Contact support.', 'error');
              return;
            }
            const { receiptNumber } = await verifyRes.json();
            logActivity(user, 'Paid Advance Online', 'Parents',
              `Paid ₹${total.toLocaleString('en-IN')} advance for ${advanceSelectedMonths.length} month(s) via Razorpay`);
            showToast(`Advance payment successful! Receipt: ${receiptNumber}`, 'success');
            setIsAdvanceModalOpen(false);
            fetchData();
          } catch (err) {
            console.error('verify-advance failed', err);
            showToast('Could not record advance — contact support', 'error');
          } finally {
            setAdvanceProcessing(false);
          }
        },
        modal: {
          ondismiss: () => setAdvanceProcessing(false),
        },
        prefill: {
          name: selectedStudent.parentDetails?.fatherName || user.name,
          email: selectedStudent.parentDetails?.email,
          contact: selectedStudent.parentDetails?.phone,
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error('advance order failed', err);
      showToast('Could not initiate advance payment', 'error');
      setAdvanceProcessing(false);
    }
  };

  if (!selectedStudent) return null;

  const outstandingAmount = feeRequests
    .filter(r => r.status !== 'paid')
    .reduce((sum, r) => sum + (r.totalAmount + (fineConfig ? calculateFine(r, fineConfig) : 0) - (r.waivedAmount || 0) - (r.paidAmount || 0)), 0);

  const currentRequest = feeRequests.find(r => r.status !== 'paid' && r.status !== 'overdue') || feeRequests.find(r => r.status === 'overdue');
  const currentFineForRequest = currentRequest && fineConfig ? calculateFine(currentRequest, fineConfig) : 0;

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className={`${outstandingAmount > 0 ? 'bg-gradient-to-br from-rose-600 to-red-700' : 'bg-gradient-to-br from-violet-600 to-purple-700'} px-4 pt-5 pb-6 text-white`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Parent Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Fee Management</h1>
          <p className="text-xs text-white/70 mt-0.5">{selectedStudent.name}</p>
          <div className="mt-3">
            {outstandingAmount > 0 ? (
              <>
                <p className="text-sm text-white/70">Total Outstanding</p>
                <p className="text-3xl font-black mt-0.5">₹{outstandingAmount.toLocaleString('en-IN')}</p>
              </>
            ) : (
              <div className="flex items-center gap-2 mt-2">
                <CheckCircle2 className="w-5 h-5 text-violet-200" />
                <p className="text-base font-bold text-violet-100">All dues cleared!</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pt-4 pb-24 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <>
              {/* Current Fee Request */}
              {currentRequest ? (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-violet-600" />
                      <span className="font-bold text-slate-900 text-sm">Current Fee Request</span>
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{currentRequest.month}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {currentRequest.heads.map((head, i) => (
                      <div key={i} className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{head.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">Base ₹{head.amount} · Disc ₹{head.discount}</p>
                        </div>
                        <p className="font-bold text-slate-900">₹{(head.finalAmount || 0).toLocaleString()}</p>
                      </div>
                    ))}
                    <div className="p-4 bg-slate-50 space-y-2">
                      {currentFineForRequest > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-rose-500 font-medium flex items-center gap-1"><Scale className="w-3.5 h-3.5" /> Late Fine</span>
                          <span className="font-bold text-rose-600">+ ₹{currentFineForRequest.toLocaleString()}</span>
                        </div>
                      )}
                      {(currentRequest.waivedAmount || 0) > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-emerald-600 font-medium flex items-center gap-1"><ShieldOff className="w-3.5 h-3.5" /> Waiver</span>
                          <span className="font-bold text-emerald-600">- ₹{currentRequest.waivedAmount!.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-slate-200">
                        <span className="font-bold text-slate-900">Net Balance Due</span>
                        <span className="text-lg font-black text-rose-600">
                          ₹{(currentRequest.totalAmount + currentFineForRequest - (currentRequest.waivedAmount || 0) - (currentRequest.paidAmount || 0)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <button
                      onClick={() => handlePayNow(currentRequest)}
                      className="w-full py-3.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl text-sm font-bold active:scale-95 transition-transform shadow-lg flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      Pay Now — ₹{(currentRequest.totalAmount + currentFineForRequest - (currentRequest.waivedAmount || 0) - (currentRequest.paidAmount || 0)).toLocaleString()}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 rounded-2xl p-5 flex items-center gap-4 border border-emerald-100">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-bold text-emerald-900">All Dues Cleared!</p>
                    <p className="text-xs text-emerald-700 mt-0.5">No pending fee requests for {selectedStudent.name}.</p>
                  </div>
                </div>
              )}

              {/* Advance Payments */}
              <div>
                <div className="flex items-center justify-between px-1 mb-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Advance Payments</p>
                  <span className="text-[10px] font-bold text-violet-600">{advancePayments.length} record(s)</span>
                </div>
                {advancePayments.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-4">
                    <p className="text-xs text-slate-500 font-medium">No advance payments made yet.</p>
                    {availableHeads.length > 0 && (
                      <>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-3 mb-2">Heads available to pay in advance</p>
                        <div className="space-y-1">
                          {availableHeads.map(h => (
                            <div key={h.name} className="flex items-center justify-between text-xs py-1">
                              <span className="text-slate-700">{h.name}</span>
                              <span className="font-bold text-emerald-600">₹{h.amount.toLocaleString('en-IN')}/mo</span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={openAdvanceModal}
                          className="mt-3 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1.5"
                        >
                          <CreditCard className="w-3.5 h-3.5" /> Pay in Advance Online
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {advancePayments.map(adv => (
                      <div key={adv.id} className="bg-white rounded-2xl border border-violet-100 shadow-sm p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-violet-600" />
                            <span className="text-xs font-bold text-slate-900">{adv.receiptNumber}</span>
                          </div>
                          <span className="text-sm font-black text-violet-700">₹{adv.totalAmount.toLocaleString('en-IN')}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {fmtDate(adv.date)} · {adv.paymentMethod.replace('_', ' ')}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(adv.monthlyBreakdown || []).map(e => (
                            <span
                              key={e.month}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                e.consumed
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-violet-100 text-violet-700'
                              }`}
                            >
                              {e.month.split(' ')[0].slice(0, 3)} {e.month.split(' ')[1]?.slice(-2)}
                              {e.consumed && ' ✓'}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {availableHeads.length > 0 && (
                      <button
                        onClick={openAdvanceModal}
                        className="w-full py-2.5 rounded-xl border border-dashed border-violet-300 text-violet-700 text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1.5"
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Pay More in Advance
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Payment History */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Payment History</p>
                {payments.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
                    <p className="text-sm text-slate-400 font-medium">No payment records yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {payments.map((tx) => (
                      <div key={tx.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                          <Receipt className="w-5 h-5 text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900">₹{(tx.amount || 0).toLocaleString()}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{tx.receiptNumber} · {fmtDate(tx.date)}</p>
                          <p className="text-xs text-slate-400 capitalize">{tx.method.replace('_', ' ')}</p>
                        </div>
                        <button
                          onClick={() => handleDownloadReceipt(tx)}
                          className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-violet-600 active:scale-95 transition-all shrink-0"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-8">
        <PageHeader
          title="Fee Management"
          subtitle={`Monitor and pay fees for ${selectedStudent.name}`}
          icon={CreditCard}
          iconColor="gradient-violet"
          actions={
            outstandingAmount > 0 ? (
              <div className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm">
                <AlertCircle className="w-4 h-4" />
                ₹{(outstandingAmount || 0).toLocaleString()} Outstanding
              </div>
            ) : undefined
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Fee Summary */}
          <div className="lg:col-span-2 space-y-6">
            {currentRequest ? (
              <Card padding="none">
                <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-violet-600" />
                    Current Fee Request
                  </h3>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {currentRequest.month}
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {currentRequest.heads.map((head, i) => (
                    <div key={i} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                          <IndianRupee className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900">{head.name}</h4>
                          <p className="text-xs text-slate-500">
                            Base: ₹{head.amount} | Discount: ₹{head.discount}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-900">₹{(head.finalAmount || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                  <div className="p-6 bg-slate-50 flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="font-bold text-slate-900 block">Net Payable Amount</span>
                      <div className="flex flex-wrap gap-2">
                        {currentFineForRequest > 0 && (
                          <Badge variant="error" className="text-[10px] flex items-center gap-1">
                            <Scale className="w-2.5 h-2.5" />
                            Late Fine: ₹{currentFineForRequest.toLocaleString()}
                          </Badge>
                        )}
                        {currentRequest.waivedAmount > 0 && (
                          <Badge variant="success" className="text-[10px] flex items-center gap-1">
                            <ShieldOff className="w-2.5 h-2.5" />
                            Waived: ₹{currentRequest.waivedAmount.toLocaleString()}
                          </Badge>
                        )}
                        {currentRequest.paidAmount > 0 && (
                          <span className="text-xs text-emerald-600 font-bold">Already Paid: ₹{currentRequest.paidAmount.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-violet-600">
                        ₹{(currentRequest.totalAmount + currentFineForRequest - (currentRequest.waivedAmount || 0) - (currentRequest.paidAmount || 0)).toLocaleString()}
                      </span>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Remaining Balance</p>
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="flex flex-col items-center py-8">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">All Dues Cleared!</h3>
                  <p className="text-slate-500 mt-1">No pending fee requests for {selectedStudent.name}.</p>
                </div>
              </Card>
            )}

            {/* Advance Payments — desktop */}
            <Card padding="none">
              <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-violet-600" />
                  Advance Payments
                </h3>
                <span className="text-xs font-bold text-violet-600">{advancePayments.length} record(s)</span>
              </div>
              <div className="p-6">
                {advancePayments.length === 0 ? (
                  <div>
                    <p className="text-sm text-slate-500 mb-4">No advance payments made yet.</p>
                    {availableHeads.length > 0 && (
                      <>
                        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Fee Heads Available for Advance Payment</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {availableHeads.map(h => (
                            <div key={h.name} className="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-lg border border-slate-100">
                              <span className="text-sm text-slate-700 font-medium">{h.name}</span>
                              <span className="text-sm font-bold text-emerald-600">₹{h.amount.toLocaleString('en-IN')}<span className="text-[10px] text-slate-400 font-medium ml-1">/month</span></span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                          <Button variant="primary" icon={CreditCard} onClick={openAdvanceModal}>
                            Pay in Advance Online
                          </Button>
                          <p className="text-xs text-slate-400">or contact the accounts office to pay by cash.</p>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {advancePayments.map(adv => {
                      const monthsCovered = (adv.monthlyBreakdown || []).length;
                      const monthsConsumed = (adv.monthlyBreakdown || []).filter(e => e.consumed).length;
                      return (
                        <div key={adv.id} className="p-4 rounded-xl border border-violet-100 bg-violet-50/30">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-slate-900">Receipt {adv.receiptNumber}</p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {fmtDate(adv.date)} · {adv.paymentMethod.replace('_', ' ')}
                                {adv.voucherNumber && ` · Voucher ${adv.voucherNumber}`}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {(adv.monthlyBreakdown || []).map(e => (
                                  <span
                                    key={e.month}
                                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                                      e.consumed
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-violet-100 text-violet-700'
                                    }`}
                                    title={e.consumed ? `Applied to fee request on ${fmtDate(e.consumedAt || '')}` : 'Not yet applied'}
                                  >
                                    <CalendarDays className="w-3 h-3 inline mr-1 -mt-0.5" />
                                    {e.month}{e.consumed && ' ✓'}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xl font-black text-violet-700">₹{adv.totalAmount.toLocaleString('en-IN')}</p>
                              <p className="text-[10px] text-slate-400 mt-1">{monthsConsumed}/{monthsCovered} consumed</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {availableHeads.length > 0 && (
                      <Button variant="secondary" icon={CreditCard} onClick={openAdvanceModal}>
                        Pay More in Advance
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Payment History */}
            <Card padding="none">
              <div className="p-6 border-b bg-slate-50/50">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-violet-600" />
                  Payment History
                </h3>
              </div>
              {payments.length > 0 ? (
                <Table>
                  <Thead>
                    <tr>
                      <Th>Receipt No.</Th>
                      <Th>Date</Th>
                      <Th>Amount</Th>
                      <Th>Method</Th>
                      <Th>Trans. ID</Th>
                      <Th className="text-right">Receipt</Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {payments.map((tx) => (
                      <Tr key={tx.id}>
                        <Td className="font-bold text-slate-900">{tx.receiptNumber}</Td>
                        <Td>{fmtDate(tx.date)}</Td>
                        <Td className="font-bold text-emerald-600">₹{(tx.amount || 0).toLocaleString()}</Td>
                        <Td className="capitalize">{tx.method.replace('_', ' ')}</Td>
                        <Td>
                          <span className="text-[10px] font-mono text-slate-500 truncate block max-w-[100px]" title={tx.transactionId || tx.referenceNumber}>
                            {tx.transactionId || tx.referenceNumber || '-'}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <IconButton icon={Download} onClick={() => handleDownloadReceipt(tx)} variant="ghost" />
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              ) : (
                <EmptyState title="No payment history found." />
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-violet-600 to-purple-700 p-6 rounded-2xl text-white shadow-xl shadow-violet-600/20">
              <div className="flex items-center justify-between mb-8">
                <Wallet className="w-8 h-8 opacity-50" />
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Payment Portal</span>
              </div>
              <p className="text-sm opacity-80">Total Outstanding</p>
              <h2 className="text-4xl font-black mt-1">₹{(outstandingAmount || 0).toLocaleString()}</h2>
              <div className="mt-8 pt-6 border-t border-white/10">
                {currentRequest ? (
                  <>
                    <p className="text-xs opacity-70 leading-relaxed mb-6">
                      Fee for {currentRequest.month} is due by {new Date(currentRequest.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}.
                    </p>
                    <button
                      onClick={() => handlePayNow(currentRequest)}
                      className="w-full py-3 bg-white text-violet-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      Pay Now
                    </button>
                  </>
                ) : (
                  <p className="text-xs opacity-70 leading-relaxed">
                    All dues are cleared for {selectedStudent.name}.
                  </p>
                )}
              </div>
            </div>

            <Card>
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                Important Note
              </h3>
              <ul className="space-y-4 text-xs text-slate-600">
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-600 mt-1.5"></div>
                  Fees must be paid by the due date to avoid automated late charges.
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-600 mt-1.5"></div>
                  Late penalties are applied dynamically based on the current school fine policy.
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-600 mt-1.5"></div>
                  Keep your receipts safe for future reference.
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </div>

      {/* Pay in Advance Online Modal */}
      <Modal
        isOpen={isAdvanceModalOpen}
        onClose={() => !advanceProcessing && setIsAdvanceModalOpen(false)}
        title="Pay Fee in Advance"
        subtitle={`For ${selectedStudent.name} · Online payment via Razorpay`}
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="text-xs text-slate-500">
              <span className="font-bold text-slate-700">
                {advanceSelectedMonths.length} month(s) × ₹{calcAdvanceTotal().perMonth.toLocaleString('en-IN')}
              </span>
              <span className="mx-1.5">=</span>
              <span className="text-base font-black text-violet-700">
                ₹{calcAdvanceTotal().total.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setIsAdvanceModalOpen(false)} disabled={advanceProcessing}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={CreditCard}
                loading={advanceProcessing}
                onClick={handlePayAdvanceOnline}
              >
                Pay ₹{calcAdvanceTotal().total.toLocaleString('en-IN')}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <Alert variant="info">
            Pre-pay your child's fees for upcoming months. Once paid, the school will not generate a fee request for the covered heads in those months — and no late penalty applies.
          </Alert>

          {/* Month selector */}
          <FormField label="Pick the months you want to pre-pay" required>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mt-1">
              {getUpcomingMonths().map(m => {
                const alreadyCovered = monthsAlreadyCovered().has(m);
                const selected = advanceSelectedMonths.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={alreadyCovered}
                    onClick={() =>
                      setAdvanceSelectedMonths(prev =>
                        selected ? prev.filter(x => x !== m) : [...prev, m]
                      )
                    }
                    className={`px-2 py-2 rounded-lg text-[11px] font-bold border transition-all ${
                      alreadyCovered
                        ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
                        : selected
                        ? 'bg-violet-600 text-white border-violet-600 shadow-md'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-violet-400 hover:bg-violet-50'
                    }`}
                    title={alreadyCovered ? 'Already paid in advance' : ''}
                  >
                    <CalendarDays className="w-3 h-3 inline mb-0.5 mr-1" />
                    {m.split(' ')[0].slice(0, 3)} '{m.split(' ')[1]?.slice(-2)}
                  </button>
                );
              })}
            </div>
          </FormField>

          {/* Heads selector */}
          <FormField label="Pick the fee heads to include" required hint="Synced from the school's fee structure for your child's class">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
              {availableHeads.map(h => {
                const selected = advanceSelectedHeads.includes(h.name);
                return (
                  <button
                    key={h.name}
                    type="button"
                    onClick={() =>
                      setAdvanceSelectedHeads(prev =>
                        selected ? prev.filter(x => x !== h.name) : [...prev, h.name]
                      )
                    }
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all ${
                      selected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'
                    }`}
                  >
                    <span className="text-xs font-bold">{h.name}</span>
                    <span className={`text-xs font-bold ${selected ? 'text-white' : 'text-emerald-600'}`}>
                      ₹{h.amount.toLocaleString('en-IN')}/mo
                    </span>
                  </button>
                );
              })}
            </div>
            {availableHeads.length === 0 && (
              <p className="text-xs text-rose-600 mt-2">
                No fee structure is set for your child's class. Please contact the school office.
              </p>
            )}
          </FormField>
        </div>
      </Modal>
    </>
  );
}
