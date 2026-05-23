import { UserProfile, Timetable, LessonLog, SubstituteAssignment } from '../../types';
import { Calendar, Users, Clock, Edit3, BookOpen, CheckSquare, Upload, File, X, Save, AlertTriangle, UserCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, setDoc, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { useData } from '../../contexts/DataContext';
import { cn } from '../../lib/utils';
import { logActivity } from '../../services/activityService';
import { validateLessonInput, sanitizeFileName, ConcurrentEditError, updateLessonLog } from '../../services/lessonLogService';
import {
  Spinner,
  Modal,
  FormField,
  Input,
  Textarea,
  Button,
} from '../../components/ui';
import { useToast } from '../../components/Toast';

interface TeacherTimetableProps {
  user: UserProfile;
}

export default function TeacherTimetable({ user }: TeacherTimetableProps) {
  const { teacherData, timetableConfig: config, timetables, subjectsMap: subjects, classesMap: classes, loading: globalLoading } = useData();
  const [localLoading, setLocalLoading] = useState(false);
  const { showToast } = useToast();

  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const [selectedDay, setSelectedDay] = useState<string>(todayName);

  const [approvedLeaveDays, setApprovedLeaveDays] = useState<Set<string>>(new Set());
  const [substituteByDate, setSubstituteByDate] = useState<Record<string, SubstituteAssignment[]>>({});

  useEffect(() => {
    const tid = teacherData?.id || user.uid;
    if (!tid) return;

    const loadLeaveData = async () => {
      try {
        const today = new Date();
        const ninetyDaysAgo = new Date(today); ninetyDaysAgo.setDate(today.getDate() - 90);
        const ninetyDaysOut = new Date(today); ninetyDaysOut.setDate(today.getDate() + 90);
        const fromIso = ninetyDaysAgo.toISOString().split('T')[0];
        const toIso = ninetyDaysOut.toISOString().split('T')[0];

        const leavesQ = query(
          collection(db, 'teacherLeaves'),
          where('teacherId', '==', tid),
          where('status', '==', 'approved')
        );
        const leavesSnap = await getDocs(leavesQ);
        const leaveDays = new Set<string>();
        leavesSnap.docs.forEach(d => {
          const data = d.data();
          const start = new Date(data.startDate);
          const end = new Date(data.endDate);
          for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
            leaveDays.add(dt.toISOString().split('T')[0]);
          }
        });
        setApprovedLeaveDays(leaveDays);

        const subQ = query(
          collection(db, 'substituteAssignments'),
          where('substituteTeacherId', '==', tid),
          where('date', '>=', fromIso),
          where('date', '<=', toIso)
        );
        const subSnap = await getDocs(subQ);
        const byDate: Record<string, SubstituteAssignment[]> = {};
        subSnap.docs.forEach(d => {
          const sa = { id: d.id, ...d.data() } as SubstituteAssignment;
          if (!byDate[sa.date]) byDate[sa.date] = [];
          byDate[sa.date].push(sa);
        });
        setSubstituteByDate(byDate);
      } catch {
        // Non-fatal
      }
    };
    loadLeaveData();
  }, [teacherData?.id, user.uid]);

  const getIsoForWeekday = (dayName: string): string => {
    const today = new Date();
    const dayMap: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const targetDay = dayMap[dayName] ?? today.getDay();
    const diff = targetDay - today.getDay();
    const target = new Date(today);
    target.setDate(today.getDate() + diff);
    return target.toISOString().split('T')[0];
  };

  const isOnLeaveDay = (dayName: string) => approvedLeaveDays.has(getIsoForWeekday(dayName));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{cw: number, hw: number}>({ cw: 0, hw: 0 });

  const [lessonData, setLessonData] = useState({
    topic: '',
    classwork: '',
    homework: '',
    classworkFile: null as File | null,
    homeworkFile: null as File | null,
  });
  const [logDate, setLogDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [existingVersion, setExistingVersion] = useState<number>(0);

  const getPeriod = (day: string, slotId: string) => {
    const tid = teacherData?.id || user.uid;
    for (const t of timetables) {
      const daySchedule = t.schedule?.find(s => s.day === day);
      if (daySchedule) {
        const p = daySchedule.periods?.find(p => p.slotId === slotId && p.teacherId === tid);
        if (p) return { ...p, classId: t.classId };
      }
    }
    return null;
  };

  const uploadFile = (file: File, path: string, type: 'cw' | 'hw'): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.size > 2 * 1024 * 1024) {
        reject(new Error('File size exceeds 2MB limit.'));
        return;
      }

      const fileRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(prev => ({ ...prev, [type]: progress }));
        },
        (error) => reject(error),
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  };

  const fetchExistingForDate = async (period: any, slot: any, date: string) => {
    const q = query(
      collection(db, 'lessonLogs'),
      where('teacherId', '==', (teacherData?.id || user.uid)),
      where('classId', '==', period.classId),
      where('slotId', '==', slot.id),
      where('date', '==', date)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      const data = docSnap.data() as LessonLog;
      setLessonData({
        topic: data.topic || '',
        classwork: data.classwork || '',
        homework: data.homework || '',
        classworkFile: null,
        homeworkFile: null,
      });
      setExistingVersion(data.version ?? 0);
      setSelectedPeriod((prev: any) => ({ ...prev, existingId: docSnap.id, topic: data.topic }));
    } else {
      setLessonData({ topic: '', classwork: '', homework: '', classworkFile: null, homeworkFile: null });
      setExistingVersion(0);
      setSelectedPeriod((prev: any) => ({ ...prev, existingId: null }));
    }
  };

  const handleOpenLog = async (period: any, slot: any) => {
    setSelectedPeriod({ ...period, slot });
    setLocalLoading(true);
    setUploadProgress({ cw: 0, hw: 0 });
    const today = new Date().toISOString().split('T')[0];
    setLogDate(today);

    try {
      await fetchExistingForDate(period, slot, today);
      setIsModalOpen(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'lessonLogs');
    } finally {
      setLocalLoading(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen || !selectedPeriod?.slot) return;
    fetchExistingForDate(selectedPeriod, selectedPeriod.slot, logDate).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDate]);

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriod || saving) return;

    const validationError = validateLessonInput({
      topic: lessonData.topic,
      classwork: lessonData.classwork,
      homework: lessonData.homework,
    });
    if (validationError) { showToast(validationError, 'error'); return; }

    const today = new Date().toISOString().split('T')[0];
    if (logDate > today) { showToast('Lesson date cannot be in the future', 'error'); return; }
    const fourteenDaysAgo = new Date(); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    if (logDate < fourteenDaysAgo.toISOString().split('T')[0]) {
      showToast('Lessons older than 14 days cannot be backfilled. Contact admin if needed.', 'error');
      return;
    }

    setSaving(true);
    try {
      const slot = selectedPeriod.slot || {};
      const activeTimetable = timetables.find(t => t.classId === selectedPeriod.classId);
      const uploadedFiles: { classworkFileUrl?: string; classworkFileName?: string; homeworkFileUrl?: string; homeworkFileName?: string } = {};

      const uploadPromises: Promise<unknown>[] = [];
      if (lessonData.classworkFile) {
        const safe = sanitizeFileName(lessonData.classworkFile.name);
        const path = `lessons/${logDate}/${selectedPeriod.classId}/classwork_${Date.now()}_${safe}`;
        uploadPromises.push(
          uploadFile(lessonData.classworkFile, path, 'cw').then(url => {
            uploadedFiles.classworkFileUrl = url;
            uploadedFiles.classworkFileName = lessonData.classworkFile!.name;
          })
        );
      }
      if (lessonData.homeworkFile) {
        const safe = sanitizeFileName(lessonData.homeworkFile.name);
        const path = `lessons/${logDate}/${selectedPeriod.classId}/homework_${Date.now()}_${safe}`;
        uploadPromises.push(
          uploadFile(lessonData.homeworkFile, path, 'hw').then(url => {
            uploadedFiles.homeworkFileUrl = url;
            uploadedFiles.homeworkFileName = lessonData.homeworkFile!.name;
          })
        );
      }
      if (uploadPromises.length > 0) {
        await Promise.all(uploadPromises);
      }

      if (selectedPeriod.existingId) {
        await updateLessonLog(
          selectedPeriod.existingId,
          existingVersion,
          {
            topic: lessonData.topic,
            classwork: lessonData.classwork,
            homework: lessonData.homework,
            ...uploadedFiles,
          },
          user,
        );
        logActivity(user, 'Updated Lesson Log', 'Teachers',
          `Updated log for ${subjects[selectedPeriod.subjectId]} - ${classes[selectedPeriod.classId]} (${logDate})`,
          { classId: selectedPeriod.classId, subjectId: selectedPeriod.subjectId, date: logDate });
      } else {
        const nowIso = new Date().toISOString();
        const newLog: any = {
          classId: selectedPeriod.classId,
          subjectId: selectedPeriod.subjectId,
          teacherId: teacherData?.id || user.uid,
          date: logDate,
          slotId: slot.id,
          slotLabel: slot.label || '',
          slotStartTime: slot.startTime || '',
          slotEndTime: slot.endTime || '',
          timetableVersion: activeTimetable?.version ?? null,
          topic: lessonData.topic.trim(),
          classwork: lessonData.classwork,
          homework: lessonData.homework,
          createdAt: nowIso,
          createdBy: user.uid,
          createdByName: user.name,
          updatedAt: nowIso,
          updatedBy: user.uid,
          updatedByName: user.name,
          version: 1,
          ...uploadedFiles,
        };
        await addDoc(collection(db, 'lessonLogs'), newLog);
        logActivity(user, 'Created Lesson Log', 'Teachers',
          `Created log for ${subjects[selectedPeriod.subjectId]} - ${classes[selectedPeriod.classId]} (${logDate})`,
          { classId: selectedPeriod.classId, subjectId: selectedPeriod.subjectId, date: logDate });
      }

      showToast('Lesson log saved successfully!', 'success');
      setIsModalOpen(false);
    } catch (err: any) {
      if (err instanceof ConcurrentEditError) {
        showToast(err.message, 'error');
        try { await fetchExistingForDate(selectedPeriod, selectedPeriod.slot, logDate); } catch {}
      } else if (err?.message?.startsWith('File size exceeds')) {
        showToast(err.message, 'error');
      } else {
        handleFirestoreError(err, OperationType.WRITE, 'lessonLogs');
      }
    } finally {
      setSaving(false);
    }
  };

  if (globalLoading && !teacherData && user.role === 'teacher') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Spinner size="lg" />
        <p className="muted text-sm animate-pulse">Loading your timetable...</p>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="pad">
          <p className="eyebrow">{selectedDay === todayName ? 'Today' : selectedDay}</p>
          <h1 className="display">Schedule</h1>
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: '2rem' }}>
        <div className="stack">
          {/* Day selector */}
          {config && (
            <div className="hscroll" style={{ gap: '0.5rem', paddingBottom: '0.25rem' }}>
              {config.days.map((day) => (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={cn('dpill', selectedDay === day ? 'today' : '', day === todayName ? 'on' : '')}
                  style={{ flexShrink: 0 }}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          )}

          {/* Leave banner */}
          {isOnLeaveDay(selectedDay) && (
            <div
              className="card"
              style={{
                padding: '0.875rem',
                borderLeft: '3px solid #F59E0B',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#D97706' }} />
              <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#92400E' }}>
                You are on approved leave. Your classes have been covered.
              </p>
            </div>
          )}

          {!config ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <Calendar className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ink-3)' }} />
              <p style={{ fontWeight: 700, color: 'var(--ink)' }}>Timetable not configured</p>
              <p className="muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>Contact the administrator.</p>
            </div>
          ) : (
            <div className="stack" style={{ gap: '0.5rem' }}>
              {config.slots.map((slot) => {
                if (slot.type === 'break') {
                  return (
                    <div
                      key={slot.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.875rem',
                        background: 'var(--cream-2)',
                        borderRadius: '0.75rem',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <p className="eyebrow">Short Break</p>
                      <p className="muted mono tiny">{slot.startTime}–{slot.endTime}</p>
                    </div>
                  );
                }
                if (slot.type === 'lunch') {
                  return (
                    <div
                      key={slot.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.875rem',
                        background: 'var(--cream-2)',
                        borderRadius: '0.75rem',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <p className="eyebrow">Lunch Break</p>
                      <p className="muted mono tiny">{slot.startTime}–{slot.endTime}</p>
                    </div>
                  );
                }

                const period = getPeriod(selectedDay, slot.id);
                const isoDay = getIsoForWeekday(selectedDay);
                const subForSlot = (substituteByDate[isoDay] || []).find(s => s.slotId === slot.id);
                const onLeave = isOnLeaveDay(selectedDay);

                if (!period && !subForSlot) {
                  return (
                    <div
                      key={slot.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 0.875rem',
                        background: 'transparent',
                        borderRadius: '0.75rem',
                        border: '1px dashed var(--line)',
                      }}
                    >
                      <div>
                        <p className="eyebrow">{slot.label}</p>
                        <p className="muted mono tiny" style={{ marginTop: '0.125rem' }}>{slot.startTime} – {slot.endTime}</p>
                      </div>
                      <p className="eyebrow" style={{ color: 'var(--ink-3)' }}>Free</p>
                    </div>
                  );
                }

                if (subForSlot && !period) {
                  return (
                    <div
                      key={slot.id}
                      className="card"
                      style={{ padding: '0.875rem', borderLeft: '3px solid #6366F1' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.375rem' }}>
                        <UserCheck className="w-3.5 h-3.5" style={{ color: '#6366F1' }} />
                        <p className="eyebrow" style={{ color: '#6366F1' }}>Covering for absent teacher</p>
                      </div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)' }}>
                        Class {classes[subForSlot.classId] || subForSlot.classId}
                      </p>
                      <p className="muted mono tiny">{slot.startTime} – {slot.endTime}</p>
                    </div>
                  );
                }

                if (period && onLeave) {
                  return (
                    <div
                      key={slot.id}
                      className="card"
                      style={{ padding: '0.875rem', borderLeft: '3px solid #F59E0B' }}
                    >
                      <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>{slot.label} · {slot.startTime}</p>
                      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)' }}>
                        {subjects[period.subjectId] || period.subjectId}
                      </p>
                      <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>
                        Class {classes[period.classId] || period.classId} · On Leave
                      </p>
                    </div>
                  );
                }

                if (period) {
                  return (
                    <button
                      key={slot.id}
                      onClick={() => handleOpenLog(period, slot)}
                      className="card"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.875rem',
                        borderLeft: '3px solid var(--ink)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>{slot.label} · {slot.startTime}</p>
                          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {subjects[period.subjectId] || period.subjectId}
                          </p>
                          <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>
                            Class {classes[period.classId] || period.classId}
                          </p>
                        </div>
                        <Edit3 className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-3)', marginTop: '0.25rem' }} />
                      </div>
                    </button>
                  );
                }

                return null;
              })}

              {/* Substitute coverage */}
              {(() => {
                const isoDay = getIsoForWeekday(selectedDay);
                const subs = substituteByDate[isoDay] || [];
                const subsNotInSlots = subs.filter(sa => !config.slots.find(sl => sl.id === sa.slotId && getPeriod(selectedDay, sl.id)));
                if (subsNotInSlots.length === 0) return null;
                return (
                  <div style={{ paddingTop: '0.5rem' }}>
                    <p className="section-head">Covering for absent teacher</p>
                    {subs.map(sa => {
                      const slot = config.slots.find(s => s.id === sa.slotId);
                      return (
                        <div
                          key={sa.id}
                          className="card"
                          style={{ padding: '0.875rem', borderLeft: '3px solid #6366F1', marginBottom: '0.5rem' }}
                        >
                          <p className="eyebrow" style={{ color: '#6366F1' }}>
                            {slot?.label || sa.slotId} · {slot?.startTime || ''}
                          </p>
                          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)', marginTop: '0.25rem' }}>
                            Class {classes[sa.classId] || sa.classId}
                          </p>
                          <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>Substitute duty</p>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Lesson Log Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Classwork & Homework Log"
        subtitle={selectedPeriod ? `${subjects[selectedPeriod.subjectId] || selectedPeriod.subjectId} • Class ${classes[selectedPeriod.classId] || selectedPeriod.classId} • ${selectedPeriod.slot.label}` : ''}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Save} loading={saving} onClick={(e: any) => {
              const form = document.querySelector('form[data-lesson-form]') as HTMLFormElement;
              if (form) form.requestSubmit();
            }}>Save Log</Button>
          </div>
        }
      >
        <form onSubmit={handleSaveLesson} data-lesson-form className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Lesson Date" required hint="Backfill up to 14 days">
              <input
                type="date"
                value={logDate}
                max={new Date().toISOString().split('T')[0]}
                min={(() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().split('T')[0]; })()}
                onChange={e => setLogDate(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Topic" required hint={`${lessonData.topic.length}/200`}>
                <Input
                  placeholder="e.g. Introduction to Trigonometry"
                  value={lessonData.topic}
                  maxLength={200}
                  onChange={(e) => setLessonData({ ...lessonData, topic: e.target.value })}
                  required
                />
              </FormField>
            </div>
          </div>
          {selectedPeriod?.existingId && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>You are editing an existing log for this date. If someone else saves changes while you're editing, your save will be rejected to prevent overwriting their work.</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wider">
                <BookOpen className="w-4 h-4 text-blue-500" />
                Classwork
              </div>
              <Textarea
                placeholder="Details of what was taught in class..."
                rows={4}
                value={lessonData.classwork}
                maxLength={5000}
                onChange={(e) => setLessonData({ ...lessonData, classwork: e.target.value })}
              />
              <p className="text-[10px] text-slate-400 -mt-2 text-right">{lessonData.classwork.length}/5000</p>
              <div className="relative">
                <input
                  type="file"
                  id="cw-file"
                  className="hidden"
                  accept="image/*,video/*,application/pdf,.doc,.docx"
                  onChange={(e) => setLessonData({ ...lessonData, classworkFile: e.target.files?.[0] || null })}
                />
                <label
                  htmlFor="cw-file"
                  className={cn(
                    "flex flex-col gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                    lessonData.classworkFile ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {lessonData.classworkFile ? (
                      <>
                        <File className="w-4 h-4" />
                        <span className="text-xs font-medium flex-1 truncate">{lessonData.classworkFile.name}</span>
                        <X className="w-4 h-4" onClick={(e) => { e.preventDefault(); setLessonData({ ...lessonData, classworkFile: null }); }} />
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-500">Camera / Gallery / Files (Max 2MB)</span>
                      </>
                    )}
                  </div>
                  {((uploadProgress.cw > 0 && uploadProgress.cw < 100) || (saving && lessonData.classworkFile)) && (
                    <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className={cn("h-full transition-all duration-300", uploadProgress.cw === 100 ? "bg-emerald-500" : "bg-blue-500")}
                        style={{ width: `${uploadProgress.cw}%` }}
                      />
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wider">
                <CheckSquare className="w-4 h-4 text-emerald-500" />
                Homework
              </div>
              <Textarea
                placeholder="Details of homework assigned..."
                rows={4}
                value={lessonData.homework}
                maxLength={5000}
                onChange={(e) => setLessonData({ ...lessonData, homework: e.target.value })}
              />
              <p className="text-[10px] text-slate-400 -mt-2 text-right">{lessonData.homework.length}/5000</p>
              <div className="relative">
                <input
                  type="file"
                  id="hw-file"
                  className="hidden"
                  accept="image/*,video/*,application/pdf,.doc,.docx"
                  onChange={(e) => setLessonData({ ...lessonData, homeworkFile: e.target.files?.[0] || null })}
                />
                <label
                  htmlFor="hw-file"
                  className={cn(
                    "flex flex-col gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                    lessonData.homeworkFile ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 hover:border-emerald-400 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {lessonData.homeworkFile ? (
                      <>
                        <File className="w-4 h-4" />
                        <span className="text-xs font-medium flex-1 truncate">{lessonData.homeworkFile.name}</span>
                        <X className="w-4 h-4 text-slate-400 hover:text-rose-500" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLessonData({ ...lessonData, homeworkFile: null }); }} />
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-500">Camera / Gallery / Files (Max 2MB)</span>
                      </>
                    )}
                  </div>
                  {((uploadProgress.hw > 0 && uploadProgress.hw < 100) || (saving && lessonData.homeworkFile)) && (
                    <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className={cn("h-full transition-all duration-300", uploadProgress.hw === 100 ? "bg-emerald-500" : "bg-emerald-600")}
                        style={{ width: `${uploadProgress.hw}%` }}
                      />
                    </div>
                  )}
                </label>
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
