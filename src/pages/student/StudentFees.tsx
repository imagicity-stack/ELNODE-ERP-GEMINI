import { UserProfile, FeeRequest, FeePayment, PaymentMethod, Student, FineConfig } from '../../types';
import { CreditCard, IndianRupee, Receipt, AlertCircle, CheckCircle2, Clock, Wallet, Download, Scale, ShieldOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, orderBy, getDoc } from 'firebase/firestore';
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
      alert('Could not find fee request details for this payment.');
    }
  };

  const handlePayNow = async (request: FeeRequest) => {
    const currentFine = fineConfig ? calculateFine(request, fineConfig) : 0;
    const netAmount = request.totalAmount + currentFine - (request.waivedAmount || 0);
    const amountInPaise = Math.round((netAmount - (request.paidAmount || 0)) * 100);
    
    if (amountInPaise < 100) {
      alert('Minimum payment amount is ₹1.');
      return;
    }

    const amountPaid = amountInPaise / 100;

    setLoading(true);
    try {
      const orderResponse = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountInPaise, currency: 'INR' })
      });
      
      const orderData = await orderResponse.json();
      
      if (!orderData.id) {
        throw new Error('Failed to create order');
      }

      const options = {
        key: (import.meta as any).env.VITE_RAZORPAY_KEY_ID || '',
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'School Fee Payment',
        description: `Fees for ${request.month}`,
        order_id: orderData.id,
        theme: {
          color: '#EF4444',
        },
        handler: async function (response: any) {
          try {
            const verifyResponse = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            const verifyData = await verifyResponse.json();

            if (!verifyData.success) {
              throw new Error('Payment verification failed');
            }

            const payment: Omit<FeePayment, 'id'> = {
              studentId: request.studentId,
              classId: student?.classId || '',
              feeRequestId: request.id,
              feeHead: request.heads[0]?.name || 'Academic Fee',
              amount: amountPaid,
              date: new Date().toISOString(),
              method: 'online',
              transactionId: response.razorpay_payment_id,
              receiptNumber: `REC-${Date.now()}`,
              remarks: `Online Payment - ${request.month}`,
            };

            await addDoc(collection(db, 'feePayments'), payment);
            
            const newPaidAmount = (request.paidAmount || 0) + amountPaid;
            const currentFine = fineConfig ? calculateFine(request, fineConfig) : 0;
            const totalRequired = request.totalAmount + currentFine - (request.waivedAmount || 0);
            const isFullyPaid = newPaidAmount >= totalRequired;

            await updateDoc(doc(db, 'feeRequests', request.id), { 
              status: isFullyPaid ? 'paid' : 'partially_paid',
              paidAmount: newPaidAmount,
              fineAmount: currentFine,
              updatedAt: new Date().toISOString()
            });
            
            if (isFullyPaid) {
              await updateDoc(doc(db, 'students', request.studentId), {
                feeStatus: 'paid'
              });
            }

            logActivity(user, 'Paid Fees Online', 'Students', `Paid ₹${amountPaid.toLocaleString()} for ${payment.feeHead} via Razorpay`);
            showToast('Payment Successful! Transaction ID: ' + response.razorpay_payment_id, 'success');
            fetchData();
          } catch (err) {
            console.error('Payment error:', err);
            showToast('Error recording payment. Please contact support.', 'error');
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error('Payment initiation error:', err);
      showToast('Error: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const outstandingAmount = feeRequests
    .filter(r => r.status !== 'paid')
    .reduce((sum, r) => sum + (r.totalAmount + (fineConfig ? calculateFine(r, fineConfig) : 0) - (r.waivedAmount || 0) - (r.paidAmount || 0)), 0);

  const currentRequest = feeRequests.find(r => r.status !== 'paid');
  const currentFineAmount = currentRequest && fineConfig ? calculateFine(currentRequest, fineConfig) : 0;

  return (
    <div className="space-y-8">
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
                    <Td>{tx.date}</Td>
                    <Td><span className="font-bold text-emerald-600">₹{(tx.amount || 0).toLocaleString()}</span></Td>
                    <Td className="capitalize">{tx.method.replace('_', ' ')}</Td>
                    <Td>
                      <span className="text-[10px] font-mono text-slate-500 truncate block max-w-[100px]" title={tx.transactionId || tx.referenceNumber}>
                        {tx.transactionId || tx.referenceNumber || '-'}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <IconButton
                        icon={Download}
                        onClick={() => handleDownloadReceipt(tx)}
                        variant="ghost"
                        size="sm"
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {payments.length === 0 && (
              <EmptyState
                icon={Receipt}
                title="No payment history"
                description="Your payment records will appear here."
              />
            )}
          </Card>
        </div>

        {/* Sidebar: Payment Info */}
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
                    Your fee for {currentRequest.month} is due by {new Date(currentRequest.dueDate).toLocaleDateString()}.
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
  );
}
