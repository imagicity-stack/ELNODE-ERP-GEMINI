import { UserProfile, Teacher, Student, Attendance, StudentLeaveRequest } from '../../types';
import { BookOpen, Users, Check, X, Clock as ClockIcon, FileText, Save } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import { useData } from '../../contexts/DataContext';
import { logActivity } from '../../services/activityService';
import { Spinner } from '../../components/ui';

interface AttendanceTrackingProps {
  user: UserProfile;
}

export default function AttendanceTracking({ user }: AttendanceTrackingProps) {
  const { teacherData, timetableConfig, timetables, classesMap, loading: globalLoading } = useData();
  const { showToast } = useToast();
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [currentAllocatedClass, setCurrentAllocatedClass] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Attendance['status']>>({});
  const [leaves, setLeaves] = useState<Record<string, StudentLeaveRequest>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const availableClasses = (user.role === 'super_admin' || user.role === 'principal')
    ? Object.keys(classesMap || {}).sort()
    : Array.from(new Set([
        ...(teacherData?.classes || []),
        ...timetables
          .filter(tt => tt.schedule.some(day => day.periods.some(p => p.teacherId === (teacherData?.id || user.uid))))
          .map(tt => tt.classId)
      ])).sort();

  useEffect(() => {
    if (!timetableConfig || !timetables.length) return;

    const detectCurrentClass = () => {
      const now = new Date();
      const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });

      const parseTimeToMinutes = (timeStr: string) => {
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };

      const nowInMinutes = now.getHours() * 60 + now.getMinutes();

      const currentSlot = timetableConfig.slots.find(slot => {
        const start = parseTimeToMinutes(slot.startTime);
        const end = parseTimeToMinutes(slot.endTime);
        return nowInMinutes >= start && nowInMinutes <= end;
      });

      if (currentSlot) {
        const teacherId = teacherData?.id || user.uid;
        for (const tt of timetables) {
          const daySchedule = tt.schedule.find(s => s.day === dayName);
          if (daySchedule) {
            const period = daySchedule.periods.find(p => p.slotId === currentSlot.id && p.teacherId === teacherId);
            if (period) {
              setCurrentAllocatedClass(tt.classId);
              if (!selectedClass) {
                setSelectedClass(tt.classId);
              }
              return;
            }
          }
        }
      }
      setCurrentAllocatedClass(null);
    };

    detectCurrentClass();
    const interval = setInterval(detectCurrentClass, 60000);
    return () => clearInterval(interval);
  }, [teacherData, user, timetableConfig, timetables, selectedClass]);

  useEffect(() => {
    if (availableClasses.length > 0 && !selectedClass && !currentAllocatedClass) {
      setSelectedClass(availableClasses[0]);
    }
  }, [availableClasses, selectedClass, currentAllocatedClass]);

  useEffect(() => {
    const fetchStudentsAndAttendance = async () => {
      if (!selectedClass) return;
      setLoading(true);
      try {
        const studentsSnap = await getDocs(query(
          collection(db, 'students'),
          where('classId', '==', selectedClass)
        ));
        const studentsList = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
        setStudents(studentsList);

        const today = new Date().toISOString().split('T')[0];

        const leavesSnap = await getDocs(query(
          collection(db, 'studentLeaves'),
          where('classId', '==', selectedClass),
          where('startDate', '<=', today),
          where('endDate', '>=', today)
        ));
        const leaveMap: Record<string, StudentLeaveRequest> = {};
        leavesSnap.docs.forEach(doc => {
          const data = doc.data() as StudentLeaveRequest;
          leaveMap[data.studentId] = { id: doc.id, ...data };
        });
        setLeaves(leaveMap);

        const attendanceSnap = await getDocs(query(
          collection(db, 'attendance'),
          where('date', '==', today),
          where('type', '==', 'student')
        ));

        const attendanceMap: Record<string, Attendance['status']> = {};
        studentsList.forEach(s => {
          if (leaveMap[s.id]) {
            const leave = leaveMap[s.id];
            if (leave.status === 'approved' || leave.status === 'regularized') {
              attendanceMap[s.id] = 'approved_leave';
            } else if (leave.status === 'submitted' || leave.status === 'pending') {
              attendanceMap[s.id] = 'leave_pending';
            }
          }
        });

        attendanceSnap.docs.forEach(doc => {
          const data = doc.data() as Attendance;
          if (studentsList.some(s => s.id === data.studentId)) {
            attendanceMap[data.studentId] = data.status;
          }
        });
        setAttendance(attendanceMap);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'students/attendance');
      } finally {
        setLoading(false);
      }
    };
    fetchStudentsAndAttendance();
  }, [selectedClass]);

  const toggleAttendance = (id: string, status: Attendance['status']) => {
    setAttendance(prev => ({ ...prev, [id]: status }));
  };

  const saveAttendance = async () => {
    if (!selectedClass) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const today = new Date().toISOString().split('T')[0];

      const attendanceSnap = await getDocs(query(
        collection(db, 'attendance'),
        where('date', '==', today),
        where('type', '==', 'student')
      ));

      const existingRecords: Record<string, string> = {};
      attendanceSnap.docs.forEach(doc => {
        const data = doc.data() as Attendance;
        existingRecords[data.studentId] = doc.id;
      });

      Object.entries(attendance).forEach(([studentId, status]) => {
        let finalStatus = status;

        if (status === 'absent' && !leaves[studentId]) {
          finalStatus = 'uninformed_absence';
        }

        if (existingRecords[studentId]) {
          const docRef = doc(db, 'attendance', existingRecords[studentId]);
          batch.update(docRef, { status: finalStatus, updatedAt: serverTimestamp() });
        } else {
          const docRef = doc(collection(db, 'attendance'));
          batch.set(docRef, {
            date: today,
            studentId,
            status: finalStatus,
            type: 'student',
            classId: selectedClass,
            markedBy: user.teacherId || user.uid,
            createdAt: serverTimestamp()
          });
        }
      });

      await batch.commit();

      logActivity(
        user,
        'Attendance Marked',
        'Teachers',
        `Marked attendance for Class ${selectedClass}`,
        { classId: selectedClass }
      );

      showToast('Attendance saved successfully!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'attendance');
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.admissionNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    present: Object.values(attendance).filter(s => s === 'present').length,
    absent: Object.values(attendance).filter(s => s === 'absent').length,
    late: Object.values(attendance).filter(s => s === 'late').length,
    total: students.length,
    approvedLeave: Object.values(attendance).filter(s => s === 'approved_leave').length,
    leavePending: Object.values(attendance).filter(s => s === 'leave_pending').length,
  };

  const statusOptions: Array<{ key: Attendance['status']; label: string; activeColor: string; inactiveColor: string; icon: any }> = [
    { key: 'present', label: 'Present', activeColor: 'var(--leaf)', inactiveColor: 'var(--cream-2)', icon: Check },
    { key: 'absent', label: 'Absent', activeColor: 'var(--coral)', inactiveColor: 'var(--cream-2)', icon: X },
    { key: 'late', label: 'Late', activeColor: '#F59E0B', inactiveColor: 'var(--cream-2)', icon: ClockIcon },
    { key: 'approved_leave', label: 'Leave', activeColor: 'var(--ink)', inactiveColor: 'var(--cream-2)', icon: FileText },
  ];

  return (
    <>
      <div className="topbar">
        <div className="pad">
          <p className="eyebrow">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
          <h1 className="display">Attendance</h1>
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: '6rem' }}>
        <div className="stack">
          {/* Class selector chips */}
          <div>
            <div className="hscroll" style={{ gap: '0.5rem', paddingBottom: '0.25rem' }}>
              {availableClasses.map((cls) => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={cn('chip', selectedClass === cls ? 'solid' : '')}
                  style={{ flexShrink: 0, position: 'relative' }}
                >
                  {classesMap?.[cls] || cls}
                  {currentAllocatedClass === cls && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        marginLeft: '0.375rem',
                        verticalAlign: 'middle',
                      }}
                    />
                  )}
                </button>
              ))}
              {availableClasses.length === 0 && (
                <span className="muted" style={{ fontSize: '0.8125rem' }}>No classes assigned</span>
              )}
            </div>
          </div>

          {/* Stats strip */}
          {selectedClass && students.length > 0 && (
            <div className="card" style={{ padding: '0.875rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                <div>
                  <p className="t-num" style={{ fontSize: '1.25rem', color: 'var(--leaf)' }}>{stats.present}</p>
                  <p className="eyebrow" style={{ marginTop: '0.125rem' }}>Present</p>
                </div>
                <div style={{ borderLeft: '1px solid var(--line)' }}>
                  <p className="t-num" style={{ fontSize: '1.25rem', color: 'var(--coral)' }}>{stats.absent}</p>
                  <p className="eyebrow" style={{ marginTop: '0.125rem' }}>Absent</p>
                </div>
                <div style={{ borderLeft: '1px solid var(--line)' }}>
                  <p className="t-num" style={{ fontSize: '1.25rem', color: '#F59E0B' }}>{stats.late}</p>
                  <p className="eyebrow" style={{ marginTop: '0.125rem' }}>Late</p>
                </div>
                <div style={{ borderLeft: '1px solid var(--line)' }}>
                  <p className="t-num" style={{ fontSize: '1.25rem', color: 'var(--ink-2)' }}>{stats.approvedLeave}</p>
                  <p className="eyebrow" style={{ marginTop: '0.125rem' }}>Leave</p>
                </div>
              </div>
              <div className="bar" style={{ marginTop: '0.75rem' }}>
                <i style={{ width: `${stats.total > 0 ? (stats.present / stats.total) * 100 : 0}%`, background: 'var(--leaf)' }} />
              </div>
            </div>
          )}

          {/* Search + bulk action */}
          {selectedClass && students.length > 0 && (
            <>
              <div className="card" style={{ padding: '0.75rem' }}>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search student..."
                  style={{
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontSize: '0.875rem',
                    color: 'var(--ink)',
                  }}
                />
              </div>
              <button
                onClick={() => {
                  const allPresent: Record<string, Attendance['status']> = {};
                  filteredStudents.forEach(s => allPresent[s.id] = 'present');
                  setAttendance(prev => ({ ...prev, ...allPresent }));
                }}
                className="btn ghost"
                style={{ width: '100%' }}
              >
                Mark All Present
              </button>
            </>
          )}

          {/* Student cards */}
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : !selectedClass ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <BookOpen className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ink-3)' }} />
              <p style={{ fontWeight: 700, color: 'var(--ink)' }}>Select a class above</p>
              <p className="muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>Choose a class to mark attendance</p>
            </div>
          ) : (
            <div className="stack" style={{ gap: '0.5rem' }}>
              {filteredStudents.map((student) => {
                const current = attendance[student.id];
                return (
                  <div key={student.id} className="card" style={{ padding: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <div
                          className="avatar"
                          style={{ width: 36, height: 36, fontSize: 14, flexShrink: 0 }}
                        >
                          {student.name.charAt(0)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {student.name}
                          </p>
                          <p className="muted mono tiny">#{student.admissionNumber}</p>
                        </div>
                      </div>
                      {leaves[student.id] && (
                        <span
                          className="chip"
                          style={{
                            fontSize: '0.65rem',
                            background: leaves[student.id].status === 'approved' ? 'var(--leaf)' : '#F59E0B',
                            color: 'white',
                            flexShrink: 0,
                          }}
                        >
                          {leaves[student.id].status}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.375rem' }}>
                      {statusOptions.map(({ key, label, activeColor, inactiveColor, icon: Icon }) => {
                        const isActiveStatus = current === key || (key === 'absent' && current === 'uninformed_absence');
                        return (
                          <button
                            key={key}
                            onClick={() => toggleAttendance(student.id, key)}
                            style={{
                              padding: '0.5rem 0.25rem',
                              borderRadius: '0.625rem',
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '0.25rem',
                              border: 'none',
                              cursor: 'pointer',
                              background: isActiveStatus ? activeColor : inactiveColor,
                              color: isActiveStatus ? 'white' : 'var(--ink-3)',
                              transition: 'all 0.15s',
                            }}
                          >
                            <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {filteredStudents.length === 0 && (
                <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                  <Users className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ink-3)' }} />
                  <p style={{ fontWeight: 700, color: 'var(--ink)' }}>No students found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky save button */}
      {selectedClass && filteredStudents.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 lg:sticky"
          style={{
            padding: '0.875rem 1rem',
            background: 'var(--paper)',
            borderTop: '1px solid var(--line)',
            zIndex: 50,
          }}
        >
          <button
            onClick={saveAttendance}
            disabled={saving}
            className="btn accent"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : `Save Attendance (${Object.keys(attendance).length})`}
          </button>
        </div>
      )}
    </>
  );
}
