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
  Phone,
  UserPlus,
  Trash2,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '../../components/Toast';
import { Modal, ConfirmModal, FormField, Input, Select, Button } from '../../components/ui';

const DEFAULT_PASSWORD = 'password123';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

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
  const [search, setSearch] = useState('');

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
    classTeacherOf: { classId: '', section: '' },
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

  useEffect(() => { fetchData(); }, []);

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
      if (validationErr) { showToast(validationErr, 'error'); return; }

      // Class-teacher integrity checks
      if (formData.isClassTeacher) {
        const { classId, section } = formData.classTeacherOf;
        if (!classId) { showToast('Select a class for the class teacher assignment', 'error'); return; }

        const selectedClass = classes.find(c => c.id === classId);
        const namedSections = (selectedClass?.sections ?? []).filter(s => s.name);
        if (namedSections.length > 0 && !section) {
          showToast('Select a section for the class teacher assignment', 'error');
          return;
        }

        // No two teachers may be class teacher of the same class + section
        const clash = teachers.find(t =>
          t.id !== editingTeacher?.id &&
          t.classTeacherOf?.classId === classId &&
          (t.classTeacherOf?.section || '') === (section || '')
        );
        if (clash) {
          const label = `Class ${selectedClass?.name ?? ''}${section ? ` · Section ${section}` : ''}`.trim();
          showToast(`${clash.name} is already the class teacher of ${label}`, 'error');
          return;
        }
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
            updates: { ...teacherData },
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
          if (err instanceof ConcurrentEditError) { showToast(err.message, 'error'); fetchData(); return; }
          throw err;
        }
        setIsModalOpen(false);
        fetchData();
        resetForm();
        return;
      }

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
      photoURL: '',
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
      photoURL: teacher.photoURL || '',
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
      await logActivity(user, 'DELETE_TEACHER', 'Super Admin', `Deleted teacher record for ${teacher?.name || deletingId}`);
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
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="eyebrow">{filteredTeachers.length} teachers</div>
          <h1>Teachers</h1>
        </div>
        {!readOnly && (
          <button className="btn accent" style={{ width: 'auto', padding: '10px 16px', fontSize: 13 }}
            onClick={() => { resetForm(); setIsModalOpen(true); }}>
            <Plus size={15} /> Add Teacher
          </button>
        )}
      </div>

      <div className="pad stack" style={{ paddingBottom: 32 }}>
        {/* Search */}
        <div className="card flex" style={{ gap: 10, padding: '10px 14px', alignItems: 'center' }}>
          <Search size={16} className="muted" style={{ flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search teachers by name or email…"
            style={{ border: 0, outline: 'none', background: 'transparent', flex: 1, fontSize: 14, fontFamily: 'var(--body)', color: 'var(--ink)' }}
          />
        </div>

        {filteredTeachers.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <GraduationCap size={36} style={{ margin: '0 auto 12px', color: 'var(--ink-3)' }} />
            <p style={{ fontWeight: 700, marginBottom: 4 }}>No teachers found</p>
            <p className="muted tiny">Add your first faculty member to get started.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards — hidden on lg+ */}
            <div className="stack lg:hidden">
              {filteredTeachers.map(teacher => (
                <div key={teacher.id} className="card flex" style={{ gap: 12, alignItems: 'flex-start' }}>
                  {/* Avatar */}
                  {teacher.photoURL ? (
                    <img src={teacher.photoURL} alt={teacher.name}
                      style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div className="avatar" style={{ width: 42, height: 42, fontSize: 15, flexShrink: 0 }}>
                      {getInitials(teacher.name)}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{teacher.name}</p>
                    {teacher.classTeacherOf?.classId && (
                      <span className="chip" style={{ fontSize: 10, padding: '2px 8px', marginBottom: 4 }}>Class Teacher</span>
                    )}
                    {teacher.houseInchargeId && (
                      <span className="chip" style={{ fontSize: 10, padding: '2px 8px', marginBottom: 4, marginLeft: 4 }}>House Incharge</span>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {teacher.subjects?.slice(0, 2).map(subId => {
                        const sub = subjects.find(s => s.id === subId);
                        return sub ? <span key={subId} className="chip solid" style={{ fontSize: 10, padding: '2px 8px' }}>{sub.name}</span> : null;
                      })}
                      {(teacher.subjects?.length ?? 0) > 2 && (
                        <span className="chip" style={{ fontSize: 10, padding: '2px 8px' }}>+{(teacher.subjects?.length ?? 0) - 2}</span>
                      )}
                    </div>
                    {teacher.phone && (
                      <p className="muted tiny" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={11} /> {teacher.phone}
                      </p>
                    )}
                  </div>
                  {!readOnly && (
                    <button className="icon-btn" onClick={() => handleEdit(teacher)} style={{ flexShrink: 0 }}>
                      <Edit2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table — hidden below lg */}
            <div className="hidden lg:block" style={{ overflowX: 'auto' }}>
              <div className="card flush">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      {['Teacher', 'Subjects', 'Phone', 'Role', ''].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11,
                          textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeachers.map(teacher => (
                      <tr key={teacher.id} style={{ borderBottom: '1px solid var(--line-2)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {teacher.photoURL ? (
                              <img src={teacher.photoURL} alt={teacher.name}
                                style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>
                                {getInitials(teacher.name)}
                              </div>
                            )}
                            <div>
                              <p style={{ fontWeight: 700, marginBottom: 2 }}>{teacher.name}</p>
                              <p className="muted tiny">{teacher.email}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {teacher.subjects?.slice(0, 2).map(subId => {
                              const sub = subjects.find(s => s.id === subId);
                              return sub ? <span key={subId} className="chip" style={{ fontSize: 11, padding: '2px 8px' }}>{sub.name}</span> : null;
                            })}
                            {(teacher.subjects?.length ?? 0) > 2 && (
                              <span className="chip" style={{ fontSize: 11, padding: '2px 8px' }}>+{(teacher.subjects?.length ?? 0) - 2}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <p className="muted tiny">{teacher.phone || '—'}</p>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {teacher.classTeacherOf?.classId && (
                              <span className="chip solid" style={{ fontSize: 10, padding: '2px 8px' }}>Class Teacher</span>
                            )}
                            {teacher.houseInchargeId && (
                              <span className="chip" style={{ fontSize: 10, padding: '2px 8px' }}>House Incharge</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {!readOnly && (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="icon-btn" onClick={() => handleEdit(teacher)}><Edit2 size={14} /></button>
                              <button className="icon-btn" onClick={() => handleDelete(teacher.id)}
                                style={{ color: 'var(--coral)' }}><Trash2 size={14} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={performDelete}
        title="Delete Teacher?"
        message="This action cannot be undone. This teacher will be removed from the system."
        loading={loading}
      />

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
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
                  <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {formData.photoURL
                      ? <img src={formData.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: 'var(--cream)', fontWeight: 700, fontSize: 22 }}>{getInitials(formData.name || 'T')}</span>
                    }
                  </div>
                  <label style={{ position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, background: 'white', border: '1px solid var(--line)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Plus size={12} />
                    <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                  </label>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Teacher Photo</p>
                  <p className="text-[10px] text-slate-400">Click the + to upload</p>
                </div>
              </div>

              <FormField label="Employee ID" required hint="e.g. TCH001 — shown on payslips">
                <Input required placeholder="TCH001" value={formData.employeeId}
                  onChange={e => setFormData({ ...formData, employeeId: e.target.value.toUpperCase() })} />
              </FormField>
              <FormField label="Full Name" required>
                <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </FormField>
              <FormField label="Email Address" required>
                <Input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </FormField>
              <FormField label="Phone Number" required hint="Used for WhatsApp salary notifications">
                <Input type="tel" required placeholder="10-digit mobile number" value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
              </FormField>
              <FormField label="Monthly Salary" required>
                <Input type="number" required value={formData.salaryStructure}
                  onChange={e => setFormData({ ...formData, salaryStructure: e.target.value })} />
              </FormField>
              <FormField label="Joining Date" required>
                <Input type="date" required value={formData.joiningDetails}
                  onChange={e => setFormData({ ...formData, joiningDetails: e.target.value })} />
              </FormField>
            </div>

            <div className="space-y-4">
              <p className="eyebrow" style={{ paddingBottom: 4 }}>Academic Assignments</p>
              <FormField label="Subjects Taught">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, background: 'var(--cream-2)', borderRadius: 12, border: '1px solid var(--line)', minHeight: 52 }}>
                  {subjects.map(subject => (
                    <button key={subject.id} type="button"
                      onClick={() => {
                        const ns = formData.subjects.includes(subject.id)
                          ? formData.subjects.filter(id => id !== subject.id)
                          : [...formData.subjects, subject.id];
                        setFormData({ ...formData, subjects: ns });
                      }}
                      className="chip"
                      style={formData.subjects.includes(subject.id)
                        ? { background: 'var(--ink)', color: 'var(--cream)', fontSize: 12, padding: '3px 10px' }
                        : { fontSize: 12, padding: '3px 10px' }}
                    >{subject.name}</button>
                  ))}
                </div>
              </FormField>
              <FormField label="Assigned Classes">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, background: 'var(--cream-2)', borderRadius: 12, border: '1px solid var(--line)', minHeight: 52 }}>
                  {classes.map(cls => (
                    <button key={cls.id} type="button"
                      onClick={() => {
                        const nc = formData.classes.includes(cls.id)
                          ? formData.classes.filter(id => id !== cls.id)
                          : [...formData.classes, cls.id];
                        setFormData({ ...formData, classes: nc });
                      }}
                      className="chip"
                      style={formData.classes.includes(cls.id)
                        ? { background: 'var(--ink)', color: 'var(--cream)', fontSize: 12, padding: '3px 10px' }
                        : { fontSize: 12, padding: '3px 10px' }}
                    >Class {cls.name}</button>
                  ))}
                </div>
              </FormField>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* House Incharge toggle */}
                <label className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={16} style={{ color: 'var(--ink-3)' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>House Incharge</span>
                  </div>
                  <input type="checkbox" checked={formData.isHouseIncharge}
                    onChange={e => setFormData({ ...formData, isHouseIncharge: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: 'var(--ink)', cursor: 'pointer' }} />
                </label>
                {formData.isHouseIncharge && (
                  <select
                    value={formData.houseInchargeId}
                    onChange={e => setFormData({ ...formData, houseInchargeId: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }}
                  >
                    <option value="">Select House</option>
                    {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                )}

                {/* Class Teacher toggle */}
                <label className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GraduationCap size={16} style={{ color: 'var(--ink-3)' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Class Teacher</span>
                  </div>
                  <input type="checkbox" checked={formData.isClassTeacher}
                    onChange={e => setFormData({ ...formData, isClassTeacher: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: 'var(--ink)', cursor: 'pointer' }} />
                </label>

                {formData.isClassTeacher && (() => {
                  const selectedClass = classes.find(c => c.id === formData.classTeacherOf.classId);
                  const namedSections = (selectedClass?.sections ?? []).filter(s => s.name);
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: (formData.classTeacherOf.classId && namedSections.length > 0) ? '1fr 1fr' : '1fr', gap: 8 }}>
                      {/* Class picker */}
                      <select
                        value={formData.classTeacherOf.classId}
                        onChange={e => setFormData({ ...formData, classTeacherOf: { classId: e.target.value, section: '' } })}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }}
                      >
                        <option value="">Select Class</option>
                        {classes.map(c => <option key={c.id} value={c.id}>Class {c.name}</option>)}
                      </select>

                      {/* Section picker — only shown when class has named sections */}
                      {formData.classTeacherOf.classId && namedSections.length > 0 && (
                        <select
                          value={formData.classTeacherOf.section}
                          onChange={e => setFormData({ ...formData, classTeacherOf: { ...formData.classTeacherOf, section: e.target.value } })}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }}
                        >
                          <option value="">Select Section</option>
                          {namedSections.map(sec => (
                            <option key={sec.name} value={sec.name}>Section {sec.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
