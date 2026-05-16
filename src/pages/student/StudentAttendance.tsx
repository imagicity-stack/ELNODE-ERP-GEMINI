import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, Attendance } from '../../types';
import { fmtDate } from '../../lib/utils';
import {
  PageHeader,
  Card,
  Badge,
  Spinner,
  EmptyState,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  StatCard,
} from '../../components/ui';
import { ClipboardCheck, Calendar, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface StudentAttendanceProps {
  user: UserProfile;
}

export default function StudentAttendance({ user }: StudentAttendanceProps) {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttendance = async () => {
      const studentId = user.studentId || user.schoolNumber || user.uid;
      if (!studentId) return;

      setLoading(true);
      try {
        const q = query(
          collection(db, 'attendance'),
          where('studentId', '==', studentId),
          orderBy('date', 'desc')
        );
        const snap = await getDocs(q).catch(err => {
          handleFirestoreError(err, OperationType.LIST, 'attendance');
          throw err;
        });
        setAttendance(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance)));
      } catch (err) {
        console.error('Error fetching attendance:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [user.uid, user.studentId, user.schoolNumber]);

  const totalDays = attendance.length;
  const presentDays = attendance.filter(a => a.status === 'present').length;
  const absentDays = attendance.filter(a => a.status === 'absent').length;
  const lateDays = attendance.filter(a => a.status === 'late').length;
  const percentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  const statusInfo = (status: string) => {
    switch (status) {
      case 'present': return { label: 'Present', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' };
      case 'absent': return { label: 'Absent', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' };
      case 'late': return { label: 'Late', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' };
      case 'approved_leave': return { label: 'Approved Leave', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' };
      case 'leave_pending': return { label: 'Leave Pending', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' };
      case 'uninformed_absence': return { label: 'Uninformed', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' };
      default: return { label: status.replace(/_/g, ' '), color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' };
    }
  };

  const percentColor = percentage >= 75 ? 'text-emerald-300' : percentage >= 60 ? 'text-amber-300' : 'text-rose-300';

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-4 pt-5 pb-6 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Student Portal</p>
          <h1 className="text-xl font-bold mt-0.5">My Attendance</h1>
          <div className="mt-4 grid grid-cols-4 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className={`text-xl font-black ${percentColor}`}>{percentage}%</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Overall</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black">{presentDays}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Present</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black">{absentDays}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Absent</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black">{lateDays}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Late</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-24 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : attendance.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No attendance records"
              description="Attendance records will appear here once they are marked by your teacher."
            />
          ) : (
            attendance.map((record) => {
              const info = statusInfo(record.status);
              return (
                <div key={record.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${info.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-sm font-bold text-slate-900">{fmtDate(record.date)}</span>
                    </div>
                    {record.remarks && (
                      <p className="text-xs text-slate-500 italic mt-0.5 truncate">{record.remarks}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${info.color} capitalize`}>
                    {info.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-6">
        <PageHeader
          title="My Attendance"
          subtitle="Track your daily attendance and overall performance."
          icon={ClipboardCheck}
          iconColor="gradient-emerald"
        />

        {loading ? (
          <Spinner />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard label="Overall" value={`${percentage}%`} icon={Clock} gradient="gradient-emerald" index={0} />
              <StatCard label="Present" value={presentDays.toString()} icon={CheckCircle2} gradient="gradient-blue" index={1} />
              <StatCard label="Absent" value={absentDays.toString()} icon={XCircle} gradient="bg-gradient-to-br from-rose-500 to-red-600" index={2} />
              <StatCard label="Late" value={lateDays.toString()} icon={AlertCircle} gradient="bg-gradient-to-br from-amber-500 to-orange-600" index={3} />
            </div>

            <Card padding="none">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Date</Th>
                    <Th>Status</Th>
                    <Th>Remarks</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {attendance.map((record) => (
                    <Tr key={record.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span className="font-medium text-slate-900">{fmtDate(record.date)}</span>
                        </div>
                      </Td>
                      <Td>
                        <Badge variant={
                          record.status === 'present' ? 'success' :
                          record.status === 'absent' ? 'error' :
                          record.status === 'approved_leave' ? 'info' :
                          record.status === 'leave_pending' ? 'warning' :
                          record.status === 'uninformed_absence' ? 'error' : 'warning'
                        }>
                          {record.status.replace('_', ' ')}
                        </Badge>
                      </Td>
                      <Td className="text-slate-500 text-sm italic">{record.remarks || '-'}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {attendance.length === 0 && (
                <EmptyState
                  icon={ClipboardCheck}
                  title="No attendance records"
                  description="Attendance records will appear here once they are marked by your teacher."
                />
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
