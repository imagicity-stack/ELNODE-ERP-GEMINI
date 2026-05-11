import { UserProfile, Teacher, Student, Attendance, StudentLeaveRequest } from '../../types';
import { ClipboardCheck, Save, Users, BookOpen, TrendingUp, Check, X, Clock as ClockIcon, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import { useData } from '../../contexts/DataContext';
import { logActivity } from '../../services/activityService';
import {
  PageHeader,
  Card,
  Button,
  SearchInput,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  Badge,
  EmptyState,
  Spinner,
} from '../../components/ui';

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

  // 0. Derived classes for the teacher
  const availableClasses = (user.role === 'super_admin' || user.role === 'principal')
    ? Object.keys(classesMap || {}).sort()
    : Array.from(new Set([
        ...(teacherData?.classes || []),
        ...timetables
          .filter(tt => tt.schedule.some(day => day.periods.some(p => p.teacherId === (teacherData?.id || user.uid))))
          .map(tt => tt.classId)
      ])).sort();

  // 1. Detect Allocated Class based on Timetable
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

      // Find current slot
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
              // Auto-select it initially if none selected
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
    const interval = setInterval(detectCurrentClass, 60000); // Check every minute
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
        // Fetch Students
        const studentsSnap = await getDocs(query(
          collection(db, 'students'),
          where('classId', '==', selectedClass)
        ));
        const studentsList = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
        setStudents(studentsList);

        // Fetch Today's Attendance
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch Leaves
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

      // First, find existing records for today for these students to update them
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
        
        // If it's absent and no leave exists, mark as uninformed_absence
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
      
      // Log activity
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

  const statusOptions: Array<{ key: Attendance['status']; label: string; color: string; icon: any }> = [
    { key: 'present', label: 'Present', color: 'emerald', icon: Check },
    { key: 'absent', label: 'Absent', color: 'red', icon: X },
    { key: 'late', label: 'Late', color: 'amber', icon: ClockIcon },
    { key: 'approved_leave', label: 'Leave', color: 'slate', icon: FileText },
  ];

  return (
    <>
      {/* ─── Mobile UI ───────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-4 pt-5 pb-4 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Today's Attendance</p>
          <h1 className="text-xl font-bold mt-0.5">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</h1>

          {/* Class chips - horizontal scroll */}
          <div className="mt-3 -mx-4 px-4 overflow-x-auto flex gap-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {availableClasses.map((cls) => (
              <button
                key={cls}
                onClick={() => setSelectedClass(cls)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                  selectedClass === cls
                    ? "bg-white text-blue-700"
                    : "bg-white/15 text-white border border-white/20"
                )}
              >
                {classesMap?.[cls] || cls}
                {currentAllocatedClass === cls && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse" />
                )}
              </button>
            ))}
            {availableClasses.length === 0 && (
              <span className="text-xs text-white/70 italic">No classes assigned</span>
            )}
          </div>
        </div>

        {/* Stats strip */}
        {selectedClass && students.length > 0 && (
          <div className="mx-4 -mt-2 mb-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-3 grid grid-cols-4 gap-2">
            <div className="text-center">
              <p className="text-base font-bold text-emerald-600">{stats.present}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase">Present</p>
            </div>
            <div className="text-center border-l border-slate-100">
              <p className="text-base font-bold text-red-600">{stats.absent}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase">Absent</p>
            </div>
            <div className="text-center border-l border-slate-100">
              <p className="text-base font-bold text-amber-600">{stats.late}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase">Late</p>
            </div>
            <div className="text-center border-l border-slate-100">
              <p className="text-base font-bold text-slate-700">{stats.approvedLeave}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase">Leave</p>
            </div>
          </div>
        )}

        {/* Search */}
        {selectedClass && students.length > 0 && (
          <div className="px-4 mb-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search student..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
        )}

        {/* Bulk action: mark all present */}
        {selectedClass && filteredStudents.length > 0 && (
          <div className="px-4 mb-3">
            <button
              onClick={() => {
                const allPresent: Record<string, Attendance['status']> = {};
                filteredStudents.forEach(s => allPresent[s.id] = 'present');
                setAttendance(prev => ({ ...prev, ...allPresent }));
              }}
              className="w-full py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold border border-emerald-200 active:bg-emerald-100"
            >
              Mark All Present
            </button>
          </div>
        )}

        {/* Student cards */}
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : !selectedClass ? (
          <div className="px-4 py-12 text-center">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">Select a class above</p>
            <p className="text-xs text-slate-500 mt-1">Choose a class to mark attendance</p>
          </div>
        ) : (
          <div className="px-4 space-y-2">
            {filteredStudents.map((student) => {
              const current = attendance[student.id];
              return (
                <div key={student.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                        {student.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{student.name}</p>
                        <p className="text-[10px] text-slate-500">#{student.admissionNumber}</p>
                      </div>
                    </div>
                    {leaves[student.id] && (
                      <Badge variant={leaves[student.id].status === 'approved' ? 'success' : 'warning'} className="text-[8px] px-1.5 py-0">
                        {leaves[student.id].status}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {statusOptions.map(({ key, label, color, icon: Icon }) => {
                      const isActive = current === key || (key === 'absent' && current === 'uninformed_absence');
                      const colorClass: Record<string, string> = {
                        emerald: isActive ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700',
                        red: isActive ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700',
                        amber: isActive ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700',
                        slate: isActive ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600',
                      };
                      return (
                        <button
                          key={key}
                          onClick={() => toggleAttendance(student.id, key)}
                          className={cn(
                            "py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex flex-col items-center gap-0.5 active:scale-95",
                            colorClass[color]
                          )}
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
              <div className="py-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">No students found</p>
              </div>
            )}
          </div>
        )}

        {/* Sticky save button */}
        {selectedClass && filteredStudents.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-white border-t border-slate-100 shadow-2xl z-50">
            <button
              onClick={saveAttendance}
              disabled={saving}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : `Save Attendance (${Object.keys(attendance).length})`}
            </button>
          </div>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Attendance Tracking"
        subtitle="Mark and manage daily attendance for your classes."
        icon={ClipboardCheck}
        iconColor="gradient-blue"
        actions={
          <Button
            icon={Save}
            onClick={saveAttendance}
            disabled={saving || students.length === 0}
            loading={saving}
          >
            {saving ? 'Saving...' : 'Save Attendance'}
          </Button>
        }
      />

      {globalLoading && !teacherData && user.role === 'teacher' ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <Spinner size="lg" />
          <p className="text-slate-500 font-medium animate-pulse">Initializing attendance tracking...</p>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <Spinner size="lg" />
          <p className="text-slate-500 font-medium animate-pulse">Loading class students...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Class Selector Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-500" />
                Select Class
              </h3>
              <div className="space-y-2">
                {availableClasses.map((cls) => (
                  <button
                    key={cls}
                    onClick={() => setSelectedClass(cls)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl transition-all group",
                      selectedClass === cls ? "bg-blue-50 text-blue-600 shadow-sm" : "hover:bg-slate-50 text-slate-700"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                        selectedClass === cls ? "bg-blue-100" : "bg-slate-100"
                      )}>
                        {cls.charAt(0)}
                      </div>
                      <span className="text-sm font-bold">{classesMap?.[cls] || `Class ${cls}`}</span>
                      {currentAllocatedClass === cls && (
                        <Badge variant="success" className="animate-pulse ml-2 text-[8px] px-1.5 py-0">
                          Current
                        </Badge>
                      )}
                    </div>
                    <Users className={cn("w-4 h-4", selectedClass === cls ? "text-blue-600" : "text-slate-400")} />
                  </button>
                ))}
                {availableClasses.length === 0 && (
                  <p className="text-xs text-slate-500 italic text-center py-4">No classes assigned.</p>
                )}
              </div>
            </Card>

            {/* Attendance Stats */}
            {selectedClass && (
              <Card>
                <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                  Today's Summary
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase">Present</span>
                    <span className="text-sm font-bold text-emerald-600">{stats.present}/{stats.total}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${stats.total > 0 ? (stats.present / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="text-center flex-1 border-r border-slate-100">
                      <p className="text-sm font-bold text-slate-600">{stats.approvedLeave}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Leave</p>
                    </div>
                    <div className="text-center flex-1 border-r border-slate-100">
                      <p className="text-sm font-bold text-amber-600">{stats.late}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Late</p>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-sm font-bold text-red-600">{stats.absent}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Absent</p>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Attendance List */}
          <div className="lg:col-span-3 space-y-6">
            {!selectedClass ? (
              <EmptyState
                icon={BookOpen}
                title="No class selected"
                description="Please select a class from the sidebar to mark attendance."
              />
            ) : (
              <>
                <Card padding="sm">
                  <SearchInput
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Search student by name or roll no..."
                    className="max-w-md"
                  />
                </Card>

                <Card padding="none">
                  <Table>
                    <Thead>
                      <tr>
                        <Th>Roll No.</Th>
                        <Th>Student Name</Th>
                        <Th className="text-center">Attendance Status</Th>
                      </tr>
                    </Thead>
                    <Tbody>
                      {filteredStudents.map((student) => (
                        <Tr key={student.id}>
                          <Td className="font-bold text-slate-500">{student.admissionNumber}</Td>
                          <Td className="font-bold text-slate-900">{student.name}</Td>
                          <Td>
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <button
                                onClick={() => toggleAttendance(student.id, 'present')}
                                className={cn(
                                  "px-3 py-1 rounded-lg text-[9px] font-bold uppercase transition-all",
                                  attendance[student.id] === 'present'
                                    ? "bg-emerald-600 text-white shadow-sm"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                )}
                              >
                                Present
                              </button>
                              <button
                                onClick={() => toggleAttendance(student.id, 'absent')}
                                className={cn(
                                  "px-3 py-1 rounded-lg text-[9px] font-bold uppercase transition-all",
                                  attendance[student.id] === 'absent' || attendance[student.id] === 'uninformed_absence'
                                    ? "bg-red-600 text-white shadow-sm"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                )}
                              >
                                Absent
                              </button>
                              <button
                                onClick={() => toggleAttendance(student.id, 'late')}
                                className={cn(
                                  "px-3 py-1 rounded-lg text-[9px] font-bold uppercase transition-all",
                                  attendance[student.id] === 'late'
                                    ? "bg-amber-500 text-white shadow-sm"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                )}
                              >
                                Late
                              </button>
                              <button
                                onClick={() => toggleAttendance(student.id, 'approved_leave')}
                                className={cn(
                                  "px-3 py-1 rounded-lg text-[9px] font-bold uppercase transition-all",
                                  attendance[student.id] === 'approved_leave'
                                    ? "bg-slate-700 text-white shadow-sm"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                )}
                              >
                                Leave
                              </button>
                              {leaves[student.id] && (
                                <Badge variant={leaves[student.id].status === 'approved' ? 'success' : 'warning'} className="text-[8px] px-1 py-0 uppercase">
                                  {leaves[student.id].status}
                                </Badge>
                              )}
                            </div>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                  {filteredStudents.length === 0 && (
                    <EmptyState
                      icon={Users}
                      title="No students found"
                      description="No students found for this class."
                    />
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
}
