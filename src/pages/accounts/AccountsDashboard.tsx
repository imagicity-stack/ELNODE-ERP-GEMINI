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
  ChevronRight,
  IndianRupee,
  BarChart3,
  PieChart,
  Sparkles,
  Scale,
} from 'lucide-react';
import { UserProfile, Expense, FeePayment, Fee, Student, FeeRequest, Class } from '../../types';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { createPdf, addFooter, drawInfoBox, TABLE_STYLES } from '../../lib/pdfTemplate';
import { savePdf } from '../../lib/download';
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
import UpdatesSection from '../../components/UpdatesSection';
import AIInsightsPanel from '../../components/AIInsightsPanel';

interface AccountsDashboardProps {
  user: UserProfile;
}

export default function AccountsDashboard({ user }: AccountsDashboardProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [feeRequests, setFeeRequests] = useState<FeeRequest[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onErr = (err: any) => handleFirestoreError(err, OperationType.LIST, 'accounts_dashboard');
    const unsubs = [
      onSnapshot(collection(db, 'expenses'), (s) => setExpenses(s.docs.map(d => ({ id: d.id, ...d.data() } as Expense))), onErr),
      onSnapshot(query(collection(db, 'feePayments'), orderBy('date', 'desc'), limit(15)), (s) => setPayments(s.docs.map(d => ({ id: d.id, ...d.data() } as FeePayment))), onErr),
      onSnapshot(collection(db, 'feeRequests'), (s) => setFeeRequests(s.docs.map(d => ({ id: d.id, ...d.data() } as FeeRequest))), onErr),
      onSnapshot(collection(db, 'students'), (s) => { setStudents(s.docs.map(d => ({ id: d.id, ...d.data() } as Student))); setLoading(false); }, onErr),
      onSnapshot(collection(db, 'classes'), (s) => setClasses(s.docs.map(d => ({ id: d.id, ...d.data() } as Class))), onErr),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.schoolNumber.includes(searchTerm)
  );

  const totalCollection = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalPending = feeRequests
    .filter(r => r.status !== 'paid')
    .reduce((sum, r) => sum + (r.totalAmount - (r.paidAmount || 0)), 0);

  const monthlyExpenses = expenses
    .filter(e => e.date.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const netProfit = totalCollection - expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const getStudentFeeStatus = (studentId: string): 'paid' | 'overdue' | 'pending' | null => {
    const requests = feeRequests.filter(r => r.studentId === studentId);
    if (requests.length === 0) return null;
    const unpaid = requests.filter(r => r.status !== 'paid');
    if (unpaid.length === 0) return 'paid';
    const today = new Date().toISOString().split('T')[0];
    const hasOverdue = unpaid.some(r => r.dueDate && r.dueDate < today);
    return hasOverdue ? 'overdue' : 'pending';
  };

  const exportReport = async () => {
    const today = new Date().toLocaleDateString('en-IN');
    const { doc, contentY, pageWidth } = await createPdf(
      'Financial Overview Report',
      `Generated on ${today}`,
    );

    let y = contentY + 4;

    y = drawInfoBox(
      doc,
      [
        { label: 'Total Collection', value: `₹${totalCollection.toLocaleString('en-IN')}` },
        { label: 'Pending Fees', value: `₹${totalPending.toLocaleString('en-IN')}` },
        { label: 'Monthly Expenses', value: `₹${monthlyExpenses.toLocaleString('en-IN')}` },
        { label: 'Net Profit', value: `₹${netProfit.toLocaleString('en-IN')}` },
        { label: 'Total Students', value: students.length.toString() },
        { label: 'Total Payments', value: payments.length.toString() },
      ],
      y,
      pageWidth,
      2,
    );

    y += 6;

    // Recent payments table
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text('RECENT FEE PAYMENTS', 12, y);
    y += 3;

    const paymentRows = payments.slice(0, 20).map((p) => {
      const student = students.find((s) => s.id === p.studentId);
      return [
        p.receiptNumber || '-',
        p.date,
        student?.name || p.studentId,
        `₹${(p.amount || 0).toLocaleString('en-IN')}`,
        (p.method || '').replace('_', ' ').toUpperCase(),
      ];
    });

    (doc as any).autoTable({
      startY: y,
      head: [['Receipt No', 'Date', 'Student', 'Amount', 'Method']],
      body: paymentRows,
      ...TABLE_STYLES,
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: 12, right: 12 },
    });

    addFooter(doc);
    await savePdf(doc, `financial_overview_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

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

  const todayStr = new Date().toISOString().split('T')[0];
  const todayCollection = payments
    .filter(p => p.date === todayStr)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const todayCount = payments.filter(p => p.date === todayStr).length;

  const actionTiles = [
    { label: 'Fee Collection', icon: IndianRupee, path: '/accounts/fee-collection', gradient: 'from-emerald-500 to-teal-600' },
    { label: 'Payments', icon: Receipt, path: '/accounts/payment-history', gradient: 'from-teal-500 to-cyan-600' },
    { label: 'Expenses', icon: TrendingDown, path: '/accounts/expenses', gradient: 'from-rose-500 to-red-600' },
    { label: 'Salaries', icon: CreditCard, path: '/accounts/salaries', gradient: 'from-indigo-500 to-blue-600' },
    { label: 'Reports', icon: BarChart3, path: '/accounts/reports', gradient: 'from-violet-500 to-purple-600' },
    { label: 'Analytics', icon: PieChart, path: '/accounts/analytics', gradient: 'from-amber-500 to-orange-600' },
    { label: 'Reconciliation', icon: Scale, path: '/accounts/reconciliation', gradient: 'from-slate-500 to-slate-700' },
  ];

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-4 pt-5 pb-6 text-white rounded-b-3xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Accountant Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Hi, {(user.name || user.email || 'User').split(' ')[0]}</h1>
          <p className="text-[11px] text-emerald-100/80 mt-0.5">Here is today's financial snapshot</p>

          <div className="mt-4 bg-white/15 backdrop-blur rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Today's Collection</p>
            <p className="text-3xl font-black mt-1">₹{todayCollection.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-emerald-100/90 mt-1">{todayCount} payment{todayCount === 1 ? '' : 's'} recorded</p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((totalCollection/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Collected</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((totalPending/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Pending</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((netProfit/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Net</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Quick Actions</p>
          <div className="grid grid-cols-2 gap-3">
            {actionTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <button
                  key={tile.label}
                  onClick={() => navigate(tile.path)}
                  className={`bg-gradient-to-br ${tile.gradient} rounded-2xl p-4 text-white shadow-md active:scale-95 transition-transform min-h-[110px] flex flex-col justify-between text-left`}
                >
                  <Icon className="w-6 h-6" strokeWidth={2.2} />
                  <p className="text-sm font-bold mt-2">{tile.label}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recent Activity</p>
            <button
              onClick={() => navigate('/accounts/payment-history')}
              className="text-[11px] font-bold text-emerald-600 active:scale-95 transition-transform flex items-center gap-0.5"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
            {payments.length === 0 && expenses.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-500">No recent activity</p>
              </div>
            ) : (
              <>
                {payments.slice(0, 4).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">Fee Payment</p>
                        <p className="text-[10px] text-slate-400">{new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 shrink-0">+₹{(tx.amount || 0).toLocaleString()}</span>
                  </div>
                ))}
                {expenses.slice(0, 3).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                        <ArrowDownRight className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{tx.biller}</p>
                        <p className="text-[10px] text-slate-400">{new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-rose-600 shrink-0">-₹{(tx.amount || 0).toLocaleString()}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <button
          onClick={exportReport}
          className="fixed bottom-24 right-5 w-12 h-12 bg-white border border-slate-200 text-emerald-600 rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-transform z-40 md:hidden"
          aria-label="Export report"
        >
          <Download className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Financial Overview"
        subtitle={`Welcome back, ${user.name}. Here's the school's financial status.`}
        icon={Wallet}
        iconColor="gradient-amber"
        actions={
          <Button variant="secondary" icon={Download} onClick={exportReport}>
            Export Report
          </Button>
        }
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Collection" value={`₹${(totalCollection || 0).toLocaleString()}`} icon={Wallet} gradient="gradient-amber" index={0} />
        <StatCard label="Pending Fees" value={`₹${(totalPending || 0).toLocaleString()}`} icon={CreditCard} gradient="gradient-amber" index={1} />
        <StatCard label="Monthly Expenses" value={`₹${(monthlyExpenses || 0).toLocaleString()}`} icon={Receipt} gradient="gradient-amber" index={2} />
        <StatCard label="Net Profit" value={`₹${(netProfit || 0).toLocaleString()}`} icon={TrendingUp} gradient="gradient-amber" index={3} />
      </div>

      <UpdatesSection user={user} className="mb-8" />

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
                    <p className="text-[10px] text-slate-400">{new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
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
                    <p className="text-[10px] text-slate-400">{new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
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
                  <Td>{classes.find(c => c.id === student.classId)?.name || student.classId} - {student.section}</Td>
                  <Td>
                    {(() => {
                      const status = getStudentFeeStatus(student.id);
                      if (!status) return <span className="text-xs text-slate-400">No fees</span>;
                      return (
                        <Badge variant={status === 'paid' ? 'success' : status === 'overdue' ? 'error' : 'warning'}>
                          {status}
                        </Badge>
                      );
                    })()}
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

      <button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-5 right-5 md:bottom-8 md:right-8 z-30 flex items-center gap-2 bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white shadow-xl shadow-violet-500/30 rounded-full pl-3 pr-4 py-3 active:scale-95 transition-transform"
        aria-label="Open AI insights"
      >
        <Sparkles className="w-5 h-5" />
        <span className="text-xs font-bold hidden md:inline">Ask AI</span>
      </button>

      <AIInsightsPanel open={aiOpen} onClose={() => setAiOpen(false)} period="This Month" />
    </>
  );
}
