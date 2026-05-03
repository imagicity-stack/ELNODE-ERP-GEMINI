import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, setDoc, query, where, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, getApp } from 'firebase/app';
import { db, firebaseConfig, handleFirestoreError, OperationType } from '../../firebase';
import { Teacher, Subject, Class, House } from '../../types';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Edit2,
  GraduationCap,
  Mail,
  BookOpen,
  DollarSign,
  Calendar,
  X,
  UserPlus,
  Trash2,
  Home,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function TeacherManagement() {
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
      await deleteDoc(doc(db, 'teachers', deletingId));
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Faculty Management</h1>
          <p className="text-gray-500 mt-1">Manage school educators, assignments, and roles.</p>
        </div>
        <button 
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Add New Teacher
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by name, email or subject..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-600/20 transition-all outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredTeachers.map((teacher) => (
            <motion.div
              layout
              key={teacher.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-full -mr-12 -mt-12 opacity-50 group-hover:bg-indigo-100 transition-all" />
              
              <div className="flex items-start justify-between mb-6 relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-indigo-600/20">
                  {teacher.name.charAt(0)}
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleEdit(teacher)}
                    className="p-2 hover:bg-indigo-50 rounded-xl text-indigo-600 transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(teacher.id)}
                    className="p-2 hover:bg-red-50 rounded-xl text-red-600 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="relative z-10">
                <h3 className="text-xl font-black text-gray-900 leading-tight">{teacher.name}</h3>
                <div className="flex items-center gap-2 mt-1 text-gray-400">
                  <Mail className="w-3 h-3" />
                  <span className="text-xs font-medium">{teacher.email}</span>
                </div>
              </div>

              <div className="mt-6 space-y-4 relative z-10">
                <div className="flex flex-wrap gap-2">
                  {teacher.subjects?.map(subId => {
                    const subject = subjects.find(s => s.id === subId);
                    return (
                      <span key={subId} className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-wider rounded-lg">
                        {subject?.name || 'Subject'}
                      </span>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Salary</p>
                      <p className="text-sm font-bold text-gray-700">${teacher.salaryStructure?.toLocaleString() || '0'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Joined</p>
                      <p className="text-sm font-bold text-gray-700">{teacher.joiningDetails || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {(teacher.houseInchargeId || teacher.classTeacherOf?.classId) && (
                  <div className="flex flex-wrap gap-2 pt-4">
                    {teacher.houseInchargeId && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
                        <ShieldCheck className="w-3 h-3" />
                        <span className="text-[10px] font-black uppercase tracking-wider">House Incharge</span>
                      </div>
                    )}
                    {teacher.classTeacherOf?.classId && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                        <GraduationCap className="w-3 h-3" />
                        <span className="text-[10px] font-black uppercase tracking-wider">Class Teacher</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
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
              <h3 className="text-2xl font-black text-gray-900 mb-2">Delete Teacher?</h3>
              <p className="text-gray-500 mb-8">This action cannot be undone. This teacher will be removed from the system.</p>
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
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden relative z-10"
            >
              <div className="p-8 border-b flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                    {isEditMode ? <Edit2 className="w-8 h-8" /> : <UserPlus className="w-8 h-8" />}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">{isEditMode ? 'Update Faculty' : 'New Faculty Member'}</h2>
                    <p className="text-sm text-gray-500">Configure teacher profile and assignments</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-gray-200 rounded-2xl transition-all">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <h3 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                      Basic Information
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Full Name</label>
                        <input 
                          type="text" required
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Email Address</label>
                        <input 
                          type="email" required
                          value={formData.email}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Monthly Salary</label>
                        <input 
                          type="number" required
                          value={formData.salaryStructure}
                          onChange={(e) => setFormData({...formData, salaryStructure: e.target.value})}
                          className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Joining Date</label>
                        <input 
                          type="date" required
                          value={formData.joiningDetails}
                          onChange={(e) => setFormData({...formData, joiningDetails: e.target.value})}
                          className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                      Academic Assignments
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Subjects Taught</label>
                        <div className="flex flex-wrap gap-2">
                          {subjects.map(subject => (
                            <button
                              key={subject.id}
                              type="button"
                              onClick={() => {
                                const newSubjects = formData.subjects.includes(subject.id)
                                  ? formData.subjects.filter(id => id !== subject.id)
                                  : [...formData.subjects, subject.id];
                                setFormData({...formData, subjects: newSubjects});
                              }}
                              className={cn(
                                "px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border-2",
                                formData.subjects.includes(subject.id)
                                  ? "bg-indigo-600 border-indigo-600 text-white"
                                  : "bg-white border-gray-100 text-gray-400 hover:border-indigo-200"
                              )}
                            >
                              {subject.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-4 space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                          <div className="flex items-center gap-3">
                            <ShieldCheck className="w-5 h-5 text-purple-600" />
                            <span className="text-sm font-bold text-gray-700">House Incharge</span>
                          </div>
                          <input 
                            type="checkbox"
                            checked={formData.isHouseIncharge}
                            onChange={(e) => setFormData({...formData, isHouseIncharge: e.target.checked})}
                            className="w-5 h-5 accent-indigo-600"
                          />
                        </div>
                        {formData.isHouseIncharge && (
                          <select 
                            value={formData.houseInchargeId}
                            onChange={(e) => setFormData({...formData, houseInchargeId: e.target.value})}
                            className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                          >
                            <option value="">Select House</option>
                            {houses.map(house => (
                              <option key={house.id} value={house.id}>{house.name}</option>
                            ))}
                          </select>
                        )}

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                          <div className="flex items-center gap-3">
                            <GraduationCap className="w-5 h-5 text-blue-600" />
                            <span className="text-sm font-bold text-gray-700">Class Teacher</span>
                          </div>
                          <input 
                            type="checkbox"
                            checked={formData.isClassTeacher}
                            onChange={(e) => setFormData({...formData, isClassTeacher: e.target.checked})}
                            className="w-5 h-5 accent-indigo-600"
                          />
                        </div>
                        {formData.isClassTeacher && (
                          <div className="grid grid-cols-2 gap-4">
                            <select 
                              value={formData.classTeacherOf.classId}
                              onChange={(e) => setFormData({
                                ...formData, 
                                classTeacherOf: { ...formData.classTeacherOf, classId: e.target.value }
                              })}
                              className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                            >
                              <option value="">Select Class</option>
                              {classes.map(cls => (
                                <option key={cls.id} value={cls.id}>Class {cls.name}</option>
                              ))}
                            </select>
                            <select 
                              value={formData.classTeacherOf.section}
                              onChange={(e) => setFormData({
                                ...formData, 
                                classTeacherOf: { ...formData.classTeacherOf, section: e.target.value }
                              })}
                              className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                            >
                              <option value="">Select Section</option>
                              {classes.find(c => c.id === formData.classTeacherOf.classId)?.sections.map(sec => (
                                <option key={sec.name} value={sec.name}>Section {sec.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-10 mt-10 border-t">
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
                    {loading ? 'Processing...' : (isEditMode ? 'Update Faculty' : 'Register Faculty')}
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
