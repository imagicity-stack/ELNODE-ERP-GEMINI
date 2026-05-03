import { UserProfile, FeeRequest, FeePayment, PaymentMethod, Student } from '../../types';
import { CreditCard, IndianRupee, Receipt, AlertCircle, CheckCircle2, Clock, Wallet, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, orderBy, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { generateFeeReceipt } from '../../lib/receiptGenerator';
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
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!user.uid) return;
    setLoading(true);
    try {
      const studentId = user.role === 'student' ? user.uid : user.studentId;
      if (!studentId) return;

      const [requestsSnap, paymentsSnap, studentSnap] = await Promise.all([
        getDocs(query(collection(db, 'feeRequests'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'feePayments'), where('studentId', '==', studentId), orderBy('date', 'desc'))),
        getDoc(doc(db, 'students', studentId))
      ]);

      setFeeRequests(requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeRequest)));
      setPayments(paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeePayment)));
      if (studentSnap.exists()) {
        setStudent({ id: studentSnap.id, ...studentSnap.data() } as Student);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'feeRequests');
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

  const handlePayNow = (request: FeeRequest) => {
    const options = {
      key: (import.meta as any).env.VITE_RAZORPAY_KEY_ID || '',
      amount: (request.totalAmount || 0) * 100, // in paise
      currency: 'INR',
      name: 'School Management System',
      description: `Fees for ${request.month}`,
      handler: async function (response: any) {
        try {
          const payment: Omit<FeePayment, 'id'> = {
            studentId: request.studentId,
            feeRequestId: request.id,
            amount: request.totalAmount,
            date: new Date().toISOString().split('T')[0],
            method: 'online',
            transactionId: response.razorpay_payment_id,
            receiptNumber: `REC-${Date.now()}`,
            remarks: `Online Payment - ${request.month}`,
          };

          await addDoc(collection(db, 'feePayments'), payment);
          await updateDoc(doc(db, 'feeRequests', request.id), { status: 'paid' });
          await updateDoc(doc(db, 'students', request.studentId), { feeStatus: 'paid' });

          alert('Payment Successful! Transaction ID: ' + response.razorpay_payment_id);
          fetchData();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'feePayments');
        }
      },
      prefill: {
        name: user.name,
        email: user.email,
      },
      theme: {
        color: '#2563eb',
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const outstandingAmount = feeRequests
    .filter(r => r.status !== 'paid')
    .reduce((sum, r) => sum + r.totalAmount, 0);

  const currentRequest = feeRequests.find(r => r.status !== 'paid');

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
                <div className="p-6 bg-slate-50 flex items-center justify-between">
                  <span className="font-bold text-slate-900">Total Amount Due</span>
                  <span className="text-2xl font-black text-emerald-600">₹{(currentRequest.totalAmount || 0).toLocaleString()}</span>
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
                Fees must be paid by the 10th of each month to avoid late charges.
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0"></div>
                Late fee of ₹500 per week applies after the due date.
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
