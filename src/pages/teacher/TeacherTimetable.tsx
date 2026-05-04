import { UserProfile, Timetable } from '../../types';
import { Calendar, Users, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useData } from '../../contexts/DataContext';
import {
  PageHeader,
  Card,
  Badge,
  Spinner,
  EmptyState,
} from '../../components/ui';

interface TeacherTimetableProps {
  user: UserProfile;
}

export default function TeacherTimetable({ user }: TeacherTimetableProps) {
  const { teacherData, timetableConfig: config, timetables, subjectsMap: subjects, classesMap: classes, loading: globalLoading } = useData();
  const [localLoading, setLocalLoading] = useState(false);

  const getPeriod = (day: string, slotId: string) => {
    const teacherId = teacherData?.id || user.uid;
    for (const tt of timetables) {
      const daySchedule = tt.schedule.find(s => s.day === day);
      if (daySchedule) {
        const period = daySchedule.periods.find(p => p.slotId === slotId && p.teacherId === teacherId);
        if (period) {
          return { ...period, classId: tt.classId };
        }
      }
    }
    return null;
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

      {localLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <Spinner size="lg" />
          <p className="text-slate-500 font-medium animate-pulse">Loading schedule...</p>
        </div>
      ) : !config ? (
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
                            <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 group-hover:bg-white group-hover:shadow-sm transition-all border-l-4 border-l-blue-500">
                              <p className="text-xs font-bold text-blue-600 mb-1">{subjectName || period.subjectId}</p>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                <Users className="w-3 h-3" />
                                <span>Class {className || period.classId}</span>
                              </div>
                            </div>
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
    </div>
  );
}
