import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Exam, Class, Subject, GradingScale, ExamResult, Student, UserProfile } from '../../types';
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ChevronRight,
  MoreVertical,
  X,
  Trash2,
  Edit2,
  Download,
  Eye,
  CheckSquare
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Examination Management</h1>
          <p className="text-gray-500 text-sm">Schedule exams, enter marks, and generate report cards.</p>
        </div>
        <button 
          onClick={() => setIsExamModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          Schedule Exam
        </button>
      </div>

      {/* Exam List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {exams.map((exam) => (
          <motion.div 
            key={exam.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-all"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                  <Calendar className="w-6 h-6" />
                </div>
                <span className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                  exam.status === 'scheduled' ? "bg-blue-50 text-blue-600" :
                  exam.status === 'ongoing' ? "bg-amber-50 text-amber-600" :
                  "bg-emerald-50 text-emerald-600"
                )}>
                  {exam.status}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{exam.name}</h3>
              <p className="text-xs text-gray-500 font-medium mb-4">{exam.term}</p>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span>{new Date(exam.startDate).toLocaleDateString()} - {new Date(exam.endDate).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <CheckSquare className="w-4 h-4 text-gray-400" />
                  <span>{exam.classIds.length} Classes Enrolled</span>
                </div>
              </div>

              <div className="space-y-2">
                {exam.classIds.map(classId => (
                  <button 
                    key={classId}
                    onClick={() => openMarksEntry(exam, classId)}
                    className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all text-xs font-bold text-gray-700"
                  >
                    Class {classId}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* New Exam Modal */}
      <AnimatePresence>
        {isExamModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExamModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <h2 className="text-xl font-bold text-gray-900">Schedule New Exam</h2>
                <button onClick={() => setIsExamModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <form onSubmit={handleCreateExam} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Exam Name</label>
                  <input 
                    type="text" required
                    value={examForm.name}
                    onChange={(e) => setExamForm({...examForm, name: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    placeholder="e.g. Mid-Term Examination"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <select 
                      required
                      value={examForm.subjectId}
                      onChange={(e) => setExamForm({...examForm, subjectId: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    >
                      <option value="">Select Subject</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                    <select 
                      value={examForm.term}
                      onChange={(e) => setExamForm({...examForm, term: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    >
                      <option>Term 1</option>
                      <option>Term 2</option>
                      <option>Final Term</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input 
                      type="date" required
                      value={examForm.startDate}
                      onChange={(e) => setExamForm({...examForm, startDate: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                    <input 
                      type="date" required
                      value={examForm.endDate}
                      onChange={(e) => setExamForm({...examForm, endDate: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Syllabus (Text)</label>
                  <textarea 
                    value={examForm.syllabusText}
                    onChange={(e) => setExamForm({...examForm, syllabusText: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600/20 outline-none h-24 resize-none"
                    placeholder="Type the syllabus here..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Syllabus (Photo)</label>
                  <input 
                    type="file"
                    accept="image/*"
                    onChange={(e) => setExamForm({...examForm, syllabusPhoto: e.target.files?.[0] || null})}
                    className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Classes</label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {classes.map(cls => (
                      <label key={cls.id} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50 transition-all">
                        <input 
                          type="checkbox"
                          checked={examForm.classIds.includes(cls.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExamForm({...examForm, classIds: [...examForm.classIds, cls.id]});
                            } else {
                              setExamForm({...examForm, classIds: examForm.classIds.filter(id => id !== cls.id)});
                            }
                          }}
                          className="rounded text-indigo-600"
                        />
                        <span className="text-xs font-medium">Class {cls.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 mt-4"
                >
                  {loading ? 'Scheduling...' : 'Schedule Exam'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Marks Entry Modal */}
      <AnimatePresence>
        {isMarksModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMarksModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden relative z-10 flex flex-col"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Marks Entry: {selectedExam?.name}</h2>
                  <p className="text-sm text-gray-500">Class {selectedClass} • {subjects.length} Subjects</p>
                </div>
                <button onClick={() => setIsMarksModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              <div className="flex-1 overflow-auto p-6">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b">
                      <th className="px-4 py-3 sticky left-0 bg-gray-50 z-10">Student Name</th>
                      {subjects.map(sub => (
                        <th key={sub.id} className="px-4 py-3 text-center min-w-[100px]">{sub.name}</th>
                      ))}
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.map(student => (
                      <tr key={student.id} className="hover:bg-gray-50 transition-all">
                        <td className="px-4 py-4 sticky left-0 bg-white z-10 border-r">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                              {student.name.charAt(0)}
                            </div>
                            <span className="text-sm font-bold text-gray-900">{student.name}</span>
                          </div>
                        </td>
                        {subjects.map(sub => (
                          <td key={sub.id} className="px-4 py-4">
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
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-center text-sm focus:ring-2 focus:ring-indigo-600/20 outline-none"
                            />
                          </td>
                        ))}
                        <td className="px-4 py-4 text-center">
                          <button 
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
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            title="Generate Report Card"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-6 border-t bg-gray-50 flex items-center justify-end gap-4">
                <button 
                  onClick={() => setIsMarksModalOpen(false)}
                  className="px-6 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-white transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveMarks}
                  disabled={loading}
                  className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save All Marks'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
