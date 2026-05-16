import { UserProfile, FeeRequest, FeePayment, PaymentMethod, Student, FineConfig } from '../../types';
import { CreditCard, IndianRupee, Receipt, AlertCircle, CheckCircle2, Clock, Wallet, Download, Scale, ShieldOff, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, orderBy, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { calculateFine, getEffectiveTotal } from '../../services/fineService';
import { generateFeeReceipt } from '../../lib/receiptGenerator';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  IconButton,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
  Alert,
  Spinner,
} from '../../components/ui';

interface StudentFeesProps {
  user: UserProfile;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function StudentFees({ user }: StudentFeesProps) {
  const [feeRequests, setFeeRequests] = useState<FeeRequest[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [fineConfig, setFineConfig] = useState<FineConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const fetchData = async () => {
    if (!user.uid) return;
    setLoading(true);
    try {
      const studentId = user.studentId || user.schoolNumber;
      if (!studentId) {
        console.warn('Student ID not found in profile');
        setLoading(false);
        return;
      }

      const requestsQuery = query(collection(db, 'feeRequests'), where('studentId', '==', studentId));
      const paymentsQuery = query(collection(db, 'feePayments'), where('studentId', '==', studentId), orderBy('date', 'desc'));
      const studentDocRef = doc(db, 'students', studentId);
      const fineConfigRef = doc(db, 'fine-config', 'global');

      const [requestsSnap, paymentsSnap, studentSnap, fineSnap] = await Promise.all([
        getDocs(requestsQuery).catch(err => { handleFirestoreError(err, OperationType.LIST, 'feeRequests'); throw err; }),
        getDocs(paymentsQuery).catch(err => { handleFirestoreError(err, OperationType.LIST, 'feePayments'); throw err; }),
        getDoc(studentDocRef).catch(err => { handleFirestoreError(err, OperationType.GET, 'students'); throw err; }),
        getDoc(fineConfigRef).catch(err => { handleFirestoreError(err, OperationType.GET, 'fine-config'); throw err; })
      ]);

      setFeeRequests(requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeRequest)));
      setPayments(paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeePayment)));
      if (studentSnap.exists()) {
        setStudent({ id: studentSnap.id, ...studentSnap.data() } as Student);
      }
      if (fineSnap.exists()) {
        setFineConfig(fineSnap.data() as FineConfig);
      }
    } catch (err) {
      console.error('Error fetching student fee data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user.uid]);

  const handleDownloadReceipt = (payment: FeePayment) => {
    const request = feeRequests.find(r => r.id === payment.feeRequestId);
    if (request && student) {
      generateFeeReceipt(payment, request, student);
    } else {
      showToast('Could not find fee request details for this payment.', 'error');
    }
  };

  const handlePayNow = async (request: FeeRequest) => {
    const currentFine = fineConfig ? calculateFine(request, fineConfig) : 0;
    const remainingAmount = request.totalAmount + currentFine - (request.waivedAmount || 0) - (request.paidAmount || 0);
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
      description: `Fees for ${request.month}`,
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
              classId: student?.classId || '',
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
          logActivity(user, 'Paid Fees Online', 'Students', `Paid ₹${remainingAmount.toLocaleString()} for ${request.heads[0]?.name || 'Academic Fee'} via Razorpay`);
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

  const outstandingAmount = feeRequests
    .filter(r => r.status !== 'paid')
    .reduce((sum, r) => sum + (r.totalAmount + (fineConfig ? calculateFine(r, fineConfig) : 0) - (r.waivedAmount || 0) - (r.paidAmount || 0)), 0);

  const currentRequest = feeRequests.find(r => r.status !== 'paid');
  const currentFineAmount = currentRequest && fineConfig ? calculateFine(currentRequest, fineConfig) : 0;

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        {/* Gradient Header */}
        <div className={`${outstandingAmount > 0 ? 'bg-gradient-to-br from-rose-600 to-red-700' : 'bg-gradient-to-br from-emerald-600 to-teal-700'} px-4 pt-5 pb-6 text-white`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Student Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Fee Details</h1>
          <div className="mt-3">
            {outstandingAmount > 0 ? (
              <>
                <p className="text-sm text-white/70">Total Outstanding</p>
                <p className="text-3xl font-black mt-0.5">₹{outstandingAmount.toLocaleString('en-IN')}</p>
              </>
            ) : (
              <div className="flex items-center gap-2 mt-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                <p className="text-base font-bold text-emerald-100">All dues cleared!</p>
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
                      <Receipt className="w-4 h-4 text-emerald-600" />
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
                      {currentFineAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-rose-500 font-medium flex items-center gap-1"><Scale className="w-3.5 h-3.5" /> Late Fine</span>
                          <span className="font-bold text-rose-600">+ ₹{currentFineAmount.toLocaleString()}</span>
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
                          ₹{(currentRequest.totalAmount + currentFineAmount - (currentRequest.waivedAmount || 0) - (currentRequest.paidAmount || 0)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <button
                      onClick={() => handlePayNow(currentRequest)}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-bold active:scale-95 transition-transform shadow-lg flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      Pay Now — ₹{(currentRequest.totalAmount + currentFineAmount - (currentRequest.waivedAmount || 0) - (currentRequest.paidAmount || 0)).toLocaleString()}
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
                    <p className="text-xs text-emerald-700 mt-0.5">No pending fee requests at this time.</p>
                  </div>
                </div>
              )}

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
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                          <Receipt className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900">₹{(tx.amount || 0).toLocaleString()}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{tx.receiptNumber} · {fmtDate(tx.date)}</p>
                          <p className="text-xs text-slate-400 capitalize">{tx.method.replace('_', ' ')}</p>
                        </div>
                        <button
                          onClick={() => handleDownloadReceipt(tx)}
                          className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-emerald-600 active:scale-95 transition-all shrink-0"
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
          title="Fee Details"
          subtitle="View your fee structure and payment history."
          icon={CreditCard}
          iconColor="gradient-emerald"
          actions={
            outstandingAmount > 0 ? (
              <Badge variant="error" dot>
                ₹{(outstandingAmount || 0).toLocaleString()} Outstanding
              </Badge>
            ) : undefined
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Fee Summary */}
          <div className="lg:col-span-2 space-y-6">
            {currentRequest ? (
              <Card padding="none">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-emerald-600" />
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
                        <div className="w-10 h-10 rounded-xl gradient-emerald flex items-center justify-center text-white">
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
                  <div className="p-6 bg-slate-50 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-sm">Base Request Amount</span>
                      <span className="font-bold text-slate-900">₹{(currentRequest.totalAmount || 0).toLocaleString()}</span>
                    </div>
                    {currentFineAmount > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-rose-500 text-sm font-medium">
                          <Scale className="w-3.5 h-3.5" />
                          <span>Late Penalty Fine</span>
                        </div>
                        <span className="font-bold text-rose-600">+ ₹{currentFineAmount.toLocaleString()}</span>
                      </div>
                    )}
                    {(currentRequest.waivedAmount || 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-emerald-600 text-sm font-medium">
                          <ShieldOff className="w-3.5 h-3.5" />
                          <span>Waiver Applied</span>
                        </div>
                        <span className="font-bold text-emerald-600">- ₹{(currentRequest.waivedAmount || 0).toLocaleString()}</span>
                      </div>
                    )}
                    {(currentRequest.paidAmount || 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-sm">Previously Paid</span>
                        <span className="font-bold text-slate-600">- ₹{(currentRequest.paidAmount || 0).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <span className="font-bold text-slate-900 text-lg">Net Balance Due</span>
                      <span className="text-2xl font-black text-emerald-600">
                        ₹{(currentRequest.totalAmount + currentFineAmount - (currentRequest.waivedAmount || 0) - (currentRequest.paidAmount || 0)).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <EmptyState
                  icon={CheckCircle2}
                  title="All Dues Cleared!"
                  description="You don't have any pending fee requests at the moment."
                />
              </Card>
            )}

            {/* Payment History */}
            <Card padding="none">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-600" />
                  Payment History
                </h3>
              </div>
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
                      <Td><span className="font-bold text-slate-900">{tx.receiptNumber}</span></Td>
                      <Td>{fmtDate(tx.date)}</Td>
                      <Td><span className="font-bold text-emerald-600">₹{(tx.amount || 0).toLocaleString()}</span></Td>
                      <Td className="capitalize">{tx.method.replace('_', ' ')}</Td>
                      <Td>
                        <span className="text-[10px] font-mono text-slate-500 truncate block max-w-[100px]" title={tx.transactionId || tx.referenceNumber}>
                          {tx.transactionId || tx.referenceNumber || '-'}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <IconButton icon={Download} onClick={() => handleDownloadReceipt(tx)} variant="ghost" size="sm" />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {payments.length === 0 && (
                <EmptyState icon={Receipt} title="No payment history" description="Your payment records will appear here." />
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-6 rounded-2xl text-white shadow-xl shadow-emerald-600/20">
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
                      Your fee for {currentRequest.month} is due by {new Date(currentRequest.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}.
                    </p>
                    <button
                      onClick={() => handlePayNow(currentRequest)}
                      className="w-full py-3 bg-white text-emerald-600 rounded-xl text-sm font-bold hover:bg-emerald-50 transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      Pay Now
                    </button>
                  </>
                ) : (
                  <p className="text-xs opacity-70 leading-relaxed">
                    Great job! You have no outstanding dues.
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
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0"></div>
                  Fees must be paid by the due date to avoid automated late charges.
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0"></div>
                  Late penalties are applied dynamically based on the current school fine policy.
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0"></div>
                  Keep your receipts safe for future reference.
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
