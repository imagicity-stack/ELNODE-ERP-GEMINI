import { UserProfile, Teacher, Salary } from '../../types';
import { Search, Filter, Download, DollarSign, Users, Calendar, MoreVertical, CheckCircle2, Clock, AlertCircle, CreditCard, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '../../components/Toast';

interface SalaryManagementProps {
  user: UserProfile;
}

export default function SalaryManagement({ user }: SalaryManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [processingTeacher, setProcessingTeacher] = useState<Teacher | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const { showToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teachersSnap, salariesSnap] = await Promise.all([
        getDocs(collection(db, 'teachers')),
        getDocs(collection(db, 'salaries'))
      ]);

      setTeachers(teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher)));
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

  const handleProcessSalary = (teacher: Teacher) => {
    setProcessingTeacher(teacher);
    setIsConfirmModalOpen(true);
  };

  const performProcessSalary = async () => {
    if (!processingTeacher) return;
    
    setLoading(true);
    try {
      const salaryData: Omit<Salary, 'id'> = {
        teacherId: processingTeacher.id,
        month: selectedMonth,
        amount: processingTeacher.salaryStructure,
        status: 'paid',
        paidAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'salaries'), salaryData);
      
      // Also record as an expense
      await addDoc(collection(db, 'expenses'), {
        category: 'salary',
        biller: processingTeacher.name,
        amount: processingTeacher.salaryStructure,
        date: new Date().toISOString().split('T')[0],
        status: 'paid',
        description: `Salary for ${selectedMonth}`
      });

      showToast(`Salary processed successfully for ${processingTeacher.name}`, 'success');
      setIsConfirmModalOpen(false);
      setProcessingTeacher(null);
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'salaries');
    } finally {
      setLoading(false);
    }
  };

  const filteredTeachers = teachers.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPayroll = teachers.reduce((sum, t) => sum + (t.salaryStructure || 0), 0);
  const paidThisMonth = salaries
    .filter(s => s.month === selectedMonth && s.status === 'paid')
    .reduce((sum, s) => sum + (s.amount || 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll & Salaries</h1>
          <p className="text-gray-500 text-sm">Manage employee salaries, bonuses and deductions.</p>
        </div>
        <div className="flex items-center gap-4">
          <input 
            type="month" 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-600/20 outline-none"
          />
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-all">
            <Download className="w-4 h-4" />
            Export Payroll
          </button>
        </div>
      </div>

      {/* Payroll Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Monthly Payroll', value: `$${(totalPayroll || 0).toLocaleString()}`, count: `${teachers.length} Teachers`, color: 'blue', icon: Users },
          { label: 'Paid This Month', value: `$${(paidThisMonth || 0).toLocaleString()}`, count: `${salaries.filter(s => s.month === selectedMonth).length} Processed`, color: 'emerald', icon: CheckCircle2 },
          { label: 'Pending Salaries', value: `$${((totalPayroll - paidThisMonth) || 0).toLocaleString()}`, count: `${teachers.length - salaries.filter(s => s.month === selectedMonth).length} Pending`, color: 'amber', icon: Clock },
          { label: 'Current Month', value: new Date(selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), count: 'Payroll Period', color: 'indigo', icon: Calendar },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              stat.color === 'blue' && "bg-blue-50 text-blue-600",
              stat.color === 'emerald' && "bg-emerald-50 text-emerald-600",
              stat.color === 'amber' && "bg-amber-50 text-amber-600",
              stat.color === 'indigo' && "bg-indigo-50 text-indigo-600",
            )}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-[10px] text-gray-500 font-medium">{stat.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Payroll Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by teacher name or email..." 
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
                <th className="px-6 py-4">Teacher</th>
                <th className="px-6 py-4">Subjects</th>
                <th className="px-6 py-4">Base Salary</th>
                <th className="px-6 py-4">Status ({selectedMonth})</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTeachers.map((teacher) => {
                const salaryRecord = salaries.find(s => s.teacherId === teacher.id && s.month === selectedMonth);
                const isPaid = !!salaryRecord;

                return (
                  <tr key={teacher.id} className="group hover:bg-gray-50 transition-all">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                          {teacher.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{teacher.name}</p>
                          <p className="text-[10px] text-gray-400">{teacher.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {teacher.subjects.length} Subjects
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">${(teacher.salaryStructure || 0).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                        isPaid ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600",
                      )}>
                        {isPaid ? 'Paid' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {!isPaid ? (
                        <button 
                          onClick={() => handleProcessSalary(teacher)}
                          disabled={loading}
                          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
                        >
                          Process Salary
                        </button>
                      ) : (
                        <div className="flex items-center justify-end gap-2 text-emerald-600 font-bold text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          Processed
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isConfirmModalOpen && processingTeacher && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConfirmModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="p-8">
                <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-600 mx-auto mb-6 transform rotate-12">
                  <CreditCard className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 text-center mb-2 tracking-tight">Process Salary?</h3>
                <p className="text-gray-500 text-center mb-8 font-medium">
                  You are about to process a salary of <span className="text-gray-900 font-bold">${processingTeacher.salaryStructure?.toLocaleString()}</span> for <span className="text-gray-900 font-bold">{processingTeacher.name}</span> for the month of <span className="text-gray-900 font-bold">{new Date(selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>.
                </p>
                
                <div className="flex gap-4">
                  <button 
                    onClick={() => setIsConfirmModalOpen(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={performProcessSalary}
                    disabled={loading}
                    className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 shadow-xl shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50"
                  >
                    Confirm Payment
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
