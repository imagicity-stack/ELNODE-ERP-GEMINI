import { UserProfile, Timetable, TimetableConfig } from '../../types';
import { Calendar, User, MapPin, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useData } from '../../contexts/DataContext';
import {
  PageHeader,
  Card,
  Badge,
  Spinner,
} from '../../components/ui';

interface StudentTimetableProps {
  user: UserProfile;
}

export default function StudentTimetable({ user }: StudentTimetableProps) {
  const { classesMap: classes } = useData();
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [config, setConfig] = useState<TimetableConfig | null>(null);
  const [subjects, setSubjects] = useState<Record<string, {name: string, code: string}>>({});
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Config
        const configSnap = await getDoc(doc(db, 'timetableSettings', 'global')).catch(err => { handleFirestoreError(err, OperationType.GET, 'timetableSettings'); throw err; });
        if (configSnap.exists()) {
          setConfig(configSnap.data() as TimetableConfig);
        }

        // Fetch Timetable
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

        // Fetch Subjects mapping
        const subSnap = await getDocs(collection(db, 'subjects')).catch(err => { handleFirestoreError(err, OperationType.LIST, 'subjects'); throw err; });
        const subMap: Record<string, {name: string, code: string}> = {};
        subSnap.docs.forEach(d => {
          const data = d.data();
          subMap[d.id] = { name: data.name, code: data.code };
        });
        setSubjects(subMap);

        // Fetch Teachers mapping
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
    <div className="space-y-8">
      <PageHeader
        title="Weekly Timetable"
        subtitle="Your class schedule for the current academic session."
        icon={Calendar}
        iconColor="gradient-emerald"
        actions={
          <Badge variant="success">
            Class {classes[user.classId || ''] || user.classId || 'N/A'} {user.section && `- ${user.section}`}
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
  );
}
