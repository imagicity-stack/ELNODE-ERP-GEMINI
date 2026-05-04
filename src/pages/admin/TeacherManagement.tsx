import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, setDoc, query, where, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, getApp } from 'firebase/app';
import { db, firebaseConfig, handleFirestoreError, OperationType } from '../../firebase';
import { Teacher, Subject, Class, House, UserProfile } from '../../types';
import { logActivity } from '../../services/activityService';
import {
  Plus,
  Edit2,
  GraduationCap,
  Mail,
  DollarSign,
  Calendar,
  UserPlus,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { PageHeader, Button, IconButton, Modal, ConfirmModal, SearchInput, FormField, Input, Select, EmptyState, Badge, Avatar } from '../../components/ui';

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

  const [formData, setFormData] = useState({
    name: '',
    email: '',
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
    }
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
    setLoading(true);
    try {
      const teacherData = {
        ...formData,
        salaryStructure: Number(formData.salaryStructure),
        updatedAt: new Date().toISOString(),
      };

      if (isEditMode && editingTeacher) {
        try {
          await setDoc(doc(db, 'teachers', editingTeacher.id), teacherData, { merge: true });
          await logActivity(
            user,
            'UPDATE_TEACHER',
            'Teachers',
            `Updated teacher profile for ${formData.name}`
          );
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `teachers/${editingTeacher.id}`);
        }
        
        // Update user profile
        try {
          const teacherQuery = query(collection(db, 'users'), where('email', '==', editingTeacher.email), where('role', '==', 'teacher'));
          const teacherDocs = await getDocs(teacherQuery);
          if (!teacherDocs.empty) {
            await setDoc(doc(db, 'users', teacherDocs.docs[0].id), {
              name: formData.name,
              teacherId: editingTeacher.id,
            }, { merge: true });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'users');
        }
      } else {
        const defaultPassword = 'password123';
        let secondaryApp;
        try { secondaryApp = getApp('Secondary'); } catch (e) { secondaryApp = initializeApp(firebaseConfig, 'Secondary'); }
        const secondaryAuth = getAuth(secondaryApp);

        let teacherUid: string;
        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, formData.email, defaultPassword);
          teacherUid = cred.user.uid;
          await signOut(secondaryAuth);
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
            try {
              const cred = await signInWithEmailAndPassword(secondaryAuth, formData.email, defaultPassword);
              teacherUid = cred.user.uid;
              await signOut(secondaryAuth);
            } catch (signInErr: any) {
              if (signInErr.code === 'auth/invalid-credential' || signInErr.code === 'auth/wrong-password') {
                throw new Error(`The email ${formData.email} is already in use with a different password. Please contact support to reset it.`);
              }
              throw signInErr;
            }
          } else {
            throw err;
          }
        }

        try {
          const teacherRef = await addDoc(collection(db, 'teachers'), teacherData);
          await setDoc(doc(db, 'users', teacherUid), {
            uid: teacherUid,
            email: formData.email,
            name: formData.name,
            role: 'teacher',
            teacherId: teacherRef.id,
            createdAt: new Date().toISOString(),
          });
          await logActivity(
            user,
            'HIRE_TEACHER',
            'Teachers',
            `Hired new teacher ${formData.name} (${formData.email})`
          );
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'teachers/users');
        }
      }

      setIsModalOpen(false);
      fetchData();
      resetForm();
    } catch (err: any) {
      console.error(err);
      alert('Error saving teacher: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      subjects: [],
      classes: [],
      salaryStructure: '',
      joiningDetails: '',
      isHouseIncharge: false,
      houseInchargeId: '',
      isClassTeacher: false,
      classTeacherOf: { classId: '', section: '' }
    });
    setIsEditMode(false);
    setEditingTeacher(null);
  };

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setIsEditMode(true);
    setFormData({
      name: teacher.name,
      email: teacher.email,
      subjects: teacher.subjects || [],
      classes: teacher.classes || [],
      salaryStructure: teacher.salaryStructure.toString(),
      joiningDetails: teacher.joiningDetails,
      isHouseIncharge: !!teacher.houseInchargeId,
      houseInchargeId: teacher.houseInchargeId || '',
      isClassTeacher: !!teacher.classTeacherOf?.classId,
      classTeacherOf: teacher.classTeacherOf || { classId: '', section: '' }
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

  const filteredTeachers = teachers.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faculty Management"
        subtitle={`${filteredTeachers.length} teachers`}
        icon={GraduationCap}
        iconColor="gradient-blue"
        actions={<Button size="sm" icon={UserPlus} onClick={() => { resetForm(); setIsModalOpen(true); }}>Add Teacher</Button>}
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
                  <Avatar name={teacher.name} size="lg" />
                  <div className="flex gap-1">
                    <IconButton icon={Edit2} size="sm" onClick={() => handleEdit(teacher)} />
                    <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => handleDelete(teacher.id)} />
                  </div>
                </div>
                <h3 className="font-bold text-slate-900 text-base">{teacher.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Mail className="w-3 h-3" />{teacher.email}</p>
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
              <FormField label="Full Name" required><Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></FormField>
              <FormField label="Email Address" required><Input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></FormField>
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
    </div>
  );
}
