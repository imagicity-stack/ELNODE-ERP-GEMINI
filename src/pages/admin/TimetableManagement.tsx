import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, query, where, addDoc, updateDoc, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Calendar, Plus, Trash2, Edit2, Clock, Users, BookOpen, AlertCircle, Settings, Save, Trash, Archive, History } from 'lucide-react';
import { PageHeader, Card, Button, IconButton, Modal, ConfirmModal, Select, FormField, Input, Badge } from '../../components/ui';
import { logActivity } from '../../services/activityService';
import { Class, Subject, Teacher, Timetable, TimetableConfig, TimeSlot, UserProfile } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';

export default function TimetableManagement({ user }: { user: UserProfile }) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [config, setConfig] = useState<TimetableConfig | null>(null);
  
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTimetable, setSelectedTimetable] = useState<Timetable | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [publishEffectiveFrom, setPublishEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0]);
  const [publishAcademicYear, setPublishAcademicYear] = useState<string>('');
  const [publishLoading, setPublishLoading] = useState(false);
  const [archiveDocs, setArchiveDocs] = useState<Timetable[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('timetable');
  
  const [formData, setFormData] = useState({
    day: '',
    slotId: '',
    subjectId: '',
    teacherId: '',
    room: ''
  });

  const [configForm, setConfigForm] = useState<TimetableConfig>({
    id: 'global',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    slots: [
      { id: '1', label: '1st Period', startTime: '08:30 AM', endTime: '09:30 AM', type: 'period' },
      { id: '2', label: '2nd Period', startTime: '09:30 AM', endTime: '10:30 AM', type: 'period' },
      { id: '3', label: 'Break', startTime: '10:30 AM', endTime: '11:00 AM', type: 'break' },
      { id: '4', label: '3rd Period', startTime: '11:00 AM', endTime: '12:00 PM', type: 'period' },
      { id: '5', label: '4th Period', startTime: '12:00 PM', endTime: '01:00 PM', type: 'period' },
      { id: '6', label: 'Lunch', startTime: '01:00 PM', endTime: '02:00 PM', type: 'lunch' },
      { id: '7', label: '5th Period', startTime: '02:00 PM', endTime: '03:00 PM', type: 'period' },
    ],
    updatedAt: new Date().toISOString()
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [classesSnap, subjectsSnap, teachersSnap, timetableSnap, configSnap] = await Promise.all([
          getDocs(collection(db, 'classes')),
          getDocs(collection(db, 'subjects')),
          getDocs(collection(db, 'teachers')),
          getDocs(collection(db, 'timetable')),
          getDoc(doc(db, 'timetableSettings', 'global'))
        ]);

        setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
        setSubjects(subjectsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
        setTeachers(teachersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Teacher)));
        setTimetables(timetableSnap.docs.map(d => ({ id: d.id, ...d.data() } as Timetable)));
        
        if (configSnap.exists()) {
          setConfig(configSnap.data() as TimetableConfig);
          setConfigForm(configSnap.data() as TimetableConfig);
        } else {
          // Initialize if not exists
          await setDoc(doc(db, 'timetableSettings', 'global'), configForm);
          setConfig(configForm);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'timetable');
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const tt = timetables.find(t => t.classId === selectedClassId);
    setSelectedTimetable(tt || null);
  }, [selectedClassId, timetables]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId) return;

    setLoading(true);
    try {
      let updatedTimetable: Partial<Timetable>;
      
      if (selectedTimetable) {
        const newSchedule = [...selectedTimetable.schedule];
        let daySchedule = newSchedule.find(s => s.day === formData.day);
        
        if (!daySchedule) {
          daySchedule = { day: formData.day, periods: [] };
          newSchedule.push(daySchedule);
        }

        // Check if period already exists for this slot
        const periodIndex = daySchedule.periods.findIndex(p => p.slotId === formData.slotId);
        const newPeriod = {
          slotId: formData.slotId,
          subjectId: formData.subjectId,
          teacherId: formData.teacherId,
          room: formData.room
        };

        if (periodIndex >= 0) {
          daySchedule.periods[periodIndex] = newPeriod;
        } else {
          daySchedule.periods.push(newPeriod);
        }

        updatedTimetable = { schedule: newSchedule, updatedAt: new Date().toISOString() };
        await updateDoc(doc(db, 'timetable', selectedTimetable.id), updatedTimetable);
      } else {
        const newTT: Omit<Timetable, 'id'> = {
          classId: selectedClassId,
          schedule: [{
            day: formData.day,
            periods: [{
              slotId: formData.slotId,
              subjectId: formData.subjectId,
              teacherId: formData.teacherId,
              room: formData.room
            }]
          }],
          version: 1,
          effectiveFrom: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as any; // Type assertion because of schedule structure
        await addDoc(collection(db, 'timetable'), newTT);
      }

      // Refresh timetables
      const snap = await getDocs(collection(db, 'timetable'));
      setTimetables(snap.docs.map(d => ({ id: d.id, ...d.data() } as Timetable)));

      const className = classes.find(c => c.id === selectedClassId)?.name || selectedClassId;
      const subjectName = subjects.find(s => s.id === formData.subjectId)?.name || formData.subjectId;
      const teacherName = teachers.find(t => t.id === formData.teacherId)?.name || formData.teacherId;
      const slotLabel = config?.slots.find(s => s.id === formData.slotId)?.label || formData.slotId;
      logActivity(
        user,
        'Timetable Slot Created',
        'Academic',
        `Class ${className} · ${formData.day} ${slotLabel} → ${subjectName} (${teacherName})`,
        { classId: selectedClassId, day: formData.day, slotId: formData.slotId, subjectId: formData.subjectId, teacherId: formData.teacherId }
      );

      setIsModalOpen(false);
      setFormData({
        day: '',
        slotId: '',
        subjectId: '',
        teacherId: '',
        room: ''
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'timetable');
    } finally {
      setLoading(false);
    }
  };

  const removePeriod = async (day: string, slotId: string) => {
    if (!selectedTimetable) return;

    try {
      const newSchedule = selectedTimetable.schedule.map(s => {
        if (s.day === day) {
          return {
            ...s,
            periods: s.periods.filter(p => p.slotId !== slotId)
          };
        }
        return s;
      }).filter(s => s.periods.length > 0);

      await updateDoc(doc(db, 'timetable', selectedTimetable.id), {
        schedule: newSchedule,
        updatedAt: new Date().toISOString()
      });

      // Refresh
      const snap = await getDocs(collection(db, 'timetable'));
      setTimetables(snap.docs.map(d => ({ id: d.id, ...d.data() } as Timetable)));

      const className = classes.find(c => c.id === selectedTimetable.classId)?.name || selectedTimetable.classId;
      const slotLabel = config?.slots.find(s => s.id === slotId)?.label || slotId;
      logActivity(
        user,
        'Timetable Slot Deleted',
        'Academic',
        `Class ${className} · ${day} ${slotLabel} removed`,
        { classId: selectedTimetable.classId, day, slotId }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'timetable');
    }
  };

  const getPeriod = (day: string, slotId: string) => {
    if (!selectedTimetable) return null;
    const daySchedule = selectedTimetable.schedule.find(s => s.day === day);
    return daySchedule?.periods.find(p => p.slotId === slotId);
  };

  // Archive current timetable into `timetableArchive`, then bump the live doc's version.
  // Existing readers (parents/students/teachers) keep reading the live doc and see the new version
  // immediately; historical lesson logs continue to reference their original slot snapshots.
  const handlePublishNewVersion = async () => {
    if (!selectedTimetable || !selectedClassId) return;
    setPublishLoading(true);
    try {
      const effectiveFromIso = publishEffectiveFrom || new Date().toISOString().split('T')[0];
      const prevVersion = selectedTimetable.version || 1;
      const nextVersion = prevVersion + 1;

      // 1) Snapshot the current live doc into the archive collection.
      const archivePayload: any = {
        classId: selectedTimetable.classId,
        schedule: selectedTimetable.schedule,
        academicYear: selectedTimetable.academicYear || publishAcademicYear || '',
        version: prevVersion,
        effectiveFrom: selectedTimetable.effectiveFrom || '',
        effectiveTo: effectiveFromIso,
        updatedAt: selectedTimetable.updatedAt,
        archivedAt: new Date().toISOString(),
        archivedBy: user.uid,
      };
      // Strip undefined values for Firestore safety
      const archiveClean = JSON.parse(JSON.stringify(archivePayload));
      await addDoc(collection(db, 'timetableArchive'), archiveClean);

      // 2) Update the live doc with new version metadata. Schedule stays as-is; the admin
      //    can now edit it freely and those edits belong to the new version.
      await updateDoc(doc(db, 'timetable', selectedTimetable.id), {
        version: nextVersion,
        effectiveFrom: effectiveFromIso,
        academicYear: publishAcademicYear || selectedTimetable.academicYear || '',
        updatedAt: new Date().toISOString(),
      });

      // Refresh local state
      const snap = await getDocs(collection(db, 'timetable'));
      setTimetables(snap.docs.map(d => ({ id: d.id, ...d.data() } as Timetable)));

      logActivity(
        user,
        'Published Timetable Version',
        'Academic',
        `Class ${classes.find(c => c.id === selectedClassId)?.name || selectedClassId} → v${nextVersion} (effective ${effectiveFromIso})`,
        { classId: selectedClassId, version: nextVersion, effectiveFrom: effectiveFromIso }
      );

      setIsPublishModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'timetable');
    } finally {
      setPublishLoading(false);
    }
  };

  const openHistory = async () => {
    if (!selectedClassId) return;
    setIsHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const q = query(collection(db, 'timetableArchive'), where('classId', '==', selectedClassId));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Timetable));
      docs.sort((a, b) => (b.version || 0) - (a.version || 0));
      setArchiveDocs(docs);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'timetableArchive');
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveConfig = async () => {
    setConfigLoading(true);
    try {
      const updatedConfig = { ...configForm, updatedAt: new Date().toISOString() };
      await setDoc(doc(db, 'timetableSettings', 'global'), updatedConfig);
      setConfig(updatedConfig);
      setIsConfigModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'timetableSettings');
    } finally {
      setConfigLoading(false);
    }
  };

  const addSlot = () => {
    const newSlot: TimeSlot = {
      id: Math.random().toString(36).substr(2, 9),
      label: 'New Slot',
      startTime: '08:00 AM',
      endTime: '09:00 AM',
      type: 'period'
    };
    setConfigForm({ ...configForm, slots: [...configForm.slots, newSlot] });
  };

  const removeSlot = (id: string) => {
    setConfigForm({ ...configForm, slots: configForm.slots.filter(s => s.id !== id) });
  };

  const updateSlot = (id: string, updates: Partial<TimeSlot>) => {
    setConfigForm({
      ...configForm,
      slots: configForm.slots.map(s => s.id === id ? { ...s, ...updates } : s)
    });
  };

  const filteredTeachers = useMemo(() => {
    if (!formData.subjectId) return [];
    return teachers.filter(t => t.subjects?.includes(formData.subjectId));
  }, [teachers, formData.subjectId]);

  const busyTeachers = useMemo(() => {
    if (!formData.day || !formData.slotId) return new Set<string>();
    
    const busy = new Set<string>();
    timetables.forEach(tt => {
      if (tt.classId !== selectedClassId) {
        const daySchedule = tt.schedule.find(s => s.day === formData.day);
        if (daySchedule) {
          const period = daySchedule.periods.find(p => p.slotId === formData.slotId);
          if (period?.teacherId) {
            busy.add(period.teacherId);
          }
        }
      }
    });
    return busy;
  }, [timetables, formData.day, formData.slotId, selectedClassId]);

  // Reset teacher selection when subject changes to an invalid one
  const handleSubjectChange = (subjectId: string) => {
    const isTeacherValid = teachers.some(t => t.id === formData.teacherId && t.subjects?.includes(subjectId));
    setFormData(prev => ({
      ...prev,
      subjectId,
      teacherId: isTeacherValid ? prev.teacherId : ''
    }));
  };

  // Mobile state for selected day
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const [mobileDay, setMobileDay] = useState<string>(todayName);

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Timetable</h1>
          <p className="text-xs text-indigo-100 mt-0.5">{classes.length} classes · {config?.slots.length || 0} periods/day</p>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="mt-3 w-full px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-sm text-white focus:outline-none"
          >
            <option value="" className="text-slate-900">Select a Class</option>
            {classes.map(c => (
              <option key={c.id} value={c.id} className="text-slate-900">Class {c.name}</option>
            ))}
          </select>
        </div>

        {selectedClassId && config && (
          <div className="px-4 pt-3 overflow-x-auto flex gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {config.days.map(d => (
              <button
                key={d}
                onClick={() => setMobileDay(d)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition-transform ${
                  mobileDay === d ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                }${d === todayName ? ' relative' : ''}`}
              >
                {d.slice(0, 3)}
                {d === todayName && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              </button>
            ))}
          </div>
        )}

        <div className="px-4 pt-4 space-y-2">
          {!selectedClassId ? (
            <div className="py-12 text-center">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">Select a class</p>
              <p className="text-xs text-slate-500 mt-1">Choose a class above to view its timetable</p>
            </div>
          ) : !config ? (
            <p className="text-center py-12 text-sm text-slate-500">Loading config...</p>
          ) : (
            (() => {
              const tt = timetables.find(t => t.classId === selectedClassId);
              const daySchedule = tt?.schedule.find(s => s.day === mobileDay);
              return config.slots.map(slot => {
                const period = daySchedule?.periods.find(p => p.slotId === slot.id);
                if (slot.type === 'break' || slot.type === 'lunch') {
                  return (
                    <div key={slot.id} className="bg-slate-100 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-slate-600">
                      <span className="font-bold capitalize">{slot.label}</span>
                      <span>{slot.startTime} - {slot.endTime}</span>
                    </div>
                  );
                }
                const subject = subjects.find(s => s.id === period?.subjectId);
                const teacher = teachers.find(t => t.id === period?.teacherId);
                return (
                  <button
                    key={slot.id}
                    onClick={() => {
                      if (readOnly) return;
                      setFormData({ day: mobileDay, slotId: slot.id, subjectId: period?.subjectId || '', teacherId: period?.teacherId || '', room: period?.room || '' });
                      setIsModalOpen(true);
                    }}
                    className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-3 text-left active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 text-center">
                        <p className="text-[9px] font-bold text-indigo-600 uppercase">{slot.label.replace(/[^0-9]/g, '') || 'P'}</p>
                        <p className="text-[9px] text-slate-500">{slot.startTime.replace(/\s.*$/, '')}</p>
                      </div>
                      <div className="flex-1 min-w-0 border-l border-slate-100 pl-3">
                        {period?.subjectId ? (
                          <>
                            <p className="text-sm font-bold text-slate-900 truncate">{subject?.name || 'Subject'}</p>
                            <p className="text-[11px] text-slate-500 truncate">{teacher?.name || 'Teacher'}{period.room ? ` · ${period.room}` : ''}</p>
                          </>
                        ) : (
                          <p className="text-sm text-slate-400 italic">Free · tap to assign</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              });
            })()
          )}
        </div>

        {!readOnly && selectedClassId && (
          <button
            onClick={() => {
              setFormData({ ...formData, day: config?.days[0] || '', slotId: config?.slots[0]?.id || '' });
              setIsModalOpen(true);
            }}
            className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Timetable Management"
        subtitle="Schedule classes, assigned teachers and subjects for each grade."
        icon={Calendar}
        iconColor="gradient-blue"
        actions={
          <div className="flex items-center gap-3">
             {!readOnly && (
               <Button
                  variant="secondary"
                  icon={Settings}
                  onClick={() => setIsConfigModalOpen(true)}
              >
                  Schedule Settings
              </Button>
             )}
             {selectedTimetable && (
               <Button
                 variant="secondary"
                 icon={History}
                 onClick={openHistory}
               >
                 History
               </Button>
             )}
             {!readOnly && selectedTimetable && (
               <Button
                 variant="secondary"
                 icon={Archive}
                 onClick={() => {
                   setPublishEffectiveFrom(new Date().toISOString().split('T')[0]);
                   setPublishAcademicYear(selectedTimetable.academicYear || '');
                   setIsPublishModalOpen(true);
                 }}
               >
                 Save as New Version
               </Button>
             )}
             <Select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-48"
            >
              <option value="">Select a Class</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>Class {c.name}</option>
              ))}
            </Select>
            {!readOnly && (
              <Button 
                  icon={Plus} 
                  disabled={!selectedClassId}
                  onClick={() => {
                     setFormData({ ...formData, day: config?.days[0] || '', slotId: config?.slots[0]?.id || '' });
                     setIsModalOpen(true);
                  }}
              >
                  Add Period
              </Button>
            )}
          </div>
        }
      />

      {!selectedClassId || !config ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 animate-bounce">
                <Calendar className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Initialize Timetable</h3>
            <p className="text-slate-500 max-w-sm">Please select a class from the dropdown above to view or manage its weekly schedule. Configure your school timings using settings.</p>
        </Card>
      ) : (
        <Card padding="none">
           <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 border-r border-slate-100 text-left text-xs font-bold text-slate-400 uppercase tracking-widest w-48">
                    Time Slot
                  </th>
                  {config.days.map(day => (
                    <th key={day} className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest min-w-[200px]">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {config.slots.map((slot) => {
                    const isBreak = slot.type === 'break';
                    const isLunch = slot.type === 'lunch';
                    
                    return (
                        <tr key={slot.id} className="group hover:bg-slate-50/70 transition-colors">
                            <td className="px-6 py-6 border-r border-slate-100 text-xs bg-slate-50/30">
                                <div className="font-bold text-slate-700">{slot.label}</div>
                                <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5" />
                                    {slot.startTime} - {slot.endTime}
                                </div>
                            </td>
                            {config.days.map(day => {
                                if (isBreak) return (
                                    <td key={`${day}-${slot.id}`} className="bg-amber-50/20 text-center border-r border-slate-50/50">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="h-px bg-amber-200 flex-1 ml-4" />
                                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest px-2">Break</span>
                                            <div className="h-px bg-amber-200 flex-1 mr-4" />
                                        </div>
                                    </td>
                                );
                                if (isLunch) return (
                                    <td key={`${day}-${slot.id}`} className="bg-blue-50/20 text-center border-r border-slate-50/50">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="h-px bg-blue-200 flex-1 ml-4" />
                                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest px-2">Lunch</span>
                                            <div className="h-px bg-blue-200 flex-1 mr-4" />
                                        </div>
                                    </td>
                                );

                                const period = getPeriod(day, slot.id);
                                const subject = subjects.find(s => s.id === period?.subjectId);
                                const teacher = teachers.find(t => t.id === period?.teacherId);

                                return (
                                    <td key={`${day}-${slot.id}`} className="px-4 py-3 group/cell relative min-h-[100px]">
                                        {period ? (
                                            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm group-hover:border-blue-400 transition-all border-l-4 border-l-blue-500">
                                                <div className="flex items-center justify-between mb-2">
                                                    <Badge variant="indigo">{subject?.code || 'N/A'}</Badge>
                                                    {!readOnly && (
                                                      <div className="flex opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                                          <IconButton 
                                                              icon={Trash2} 
                                                              size="sm" 
                                                              variant="danger" 
                                                              onClick={() => removePeriod(day, slot.id)} 
                                                          />
                                                      </div>
                                                    )}
                                                </div>
                                                <p className="text-xs font-bold text-slate-900 line-clamp-1">{subject?.name || 'Unknown'}</p>
                                                <div className="flex items-center gap-1.5 mt-2">
                                                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center">
                                                        <Users className="w-2.5 h-2.5 text-slate-400" />
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 font-medium line-clamp-1">{teacher?.name || 'TBA'}</p>
                                                </div>
                                                {period.room && (
                                                    <p className="text-[10px] text-blue-500 mt-1.5 font-bold flex items-center gap-1">
                                                        <BookOpen className="w-2.5 h-2.5" />
                                                        Room: {period.room}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            !readOnly ? (
                                              <button 
                                                  onClick={() => {
                                                      setFormData({ ...formData, day, slotId: slot.id });
                                                      setIsModalOpen(true);
                                                  }}
                                                  className="w-full h-24 border-2 border-dashed border-slate-100 rounded-xl flex flex-col items-center justify-center hover:border-blue-300 hover:bg-blue-50/50 transition-all text-slate-300 hover:text-blue-500 group/btn"
                                              >
                                                  <Plus className="w-5 h-5 mb-1 group-hover/btn:scale-110 transition-transform" />
                                                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover/btn:opacity-100">Add</span>
                                              </button>
                                            ) : (
                                              <div className="w-full h-24 border-2 border-dashed border-slate-50 rounded-xl bg-slate-50/20" />
                                            )
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      </div>

      {/* Schedule Settings Modal */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        title="Schedule Configuration"
        subtitle="Manage school timings, periods and working days."
        size="xl"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setIsConfigModalOpen(false)}>Cancel</Button>
            <Button icon={Save} onClick={saveConfig} loading={configLoading}>Save Settings</Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <p className="text-sm text-blue-700 leading-relaxed">
              Define the structure of your school day. You can add periods, breaks, and lunch slots. 
              Changes here will update the grid layout for all classes.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Time Slots</h4>
            <div className="grid grid-cols-12 gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                <div className="col-span-3">Label</div>
                <div className="col-span-2">Start</div>
                <div className="col-span-2">End</div>
                <div className="col-span-3">Type</div>
                <div className="col-span-2">Action</div>
            </div>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {configForm.slots.map((slot, index) => (
                    <div key={slot.id} className="grid grid-cols-12 gap-3 items-center p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                        <div className="col-span-3">
                            <Input 
                                value={slot.label} 
                                onChange={e => updateSlot(slot.id, { label: e.target.value })} 
                            />
                        </div>
                        <div className="col-span-2">
                            <Input 
                                placeholder="08:00 AM"
                                value={slot.startTime} 
                                onChange={e => updateSlot(slot.id, { startTime: e.target.value })} 
                            />
                        </div>
                        <div className="col-span-2">
                            <Input 
                                placeholder="09:00 AM"
                                value={slot.endTime} 
                                onChange={e => updateSlot(slot.id, { endTime: e.target.value })} 
                            />
                        </div>
                        <div className="col-span-3">
                            <Select 
                                value={slot.type} 
                                onChange={e => updateSlot(slot.id, { type: e.target.value as any })}
                            >
                                <option value="period">Period</option>
                                <option value="break">Short Break</option>
                                <option value="lunch">Lunch Break</option>
                            </Select>
                        </div>
                        <div className="col-span-2">
                            <IconButton 
                                icon={Trash} 
                                variant="danger" 
                                size="sm" 
                                onClick={() => removeSlot(slot.id)} 
                            />
                        </div>
                    </div>
                ))}
                <button 
                  onClick={addSlot}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 transition-all text-xs font-bold"
                >
                  + Add New Slot
                </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Schedule Period"
        subtitle={`${formData.day} at ${config?.slots.find(s => s.id === formData.slotId)?.startTime || 'TBA'}`}
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button form="tt-form" loading={loading}>Save Period</Button>
          </div>
        }
      >
        <form id="tt-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Day">
                <Select 
                    value={formData.day} 
                    onChange={e => setFormData({...formData, day: e.target.value})}
                >
                    {config?.days.map(d => <option key={d} value={d}>{d}</option>)}
                </Select>
            </FormField>
            <FormField label="Time Slot">
                <Select 
                    value={formData.slotId} 
                    onChange={e => setFormData({...formData, slotId: e.target.value})}
                >
                    {config?.slots.filter(s => s.type === 'period').map(s => (
                        <option key={s.id} value={s.id}>{s.label} ({s.startTime})</option>
                    ))}
                </Select>
            </FormField>
          </div>

          <FormField label="Subject" required>
            <Select 
                required 
                value={formData.subjectId} 
                onChange={e => handleSubjectChange(e.target.value)}
            >
              <option value="">Select Subject</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Teacher" required>
            <Select 
                required 
                disabled={!formData.subjectId}
                value={formData.teacherId} 
                onChange={e => setFormData({...formData, teacherId: e.target.value})}
            >
              <option value="">{formData.subjectId ? "Select Teacher" : "Select Subject First"}</option>
              {filteredTeachers.map(t => {
                const isBusy = busyTeachers.has(t.id);
                return (
                  <option key={t.id} value={t.id} disabled={isBusy}>
                    {t.name} {isBusy ? '(Occupied)' : ''}
                  </option>
                );
              })}
            </Select>
          </FormField>

          <FormField label="Room / Location">
            <Input 
                placeholder="e.g. Lab 1, Room 202" 
                value={formData.room} 
                onChange={e => setFormData({...formData, room: e.target.value})} 
            />
          </FormField>
        </form>
      </Modal>

      {/* Publish New Version Modal */}
      <Modal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        title="Save as New Version"
        subtitle="Archive the current schedule and start a new version. Past lesson logs remain anchored to their original slots."
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setIsPublishModalOpen(false)}>Cancel</Button>
            <Button icon={Archive} onClick={handlePublishNewVersion} loading={publishLoading}>Archive & Publish</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800 flex gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">When should you use this?</p>
              <p className="mt-1 text-xs leading-relaxed">
                Use this for permanent restructures (new term, government rule change). For minor timing tweaks just edit the slots directly — old lesson logs already store their slot labels.
              </p>
            </div>
          </div>
          <FormField label="Effective from">
            <Input type="date" value={publishEffectiveFrom} onChange={e => setPublishEffectiveFrom(e.target.value)} />
          </FormField>
          <FormField label="Academic year">
            <Input placeholder="e.g. 2025-26" value={publishAcademicYear} onChange={e => setPublishAcademicYear(e.target.value)} />
          </FormField>
          <div className="text-xs text-slate-500">
            Current version: <span className="font-bold text-slate-700">v{selectedTimetable?.version || 1}</span>
            {' → '}
            New version: <span className="font-bold text-emerald-600">v{(selectedTimetable?.version || 1) + 1}</span>
          </div>
        </div>
      </Modal>

      {/* Version History Modal */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title="Timetable Version History"
        subtitle="Archived versions for the selected class."
        size="xl"
      >
        {historyLoading ? (
          <p className="text-center py-8 text-sm text-slate-500">Loading history...</p>
        ) : archiveDocs.length === 0 ? (
          <div className="py-12 text-center">
            <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">No archived versions yet</p>
            <p className="text-xs text-slate-500 mt-1">Publishing a new version archives the current one here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {archiveDocs.map(a => (
              <div key={a.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Version {a.version || '?'}{a.academicYear ? ` · ${a.academicYear}` : ''}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {a.effectiveFrom ? `Effective ${a.effectiveFrom}` : 'Effective date n/a'}
                      {a.effectiveTo ? ` → ${a.effectiveTo}` : ''}
                    </p>
                  </div>
                  <Badge variant="info">Archived</Badge>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Archived {a.archivedAt ? new Date(a.archivedAt).toLocaleString() : ''} · {a.schedule?.length || 0} days configured
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
