import { UserProfile, Student, Attendance } from '../../types';
import { ClipboardCheck, Calendar, Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  PageHeader,
  Card,
  Badge,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
} from '../../components/ui';

interface ParentAttendanceProps {
  user: UserProfile;
  selectedStudent: Student | null;
}

export default function ParentAttendance({ user, selectedStudent }: ParentAttendanceProps) {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    const fetchAttendance = async () => {
      if (!selectedStudent?.id) return;
      setLoading(true);
      try {
        const q = query(
          collection(db, 'attendance'),
          where('studentId', '==', selectedStudent.id),
          orderBy('date', 'desc')
        );
        const snap = await getDocs(q).catch(err => { handleFirestoreError(err, OperationType.LIST, 'attendance'); throw err; });
        setAttendance(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance)));
      } catch (err) {
        console.error('Error fetching parent attendance data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAttendance();
  }, [selectedStudent?.id]);

  if (!selectedStudent) return null;

  const totalDays = attendance.length;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const absentDays = attendance.filter(a => a.status === 'absent').length;
  const lateDays = attendance.filter(a => a.status === 'late').length;
  const attendancePercentage = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : '0';

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Attendance Records"
        subtitle={`Track ${selectedStudent.name}'s daily attendance and leave history`}
        icon={ClipboardCheck}
        iconColor="gradient-violet"
        actions={
          <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {attendancePercentage}% Overall
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Monthly Calendar View */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-violet-600" />
                {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-all"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-all"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-[10px] font-bold text-slate-400 uppercase py-2">{day}</div>
              ))}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square"></div>
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const record = attendance.find(a => a.date === dateStr);
                const isWeekend = (new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).getDay()) % 7 === 0 ||
                  (new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).getDay()) % 7 === 6;

                return (
                  <div
                    key={day}
                    className={cn(
                      "aspect-square rounded-xl flex items-center justify-center text-xs font-bold transition-all border relative group",
                      isWeekend ? "bg-slate-50 text-slate-300 border-slate-50" :
                        !record ? "bg-white border-slate-100 text-slate-400" :
                          record.status === 'present' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                            record.status === 'absent' || record.status === 'uninformed_absence' ? "bg-red-50 text-red-600 border-red-100" :
                              record.status === 'approved_leave' ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                                record.status === 'leave_pending' ? "bg-amber-50 text-amber-600 border-amber-100" :
                                  "bg-amber-50 text-amber-600 border-amber-100"
                    )}
                  >
                    {day}
                    {record && (
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-slate-900 border text-white text-[8px] px-1.5 py-0.5 rounded shadow-xl z-10 pointer-events-none uppercase font-black tracking-widest">
                         {record.status.replace('_', ' ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Recent Absences */}
          <Card padding="none">
            <div className="p-6 border-b bg-slate-50/50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                Recent Absences
              </h3>
            </div>
            {attendance.filter(a => a.status === 'absent').length > 0 ? (
              <Table>
                <Thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Status</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {attendance.filter(a => a.status === 'absent').slice(0, 5).map((abs, i) => (
                    <Tr key={i}>
                      <Td className="font-bold text-slate-900">{new Date(abs.date).toLocaleDateString()}</Td>
                      <Td><Badge variant="error">Absent</Badge></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            ) : (
              <EmptyState title="No absences recorded" description="Great attendance! No recent absences found." />
            )}
          </Card>
        </div>

        {/* Sidebar: Stats */}
        <div className="space-y-6">
          <Card>
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-violet-600" />
              Yearly Statistics
            </h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Present</p>
                    <p className="text-lg font-bold text-slate-900">{presentDays} Days</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Absent</p>
                    <p className="text-lg font-bold text-slate-900">{absentDays} Days</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Late Arrivals</p>
                    <p className="text-lg font-bold text-slate-900">{lateDays} Days</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
