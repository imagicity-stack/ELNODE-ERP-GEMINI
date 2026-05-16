import { UserProfile, Exam, ExamResult, Student, Subject, GradingScale, Teacher } from '../../types';
import { Plus, FileText, TrendingUp, Calendar, Trash2, CheckCircle2, AlertCircle, Save, AlertTriangle } from 'lucide-react';
import { validateExamSchedule, findExamConflicts, ExamConflict, ValidationIssue } from '../../services/examService';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useToast } from '../../components/Toast';
import {
  PageHeader,
  StatCard,
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
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
  Spinner,
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
  const [searchTerm, setSearchTerm] = useState('');
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
      // Fetch Teacher Profile
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

    // Validate first
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

    // Conflict check — if found and not yet overridden, show and require override
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
        // Non-fatal — log and continue
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

      await addDoc(collection(db, 'exams'), {
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

  const generateReportCard = (exam: Exam) => {
    if (exam.status !== 'published') {
      showToast('Publish the exam results first (open the exam in Marks Entry → Publish).', 'error');
      return;
    }
    showToast('Report cards are now available on individual student and parent portals.', 'info');
  };

  const filteredExams = exams.filter(exam =>
    exam.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    exam.classIds.some(cid => cid.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const examStatusVariant = (status: string): 'success' | 'warning' | 'info' | 'indigo' => {
    if (status === 'published') return 'indigo';
    if (status === 'completed') return 'success';
    if (status === 'ongoing') return 'warning';
    return 'info';
  };

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Exams & Results</p>
          <h1 className="text-xl font-bold mt-0.5">Manage Exams</h1>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{exams.filter(e => e.status === 'scheduled').length}</p>
              <p className="text-[9px] text-white/70">Upcoming</p>
            </div>
            <div className="bg-white/15 rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{exams.filter(e => e.status === 'completed').length}</p>
              <p className="text-[9px] text-white/70">Done</p>
            </div>
            <div className="bg-white/15 rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{exams.filter(e => e.status === 'scheduled' && new Date(e.startDate) < new Date()).length}</p>
              <p className="text-[9px] text-white/70">Pending</p>
            </div>
          </div>
        </div>

        <div className="px-4 mt-3 mb-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search exams..."
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-blue-400"
          />
        </div>

        <div className="px-4 space-y-2">
          {loading ? (
            <div className="py-10 flex justify-center"><Spinner /></div>
          ) : filteredExams.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No exams scheduled</p>
              <p className="text-xs text-slate-500 mt-1">Tap the + button to add</p>
            </div>
          ) : (
            filteredExams.map((exam) => (
              <div key={exam.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {exam.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{exam.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {subjects.find(s => s.id === exam.subjectId)?.name || exam.subjectId} · {new Date(exam.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Max {exam.maxMarks} marks</p>
                  </div>
                  <Badge variant={examStatusVariant(exam.status)} className="text-[9px] shrink-0">
                    {exam.status}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/teacher/exams/${exam.id}/marks`)}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold active:scale-95 transition-transform"
                  >
                    {exam.status === 'completed' ? 'Edit Results' : 'Enter Results'}
                  </button>
                  <button
                    onClick={() => handleDelete(exam.id)}
                    className="py-2.5 px-4 rounded-xl bg-red-50 text-red-600 text-xs font-bold active:scale-95 transition-transform"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* FAB */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Exam & Result Management"
        subtitle="Schedule exams and manage student results for your classes."
        icon={FileText}
        iconColor="gradient-blue"
        actions={
          <Button icon={Plus} onClick={() => setIsModalOpen(true)}>
            Schedule Exam
          </Button>
        }
      />

      {/* Exam Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Upcoming Exams"
          value={exams.filter(e => e.status === 'scheduled').length}
          icon={Calendar}
          gradient="gradient-blue"
          index={0}
        />
        <StatCard
          label="Completed"
          value={exams.filter(e => e.status === 'completed').length}
          icon={CheckCircle2}
          gradient="gradient-emerald"
          index={1}
        />
        <StatCard
          label="Pending Results"
          value={exams.filter(e => e.status === 'scheduled' && new Date(e.startDate) < new Date()).length}
          icon={AlertCircle}
          gradient="gradient-amber"
          index={2}
        />
        <StatCard
          label="Grading Scales"
          value={gradingScales.length}
          icon={TrendingUp}
          gradient="gradient-violet"
          index={3}
        />
      </div>

      {/* Exam List */}
      <Card padding="none">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by exam title or class..."
            className="max-w-md"
          />
        </div>
        <Table>
          <Thead>
            <tr>
              <Th>Exam Title</Th>
              <Th>Class &amp; Subject</Th>
              <Th>Date</Th>
              <Th>Max Marks</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {filteredExams.map((exam) => (
              <Tr key={exam.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                      {exam.name.charAt(0)}
                    </div>
                    <span className="font-bold text-slate-900">{exam.name}</span>
                  </div>
                </Td>
                <Td className="text-slate-600">
                  {exam.classIds.join(', ')} &bull; {subjects.find(s => s.id === exam.subjectId)?.name || exam.subjectId}
                </Td>
                <Td className="text-slate-600">{new Date(exam.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</Td>
                <Td className="font-bold text-slate-900">{exam.maxMarks}</Td>
                <Td>
                  <Badge variant={examStatusVariant(exam.status)}>
                    {exam.status}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="xs"
                      variant={exam.status === 'completed' ? 'secondary' : 'primary'}
                      onClick={() => navigate(`/teacher/exams/${exam.id}/marks`)}
                    >
                      {exam.status === 'completed' ? 'Edit Results' : 'Enter Results'}
                    </Button>
                    <IconButton
                      icon={Trash2}
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(exam.id)}
                    />
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {filteredExams.length === 0 && (
          loading
            ? <Spinner />
            : <EmptyState
                icon={FileText}
                title="No exams found"
                description="No exams scheduled yet. Create one to get started."
                action={
                  <Button icon={Plus} size="sm" onClick={() => setIsModalOpen(true)}>
                    Schedule Exam
                  </Button>
                }
              />
        )}
      </Card>
      </div>

      {/* Delete Confirmation Modal — shared by mobile + desktop */}
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
          {/* Validation issues banner */}
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

          {/* Conflicts banner with override */}
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

          {/* Exam type toggle */}
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
