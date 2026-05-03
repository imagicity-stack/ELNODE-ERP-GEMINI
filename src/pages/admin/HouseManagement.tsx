import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Plus, Home, Search, X, Trash2, Edit2, User, Palette } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { House, Teacher } from '../../types';

export default function HouseManagement() {
  const [houses, setHouses] = useState<House[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingHouse, setEditingHouse] = useState<House | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    color: '#4f46e5',
    teacherInchargeId: '',
  });

  const fetchData = async () => {
    try {
      const houseSnapshot = await getDocs(collection(db, 'houses'));
      const houseList = houseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as House));
      setHouses(houseList);

      const teacherSnapshot = await getDocs(collection(db, 'teachers'));
      const teacherList = teacherSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));
      setTeachers(teacherList);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'houses/teachers');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEditMode && editingHouse) {
        await updateDoc(doc(db, 'houses', editingHouse.id), formData);
      } else {
        await addDoc(collection(db, 'houses'), formData);
      }
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingHouse(null);
      fetchData();
      setFormData({ name: '', color: '#4f46e5', teacherInchargeId: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, isEditMode ? `houses/${editingHouse?.id}` : 'houses');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (house: House) => {
    setEditingHouse(house);
    setIsEditMode(true);
    setFormData({
      name: house.name,
      color: house.color,
      teacherInchargeId: house.teacherInchargeId || '',
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
      await deleteDoc(doc(db, 'houses', deletingId));
      fetchData();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `houses/${deletingId}`);
    }
  };

  const filteredHouses = houses.filter(h => 
    h.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">House Management</h1>
          <p className="text-gray-500 mt-1">Organize students into houses and assign teacher incharges.</p>
        </div>
        <button 
          onClick={() => {
            setIsEditMode(false);
            setEditingHouse(null);
            setFormData({ name: '', color: '#4f46e5', teacherInchargeId: '' });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Create New House
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search houses..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-600/20 transition-all outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredHouses.map((house) => {
            const incharge = teachers.find(t => t.id === house.teacherInchargeId);
            return (
              <motion.div 
                layout
                key={house.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden"
              >
                <div 
                  className="absolute top-0 right-0 w-32 h-32 rounded-bl-full -mr-12 -mt-12 opacity-10 transition-all group-hover:opacity-20"
                  style={{ backgroundColor: house.color }}
                />
                
                <div className="flex items-start justify-between mb-6 relative z-10">
                  <div 
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg"
                    style={{ backgroundColor: house.color, boxShadow: `0 10px 15px -3px ${house.color}40` }}
                  >
                    <Home className="w-7 h-7" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleEdit(house)}
                      className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-indigo-600 transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(house.id)}
                      className="p-2 hover:bg-red-50 rounded-xl text-red-400 hover:text-red-600 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="relative z-10">
                  <h3 className="text-xl font-black text-gray-900 leading-tight">{house.name}</h3>
                  <div className="flex items-center gap-2 mt-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: house.color }} />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{house.color}</span>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-50 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Incharge</p>
                      <p className="text-sm font-bold text-gray-700">{incharge?.name || 'Not Assigned'}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

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
              <h3 className="text-2xl font-black text-gray-900 mb-2">Delete House?</h3>
              <p className="text-gray-500 mb-8">This action cannot be undone. All data associated with this house will be removed.</p>
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
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="p-8 border-b flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                    {isEditMode ? <Edit2 className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900">{isEditMode ? 'Edit House' : 'New House'}</h2>
                    <p className="text-sm text-gray-500">Define house parameters</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-gray-200 rounded-2xl transition-all">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">House Name</label>
                    <input 
                      type="text" required
                      placeholder="e.g. Red House"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">House Color</label>
                    <div className="flex gap-3">
                      <input 
                        type="color" required
                        value={formData.color}
                        onChange={(e) => setFormData({...formData, color: e.target.value})}
                        className="w-12 h-12 p-1 bg-gray-50 border-none rounded-xl cursor-pointer"
                      />
                      <input 
                        type="text" required
                        value={formData.color}
                        onChange={(e) => setFormData({...formData, color: e.target.value})}
                        className="flex-1 px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Teacher Incharge</label>
                    <select 
                      value={formData.teacherInchargeId}
                      onChange={(e) => setFormData({...formData, teacherInchargeId: e.target.value})}
                      className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                    >
                      <option value="">Select Teacher</option>
                      {teachers.map(teacher => (
                        <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-8">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-3 text-sm font-bold text-gray-500 hover:text-gray-900 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="px-10 py-3 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700 shadow-xl shadow-indigo-600/30 transition-all disabled:opacity-50 active:scale-95"
                  >
                    {loading ? 'Saving...' : (isEditMode ? 'Update House' : 'Create House')}
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
