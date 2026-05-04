import { Routes, Route, Navigate } from 'react-router-dom';
import PortalLayout from '../../components/PortalLayout';
import { UserProfile } from '../../types';
import PrincipalDashboard from './PrincipalDashboard';
import StudentManagement from './StudentManagement';
import TeacherManagement from './TeacherManagement';
import ClassManagement from './ClassManagement';
import SubjectManagement from './SubjectManagement';
import HouseManagement from './HouseManagement';
import StaffManagement from './StaffManagement';
import AdmissionManagement from './AdmissionManagement';
import ExamManagement from './ExamManagement';
import NoticeBoard from './NoticeBoard';
import AcademicCalendar from './AcademicCalendar';
import GradingScaleManagement from './GradingScaleManagement';
import TimetableManagement from './TimetableManagement';
import ActivityTracker from './ActivityTracker';

export default function PrincipalPortal({ user }: { user: UserProfile }) {
  return (
    <PortalLayout role="principal" userName={user.name}>
      <Routes>
        <Route path="/" element={<PrincipalDashboard user={user} />} />
        <Route path="/students" element={<StudentManagement user={user} />} />
        <Route path="/teachers" element={<TeacherManagement user={user} />} />
        <Route path="/classes" element={<ClassManagement user={user} />} />
        <Route path="/subjects" element={<SubjectManagement user={user} />} />
        <Route path="/houses" element={<HouseManagement user={user} />} />
        <Route path="/staff" element={<StaffManagement />} />
        <Route path="/admissions" element={<AdmissionManagement />} />
        <Route path="/exams" element={<ExamManagement user={user} />} />
        <Route path="/timetable" element={<TimetableManagement />} />
        <Route path="/grading-scales" element={<GradingScaleManagement />} />
        <Route path="/notices" element={<NoticeBoard user={user} />} />
        <Route path="/activity-logs" element={<ActivityTracker />} />
        <Route path="/calendar" element={<AcademicCalendar user={user} />} />
        <Route path="*" element={<Navigate to="/principal" />} />
      </Routes>
    </PortalLayout>
  );
}
