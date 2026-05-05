import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, getDocs, query, where, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { Exam, Class, Subject, GradingScale, Student, UserProfile } from '../../types';
import {
  Plus,
  Calendar,
  Clock,
  ChevronRight,
  X,
  Download,
  CheckSquare,
  FileText
} from 'lucide-react';
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

      await addDoc(collection(db, 'exams'), {
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
      setIsExamModalOpen(false);
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

  const examStatusVariant = (status: string): 'info' | 'warning' | 'success' => {
    if (status === 'scheduled') return 'info';
    if (status === 'ongoing') return 'warning';
    return 'success';
  };

  return (
    <div className="space-y-8">
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
                <span>{new Date(exam.startDate).toLocaleDateString()} – {new Date(exam.endDate).toLocaleDateString()}</span>
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
                  Class {classes.find(c => c.id === classId)?.name || classId}
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
    </div>
  );
}
