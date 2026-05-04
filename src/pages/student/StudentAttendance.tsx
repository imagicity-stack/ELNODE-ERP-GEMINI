import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, Attendance } from '../../types';
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

  return (
    <div className="space-y-6">
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
            <StatCard
              label="Overall"
              value={`${percentage}%`}
              icon={Clock}
              gradient="gradient-emerald"
              index={0}
            />
            <StatCard
              label="Present"
              value={presentDays.toString()}
              icon={CheckCircle2}
              gradient="gradient-blue"
              index={1}
            />
            <StatCard
              label="Absent"
              value={absentDays.toString()}
              icon={XCircle}
              gradient="bg-gradient-to-br from-rose-500 to-red-600"
              index={2}
            />
            <StatCard
              label="Late"
              value={lateDays.toString()}
              icon={AlertCircle}
              gradient="bg-gradient-to-br from-amber-500 to-orange-600"
              index={3}
            />
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
                        <span className="font-medium text-slate-900">{record.date}</span>
                      </div>
                    </Td>
                    <Td>
                      <Badge
                        variant={
                          record.status === 'present' ? 'success' :
                          record.status === 'absent' ? 'error' :
                          'warning'
                        }
                      >
                        {record.status}
                      </Badge>
                    </Td>
                    <Td className="text-slate-500 text-sm italic">
                      {record.remarks || '-'}
                    </Td>
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
  );
}
