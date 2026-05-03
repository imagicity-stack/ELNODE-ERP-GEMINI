import { UserProfile, Timetable, Teacher } from '../../types';
import { Calendar, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  PageHeader,
  Card,
  Badge,
  Spinner,
} from '../../components/ui';

interface TeacherTimetableProps {
  user: UserProfile;
}

export default function TeacherTimetable({ user }: TeacherTimetableProps) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const times = ['08:30 AM', '09:30 AM', '10:30 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM'];

  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Teacher Profile
        const teacherDoc = await getDoc(doc(db, 'teachers', user.uid));
        if (teacherDoc.exists()) {
          const tData = { id: teacherDoc.id, ...teacherDoc.data() } as Teacher;
          setTeacherData(tData);

          // Fetch Timetables for all classes assigned to the teacher
          if (tData.classes && tData.classes.length > 0) {
            const timetableSnap = await getDocs(query(
              collection(db, 'timetable'),
              where('classId', 'in', tData.classes)
            ));
            setTimetables(timetableSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Timetable)));
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'timetable');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.uid]);

  const getPeriod = (day: string, time: string) => {
    for (const tt of timetables) {
      const daySchedule = tt.schedule.find(s => s.day === day);
      if (daySchedule) {
        const period = daySchedule.periods.find(p => p.time.startsWith(time) && p.teacherId === user.uid);
        if (period) {
          return { ...period, classId: tt.classId };
        }
      }
    }
    return null;
  };

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

      {loading ? (
        <Spinner />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 border-r border-slate-100 text-left text-xs font-bold text-slate-400 uppercase tracking-widest w-32">
                    Time
                  </th>
                  {days.map(day => (
                    <th key={day} className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-widest min-w-[160px]">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {times.map((time) => (
                  <tr key={time} className="group hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-8 border-r border-slate-100 text-xs font-bold text-slate-500 bg-slate-50/30 whitespace-nowrap">
                      {time}
                    </td>
                    {days.map(day => {
                      const isBreak = time === '10:30 AM';
                      const isLunch = time === '01:00 PM';

                      if (isBreak) {
                        return (
                          <td key={`${day}-${time}`} className="px-4 py-2 bg-amber-50/30 text-center">
                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Short Break</span>
                          </td>
                        );
                      }

                      if (isLunch) {
                        return (
                          <td key={`${day}-${time}`} className="px-4 py-2 bg-blue-50/30 text-center">
                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Lunch Break</span>
                          </td>
                        );
                      }

                      const period = getPeriod(day, time);

                      return (
                        <td key={`${day}-${time}`} className="px-4 py-2">
                          {period ? (
                            <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 group-hover:bg-white group-hover:shadow-sm transition-all">
                              <p className="text-xs font-bold text-blue-600 mb-1">{period.subjectId}</p>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                <Users className="w-3 h-3" />
                                <span>Class {period.classId}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 rounded-xl bg-slate-50/50 border border-dashed border-slate-200 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-slate-300 uppercase">Free Period</span>
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
    </div>
  );
}
