import { UserProfile } from '../../types';
import { Calendar, User, MapPin } from 'lucide-react';
import {
  PageHeader,
  Card,
  Badge,
} from '../../components/ui';

interface StudentTimetableProps {
  user: UserProfile;
}

export default function StudentTimetable({ user }: StudentTimetableProps) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const times = ['08:30 AM', '09:30 AM', '10:30 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM'];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Weekly Timetable"
        subtitle="Your class schedule for the current academic session."
        icon={Calendar}
        iconColor="gradient-emerald"
        actions={
          <Badge variant="success">
            Class {user.classId || 'N/A'} - {user.section || 'N/A'}
          </Badge>
        }
      />

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 border-r border-slate-100 text-left text-xs font-bold text-slate-500 uppercase tracking-widest w-32">
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
                          <Badge variant="warning">Short Break</Badge>
                        </td>
                      );
                    }

                    if (isLunch) {
                      return (
                        <td key={`${day}-${time}`} className="px-4 py-2 bg-emerald-50/30 text-center">
                          <Badge variant="success">Lunch Break</Badge>
                        </td>
                      );
                    }

                    return (
                      <td key={`${day}-${time}`} className="px-4 py-2">
                        <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 group-hover:bg-white group-hover:shadow-sm transition-all">
                          <p className="text-xs font-bold text-emerald-700 mb-1">Mathematics</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <User className="w-3 h-3" />
                            <span>Dr. Sarah Smith</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                            <MapPin className="w-3 h-3" />
                            <span>Room 204</span>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
