import { Routes, Route, Navigate } from 'react-router-dom';
import PortalLayout from '../../components/PortalLayout';
import { db } from '../../firebase';
import { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { UserProfile, Student } from '../../types';
import ParentDashboard from './ParentDashboard';
import ParentFees from './ParentFees';
import ParentLeaves from './ParentLeaves';
import ParentAttendance from './ParentAttendance';
import ProfileSettings from '../shared/ProfileSettings';
import ParentTimetable from './ParentTimetable';
import ParentSubjects from './ParentSubjects';
import ResultView from '../shared/ResultView';
import AcademicCalendar from '../admin/AcademicCalendar';
import NoticeBoard from '../admin/NoticeBoard';
import LessonLogs from '../shared/LessonLogs';
import { ChevronDown, Users } from 'lucide-react';

export default function ParentPortal({ user }: { user: UserProfile }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStudents = async () => {
      if (user.studentIds && user.studentIds.length > 0) {
        const studentList: Student[] = [];
        for (const id of user.studentIds) {
          const studentDoc = await getDoc(doc(db, 'students', id));
          if (studentDoc.exists()) {
            studentList.push({ id: studentDoc.id, ...studentDoc.data() } as Student);
          }
        }
        setStudents(studentList);
        if (studentList.length > 0) {
          setSelectedStudent(studentList[0]);
        }
      }
      setLoading(false);
    };
    fetchStudents();
  }, [user.studentIds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <PortalLayout 
      user={user}
      customHeader={
        students.length > 1 ? (
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all">
              <Users className="w-4 h-4 text-indigo-600" />
              {selectedStudent?.name || 'Select Student'}
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 hidden group-hover:block z-50">
              {students.map((student) => (
                <button
                  key={student.id}
                  onClick={() => setSelectedStudent(student)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-600 transition-all font-medium"
                >
                  {student.name}
                </button>
              ))}
            </div>
          </div>
        ) : null
      }
    >
      <Routes>
        <Route path="/" element={<ParentDashboard user={user} selectedStudent={selectedStudent} />} />
        <Route path="/fees" element={<ParentFees user={user} selectedStudent={selectedStudent} />} />
        <Route path="/leaves" element={<ParentLeaves user={user} selectedStudent={selectedStudent} />} />
        <Route path="/attendance" element={<ParentAttendance user={user} selectedStudent={selectedStudent} />} />
        <Route path="/timetable" element={<ParentTimetable user={user} selectedStudent={selectedStudent} />} />
        <Route path="/subjects" element={<ParentSubjects user={user} selectedStudent={selectedStudent} />} />
        <Route path="/profile" element={<ProfileSettings user={user} />} />
        <Route path="/exams" element={selectedStudent ? <ResultView student={selectedStudent} /> : null} />
        <Route path="/calendar" element={<AcademicCalendar user={user} />} />
        <Route path="/notices" element={<NoticeBoard user={user} />} />
        <Route path="/diary" element={<LessonLogs user={user} student={selectedStudent || undefined} />} />
        <Route path="*" element={<Navigate to="/parent" />} />
      </Routes>
    </PortalLayout>
  );
}
