import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, Exam, Student, ExamResult, GradingScale, Subject } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import { logActivity } from '../../services/activityService';
import { 
  ArrowLeft, 
  Save, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  User,
  Calculator
} from 'lucide-react';
import { Button, Input, Badge, Avatar } from '../../components/ui';
import { cn } from '../../lib/utils';
import { auth } from '../../firebase';

export default function ResultEntry({ user }: { user: UserProfile }) {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  
  const [exam, setExam] = useState<Exam | null>(null);
  const [gradingScale, setGradingScale] = useState<GradingScale | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [results, setResults] = useState<Record<string, Partial<ExamResult>>>( {});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { classesMap } = useData();
  const { isReadOnly } = usePermissions(user?.role || 'student');
  const readOnly = isReadOnly('exams');

  useEffect(() => {
    if (examId) {
      fetchData();
    }
  }, [examId]);

  const fetchData = async () => {
    if (!examId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Exam
      const examDoc = await getDoc(doc(db, 'exams', examId));
      if (!examDoc.exists()) {
        setError('Exam not found');
        setLoading(false);
        return;
      }
      const examData = { id: examDoc.id, ...examDoc.data() } as Exam;
      setExam(examData);

      // 2. Fetch Grading Scale
      if (examData.gradingScaleId) {
        const gsDoc = await getDoc(doc(db, 'grading_scales', examData.gradingScaleId));
        if (gsDoc.exists()) {
          setGradingScale({ id: gsDoc.id, ...gsDoc.data() } as GradingScale);
        }
      }

      // 3. Fetch Subject
      if (examData.subjectId) {
        const subDoc = await getDoc(doc(db, 'subjects', examData.subjectId));
        if (subDoc.exists()) {
          setSubject({ id: subDoc.id, ...subDoc.data() } as Subject);
        }
      }

      // 4. Fetch Students from classIds
      const studentsPromises = examData.classIds.map(classId => 
        getDocs(query(collection(db, 'students'), where('classId', '==', classId)))
      );
      const studentSnapshots = await Promise.all(studentsPromises);
      const allStudents: Student[] = [];
      studentSnapshots.forEach(snap => {
        snap.forEach(doc => {
          allStudents.push({ id: doc.id, ...doc.data() } as Student);
        });
      });
      setStudents(allStudents.sort((a, b) => a.name.localeCompare(b.name)));

      // 5. Fetch Existing Results
      const resultsQuery = query(collection(db, 'results'), where('examId', '==', examId));
      const resultsSnap = await getDocs(resultsQuery);
      const existingResults: Record<string, Partial<ExamResult>> = {};
      resultsSnap.forEach(doc => {
        const data = doc.data() as ExamResult;
        existingResults[data.studentId] = data;
      });
      setResults(existingResults);

    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'exam_results');
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const calculateGrade = (marks: number, maxMarks: number) => {
    if (!gradingScale) return 'N/A';
    const percentage = (marks / maxMarks) * 100;
    const range = gradingScale.ranges.find(r => percentage >= r.min && percentage <= r.max);
    return range ? range.grade : 'F';
  };

  const handleMarkChange = (studentId: string, marks: string) => {
    const marksNum = parseFloat(marks);
    if (isNaN(marksNum) && marks !== '') return;
    
    if (marksNum > (exam?.maxMarks || 100)) return;

    setResults(prev => {
      const student = students.find(s => s.id === studentId);
      const existing = prev[studentId] || {
        examId,
        studentId,
        classId: student?.classId,
        subjectResults: []
      };

      // Since each Exam doc is per-subject, we treat subjectResults as having one entry or we update it
      const subjectResults = [...(existing.subjectResults || [])];
      const subIdx = subjectResults.findIndex(r => r.subjectId === exam?.subjectId);
      
      const newSubResult = {
        subjectId: exam?.subjectId || '',
        marksObtained: isNaN(marksNum) ? 0 : marksNum,
        maxMarks: exam?.maxMarks || 100,
        grade: calculateGrade(isNaN(marksNum) ? 0 : marksNum, exam?.maxMarks || 100)
      };

      if (subIdx >= 0) {
        subjectResults[subIdx] = newSubResult;
      } else {
        subjectResults.push(newSubResult);
      }

      const totalMarks = subjectResults.reduce((acc, curr) => acc + curr.marksObtained, 0);
      const maxTotalMarks = subjectResults.reduce((acc, curr) => acc + curr.maxMarks, 0);
      const percentage = (totalMarks / maxTotalMarks) * 100;

      return {
        ...prev,
        [studentId]: {
          ...existing,
          subjectResults,
          totalMarks,
          percentage,
          overallGrade: calculateGrade(totalMarks, maxTotalMarks),
          updatedAt: new Date().toISOString()
        }
      };
    });
  };

  const handleRemarksChange = (studentId: string, remarks: string) => {
    setResults(prev => {
      const existing = prev[studentId];
      if (!existing || !existing.subjectResults) return prev;

      const subjectResults = [...existing.subjectResults];
      const subIdx = subjectResults.findIndex(r => r.subjectId === exam?.subjectId);
      
      if (subIdx >= 0) {
        subjectResults[subIdx] = { ...subjectResults[subIdx], remarks };
      }

      return {
        ...prev,
        [studentId]: {
          ...existing,
          subjectResults
        }
      };
    });
  };

  const handleSaveAll = async () => {
    if (!examId || !user) return;
    setSaving(true);
    setError(null);
    try {
      const batchPromises = Object.entries(results).map(([studentId, result]) => {
        const resultId = `${examId}_${studentId}`;
        return setDoc(doc(db, 'results', resultId), {
          ...result,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      await Promise.all(batchPromises);
      
      // Update exam status if it was 'scheduled'
      if (exam?.status === 'scheduled') {
        await updateDoc(doc(db, 'exams', examId), {
          status: 'completed'
        });
      }

      // Log activity
      logActivity(
        user,
        'Exam Marks Updated',
        'Teachers',
        `Updated marks for ${exam?.name} - ${subject?.name}`,
        { 
          examId, 
          subjectId: exam?.subjectId,
          examName: exam?.name 
        }
      );

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'results');
      setError('Failed to save results');
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.admissionNumber.includes(searchQuery)
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-slate-500 font-medium">Loading exam and student data...</p>
      </div>
    );
  }

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 px-4 pt-4 pb-5 text-white">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-100 mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-100">{subject?.name} ({subject?.code})</p>
          <h1 className="text-lg font-bold mt-0.5">{exam?.name}</h1>
          <p className="text-xs text-indigo-100 mt-1">Max marks: {exam?.maxMarks}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-white/15 rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{students.length}</p>
              <p className="text-[9px] text-white/70">Total</p>
            </div>
            <div className="bg-white/15 rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{Object.keys(results).length}</p>
              <p className="text-[9px] text-white/70">Entered</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-3 bg-rose-50 text-rose-700 px-3 py-2 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mx-4 mt-3 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Saved successfully</span>
          </div>
        )}

        <div className="px-4 mt-3 mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student..."
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-indigo-400"
          />
        </div>

        <div className="px-4 space-y-2">
          {filteredStudents.length === 0 ? (
            <div className="py-12 text-center">
              <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No students found</p>
            </div>
          ) : filteredStudents.map((student) => {
            const studentResult = results[student.id];
            const subResult = studentResult?.subjectResults?.find(r => r.subjectId === exam?.subjectId);
            const marks = subResult?.marksObtained || '';
            return (
              <div key={student.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar name={student.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{student.name}</p>
                    <p className="text-[10px] text-slate-500">#{student.admissionNumber}</p>
                  </div>
                  {subResult?.grade && (
                    <Badge
                      variant={
                        (subResult.grade) === 'F' ? 'error' :
                        ['A+', 'A', 'B+'].includes(subResult.grade) ? 'success' : 'indigo'
                      }
                      className="w-9 h-9 flex items-center justify-center text-base rounded-full font-bold"
                    >
                      {subResult.grade}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    min="0"
                    max={exam?.maxMarks}
                    step="0.5"
                    value={marks}
                    disabled={readOnly}
                    onChange={(e) => handleMarkChange(student.id, e.target.value)}
                    className={cn(
                      "w-24 text-center font-bold text-base h-11 shrink-0",
                      marks === '' ? "border-slate-200" : "border-indigo-300 bg-indigo-50/30 text-indigo-700"
                    )}
                    placeholder={`/${exam?.maxMarks}`}
                  />
                  <Input
                    placeholder="Remarks (optional)"
                    value={subResult?.remarks || ''}
                    disabled={readOnly}
                    onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                    className="flex-1 h-11 text-sm"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky save */}
        {!readOnly && (
          <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-white border-t border-slate-100 shadow-2xl z-50">
            <Button
              onClick={handleSaveAll}
              disabled={saving}
              loading={saving}
              className="w-full !py-3.5"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : `Save Results (${Object.keys(results).length})`}
            </Button>
          </div>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{exam?.name} Marks Entry</h1>
            <p className="text-slate-500">
              {subject?.name} ({subject?.code}) · Max Marks: {exam?.maxMarks}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!readOnly && (
            <Button
              variant="primary"
              onClick={handleSaveAll}
              disabled={saving}
              className="shadow-lg shadow-indigo-100"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Results
            </Button>
          )}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center">
            <User className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Students</p>
            <p className="text-xl font-bold text-slate-900">{students.length}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Entered</p>
            <p className="text-xl font-bold text-slate-900">
              {Object.keys(results).length}
            </p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-orange-50 flex items-center justify-center">
            <Calculator className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Grading Scale</p>
            <p className="text-lg font-bold text-slate-900 truncate">{gradingScale?.name || 'Standard'}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 text-rose-600 p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 text-emerald-600 p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">Results saved successfully!</p>
        </div>
      )}

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="font-semibold text-slate-900">Student List</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search student..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Admission No</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-32 text-center">Marks Obtained</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24 text-center">Grade</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => {
                  const studentResult = results[student.id];
                  const subResult = studentResult?.subjectResults?.find(r => r.subjectId === exam?.subjectId);
                  const marks = subResult?.marksObtained || '';
                  
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={student.name} size="sm" />
                          <span className="font-semibold text-slate-900">{student.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-slate-500">{student.admissionNumber}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {classesMap[student.classId] || student.classId} {student.section && `- ${student.section}`}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              max={exam?.maxMarks}
                              step="0.5"
                              value={marks}
                              disabled={readOnly}
                              onChange={(e) => handleMarkChange(student.id, e.target.value)}
                              className={cn(
                                "w-24 text-center font-bold text-lg h-11",
                                marks === '' ? "border-slate-200" : "border-indigo-200 bg-indigo-50/30 text-indigo-700",
                                readOnly && "bg-slate-50 cursor-not-allowed opacity-80"
                              )}
                              placeholder={`/ ${exam?.maxMarks}`}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <Badge 
                            variant={
                              (subResult?.grade || '') === 'F' ? 'error' : 
                              ['A+', 'A', 'B+'].includes(subResult?.grade || '') ? 'success' : 'indigo'
                            }
                            className="w-10 h-10 flex items-center justify-center text-lg rounded-full"
                          >
                            {subResult?.grade || '-'}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-6 py-4 min-w-[200px]">
                        <Input
                          placeholder={readOnly ? "" : "Ex: Good performance"}
                          value={subResult?.remarks || ''}
                          disabled={readOnly}
                          onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                          className={cn(
                            "bg-transparent border-transparent hover:border-slate-200 focus:bg-white",
                            readOnly && "cursor-not-allowed"
                          )}
                        />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                    No students found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </>
  );
}
