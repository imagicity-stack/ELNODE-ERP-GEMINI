import { UserProfile, FeeRequest, FeePayment, PaymentMethod, Student } from '../../types';
import { CreditCard, IndianRupee, Receipt, AlertCircle, CheckCircle2, Clock, Wallet, Download, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, orderBy, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { generateFeeReceipt } from '../../lib/receiptGenerator';

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fee Details</h1>
          <p className="text-gray-500 text-sm">View your fee structure and payment history.</p>
        </div>
        {outstandingAmount > 0 && (
          <div className="flex items-center gap-2">
            <div className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              ₹{(outstandingAmount || 0).toLocaleString()} Outstanding
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Fee Summary */}
        <div className="lg:col-span-2 space-y-6">
          {currentRequest ? (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b bg-gray-50/50 flex items-center justify-between">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-blue-600" />
                  Current Fee Request
                </h3>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  {currentRequest.month}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {currentRequest.heads.map((head, i) => (
                  <div key={i} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <IndianRupee className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{head.name}</h4>
                        <p className="text-xs text-gray-500">
                          Base: ₹{head.amount} | Discount: ₹{head.discount}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">₹{(head.finalAmount || 0).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                <div className="p-6 bg-gray-50 flex items-center justify-between">
                  <span className="font-bold text-gray-900">Total Amount Due</span>
                  <span className="text-2xl font-black text-blue-600">₹{(currentRequest.totalAmount || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">All Dues Cleared!</h3>
              <p className="text-gray-500 mt-1">You don't have any pending fee requests at the moment.</p>
            </div>
          )}

          {/* Payment History */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b bg-gray-50/50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Payment History
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                    <th className="px-6 py-4">Receipt No.</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Method</th>
                    <th className="px-6 py-4 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payments.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-all">
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{tx.receiptNumber}</td>
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
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        No payment history found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar: Payment Info */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl text-white shadow-xl shadow-blue-600/20">
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
                    className="w-full py-3 bg-white text-blue-600 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all shadow-lg flex items-center justify-center gap-2"
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

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Important Note
            </h3>
            <ul className="space-y-4 text-xs text-gray-600">
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5"></div>
                Fees must be paid by the 10th of each month to avoid late charges.
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5"></div>
                Late fee of ₹500 per week applies after the due date.
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5"></div>
                Keep your receipts safe for future reference.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
