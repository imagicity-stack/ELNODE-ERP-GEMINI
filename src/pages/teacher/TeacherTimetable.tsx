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
  PageHeader,
  Card,
  Badge,
  Spinner,
  EmptyState,
  Modal,
  FormField,
  Input,
  Textarea,
  Button,
  IconButton,
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
  const [mobileDay, setMobileDay] = useState<string>(todayName);

  // ─── Leave + Substitute awareness ────────────────────────────────────────
  // ISO dates on which this teacher has an approved leave
  const [approvedLeaveDays, setApprovedLeaveDays] = useState<Set<string>>(new Set());
  // substituteAssignments where this teacher is the cover teacher, keyed by ISO date
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

        // Fetch approved leaves for this teacher
        const leavesQ = query(
          collection(db, 'teacherLeaves'),
          where('teacherId', '==', tid),
          where('status', '==', 'approved')
        );
        const leavesSnap = await getDocs(leavesQ);
        const leaveDays = new Set<string>();
        leavesSnap.docs.forEach(d => {
          const data = d.data();
          // Enumerate every day in the leave range
          const start = new Date(data.startDate);
          const end = new Date(data.endDate);
          for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
            leaveDays.add(dt.toISOString().split('T')[0]);
          }
        });
        setApprovedLeaveDays(leaveDays);

        // Fetch substitute assignments where I'm the substitute
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
        // Non-fatal: leave awareness is best-effort
      }
    };
    loadLeaveData();
  }, [teacherData?.id, user.uid]);

  // Returns the ISO date for a given weekday name in the current week (Mon=start)
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
  // Date the lesson was actually delivered (default: today; teacher can backfill up to 14 days)
  const [logDate, setLogDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  // Optimistic-concurrency token snapshotted at the time we loaded the existing log
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
      // 2MB Limit
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

  // Re-query existing log whenever the chosen log date changes (so backfilling a past lesson
  // loads that day's existing entry instead of today's).
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
      setSelectedPeriod(prev => ({ ...prev, existingId: docSnap.id, topic: data.topic }));
    } else {
      setLessonData({ topic: '', classwork: '', homework: '', classworkFile: null, homeworkFile: null });
      setExistingVersion(0);
      setSelectedPeriod(prev => ({ ...prev, existingId: null }));
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

  // When teacher picks a different date in the modal, reload the existing log for that date
  useEffect(() => {
    if (!isModalOpen || !selectedPeriod?.slot) return;
    fetchExistingForDate(selectedPeriod, selectedPeriod.slot, logDate).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDate]);

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriod || saving) return;

    // Input validation (length, required) — single source of truth for client/server expectations
    const validationError = validateLessonInput({
      topic: lessonData.topic,
      classwork: lessonData.classwork,
      homework: lessonData.homework,
    });
    if (validationError) { showToast(validationError, 'error'); return; }

    // Date sanity: don't allow future dates, and don't allow backfilling more than 14 days
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

      // Upload files in parallel if present — sanitize filenames before they hit storage paths
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
        // UPDATE path — version-checked transaction prevents silent overwrites
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
        // CREATE path
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
        // Reload the latest state so the teacher sees the other person's changes
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
        <p className="text-slate-500 font-medium animate-pulse">Loading your timetable...</p>
      </div>
    );
  }

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-6 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-4 pt-5 pb-3 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">My Timetable</p>
          <h1 className="text-xl font-bold mt-0.5">{mobileDay === todayName ? 'Today' : mobileDay}</h1>

          {/* Day chips */}
          {config && (
            <div className="mt-3 -mx-4 px-4 overflow-x-auto flex gap-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {config.days.map((day) => (
                <button
                  key={day}
                  onClick={() => setMobileDay(day)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                    mobileDay === day
                      ? "bg-white text-blue-700"
                      : "bg-white/15 text-white border border-white/20"
                  )}
                >
                  {day.slice(0, 3)}
                  {day === todayName && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {!config ? (
          <div className="px-4 pt-8 text-center">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">Timetable not configured</p>
          </div>
        ) : (
          <div className="px-4 pt-4 space-y-2">
            {/* Leave banner for mobile */}
            {isOnLeaveDay(mobileDay) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs font-bold text-amber-800">You are on approved leave today. Your classes have been covered.</p>
              </div>
            )}

            {config.slots.map((slot) => {
              if (slot.type === 'break') {
                return (
                  <div key={slot.id} className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-700 uppercase">Short Break</span>
                    <span className="text-[10px] text-amber-600">{slot.startTime}–{slot.endTime}</span>
                  </div>
                );
              }
              if (slot.type === 'lunch') {
                return (
                  <div key={slot.id} className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-blue-700 uppercase">Lunch Break</span>
                    <span className="text-[10px] text-blue-600">{slot.startTime}–{slot.endTime}</span>
                  </div>
                );
              }
              const period = getPeriod(mobileDay, slot.id);
              if (!period) {
                return (
                  <div key={slot.id} className="bg-white border border-dashed border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{slot.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{slot.startTime} – {slot.endTime}</p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-300 uppercase">Free</span>
                  </div>
                );
              }
              // On leave: show period as "On Leave" — no log entry allowed
              if (isOnLeaveDay(mobileDay)) {
                return (
                  <div key={slot.id} className="bg-amber-50 border border-l-4 border-l-amber-400 border-amber-100 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">{slot.label} · {slot.startTime}</p>
                      <p className="text-sm font-bold text-amber-900 truncate mt-0.5">{subjects[period.subjectId] || period.subjectId}</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">Class {classes[period.classId] || period.classId}</p>
                    </div>
                    <span className="text-[10px] font-bold text-amber-500 uppercase">On Leave</span>
                  </div>
                );
              }
              return (
                <button
                  key={slot.id}
                  onClick={() => handleOpenLog(period, slot)}
                  className="w-full text-left bg-white border-l-4 border-l-blue-500 border-y border-r border-slate-100 rounded-xl px-4 py-3 shadow-sm active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{slot.label} · {slot.startTime}</p>
                      <p className="text-sm font-bold text-slate-900 truncate mt-0.5">{subjects[period.subjectId] || period.subjectId}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Class {classes[period.classId] || period.classId}</p>
                    </div>
                    <Edit3 className="w-4 h-4 text-blue-500 shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}

            {/* Substitute coverage today (mobile) */}
            {(() => {
              const isoDay = getIsoForWeekday(mobileDay);
              const subs = substituteByDate[isoDay] || [];
              if (subs.length === 0) return null;
              return (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" /> Covering for absent teacher
                  </p>
                  {subs.map(sa => {
                    const slot = config.slots.find(s => s.id === sa.slotId);
                    return (
                      <div key={sa.id} className="bg-indigo-50 border border-l-4 border-l-indigo-400 border-indigo-100 rounded-xl px-4 py-3 mb-2">
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">{slot?.label || sa.slotId} · {slot?.startTime || ''}</p>
                        <p className="text-sm font-bold text-indigo-900 mt-0.5">Class {classes[sa.classId] || sa.classId}</p>
                        <p className="text-[11px] text-indigo-600 mt-0.5">Substitute cover</p>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Teacher Timetable"
        subtitle="Your weekly teaching schedule and class assignments."
        icon={Calendar}
        iconColor="gradient-blue"
        actions={
          <Badge variant="info">Academic Year 2026-27</Badge>
        }
      />

      {!config ? (
        <EmptyState
          icon={Calendar}
          title="Timetable not configured"
          description="The school timetable settings haven't been initialized yet. Please contact the administrator."
        />
      ) : (
        <>
          {/* Leave banner (desktop) */}
          {approvedLeaveDays.size > 0 && (() => {
            const today = new Date().toISOString().split('T')[0];
            if (approvedLeaveDays.has(today)) {
              return (
                <div className="flex items-center gap-3 px-5 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-sm font-semibold text-amber-800">You are on approved leave today. Your classes have been assigned to substitutes — no lesson logs required.</p>
                </div>
              );
            }
            return null;
          })()}

        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 border-r border-slate-100 text-left text-xs font-bold text-slate-400 uppercase tracking-widest w-40">
                    Time Slot
                  </th>
                  {config.days.map(day => {
                    const onLeave = isOnLeaveDay(day);
                    return (
                      <th key={day} className={cn(
                        "px-6 py-4 text-left text-xs font-bold uppercase tracking-widest min-w-[180px]",
                        onLeave ? "text-amber-500 bg-amber-50/40" : "text-slate-500"
                      )}>
                        {day}
                        {onLeave && <span className="ml-2 text-[9px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full normal-case">On Leave</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {config.slots.map((slot) => (
                  <tr key={slot.id} className="group hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-6 border-r border-slate-100 bg-slate-50/30 whitespace-nowrap">
                      <p className="text-xs font-bold text-slate-700">{slot.label}</p>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{slot.startTime} - {slot.endTime}</span>
                      </div>
                    </td>
                    {config.days.map(day => {
                      if (slot.type === 'break') {
                        return (
                          <td key={`${day}-${slot.id}`} className="px-4 py-2 bg-amber-50/30 text-center border-r border-slate-50/50">
                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Short Break</span>
                          </td>
                        );
                      }

                      if (slot.type === 'lunch') {
                        return (
                          <td key={`${day}-${slot.id}`} className="px-4 py-2 bg-blue-50/30 text-center border-r border-slate-50/50">
                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Lunch Break</span>
                          </td>
                        );
                      }

                      const period = getPeriod(day, slot.id);
                      const subjectName = period ? subjects[period.subjectId] : null;
                      const className = period ? classes[period.classId] : null;
                      const onLeave = isOnLeaveDay(day);

                      // Check if I'm a substitute on this day+slot
                      const isoDay = getIsoForWeekday(day);
                      const subForSlot = (substituteByDate[isoDay] || []).find(s => s.slotId === slot.id);

                      return (
                        <td key={`${day}-${slot.id}`} className={cn("px-4 py-2 border-r border-slate-50/50", onLeave && "bg-amber-50/20")}>
                          {/* Show substitute coverage if assigned */}
                          {subForSlot && !period && (
                            <div className="p-3 rounded-xl bg-indigo-50 border border-l-4 border-l-indigo-400 border-indigo-100 min-h-[60px]">
                              <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Covering</p>
                              <p className="text-xs font-bold text-indigo-900">Class {classes[subForSlot.classId] || subForSlot.classId}</p>
                              <div className="flex items-center gap-1 mt-1 text-[10px] text-indigo-500">
                                <UserCheck className="w-3 h-3" />
                                <span>Substitute duty</span>
                              </div>
                            </div>
                          )}
                          {period && onLeave ? (
                            // Teacher is on leave — show period as covered
                            <div className="p-3 rounded-xl bg-amber-50 border border-l-4 border-l-amber-400 border-amber-100 min-h-[60px]">
                              <p className="text-xs font-bold text-amber-700 truncate">{subjectName || period.subjectId}</p>
                              <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-500">
                                <Users className="w-3 h-3" />
                                <span>Class {className || period.classId} · On Leave</span>
                              </div>
                            </div>
                          ) : period ? (
                            <button
                              onClick={() => handleOpenLog(period, slot)}
                              className="w-full text-left p-3 rounded-xl bg-blue-50/50 border border-blue-100 group-hover:bg-white group-hover:shadow-sm transition-all border-l-4 border-l-blue-500 hover:border-blue-400"
                            >
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <p className="text-xs font-bold text-blue-600 truncate">{subjectName || period.subjectId}</p>
                                <Edit3 className="w-3 h-3 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                <Users className="w-3 h-3" />
                                <span>Class {className || period.classId}</span>
                              </div>
                            </button>
                          ) : !subForSlot ? (
                            <div className="p-3 rounded-xl bg-slate-50/10 border border-dashed border-slate-100 flex items-center justify-center min-h-[60px]">
                              <span className="text-[10px] font-bold text-slate-300 uppercase">Free</span>
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        </>
      )}
      </div>

      {/* Lesson Log Modal — shared by mobile + desktop */}
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
            {/* Classwork */}
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
                        className={cn(
                          "h-full transition-all duration-300",
                          uploadProgress.cw === 100 ? "bg-emerald-500" : "bg-blue-500"
                        )} 
                        style={{ width: `${uploadProgress.cw}%` }}
                      ></div>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Homework */}
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
                        className={cn(
                          "h-full transition-all duration-300",
                          uploadProgress.hw === 100 ? "bg-emerald-500" : "bg-emerald-600"
                        )} 
                        style={{ width: `${uploadProgress.hw}%` }}
                      ></div>
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
