import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PageHeader, Card, Badge, Button, IconButton, Modal,
  FormField, Input, Select, Textarea, Table, Thead, Th, Tbody, Tr, Td, EmptyState, Avatar
} from '../../components/ui';

export default function ExamManagement({ user }: { user: UserProfile }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [isMarksModalOpen, setIsMarksModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [marksData, setMarksData] = useState<Record<string, any>>({});

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
      if (examForm.syllabusPhoto) {
        // In a real app, we would upload to Firebase Storage
        // For now, we'll use a data URL or placeholder
        syllabusPhotoUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(examForm.syllabusPhoto!);
        });
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
          photoUrl: syllabusPhotoUrl
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

  const openMarksEntry = async (exam: Exam, classId: string) => {
    setSelectedExam(exam);
    setSelectedClass(classId);
    setLoading(true);

    // Fetch students of this class
    const q = query(collection(db, 'students'), where('classId', '==', classId));
    const studentSnapshot = await getDocs(q);
    const studentList = studentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
    setStudents(studentList);

    // Fetch existing marks if any
    const resultsQ = query(
      collection(db, 'examResults'),
      where('examId', '==', exam.id),
      where('classId', '==', classId)
    );
    const resultsSnapshot = await getDocs(resultsQ);
    const resultsMap: Record<string, any> = {};
    resultsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      resultsMap[data.studentId] = data.subjectResults.reduce((acc: any, res: any) => {
        acc[res.subjectId] = res.marksObtained;
        return acc;
      }, {});
    });
    setMarksData(resultsMap);

    setIsMarksModalOpen(true);
    setLoading(false);
  };

  const calculateGrade = (percentage: number) => {
    const scale = gradingScales[0]; // Default to first scale for now
    if (!scale) return 'N/A';
    const range = scale.ranges.find(r => percentage >= r.min && percentage <= r.max);
    return range ? range.grade : 'F';
  };

  const handleSaveMarks = async () => {
    setLoading(true);
    try {
      if (!selectedExam) return;
      const scale = gradingScales.find(s => s.id === selectedExam.gradingScaleId) || gradingScales[0];

      for (const student of students) {
        const studentMarks = marksData[student.id] || {};
        const subjectResults = subjects.map(sub => {
          const marksObtained = Number(studentMarks[sub.id]) || 0;
          const maxMarks = 100; // Default max marks
          const percentage = (marksObtained / maxMarks) * 100;
          let grade = 'F';
          if (scale) {
            const range = scale.ranges.find(r => percentage >= r.min && percentage <= r.max);
            if (range) grade = range.grade;
          }
          return {
            subjectId: sub.id,
            marksObtained,
            maxMarks,
            grade,
          };
        });

        const totalMarks = subjectResults.reduce((sum, res) => sum + res.marksObtained, 0);
        const totalMaxMarks = subjectResults.length * 100;
        const percentage = (totalMarks / totalMaxMarks) * 100;

        let overallGrade = 'F';
        if (scale) {
          const range = scale.ranges.find(r => percentage >= r.min && percentage <= r.max);
          if (range) overallGrade = range.grade;
        }

        const resultId = `${selectedExam.id}_${student.id}`;
        await setDoc(doc(db, 'examResults', resultId), {
          examId: selectedExam.id,
          studentId: student.id,
          classId: selectedClass,
          subjectResults,
          totalMarks,
          percentage,
          overallGrade,
          published: true,
          updatedAt: new Date().toISOString(),
        });
      }
      setIsMarksModalOpen(false);
      alert('Marks saved successfully!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'examResults');
    } finally {
      setLoading(false);
    }
  };

  const generateReportCard = (student: Student, result: any) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(30, 58, 138); // Indigo-900
    doc.text('ELDEN HEIGHTS ACADEMY', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text('Academic Progress Report', 105, 28, { align: 'center' });

    // Student Info
    doc.setDrawColor(200);
    doc.line(20, 35, 190, 35);

    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Student Name: ${student.name}`, 20, 45);
    doc.text(`Class: ${student.classId} - ${student.section}`, 20, 52);
    doc.text(`Admission No: ${student.admissionNumber}`, 20, 59);
    doc.text(`Exam: ${selectedExam?.name} (${selectedExam?.term})`, 120, 45);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 120, 52);

    // Marks Table
    const tableData = result.subjectResults.map((res: any) => {
      const subject = subjects.find(s => s.id === res.subjectId);
      return [
        subject?.name || 'Unknown',
        res.maxMarks,
        res.marksObtained,
        res.grade,
        res.marksObtained >= (res.maxMarks * 0.4) ? 'Pass' : 'Fail'
      ];
    });

    autoTable(doc, {
      startY: 70,
      head: [['Subject', 'Max Marks', 'Marks Obtained', 'Grade', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] }, // Indigo-600
    });

    // Summary
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Marks: ${result.totalMarks} / ${result.subjectResults.length * 100}`, 20, finalY);
    doc.text(`Percentage: ${result.percentage.toFixed(2)}%`, 20, finalY + 10);
    doc.text(`Overall Grade: ${result.overallGrade}`, 120, finalY);

    // Footer
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Class Teacher Signature', 20, finalY + 40);
    doc.text('Principal Signature', 120, finalY + 40);
    doc.line(20, finalY + 35, 70, finalY + 35);
    doc.line(120, finalY + 35, 170, finalY + 35);

    doc.save(`${student.name}_Report_Card.pdf`);
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
          <Button icon={Plus} onClick={() => setIsExamModalOpen(true)}>
            Schedule Exam
          </Button>
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
                  onClick={() => openMarksEntry(exam, classId)}
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

      {/* Marks Entry Modal */}
      <Modal
        isOpen={isMarksModalOpen}
        onClose={() => setIsMarksModalOpen(false)}
        title={`Marks Entry: ${selectedExam?.name}`}
        subtitle={`Class ${selectedClass} • ${subjects.length} Subjects`}
        size="xl"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsMarksModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveMarks} loading={loading}>
              Save All Marks
            </Button>
          </div>
        }
      >
        <Table>
          <Thead>
            <Tr>
              <Th>Student Name</Th>
              {subjects.map(sub => (
                <Th key={sub.id} className="text-center min-w-[100px]">{sub.name}</Th>
              ))}
              <Th className="text-center">Report</Th>
            </Tr>
          </Thead>
          <Tbody>
            {students.map(student => (
              <Tr key={student.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <Avatar name={student.name} size="sm" />
                    <span className="font-semibold text-slate-900 whitespace-nowrap">{student.name}</span>
                  </div>
                </Td>
                {subjects.map(sub => (
                  <Td key={sub.id}>
                    <input
                      type="number"
                      max={100}
                      min={0}
                      value={marksData[student.id]?.[sub.id] || ''}
                      onChange={(e) => {
                        setMarksData({
                          ...marksData,
                          [student.id]: {
                            ...(marksData[student.id] || {}),
                            [sub.id]: e.target.value
                          }
                        });
                      }}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-center text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none"
                    />
                  </Td>
                ))}
                <Td className="text-center">
                  <IconButton
                    icon={Download}
                    variant="ghost"
                    size="sm"
                    title="Generate Report Card"
                    onClick={() => {
                      const studentMarks = marksData[student.id] || {};
                      const subjectResults = subjects.map(sub => ({
                        subjectId: sub.id,
                        marksObtained: Number(studentMarks[sub.id]) || 0,
                        maxMarks: 100,
                        grade: calculateGrade(Number(studentMarks[sub.id]) || 0),
                      }));
                      const totalMarks = subjectResults.reduce((sum, res) => sum + res.marksObtained, 0);
                      const percentage = totalMarks / (subjects.length * 100) * 100;
                      const overallGrade = calculateGrade(percentage);

                      generateReportCard(student, {
                        subjectResults,
                        totalMarks,
                        percentage,
                        overallGrade
                      });
                    }}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {students.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No students in this class"
            description="Enroll students to this class first."
          />
        )}
      </Modal>
    </div>
  );
}
