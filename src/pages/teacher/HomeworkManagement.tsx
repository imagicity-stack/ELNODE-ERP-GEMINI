import { UserProfile, Teacher, Homework } from '../../types';
import { Plus, FileText, Upload, File, X, Download, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import { cn } from '../../lib/utils';
import { useData } from '../../contexts/DataContext';
import { nameFrom } from '../../lib/displayNames';
import {
  Modal,
  FormField,
  Input,
  Select,
  Textarea,
  Button,
  Spinner,
} from '../../components/ui';

interface HomeworkManagementProps {
  user: UserProfile;
}

export default function HomeworkManagement({ user }: HomeworkManagementProps) {
  const { classesMap, subjectsMap } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [homework, setHomework] = useState<Homework[]>([]);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [expandedSubs, setExpandedSubs] = useState<string | null>(null);
  const { showToast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    classId: '',
    subjectId: '',
    dueDate: '',
    content: ''
  });
  const [attachment, setAttachment] = useState<File | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Teacher Profile
        const teacherIdForFetch = user.teacherId || user.uid;
        const teacherDoc = await getDoc(doc(db, 'teachers', teacherIdForFetch));
        if (teacherDoc.exists()) {
          const tData = { id: teacherDoc.id, ...teacherDoc.data() } as Teacher;
          setTeacherData(tData);
          setFormData(prev => ({
            ...prev,
            classId: tData.classes?.[0] || '',
            subjectId: tData.subjects?.[0] || ''
          }));
        }

        // Fetch Homework
        const homeworkSnap = await getDocs(query(
          collection(db, 'homework'),
          where('teacherId', '==', teacherIdForFetch),
          orderBy('dueDate', 'desc')
        ));
        setHomework(homeworkSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Homework)));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'homework');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.uid, user.teacherId]);

  const uploadFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.size > 2 * 1024 * 1024) {
        reject(new Error('File size exceeds 2MB limit.'));
        return;
      }

      const path = `homework/${Date.now()}_${file.name}`;
      const fileRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => reject(error),
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setUploadProgress(0);

    try {
      let attachmentUrl = '';
      let attachmentName = '';

      if (attachment) {
        try {
          attachmentUrl = await uploadFile(attachment);
          attachmentName = attachment.name;
        } catch (uploadErr: any) {
          console.error("Homework upload failed:", uploadErr);
          throw new Error(`Attachment upload failed: ${uploadErr.message}`);
        }
      }

      const payload = {
        ...formData,
        teacherId: user.teacherId || user.uid,
        submissions: [],
        createdAt: serverTimestamp(),
        attachmentUrl,
        attachmentName
      };

      const docRef = await addDoc(collection(db, 'homework'), payload);

      const newHw = {
        id: docRef.id,
        ...formData,
        teacherId: user.teacherId || user.uid,
        submissions: [],
        attachmentUrl,
        attachmentName
      } as Homework;

      setHomework(prev => [newHw, ...prev]);
      setIsModalOpen(false);

      // Log activity
      logActivity(
        user,
        'Homework Assigned',
        'Teachers',
        `Assigned homework to Class ${nameFrom(classesMap, formData.classId)} for ${nameFrom(subjectsMap, formData.subjectId)}`,
        {
          classId: formData.classId,
          subjectId: formData.subjectId,
          homeworkId: docRef.id
        }
      );

      setFormData({
        title: '',
        classId: teacherData?.classes?.[0] || '',
        subjectId: teacherData?.subjects?.[0] || '',
        dueDate: '',
        content: ''
      });
      setAttachment(null);
      showToast('Homework assigned successfully!', 'success');
    } catch (err: any) {
      if (err.message?.includes('File size')) {
        showToast(err.message, 'error');
      } else {
        handleFirestoreError(err, OperationType.WRITE, 'homework');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Filter chips: All + each unique subject
  const subjects = ['All', ...Array.from(new Set(homework.map(hw => hw.subjectId).filter(Boolean)))];

  const filteredHomework = activeFilter === 'All'
    ? homework
    : homework.filter(hw => hw.subjectId === activeFilter);

  const assignmentCount = filteredHomework.length;

  return (
    <>
      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div className="topbar">
        <div>
          <div className="eyebrow">{assignmentCount} assignment{assignmentCount !== 1 ? 's' : ''}</div>
          <h1>Homework</h1>
        </div>
        <div>
          <button className="btn accent" onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Assign
          </button>
        </div>
      </div>

      {/* ── Subject / class filter chips ───────────────────────────────────── */}
      <div className="hscroll" style={{ paddingBottom: '2px' }}>
        {subjects.map(sub => (
          <button
            key={sub}
            className={cn('chip', activeFilter === sub && 'solid')}
            onClick={() => setActiveFilter(sub)}
          >
            {sub === 'All' ? 'All' : nameFrom(subjectsMap, sub)}
          </button>
        ))}
      </div>

      {/* ── Homework cards ─────────────────────────────────────────────────── */}
      <div className="pad">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <Spinner />
          </div>
        ) : filteredHomework.length === 0 ? (
          <div className="stack" style={{ alignItems: 'center', padding: '3rem 0', gap: '0.5rem' }}>
            <FileText className="w-10 h-10 muted" />
            <p className="muted" style={{ fontWeight: 600 }}>No homework assignments</p>
            <p className="tiny muted">Click <strong>Assign</strong> to add one</p>
          </div>
        ) : (
          <div className="stack">
            {filteredHomework.map((hw) => {
              const isActive = new Date(hw.dueDate) >= new Date();
              const subExpanded = expandedSubs === hw.id;
              return (
                <div key={hw.id} className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Card header row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    {/* Subject chip */}
                    <span className="chip solid" style={{ flexShrink: 0, fontSize: '0.7rem' }}>
                      {nameFrom(subjectsMap, hw.subjectId)}
                    </span>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3 }}>{hw.content}</p>
                      <p className="tiny muted" style={{ marginTop: '0.15rem' }}>
                        Class {nameFrom(classesMap, hw.classId)}
                      </p>
                    </div>

                    {/* Status indicator */}
                    <span
                      className={cn('chip', isActive ? '' : 'solid')}
                      style={{
                        flexShrink: 0,
                        fontSize: '0.65rem',
                        background: isActive ? 'var(--cream-2)' : 'var(--leaf)',
                        color: isActive ? 'var(--ink)' : '#fff',
                      }}
                    >
                      {isActive ? 'Active' : 'Done'}
                    </span>
                  </div>

                  {/* Footer row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Due date */}
                    <span className="mono tiny" style={{ color: 'var(--accent)' }}>
                      Due {new Date(hw.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>

                    {/* Submissions count */}
                    <button
                      className="tiny"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        color: 'var(--accent)',
                        fontWeight: 600,
                        textDecoration: 'underline',
                      }}
                      onClick={() => setExpandedSubs(subExpanded ? null : hw.id)}
                    >
                      {hw.submissions?.length || 0} submitted
                    </button>

                    {/* Spacer */}
                    <span style={{ flex: 1 }} />

                    {/* Attachment download */}
                    {hw.attachmentUrl && (
                      <a
                        href={hw.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="icon-btn"
                        title="Download attachment"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </div>

                  {/* Submissions expand panel */}
                  {subExpanded && (
                    <div
                      style={{
                        borderTop: '1px solid var(--line)',
                        paddingTop: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                      }}
                    >
                      <p className="tiny" style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                        Submissions ({hw.submissions?.length || 0})
                      </p>
                      {hw.submissions?.length ? (
                        hw.submissions.map((sub: any, idx: number) => (
                          <div
                            key={idx}
                            className="card"
                            style={{
                              padding: '0.5rem 0.75rem',
                              background: 'var(--cream-2)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.15rem',
                            }}
                          >
                            <p style={{ fontWeight: 600, fontSize: '0.8rem' }}>{sub.studentName || `Student ${idx + 1}`}</p>
                            {sub.text && <p className="tiny muted">{sub.text}</p>}
                          </div>
                        ))
                      ) : (
                        <p className="tiny muted">No submissions yet.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Assign Homework Modal ───────────────────────────────────────────── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Assign Homework"
        subtitle="Create a new homework assignment for your class."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="homework-form" loading={submitting}>
              {submitting ? 'Assigning...' : 'Assign'}
            </Button>
          </div>
        }
      >
        <form id="homework-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Class" required>
              <Select
                value={formData.classId}
                onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
              >
                {teacherData?.classes?.map(cls => (
                  <option key={cls} value={cls}>{nameFrom(classesMap, cls)}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Subject" required>
              <Select
                value={formData.subjectId}
                onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
              >
                {teacherData?.subjects?.map(sub => (
                  <option key={sub} value={sub}>{nameFrom(subjectsMap, sub)}</option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Due Date" required>
            <Input
              type="date"
              required
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
            />
          </FormField>
          <FormField label="Instructions / Content" required>
            <Textarea
              rows={3}
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Describe the homework assignment..."
            />
          </FormField>
          <FormField label="Attachment (Optional)">
            <div className="relative">
              <input
                type="file"
                id="homework-attachment"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
              />
              <label
                htmlFor="homework-attachment"
                className={cn(
                  "flex flex-col gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                  attachment ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-2">
                  {attachment ? (
                    <>
                      <File className="w-4 h-4" />
                      <span className="text-xs font-medium flex-1 truncate">{attachment.name}</span>
                      <X className="w-4 h-4 text-slate-400 hover:text-rose-500" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAttachment(null); }} />
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-medium text-slate-500">Click to upload (Max 2MB)</span>
                    </>
                  )}
                </div>
                {((uploadProgress > 0 && uploadProgress < 100) || (submitting && attachment)) && (
                  <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-300",
                        uploadProgress === 100 ? "bg-emerald-500" : "bg-blue-500"
                      )}
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                )}
              </label>
            </div>
          </FormField>
        </form>
      </Modal>
    </>
  );
}
