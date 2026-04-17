import { UserProfile, Expense } from '../../types';
import { Plus, Search, Filter, Download, Receipt, Wallet, TrendingDown, Calendar, MoreVertical, Trash2, Edit2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Management</h1>
          <p className="text-gray-500 text-sm">Track and manage school expenditures and bills.</p>
        </div>
        <button 
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Expense
        </button>
      </div>

      {/* Expense Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Expenses', value: `$${(totalExpenses || 0).toLocaleString()}`, trend: '+5.2%', isUp: true, color: 'red', icon: TrendingDown },
          { label: 'Pending Bills', value: `$${(pendingBills || 0).toLocaleString()}`, trend: '-2.4%', isUp: false, color: 'amber', icon: Receipt },
          { label: 'Utilities', value: `$${(expenses.filter(e => e.category === 'utilities').reduce((sum, e) => sum + e.amount, 0) || 0).toLocaleString()}`, trend: '+1.5%', isUp: true, color: 'blue', icon: Wallet },
          { label: 'Maintenance', value: `$${(expenses.filter(e => e.category === 'maintenance').reduce((sum, e) => sum + e.amount, 0) || 0).toLocaleString()}`, trend: '+12.3%', isUp: true, color: 'indigo', icon: Receipt },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              stat.color === 'red' && "bg-red-50 text-red-600",
              stat.color === 'amber' && "bg-amber-50 text-amber-600",
              stat.color === 'blue' && "bg-blue-50 text-blue-600",
              stat.color === 'indigo' && "bg-indigo-50 text-indigo-600",
            )}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className={cn(
                "text-[10px] font-bold",
                stat.isUp ? "text-red-600" : "text-emerald-600"
              )}>{stat.trend} vs last month</p>
            </div>
          </div>
        ))}
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by category or biller..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                <th className="px-6 py-4">Expense Category</th>
                <th className="px-6 py-4">Biller/Vendor</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="group hover:bg-gray-50 transition-all">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600 font-bold text-xs uppercase">
                        {exp.category.charAt(0)}
                      </div>
                      <span className="text-sm font-bold text-gray-900 capitalize">{exp.category}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{exp.biller}</td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">${(exp.amount || 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{new Date(exp.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      exp.status === 'paid' && "bg-emerald-50 text-emerald-600",
                      exp.status === 'pending' && "bg-amber-50 text-amber-600",
                    )}>
                      {exp.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => handleEdit(exp)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(exp.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No expenses found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden relative z-10 p-8 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mx-auto mb-6">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2">Delete Expense?</h3>
              <p className="text-gray-500 mb-8">This action cannot be undone. This expense record will be permanently removed.</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={performDelete}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white">
                    {isEditMode ? <Edit2 className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{isEditMode ? 'Edit Expense' : 'Add Expense'}</h2>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expense Category</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-600/20 outline-none"
                  >
                    <option value="utilities">Utilities</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="stationery">Stationery</option>
                    <option value="events">Events</option>
                    <option value="salary">Salary</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Biller/Vendor</label>
                  <input 
                    type="text" required
                    value={formData.biller}
                    onChange={(e) => setFormData({...formData, biller: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-600/20 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                    <input 
                      type="number" required
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-600/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input 
                      type="date" required
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-600/20 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <div className="flex gap-4">
                    {['paid', 'pending'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormData({...formData, status: s as any})}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all border-2",
                          formData.status === s 
                            ? "bg-red-600 border-red-600 text-white" 
                            : "bg-white border-gray-100 text-gray-400 hover:border-red-200"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-6 border-t">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="px-8 py-2.5 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : (isEditMode ? 'Update Expense' : 'Add Expense')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
