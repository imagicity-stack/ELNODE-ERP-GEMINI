import { Routes, Route, Navigate } from 'react-router-dom';
import TeacherShell from '../../components/TeacherShell';
import { UserProfile } from '../../types';
import TeacherDashboard from './TeacherDashboard';
import MyClasses from './MyClasses';
import AttendanceTracking from './AttendanceTracking';
import ExamManagement from './ExamManagement';
import TeacherTimetable from './TeacherTimetable';
import TeacherNotes from './TeacherNotes';
import ResultEntry from './ResultEntry';
import AcademicCalendar from '../admin/AcademicCalendar';
import NoticeBoard from '../admin/NoticeBoard';
import LessonLogs from '../shared/LessonLogs';
import ProfileSettings from '../shared/ProfileSettings';
import TeacherLeaves from './TeacherLeaves';

export default function TeacherPortal({ user }: { user: UserProfile }) {
  return (
    <TeacherShell user={user}>
      <Routes>
        <Route path="/" element={<TeacherDashboard user={user} />} />
        <Route path="/classes" element={<MyClasses user={user} />} />
        <Route path="/attendance" element={<AttendanceTracking user={user} />} />
        <Route path="/notes" element={<TeacherNotes user={user} />} />
        <Route path="/exams" element={<ExamManagement user={user} />} />
        <Route path="/exams/:examId/marks" element={<ResultEntry user={user} />} />
        <Route path="/timetable" element={<TeacherTimetable user={user} />} />
        <Route path="/calendar" element={<AcademicCalendar user={user} />} />
        <Route path="/notices" element={<NoticeBoard user={user} />} />
        <Route path="/diary" element={<LessonLogs user={user} />} />
        <Route path="/leaves" element={<TeacherLeaves user={user} />} />
        <Route path="/profile" element={<ProfileSettings user={user} />} />
        <Route path="*" element={<Navigate to="/teacher" />} />
      </Routes>
    </TeacherShell>
  );
}
