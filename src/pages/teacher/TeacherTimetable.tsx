import { UserProfile, Timetable, LessonLog } from '../../types';
import { Calendar, Users, Clock, Edit3, BookOpen, CheckSquare, Upload, File, X, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { useData } from '../../contexts/DataContext';
import { cn } from '../../lib/utils';
import { logActivity } from '../../services/activityService';
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

  const handleOpenLog = async (period: any, slot: any) => {
    setSelectedPeriod({ ...period, slot });
    setLocalLoading(true);
    setUploadProgress({ cw: 0, hw: 0 });
    
    try {
      // Find existing log for this day/period
      const today = new Date().toISOString().split('T')[0];
      const q = query(
        collection(db, 'lessonLogs'),
        where('teacherId', '==', (teacherData?.id || user.uid)),
        where('classId', '==', period.classId),
        where('slotId', '==', slot.id),
        where('date', '==', today)
      );
      
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data() as LessonLog;
        setLessonData({
          topic: data.topic,
          classwork: data.classwork,
          homework: data.homework,
          classworkFile: null,
          homeworkFile: null,
        });
        setSelectedPeriod(prev => ({ ...prev, existingId: snap.docs[0].id, topic: data.topic }));
      } else {
        setLessonData({
          topic: '',
          classwork: '',
          homework: '',
          classworkFile: null,
          homeworkFile: null,
        });
        setSelectedPeriod(prev => ({ ...prev, existingId: null }));
      }
      setIsModalOpen(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'lessonLogs');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriod) return;

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const logData: any = {
        classId: selectedPeriod.classId,
        subjectId: selectedPeriod.subjectId,
        teacherId: teacherData?.id || user.uid,
        date: today,
        slotId: selectedPeriod.slot.id,
        topic: lessonData.topic,
        classwork: lessonData.classwork,
        homework: lessonData.homework,
        updatedAt: new Date().toISOString(),
      };

      // Upload files in parallel if present
      const uploadPromises: Promise<any>[] = [];

      if (lessonData.classworkFile) {
        const path = `lessons/${today}/${selectedPeriod.classId}/classwork_${Date.now()}_${lessonData.classworkFile.name}`;
        uploadPromises.push(
          uploadFile(lessonData.classworkFile, path, 'cw').then(url => {
            logData.classworkFileUrl = url;
            logData.classworkFileName = lessonData.classworkFile!.name;
          })
        );
      }

      if (lessonData.homeworkFile) {
        const path = `lessons/${today}/${selectedPeriod.classId}/homework_${Date.now()}_${lessonData.homeworkFile.name}`;
        uploadPromises.push(
          uploadFile(lessonData.homeworkFile, path, 'hw').then(url => {
            logData.homeworkFileUrl = url;
            logData.homeworkFileName = lessonData.homeworkFile!.name;
          })
        );
      }

      if (uploadPromises.length > 0) {
        try {
          await Promise.all(uploadPromises);
        } catch (uploadErr: any) {
          console.error("Upload failed:", uploadErr);
          throw new Error(`Upload failed: ${uploadErr.message || 'Check your internet or CORS settings'}`);
        }
      }

      if (selectedPeriod.existingId) {
        await setDoc(doc(db, 'lessonLogs', selectedPeriod.existingId), logData, { merge: true });
        logActivity(
          user, 
          'Updated Lesson Log', 
          'Teachers', 
          `Updated log for ${subjects[selectedPeriod.subjectId]} - ${classes[selectedPeriod.classId]}`,
          { classId: selectedPeriod.classId, subjectId: selectedPeriod.subjectId }
        );
      } else {
        logData.createdAt = new Date().toISOString();
        await addDoc(collection(db, 'lessonLogs'), logData);
        logActivity(
          user, 
          'Created Lesson Log', 
          'Teachers', 
          `Created log for ${subjects[selectedPeriod.subjectId]} - ${classes[selectedPeriod.classId]}`,
          { classId: selectedPeriod.classId, subjectId: selectedPeriod.subjectId }
        );
      }

      showToast('Lesson log saved successfully!', 'success');
      setIsModalOpen(false);
    } catch (err: any) {
      if (err.message === 'File size exceeds 1MB limit.') {
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
    <div className="space-y-8">
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
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 border-r border-slate-100 text-left text-xs font-bold text-slate-400 uppercase tracking-widest w-40">
                    Time Slot
                  </th>
                  {config.days.map(day => (
                    <th key={day} className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest min-w-[180px]">
                      {day}
                    </th>
                  ))}
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

                      return (
                        <td key={`${day}-${slot.id}`} className="px-4 py-2 border-r border-slate-50/50">
                          {period ? (
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
                          ) : (
                            <div className="p-3 rounded-xl bg-slate-50/10 border border-dashed border-slate-100 flex items-center justify-center min-h-[60px]">
                              <span className="text-[10px] font-bold text-slate-300 uppercase">Free</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
          <FormField label="Today's Topic" required>
            <Input
              placeholder="e.g. Introduction to Trigonometry"
              value={lessonData.topic}
              onChange={(e) => setLessonData({ ...lessonData, topic: e.target.value })}
              required
            />
          </FormField>

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
                onChange={(e) => setLessonData({ ...lessonData, classwork: e.target.value })}
              />
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
                onChange={(e) => setLessonData({ ...lessonData, homework: e.target.value })}
              />
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
    </div>
  );
}
