import { UserProfile, Teacher, Subject, Class } from '../../types';
import { FileText, Plus, Trash2, BookOpen, Clock, Download, Upload, MoreVertical, X, File } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, orderBy, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  IconButton,
  Modal,
  ConfirmModal,
  SearchInput,
  FormField,
  Input,
  Select,
  Textarea,
  EmptyState,
  Spinner,
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
      
      // Fetch teacher metadata
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

      // Fetch study materials for this teacher
      const q = query(
        collection(db, 'studyMaterials'),
        where('teacherId', '==', teacherId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as StudyMaterial)));

      // Fetch subjects and classes for names
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

      // Upload to Firebase Storage
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
        storagePath: storagePath, // Store path for easy deletion
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
      
      // 1. Delete from Firestore
      await deleteDoc(doc(db, 'studyMaterials', deletingId));
      
      // 2. Delete from Storage if storagePath exists
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

  const filteredMaterials = materials.filter(m => 
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Study Materials</p>
          <h1 className="text-xl font-bold mt-0.5">{materials.length} File{materials.length !== 1 ? 's' : ''}</h1>
          <p className="text-xs text-emerald-100 mt-1">Notes & resources for your classes</p>
        </div>

        <div className="px-4 mt-3 mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials..."
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-emerald-400"
          />
        </div>

        <div className="px-4 space-y-2">
          {loading ? (
            <div className="py-10 flex justify-center"><Spinner /></div>
          ) : filteredMaterials.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No materials uploaded</p>
              <p className="text-xs text-slate-500 mt-1">Tap the + button to upload</p>
            </div>
          ) : (
            filteredMaterials.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 line-clamp-1">{item.title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Class {item.classId} · {subjects.find(s => s.id === item.subjectId)?.name || item.subjectId}
                    </p>
                    {item.description && (
                      <p className="text-[11px] text-slate-600 line-clamp-2 mt-1">{item.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <Badge variant="info" className="text-[9px]">{item.fileType}</Badge>
                    <span className="text-[10px] text-slate-400">{item.fileSize}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> Open
                    </a>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 rounded-lg bg-red-50 text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* FAB */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Study Materials"
        subtitle="Manage and share educational resources with your students."
        icon={BookOpen}
        iconColor="gradient-emerald"
        actions={
          <Button icon={Plus} onClick={() => setIsModalOpen(true)}>
            Upload Material
          </Button>
        }
      />

      <div className="flex items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search materials..."
          className="max-w-md"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : filteredMaterials.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No materials uploaded"
          description="Click the button above to upload your first study material."
          action={
            <Button icon={Plus} size="sm" onClick={() => setIsModalOpen(true)}>
              Upload Now
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMaterials.map((item) => (
            <Card key={item.id} hover className="group">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl gradient-emerald flex items-center justify-center text-white">
                  <FileText className="w-6 h-6" />
                </div>
                <IconButton 
                  icon={Trash2} 
                  variant="ghost" 
                  size="sm" 
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => handleDelete(item.id)}
                />
              </div>
              
              <h4 className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors mb-1">
                {item.title}
              </h4>
              <p className="text-xs text-slate-500 mb-2">
                Class {item.classId} • {subjects.find(s => s.id === item.subjectId)?.name || item.subjectId}
              </p>
              
              {item.description && (
                <p className="text-sm text-slate-600 line-clamp-2 mb-4">
                  {item.description}
                </p>
              )}

              <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="info">{item.fileType}</Badge>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {item.fileSize}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <Clock className="w-3 h-3" />
                  {new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      </div>

      {/* Upload Modal — shared by mobile + desktop */}
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
                    <p className="text-xs text-slate-500">
                      PDF, DOCX, PNG, JPG up to 10MB
                    </p>
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
