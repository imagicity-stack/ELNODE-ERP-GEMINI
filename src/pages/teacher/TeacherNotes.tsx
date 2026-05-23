import { UserProfile, Teacher, Subject, Class } from '../../types';
import { FileText, Plus, Trash2, Download, Upload, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, orderBy, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import {
  Spinner,
  Modal,
  ConfirmModal,
  FormField,
  Input,
  Select,
  Textarea,
  Button,
} from '../../components/ui';

interface StudyMaterial {
  id: string;
  title: string;
  description?: string;
  subjectId: string;
  classId: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: string;
  teacherId: string;
  storagePath?: string;
  createdAt: string;
}

interface TeacherNotesProps {
  user: UserProfile;
}

export default function TeacherNotes({ user }: TeacherNotesProps) {
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeSubject, setActiveSubject] = useState<string>('all');
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subjectId: '',
    classId: '',
    file: null as File | null,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const teacherId = user.teacherId || user.uid;

      const tDoc = await getDoc(doc(db, 'teachers', teacherId));
      if (tDoc.exists()) {
        const t = { id: tDoc.id, ...tDoc.data() } as Teacher;
        setTeacherData(t);
        setFormData(prev => ({
          ...prev,
          classId: t.classes?.[0] || '',
          subjectId: t.subjects?.[0] || ''
        }));
      }

      const q = query(
        collection(db, 'studyMaterials'),
        where('teacherId', '==', teacherId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as StudyMaterial)));

      const [subSnap, classSnap] = await Promise.all([
        getDocs(collection(db, 'subjects')),
        getDocs(collection(db, 'classes'))
      ]);
      setSubjects(subSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
      setClasses(classSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));

    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'studyMaterials');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file) {
      showToast('Please select a file to upload', 'error');
      return;
    }

    try {
      const file = formData.file;
      const teacherId = user.teacherId || user.uid;
      const timestamp = new Date().getTime();
      const storagePath = `studyMaterials/${teacherId}/${timestamp}_${file.name}`;
      const storageRef = ref(storage, storagePath);

      const uploadResult = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      const materialData = {
        title: formData.title,
        description: formData.description,
        subjectId: formData.subjectId,
        classId: formData.classId,
        teacherId: teacherId,
        fileName: file.name,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        fileType: file.type.split('/')[1]?.toUpperCase() || 'FILE',
        fileUrl: downloadUrl,
        storagePath: storagePath,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'studyMaterials'), materialData);

      const className = classes.find(c => c.id === formData.classId)?.name || formData.classId;
      logActivity(
        user,
        'Study Material Uploaded',
        'Teachers',
        `Uploaded "${formData.title}" for Class ${className}`,
        { classId: formData.classId, subject: formData.subjectId, fileName: file.name }
      );

      showToast('Material uploaded successfully', 'success');
      setIsModalOpen(false);
      setFormData({
        title: '',
        description: '',
        subjectId: teacherData?.subjects?.[0] || '',
        classId: teacherData?.classes?.[0] || '',
        file: null
      });
      fetchData();
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Failed to upload material', 'error');
    }
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      const material = materials.find(m => m.id === deletingId);

      await deleteDoc(doc(db, 'studyMaterials', deletingId));

      if (material?.storagePath) {
        const storageRef = ref(storage, material.storagePath);
        await deleteObject(storageRef).catch(err => console.error('Error deleting from storage:', err));
      }

      logActivity(
        user,
        'Study Material Deleted',
        'Teachers',
        `Deleted study material "${material?.title || deletingId}"`,
        { materialId: deletingId }
      );

      showToast('Material deleted successfully', 'success');
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `studyMaterials/${deletingId}`);
    } finally {
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    }
  };

  const uniqueSubjectIds = Array.from(new Set(materials.map(m => m.subjectId)));

  const filteredMaterials = materials.filter(m => {
    const matchesSearch = m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.description?.toLowerCase().includes(search.toLowerCase());
    const matchesSubject = activeSubject === 'all' || m.subjectId === activeSubject;
    return matchesSearch && matchesSubject;
  });

  return (
    <>
      <div className="topbar">
        <div className="pad">
          <p className="eyebrow">{materials.length} file{materials.length !== 1 ? 's' : ''}</p>
          <h1 className="display">Materials</h1>
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: '2rem' }}>
        <div className="stack">
          {/* Search */}
          <div className="card" style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search materials..."
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.875rem',
                color: 'var(--ink)',
              }}
            />
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn accent"
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', flexShrink: 0 }}
            >
              <Upload className="w-3.5 h-3.5" />
              <span style={{ fontSize: '0.8125rem' }}>Upload</span>
            </button>
          </div>

          {/* Subject filter chips */}
          {uniqueSubjectIds.length > 0 && (
            <div className="hscroll" style={{ gap: '0.5rem', paddingBottom: '0.25rem' }}>
              <button
                onClick={() => setActiveSubject('all')}
                className={`chip ${activeSubject === 'all' ? 'solid' : ''}`}
                style={{ flexShrink: 0 }}
              >
                All
              </button>
              {uniqueSubjectIds.map((subId) => {
                const sub = subjects.find(s => s.id === subId);
                return (
                  <button
                    key={subId}
                    onClick={() => setActiveSubject(subId)}
                    className={`chip ${activeSubject === subId ? 'solid' : ''}`}
                    style={{ flexShrink: 0 }}
                  >
                    {sub?.name || subId}
                  </button>
                );
              })}
            </div>
          )}

          {/* Material cards */}
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : filteredMaterials.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ink-3)' }} />
              <p style={{ fontWeight: 700, color: 'var(--ink)' }}>No materials uploaded</p>
              <p className="muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                Use the Upload button to share resources with your classes.
              </p>
            </div>
          ) : (
            <div className="stack" style={{ gap: '0.5rem' }}>
              {filteredMaterials.map((item) => (
                <div
                  key={item.id}
                  className="card"
                  style={{ padding: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '0.75rem',
                      background: 'var(--cream-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <FileText className="w-5 h-5" style={{ color: 'var(--ink)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </p>
                    <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>
                      Class {item.classId} · {subjects.find(s => s.id === item.subjectId)?.name || item.subjectId}
                    </p>
                    {item.description && (
                      <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {item.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.625rem' }}>
                      <span className="chip" style={{ fontSize: '0.65rem' }}>{item.fileType}</span>
                      <span className="muted mono tiny">{item.fileSize}</span>
                      <div style={{ flex: 1 }} />
                      <a
                        href={item.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="icon-btn"
                        style={{ color: 'var(--ink)' }}
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="icon-btn"
                        style={{ color: 'var(--coral)' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Upload Study Material"
        subtitle="Share PDFs, Documents or Images with your classes."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="upload-form" icon={Upload}>Upload</Button>
          </div>
        }
      >
        <form id="upload-form" onSubmit={handleUpload} className="space-y-4">
          <FormField label="Material Title" required>
            <Input
              required
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Chapter 4: Photosynthesis Notes"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Target Class" required>
              <Select
                required
                value={formData.classId}
                onChange={e => setFormData({ ...formData, classId: e.target.value })}
              >
                <option value="">Select Class</option>
                {teacherData?.classes?.map(cls => (
                  <option key={cls} value={cls}>Class {cls}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Subject" required>
              <Select
                required
                value={formData.subjectId}
                onChange={e => setFormData({ ...formData, subjectId: e.target.value })}
              >
                <option value="">Select Subject</option>
                {teacherData?.subjects?.map(subId => {
                  const sub = subjects.find(s => s.id === subId);
                  return <option key={subId} value={subId}>{sub?.name || subId}</option>;
                })}
              </Select>
            </FormField>
          </div>

          <FormField label="Description">
            <Textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Briefly describe what this material covers..."
            />
          </FormField>

          <FormField label="File Upload" required>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-200 border-dashed rounded-xl hover:border-emerald-400 hover:bg-emerald-50/50 transition-all cursor-pointer relative">
              <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={e => setFormData({ ...formData, file: e.target.files?.[0] || null })}
              />
              <div className="space-y-1 text-center">
                {formData.file ? (
                  <div className="flex flex-col items-center">
                    <FileText className="mx-auto h-12 w-12 text-emerald-500" />
                    <p className="text-sm font-bold text-slate-900 mt-2">{formData.file.name}</p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFormData({ ...formData, file: null }); }}
                      className="text-xs text-red-500 font-medium mt-1 flex items-center gap-1 hover:underline"
                    >
                      <X className="w-3 h-3" /> Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-12 w-12 text-slate-400" />
                    <div className="flex text-sm text-slate-600">
                      <span className="relative cursor-pointer bg-white rounded-md font-bold text-emerald-600 hover:text-emerald-500">
                        Upload a file
                      </span>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-slate-500">PDF, DOCX, PNG, JPG up to 10MB</p>
                  </>
                )}
              </div>
            </div>
          </FormField>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Material?"
        message="Are you sure you want to delete this study material? This action cannot be undone."
      />
    </>
  );
}
