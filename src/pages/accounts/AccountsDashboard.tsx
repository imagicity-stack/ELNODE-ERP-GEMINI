import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownRight,
  Calendar,
  Search,
  Filter,
  Download,
  Wallet,
  Receipt,
  PieChart,
  Plus,
  User
} from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile, Expense, FeePayment, Fee, Student, FeeRequest } from '../../types';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

interface AccountsDashboardProps {
  user: UserProfile;
}

export default function AccountsDashboard({ user }: AccountsDashboardProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [feeRequests, setFeeRequests] = useState<FeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [expSnap, paySnap, feeSnap, studentSnap, requestSnap] = await Promise.all([
          getDocs(collection(db, 'expenses')),
          getDocs(query(collection(db, 'feePayments'), orderBy('date', 'desc'), limit(10))),
          getDocs(collection(db, 'fees')),
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'feeRequests'))
        ]);

        setExpenses(expSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
        setPayments(paySnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeePayment)));
        setFees(feeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Fee)));
        setStudents(studentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
        setFeeRequests(requestSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeRequest)));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'accounts_dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.schoolNumber.includes(searchTerm)
  );

  const totalCollection = fees.reduce((sum, f) => {
    const studentPayments = payments.filter(p => p.studentId === f.studentId);
    return sum + studentPayments.reduce((s, p) => s + p.amount, 0);
  }, 0);

  const totalPending = fees.filter(f => f.status !== 'paid').reduce((sum, f) => {
    const totalDue = f.structure.reduce((s, h) => s + h.amount, 0);
    const paid = payments.filter(p => p.studentId === f.studentId).reduce((s, p) => s + p.amount, 0);
    return sum + (totalDue - paid);
  }, 0);

  const monthlyExpenses = expenses
    .filter(e => e.date.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((sum, e) => sum + e.amount, 0);

  const netProfit = totalCollection - expenses.reduce((sum, e) => sum + e.amount, 0);

  // Prepare chart data (last 7 days)
  const last7Days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    
    const dayCollection = payments
      .filter(p => p.date === dateStr)
      .reduce((sum, p) => sum + p.amount, 0);
    
    const dayExpense = expenses
      .filter(e => e.date === dateStr)
      .reduce((sum, e) => sum + e.amount, 0);

    return { name: dayName, collection: dayCollection, expense: dayExpense };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Overview</h1>
          <p className="text-gray-500">Welcome back, {user.name}. Here's the school's financial status.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-all">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Collection', value: `$${(totalCollection || 0).toLocaleString()}`, trend: '+12%', isUp: true, icon: Wallet, color: 'blue' },
          { label: 'Pending Fees', value: `$${(totalPending || 0).toLocaleString()}`, trend: '-5%', isUp: false, icon: CreditCard, color: 'amber' },
          { label: 'Monthly Expenses', value: `$${(monthlyExpenses || 0).toLocaleString()}`, trend: '+2%', isUp: true, icon: Receipt, color: 'red' },
          { label: 'Net Profit', value: `$${(netProfit || 0).toLocaleString()}`, trend: '+8%', isUp: true, icon: TrendingUp, color: 'emerald' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                stat.color === 'blue' && "bg-blue-50 text-blue-600",
                stat.color === 'amber' && "bg-amber-50 text-amber-600",
                stat.color === 'red' && "bg-red-50 text-red-600",
                stat.color === 'emerald' && "bg-emerald-50 text-emerald-600",
              )}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div className={cn(
                "flex items-center gap-1 text-xs font-bold",
                stat.isUp ? "text-emerald-600" : "text-red-600"
              )}>
                {stat.isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {stat.trend}
              </div>
            </div>
            <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</h3>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Collection vs Expense Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Cash Flow Analysis (Last 7 Days)
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                <span className="text-xs text-gray-500">Collection</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-xs text-gray-500">Expense</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last7Days}>
                <defs>
                  <linearGradient id="colorColl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="collection" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorColl)" />
                <Area type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-600" />
            Recent Activity
          </h3>
          <div className="space-y-6">
            {payments.slice(0, 5).map((tx, i) => (
              <div key={tx.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Fee Payment</p>
                    <p className="text-[10px] text-gray-400">{new Date(tx.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-emerald-600">
                  +${(tx.amount || 0).toLocaleString()}
                </span>
              </div>
            ))}
            {expenses.slice(0, 5).map((tx, i) => (
              <div key={tx.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                    <ArrowDownRight className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{tx.biller}</p>
                    <p className="text-[10px] text-gray-400">{new Date(tx.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-red-600">
                  -${(tx.amount || 0).toLocaleString()}
                </span>
              </div>
            ))}
            {payments.length === 0 && expenses.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-8">No recent activity</p>
            )}
          </div>
          <button className="w-full mt-8 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
            View All Transactions
          </button>
        </div>
      </div>

      {/* Student Fee Status List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Student Fee Status
          </h3>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search students..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">School No.</th>
                <th className="px-6 py-4">Class</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredStudents.slice(0, 10).map((student) => (
                <tr key={student.id} className="hover:bg-gray-50 transition-all">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                        {student.name.charAt(0)}
                      </div>
                      <span className="text-sm font-bold text-gray-900">{student.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{student.schoolNumber}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{student.classId} - {student.section}</td>
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
                    <button 
                      onClick={() => navigate(`/accounts/fee-collection?search=${student.schoolNumber}`)}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      Manage Fees
                    </button>
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredStudents.length > 10 && (
          <div className="p-4 border-t bg-gray-50/30 text-center">
            <button 
              onClick={() => navigate('/accounts/fee-collection')}
              className="text-sm font-bold text-blue-600 hover:underline"
            >
              View All Students in Fee Collection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
