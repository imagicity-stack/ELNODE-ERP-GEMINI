import { UserProfile, Teacher, Student, Attendance } from '../../types';
import { ClipboardCheck, Calendar, Clock, CheckCircle2, XCircle, Search, Filter, Save, Users, BookOpen, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';

interface AttendanceTrackingProps {
  user: UserProfile;
}

export default function AttendanceTracking({ user }: AttendanceTrackingProps) {
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, 'present' | 'absent' | 'late'>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    const fetchTeacherData = async () => {
      try {
        const teacherDoc = await getDoc(doc(db, 'teachers', user.uid));
        if (teacherDoc.exists()) {
          const tData = { id: teacherDoc.id, ...teacherDoc.data() } as Teacher;
          setTeacherData(tData);
          if (tData.classes && tData.classes.length > 0) {
            setSelectedClass(tData.classes[0]);
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'teachers');
      }
    };
    fetchTeacherData();
  }, [user.uid]);

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
            markedBy: user.uid,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Tracking</h1>
          <p className="text-gray-500 text-sm">Mark and manage daily attendance for your classes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={saveAttendance}
            disabled={saving || students.length === 0}
            className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Attendance'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Class Selector Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-600" />
              Select Class
            </h3>
            <div className="space-y-2">
              {teacherData?.classes?.map((cls) => (
                <button 
                  key={cls} 
                  onClick={() => setSelectedClass(cls)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl transition-all group",
                    selectedClass === cls ? "bg-emerald-50 text-emerald-600 shadow-sm" : "hover:bg-gray-50 text-gray-700"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                      selectedClass === cls ? "bg-emerald-100" : "bg-gray-100"
                    )}>
                      {cls.charAt(0)}
                    </div>
                    <span className="text-sm font-bold">{cls}</span>
                  </div>
                  <Users className={cn("w-4 h-4", selectedClass === cls ? "text-emerald-600" : "text-gray-400")} />
                </button>
              ))}
              {(!teacherData?.classes || teacherData.classes.length === 0) && (
                <p className="text-xs text-gray-500 italic text-center py-4">No classes assigned.</p>
              )}
            </div>
          </div>

          {/* Attendance Stats */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Today's Summary
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase">Present</span>
                <span className="text-sm font-bold text-emerald-600">{stats.present}/{stats.total}</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-600 rounded-full transition-all duration-500" 
                  style={{ width: `${stats.total > 0 ? (stats.present / stats.total) * 100 : 0}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-center flex-1 border-r">
                  <p className="text-sm font-bold text-red-600">{stats.absent}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Absent</p>
                </div>
                <div className="text-center flex-1">
                  <p className="text-sm font-bold text-amber-600">{stats.late}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Late</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Attendance List */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search student by name or roll no..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 transition-all"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b bg-gray-50/50">
                  <th className="px-6 py-4">Roll No.</th>
                  <th className="px-6 py-4">Student Name</th>
                  <th className="px-6 py-4 text-center">Attendance Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50 transition-all">
                    <td className="px-6 py-4 text-sm font-bold text-gray-500">{student.admissionNumber}</td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{student.name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => toggleAttendance(student.id, 'present')}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
                            attendance[student.id] === 'present' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                          )}
                        >
                          Present
                        </button>
                        <button 
                          onClick={() => toggleAttendance(student.id, 'absent')}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
                            attendance[student.id] === 'absent' ? "bg-red-600 text-white shadow-lg shadow-red-600/20" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                          )}
                        >
                          Absent
                        </button>
                        <button 
                          onClick={() => toggleAttendance(student.id, 'late')}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
                            attendance[student.id] === 'late' ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                          )}
                        >
                          Late
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-sm text-gray-500 italic">
                      {loading ? 'Loading students...' : 'No students found for this class.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

