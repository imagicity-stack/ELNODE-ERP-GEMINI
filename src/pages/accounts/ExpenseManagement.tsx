import { UserProfile, Expense } from '../../types';
import { generateExpenseAcknowledgement } from '../../lib/expenseReceipt';
import { Plus, Download, Receipt, Wallet, TrendingDown, Edit2, FileText, FileDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, orderBy, getDoc, onSnapshot } from 'firebase/firestore';
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
  const [mobileCategoryFilter, setMobileCategoryFilter] = useState<string>('all');
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    category: 'utilities',
    biller: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    status: 'paid' as 'paid' | 'pending',
    description: '',
    phone: '',
    address: '',
    paymentMode: 'cash' as 'cash' | 'bank_transfer' | 'upi' | 'cheque' | 'card' | 'other',
  });

  const fetchExpenses = () => {
    // No-op: expenses are live via onSnapshot.
  };

  useEffect(() => {
    const q = query(collection(db, 'expenses'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'expenses');
    });
    return () => unsub();
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

      // Fire WhatsApp confirmation to vendor — only for non-salary expenses
      // (salary disbursements have their own salary_disbursed template fired from SalaryManagement)
      if (!isEditMode && data.status === 'paid' && data.phone && data.category !== 'salary') {
        try {
          await fetch('/api/whatsapp/send-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: data.phone,
              templateName: 'expense_paid_1',
              parameters: [
                data.biller || 'Vendor',
                `₹${Number(data.amount).toLocaleString('en-IN')}`,
                data.description || data.category,
                data.category,
                new Date(data.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
                (data.paymentMode || 'cash').replace(/_/g, ' '),
              ],
            }),
          });
        } catch { /* non-fatal */ }
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
      phone: '',
      address: '',
      paymentMode: 'cash',
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
      phone: exp.phone || '',
      address: exp.address || '',
      paymentMode: (exp.paymentMode as any) || 'cash',
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
      // If this expense was created from a salary payment, reverse the salary record
      // so the salary section reflects the deletion.
      const expense = expenses.find(e => e.id === deletingId) as any;
      if (expense?.salaryId) {
        try {
          const salaryRef = doc(db, 'salaries', expense.salaryId);
          const salarySnap = await getDoc(salaryRef);
          if (salarySnap.exists()) {
            const salary = salarySnap.data() as any;
            const history: any[] = salary.paymentHistory || [];
            const filteredHistory = expense.salaryPaymentDate
              ? history.filter(h => h.date !== expense.salaryPaymentDate)
              : history.slice(0, -1);
            const newPaid = Math.max(0, (salary.paidAmount || 0) - expense.amount);
            const newBalance = Math.max(0, (salary.netAmount || 0) - newPaid);
            const newStatus = newPaid <= 0 ? 'pending' : (newBalance <= 0 ? 'paid' : 'partially_paid');
            await updateDoc(salaryRef, {
              paidAmount: newPaid,
              balanceAmount: newBalance,
              status: newStatus,
              paymentHistory: filteredHistory,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `salaries/${expense.salaryId}`);
        }
      }

      await deleteDoc(doc(db, 'expenses', deletingId));
      fetchExpenses();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${deletingId}`);
    }
  };

  const handleDownloadReceipt = async (exp: Expense) => {
    setDownloadingReceiptId(exp.id);
    try { await generateExpenseAcknowledgement(exp); } catch { /* ignore */ }
    setDownloadingReceiptId(null);
  };

  const handleDownloadCSV = () => {
    const headers = ['Date', 'Category', 'Biller', 'Description', 'Mode', 'Status', 'Amount', 'Phone', 'Address'];
    const rows = filteredExpenses.map(e => [
      e.date,
      e.category,
      `"${(e.biller || '').replace(/"/g, '""')}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      (e.paymentMode || '').replace(/_/g, ' '),
      e.status,
      e.amount,
      e.phone || '',
      `"${(e.address || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredExpenses = expenses.filter(e =>
    e.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.biller.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const pendingBills = expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0);

  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthExpenses = expenses.filter(e => e.date && e.date.startsWith(monthPrefix));
  const monthTotal = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const categories = ['all', 'utilities', 'maintenance', 'stationery', 'events', 'salary', 'other'];
  const mobileFilteredExpenses = filteredExpenses.filter(e => mobileCategoryFilter === 'all' || e.category === mobileCategoryFilter);

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-4 pt-5 pb-6 text-white rounded-b-3xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Accountant Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Expenses</h1>

          <div className="mt-4 bg-white/15 backdrop-blur rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">This Month</p>
            <p className="text-3xl font-black mt-1">₹{monthTotal.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-emerald-100/90 mt-1">{monthExpenses.length} expense{monthExpenses.length === 1 ? '' : 's'} recorded</p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((totalExpenses/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">All Time</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold">₹{((pendingBills/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Pending</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <div className="flex-1">
            <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search category or biller..." />
          </div>
          <button
            onClick={handleDownloadCSV}
            className="p-2.5 bg-white rounded-xl border border-slate-200 text-slate-600 active:scale-90 transition-transform shrink-0"
            aria-label="Export CSV"
          >
            <FileDown className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 overflow-x-auto flex gap-2 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setMobileCategoryFilter(c)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap capitalize active:scale-95 transition-transform ${mobileCategoryFilter === c ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>

        <div className="px-4 pt-2 space-y-2.5">
          {mobileFilteredExpenses.length === 0 ? (
            <div className="py-12 text-center">
              <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No expenses</p>
              <p className="text-xs text-slate-500 mt-1">Tap + to add an expense</p>
            </div>
          ) : (
            mobileFilteredExpenses.map((exp) => (
              <div key={exp.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3.5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-sm uppercase shrink-0">
                    {exp.category.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900 capitalize truncate">{exp.category}</p>
                      <p className="text-sm font-black text-rose-600 shrink-0">-₹{(exp.amount || 0).toLocaleString()}</p>
                    </div>
                    <p className="text-[11px] text-slate-600 truncate">{exp.biller}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={exp.status === 'paid' ? 'success' : 'warning'} className="text-[9px]">
                          {exp.status}
                        </Badge>
                        <span className="text-[10px] text-slate-400">{new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDownloadReceipt(exp)}
                          disabled={downloadingReceiptId === exp.id}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 active:scale-90 transition-transform disabled:opacity-50"
                          aria-label="Download acknowledgement"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleEdit(exp)}
                          className="p-1.5 rounded-lg bg-slate-50 text-slate-600 active:scale-90 transition-transform"
                          aria-label="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(exp.id)}
                          className="p-1.5 rounded-lg bg-rose-50 text-rose-600 active:scale-90 transition-transform"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          aria-label="Add expense"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Expense Management"
        subtitle="Track and manage school expenditures and bills"
        icon={TrendingDown}
        iconColor="gradient-amber"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={FileDown} onClick={handleDownloadCSV}>
              Export CSV
            </Button>
            <Button
              variant="danger"
              icon={Plus}
              onClick={() => { resetForm(); setIsModalOpen(true); }}
            >
              Add Expense
            </Button>
          </div>
        }
      />

      {/* Expense Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Expenses" value={`₹${(totalExpenses || 0).toLocaleString()}`} icon={TrendingDown} gradient="gradient-amber" index={0} />
        <StatCard label="Pending Bills" value={`₹${(pendingBills || 0).toLocaleString()}`} icon={Receipt} gradient="gradient-amber" index={1} />
        <StatCard label="Utilities" value={`₹${(expenses.filter(e => e.category === 'utilities').reduce((sum, e) => sum + e.amount, 0) || 0).toLocaleString()}`} icon={Wallet} gradient="gradient-amber" index={2} />
        <StatCard label="Maintenance" value={`₹${(expenses.filter(e => e.category === 'maintenance').reduce((sum, e) => sum + e.amount, 0) || 0).toLocaleString()}`} icon={Receipt} gradient="gradient-amber" index={3} />
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
                  <Td>{new Date(exp.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</Td>
                  <Td>
                    <Badge variant={exp.status === 'paid' ? 'success' : 'warning'}>
                      {exp.status}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        icon={FileText}
                        variant="ghost"
                        onClick={() => handleDownloadReceipt(exp)}
                        title="Download acknowledgement receipt"
                      />
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
      </div>

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
          <FormField label="What was this paid for?" required>
            <Input
              type="text"
              required
              placeholder="e.g. May electricity bill, 50 reams of A4 paper, AC servicing"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
          <FormField label="Mode of Payment">
            <Select
              value={formData.paymentMode}
              onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value as any })}
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
          <FormField label="Vendor Phone (for WhatsApp confirmation)">
            <Input
              type="tel"
              placeholder="10-digit mobile number"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </FormField>
          <FormField label="Vendor Address">
            <Input
              type="text"
              placeholder="Full address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </FormField>
        </form>
      </Modal>
    </>
  );
}
