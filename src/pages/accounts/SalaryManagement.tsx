import { UserProfile, Teacher, Salary, StaffMember, UnifiedStaff, PayrollConfig } from '../../types';
import { 
  Download, 
  Users, 
  Settings,
  Calendar, 
  CheckCircle2, 
  Clock, 
  CreditCard, 
  Wallet, 
  Banknote, 
  History, 
  Filter,
  Plus,
  ArrowRight,
  TrendingUp,
  PieChart as PieChartIcon,
  ChevronRight,
  FileText,
  AlertCircle
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Modal,
  SearchInput,
  FormField,
  Input,
  Select,
  Textarea,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
  Avatar,
  StatCard,
} from '../../components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';

interface SalaryManagementProps {
  user: UserProfile;
}

export default function SalaryManagement({ user }: SalaryManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [staffList, setStaffList] = useState<UnifiedStaff[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [loading, setLoading] = useState(false);
  const [payrollConfig, setPayrollConfig] = useState<PayrollConfig | null>(null);
  
  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [targetMonth, setTargetMonth] = useState(selectedMonth); // For specific generation
  const [processingStaff, setProcessingStaff] = useState<UnifiedStaff | null>(null);
  const [processingSalary, setProcessingSalary] = useState<Salary | null>(null);

  const { showToast } = useToast();

  // Payroll Generation Form
  const [payrollForm, setPayrollForm] = useState({
    bonus: 0,
    pf: 0,
    tax: 0,
    leaves: 0,
    leaveDeductionRate: 0,
    otherDeductions: 0,
    remarks: ''
  });

  // Payment Form
  const [paymentData, setPaymentData] = useState({
    paidAmount: 0,
    method: 'bank_transfer',
    transactionId: '',
    phone: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teachersSnap, staffSnap, salariesSnap, configSnap] = await Promise.all([
        getDocs(collection(db, 'teachers')),
        getDocs(collection(db, 'staff')),
        getDocs(query(collection(db, 'salaries'), orderBy('month', 'desc'))),
        getDoc(doc(db, 'payroll-config', 'global'))
      ]);

      if (configSnap.exists()) {
        setPayrollConfig(configSnap.data() as PayrollConfig);
      } else {
        setPayrollConfig({
          id: 'global',
          workingDaysInYear: 240,
          pfRate: 12,
          professionalTax: 200,
          updatedBy: 'system',
          updatedAt: ''
        });
      }

      const teachersData = teachersSnap.docs.map(doc => {
        const data = doc.data() as Teacher;
        return {
          ...data,
          id: doc.id,
          staffCategory: 'Teacher',
          baseSalary: data.salaryStructure || 0,
        } as UnifiedStaff;
      });

      const otherStaffData = staffSnap.docs.map(doc => {
        const data = doc.data() as StaffMember;
        let cat: UnifiedStaff['staffCategory'] = 'Other Staff';
        if (data.role === 'principal') cat = 'Principal';
        else if (data.role === 'accounts') cat = 'Accounts';
        else if (data.role === 'admin') cat = 'Admin';

        return {
          ...data,
          id: doc.id,
          staffCategory: cat,
          baseSalary: data.salary || 0,
        } as UnifiedStaff;
      });

      setStaffList([...teachersData, ...otherStaffData]);
      setSalaries(salariesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Salary)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'salaries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCreatePayroll = (staff: UnifiedStaff) => {
    setProcessingStaff(staff);
    setTargetMonth(selectedMonth);
    
    const defaultPf = Math.round(staff.baseSalary * (payrollConfig?.pfRate ?? 12) / 100);
    const defaultTax = payrollConfig?.professionalTax ?? 200;
    
    // Calculate default daily rate based on annual formula: (Salary * 12) / WorkingDays
    let defaultDailyRate = payrollConfig?.leaveDeductionPerDay ?? 0;
    if (defaultDailyRate === 0) {
      const workingDays = payrollConfig?.workingDaysInYear ?? 240;
      defaultDailyRate = Math.round((staff.baseSalary * 12) / workingDays);
    }

    setPayrollForm({
      bonus: 0,
      pf: defaultPf,
      tax: defaultTax,
      leaves: 0,
      leaveDeductionRate: defaultDailyRate,
      otherDeductions: 0,
      remarks: ''
    });
    setIsCreateModalOpen(true);
  };

  const calculateNetAmount = (staff: UnifiedStaff) => {
    const leaveDeduction = payrollForm.leaves * payrollForm.leaveDeductionRate;
    return Math.max(0, staff.baseSalary + payrollForm.bonus - payrollForm.pf - payrollForm.tax - leaveDeduction - payrollForm.otherDeductions);
  };

  const generatePayroll = async () => {
    if (!processingStaff) return;
    setLoading(true);
    try {
      const leaveDeduction = payrollForm.leaves * payrollForm.leaveDeductionRate;
      const netAmount = calculateNetAmount(processingStaff);

      const salaryRecord: any = {
        employeeId: processingStaff.id,
        employeeName: processingStaff.name,
        employeeRole: (processingStaff as any).role || 'Teacher',
        month: targetMonth,
        baseAmount: processingStaff.baseSalary,
        allowances: payrollForm.bonus,
        deductions: {
          pf: payrollForm.pf,
          tax: payrollForm.tax,
          leaves: payrollForm.leaves,
          leaveDeduction: Math.round(leaveDeduction),
          other: payrollForm.otherDeductions
        },
        netAmount: Math.round(netAmount),
        paidAmount: 0,
        balanceAmount: Math.round(netAmount),
        status: 'pending',
        remarks: payrollForm.remarks,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'salaries'), salaryRecord);
      
      logActivity(user, 'Generated Payroll', 'Accounts', `Generated monthly payroll for ${processingStaff.name} for ${targetMonth}`);
      showToast(`Payroll generated for ${processingStaff.name}`, 'success');
      setIsCreateModalOpen(false);
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'salaries');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPayment = (salary: Salary) => {
    setProcessingSalary(salary);
    const staff = staffList.find(s => s.id === salary.employeeId);
    setPaymentData({
      paidAmount: salary.balanceAmount,
      method: 'bank_transfer',
      transactionId: '',
      phone: (staff as any)?.phone || '',
    });
    setIsPayModalOpen(true);
  };

  const processPayment = async () => {
    if (!processingSalary) return;
    if (paymentData.paidAmount <= 0) {
      showToast('Amount must be greater than 0', 'error');
      return;
    }

    setLoading(true);
    try {
      const newPaidAmount = (processingSalary.paidAmount || 0) + paymentData.paidAmount;
      const newBalance = processingSalary.netAmount - newPaidAmount;
      const status = newBalance <= 0 ? 'paid' : 'partially_paid';

      const payment = {
        amount: paymentData.paidAmount,
        date: new Date().toISOString(),
        method: paymentData.method,
        transactionId: paymentData.transactionId
      };

      const history = (processingSalary as any).paymentHistory || [];

      await updateDoc(doc(db, 'salaries', processingSalary.id), {
        paidAmount: newPaidAmount,
        balanceAmount: Math.max(0, newBalance),
        status,
        paidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        paymentHistory: [...history, payment]
      });

      // Record in expenses
      await addDoc(collection(db, 'expenses'), {
        category: 'salary',
        biller: processingSalary.employeeName,
        amount: paymentData.paidAmount,
        date: new Date().toISOString().split('T')[0],
        status: 'paid',
        paymentMethod: paymentData.method,
        description: `Salary Payment - ${processingSalary.month} (${processingSalary.employeeRole})`
      });

      logActivity(user, 'Processed Salary Payment', 'Accounts', `Paid ₹${paymentData.paidAmount.toLocaleString()} to ${processingSalary.employeeName}`);
      showToast('Payment processed successfully', 'success');

      // Persist phone back to staff record if changed, and fire WhatsApp
      try {
        const staff = staffList.find(s => s.id === processingSalary.employeeId);
        const enteredPhone = (paymentData.phone || '').trim();
        if (enteredPhone && staff && (staff as any).phone !== enteredPhone) {
          const collectionName = staff.staffCategory === 'Teacher' ? 'teachers' : 'staff';
          await updateDoc(doc(db, collectionName, processingSalary.employeeId), { phone: enteredPhone });
        }
        if (enteredPhone) {
          await fetch('/api/whatsapp/send-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: enteredPhone,
              templateName: 'salary_disbursed',
              parameters: [
                processingSalary.employeeName,
                `₹${paymentData.paidAmount.toLocaleString('en-IN')}`,
                processingSalary.month,
                processingSalary.employeeRole,
                (paymentData.method || '').replace(/_/g, ' '),
                paymentData.transactionId || '-',
                new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
              ],
            }),
          });
        }
      } catch { /* non-fatal */ }

      setIsPayModalOpen(false);
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `salaries/${processingSalary.id}`);
    } finally {
      setLoading(false);
    }
  };

  const exportPayroll = () => {
    const headers = ['Employee', 'Category', 'Month', 'Base', 'Bonus', 'PF', 'Tax', 'Leaves', 'Net Amount', 'Paid', 'Balance', 'Status'];
    const csvData = salaries.map(s => [
      s.employeeName,
      staffList.find(staff => staff.id === s.employeeId)?.staffCategory || 'Unknown',
      s.month,
      s.baseAmount || (s as any).amount || 0,
      s.allowances || (s as any).bonus || 0,
      s.deductions?.pf || 0,
      s.deductions?.tax || 0,
      s.deductions?.leaves || 0,
      s.netAmount || (s as any).amount || 0,
      s.paidAmount,
      s.balanceAmount,
      s.status
    ]);

    const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payroll_Export_${selectedMonth}.csv`;
    a.click();
  };

  const filteredStaff = useMemo(() => {
    return staffList.filter(s => {
      const matchesSearch = (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (s.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || s.staffCategory.toLowerCase() === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [staffList, searchTerm, selectedCategory]);

  const stats = useMemo(() => {
    const monthSalaries = salaries.filter(s => s.month === selectedMonth);
    const totalNet = monthSalaries.reduce((sum, s) => sum + (s.netAmount || (s as any).amount || 0), 0);
    const totalPaid = monthSalaries.reduce((sum, s) => sum + (s.paidAmount || 0), 0);
    const pendingCount = monthSalaries.filter(s => s.status !== 'paid').length;
    
    return {
      totalNet,
      totalPaid,
      pendingCount,
      totalExpenses: salaries.reduce((sum, s) => sum + (s.paidAmount || 0), 0)
    };
  }, [salaries, selectedMonth]);

  const chartData = useMemo(() => {
    const categories = ['Teacher', 'Principal', 'Accounts', 'Admin', 'Other Staff'];
    return categories.map(cat => {
      const catSalaries = salaries.filter(s => {
        const staff = staffList.find(st => st.id === s.employeeId || (st as any).teacherId === s.employeeId);
        return staff?.staffCategory === cat;
      });
      return {
        name: cat,
        amount: catSalaries.reduce((sum, s) => sum + (s.paidAmount || 0), 0)
      };
    }).filter(d => d.amount > 0);
  }, [salaries, staffList]);

  const COLORS = ['#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'];

  const categories = ['All', 'Teacher', 'Principal', 'Accounts', 'Admin', 'Other Staff'];

  const monthLabel = new Date(selectedMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const staffCategoryChips = ['all', 'teacher', 'principal', 'accounts', 'admin', 'other staff'];

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-4 pt-5 pb-6 text-white rounded-b-3xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Accountant Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Salary Management</h1>
          <p className="text-[11px] text-emerald-100/90 mt-1">Payroll for {monthLabel}</p>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white/15 backdrop-blur rounded-lg px-3 py-1.5 text-xs font-bold text-white border-0 focus:outline-none"
              style={{ colorScheme: 'dark' }}
            />
          </div>

          <div className="mt-4 bg-white/15 backdrop-blur rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Total Payout</p>
            <p className="text-3xl font-black mt-1">₹{stats.totalPaid.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-emerald-100/90 mt-1">Net est. ₹{stats.totalNet.toLocaleString('en-IN')}</p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-base font-bold">{staffList.length}</p>
              <p className="text-[9px] text-white/80">Staff</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-base font-bold">{stats.pendingCount}</p>
              <p className="text-[9px] text-white/80">Pending</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-base font-bold">₹{((stats.totalExpenses/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">All Paid</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-2">
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search staff by name or email..." />
        </div>

        <div className="px-4 overflow-x-auto flex gap-2 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {staffCategoryChips.map(c => (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap capitalize active:scale-95 transition-transform ${selectedCategory === c ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>

        <div className="px-4 pt-2 space-y-2.5">
          {filteredStaff.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No staff found</p>
            </div>
          ) : (
            filteredStaff.map((staff) => {
              const salary = salaries.find(s => (s.employeeId === staff.id || (s as any).teacherId === staff.id) && s.month === selectedMonth);
              const isPaid = salary?.status === 'paid';
              return (
                <div key={staff.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={staff.name} size="sm" src={staff.photoURL} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{staff.name}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {staff.staffCategory} • {(staff as any).role || 'Staff'}
                      </p>
                    </div>
                    {!salary ? (
                      <Badge variant="warning" className="text-[9px] shrink-0">UNRECORDED</Badge>
                    ) : (
                      <Badge variant={isPaid ? 'success' : salary.status === 'partially_paid' ? 'info' : 'default'} className="text-[9px] shrink-0">
                        {salary.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 rounded-lg py-1.5 px-2">
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Net Salary</p>
                      <p className="text-sm font-black text-slate-900">
                        ₹{(salary ? (salary.netAmount || (salary as any).amount) : staff.baseSalary).toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg py-1.5 px-2">
                      <p className="text-[9px] text-emerald-700 uppercase tracking-widest font-bold">Paid</p>
                      <p className="text-sm font-black text-emerald-700">₹{(salary?.paidAmount || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="mt-3">
                    {!salary ? (
                      <button
                        onClick={() => handleOpenCreatePayroll(staff)}
                        className="w-full py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                      >
                        <Plus className="w-3.5 h-3.5" /> Generate Payroll
                      </button>
                    ) : !isPaid ? (
                      <button
                        onClick={() => handleOpenPayment(salary)}
                        className="w-full py-2 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform shadow-sm"
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Disburse ₹{salary.balanceAmount.toLocaleString()}
                      </button>
                    ) : (
                      <div className="w-full py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button
          onClick={exportPayroll}
          className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          aria-label="Export"
        >
          <Download className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8 pb-20">
      <PageHeader
        title="Robust Payroll Management"
        subtitle="End-to-end salary processing with deduction tracking and detailed analytics"
        icon={CreditCard}
        iconColor="gradient-blue"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsAnalyticsOpen(true)} icon={TrendingUp}>
              Analytics
            </Button>
            <Button variant="secondary" size="sm" onClick={exportPayroll} icon={Download}>
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Monthly Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Estimated Monthly Net" 
          value={`₹${stats.totalNet.toLocaleString()}`} 
          icon={Wallet} 
          gradient="gradient-blue" 
          index={0} 
        />
        <StatCard 
          label="Total Disbursed (Month)" 
          value={`₹${stats.totalPaid.toLocaleString()}`} 
          icon={Banknote} 
          gradient="gradient-emerald" 
          index={1} 
        />
        <StatCard 
          label="Pending Payments" 
          value={stats.pendingCount.toString()} 
          icon={Clock} 
          gradient="gradient-amber" 
          index={2} 
        />
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <Badge variant="info">Current Selection</Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-500">Payroll Month</p>
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="mt-1 block w-full bg-transparent border-none p-0 text-xl font-black text-slate-900 focus:ring-0 cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-6">
          <Card padding="none">
            <div className="p-4 border-b bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex-1 w-full max-w-sm">
                <SearchInput
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Filter by name, email or role..."
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Select 
                  value={selectedCategory} 
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full sm:w-40 bg-white"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat.toLowerCase()}>{cat}</option>
                  ))}
                </Select>
                <Select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full sm:w-40 bg-white"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </Select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <tr>
                    <Th>Employee</Th>
                    <Th>Category</Th>
                    <Th>Status ({selectedMonth})</Th>
                    <Th>Net Salary</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {filteredStaff.map((staff) => {
                    const salary = salaries.find(s => (s.employeeId === staff.id || (s as any).teacherId === staff.id) && s.month === selectedMonth);
                    
                    if (selectedStatus !== 'all') {
                      const currentStatus = salary?.status || 'unrecorded';
                      if (selectedStatus === 'pending' && currentStatus === 'paid') return null;
                      if (selectedStatus === 'paid' && currentStatus !== 'paid') return null;
                    }

                    return (
                      <Tr key={staff.id}>
                        <Td>
                          <div className="flex items-center gap-3">
                            <Avatar name={staff.name} size="sm" src={staff.photoURL} />
                            <div>
                              <p className="font-bold text-slate-900 leading-none">{staff.name}</p>
                              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-semibold">
                                {(staff as any).role || 'Faculty'}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <Badge variant="indigo" className="font-mono text-[10px]">
                            {staff.staffCategory}
                          </Badge>
                        </Td>
                        <Td>
                          {!salary ? (
                            <Badge variant="warning" className="flex items-center gap-1 w-fit">
                              <AlertCircle className="w-3 h-3" />
                              Unrecorded
                            </Badge>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <Badge variant={salary.status === 'paid' ? 'success' : salary.status === 'partially_paid' ? 'info' : 'default'}>
                                {salary.status.replace('_', ' ').toUpperCase()}
                              </Badge>
                              {salary.paidAmount > 0 && (
                                <span className="text-[10px] text-slate-400">
                                  Paid: ₹{salary.paidAmount.toLocaleString()}
                                </span>
                              )}
                            </div>
                          )}
                        </Td>
                        <Td>
                          <div className="flex flex-col">
                            <span className="font-black text-slate-900">
                              ₹{(salary ? (salary.netAmount || (salary as any).amount) : staff.baseSalary).toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-400 italic">
                              Base: ₹{(staff.baseSalary || 0).toLocaleString()}
                            </span>
                          </div>
                        </Td>
                        <Td className="text-right">
                          {!salary ? (
                            <Button size="sm" onClick={() => handleOpenCreatePayroll(staff)} icon={Plus}>
                              Generate
                            </Button>
                          ) : salary.status !== 'paid' ? (
                            <Button size="sm" variant="primary" onClick={() => handleOpenPayment(salary)} icon={CreditCard}>
                              Pay
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-emerald-600 font-bold" disabled icon={CheckCircle2}>
                              Paid
                            </Button>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
              {filteredStaff.length === 0 && <EmptyState icon={Users} title="No staff members match filters" />}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none p-6 overflow-hidden relative">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <PieChartIcon className="w-6 h-6 text-blue-200" />
                <h3 className="font-bold text-lg">Expense Breakup</h3>
              </div>
              <div className="h-48 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={5}
                      dataKey="amount"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', color: '#000' }}
                      formatter={(v: any) => `₹${v.toLocaleString()}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-4 text-xs">
                {chartData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-blue-100">{d.name}</span>
                    </div>
                    <span className="font-bold">₹{d.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="border border-blue-100 bg-blue-50/30">
            <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Payroll Export
            </h3>
            <p className="text-xs text-blue-700 mb-4">
              Export all calculated salary records specifically for {new Date(selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} across all departments.
            </p>
            <Button variant="primary" className="w-full" onClick={exportPayroll} icon={Download}>
              Download CSV
            </Button>
          </Card>
        </div>
      </div>

      </div>

      {/* Step 1: Create Payroll Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Step 1: Calculate Monthly Payroll"
        subtitle={processingStaff ? `For ${processingStaff.name}` : ''}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={generatePayroll} loading={loading} icon={ArrowRight}>
              Finalize Payroll
            </Button>
          </div>
        }
      >
        {processingStaff && (
          <div className="space-y-6">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Avatar name={processingStaff.name} size="sm" src={processingStaff.photoURL} />
                <div>
                  <h4 className="font-bold text-slate-900 leading-none">{processingStaff.name}</h4>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">{(processingStaff as any).role || 'Staff'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default">Target Payroll Month</Badge>
                <Input 
                  type="month" 
                  value={targetMonth} 
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="w-40 h-9 py-0 font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">Additions</h4>
                <div className="space-y-4">
                  <FormField label="Monthly Base Salary">
                    <Input value={`₹${processingStaff.baseSalary.toLocaleString()}`} disabled className="bg-slate-50 font-bold" />
                  </FormField>
                  <FormField label="Incentives / Bonus">
                    <Input 
                      type="number" 
                      value={payrollForm.bonus} 
                      onChange={(e) => setPayrollForm({ ...payrollForm, bonus: Number(e.target.value) })}
                      placeholder="0"
                    />
                  </FormField>
                </div>

                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2 pt-4">Deductions</h4>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label={`EPF (${payrollConfig?.pfRate || 12}%)`}>
                    <Input 
                      type="number" 
                      value={payrollForm.pf} 
                      onChange={(e) => setPayrollForm({ ...payrollForm, pf: Number(e.target.value) })}
                    />
                  </FormField>
                  <FormField label="Tax (P-Tax / TDS)">
                    <Input 
                      type="number" 
                      value={payrollForm.tax} 
                      onChange={(e) => setPayrollForm({ ...payrollForm, tax: Number(e.target.value) })}
                    />
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Leaves Taken">
                    <Input 
                      type="number" 
                      max="31"
                      value={payrollForm.leaves} 
                      onChange={(e) => setPayrollForm({ ...payrollForm, leaves: Number(e.target.value) })}
                    />
                  </FormField>
                  <FormField label="Deduction per Day Leave">
                    <Input 
                      type="number" 
                      value={payrollForm.leaveDeductionRate} 
                      onChange={(e) => setPayrollForm({ ...payrollForm, leaveDeductionRate: Number(e.target.value) })}
                    />
                  </FormField>
                </div>
                <FormField label="Misc Deductions">
                  <Input 
                    type="number" 
                    value={payrollForm.otherDeductions} 
                    onChange={(e) => setPayrollForm({ ...payrollForm, otherDeductions: Number(e.target.value) })}
                  />
                </FormField>
              </div>

              <div className="flex flex-col">
                <div className="bg-slate-900 text-white rounded-3xl p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="text-blue-400 font-bold text-xs uppercase tracking-widest mb-6">Payroll Preview</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Monthly Base</span>
                        <span className="font-mono">₹{processingStaff.baseSalary.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Allowances</span>
                        <span className="text-emerald-400 font-mono">+ ₹{payrollForm.bonus.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Total Deductions</span>
                        <span className="text-rose-400 font-mono">
                          - ₹{(
                            payrollForm.pf + 
                            payrollForm.tax + 
                            payrollForm.otherDeductions + 
                            (payrollForm.leaves * payrollForm.leaveDeductionRate)
                          ).toLocaleString()}
                        </span>
                      </div>
                      <div className="h-px bg-slate-800 my-4" />
                      <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Calculated Net Pay</p>
                          <p className="text-4xl font-black text-white">₹{calculateNetAmount(processingStaff).toLocaleString()}</p>
                        </div>
                        <Badge variant="success" className="mb-2">READY</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="mt-8">
                    <p className="text-[10px] text-slate-500 italic mb-4">
                      * Rate calculation: (₹{processingStaff.baseSalary.toLocaleString()} × 12) / {payrollConfig?.workingDaysInYear || 240} = ₹{payrollForm.leaveDeductionRate.toLocaleString()}/day
                    </p>
                    <FormField label="Remarks / Note">
                      <Textarea 
                        className="bg-slate-800 border-none text-white"
                        placeholder="e.g. Performance bonus included..."
                        value={payrollForm.remarks}
                        onChange={(e) => setPayrollForm({ ...payrollForm, remarks: e.target.value })}
                        rows={3}
                      />
                    </FormField>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Step 2: Payment Modal */}
      <Modal
        isOpen={isPayModalOpen && !!processingSalary}
        onClose={() => setIsPayModalOpen(false)}
        title="Step 2: Disburse Salary"
        subtitle={processingSalary ? `Paying ${processingSalary.employeeName} for ${processingSalary.month}` : ''}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsPayModalOpen(false)}>Back</Button>
            <Button variant="primary" onClick={processPayment} loading={loading} icon={CheckCircle2}>
               Confirm Payment
            </Button>
          </div>
        }
      >
        {processingSalary && (
          <div className="space-y-6">
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center">
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Net Amount Payable</p>
              <h2 className="text-5xl font-black text-emerald-900">₹{processingSalary.balanceAmount.toLocaleString()}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Amount to Pay">
                <Input 
                  type="number" 
                  value={paymentData.paidAmount} 
                  onChange={(e) => setPaymentData({ ...paymentData, paidAmount: Number(e.target.value) })}
                  className="font-bold text-lg"
                />
              </FormField>
              <FormField label="Method">
                <Select
                  value={paymentData.method}
                  onChange={(e) => setPaymentData({ ...paymentData, method: e.target.value })}
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash Payment</option>
                  <option value="upi">UPI / Instant Pay</option>
                  <option value="cheque">Cheque</option>
                </Select>
              </FormField>
            </div>

            <FormField label="Transaction ID / Ref">
              <Input
                value={paymentData.transactionId}
                onChange={(e) => setPaymentData({ ...paymentData, transactionId: e.target.value })}
                placeholder="TXN..."
              />
            </FormField>

            <FormField label="Mobile Number (WhatsApp confirmation will be sent)">
              <Input
                type="tel"
                value={paymentData.phone}
                onChange={(e) => setPaymentData({ ...paymentData, phone: e.target.value })}
                placeholder="10-digit mobile number"
              />
            </FormField>

            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-3">
              <History className="w-5 h-5 text-blue-500 mt-1" />
              <div>
                <p className="text-sm font-bold text-blue-900">Accounting Note</p>
                <p className="text-[10px] text-blue-700 mt-0.5">
                  This will be recorded as a "Salary" expense in the accounts portal.
                  {paymentData.phone ? ' A WhatsApp confirmation will be sent to the employee.' : ''}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Analytics Modal */}
      <Modal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        title="Payroll Insights & Analytics"
        size="xl"
      >
        <div className="space-y-8 min-h-[500px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="p-6 overflow-hidden">
              <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-blue-500" />
                Distribution by Category
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v/1000}k`} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v: any) => `₹${v.toLocaleString()}`} />
                    <Bar dataKey="amount" radius={[8, 8, 0, 0]} barSize={40}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-500" />
                Recent Disbursements
              </h3>
              <div className="space-y-3">
                {salaries.filter(s => s.paidAmount > 0).slice(0, 6).map(s => (
                  <div key={s.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:border-blue-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.employeeName} size="sm" />
                      <div>
                        <p className="text-sm font-bold text-slate-900">{s.employeeName}</p>
                        <p className="text-[10px] text-slate-400 capitalize font-medium">{s.month} • {s.employeeRole}</p>
                      </div>
                    </div>
                    <p className="font-black text-emerald-600">₹{s.paidAmount.toLocaleString()}</p>
                  </div>
                ))}
                {salaries.filter(s => s.paidAmount > 0).length === 0 && (
                   <div className="py-20 text-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-3xl">
                     No payments recorded yet.
                   </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

