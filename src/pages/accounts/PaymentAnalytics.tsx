import { UserProfile, FeeRequest, FeePayment, Class } from '../../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, Users, CreditCard, Calendar, ArrowUpRight, 
  DollarSign, Activity, RefreshCcw, CheckCircle2 
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useData } from '../../contexts/DataContext';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  StatCard,
  Spinner,
  EmptyState,
  SectionTitle,
} from '../../components/ui';

interface PaymentAnalyticsProps {
  user: UserProfile;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function PaymentAnalytics({ user }: PaymentAnalyticsProps) {
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [requests, setRequests] = useState<FeeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const { classes } = useData();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [paymentsSnap, requestsSnap] = await Promise.all([
        getDocs(query(collection(db, 'feePayments'), orderBy('date', 'asc'))),
        getDocs(collection(db, 'feeRequests'))
      ]);

      setPayments(paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeePayment)));
      setRequests(requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeRequest)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Stats Calculations
  const stats = useMemo(() => {
    const totalCollected = payments.reduce((acc, p) => acc + p.amount, 0);
    const totalExpected = requests.reduce((acc, r) => acc + r.totalAmount, 0);
    const pendingAmount = Math.max(0, totalExpected - totalCollected);
    const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;
    
    // Last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const currentMonthCollection = payments
      .filter(p => new Date(p.date) >= thirtyDaysAgo)
      .reduce((acc, p) => acc + p.amount, 0);

    return {
      totalCollected,
      totalExpected,
      pendingAmount,
      collectionRate,
      currentMonthCollection
    };
  }, [payments, requests]);

  // Chart Data: Collection Trend
  const trendData = useMemo(() => {
    const months: Record<string, number> = {};
    payments.forEach(p => {
      const month = new Date(p.date).toLocaleString('default', { month: 'short' });
      months[month] = (months[month] || 0) + p.amount;
    });
    return Object.entries(months).map(([name, amount]) => ({ name, amount }));
  }, [payments]);

  // Chart Data: Payment Method
  const methodData = useMemo(() => {
    const methods: Record<string, number> = {};
    payments.forEach(p => {
      const method = p.method.replace('_', ' ').toUpperCase();
      methods[method] = (methods[method] || 0) + p.amount;
    });
    return Object.entries(methods).map(([name, value]) => ({ name, value }));
  }, [payments]);

  // Chart Data: Fee Head Distribution
  const headData = useMemo(() => {
    const heads: Record<string, number> = {};
    payments.forEach(p => {
      const head = p.feeHead || 'Tuition Fees';
      heads[head] = (heads[head] || 0) + p.amount;
    });
    return Object.entries(heads).map(([name, amount]) => ({ name, amount }));
  }, [payments]);

  // Chart Data: Class-wise
  const classData = useMemo(() => {
    const classMap: Record<string, number> = {};
    payments.forEach(p => {
      const className = classes.find(c => c.id === p.classId)?.name || 'Unknown';
      classMap[className] = (classMap[className] || 0) + p.amount;
    });
    return Object.entries(classMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [payments, classes]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Spinner size="lg" />
        <p className="text-slate-500 font-medium">Generating state-of-the-art analytics...</p>
      </div>
    );
  }

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-4 pt-5 pb-6 text-white rounded-b-3xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Accountant Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Payment Analytics</h1>

          {/* Collection % gauge */}
          <div className="mt-4 bg-white/15 backdrop-blur rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Collection Rate</p>
                <p className="text-3xl font-black mt-1">{stats.collectionRate.toFixed(1)}%</p>
                <p className="text-[11px] text-emerald-100/90 mt-1">₹{stats.totalCollected.toLocaleString('en-IN')} collected</p>
              </div>
              <div className="relative w-20 h-20">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15" fill="none" stroke="white" strokeWidth="3"
                    strokeDasharray={`${Math.min(100, stats.collectionRate) * 94.2 / 100} 94.2`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                  {stats.collectionRate.toFixed(0)}%
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((stats.currentMonthCollection/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Last 30 Days</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((stats.pendingAmount/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Pending</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Stats Overview</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                  <DollarSign className="w-4 h-4" />
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Collected</p>
                <p className="text-base font-black text-slate-900 mt-0.5">₹{stats.totalCollected.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mb-2">
                  <Calendar className="w-4 h-4" />
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">This Month</p>
                <p className="text-base font-black text-slate-900 mt-0.5">₹{stats.currentMonthCollection.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
                  <Activity className="w-4 h-4" />
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pending Due</p>
                <p className="text-base font-black text-slate-900 mt-0.5">₹{stats.pendingAmount.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Expected</p>
                <p className="text-base font-black text-slate-900 mt-0.5">₹{stats.totalExpected.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </div>

          {/* Method breakdown */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Payment Methods</p>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
              {methodData.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No payments yet</div>
              ) : (
                methodData.map((m, i) => {
                  const total = methodData.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? (m.value / total) * 100 : 0;
                  return (
                    <div key={m.name} className="p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <p className="text-xs font-bold text-slate-900 capitalize">{m.name.toLowerCase()}</p>
                        </div>
                        <p className="text-xs font-black text-slate-900">₹{m.value.toLocaleString()}</p>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Recent Activity</p>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
              {payments.slice(-5).reverse().map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">₹{(p.amount || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider truncate">{p.method.replace('_', ' ')} • {p.receiptNumber}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 shrink-0">{new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
              ))}
              {payments.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">No transactions yet</div>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={fetchData}
          className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          aria-label="Refresh"
        >
          <RefreshCcw className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Fee Analytics Terminal"
        subtitle="Real-time financial performance and collection insights"
        icon={TrendingUp}
        iconColor="gradient-blue"
        actions={
          <Button variant="secondary" icon={RefreshCcw} onClick={fetchData}>Sync Data</Button>
        }
      />

      {/* Top Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Total Collected"
          value={`₹${(stats.totalCollected || 0).toLocaleString()}`}
          icon={DollarSign}
          change="12.5%"
          changePositive={true}
          gradient="bg-blue-600"
          index={0}
        />
        <StatCard
          label="Current Month"
          value={`₹${(stats.currentMonthCollection || 0).toLocaleString()}`}
          icon={Calendar}
          gradient="bg-emerald-600"
          index={1}
        />
        <StatCard
          label="Pending Due"
          value={`₹${(stats.pendingAmount || 0).toLocaleString()}`}
          icon={Activity}
          gradient="bg-amber-600"
          index={2}
        />
        <StatCard
          label="Collection Rate"
          value={`${stats.collectionRate.toFixed(1)}%`}
          icon={CheckCircle2}
          gradient="bg-violet-600"
          index={3}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Collection Trend */}
        <Card>
          <SectionTitle>Collection Velocity</SectionTitle>
          <p className="text-xs text-slate-400 mb-4 font-medium uppercase tracking-widest">Monthly revenue trend analysis</p>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(v: any) => [`₹${(v || 0).toLocaleString()}`, 'Amount']}
                />
                <Area type="monotone" dataKey="amount" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Payment Method Distribution */}
        <Card>
          <SectionTitle>Payment Modalities</SectionTitle>
          <p className="text-xs text-slate-400 mb-4 font-medium uppercase tracking-widest">Breakdown by transaction method</p>
          <div className="h-[350px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={methodData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {methodData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(v: any) => [`₹${(v || 0).toLocaleString()}`, 'Total']}
                />
                <Legend iconType="circle" layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Class-wise Performance */}
        <Card className="lg:col-span-2">
          <SectionTitle>Institutional Breakdown</SectionTitle>
          <p className="text-xs text-slate-400 mb-4 font-medium uppercase tracking-widest">Collection performance across classes</p>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#F8FAFC' }}
                  formatter={(v: any) => [`₹${(v || 0).toLocaleString()}`, 'Amount']}
                />
                <Bar dataKey="amount" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={40}>
                  {classData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Fee Head Breakdown */}
        <Card>
          <SectionTitle>Fee Revenue Streams</SectionTitle>
          <p className="text-xs text-slate-400 mb-4 font-medium uppercase tracking-widest">Distribution across fee categories</p>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={headData}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v/1000}k`} />
                <YAxis dataKey="name" type="category" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} width={100} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(v: any) => [`₹${(v || 0).toLocaleString()}`, 'Amount']}
                />
                <Bar dataKey="amount" fill="#8B5CF6" radius={[0, 6, 6, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Recent Transaction Pulse */}
        <Card>
          <SectionTitle>Recent Activity</SectionTitle>
          <p className="text-xs text-slate-400 mb-4 font-medium uppercase tracking-widest">Latest fee movements in the system</p>
          <div className="space-y-4">
            {payments.slice(-6).reverse().map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">₹{(p.amount || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500 font-medium uppercase">{p.method.replace('_', ' ')} • {p.receiptNumber}</p>
                  </div>
                </div>
                <Badge variant="success" className="text-[10px] font-black">{new Date(p.date).toLocaleDateString()}</Badge>
              </div>
            ))}
            {payments.length === 0 && <EmptyState icon={RefreshCcw} title="No transactions yet" />}
          </div>
        </Card>
      </div>
      </div>
    </>
  );
}
