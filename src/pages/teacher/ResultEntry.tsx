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
  notifyParentsOfPublishedResults,
  ConcurrentEditError, calculateGradeFromScale,
} from '../../services/examService';
import {
  ArrowLeft, Save, AlertCircle, CheckCircle2, Loader2,
  User, Send, EyeOff, MessageCircle, Search,
} from 'lucide-react';
import { Input, Avatar } from '../../components/ui';
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
  const [resultVersions, setResultVersions] = useState<Record<string, number>>({});
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notifying, setNotifying] = useState(false);
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
      const examDoc = await getDoc(doc(db, 'exams', examId));
      if (!examDoc.exists()) {
        setError('Exam not found');
        setLoading(false);
        return;
      }
      const examData = { id: examDoc.id, ...examDoc.data() } as Exam;
      setExam(examData);

      if (examData.gradingScaleId) {
        const gsDoc = await getDoc(doc(db, 'gradingScales', examData.gradingScaleId));
        if (gsDoc.exists()) {
          setGradingScale({ id: gsDoc.id, ...gsDoc.data() } as GradingScale);
        }
      }

      if (examData.subjectId) {
        const subDoc = await getDoc(doc(db, 'subjects', examData.subjectId));
        if (subDoc.exists()) {
          setSubject({ id: subDoc.id, ...subDoc.data() } as Subject);
        }
      }

      const studentsPromises = examData.classIds.map(classId =>
        getDocs(query(collection(db, 'students'), where('classId', '==', classId)))
      );
      const studentSnapshots = await Promise.all(studentsPromises);
      const allStudents: Student[] = [];
      studentSnapshots.forEach(snap => {
        snap.forEach(d => {
          allStudents.push({ id: d.id, ...d.data() } as Student);
        });
      });
      setStudents(allStudents.sort((a, b) => a.name.localeCompare(b.name)));

      const [canonSnap, legacySnap] = await Promise.all([
        getDocs(query(collection(db, 'examResults'), where('examId', '==', examId))),
        getDocs(query(collection(db, 'results'), where('examId', '==', examId))).catch(() => null),
      ]);
      const existingResults: Record<string, Partial<ExamResult>> = {};
      const versions: Record<string, number> = {};
      legacySnap?.forEach(d => {
        const data = d.data() as ExamResult;
        existingResults[data.studentId] = data;
        versions[data.studentId] = 0;
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
    const updatedSub = { ...existingSub, ...patch };
    if (updatedSub.status === 'absent') updatedSub.grade = 'AB';
    else if (updatedSub.status === 'exempt') updatedSub.grade = 'EX';
    else updatedSub.grade = calculateGrade(updatedSub.marksObtained, updatedSub.maxMarks);

    if (subIdx >= 0) subjectResults[subIdx] = updatedSub;
    else subjectResults.push(updatedSub);

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
      showToast(`Published ${count} result(s). Use "Notify Parents" to send WhatsApp updates when ready.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to publish', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleNotify = async () => {
    if (!examId || !user || notifying) return;
    const ok = window.confirm(
      'Send a WhatsApp notification to all parents whose children have published results for this exam?',
    );
    if (!ok) return;
    setNotifying(true);
    try {
      const report = await notifyParentsOfPublishedResults(examId);
      logActivity(user, 'Exam Result Notifications Sent', 'Teachers',
        `Sent ${report.sent}/${report.attempted} WhatsApp notifications (${report.failed} failed) for ${exam?.name}`,
        { examId, ...report });
      if (report.attempted === 0) {
        showToast('No parents with phone numbers to notify', 'info');
      } else {
        showToast(
          `Notified ${report.sent} parent(s)${report.failed ? ` · ${report.failed} failed` : ''}`,
          report.failed ? 'info' : 'success',
        );
      }
    } catch (e: any) {
      showToast(e?.message || 'Notification batch failed', 'error');
    } finally {
      setNotifying(false);
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

  const gradeColor = (grade: string) => {
    if (!grade || grade === '-' || grade === 'N/A') return 'var(--ink-3)';
    if (grade === 'F' || grade === 'AB') return 'var(--coral)';
    if (['A+', 'A', 'B+'].includes(grade)) return 'var(--leaf)';
    return 'var(--ink)';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}>
        <Loader2 style={{ width: 32, height: 32, color: 'var(--accent)' }} className="animate-spin" />
        <p className="muted">Loading exam and student data…</p>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header area: back arrow + exam name + chips */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="icon-btn"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>{exam?.name ?? 'Marks Entry'}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {subject && (
                <span className="chip" style={{ fontSize: 11 }}>{subject.name}{subject.code ? ` (${subject.code})` : ''}</span>
              )}
              {exam?.classIds?.map(cid => (
                <span key={cid} className="chip" style={{ fontSize: 11 }}>{classesMap[cid] || cid}</span>
              ))}
            </div>
          </div>
        </div>
        {isPublished && (
          <span
            className="chip"
            style={{ fontSize: 11, fontWeight: 700, color: 'var(--leaf)', background: '#eafaf0', borderColor: 'transparent' }}
          >
            Published
          </span>
        )}
      </div>

      <div className="pad" style={{ paddingTop: 12 }}>
        <div className="stack">

          {/* Exam info card */}
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Exam Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { label: 'Exam', value: exam?.name },
                { label: 'Date', value: exam?.date ? new Date(exam.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                { label: 'Max Marks', value: exam?.maxMarks ?? '—' },
                { label: 'Grading Scale', value: gradingScale?.name || 'Standard' },
                { label: 'Status', value: isPublished ? 'Published' : exam?.status ?? '—' },
              ].map((row, i, arr) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--line-2)' : 'none',
                  }}
                >
                  <span className="muted tiny">{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{String(row.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Error / success inline messages */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fff0ee', borderRadius: 10, border: '1px solid #ffd5ce' }}>
              <AlertCircle size={16} style={{ color: 'var(--coral)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--coral)' }}>{error}</span>
            </div>
          )}
          {success && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#eafaf0', borderRadius: 10, border: '1px solid #c5efd4' }}>
              <CheckCircle2 size={16} style={{ color: 'var(--leaf)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--leaf)' }}>Results saved successfully!</span>
            </div>
          )}

          {/* Search card */}
          <div className="card" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={16} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search student by name or admission no…"
                style={{
                  flex: 1, border: 'none', outline: 'none', fontSize: 14,
                  background: 'transparent', color: 'var(--ink)',
                  fontFamily: 'var(--body)',
                }}
              />
            </div>
          </div>

          {/* Mobile: stack of cards */}
          <div className="lg:hidden stack">
            {filteredStudents.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px 16px' }}>
                <User size={32} style={{ color: 'var(--ink-3)', margin: '0 auto 8px' }} />
                <p className="muted" style={{ fontSize: 14 }}>No students found.</p>
              </div>
            ) : filteredStudents.map((student) => {
              const studentResult = results[student.id];
              const subResult = studentResult?.subjectResults?.find(r => r.subjectId === exam?.subjectId);
              const marks = subResult?.marksObtained ?? '';
              const grade = subResult?.grade || '';
              const isDirty = dirtyRows.has(student.id);

              return (
                <div key={student.id} className="card" style={{ position: 'relative' }}>
                  {isDirty && (
                    <span
                      style={{
                        position: 'absolute', top: 10, right: 10, width: 8, height: 8,
                        borderRadius: '50%', background: 'var(--accent)',
                      }}
                    />
                  )}
                  {/* Name + admission */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <Avatar name={student.name} size="sm" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{student.name}</div>
                      <div className="muted tiny mono">#{student.admissionNumber}</div>
                    </div>
                    {/* Auto-shown grade chip */}
                    {grade && (
                      <span
                        className="chip"
                        style={{
                          fontSize: 14, fontWeight: 700, minWidth: 40, justifyContent: 'center',
                          color: gradeColor(grade),
                          background: grade === 'F' || grade === 'AB' ? '#fff0ee' : grade && ['A+','A','B+'].includes(grade) ? '#eafaf0' : 'var(--cream-2)',
                          borderColor: 'transparent',
                        }}
                      >
                        {grade}
                      </span>
                    )}
                  </div>

                  {/* Status toggle + marks input */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <select
                      value={subResult?.status || 'present'}
                      disabled={readOnly || isPublished}
                      onChange={(e) => handleStatusChange(student.id, e.target.value as SubjectResultStatus)}
                      style={{
                        height: 44, padding: '0 10px', borderRadius: 10,
                        border: '1px solid var(--line)', fontSize: 13, fontWeight: 600,
                        background: 'var(--paper)', color: 'var(--ink)',
                        cursor: readOnly || isPublished ? 'not-allowed' : 'pointer',
                        fontFamily: 'var(--body)',
                      }}
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="exempt">Exempt</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      max={exam?.maxMarks}
                      step="0.5"
                      value={subResult?.status && subResult.status !== 'present' ? '' : marks}
                      disabled={readOnly || isPublished || (subResult?.status != null && subResult.status !== 'present')}
                      onChange={(e) => handleMarkChange(student.id, e.target.value)}
                      placeholder={`/ ${exam?.maxMarks}`}
                      style={{
                        width: 90, height: 44, textAlign: 'center', fontWeight: 700,
                        fontSize: 18, borderRadius: 10, border: '1px solid var(--line)',
                        background: marks === '' ? 'var(--paper)' : '#f0f3ff',
                        color: marks === '' ? 'var(--ink)' : 'var(--accent)',
                        outline: 'none', fontFamily: 'var(--display)',
                        cursor: readOnly || isPublished ? 'not-allowed' : 'text',
                      }}
                    />
                  </div>

                  {/* Remarks */}
                  <input
                    type="text"
                    placeholder="Remarks (optional)"
                    value={subResult?.remarks || ''}
                    disabled={readOnly || isPublished}
                    onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                    style={{
                      width: '100%', height: 38, padding: '0 10px',
                      borderRadius: 10, border: '1px solid var(--line-2)',
                      fontSize: 13, background: 'var(--paper)', color: 'var(--ink)',
                      outline: 'none', fontFamily: 'var(--body)',
                      cursor: readOnly || isPublished ? 'not-allowed' : 'text',
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Desktop: table inside hidden-on-mobile wrapper */}
          <div className="hidden lg:block overflow-x-auto" style={{ borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'var(--cream-2)', borderBottom: '1px solid var(--line)' }}>
                  {['Student', 'Marks', 'Grade', 'Status', 'Remarks'].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '12px 16px', textAlign: 'left',
                        fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 500,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ink-3)', fontStyle: 'italic' }}
                    >
                      No students found matching your search.
                    </td>
                  </tr>
                ) : filteredStudents.map((student, idx) => {
                  const studentResult = results[student.id];
                  const subResult = studentResult?.subjectResults?.find(r => r.subjectId === exam?.subjectId);
                  const marks = subResult?.marksObtained ?? '';
                  const grade = subResult?.grade || '';
                  const isDirty = dirtyRows.has(student.id);

                  return (
                    <tr
                      key={student.id}
                      style={{
                        borderBottom: idx < filteredStudents.length - 1 ? '1px solid var(--line-2)' : 'none',
                        background: isDirty ? '#fdfbff' : 'var(--paper)',
                      }}
                    >
                      {/* Name */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={student.name} size="sm" />
                          <div>
                            <div style={{ fontWeight: 600 }}>{student.name}</div>
                            <div className="muted tiny mono">#{student.admissionNumber}</div>
                          </div>
                        </div>
                      </td>
                      {/* Marks input */}
                      <td style={{ padding: '12px 16px' }}>
                        <input
                          type="number"
                          min="0"
                          max={exam?.maxMarks}
                          step="0.5"
                          value={subResult?.status && subResult.status !== 'present' ? '' : marks}
                          disabled={readOnly || isPublished || (subResult?.status != null && subResult.status !== 'present')}
                          onChange={(e) => handleMarkChange(student.id, e.target.value)}
                          placeholder={`/ ${exam?.maxMarks}`}
                          style={{
                            width: 90, height: 40, textAlign: 'center', fontWeight: 700,
                            fontSize: 16, borderRadius: 8, border: '1px solid var(--line)',
                            background: marks === '' ? 'var(--paper)' : '#f0f3ff',
                            color: marks === '' ? 'var(--ink)' : 'var(--accent)',
                            outline: 'none', fontFamily: 'var(--display)',
                            cursor: readOnly || isPublished ? 'not-allowed' : 'text',
                          }}
                        />
                      </td>
                      {/* Grade */}
                      <td style={{ padding: '12px 16px' }}>
                        {grade ? (
                          <span
                            className="chip"
                            style={{
                              fontSize: 13, fontWeight: 700,
                              color: gradeColor(grade),
                              background: grade === 'F' || grade === 'AB' ? '#fff0ee' : grade && ['A+','A','B+'].includes(grade) ? '#eafaf0' : 'var(--cream-2)',
                              borderColor: 'transparent',
                            }}
                          >
                            {grade}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <select
                          value={subResult?.status || 'present'}
                          disabled={readOnly || isPublished}
                          onChange={(e) => handleStatusChange(student.id, e.target.value as SubjectResultStatus)}
                          style={{
                            height: 36, padding: '0 8px', borderRadius: 8,
                            border: '1px solid var(--line)', fontSize: 13, fontWeight: 500,
                            background: 'var(--paper)', color: 'var(--ink)',
                            cursor: readOnly || isPublished ? 'not-allowed' : 'pointer',
                            fontFamily: 'var(--body)',
                          }}
                        >
                          <option value="present">Present</option>
                          <option value="absent">Absent</option>
                          <option value="exempt">Exempt</option>
                        </select>
                      </td>
                      {/* Remarks */}
                      <td style={{ padding: '12px 16px', minWidth: 180 }}>
                        <input
                          type="text"
                          placeholder={readOnly ? '' : 'Ex: Good performance'}
                          value={subResult?.remarks || ''}
                          disabled={readOnly || isPublished}
                          onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                          style={{
                            width: '100%', height: 36, padding: '0 10px',
                            borderRadius: 8, border: '1px solid transparent',
                            fontSize: 13, background: 'transparent', color: 'var(--ink)',
                            outline: 'none', fontFamily: 'var(--body)',
                            cursor: readOnly || isPublished ? 'not-allowed' : 'text',
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'var(--paper)'; }}
                          onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {/* Sticky bottom action bar */}
      {!readOnly && (
        <div
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'var(--cream)', borderTop: '1px solid var(--line)',
            padding: '12px var(--pad)',
            display: 'flex', gap: 10, zIndex: 50,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
          }}
        >
          {!isPublished && (
            <button
              className="btn accent"
              onClick={handleSaveAll}
              disabled={saving || dirtyRows.size === 0}
              style={{ flex: 1 }}
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {saving ? 'Saving…' : `Save All${dirtyRows.size > 0 ? ` (${dirtyRows.size})` : ''}`}
            </button>
          )}
          {canPublish && !isPublished && (
            <button
              className="btn ghost"
              onClick={handlePublish}
              disabled={publishing || dirtyRows.size > 0 || Object.keys(results).length === 0}
              style={{ flex: 1, color: 'var(--leaf)', borderColor: 'var(--leaf)' }}
            >
              <Send size={16} />
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          )}
          {canPublish && isPublished && (
            <>
              <button
                className="btn ghost"
                onClick={handleNotify}
                disabled={notifying}
                style={{ flex: 1, color: 'var(--leaf)', borderColor: 'var(--leaf)' }}
              >
                <MessageCircle size={16} />
                {notifying ? 'Notifying…' : 'Notify Parents'}
              </button>
              <button
                className="btn ghost"
                onClick={handleUnpublish}
                disabled={publishing}
                style={{ flex: 1, color: 'var(--coral)', borderColor: 'var(--coral)' }}
              >
                <EyeOff size={16} />
                {publishing ? '…' : 'Unpublish'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
