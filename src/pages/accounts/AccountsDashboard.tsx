import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Wallet,
  Receipt,
} from 'lucide-react';
import { UserProfile, Expense, FeePayment, Fee, Student, FeeRequest } from '../../types';
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
import {
  PageHeader,
  Card,
  Badge,
  Button,
  StatCard,
  SearchInput,
  Avatar,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
  Spinner,
} from '../../components/ui';

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
    return <Spinner />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Financial Overview"
        subtitle={`Welcome back, ${user.name}. Here's the school's financial status.`}
        icon={Wallet}
        iconColor="gradient-amber"
        actions={
          <Button variant="secondary" icon={Download}>
            Export Report
          </Button>
        }
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Collection" value={`₹${(totalCollection || 0).toLocaleString()}`} icon={Wallet} gradient="gradient-amber" change="+12%" changePositive={true} index={0} />
        <StatCard label="Pending Fees" value={`₹${(totalPending || 0).toLocaleString()}`} icon={CreditCard} gradient="gradient-amber" change="-5%" changePositive={false} index={1} />
        <StatCard label="Monthly Expenses" value={`₹${(monthlyExpenses || 0).toLocaleString()}`} icon={Receipt} gradient="gradient-amber" change="+2%" changePositive={true} index={2} />
        <StatCard label="Net Profit" value={`₹${(netProfit || 0).toLocaleString()}`} icon={TrendingUp} gradient="gradient-amber" change="+8%" changePositive={true} index={3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Collection vs Expense Chart */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              Cash Flow Analysis (Last 7 Days)
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span className="text-xs text-slate-500">Collection</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-xs text-slate-500">Expense</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last7Days}>
                <defs>
                  <linearGradient id="colorColl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="collection" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorColl)" />
                <Area type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-amber-600" />
            Recent Activity
          </h3>
          <div className="space-y-6">
            {payments.slice(0, 5).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Fee Payment</p>
                    <p className="text-[10px] text-slate-400">{new Date(tx.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-emerald-600">
                  +₹{(tx.amount || 0).toLocaleString()}
                </span>
              </div>
            ))}
            {expenses.slice(0, 5).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                    <ArrowDownRight className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{tx.biller}</p>
                    <p className="text-[10px] text-slate-400">{new Date(tx.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-red-600">
                  -₹{(tx.amount || 0).toLocaleString()}
                </span>
              </div>
            ))}
            {payments.length === 0 && expenses.length === 0 && (
              <EmptyState title="No recent activity" />
            )}
          </div>
          <button className="w-full mt-8 py-2 text-sm font-bold text-amber-600 hover:bg-amber-50 rounded-lg transition-all">
            View All Transactions
          </button>
        </Card>
      </div>

      {/* Student Fee Status List */}
      <Card padding="none">
        <div className="p-6 border-b bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-600" />
            Student Fee Status
          </h3>
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search students..."
            className="max-w-md"
          />
        </div>
        {filteredStudents.length > 0 ? (
          <Table>
            <Thead>
              <tr>
                <Th>Student</Th>
                <Th>School No.</Th>
                <Th>Class</Th>
                <Th>Status</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </Thead>
            <Tbody>
              {filteredStudents.slice(0, 10).map((student) => (
                <Tr key={student.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={student.name} size="sm" />
                      <span className="font-bold text-slate-900">{student.name}</span>
                    </div>
                  </Td>
                  <Td>{student.schoolNumber}</Td>
                  <Td>{student.classId} - {student.section}</Td>
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
                    <button
                      onClick={() => navigate(`/accounts/fee-collection?search=${student.schoolNumber}`)}
                      className="text-xs font-bold text-amber-600 hover:underline"
                    >
                      Manage Fees
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        ) : (
          <EmptyState icon={Users} title="No students found" />
        )}
        {filteredStudents.length > 10 && (
          <div className="p-4 border-t bg-slate-50/30 text-center">
            <button
              onClick={() => navigate('/accounts/fee-collection')}
              className="text-sm font-bold text-amber-600 hover:underline"
            >
              View All Students in Fee Collection
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
