import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Plus, GraduationCap, Trash2, Edit2, Users, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Class, UserProfile } from '../../types';
import { logActivity } from '../../services/activityService';
import { usePermissions } from '../../hooks/usePermissions';
import { PageHeader, Button, IconButton, Modal, ConfirmModal, SearchInput, FormField, Input, EmptyState } from '../../components/ui';

export default function ClassManagement({ user }: { user: UserProfile }) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('classes');

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

  const openAdd = () => { setIsEditMode(false); setEditingClass(null); setFormData({ name: '', sectionCount: 1, sections: [{ name: '', capacity: 40 }] }); setIsModalOpen(true); };

  return (
    <div className="space-y-6">
      <PageHeader title="Academic Classes" subtitle="Define grade levels, sections, and capacities" icon={GraduationCap} iconColor="gradient-violet"
        actions={!readOnly && <Button size="sm" icon={Plus} onClick={openAdd}>New Class</Button>} />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search classes..." />
      </div>

      {filteredClasses.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No classes found" description="Create your first class to get started" action={<Button size="sm" icon={Plus} onClick={openAdd}>New Class</Button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <AnimatePresence mode="popLayout">
            {filteredClasses.map((cls, i) => (
              <motion.div layout key={cls.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: i * 0.04 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl gradient-violet flex items-center justify-center shadow-lg">
                    <GraduationCap className="w-6 h-6 text-white" />
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1">
                      <IconButton icon={Edit2} size="sm" onClick={() => handleEdit(cls)} />
                      <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => handleDelete(cls.id)} />
                    </div>
                  )}
                </div>
                <h3 className="text-xl font-bold text-slate-900">Class {cls.name}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <Layers className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs font-semibold text-violet-600">{cls.sections?.length || 0} Sections</span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-50 space-y-2">
                  {cls.sections?.map((sec, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-white border border-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-600 shadow-sm">{sec.name || 'A'}</span>
                        <span className="text-xs font-semibold text-slate-600">Section {sec.name || 'A'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400"><Users className="w-3 h-3" /><span className="text-xs">{sec.capacity}</span></div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <ConfirmModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={performDelete}
        title="Delete Class?" message="This action cannot be undone. All sections in this class will be removed." loading={loading} />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
        title={isEditMode ? 'Edit Class' : 'New Class'} subtitle="Define academic structure and section configuration"
        size="md"
        footer={<div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button><Button form="class-form" loading={loading}>{isEditMode ? 'Update Class' : 'Create Class'}</Button></div>}
      >
        <form id="class-form" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <FormField label="Class Name / Grade" required>
                <Input required placeholder="e.g. 10 or X" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </FormField>
              <FormField label="Number of Sections">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => handleSectionCountChange(formData.sectionCount - 1)}
                    className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl font-bold hover:bg-slate-200 transition-all">−</button>
                  <span className="text-2xl font-bold text-slate-900 w-8 text-center">{formData.sectionCount}</span>
                  <button type="button" onClick={() => handleSectionCountChange(formData.sectionCount + 1)}
                    className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl font-bold hover:bg-slate-200 transition-all">+</button>
                </div>
              </FormField>
            </div>
            <FormField label="Section Capacities">
              <div className="space-y-2">
                {formData.sections.map((sec, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="w-8 h-8 rounded-lg bg-white border border-violet-100 flex items-center justify-center text-xs font-bold text-violet-600 shrink-0">{sec.name || 'A'}</span>
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Capacity</p>
                      <Input type="number" required value={sec.capacity} onChange={e => { const s = [...formData.sections]; s[idx].capacity = Number(e.target.value); setFormData({...formData, sections: s}); }} />
                    </div>
                  </div>
                ))}
              </div>
            </FormField>
          </div>
        </form>
      </Modal>
    </div>
  );
}
