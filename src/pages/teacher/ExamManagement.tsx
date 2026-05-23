import { UserProfile, Exam, ExamResult, Student, Subject, GradingScale, Teacher } from '../../types';
import { Plus, FileText, Trash2, AlertTriangle } from 'lucide-react';
import { validateExamSchedule, findExamConflicts, ExamConflict, ValidationIssue } from '../../services/examService';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import {
  Spinner,
  Badge,
  Button,
  Modal,
  ConfirmModal,
  FormField,
  Input,
  Select,
  Textarea,
} from '../../components/ui';

interface ExamManagementProps {
  user: UserProfile;
}

export default function ExamManagement({ user }: ExamManagementProps) {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [conflicts, setConflicts] = useState<ExamConflict[]>([]);
  const [overrideConflicts, setOverrideConflicts] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const [newExam, setNewExam] = useState({
    name: '',
    classIds: [] as string[],
    subjectId: '',
    startDate: '',
    endDate: '',
    maxMarks: 100,
    term: 'Term 1',
    status: 'scheduled' as const,
    gradingScaleId: '',
    type: 'scheduled' as 'scheduled' | 'surprise' | 'internal' | 'practical',
    syllabusText: '',
    syllabusPhoto: null as File | null,
    topic: '',
    startTime: '',
    room: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const teacherIdForFetch = user.teacherId || user.uid;
      const teacherDoc = await getDoc(doc(db, 'teachers', teacherIdForFetch));
      if (teacherDoc.exists()) {
        const tData = { id: teacherDoc.id, ...teacherDoc.data() } as Teacher;
        setTeacherData(tData);
        setNewExam(prev => ({
          ...prev,
          classIds: tData.classes && tData.classes.length > 0 ? [tData.classes[0]] : [],
          subjectId: tData.subjects && tData.subjects.length > 0 ? tData.subjects[0] : ''
        }));
      }

      const examsSnap = await getDocs(query(collection(db, 'exams'), orderBy('startDate', 'desc')));
      const subjectsSnap = await getDocs(collection(db, 'subjects'));
      const scalesSnap = await getDocs(collection(db, 'gradingScales'));

      setExams(examsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)));
      setSubjects(subjectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject)));
      const scales = scalesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GradingScale));
      setGradingScales(scales);

      if (scales.length > 0) {
        setNewExam(prev => ({ ...prev, gradingScaleId: scales[0].id }));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'exams/subjects/gradingScales');
    }
    setLoading(false);
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  };

  const performDelete = async () => {
    if (!deletingId) return;
    try {
      const examToDelete = exams.find(e => e.id === deletingId);
      if (examToDelete?.syllabus?.storagePath) {
        try {
          const photoRef = ref(storage, examToDelete.syllabus.storagePath);
          await deleteObject(photoRef);
        } catch (storageErr) {
          console.error('Error deleting syllabus photo:', storageErr);
        }
      }

      await deleteDoc(doc(db, 'exams', deletingId));
      fetchData();
      showToast('Exam deleted successfully', 'success');
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `exams/${deletingId}`);
    }
  };

  const handleScheduleExam = async (e: React.FormEvent) => {
    e.preventDefault();

    const issues = validateExamSchedule({
      startDate: newExam.startDate,
      endDate: newExam.endDate || newExam.startDate,
      startTime: newExam.startTime,
      room: newExam.room,
      classIds: newExam.classIds,
    });
    setValidationIssues(issues);
    const blockingErrors = issues.filter(i => i.level === 'error');
    if (blockingErrors.length > 0) {
      showToast(blockingErrors[0].message, 'error');
      return;
    }

    if (!overrideConflicts) {
      setCheckingConflicts(true);
      try {
        const found = await findExamConflicts({
          startDate: newExam.startDate,
          endDate: newExam.endDate || newExam.startDate,
          startTime: newExam.startTime,
          room: newExam.room,
          classIds: newExam.classIds,
        });
        setConflicts(found);
        if (found.length > 0) {
          showToast(`${found.length} scheduling conflict(s) detected — review and override to proceed`, 'error');
          setCheckingConflicts(false);
          return;
        }
      } catch (err) {
        console.warn('Conflict check failed:', err);
      } finally {
        setCheckingConflicts(false);
      }
    }

    try {
      let syllabusPhotoUrl = '';
      let storagePath = '';
      if (newExam.syllabusPhoto) {
        const timestamp = new Date().getTime();
        storagePath = `exams/syllabus/${user.uid}/${timestamp}_${newExam.syllabusPhoto.name}`;
        const storageRef = ref(storage, storagePath);

        const uploadResult = await uploadBytes(storageRef, newExam.syllabusPhoto);
        syllabusPhotoUrl = await getDownloadURL(uploadResult.ref);
      }

      const examDocRef = await addDoc(collection(db, 'exams'), {
        name: newExam.name,
        term: newExam.term,
        startDate: newExam.startDate || new Date().toISOString().split('T')[0],
        endDate: newExam.endDate || newExam.startDate || new Date().toISOString().split('T')[0],
        classIds: newExam.classIds,
        subjectId: newExam.subjectId,
        maxMarks: newExam.maxMarks,
        gradingScaleId: newExam.gradingScaleId,
        type: newExam.type,
        status: 'scheduled',
        syllabus: (newExam.type === 'scheduled' || newExam.type === 'internal' || newExam.type === 'practical') ? {
          text: newExam.syllabusText,
          photoUrl: syllabusPhotoUrl,
          storagePath: storagePath || undefined
        } : undefined,
        topic: newExam.type === 'surprise' ? newExam.topic : undefined,
        startTime: newExam.startTime,
        room: newExam.room,
        createdAt: new Date().toISOString(),
        createdBy: user.uid
      });
      const scheduledClassId = newExam.classIds[0] || '';
      const scheduledDate = newExam.startDate || new Date().toISOString().split('T')[0];
      logActivity(
        user,
        'Exam Scheduled',
        'Exam',
        `Scheduled exam "${newExam.name}" for Class ${scheduledClassId} on ${scheduledDate}`,
        { examId: examDocRef.id, classId: scheduledClassId, date: scheduledDate }
      );
      setIsModalOpen(false);
      setValidationIssues([]);
      setConflicts([]);
      setOverrideConflicts(false);
      showToast('Exam scheduled', 'success');
      fetchData();
      setNewExam({
        name: '',
        classIds: teacherData?.classes && teacherData.classes.length > 0 ? [teacherData.classes[0]] : [],
        subjectId: teacherData?.subjects && teacherData.subjects.length > 0 ? teacherData.subjects[0] : '',
        startDate: '',
        endDate: '',
        maxMarks: 100,
        term: 'Term 1',
        status: 'scheduled',
        gradingScaleId: gradingScales[0]?.id || '',
        type: 'scheduled',
        syllabusText: '',
        syllabusPhoto: null,
        topic: '',
        startTime: '',
        room: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'exams');
    }
  };

  const statusVariantMap: Record<string, string> = {
    scheduled: '#3B82F6',
    ongoing: '#F59E0B',
    completed: 'var(--leaf)',
    published: '#8B5CF6',
  };

  const statusFilters = ['all', 'scheduled', 'ongoing', 'completed', 'published'];

  const filteredExams = exams.filter(exam =>
    filterStatus === 'all' || exam.status === filterStatus
  );

  return (
    <>
      <div className="topbar">
        <div className="pad">
          <p className="eyebrow">{exams.length} total</p>
          <h1 className="display">Exams</h1>
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: '2rem' }}>
        <div className="stack">
          {/* Add button + stat strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.625rem' }}>
            <div className="card" style={{ padding: '0.875rem', textAlign: 'center' }}>
              <p className="t-num" style={{ fontSize: '1.5rem', color: '#3B82F6' }}>
                {exams.filter(e => e.status === 'scheduled').length}
              </p>
              <p className="eyebrow" style={{ marginTop: '0.25rem' }}>Upcoming</p>
            </div>
            <div className="card" style={{ padding: '0.875rem', textAlign: 'center' }}>
              <p className="t-num" style={{ fontSize: '1.5rem', color: 'var(--leaf)' }}>
                {exams.filter(e => e.status === 'completed').length}
              </p>
              <p className="eyebrow" style={{ marginTop: '0.25rem' }}>Done</p>
            </div>
            <div className="card" style={{ padding: '0.875rem', textAlign: 'center' }}>
              <p className="t-num" style={{ fontSize: '1.5rem', color: '#F59E0B' }}>
                {exams.filter(e => e.status === 'scheduled' && new Date(e.startDate) < new Date()).length}
              </p>
              <p className="eyebrow" style={{ marginTop: '0.25rem' }}>Pending</p>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="btn accent"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}
          >
            <Plus className="w-4 h-4" />
            Schedule Exam
          </button>

          {/* Status filter chips */}
          <div className="hscroll" style={{ gap: '0.5rem', paddingBottom: '0.25rem' }}>
            {statusFilters.map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`chip ${filterStatus === s ? 'solid' : ''}`}
                style={{ flexShrink: 0, textTransform: 'capitalize' }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Exam cards */}
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : filteredExams.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ink-3)' }} />
              <p style={{ fontWeight: 700, color: 'var(--ink)' }}>No exams found</p>
              <p className="muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                Schedule an exam using the button above.
              </p>
            </div>
          ) : (
            <div className="stack" style={{ gap: '0.5rem' }}>
              {filteredExams.map((exam) => (
                <div
                  key={exam.id}
                  className="card"
                  style={{
                    padding: '1rem',
                    borderLeft: `3px solid ${statusVariantMap[exam.status] || 'var(--line)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem', marginBottom: '0.75rem' }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '0.625rem',
                        background: 'var(--cream-2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.875rem',
                        fontWeight: 800,
                        color: 'var(--ink)',
                        flexShrink: 0,
                      }}
                    >
                      {exam.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {exam.name}
                      </p>
                      <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>
                        {subjects.find(s => s.id === exam.subjectId)?.name || exam.subjectId}
                        {' · '}
                        {new Date(exam.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                      <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>
                        Max {exam.maxMarks} marks
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        textTransform: 'capitalize',
                        padding: '0.25rem 0.625rem',
                        borderRadius: '2rem',
                        background: statusVariantMap[exam.status] || 'var(--cream-2)',
                        color: 'white',
                        flexShrink: 0,
                      }}
                    >
                      {exam.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => navigate(`/teacher/exams/${exam.id}/marks`)}
                      className="btn accent"
                      style={{ flex: 1, fontSize: '0.8125rem' }}
                    >
                      {exam.status === 'completed' ? 'Edit Results' : 'Enter Results'}
                    </button>
                    <button
                      onClick={() => handleDelete(exam.id)}
                      className="icon-btn"
                      style={{ color: 'var(--coral)', flexShrink: 0 }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setDeletingId(null); }}
        onConfirm={performDelete}
        title="Delete Exam?"
        message="This action cannot be undone. All results for this exam will also be affected."
        confirmLabel="Delete"
      />

      {/* Schedule Exam Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Schedule Exam"
        subtitle="Create a new exam for your class."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="exam-form">Schedule</Button>
          </div>
        }
      >
        <form id="exam-form" onSubmit={handleScheduleExam} className="space-y-5">
          {validationIssues.length > 0 && (
            <div className="space-y-1">
              {validationIssues.map((iss, i) => (
                <div key={i} className={cn(
                  'flex items-start gap-2 px-3 py-2 rounded-xl text-xs',
                  iss.level === 'error' ? 'bg-rose-50 border border-rose-200 text-rose-700' : 'bg-amber-50 border border-amber-200 text-amber-700',
                )}>
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{iss.message}</span>
                </div>
              ))}
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-rose-800">Scheduling conflict{conflicts.length !== 1 ? 's' : ''} detected</p>
                  <ul className="text-xs text-rose-700 mt-1 space-y-0.5">
                    {conflicts.map((c, i) => (
                      <li key={i}>• {c.detail}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-rose-800 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={overrideConflicts}
                  onChange={e => setOverrideConflicts(e.target.checked)}
                  className="rounded"
                />
                I understand — schedule anyway
              </label>
            </div>
          )}

          <div className="flex p-1 bg-slate-100 rounded-xl">
            {(['scheduled', 'surprise', 'internal', 'practical'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setNewExam({ ...newExam, type })}
                className={cn(
                  "flex-1 py-2 text-[10px] font-bold rounded-lg transition-all capitalize",
                  newExam.type === type ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {type}
              </button>
            ))}
          </div>

          <FormField label="Exam Name" required>
            <Input
              type="text"
              required
              value={newExam.name}
              onChange={e => setNewExam({ ...newExam, name: e.target.value })}
              placeholder="e.g. Mid-Term Examination"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Class" required>
              <Select
                required
                value={newExam.classIds[0] || ''}
                onChange={e => setNewExam({ ...newExam, classIds: [e.target.value] })}
              >
                <option value="">Select Class</option>
                {teacherData?.classes?.map(cls => <option key={cls} value={cls}>Class {cls}</option>)}
              </Select>
            </FormField>
            <FormField label="Subject" required>
              <Select
                required
                value={newExam.subjectId}
                onChange={e => setNewExam({ ...newExam, subjectId: e.target.value })}
              >
                <option value="">Select Subject</option>
                {subjects.filter(s => teacherData?.subjects?.includes(s.id)).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Time">
              <Input
                type="time"
                value={newExam.startTime}
                onChange={e => setNewExam({ ...newExam, startTime: e.target.value })}
              />
            </FormField>
            <FormField label="Room / Venue">
              <Input
                type="text"
                value={newExam.room}
                onChange={e => setNewExam({ ...newExam, room: e.target.value })}
                placeholder="e.g. Hall A"
              />
            </FormField>
          </div>

          {newExam.type !== 'surprise' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Start Date" required>
                  <Input
                    type="date"
                    required
                    value={newExam.startDate}
                    onChange={e => setNewExam({ ...newExam, startDate: e.target.value })}
                  />
                </FormField>
                <FormField label="Max Marks" required>
                  <Input
                    type="number"
                    required
                    value={newExam.maxMarks}
                    onChange={e => setNewExam({ ...newExam, maxMarks: parseInt(e.target.value) })}
                  />
                </FormField>
              </div>
              <FormField label="Syllabus (Text)">
                <Textarea
                  value={newExam.syllabusText}
                  onChange={(e) => setNewExam({ ...newExam, syllabusText: e.target.value })}
                  rows={3}
                  placeholder="Type the syllabus here..."
                />
              </FormField>
              <FormField label="Syllabus (Photo)">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewExam({ ...newExam, syllabusPhoto: e.target.files?.[0] || null })}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </FormField>
            </>
          ) : (
            <FormField label="Topic" required>
              <Input
                type="text"
                required
                value={newExam.topic}
                onChange={(e) => setNewExam({ ...newExam, topic: e.target.value })}
                placeholder="e.g. Algebra Basics"
              />
            </FormField>
          )}

          <FormField label="Grading Scale" required>
            <Select
              required
              value={newExam.gradingScaleId}
              onChange={e => setNewExam({ ...newExam, gradingScaleId: e.target.value })}
            >
              <option value="">Select Scale</option>
              {gradingScales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormField>
        </form>
      </Modal>
    </>
  );
}
