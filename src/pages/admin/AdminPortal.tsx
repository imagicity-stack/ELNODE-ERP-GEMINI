import { Routes, Route, Navigate } from 'react-router-dom';
import PortalLayout from '../../components/PortalLayout';
import { auth, db } from '../../firebase';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from '../../types';
import AdminDashboard from './AdminDashboard';
import StudentManagement from './StudentManagement';
import TeacherManagement from './TeacherManagement';
import ClassManagement from './ClassManagement';
import SubjectManagement from './SubjectManagement';
import HouseManagement from './HouseManagement';
import FeeStructure from './FeeStructure';
import StaffManagement from './StaffManagement';
import AdmissionManagement from './AdmissionManagement';
import ExamManagement from './ExamManagement';
import NoticeBoard from './NoticeBoard';
import AcademicCalendar from './AcademicCalendar';
import GradingScaleManagement from './GradingScaleManagement';
import ExpenseManagement from '../accounts/ExpenseManagement';
import SalaryManagement from '../accounts/SalaryManagement';
import FinancialReports from '../accounts/FinancialReports';
import FeeCollection from '../accounts/FeeCollection';

export default function AdminPortal({ user }: { user: UserProfile }) {
  return (
    <PortalLayout role="super_admin" userName={user.name}>
      <Routes>
        <Route path="/" element={<AdminDashboard user={user} />} />
        <Route path="/students" element={<StudentManagement />} />
        <Route path="/teachers" element={<TeacherManagement />} />
        <Route path="/classes" element={<ClassManagement />} />
        <Route path="/subjects" element={<SubjectManagement />} />
        <Route path="/houses" element={<HouseManagement />} />
        <Route path="/fees" element={<FeeStructure />} />
        <Route path="/fee-collection" element={<FeeCollection user={user} />} />
        <Route path="/expenses" element={<ExpenseManagement user={user} />} />
        <Route path="/salaries" element={<SalaryManagement user={user} />} />
        <Route path="/reports" element={<FinancialReports user={user} />} />
        <Route path="/staff" element={<StaffManagement />} />
        <Route path="/admissions" element={<AdmissionManagement />} />
        <Route path="/exams" element={<ExamManagement user={user} />} />
        <Route path="/grading-scales" element={<GradingScaleManagement />} />
        <Route path="/notices" element={<NoticeBoard user={user} />} />
        <Route path="/calendar" element={<AcademicCalendar user={user} />} />
        <Route path="*" element={<Navigate to="/superadmin" />} />
      </Routes>
    </PortalLayout>
  );
}
