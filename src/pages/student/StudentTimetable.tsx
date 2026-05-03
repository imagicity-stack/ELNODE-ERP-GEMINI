import { UserProfile } from '../../types';
import { Calendar, Clock, BookOpen, User, MapPin } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StudentTimetableProps {
  user: UserProfile;
}

export default function StudentTimetable({ user }: StudentTimetableProps) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const times = ['08:30 AM', '09:30 AM', '10:30 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM'];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Timetable</h1>
          <p className="text-gray-500 text-sm">Your class schedule for the current academic session.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-bold">
            Class {user.classId || 'N/A'} - {user.section || 'N/A'}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 border-r border-gray-100 text-left text-xs font-bold text-gray-400 uppercase tracking-widest w-32">Time</th>
                {days.map(day => (
                  <th key={day} className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest min-w-[160px]">{day}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {times.map((time, i) => (
                <tr key={time} className="group hover:bg-gray-50 transition-all">
                  <td className="px-6 py-8 border-r border-gray-100 text-xs font-bold text-gray-500 bg-gray-50/30">{time}</td>
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
                        <td key={`${day}-${time}`} className="px-4 py-2 bg-emerald-50/30 text-center">
                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Lunch Break</span>
                        </td>
                      );
                    }

                    return (
                      <td key={`${day}-${time}`} className="px-4 py-2">
                        <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 group-hover:bg-white group-hover:shadow-sm transition-all">
                          <p className="text-xs font-bold text-blue-600 mb-1">Mathematics</p>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400">
                            <User className="w-3 h-3" />
                            <span>Dr. Sarah Smith</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
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
      </div>
    </div>
  );
}
