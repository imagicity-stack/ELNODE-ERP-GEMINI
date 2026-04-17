import { Routes, Route, Navigate } from 'react-router-dom';
import PortalLayout from '../../components/PortalLayout';
import { auth, db } from '../../firebase';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from '../../types';
import TeacherDashboard from './TeacherDashboard';
import AttendanceTracking from './AttendanceTracking';
import HomeworkManagement from './HomeworkManagement';
import ExamManagement from './ExamManagement';
import TeacherTimetable from './TeacherTimetable';
import AcademicCalendar from '../admin/AcademicCalendar';

export default function TeacherPortal({ user }: { user: UserProfile }) {
  return (
    <PortalLayout role="teacher" userName={user.name}>
      <Routes>
        <Route path="/" element={<TeacherDashboard user={user} />} />
        <Route path="/attendance" element={<AttendanceTracking user={user} />} />
        <Route path="/homework" element={<HomeworkManagement user={user} />} />
        <Route path="/exams" element={<ExamManagement user={user} />} />
        <Route path="/timetable" element={<TeacherTimetable user={user} />} />
        <Route path="/calendar" element={<AcademicCalendar user={user} />} />
        <Route path="*" element={<Navigate to="/teacher" />} />
      </Routes>
    </PortalLayout>
  );
}
