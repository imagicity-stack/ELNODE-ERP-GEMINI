import { UserProfile, Exam, ExamResult, Student, Subject, GradingScale, Teacher } from '../../types';
import { Plus, FileText, TrendingUp, Calendar, Trash2, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
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
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isMarksModalOpen, setIsMarksModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<{ [studentId: string]: number }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

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
    type: 'scheduled' as 'scheduled' | 'surprise',
    syllabusText: '',
    syllabusPhoto: null as File | null,
    topic: '',
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
    try {
      let syllabusPhotoUrl = '';
      if (newExam.syllabusPhoto) {
        syllabusPhotoUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(newExam.syllabusPhoto!);
        });
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
        syllabus: newExam.type === 'scheduled' ? {
          text: newExam.syllabusText,
          photoUrl: syllabusPhotoUrl
        } : undefined,
        topic: newExam.type === 'surprise' ? newExam.topic : undefined,
        createdAt: new Date().toISOString(),
        createdBy: user.uid
      });
      setIsModalOpen(false);
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
        topic: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'exams');
    }
  };

  const openMarksEntry = async (exam: Exam) => {
    try {
      setSelectedExam(exam);
      // For now, we assume the exam is for a single class or we fetch students for all classIds
      const studentsSnap = await getDocs(query(collection(db, 'students'), where('classId', 'in', exam.classIds)));
      const studentList = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(studentList);

      const resultsSnap = await getDocs(query(collection(db, 'examResults'), where('examId', '==', exam.id)));
      const existingMarks: { [studentId: string]: number } = {};
      resultsSnap.docs.forEach(doc => {
        const data = doc.data() as ExamResult;
        // Find the mark for the specific subject
        const subjectResult = data.subjectResults.find(sr => sr.subjectId === exam.subjectId);
        if (subjectResult) {
          existingMarks[data.studentId] = subjectResult.marksObtained;
        }
      });
      setMarks(existingMarks);
      setIsMarksModalOpen(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'students/examResults');
    }
  };

  const saveMarks = async () => {
    if (!selectedExam) return;
    try {
      const scale = gradingScales.find(s => s.id === selectedExam.gradingScaleId);

      for (const studentId of Object.keys(marks)) {
        const percentage = (marks[studentId] / selectedExam.maxMarks) * 100;
        let grade = 'F';
        if (scale) {
          const matchedGrade = scale.ranges.find(s => percentage >= s.min && percentage <= s.max);
          if (matchedGrade) grade = matchedGrade.grade;
        }

        const resultId = `${selectedExam.id}_${studentId}`;
        const student = students.find(s => s.id === studentId);

        await setDoc(doc(db, 'examResults', resultId), {
          examId: selectedExam.id,
          studentId,
          classId: student?.classId || selectedExam.classIds[0],
          subjectResults: [{
            subjectId: selectedExam.subjectId,
            marksObtained: marks[studentId],
            maxMarks: selectedExam.maxMarks,
            grade
          }],
          totalMarks: marks[studentId],
          percentage,
          overallGrade: grade,
          published: true,
          updatedAt: new Date().toISOString()
        });
      }

      if (selectedExam.status === 'scheduled' || selectedExam.status === 'ongoing') {
        await updateDoc(doc(db, 'exams', selectedExam.id), { status: 'completed' });
      }

      setIsMarksModalOpen(false);
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'examResults');
    }
  };

  const generateReportCard = (exam: Exam) => {
    // This would ideally generate for all students in the class
    // For now, let's just show a placeholder or logic to trigger individual ones
    alert("Report cards can be downloaded from individual student/parent portals. Use the 'Enter Results' to manage scores.");
  };

  const filteredExams = exams.filter(exam =>
    exam.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    exam.classIds.some(cid => cid.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const examStatusVariant = (status: string) => {
    if (status === 'completed') return 'success';
    if (status === 'ongoing') return 'warning';
    return 'info';
  };

  return (
    <div className="space-y-8">
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
                <Td className="text-slate-600">{new Date(exam.startDate).toLocaleDateString()}</Td>
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
                      onClick={() => openMarksEntry(exam)}
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

      {/* Delete Confirmation Modal */}
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
          {/* Exam type toggle */}
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setNewExam({ ...newExam, type: 'scheduled' })}
              className={cn(
                "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                newExam.type === 'scheduled' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Scheduled Test
            </button>
            <button
              type="button"
              onClick={() => setNewExam({ ...newExam, type: 'surprise' })}
              className={cn(
                "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                newExam.type === 'surprise' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Surprise Test
            </button>
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
                {teacherData?.classes?.map(cls => <option key={cls} value={cls}>{cls}</option>)}
              </Select>
            </FormField>
            <FormField label="Subject" required>
              <Select
                required
                value={newExam.subjectId}
                onChange={e => setNewExam({ ...newExam, subjectId: e.target.value })}
              >
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </FormField>
          </div>

          {newExam.type === 'scheduled' ? (
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

      {/* Marks Entry Modal */}
      {selectedExam && (
        <Modal
          isOpen={isMarksModalOpen}
          onClose={() => setIsMarksModalOpen(false)}
          title={selectedExam.name}
          subtitle={`Marks Entry for Class ${selectedExam.classIds.join(', ')}`}
          size="lg"
          footer={
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Total Students: <span className="font-bold text-slate-900">{students.length}</span>
              </p>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={() => setIsMarksModalOpen(false)}>Cancel</Button>
                <Button icon={Save} onClick={saveMarks}>Save Results</Button>
              </div>
            </div>
          }
        >
          <Table>
            <Thead>
              <tr>
                <Th>Student Name</Th>
                <Th>Admission No.</Th>
                <Th>Marks ({selectedExam.maxMarks})</Th>
              </tr>
            </Thead>
            <Tbody>
              {students.map((student) => (
                <Tr key={student.id}>
                  <Td className="font-medium text-slate-900">{student.name}</Td>
                  <Td className="text-slate-500">{student.admissionNumber}</Td>
                  <Td>
                    <Input
                      type="number"
                      max={selectedExam.maxMarks}
                      min={0}
                      value={marks[student.id] || ''}
                      onChange={(e) => setMarks({ ...marks, [student.id]: parseInt(e.target.value) || 0 })}
                      className="w-28 font-bold"
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Modal>
      )}
    </div>
  );
}
