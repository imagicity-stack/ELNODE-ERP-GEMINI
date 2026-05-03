import { UserProfile, Expense } from '../../types';
import { Plus, Download, Receipt, Wallet, TrendingDown, Edit2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  IconButton,
  Modal,
  ConfirmModal,
  SearchInput,
  FormField,
  Input,
  Select,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
  StatCard,
} from '../../components/ui';
import { Trash2 } from 'lucide-react';

interface ExpenseManagementProps {
  user: UserProfile;
}

export default function ExpenseManagement({ user }: ExpenseManagementProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    category: 'utilities',
    biller: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    status: 'paid' as 'paid' | 'pending',
    description: '',
  });

  const fetchExpenses = async () => {
    try {
      const q = query(collection(db, 'expenses'), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'expenses');
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        ...formData,
        amount: Number(formData.amount),
      };

      if (isEditMode && editingExpense) {
        await updateDoc(doc(db, 'expenses', editingExpense.id), data);
      } else {
        await addDoc(collection(db, 'expenses'), data);
      }
      setIsModalOpen(false);
      resetForm();
      fetchExpenses();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, isEditMode ? `expenses/${editingExpense?.id}` : 'expenses');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      category: 'utilities',
      biller: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      status: 'paid',
      description: '',
    });
    setIsEditMode(false);
    setEditingExpense(null);
  };

  const handleEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setIsEditMode(true);
    setFormData({
      category: exp.category,
      biller: exp.biller,
      amount: exp.amount.toString(),
      date: exp.date,
      status: exp.status,
      description: exp.description || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  };

  const performDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'expenses', deletingId));
      fetchExpenses();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${deletingId}`);
    }
  };

  const filteredExpenses = expenses.filter(e =>
    e.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.biller.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const pendingBills = expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Expense Management"
        subtitle="Track and manage school expenditures and bills"
        icon={TrendingDown}
        iconColor="gradient-amber"
        actions={
          <Button
            variant="danger"
            icon={Plus}
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
          >
            Add Expense
          </Button>
        }
      />

      {/* Expense Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Expenses" value={`₹${(totalExpenses || 0).toLocaleString()}`} icon={TrendingDown} gradient="gradient-amber" change="+5.2%" changePositive={false} index={0} />
        <StatCard label="Pending Bills" value={`₹${(pendingBills || 0).toLocaleString()}`} icon={Receipt} gradient="gradient-amber" change="-2.4%" changePositive={true} index={1} />
        <StatCard label="Utilities" value={`₹${(expenses.filter(e => e.category === 'utilities').reduce((sum, e) => sum + e.amount, 0) || 0).toLocaleString()}`} icon={Wallet} gradient="gradient-amber" change="+1.5%" changePositive={false} index={2} />
        <StatCard label="Maintenance" value={`₹${(expenses.filter(e => e.category === 'maintenance').reduce((sum, e) => sum + e.amount, 0) || 0).toLocaleString()}`} icon={Receipt} gradient="gradient-amber" change="+12.3%" changePositive={false} index={3} />
      </div>

      {/* Expenses Table */}
      <Card padding="none">
        <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by category or biller..."
            className="max-w-md flex-1"
          />
        </div>
        {filteredExpenses.length > 0 ? (
          <Table>
            <Thead>
              <tr>
                <Th>Expense Category</Th>
                <Th>Biller/Vendor</Th>
                <Th>Amount</Th>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </Thead>
            <Tbody>
              {filteredExpenses.map((exp) => (
                <Tr key={exp.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600 font-bold text-xs uppercase">
                        {exp.category.charAt(0)}
                      </div>
                      <span className="font-bold text-slate-900 capitalize">{exp.category}</span>
                    </div>
                  </Td>
                  <Td>{exp.biller}</Td>
                  <Td className="font-bold text-slate-900">₹{(exp.amount || 0).toLocaleString()}</Td>
                  <Td>{new Date(exp.date).toLocaleDateString()}</Td>
                  <Td>
                    <Badge variant={exp.status === 'paid' ? 'success' : 'warning'}>
                      {exp.status}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Edit2} variant="ghost" onClick={() => handleEdit(exp)} />
                      <IconButton icon={Trash2} variant="danger" onClick={() => handleDelete(exp.id)} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        ) : (
          <EmptyState icon={Receipt} title="No expenses found" description="Add your first expense to get started." />
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={performDelete}
        title="Delete Expense?"
        message="This action cannot be undone. This expense record will be permanently removed."
        confirmLabel="Delete"
      />

      {/* Add/Edit Expense Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm(); }}
        title={isEditMode ? 'Edit Expense' : 'Add Expense'}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => { setIsModalOpen(false); resetForm(); }}>Cancel</Button>
            <Button variant="danger" loading={loading} onClick={(e: any) => {
              const form = document.querySelector('form[data-expense-form]') as HTMLFormElement;
              if (form) form.requestSubmit();
            }}>
              {isEditMode ? 'Update Expense' : 'Add Expense'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} data-expense-form className="space-y-5">
          <FormField label="Expense Category" required>
            <Select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            >
              <option value="utilities">Utilities</option>
              <option value="maintenance">Maintenance</option>
              <option value="stationery">Stationery</option>
              <option value="events">Events</option>
              <option value="salary">Salary</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
          <FormField label="Biller/Vendor" required>
            <Input
              type="text"
              required
              value={formData.biller}
              onChange={(e) => setFormData({ ...formData, biller: e.target.value })}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Amount (₹)" required>
              <Input
                type="number"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </FormField>
            <FormField label="Date" required>
              <Input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="Status">
            <div className="flex gap-4">
              {['paid', 'pending'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFormData({ ...formData, status: s as any })}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all border-2",
                    formData.status === s
                      ? "bg-red-600 border-red-600 text-white"
                      : "bg-white border-slate-100 text-slate-400 hover:border-red-200"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
