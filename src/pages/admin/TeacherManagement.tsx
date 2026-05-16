import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { Teacher, Subject, Class, House, UserProfile } from '../../types';
import { logActivity } from '../../services/activityService';
import {
  validateStaffInput,
  ensureUniqueEmail,
  provisionStaffAuthAccount,
  updateStaffWithUserSync,
  normalizeEmail,
  ConcurrentEditError,
} from '../../services/staffService';
import {
  Plus,
  Edit2,
  GraduationCap,
  Mail,
  Phone,
  DollarSign,
  Calendar,
  UserPlus,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '../../components/Toast';
import { PageHeader, Button, IconButton, Modal, ConfirmModal, SearchInput, FormField, Input, Select, EmptyState, Badge, Avatar } from '../../components/ui';

const DEFAULT_PASSWORD = 'password123';

export default function TeacherManagement({ user }: { user: UserProfile }) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('teachers');
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    employeeId: '',
    name: '',
    email: '',
    phone: '',
    subjects: [] as string[],
    classes: [] as string[],
    salaryStructure: '',
    joiningDetails: '',
    isHouseIncharge: false,
    houseInchargeId: '',
    isClassTeacher: false,
    classTeacherOf: {
      classId: '',
      section: '',
    },
    photoURL: '',
  });

  const fetchData = async () => {
    try {
      const teacherSnapshot = await getDocs(collection(db, 'teachers'));
      setTeachers(teacherSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher)));

      const subjectSnapshot = await getDocs(collection(db, 'subjects'));
      setSubjects(subjectSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject)));

      const classSnapshot = await getDocs(collection(db, 'classes'));
      setClasses(classSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class)));

      const houseSnapshot = await getDocs(collection(db, 'houses'));
      setHouses(houseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as House)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'multiple collections');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const salaryNum = Number(formData.salaryStructure);
      const validationErr = validateStaffInput({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        salary: salaryNum,
      });
      if (validationErr) {
        showToast(validationErr, 'error');
        return;
      }

      const normalizedEmail = normalizeEmail(formData.email);

      const teacherData = {
        ...formData,
        email: normalizedEmail,
        name: formData.name.trim(),
        salaryStructure: salaryNum,
      };

      if (isEditMode && editingTeacher) {
        try {
          await updateStaffWithUserSync({
            collectionName: 'teachers',
            docId: editingTeacher.id,
            expectedVersion: editingTeacher.version ?? 0,
            updates: {
              ...teacherData,
            },
            originalEmail: editingTeacher.email,
            userProfileUpdates: {
              name: formData.name.trim(),
              email: normalizedEmail,
              phone: formData.phone,
              photoURL: formData.photoURL,
              teacherId: editingTeacher.id,
            },
          });
          await logActivity(user, 'UPDATE_TEACHER', 'Teachers', `Updated teacher profile for ${formData.name}`);
          showToast('Teacher updated successfully!', 'success');
        } catch (err: any) {
          if (err instanceof ConcurrentEditError) {
            showToast(err.message, 'error');
            fetchData();
            return;
          }
          throw err;
        }
        setIsModalOpen(false);
        fetchData();
        resetForm();
        return;
      }

      // CREATE PATH
      await ensureUniqueEmail(normalizedEmail);
      const teacherUid = await provisionStaffAuthAccount(normalizedEmail, DEFAULT_PASSWORD);

      try {
        const teacherRef = await addDoc(collection(db, 'teachers'), {
          ...teacherData,
          version: 1,
          createdAt: new Date().toISOString(),
        });
        await setDoc(doc(db, 'users', teacherUid), {
          uid: teacherUid,
          email: normalizedEmail,
          name: formData.name.trim(),
          phone: formData.phone,
          role: 'teacher',
          teacherId: teacherRef.id,
          photoURL: formData.photoURL,
          createdAt: new Date().toISOString(),
        });
        await logActivity(user, 'HIRE_TEACHER', 'Teachers', `Hired new teacher ${formData.name} (${normalizedEmail})`);
        showToast('Teacher registered successfully!', 'success');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'teachers/users');
        throw err;
      }

      setIsModalOpen(false);
      fetchData();
      resetForm();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Error saving teacher', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      employeeId: '',
      name: '',
      email: '',
      phone: '',
      subjects: [],
      classes: [],
      salaryStructure: '',
      joiningDetails: '',
      isHouseIncharge: false,
      houseInchargeId: '',
      isClassTeacher: false,
      classTeacherOf: { classId: '', section: '' },
      photoURL: ''
    });
    setIsEditMode(false);
    setEditingTeacher(null);
  };

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setIsEditMode(true);
    setFormData({
      employeeId: teacher.employeeId || '',
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone || '',
      subjects: teacher.subjects || [],
      classes: teacher.classes || [],
      salaryStructure: teacher.salaryStructure.toString(),
      joiningDetails: teacher.joiningDetails,
      isHouseIncharge: !!teacher.houseInchargeId,
      houseInchargeId: teacher.houseInchargeId || '',
      isClassTeacher: !!teacher.classTeacherOf?.classId,
      classTeacherOf: teacher.classTeacherOf || { classId: '', section: '' },
      photoURL: teacher.photoURL || ''
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
      const teacher = teachers.find(t => t.id === deletingId);
      await deleteDoc(doc(db, 'teachers', deletingId));
      
      await logActivity(
        user,
        'DELETE_TEACHER',
        'Super Admin',
        `Deleted teacher record for ${teacher?.name || deletingId}`
      );

      fetchData();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `teachers/${deletingId}`);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Sanitize filename and use a stable path (teacher doc ID or tmp placeholder)
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const pathKey = editingTeacher?.id ?? `tmp_${Date.now()}`;
    setLoading(true);
    try {
      const storageRef = ref(storage, `profiles/teachers/${pathKey}/${Date.now()}_${safeFilename}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setFormData(prev => ({ ...prev, photoURL: url }));
    } catch (err) {
      console.error('Error uploading photo:', err);
      showToast('Failed to upload photo', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredTeachers = teachers.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Faculty</h1>
          <p className="text-xs text-indigo-100 mt-0.5">{teachers.length} teachers · {subjects.length} subjects</p>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name or email..."
            className="mt-3 w-full px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-sm text-white placeholder:text-white/60 focus:outline-none focus:bg-white/20"
          />
        </div>

        <div className="px-4 pt-4 space-y-2.5">
          {filteredTeachers.length === 0 ? (
            <div className="py-12 text-center">
              <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No teachers found</p>
            </div>
          ) : (
            filteredTeachers.map((teacher) => (
              <button
                key={teacher.id}
                onClick={() => !readOnly && handleEdit(teacher)}
                className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-3 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={teacher.name} src={teacher.photoURL} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{teacher.name}</p>
                    <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                      <Mail className="w-3 h-3 shrink-0" />{teacher.email}
                    </p>
                    {teacher.phone && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3 shrink-0" />{teacher.phone}
                      </p>
                    )}
                  </div>
                  {teacher.classTeacherOf?.classId && <Badge variant="info" className="text-[9px] shrink-0">CT</Badge>}
                </div>
                {teacher.subjects && teacher.subjects.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {teacher.subjects.slice(0, 3).map(subId => {
                      const subject = subjects.find(s => s.id === subId);
                      return subject ? (
                        <span key={subId} className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                          {subject.name}
                        </span>
                      ) : null;
                    })}
                    {teacher.subjects.length > 3 && (
                      <span className="text-[9px] text-slate-500">+{teacher.subjects.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {!readOnly && (
          <button
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-6">
      <PageHeader
        title="Faculty Management"
        subtitle={`${filteredTeachers.length} teachers`}
        icon={GraduationCap}
        iconColor="gradient-blue"
        actions={!readOnly && <Button size="sm" icon={UserPlus} onClick={() => { resetForm(); setIsModalOpen(true); }}>Add Teacher</Button>}
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search by name or email..." />
      </div>

      {filteredTeachers.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No teachers found" description="Add your first faculty member to get started" action={<Button size="sm" icon={Plus} onClick={() => { resetForm(); setIsModalOpen(true); }}>Add Teacher</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {filteredTeachers.map((teacher, i) => (
              <motion.div layout key={teacher.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: i * 0.04 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md hover:-translate-y-0.5 transition-all group"
              >
                <div className="flex items-start justify-between mb-5">
                  <Avatar name={teacher.name} src={teacher.photoURL} size="lg" />
                  {!readOnly && (
                    <div className="flex gap-1">
                      <IconButton icon={Edit2} size="sm" onClick={() => handleEdit(teacher)} />
                      <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => handleDelete(teacher.id)} />
                    </div>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-base">{teacher.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Mail className="w-3 h-3" />{teacher.email}</p>
                {teacher.phone && (
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Phone className="w-3 h-3" />{teacher.phone}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {teacher.subjects?.map(subId => {
                    const subject = subjects.find(s => s.id === subId);
                    return subject ? <Badge key={subId} variant="indigo">{subject.name}</Badge> : null;
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-50 grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center"><DollarSign className="w-3.5 h-3.5 text-emerald-600" /></div>
                    <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Salary</p><p className="text-sm font-bold text-slate-700">₹{teacher.salaryStructure?.toLocaleString() || '0'}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center"><Calendar className="w-3.5 h-3.5 text-amber-600" /></div>
                    <div><p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Joined</p><p className="text-sm font-bold text-slate-700">{teacher.joiningDetails || 'N/A'}</p></div>
                  </div>
                </div>
                {(teacher.houseInchargeId || teacher.classTeacherOf?.classId) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {teacher.houseInchargeId && <Badge variant="purple" dot>House Incharge</Badge>}
                    {teacher.classTeacherOf?.classId && <Badge variant="info" dot>Class Teacher</Badge>}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      </div>

      <ConfirmModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={performDelete}
        title="Delete Teacher?" message="This action cannot be undone. This teacher will be removed from the system." loading={loading} />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
        title={isEditMode ? 'Update Faculty Member' : 'New Faculty Member'}
        subtitle="Configure teacher profile and academic assignments"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button form="teacher-form" loading={loading} icon={isEditMode ? Edit2 : UserPlus}>
              {isEditMode ? 'Update Faculty' : 'Register Faculty'}
            </Button>
          </div>
        }
      >
        <form id="teacher-form" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Basic Information</p>
              
              <div className="flex items-center gap-6 mb-6">
                <div className="relative group">
                  <Avatar name={formData.name || 'T'} src={formData.photoURL} size="lg" className="w-20 h-20 shadow-lg" />
                  <label className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-lg shadow-md border border-slate-100 flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-all">
                    <Plus className="w-4 h-4 text-indigo-600" />
                    <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                  </label>
                </div>
                <div>
                   <p className="text-sm font-bold text-slate-900">Teacher Photo</p>
                   <p className="text-[10px] text-slate-400">Click the + to upload</p>
                </div>
              </div>

              <FormField label="Employee ID" required hint="e.g. TCH001 — shown on payslips">
                <Input required placeholder="TCH001" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value.toUpperCase()})} />
              </FormField>
              <FormField label="Full Name" required><Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></FormField>
              <FormField label="Email Address" required><Input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></FormField>
              <FormField label="Phone Number" required hint="Used for WhatsApp salary notifications">
                <Input
                  type="tel"
                  required
                  placeholder="10-digit mobile number"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                />
              </FormField>
              <FormField label="Monthly Salary" required><Input type="number" required value={formData.salaryStructure} onChange={e => setFormData({...formData, salaryStructure: e.target.value})} /></FormField>
              <FormField label="Joining Date" required><Input type="date" required value={formData.joiningDetails} onChange={e => setFormData({...formData, joiningDetails: e.target.value})} /></FormField>
            </div>
            <div className="space-y-4">
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Academic Assignments</p>
              <FormField label="Subjects Taught">
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 min-h-[60px]">
                  {subjects.map(subject => (
                    <button key={subject.id} type="button"
                      onClick={() => {
                        const newSubjects = formData.subjects.includes(subject.id) ? formData.subjects.filter(id => id !== subject.id) : [...formData.subjects, subject.id];
                        setFormData({...formData, subjects: newSubjects});
                      }}
                      className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border',
                        formData.subjects.includes(subject.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                      )}
                    >{subject.name}</button>
                  ))}
                </div>
              </FormField>
              <FormField label="Assigned Classes">
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 min-h-[60px]">
                  {classes.map(cls => (
                    <button key={cls.id} type="button"
                      onClick={() => {
                        const newClasses = formData.classes.includes(cls.id) ? formData.classes.filter(id => id !== cls.id) : [...formData.classes, cls.id];
                        setFormData({...formData, classes: newClasses});
                      }}
                      className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border',
                        formData.classes.includes(cls.id) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                      )}
                    >Class {cls.name}</button>
                  ))}
                </div>
              </FormField>

              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300">
                  <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-violet-500" /><span className="text-sm font-semibold text-slate-700">House Incharge</span></div>
                  <input type="checkbox" checked={formData.isHouseIncharge} onChange={e => setFormData({...formData, isHouseIncharge: e.target.checked})} className="accent-indigo-600 w-4 h-4" />
                </label>
                {formData.isHouseIncharge && (
                  <Select value={formData.houseInchargeId} onChange={e => setFormData({...formData, houseInchargeId: e.target.value})}>
                    <option value="">Select House</option>
                    {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </Select>
                )}
                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300">
                  <div className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-blue-500" /><span className="text-sm font-semibold text-slate-700">Class Teacher</span></div>
                  <input type="checkbox" checked={formData.isClassTeacher} onChange={e => setFormData({...formData, isClassTeacher: e.target.checked})} className="accent-indigo-600 w-4 h-4" />
                </label>
                {formData.isClassTeacher && (
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={formData.classTeacherOf.classId} onChange={e => setFormData({...formData, classTeacherOf: {...formData.classTeacherOf, classId: e.target.value}})}>
                      <option value="">Select Class</option>
                      {classes.map(c => <option key={c.id} value={c.id}>Class {c.name}</option>)}
                    </Select>
                    <Select value={formData.classTeacherOf.section} onChange={e => setFormData({...formData, classTeacherOf: {...formData.classTeacherOf, section: e.target.value}})}>
                      <option value="">Section</option>
                      {classes.find(c => c.id === formData.classTeacherOf.classId)?.sections.map(sec => (
                        <option key={sec.name} value={sec.name}>Section {sec.name}</option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
