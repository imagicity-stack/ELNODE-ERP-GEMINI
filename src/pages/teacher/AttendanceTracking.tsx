import { UserProfile, Teacher, Student, Attendance } from '../../types';
import { ClipboardCheck, Save, Users, BookOpen, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import { useData } from '../../contexts/DataContext';
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
  const [attendance, setAttendance] = useState<Record<string, 'present' | 'absent' | 'late'>>({});
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
        const attendanceSnap = await getDocs(query(
          collection(db, 'attendance'),
          where('date', '==', today),
          where('type', '==', 'student')
        ));

        const attendanceMap: Record<string, 'present' | 'absent' | 'late'> = {};
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

  const toggleAttendance = (id: string, status: 'present' | 'absent' | 'late') => {
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
        if (existingRecords[studentId]) {
          const docRef = doc(db, 'attendance', existingRecords[studentId]);
          batch.update(docRef, { status, updatedAt: serverTimestamp() });
        } else {
          const docRef = doc(collection(db, 'attendance'));
          batch.set(docRef, {
            date: today,
            studentId,
            status,
            type: 'student',
            classId: selectedClass,
            markedBy: user.teacherId || user.uid,
            createdAt: serverTimestamp()
          });
        }
      });

      await batch.commit();
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
    total: students.length
  };

  return (
    <div className="space-y-8">
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
                      <p className="text-sm font-bold text-red-600">{stats.absent}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Absent</p>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-sm font-bold text-amber-600">{stats.late}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Late</p>
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
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => toggleAttendance(student.id, 'present')}
                                className={cn(
                                  "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
                                  attendance[student.id] === 'present'
                                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                )}
                              >
                                Present
                              </button>
                              <button
                                onClick={() => toggleAttendance(student.id, 'absent')}
                                className={cn(
                                  "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
                                  attendance[student.id] === 'absent'
                                    ? "bg-red-600 text-white shadow-lg shadow-red-600/20"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                )}
                              >
                                Absent
                              </button>
                              <button
                                onClick={() => toggleAttendance(student.id, 'late')}
                                className={cn(
                                  "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
                                  attendance[student.id] === 'late'
                                    ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                )}
                              >
                                Late
                              </button>
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
  );
}
