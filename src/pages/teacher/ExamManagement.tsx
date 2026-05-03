import { UserProfile, Exam, ExamResult, Student, Subject, GradingScale, Teacher } from '../../types';
import { Plus, Search, Filter, FileText, TrendingUp, Calendar, MoreVertical, Trash2, Edit2, X, CheckCircle2, AlertCircle, Download, Save } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useToast } from '../../components/Toast';

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
      const teacherDoc = await getDoc(doc(db, 'teachers', user.uid));
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exam & Result Management</h1>
          <p className="text-gray-500 text-sm">Schedule exams and manage student results for your classes.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Schedule Exam
        </button>
      </div>

      {/* Exam Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Upcoming Exams', value: exams.filter(e => e.status === 'scheduled').length.toString(), count: 'Next 30 days', color: 'blue', icon: Calendar },
          { label: 'Completed', value: exams.filter(e => e.status === 'completed').length.toString(), count: 'This term', color: 'emerald', icon: CheckCircle2 },
          { label: 'Pending Results', value: exams.filter(e => e.status === 'scheduled' && new Date(e.startDate) < new Date()).length.toString(), count: 'Action required', color: 'amber', icon: AlertCircle },
          { label: 'Grading Scales', value: gradingScales.length.toString(), count: 'Active systems', color: 'indigo', icon: TrendingUp },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              stat.color === 'blue' && "bg-blue-50 text-blue-600",
              stat.color === 'amber' && "bg-amber-50 text-amber-600",
              stat.color === 'emerald' && "bg-emerald-50 text-emerald-600",
              stat.color === 'indigo' && "bg-indigo-50 text-indigo-600",
            )}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-[10px] text-gray-500 font-medium">{stat.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Exam List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by exam title or class..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 transition-all"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                <th className="px-6 py-4">Exam Title</th>
                <th className="px-6 py-4">Class & Subject</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Max Marks</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredExams.map((exam) => (
                <tr key={exam.id} className="group hover:bg-gray-50 transition-all">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-xs">
                        {exam.name.charAt(0)}
                      </div>
                      <span className="text-sm font-bold text-gray-900">{exam.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {exam.classIds.join(', ')} • {subjects.find(s => s.id === exam.subjectId)?.name || exam.subjectId}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{new Date(exam.startDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">{exam.maxMarks}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      exam.status === 'scheduled' && "bg-blue-50 text-blue-600",
                      exam.status === 'completed' && "bg-emerald-50 text-emerald-600",
                    )}>
                      {exam.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => openMarksEntry(exam)}
                        className="px-3 py-1 bg-emerald-600 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-emerald-700 transition-all"
                      >
                        {exam.status === 'completed' ? 'Edit Results' : 'Enter Results'}
                      </button>
                      <button 
                        onClick={() => handleDelete(exam.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden relative z-10 p-10 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-600 mx-auto mb-6 transform -rotate-12">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2">Delete Exam?</h3>
              <p className="text-gray-500 mb-10 font-medium">This action cannot be undone. All results for this exam will also be affected.</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={performDelete}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 shadow-xl shadow-red-600/20 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                    <Plus className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Schedule Exam</h2>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleScheduleExam} className="p-8 space-y-6">
                <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
                  <button
                    type="button"
                    onClick={() => setNewExam({ ...newExam, type: 'scheduled' })}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                      newExam.type === 'scheduled' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    Scheduled Test
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewExam({ ...newExam, type: 'surprise' })}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                      newExam.type === 'surprise' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    Surprise Test
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Exam Name</label>
                  <input 
                    type="text" required
                    value={newExam.name}
                    onChange={e => setNewExam({...newExam, name: e.target.value})}
                    placeholder="e.g. Mid-Term Examination"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select 
                      required
                      value={newExam.classIds[0] || ''}
                      onChange={e => setNewExam({...newExam, classIds: [e.target.value]})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none"
                    >
                      <option value="">Select Class</option>
                      {teacherData?.classes?.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <select 
                      required
                      value={newExam.subjectId}
                      onChange={e => setNewExam({...newExam, subjectId: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none"
                    >
                      <option value="">Select Subject</option>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                {newExam.type === 'scheduled' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                        <input 
                          type="date" required
                          value={newExam.startDate}
                          onChange={e => setNewExam({...newExam, startDate: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Marks</label>
                        <input 
                          type="number" required
                          value={newExam.maxMarks}
                          onChange={e => setNewExam({...newExam, maxMarks: parseInt(e.target.value)})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Syllabus (Text)</label>
                      <textarea 
                        value={newExam.syllabusText}
                        onChange={(e) => setNewExam({...newExam, syllabusText: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none h-24 resize-none"
                        placeholder="Type the syllabus here..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Syllabus (Photo)</label>
                      <input 
                        type="file"
                        accept="image/*"
                        onChange={(e) => setNewExam({...newExam, syllabusPhoto: e.target.files?.[0] || null})}
                        className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
                    <input 
                      type="text" required
                      value={newExam.topic}
                      onChange={(e) => setNewExam({...newExam, topic: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none"
                      placeholder="e.g. Algebra Basics"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grading Scale</label>
                  <select 
                    required
                    value={newExam.gradingScaleId}
                    onChange={e => setNewExam({...newExam, gradingScaleId: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none"
                  >
                    <option value="">Select Scale</option>
                    {gradingScales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-4 pt-6 border-t">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-8 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    Schedule
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Marks Entry Modal */}
      <AnimatePresence>
        {isMarksModalOpen && selectedExam && (
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
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedExam.name}</h2>
                  <p className="text-sm text-gray-500">Marks Entry for Class {selectedExam.classIds.join(', ')}</p>
                </div>
                <button onClick={() => setIsMarksModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-widest border-b">
                      <th className="pb-4">Student Name</th>
                      <th className="pb-4">Admission No.</th>
                      <th className="pb-4 w-32">Marks ({selectedExam.maxMarks})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {students.map((student) => (
                      <tr key={student.id}>
                        <td className="py-4 text-sm font-medium text-gray-900">{student.name}</td>
                        <td className="py-4 text-sm text-gray-500">{student.admissionNumber}</td>
                        <td className="py-4">
                          <input 
                            type="number"
                            max={selectedExam.maxMarks}
                            min={0}
                            value={marks[student.id] || ''}
                            onChange={(e) => setMarks({ ...marks, [student.id]: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none text-sm font-bold"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-6 border-t bg-gray-50 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Total Students: <span className="font-bold text-gray-900">{students.length}</span>
                </p>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setIsMarksModalOpen(false)}
                    className="px-6 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-white transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveMarks}
                    className="flex items-center gap-2 px-8 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    <Save className="w-4 h-4" />
                    Save Results
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

