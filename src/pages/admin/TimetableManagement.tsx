import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, query, where, addDoc, updateDoc, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Calendar, Plus, Trash2, Edit2, Clock, Users, BookOpen, AlertCircle, Settings, Save, Trash } from 'lucide-react';
import { PageHeader, Card, Button, IconButton, Modal, ConfirmModal, Select, FormField, Input, Badge } from '../../components/ui';
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as any; // Type assertion because of schedule structure
        await addDoc(collection(db, 'timetable'), newTT);
      }

      // Refresh timetables
      const snap = await getDocs(collection(db, 'timetable'));
      setTimetables(snap.docs.map(d => ({ id: d.id, ...d.data() } as Timetable)));
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
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'timetable');
    }
  };

  const getPeriod = (day: string, slotId: string) => {
    if (!selectedTimetable) return null;
    const daySchedule = selectedTimetable.schedule.find(s => s.day === day);
    return daySchedule?.periods.find(p => p.slotId === slotId);
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

  return (
    <div className="space-y-8">
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
    </div>
  );
}
