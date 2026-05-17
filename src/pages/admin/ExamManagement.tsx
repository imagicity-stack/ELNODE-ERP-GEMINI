import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, getDocs, query, where, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { logActivity } from '../../services/activityService';
import { Exam, Class, Subject, GradingScale, Student, UserProfile } from '../../types';
import {
  Plus,
  Calendar,
  Clock,
  ChevronRight,
  X,
  Download,
  CheckSquare,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { validateExamSchedule, findExamConflicts, ExamConflict, ValidationIssue } from '../../services/examService';
import { useToast } from '../../components/Toast';
import { cn } from '../../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RefObject } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import {
  PageHeader, Card, Badge, Button, IconButton, Modal,
  FormField, Input, Select, Textarea, Table, Thead, Th, Tbody, Tr, Td, EmptyState, Avatar
} from '../../components/ui';

export default function ExamManagement({ user }: { user: UserProfile }) {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('exams');
  const { showToast } = useToast();
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [conflicts, setConflicts] = useState<ExamConflict[]>([]);
  const [overrideConflicts, setOverrideConflicts] = useState(false);

  // Form State for New Exam
  const [examForm, setExamForm] = useState({
    name: '',
    term: 'Term 1',
    startDate: '',
    endDate: '',
    classIds: [] as string[],
    subjectId: '',
    maxMarks: 100,
    gradingScaleId: '',
    type: 'scheduled' as 'scheduled',
    syllabusText: '',
    syllabusPhoto: null as File | null,
  });

  useEffect(() => {
    fetchExams();
    fetchClasses();
    fetchSubjects();
    fetchGradingScales();
  }, []);

  const fetchExams = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'exams'));
      setExams(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'exams');
    }
  };

  const fetchClasses = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'classes'));
      setClasses(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'classes');
    }
  };

  const fetchSubjects = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'subjects'));
      setSubjects(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'subjects');
    }
  };

  const fetchGradingScales = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'gradingScales'));
      const scales = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GradingScale));
      setGradingScales(scales);
      if (scales.length > 0) {
        setExamForm(prev => ({ ...prev, gradingScaleId: scales[0].id }));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'gradingScales');
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();

    const issues = validateExamSchedule({
      startDate: examForm.startDate,
      endDate: examForm.endDate || examForm.startDate,
      classIds: examForm.classIds,
    });
    setValidationIssues(issues);
    if (issues.some(i => i.level === 'error')) {
      showToast(issues.find(i => i.level === 'error')!.message, 'error');
      return;
    }

    if (!overrideConflicts) {
      try {
        const found = await findExamConflicts({
          startDate: examForm.startDate,
          endDate: examForm.endDate || examForm.startDate,
          classIds: examForm.classIds,
        });
        setConflicts(found);
        if (found.length > 0) {
          showToast(`${found.length} scheduling conflict(s) — review and override to proceed`, 'error');
          return;
        }
      } catch (err) { console.warn('Conflict check failed:', err); }
    }

    setLoading(true);
    try {
      let syllabusPhotoUrl = '';
      let storagePath = '';
      if (examForm.syllabusPhoto) {
        const timestamp = new Date().getTime();
        storagePath = `exams/syllabus/${user.uid}/${timestamp}_${examForm.syllabusPhoto.name}`;
        const storageRef = ref(storage, storagePath);
        
        const uploadResult = await uploadBytes(storageRef, examForm.syllabusPhoto);
        syllabusPhotoUrl = await getDownloadURL(uploadResult.ref);
      }

      const examRef = await addDoc(collection(db, 'exams'), {
        name: examForm.name,
        term: examForm.term,
        startDate: examForm.startDate || new Date().toISOString().split('T')[0],
        endDate: examForm.endDate || examForm.startDate || new Date().toISOString().split('T')[0],
        classIds: examForm.classIds,
        subjectId: examForm.subjectId,
        maxMarks: examForm.maxMarks,
        gradingScaleId: examForm.gradingScaleId,
        type: 'scheduled',
        status: 'scheduled',
        syllabus: {
          text: examForm.syllabusText,
          photoUrl: syllabusPhotoUrl,
          storagePath: storagePath || undefined
        },
        createdAt: new Date().toISOString(),
        createdBy: user.uid
      });
      logActivity(
        user,
        'Exam Created',
        'Exam',
        `Scheduled exam "${examForm.name}" (${examForm.term}) for ${examForm.classIds.length} class(es) starting ${examForm.startDate}`,
        {
          examId: examRef.id,
          name: examForm.name,
          term: examForm.term,
          startDate: examForm.startDate,
          classCount: examForm.classIds.length,
        }
      );
      setIsExamModalOpen(false);
      setValidationIssues([]);
      setConflicts([]);
      setOverrideConflicts(false);
      showToast('Exam scheduled', 'success');
      fetchExams();
      setExamForm({
        name: '',
        term: 'Term 1',
        startDate: '',
        endDate: '',
        classIds: [],
        subjectId: '',
        maxMarks: 100,
        gradingScaleId: gradingScales[0]?.id || '',
        type: 'scheduled',
        syllabusText: '',
        syllabusPhoto: null,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'exams');
    } finally {
      setLoading(false);
    }
  };

  const calculateGrade = (percentage: number) => {
    const scale = gradingScales[0]; // Default to first scale for now
    if (!scale) return 'N/A';
    const range = scale.ranges.find(r => percentage >= r.min && percentage <= r.max);
    return range ? range.grade : 'F';
  };

  const examStatusVariant = (status: string): 'info' | 'warning' | 'success' | 'indigo' => {
    if (status === 'scheduled') return 'info';
    if (status === 'ongoing') return 'warning';
    if (status === 'published') return 'indigo';
    return 'success';
  };

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Examinations</h1>
          <p className="text-xs text-indigo-100 mt-0.5">{exams.length} exam{exams.length === 1 ? '' : 's'} scheduled</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{exams.filter(e => e.status === 'scheduled').length}</p>
              <p className="text-[9px] text-white/70 uppercase">Scheduled</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{exams.filter(e => e.status === 'ongoing').length}</p>
              <p className="text-[9px] text-white/70 uppercase">Ongoing</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{exams.filter(e => e.status === 'completed').length}</p>
              <p className="text-[9px] text-white/70 uppercase">Done</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 space-y-2.5">
          {exams.length === 0 ? (
            <div className="py-12 text-center">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No exams scheduled</p>
              <p className="text-xs text-slate-500 mt-1">Tap + to schedule</p>
            </div>
          ) : (
            exams.map((exam) => (
              <div key={exam.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{exam.name}</p>
                      <p className="text-[11px] text-slate-500">{exam.term}</p>
                    </div>
                  </div>
                  <Badge variant={examStatusVariant(exam.status)} className="text-[9px] shrink-0 capitalize">{exam.status}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(exam.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} → {new Date(exam.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3" />{exam.classIds.length} class{exam.classIds.length === 1 ? '' : 'es'}</span>
                </div>
                <button
                  onClick={() => {
                    const basePath = user.role === 'super_admin' ? '/superadmin' : '/principal';
                    navigate(`${basePath}/exams/${exam.id}/marks`);
                  }}
                  className="mt-2 w-full py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"
                >
                  Enter Marks <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {!readOnly && (
          <button
            onClick={() => setIsExamModalOpen(true)}
            className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Examination Management"
        subtitle="Schedule exams, enter marks, and generate report cards."
        icon={FileText}
        iconColor="gradient-indigo"
        actions={
          !readOnly && (
            <Button icon={Plus} onClick={() => setIsExamModalOpen(true)}>
              Schedule Exam
            </Button>
          )
        }
      />

      {/* Exam List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {exams.map((exam) => (
          <Card key={exam.id} hover>
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 gradient-indigo rounded-xl flex items-center justify-center text-white shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <Badge variant={examStatusVariant(exam.status)}>{exam.status}</Badge>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-0.5">{exam.name}</h3>
            <p className="text-xs text-slate-500 font-medium mb-4">{exam.term}</p>

            <div className="space-y-2 mb-5">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{new Date(exam.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} – {new Date(exam.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                <span>{exam.classIds.length} Classes Enrolled</span>
              </div>
            </div>

            <div className="space-y-1.5">
              {exam.classIds.map(classId => (
                <button
                  key={classId}
                  onClick={() => {
                    const basePath = user.role === 'super_admin' ? '/superadmin' : '/principal';
                    navigate(`${basePath}/exams/${exam.id}/marks`);
                  }}
                  className="w-full flex items-center justify-between p-2.5 bg-slate-50 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all text-xs font-bold text-slate-700"
                >
                  Class {classId}
                  <ChevronRight className="w-4 h-4" />
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {exams.length === 0 && (
        <Card>
          <EmptyState
            icon={Calendar}
            title="No exams scheduled"
            description="Schedule your first examination to get started."
            action={
              <Button icon={Plus} size="sm" onClick={() => setIsExamModalOpen(true)}>
                Schedule Exam
              </Button>
            }
          />
        </Card>
      )}
      </div>

      {/* New Exam Modal */}
      <Modal
        isOpen={isExamModalOpen}
        onClose={() => setIsExamModalOpen(false)}
        title="Schedule New Exam"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsExamModalOpen(false)}>Cancel</Button>
            <Button form="exam-form" type="submit" loading={loading} icon={Calendar}>
              Schedule Exam
            </Button>
          </div>
        }
      >
        <form id="exam-form" onSubmit={handleCreateExam} className="space-y-4">
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
                    {conflicts.map((c, i) => <li key={i}>• {c.detail}</li>)}
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
          <FormField label="Exam Name" required>
            <Input
              type="text"
              required
              value={examForm.name}
              onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
              placeholder="e.g. Mid-Term Examination"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Subject" required>
              <Select
                required
                value={examForm.subjectId}
                onChange={(e) => setExamForm({ ...examForm, subjectId: e.target.value })}
              >
                <option value="">Select Subject</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Term">
              <Select
                value={examForm.term}
                onChange={(e) => setExamForm({ ...examForm, term: e.target.value })}
              >
                <option>Term 1</option>
                <option>Term 2</option>
                <option>Final Term</option>
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" required>
              <Input
                type="date"
                required
                value={examForm.startDate}
                onChange={(e) => setExamForm({ ...examForm, startDate: e.target.value })}
              />
            </FormField>
            <FormField label="End Date" required>
              <Input
                type="date"
                required
                value={examForm.endDate}
                onChange={(e) => setExamForm({ ...examForm, endDate: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Syllabus (Text)">
            <Textarea
              value={examForm.syllabusText}
              onChange={(e) => setExamForm({ ...examForm, syllabusText: e.target.value })}
              placeholder="Type the syllabus here..."
              rows={3}
            />
          </FormField>

          <FormField label="Syllabus (Photo)">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setExamForm({ ...examForm, syllabusPhoto: e.target.files?.[0] || null })}
              className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </FormField>

          <FormField label="Select Classes">
            <div className="grid grid-cols-2 gap-2 mt-1">
              {classes.map(cls => (
                <label key={cls.id} className="flex items-center gap-2 p-2.5 border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-all">
                  <input
                    type="checkbox"
                    checked={examForm.classIds.includes(cls.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setExamForm({ ...examForm, classIds: [...examForm.classIds, cls.id] });
                      } else {
                        setExamForm({ ...examForm, classIds: examForm.classIds.filter(id => id !== cls.id) });
                      }
                    }}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-xs font-medium text-slate-700">Class {cls.name}</span>
                </label>
              ))}
            </div>
          </FormField>
        </form>
      </Modal>
    </>
  );
}
