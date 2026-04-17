import { Routes, Route, Navigate } from 'react-router-dom';
import PortalLayout from '../../components/PortalLayout';
import { auth, db } from '../../firebase';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from '../../types';
import StudentDashboard from './StudentDashboard';
import StudentHomework from './StudentHomework';
import StudentFees from './StudentFees';
import StudentTimetable from './StudentTimetable';
import StudentNotes from './StudentNotes';
import StudentProfile from './StudentProfile';
import ResultView from '../shared/ResultView';
import AcademicCalendar from '../admin/AcademicCalendar';
import NoticeBoard from '../admin/NoticeBoard';
import { Student } from '../../types';

export default function StudentPortal({ user }: { user: UserProfile }) {
  const [student, setStudent] = useState<Student | null>(null);

  useEffect(() => {
    if (user.studentId) {
      const fetchStudent = async () => {
        const docRef = doc(db, 'students', user.studentId!);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setStudent({ id: docSnap.id, ...docSnap.data() } as Student);
        }
      };
      fetchStudent();
    }
  }, [user.studentId]);

  return (
    <PortalLayout role="student" userName={user.name}>
      <Routes>
        <Route path="/" element={<StudentDashboard user={user} />} />
        <Route path="/homework" element={<StudentHomework user={user} />} />
        <Route path="/fees" element={<StudentFees user={user} />} />
        <Route path="/timetable" element={<StudentTimetable user={user} />} />
        <Route path="/notes" element={<StudentNotes user={user} />} />
        <Route path="/profile" element={<StudentProfile user={user} student={student} />} />
        <Route path="/exams" element={student ? <ResultView student={student} /> : null} />
        <Route path="/calendar" element={<AcademicCalendar user={user} />} />
        <Route path="/notices" element={<NoticeBoard user={user} />} />
        <Route path="*" element={<Navigate to="/student" />} />
      </Routes>
    </PortalLayout>
  );
}
