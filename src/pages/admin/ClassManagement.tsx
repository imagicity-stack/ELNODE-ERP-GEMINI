import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Plus, GraduationCap, Search, X, Trash2, Edit2, Users, Layers, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Class } from '../../types';

export default function ClassManagement() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    sectionCount: 1,
    sections: [{ name: '', capacity: 40 }] as { name: string; capacity: number }[],
  });

  const fetchClasses = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'classes'));
      const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
      setClasses(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'classes');
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const handleSectionCountChange = (count: number) => {
    const newCount = Math.max(1, count);
    const newSections = Array.from({ length: newCount }, (_, i) => {
      const name = newCount > 1 ? String.fromCharCode(65 + i) : '';
      return { 
        name, 
        capacity: formData.sections[i]?.capacity || 40 
      };
    });
    setFormData({ ...formData, sectionCount: newCount, sections: newSections });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const classData = {
        name: formData.name,
        sections: formData.sections,
        updatedAt: new Date().toISOString(),
      };

      if (isEditMode && editingClass) {
        await updateDoc(doc(db, 'classes', editingClass.id), classData);
      } else {
        await addDoc(collection(db, 'classes'), classData);
      }
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingClass(null);
      fetchClasses();
      setFormData({ name: '', sectionCount: 1, sections: [{ name: '', capacity: 40 }] });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, isEditMode ? `classes/${editingClass?.id}` : 'classes');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cls: Class) => {
    setEditingClass(cls);
    setIsEditMode(true);
    setFormData({
      name: cls.name,
      sectionCount: cls.sections.length,
      sections: cls.sections,
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
      await deleteDoc(doc(db, 'classes', deletingId));
      fetchClasses();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `classes/${deletingId}`);
    }
  };

  const filteredClasses = classes.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Academic Classes</h1>
          <p className="text-gray-500 mt-1">Define grade levels, sections, and student capacities.</p>
        </div>
        <button 
          onClick={() => {
            setIsEditMode(false);
            setEditingClass(null);
            setFormData({ name: '', sectionCount: 1, sections: [{ name: '', capacity: 40 }] });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Create New Class
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search classes..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-600/20 transition-all outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredClasses.map((cls) => (
            <motion.div 
              layout
              key={cls.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-full -mr-8 -mt-8 transition-all group-hover:bg-indigo-100" />
              
              <div className="flex items-start justify-between mb-6 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                  <GraduationCap className="w-7 h-7" />
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleEdit(cls)}
                    className="p-2 hover:bg-indigo-50 rounded-xl text-indigo-600 transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(cls.id)}
                    className="p-2 hover:bg-red-50 rounded-xl text-red-600 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="relative z-10">
                <h3 className="text-2xl font-black text-gray-900 leading-tight">Class {cls.name}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <Layers className="w-3 h-3 text-indigo-400" />
                  <span className="text-xs text-indigo-600 font-black tracking-widest uppercase">{cls.sections?.length || 0} Sections</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-50 space-y-3 relative z-10">
                {cls.sections?.map((sec, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-[10px] font-black text-indigo-600 shadow-sm border border-indigo-100">
                        {sec.name || 'A'}
                      </div>
                      <span className="text-xs font-bold text-gray-600">Section {sec.name || 'A'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-400">
                      <Users className="w-3 h-3" />
                      <span className="text-xs font-medium">{sec.capacity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
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
              <h3 className="text-2xl font-black text-gray-900 mb-2">Delete Class?</h3>
              <p className="text-gray-500 mb-8">This action cannot be undone. All sections in this class will be removed.</p>
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
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden relative z-10"
            >
              <div className="p-8 border-b flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                    {isEditMode ? <Edit2 className="w-8 h-8" /> : <Plus className="w-8 h-8" />}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">{isEditMode ? 'Edit Class' : 'New Class'}</h2>
                    <p className="text-sm text-gray-500">Define academic structure</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-gray-200 rounded-2xl transition-all">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-8 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Class Name / Grade</label>
                      <input 
                        type="text" required
                        placeholder="e.g. 10 or X"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Number of Sections</label>
                      <div className="flex items-center gap-4">
                        <button 
                          type="button"
                          onClick={() => handleSectionCountChange(formData.sectionCount - 1)}
                          className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-xl font-bold hover:bg-gray-200 transition-all"
                        >
                          -
                        </button>
                        <span className="text-2xl font-black text-gray-900 w-8 text-center">{formData.sectionCount}</span>
                        <button 
                          type="button"
                          onClick={() => handleSectionCountChange(formData.sectionCount + 1)}
                          className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-xl font-bold hover:bg-gray-200 transition-all"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Section Capacities</label>
                    <div className="space-y-3">
                      {formData.sections.map((sec, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-sm font-black text-indigo-600 shadow-sm border border-indigo-100">
                            {sec.name || 'A'}
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Capacity</p>
                            <input 
                              type="number" required
                              value={sec.capacity}
                              onChange={(e) => {
                                const newSections = [...formData.sections];
                                newSections[idx].capacity = Number(e.target.value);
                                setFormData({...formData, sections: newSections});
                              }}
                              className="w-full bg-transparent border-none p-0 text-sm font-bold focus:ring-0 outline-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-8 border-t">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-8 py-3 text-sm font-bold text-gray-500 hover:text-gray-900 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="px-12 py-4 bg-indigo-600 text-white rounded-2xl text-sm font-black hover:bg-indigo-700 shadow-xl shadow-indigo-600/30 transition-all disabled:opacity-50 active:scale-95 flex items-center gap-2"
                  >
                    {loading ? 'Saving...' : (isEditMode ? 'Update Class' : 'Create Class')}
                    {!loading && <CheckCircle2 className="w-5 h-5" />}
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
