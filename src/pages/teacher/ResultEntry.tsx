import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, Exam, Student, ExamResult, GradingScale, Subject, SubjectResultStatus } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import { logActivity } from '../../services/activityService';
import {
  bulkSaveExamResults, publishExamResults, unpublishExamResults,
  ConcurrentEditError, calculateGradeFromScale,
} from '../../services/examService';
import {
  ArrowLeft, Save, Search, AlertCircle, CheckCircle2, Loader2,
  User, Calculator, Send, EyeOff,
} from 'lucide-react';
import { Button, Input, Badge, Avatar } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { cn } from '../../lib/utils';

export default function ResultEntry({ user }: { user: UserProfile }) {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  
  const [exam, setExam] = useState<Exam | null>(null);
  const [gradingScale, setGradingScale] = useState<GradingScale | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [results, setResults] = useState<Record<string, Partial<ExamResult>>>({});
  // Track the version each result was loaded at so we can detect concurrent edits on save
  const [resultVersions, setResultVersions] = useState<Record<string, number>>({});
  // Track which rows the teacher actually touched, so we only save those
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { classesMap } = useData();
  const { isReadOnly } = usePermissions(user?.role || 'student');
  const readOnly = isReadOnly('exams');
  const { showToast } = useToast();

  const isPublished = exam?.status === 'published';
  const canPublish = user.role === 'super_admin' || user.role === 'principal' || user.role === 'office_staff';

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

      // 2. Fetch Grading Scale (FIX: collection is 'gradingScales', not 'grading_scales')
      if (examData.gradingScaleId) {
        const gsDoc = await getDoc(doc(db, 'gradingScales', examData.gradingScaleId));
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

      // 5. Fetch Existing Results — read primarily from `examResults` (canonical) and
      // fall back to legacy `results` so older entries written by the broken pre-fix
      // ResultEntry remain visible. On next save they migrate automatically.
      const [canonSnap, legacySnap] = await Promise.all([
        getDocs(query(collection(db, 'examResults'), where('examId', '==', examId))),
        getDocs(query(collection(db, 'results'), where('examId', '==', examId))).catch(() => null),
      ]);
      const existingResults: Record<string, Partial<ExamResult>> = {};
      const versions: Record<string, number> = {};
      // Legacy first so canonical overrides
      legacySnap?.forEach(d => {
        const data = d.data() as ExamResult;
        existingResults[data.studentId] = data;
        versions[data.studentId] = 0; // treat as new in canonical collection
      });
      canonSnap.forEach(d => {
        const data = d.data() as ExamResult;
        existingResults[data.studentId] = data;
        versions[data.studentId] = data.version ?? 0;
      });
      setResults(existingResults);
      setResultVersions(versions);
      setDirtyRows(new Set());

    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'exam_results');
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const calculateGrade = (marks: number, maxMarks: number) => {
    if (!gradingScale || maxMarks <= 0) return 'N/A';
    return calculateGradeFromScale(marks, maxMarks, gradingScale.ranges);
  };

  const markDirty = (studentId: string) =>
    setDirtyRows(prev => { const next = new Set(prev); next.add(studentId); return next; });

  const upsertSubjectResult = (
    prev: Record<string, Partial<ExamResult>>,
    studentId: string,
    patch: Partial<{ marksObtained: number; remarks: string; status: SubjectResultStatus }>,
  ) => {
    const student = students.find(s => s.id === studentId);
    const existing = prev[studentId] || {
      examId,
      studentId,
      classId: student?.classId,
      subjectResults: [],
    };
    const subjectResults = [...(existing.subjectResults || [])];
    const subIdx = subjectResults.findIndex(r => r.subjectId === exam?.subjectId);
    const existingSub = subIdx >= 0 ? subjectResults[subIdx] : {
      subjectId: exam?.subjectId || '',
      marksObtained: 0,
      maxMarks: exam?.maxMarks || 100,
      grade: '',
      status: 'present' as SubjectResultStatus,
    };
    const updatedSub = {
      ...existingSub,
      ...patch,
    };
    // Recompute grade based on status — absent/exempt has no grade
    if (updatedSub.status === 'absent') updatedSub.grade = 'AB';
    else if (updatedSub.status === 'exempt') updatedSub.grade = 'EX';
    else updatedSub.grade = calculateGrade(updatedSub.marksObtained, updatedSub.maxMarks);

    if (subIdx >= 0) subjectResults[subIdx] = updatedSub;
    else subjectResults.push(updatedSub);

    // Recompute totals — exclude absent/exempt from total denominator
    const counted = subjectResults.filter(r => !r.status || r.status === 'present');
    const totalMarks = counted.reduce((acc, r) => acc + (r.marksObtained || 0), 0);
    const maxTotalMarks = counted.reduce((acc, r) => acc + (r.maxMarks || 0), 0);
    const percentage = maxTotalMarks > 0 ? (totalMarks / maxTotalMarks) * 100 : 0;

    return {
      ...prev,
      [studentId]: {
        ...existing,
        subjectResults,
        totalMarks,
        percentage,
        overallGrade: maxTotalMarks > 0 ? calculateGrade(totalMarks, maxTotalMarks) : 'N/A',
        updatedAt: new Date().toISOString(),
      },
    };
  };

  const handleMarkChange = (studentId: string, marks: string) => {
    const marksNum = parseFloat(marks);
    if (isNaN(marksNum) && marks !== '') return;
    if (marksNum > (exam?.maxMarks || 100)) return;
    if (marksNum < 0) return;
    markDirty(studentId);
    setResults(prev => upsertSubjectResult(prev, studentId, {
      marksObtained: isNaN(marksNum) ? 0 : marksNum,
      status: 'present',
    }));
  };

  const handleStatusChange = (studentId: string, status: SubjectResultStatus) => {
    markDirty(studentId);
    setResults(prev => upsertSubjectResult(prev, studentId, {
      status,
      marksObtained: status === 'present' ? (prev[studentId]?.subjectResults?.find(r => r.subjectId === exam?.subjectId)?.marksObtained ?? 0) : 0,
    }));
  };

  const handleRemarksChange = (studentId: string, remarks: string) => {
    markDirty(studentId);
    setResults(prev => upsertSubjectResult(prev, studentId, { remarks }));
  };

  const handleSaveAll = async () => {
    if (!examId || !user) return;
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      // Only save rows the teacher actually touched in this session
      const dirtyIds = Array.from(dirtyRows);
      if (dirtyIds.length === 0) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
        showToast('No changes to save', 'info');
        return;
      }

      const payloads = dirtyIds
        .map(sid => {
          const r = results[sid];
          if (!r) return null;
          return {
            result: { ...r, examId, studentId: sid } as any,
            expectedVersion: resultVersions[sid] ?? 0,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const { saved, conflicts, errors } = await bulkSaveExamResults(payloads, user);

      if (conflicts > 0) {
        setError(`${conflicts} record(s) were modified by someone else and were not saved. Refresh to see the latest version.`);
        showToast(`${conflicts} concurrent edit conflict(s) — refresh and retry`, 'error');
      }
      if (errors.length > 0) {
        showToast(`${errors.length} other error(s) occurred`, 'error');
      }

      // Flip exam to 'completed' if it was still 'scheduled' and we saved something
      if (exam?.status === 'scheduled' && saved > 0) {
        await updateDoc(doc(db, 'exams', examId), { status: 'completed' });
        setExam(prev => prev ? { ...prev, status: 'completed' } : prev);
      }

      logActivity(user, 'Exam Marks Updated', 'Teachers',
        `Saved ${saved} mark(s) for ${exam?.name} - ${subject?.name}` +
        (conflicts > 0 ? ` (${conflicts} skipped due to conflicts)` : ''),
        { examId, subjectId: exam?.subjectId, examName: exam?.name, savedCount: saved, conflictCount: conflicts });

      if (saved > 0 && conflicts === 0 && errors.length === 0) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
      // Reload to pick up new versions for the saved rows
      await fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'examResults');
      setError('Failed to save results');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!examId || !user || publishing) return;
    if (dirtyRows.size > 0) {
      showToast('Save your changes before publishing', 'error');
      return;
    }
    const ok = window.confirm(
      'Publish results to students and parents? They will be able to see grades immediately.',
    );
    if (!ok) return;
    setPublishing(true);
    try {
      const count = await publishExamResults(examId, user);
      setExam(prev => prev ? { ...prev, status: 'published', publishedAt: new Date().toISOString(), publishedBy: user.uid } : prev);
      logActivity(user, 'Exam Results Published', 'Teachers',
        `Published ${count} result(s) for ${exam?.name}`,
        { examId, count });
      showToast(`Published ${count} result(s)`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to publish', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!examId || !user || publishing) return;
    const ok = window.confirm('Unpublish results? They will be hidden from students and parents.');
    if (!ok) return;
    setPublishing(true);
    try {
      const count = await unpublishExamResults(examId, user);
      setExam(prev => prev ? { ...prev, status: 'completed' } : prev);
      logActivity(user, 'Exam Results Unpublished', 'Teachers',
        `Unpublished ${count} result(s) for ${exam?.name}`,
        { examId, count });
      showToast(`Unpublished ${count} result(s)`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to unpublish', 'error');
    } finally {
      setPublishing(false);
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
                <div className="flex gap-2 items-center mb-2">
                  <select
                    value={subResult?.status || 'present'}
                    disabled={readOnly || isPublished}
                    onChange={(e) => handleStatusChange(student.id, e.target.value as SubjectResultStatus)}
                    className="h-11 px-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white"
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="exempt">Exempt</option>
                  </select>
                  <Input
                    type="number"
                    min="0"
                    max={exam?.maxMarks}
                    step="0.5"
                    value={subResult?.status && subResult.status !== 'present' ? '' : marks}
                    disabled={readOnly || isPublished || (subResult?.status && subResult.status !== 'present')}
                    onChange={(e) => handleMarkChange(student.id, e.target.value)}
                    className={cn(
                      "w-20 text-center font-bold text-base h-11 shrink-0",
                      marks === '' ? "border-slate-200" : "border-indigo-300 bg-indigo-50/30 text-indigo-700"
                    )}
                    placeholder={`/${exam?.maxMarks}`}
                  />
                </div>
                <Input
                  placeholder="Remarks (optional)"
                  value={subResult?.remarks || ''}
                  disabled={readOnly || isPublished}
                  onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                  className="w-full h-10 text-sm"
                />
              </div>
            );
          })}
        </div>

        {/* Sticky save / publish bar */}
        {!readOnly && (
          <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-white border-t border-slate-100 shadow-2xl z-50 flex gap-2">
            {!isPublished && (
              <Button
                onClick={handleSaveAll}
                disabled={saving || dirtyRows.size === 0}
                loading={saving}
                className="flex-1 !py-3.5"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : `Save${dirtyRows.size > 0 ? ` (${dirtyRows.size})` : ''}`}
              </Button>
            )}
            {canPublish && !isPublished && (
              <Button
                onClick={handlePublish}
                disabled={publishing || dirtyRows.size > 0 || Object.keys(results).length === 0}
                variant="secondary"
                className="flex-1 !py-3.5 border-emerald-300 text-emerald-700"
              >
                <Send className="w-4 h-4 mr-2" />
                {publishing ? '…' : 'Publish'}
              </Button>
            )}
            {canPublish && isPublished && (
              <Button
                onClick={handleUnpublish}
                disabled={publishing}
                variant="secondary"
                className="flex-1 !py-3.5 border-amber-300 text-amber-700"
              >
                <EyeOff className="w-4 h-4 mr-2" />
                {publishing ? '…' : 'Unpublish'}
              </Button>
            )}
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
          {isPublished && (
            <Badge variant="success" className="px-3 py-1.5 text-xs">PUBLISHED</Badge>
          )}
          {!readOnly && !isPublished && (
            <Button
              variant="primary"
              onClick={handleSaveAll}
              disabled={saving || dirtyRows.size === 0}
              className="shadow-lg shadow-indigo-100"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Results {dirtyRows.size > 0 && `(${dirtyRows.size})`}
            </Button>
          )}
          {canPublish && !isPublished && (
            <Button
              variant="secondary"
              onClick={handlePublish}
              disabled={publishing || dirtyRows.size > 0 || Object.keys(results).length === 0}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <Send className="w-4 h-4 mr-2" />
              {publishing ? 'Publishing...' : 'Publish Results'}
            </Button>
          )}
          {canPublish && isPublished && (
            <Button
              variant="secondary"
              onClick={handleUnpublish}
              disabled={publishing}
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <EyeOff className="w-4 h-4 mr-2" />
              {publishing ? 'Unpublishing...' : 'Unpublish'}
            </Button>
          )}
        </div>
      </div>

      {isPublished && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold">Results are published</p>
            <p className="text-xs">Students and parents can now see these grades. To edit marks, unpublish first.</p>
          </div>
        </div>
      )}

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
                        <div className="flex justify-center items-center gap-2">
                          <select
                            value={subResult?.status || 'present'}
                            disabled={readOnly || isPublished}
                            onChange={(e) => handleStatusChange(student.id, e.target.value as SubjectResultStatus)}
                            className="h-11 px-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 bg-white"
                          >
                            <option value="present">Present</option>
                            <option value="absent">Absent</option>
                            <option value="exempt">Exempt</option>
                          </select>
                          <Input
                            type="number"
                            min="0"
                            max={exam?.maxMarks}
                            step="0.5"
                            value={subResult?.status && subResult.status !== 'present' ? '' : marks}
                            disabled={readOnly || isPublished || (subResult?.status && subResult.status !== 'present')}
                            onChange={(e) => handleMarkChange(student.id, e.target.value)}
                            className={cn(
                              "w-20 text-center font-bold text-lg h-11",
                              marks === '' ? "border-slate-200" : "border-indigo-200 bg-indigo-50/30 text-indigo-700",
                              (readOnly || isPublished) && "bg-slate-50 cursor-not-allowed opacity-80"
                            )}
                            placeholder={`/ ${exam?.maxMarks}`}
                          />
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
                          disabled={readOnly || isPublished}
                          onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                          className={cn(
                            "bg-transparent border-transparent hover:border-slate-200 focus:bg-white",
                            (readOnly || isPublished) && "cursor-not-allowed"
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
