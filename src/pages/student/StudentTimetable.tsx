import { UserProfile, Timetable, TimetableConfig } from '../../types';
import { useData } from '../../contexts/DataContext';
import { Calendar, User, MapPin, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  PageHeader,
  Card,
  Badge,
  Spinner,
} from '../../components/ui';

interface StudentTimetableProps {
  user: UserProfile;
}

const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

export default function StudentTimetable({ user }: StudentTimetableProps) {
  const { classesMap } = useData();
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [config, setConfig] = useState<TimetableConfig | null>(null);
  const [subjects, setSubjects] = useState<Record<string, {name: string, code: string}>>({});
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mobileDay, setMobileDay] = useState(todayName);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const configSnap = await getDoc(doc(db, 'timetableSettings', 'global')).catch(err => { handleFirestoreError(err, OperationType.GET, 'timetableSettings'); throw err; });
        if (configSnap.exists()) {
          const cfg = configSnap.data() as TimetableConfig;
          setConfig(cfg);
          // Default to today if it exists, otherwise first day
          if (cfg.days && !cfg.days.includes(mobileDay)) {
            setMobileDay(cfg.days[0]);
          }
        }

        if (user.classId) {
          const q = query(
            collection(db, 'timetable'),
            where('classId', '==', user.classId)
          );
          const snapshot = await getDocs(q).catch(err => { handleFirestoreError(err, OperationType.LIST, 'timetable'); throw err; });
          if (!snapshot.empty) {
            setTimetable({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Timetable);
          }
        }

        const subSnap = await getDocs(collection(db, 'subjects')).catch(err => { handleFirestoreError(err, OperationType.LIST, 'subjects'); throw err; });
        const subMap: Record<string, {name: string, code: string}> = {};
        subSnap.docs.forEach(d => {
          const data = d.data();
          subMap[d.id] = { name: data.name, code: data.code };
        });
        setSubjects(subMap);

        const teachSnap = await getDocs(collection(db, 'teachers')).catch(err => { handleFirestoreError(err, OperationType.LIST, 'teachers'); throw err; });
        const teachMap: Record<string, string> = {};
        teachSnap.docs.forEach(d => {
          teachMap[d.id] = d.data().name;
        });
        setTeachers(teachMap);

      } catch (err) {
        console.error('Error fetching timetable data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user.classId]);

  const getPeriod = (day: string, slotId: string) => {
    if (!timetable) return null;
    const daySchedule = timetable.schedule.find(s => s.day === day);
    return daySchedule?.periods.find(p => p.slotId === slotId);
  };

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-4 pt-5 pb-4 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Student Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Weekly Timetable</h1>
          <p className="text-xs text-emerald-100 mt-1">
            {classesMap[user.classId] || user.classId || 'N/A'} – Section {user.section || 'N/A'}
          </p>
        </div>

        {/* Day chips */}
        {config && (
          <div className="px-4 pt-3 pb-3 overflow-x-auto flex gap-2 [scrollbar-width:none] bg-white border-b border-slate-100">
            {config.days.map(day => (
              <button
                key={day}
                onClick={() => setMobileDay(day)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${mobileDay === day ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}
              >
                {day === todayName && (
                  <span className="w-1.5 h-1.5 bg-yellow-300 rounded-full animate-pulse" />
                )}
                {day}
              </button>
            ))}
          </div>
        )}

        <div className="px-4 pt-3 pb-24 space-y-2">
          {loading || !config ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            config.slots.map(slot => {
              if (slot.type === 'break') {
                return (
                  <div key={slot.id} className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-amber-700">{slot.label}</p>
                      <p className="text-[10px] text-amber-500">{slot.startTime} – {slot.endTime}</p>
                    </div>
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Break</span>
                  </div>
                );
              }

              if (slot.type === 'lunch') {
                return (
                  <div key={slot.id} className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-emerald-700">{slot.label}</p>
                      <p className="text-[10px] text-emerald-500">{slot.startTime} – {slot.endTime}</p>
                    </div>
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Lunch</span>
                  </div>
                );
              }

              const period = getPeriod(mobileDay, slot.id);
              const subject = period ? subjects[period.subjectId] : null;
              const teacherName = period ? teachers[period.teacherId] : null;

              if (!period) {
                return (
                  <div key={slot.id} className="border border-dashed border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-400">{slot.label}</p>
                      <p className="text-[10px] text-slate-300">{slot.startTime} – {slot.endTime}</p>
                    </div>
                    <span className="text-[10px] text-slate-300 font-bold">Free Period</span>
                  </div>
                );
              }

              return (
                <div key={slot.id} className="bg-white border border-slate-100 rounded-xl px-4 py-3 border-l-4 border-l-emerald-500 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-emerald-700 truncate">{subject?.name || period.subjectId}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500">
                        <User className="w-3 h-3 shrink-0" />
                        <span className="truncate">{teacherName || 'TBA'}</span>
                        {period.room && (
                          <>
                            <span>·</span>
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">Room {period.room}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-bold text-slate-500">{slot.label}</p>
                      <p className="text-[10px] text-slate-400">{slot.startTime}–{slot.endTime}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-8">
        <PageHeader
          title="Weekly Timetable"
          subtitle="Your class schedule for the current academic session."
          icon={Calendar}
          iconColor="gradient-emerald"
          actions={
            <Badge variant="success">
              {classesMap[user.classId] || user.classId || 'N/A'} - {user.section || 'N/A'}
            </Badge>
          }
        />

        {loading || !config ? (
          <Spinner />
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 border-r border-slate-100 text-left text-xs font-bold text-slate-500 uppercase tracking-widest w-40">
                      Time
                    </th>
                    {config.days.map(day => (
                      <th key={day} className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest min-w-[200px]">
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
                              <Badge variant="warning">Short Break</Badge>
                            </td>
                          );
                        }

                        if (slot.type === 'lunch') {
                          return (
                            <td key={`${day}-${slot.id}`} className="px-4 py-2 bg-emerald-50/30 text-center border-r border-slate-50/50">
                              <Badge variant="success">Lunch Break</Badge>
                            </td>
                          );
                        }

                        const period = getPeriod(day, slot.id);
                        const subject = period ? subjects[period.subjectId] : null;
                        const teacherName = period ? teachers[period.teacherId] : null;

                        return (
                          <td key={`${day}-${slot.id}`} className="px-4 py-3 border-r border-slate-50/50">
                            {period ? (
                              <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 group-hover:bg-white group-hover:shadow-sm transition-all border-l-4 border-l-emerald-500">
                                <p className="text-xs font-bold text-emerald-700 mb-1 line-clamp-1">{subject?.name || period.subjectId}</p>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                  <User className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{teacherName || 'TBA'}</span>
                                </div>
                                {period.room && (
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1 italic">
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    <span className="truncate">Room: {period.room}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="h-full min-h-[60px] border border-dashed border-slate-100 rounded-xl" />
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
      </div>
    </>
  );
}
