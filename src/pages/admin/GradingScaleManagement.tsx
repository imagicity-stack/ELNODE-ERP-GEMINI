import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { GradingScale } from '../../types';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  Settings,
  PlusCircle,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function GradingScaleManagement() {
  const [scales, setScales] = useState<GradingScale[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingScale, setEditingScale] = useState<GradingScale | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    ranges: [
      { grade: 'A+', min: 90, max: 100, point: 4.0, description: 'Excellent' },
      { grade: 'A', min: 80, max: 89, point: 3.7, description: 'Very Good' },
      { grade: 'B', min: 70, max: 79, point: 3.0, description: 'Good' },
      { grade: 'C', min: 60, max: 69, point: 2.0, description: 'Satisfactory' },
      { grade: 'D', min: 50, max: 59, point: 1.0, description: 'Pass' },
      { grade: 'F', min: 0, max: 49, point: 0.0, description: 'Fail' },
    ]
  });

  useEffect(() => {
    fetchScales();
  }, []);

  const fetchScales = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'gradingScales'));
      setScales(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GradingScale)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'gradingScales');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingScale) {
        await updateDoc(doc(db, 'gradingScales', editingScale.id), formData);
      } else {
        await addDoc(collection(db, 'gradingScales'), {
          ...formData,
          createdAt: new Date().toISOString(),
        });
      }
      setIsModalOpen(false);
      setEditingScale(null);
      fetchScales();
      setFormData({ name: '', ranges: [{ grade: '', min: 0, max: 0, point: 0, description: '' }] });
    } catch (err) {
      handleFirestoreError(err, editingScale ? OperationType.UPDATE : OperationType.CREATE, editingScale ? `gradingScales/${editingScale.id}` : 'gradingScales');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  };

  const performDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'gradingScales', deletingId));
      fetchScales();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `gradingScales/${deletingId}`);
    }
  };

  const addRange = () => {
    setFormData({
      ...formData,
      ranges: [...formData.ranges, { grade: '', min: 0, max: 0, point: 0, description: '' }]
    });
  };

  const removeRange = (index: number) => {
    setFormData({
      ...formData,
      ranges: formData.ranges.filter((_, i) => i !== index)
    });
  };

  const updateRange = (index: number, field: string, value: any) => {
    const newRanges = [...formData.ranges];
    newRanges[index] = { ...newRanges[index], [field]: value };
    setFormData({ ...formData, ranges: newRanges });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grading Scales</h1>
          <p className="text-gray-500 text-sm">Define and manage grading systems for different examinations.</p>
        </div>
        <button 
          onClick={() => {
            setEditingScale(null);
            setFormData({
              name: '',
              ranges: [
                { grade: 'A+', min: 90, max: 100, point: 4.0, description: 'Excellent' },
                { grade: 'A', min: 80, max: 89, point: 3.7, description: 'Very Good' },
                { grade: 'B', min: 70, max: 79, point: 3.0, description: 'Good' },
                { grade: 'C', min: 60, max: 69, point: 2.0, description: 'Satisfactory' },
                { grade: 'D', min: 50, max: 59, point: 1.0, description: 'Pass' },
                { grade: 'F', min: 0, max: 49, point: 0.0, description: 'Fail' },
              ]
            });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          Create New Scale
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {scales.map((scale) => (
          <motion.div 
            key={scale.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all"
          >
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-bold text-gray-900">{scale.name}</h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setEditingScale(scale);
                    setFormData({ name: scale.name, ranges: scale.ranges });
                    setIsModalOpen(true);
                  }}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDelete(scale.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="pb-3">Grade</th>
                    <th className="pb-3">Range</th>
                    <th className="pb-3 text-right">Point</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {scale.ranges.sort((a, b) => b.min - a.min).map((range, idx) => (
                    <tr key={idx} className="group">
                      <td className="py-2.5 font-bold text-gray-700">{range.grade}</td>
                      <td className="py-2.5 text-gray-500 font-medium">{range.min}% - {range.max}%</td>
                      <td className="py-2.5 text-right font-bold text-indigo-600">{range.point.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        ))}
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
              <h3 className="text-2xl font-black text-gray-900 mb-2">Delete Grading Scale?</h3>
              <p className="text-gray-500 mb-8">This action cannot be undone. This grading scale will be permanently removed.</p>
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
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden relative z-10 max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                    <Settings className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingScale ? 'Edit Grading Scale' : 'Create New Grading Scale'}
                  </h2>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Scale Name</label>
                  <input 
                    type="text" required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                    placeholder="e.g. Standard High School Scale"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-gray-700">Grade Ranges</label>
                    <button 
                      type="button"
                      onClick={addRange}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Add Range
                    </button>
                  </div>

                  <div className="space-y-3">
                    {formData.ranges.map((range, idx) => (
                      <div key={idx} className="grid grid-cols-4 gap-4 items-end p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Grade</label>
                          <input 
                            type="text" required
                            value={range.grade}
                            onChange={(e) => updateRange(idx, 'grade', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600/20 outline-none"
                            placeholder="A+"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Min %</label>
                          <input 
                            type="number" required
                            value={range.min}
                            onChange={(e) => updateRange(idx, 'min', parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600/20 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Max %</label>
                          <input 
                            type="number" required
                            value={range.max}
                            onChange={(e) => updateRange(idx, 'max', parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600/20 outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Point</label>
                            <input 
                              type="number" step="0.1" required
                              value={range.point}
                              onChange={(e) => updateRange(idx, 'point', parseFloat(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-600/20 outline-none"
                            />
                          </div>
                          <button 
                            type="button"
                            onClick={() => removeRange(idx)}
                            className="p-2 text-gray-400 hover:text-red-600 transition-all mt-5"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-4 border-t">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : (editingScale ? 'Update Scale' : 'Create Scale')}
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
