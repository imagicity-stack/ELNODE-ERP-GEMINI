import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { 
  Plus, 
  CreditCard, 
  IndianRupee, 
  Settings, 
  Trash2, 
  Edit2, 
  X,
  Wallet,
  Receipt,
  AlertCircle,
  Save,
  ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Class, FeeStructure as IFeeStructure, FeeHead } from '../../types';
import { useToast } from '../../components/Toast';

export default function FeeStructure() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [feeStructure, setFeeStructure] = useState<IFeeStructure | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const [newHead, setNewHead] = useState<Omit<FeeHead, 'id'>>({
    name: '',
    amount: 0,
    description: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const classesSnap = await getDocs(collection(db, 'classes'));
      const classesList = classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
      setClasses(classesList);
      
      if (classesList.length > 0 && !selectedClassId) {
        setSelectedClassId(classesList[0].id);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'classes');
    } finally {
      setLoading(false);
    }
  };

  const fetchFeeStructure = async (classId: string) => {
    if (!classId) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'feeStructures'), where('classId', '==', classId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setFeeStructure({ id: snap.docs[0].id, ...snap.docs[0].data() } as IFeeStructure);
      } else {
        setFeeStructure({
          id: '',
          classId,
          heads: [],
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `feeStructures/${classId}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchFeeStructure(selectedClassId);
    }
  }, [selectedClassId]);

  const handleAddHead = () => {
    if (!newHead.name || newHead.amount <= 0) return;
    if (!feeStructure) return;

    const updatedHeads = [...feeStructure.heads, { ...newHead }];
    setFeeStructure({ ...feeStructure, heads: updatedHeads });
    setNewHead({ name: '', amount: 0, description: '' });
  };

  const handleRemoveHead = (index: number) => {
    if (!feeStructure) return;
    const updatedHeads = feeStructure.heads.filter((_, i) => i !== index);
    setFeeStructure({ ...feeStructure, heads: updatedHeads });
  };

  const handleSaveStructure = async () => {
    if (!feeStructure || !selectedClassId) return;
    setSaving(true);
    try {
      const structureData = {
        ...feeStructure,
        classId: selectedClassId,
        updatedAt: new Date().toISOString(),
      };

      if (feeStructure.id) {
        await setDoc(doc(db, 'feeStructures', feeStructure.id), structureData);
      } else {
        const docRef = await addDoc(collection(db, 'feeStructures'), structureData);
        setFeeStructure({ ...structureData, id: docRef.id });
      }
      showToast('Fee structure saved successfully!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'feeStructures');
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = feeStructure?.heads.reduce((acc, curr) => acc + curr.amount, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fee Structure Management</h1>
          <p className="text-gray-500 text-sm">Define class-wise fee heads and amounts.</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button 
            onClick={handleSaveStructure}
            disabled={saving || !feeStructure}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Structure'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Fee Heads List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b bg-gray-50/50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-600" />
                Fee Heads for {classes.find(c => c.id === selectedClassId)?.name || 'Class'}
              </h3>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {feeStructure?.heads.length || 0} Heads
              </span>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Add New Head Row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1 ml-1">Head Name</label>
                  <input 
                    type="text"
                    placeholder="e.g. Tuition Fee"
                    value={newHead.name}
                    onChange={(e) => setNewHead({...newHead, name: e.target.value})}
                    className="w-full px-4 py-2 bg-white border border-blue-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1 ml-1">Amount (₹)</label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                    <input 
                      type="number"
                      placeholder="0"
                      value={newHead.amount || ''}
                      onChange={(e) => setNewHead({...newHead, amount: Number(e.target.value)})}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-blue-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                </div>
                <div className="sm:col-span-3 flex items-end">
                  <button 
                    onClick={handleAddHead}
                    className="w-full py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>
              </div>

              <div className="divide-y divide-gray-50">
                {feeStructure?.heads.length ? feeStructure.heads.map((head, index) => (
                  <div key={index} className="py-4 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                        <IndianRupee className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{head.name}</h4>
                        <p className="text-xs text-gray-500">{head.description || 'Standard fee head'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-lg font-black text-gray-900">₹{(head.amount || 0).toLocaleString()}</p>
                      </div>
                      <button 
                        onClick={() => handleRemoveHead(index)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto mb-4">
                      <Receipt className="w-8 h-8" />
                    </div>
                    <p className="text-gray-500 font-medium">No fee heads defined for this class.</p>
                    <p className="text-xs text-gray-400 mt-1">Start by adding heads using the form above.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Summary & Stats */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
              <div className="flex items-center justify-between mb-8">
                <Wallet className="w-8 h-8 opacity-50" />
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Structure Summary</span>
              </div>
              <p className="text-xs opacity-80 font-bold uppercase tracking-wider">Total Class Fee</p>
              <h2 className="text-4xl font-black mt-1">₹{(totalAmount || 0).toLocaleString()}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 font-medium">Total Heads</span>
                <span className="font-bold text-gray-900">{feeStructure?.heads.length || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 font-medium">Last Updated</span>
                <span className="font-bold text-gray-900">
                  {feeStructure?.updatedAt ? new Date(feeStructure.updatedAt).toLocaleDateString() : 'Never'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
            <h3 className="font-bold text-amber-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              Important Note
            </h3>
            <ul className="space-y-3 text-xs text-amber-800 leading-relaxed">
              <li className="flex gap-2">
                <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                Fee structures defined here will be used as templates by the accountant.
              </li>
              <li className="flex gap-2">
                <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                Changes here will not affect already generated fee requests.
              </li>
              <li className="flex gap-2">
                <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                You can add custom heads or discounts while generating individual requests.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
