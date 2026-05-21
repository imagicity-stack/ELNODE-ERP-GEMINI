import { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Plus, GraduationCap, Trash2, Edit2, Users, Layers, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Class, Student, UserProfile } from '../../types';
import { logActivity } from '../../services/activityService';
import { usePermissions } from '../../hooks/usePermissions';
import { PageHeader, Button, IconButton, Modal, ConfirmModal, SearchInput, FormField, Input, EmptyState, Avatar } from '../../components/ui';

interface ViewingSection {
  classId: string;
  className: string;
  section: string;
  capacity: number;
}

export default function ClassManagement({ user }: { user: UserProfile }) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingSection, setViewingSection] = useState<ViewingSection | null>(null);

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('classes');

  // Students store their section as `sec.name || 'A'` (see StudentManagement),
  // so a single-section class (sec.name === '') stores 'A'. Normalize both
  // sides with `|| 'A'` so the roster matches regardless of how it was saved.
  const countStudents = (classId: string, section: string) =>
    students.filter(s => s.classId === classId && (s.section || 'A') === (section || 'A')).length;

  // Roster for the section currently being viewed, sorted by name
  const rosterStudents = useMemo(() => {
    if (!viewingSection) return [];
    return students
      .filter(s => s.classId === viewingSection.classId && (s.section || 'A') === (viewingSection.section || 'A'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, viewingSection]);

  const openRoster = (cls: Class, section: string, capacity: number) =>
    setViewingSection({ classId: cls.id, className: cls.name, section, capacity });

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

  const fetchStudents = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'students'));
      setStudents(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'students');
    }
  };

  useEffect(() => {
    fetchClasses();
    fetchStudents();
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
        logActivity(user, 'Class Updated', 'Super Admin', `Updated class "${formData.name}" with ${formData.sections.length} section(s)`, { classId: editingClass.id, name: formData.name });
      } else {
        await addDoc(collection(db, 'classes'), classData);
        logActivity(user, 'Class Created', 'Super Admin', `Created class "${formData.name}" with ${formData.sections.length} section(s)`, { name: formData.name });
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
      const deletedClass = classes.find(c => c.id === deletingId);
      await deleteDoc(doc(db, 'classes', deletingId));
      fetchClasses();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
      logActivity(user, 'Class Deleted', 'Super Admin', `Deleted class "${deletedClass?.name || deletingId}"`, { classId: deletingId });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `classes/${deletingId}`);
    }
  };

  const filteredClasses = classes.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openAdd = () => { setIsEditMode(false); setEditingClass(null); setFormData({ name: '', sectionCount: 1, sections: [{ name: '', capacity: 40 }] }); setIsModalOpen(true); };

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Classes</h1>
          <p className="text-xs text-indigo-100 mt-0.5">{classes.length} classes · {classes.reduce((sum, c) => sum + (c.sections?.length || 0), 0)} sections</p>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search classes..."
            className="mt-3 w-full px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-sm text-white placeholder:text-white/60 focus:outline-none focus:bg-white/20"
          />
        </div>

        <div className="px-4 pt-4 space-y-2.5">
          {filteredClasses.length === 0 ? (
            <div className="py-12 text-center">
              <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No classes</p>
            </div>
          ) : (
            filteredClasses.map((cls) => (
              <div key={cls.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">Class {cls.name}</p>
                    <p className="text-[11px] text-slate-500">{cls.sections?.length || 0} sections · {(cls.sections || []).reduce((s, x) => s + (x.capacity || 0), 0)} seats</p>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => handleEdit(cls)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
                        <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                      </button>
                      <button onClick={() => handleDelete(cls.id)} className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center active:scale-90 transition-transform">
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      </button>
                    </div>
                  )}
                </div>
                {cls.sections && cls.sections.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {cls.sections.map((sec, idx) => {
                      const filled = countStudents(cls.id, sec.name);
                      return (
                        <button
                          key={idx}
                          onClick={() => openRoster(cls, sec.name, sec.capacity)}
                          className="text-[9px] font-bold text-violet-700 bg-violet-50 px-2 py-1 rounded-md active:scale-95 transition-transform"
                        >
                          {sec.name || 'A'} · {filled}/{sec.capacity}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {!readOnly && (
          <button
            onClick={openAdd}
            className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-6">
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
                  {cls.sections?.map((sec, idx) => {
                    const filled = countStudents(cls.id, sec.name);
                    const isFull = filled >= sec.capacity;
                    return (
                      <button
                        key={idx}
                        onClick={() => openRoster(cls, sec.name, sec.capacity)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg hover:bg-violet-50 transition-colors text-left group/sec"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-white border border-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-600 shadow-sm">{sec.name || 'A'}</span>
                          <span className="text-xs font-semibold text-slate-600">Section {sec.name || 'A'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-slate-400">
                            <Users className="w-3 h-3" />
                            <span className={`text-xs font-semibold ${isFull ? 'text-rose-500' : 'text-slate-500'}`}>{filled}/{sec.capacity}</span>
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover/sec:text-violet-500 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      </div>

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

      {/* ─── Section Roster (students synced from the student list) ────────── */}
      <Modal
        isOpen={!!viewingSection}
        onClose={() => setViewingSection(null)}
        title={viewingSection ? `Class ${viewingSection.className} · Section ${viewingSection.section || 'A'}` : ''}
        subtitle={viewingSection ? `${rosterStudents.length} of ${viewingSection.capacity} seats filled` : ''}
        size="md"
      >
        {viewingSection && (
          <div>
            {/* Capacity bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                <span>Enrollment</span>
                <span className={rosterStudents.length >= viewingSection.capacity ? 'text-rose-500' : 'text-violet-600'}>
                  {rosterStudents.length}/{viewingSection.capacity}
                  {rosterStudents.length >= viewingSection.capacity && ' · Full'}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${rosterStudents.length >= viewingSection.capacity ? 'bg-rose-500' : 'bg-violet-500'}`}
                  style={{ width: `${Math.min(100, viewingSection.capacity > 0 ? (rosterStudents.length / viewingSection.capacity) * 100 : 0)}%` }}
                />
              </div>
            </div>

            {rosterStudents.length === 0 ? (
              <div className="py-10 text-center">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">No students enrolled</p>
                <p className="text-xs text-slate-500 mt-1">No students are assigned to this section yet.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {rosterStudents.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 w-5 text-center shrink-0">{i + 1}</span>
                    <Avatar name={s.name} src={s.photoURL} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{s.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{s.admissionNumber || s.schoolNumber}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
