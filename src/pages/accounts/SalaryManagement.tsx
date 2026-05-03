import { UserProfile, Teacher, Salary } from '../../types';
import { Download, Users, Calendar, CheckCircle2, Clock, CreditCard } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  ConfirmModal,
  SearchInput,
  FormField,
  Input,
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

interface SalaryManagementProps {
  user: UserProfile;
}

export default function SalaryManagement({ user }: SalaryManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [loading, setLoading] = useState(false);
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
      <PageHeader
        title="Payroll & Salaries"
        subtitle="Manage employee salaries, bonuses and deductions"
        icon={CreditCard}
        iconColor="gradient-amber"
        actions={
          <div className="flex items-center gap-3">
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-auto"
            />
            <Button variant="primary" icon={Download}>
              Export Payroll
            </Button>
          </div>
        }
      />

      {/* Payroll Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Monthly Payroll" value={`₹${(totalPayroll || 0).toLocaleString()}`} icon={Users} gradient="gradient-amber" index={0} />
        <StatCard label="Paid This Month" value={`₹${(paidThisMonth || 0).toLocaleString()}`} icon={CheckCircle2} gradient="gradient-amber" index={1} />
        <StatCard label="Pending Salaries" value={`₹${((totalPayroll - paidThisMonth) || 0).toLocaleString()}`} icon={Clock} gradient="gradient-amber" index={2} />
        <StatCard label="Current Month" value={new Date(selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} icon={Calendar} gradient="gradient-amber" index={3} />
      </div>

      {/* Payroll Table */}
      <Card padding="none">
        <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by teacher name or email..."
            className="max-w-md flex-1"
          />
        </div>
        {filteredTeachers.length > 0 ? (
          <Table>
            <Thead>
              <tr>
                <Th>Teacher</Th>
                <Th>Subjects</Th>
                <Th>Base Salary</Th>
                <Th>Status ({selectedMonth})</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {filteredTeachers.map((teacher) => {
                const salaryRecord = salaries.find(s => s.teacherId === teacher.id && s.month === selectedMonth);
                const isPaid = !!salaryRecord;

                return (
                  <Tr key={teacher.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={teacher.name} size="sm" />
                        <div>
                          <p className="font-bold text-slate-900">{teacher.name}</p>
                          <p className="text-[10px] text-slate-400">{teacher.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{teacher.subjects.length} Subjects</Td>
                    <Td className="font-bold text-slate-900">₹{(teacher.salaryStructure || 0).toLocaleString()}</Td>
                    <Td>
                      <Badge variant={isPaid ? 'success' : 'warning'}>
                        {isPaid ? 'Paid' : 'Pending'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      {!isPaid ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleProcessSalary(teacher)}
                          disabled={loading}
                        >
                          Process Salary
                        </Button>
                      ) : (
                        <div className="flex items-center justify-end gap-2 text-emerald-600 font-bold text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          Processed
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        ) : (
          <EmptyState icon={Users} title="No teachers found" />
        )}
      </Card>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmModalOpen && !!processingTeacher}
        onClose={() => { setIsConfirmModalOpen(false); setProcessingTeacher(null); }}
        onConfirm={performProcessSalary}
        title="Process Salary?"
        message={processingTeacher
          ? `You are about to process a salary of ₹${processingTeacher.salaryStructure?.toLocaleString()} for ${processingTeacher.name} for the month of ${new Date(selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`
          : ''
        }
        confirmLabel="Confirm Payment"
        loading={loading}
      />
    </div>
  );
}
