import { UserProfile, Student, FeeRequest, FeePayment, FineConfig } from '../../types';
import { CreditCard, IndianRupee, Receipt, AlertCircle, CheckCircle2, Clock, Download, Wallet, Scale, ShieldOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, orderBy, getDoc } from 'firebase/firestore';
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
  Alert,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
  StatCard,
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
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const fetchData = async () => {
    if (!selectedStudent?.id) return;
    setLoading(true);
    try {
      const requestsQuery = query(collection(db, 'feeRequests'), where('studentId', '==', selectedStudent.id));
      const paymentsQuery = query(collection(db, 'feePayments'), where('studentId', '==', selectedStudent.id), orderBy('date', 'desc'));

      const [requestsSnap, paymentsSnap, fineSnap] = await Promise.all([
        getDocs(requestsQuery).catch(err => { handleFirestoreError(err, OperationType.LIST, 'feeRequests'); throw err; }),
        getDocs(paymentsQuery).catch(err => { handleFirestoreError(err, OperationType.LIST, 'feePayments'); throw err; }),
        getDoc(doc(db, 'fine-config', 'global'))
      ]);

      setFeeRequests(requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeRequest)));
      setPayments(paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeePayment)));
      if (fineSnap.exists()) {
        setFineConfig(fineSnap.data() as FineConfig);
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
      alert('Could not find fee request details for this payment.');
    }
  };

  const handlePayNow = (request: FeeRequest) => {
    if (!window.Razorpay) {
      alert('Payment gateway is loading. Please try again in a few seconds.');
      return;
    }

    const currentFine = fineConfig ? calculateFine(request, fineConfig) : 0;
    const remainingAmount = request.totalAmount + currentFine - (request.waivedAmount || 0) - (request.paidAmount || 0);
    if (remainingAmount <= 0) {
      alert('This fee request is already fully paid.');
      return;
    }

    const amountInPaise = Math.round(remainingAmount * 100);
    
    if (amountInPaise < 100) {
      alert('Minimum payment amount is ₹1.');
      return;
    }

    const options = {
      key: (import.meta as any).env.VITE_RAZORPAY_KEY_ID || '',
      amount: amountInPaise, 
      currency: 'INR',
      name: 'School Fee Payment',
      description: `Fees for ${request.month} - ${selectedStudent?.name}`,
      theme: {
        color: '#EF4444',
      },
      handler: async function (response: any) {
        try {
          const currentFine = fineConfig ? calculateFine(request, fineConfig) : 0;
          const payment: Omit<FeePayment, 'id'> = {
            studentId: request.studentId,
            classId: selectedStudent?.classId || '',
            feeRequestId: request.id,
            feeHead: request.heads[0]?.name || 'Academic Fee',
            amount: remainingAmount,
            date: new Date().toISOString().split('T')[0],
            method: 'online',
            transactionId: response.razorpay_payment_id,
            receiptNumber: `REC-${Date.now()}`,
            remarks: `Online Payment - ${request.month}`,
          };

          await addDoc(collection(db, 'feePayments'), payment);
          
          const newPaidAmount = (request.paidAmount || 0) + remainingAmount;
          const totalRequired = request.totalAmount + currentFine - (request.waivedAmount || 0);
          const newStatus = newPaidAmount >= totalRequired ? 'paid' : 'partially_paid';
          const now = new Date().toISOString();

          await updateDoc(doc(db, 'feeRequests', request.id), { 
            paidAmount: newPaidAmount,
            fineAmount: currentFine, // Snapshot the fine
            status: newStatus,
            updatedAt: now
          });

          if (newStatus === 'paid') {
            await updateDoc(doc(db, 'students', request.studentId), { 
              feeStatus: 'paid',
              updatedAt: now
            });
          }

          logActivity(
            user, 
            'Paid Fees Online', 
            'Parents', 
            `Paid ₹${remainingAmount.toLocaleString()} for ${payment.feeHead} via Razorpay`,
            { studentId: request.studentId, amount: remainingAmount }
          );
          showToast('Payment Successful! Transaction ID: ' + response.razorpay_payment_id, 'success');
          fetchData();
        } catch (err) {
          console.error('Payment process error:', err);
          showToast('Error recording payment, but transaction was successful. Please contact support.', 'error');
        }
      },
      prefill: {
        name: user.name,
        email: user.email,
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  if (!selectedStudent) return null;

  const outstandingAmount = feeRequests
    .filter(r => r.status !== 'paid')
    .reduce((sum, r) => sum + (r.totalAmount + (fineConfig ? calculateFine(r, fineConfig) : 0) - (r.waivedAmount || 0) - (r.paidAmount || 0)), 0);

  const currentRequest = feeRequests.find(r => r.status !== 'paid' && r.status !== 'overdue') || feeRequests.find(r => r.status === 'overdue');

  const currentFineForRequest = currentRequest && fineConfig ? calculateFine(currentRequest, fineConfig) : 0;

  return (
    <div className="space-y-8">
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
                      <Td>{tx.date}</Td>
                      <Td className="font-bold text-emerald-600">₹{(tx.amount || 0).toLocaleString()}</Td>
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
                        />
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

        {/* Sidebar: Payment Info */}
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
                    Fee for {currentRequest.month} is due by {new Date(currentRequest.dueDate).toLocaleDateString()}.
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
  );
}
