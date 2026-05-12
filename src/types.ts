export type UserRole = 'super_admin' | 'student' | 'parent' | 'accounts' | 'teacher' | 'principal' | 'office_staff';

export interface ModulePermission {
  enabled: boolean;
  readOnly: boolean;
}

export interface RolePermissions {
  id: string; // role name e.g., 'principal'
  modules: Record<string, ModulePermission>;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  schoolNumber?: string; // 7-digit school number (without 'p' for parents)
  classId?: string;
  section?: string;
  parentId?: string;
  studentId?: string;
  teacherId?: string;
  studentIds?: string[]; // Array of student IDs for parents
  photoURL?: string;
  phone?: string;
  address?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Student {
  id: string;
  schoolNumber: string; // Same as admissionNumber
  admissionNumber: string; // Same as schoolNumber
  name: string;
  classId: string;
  section: string;
  parentId: string;
  parentDetails?: {
    fatherName: string;
    motherName: string;
    phone: string;
    email: string;
  };
  transportDetails?: string;
  documents?: string[];
  medicalNotes?: string;
  academicHistory?: string;
  houseId?: string;
  gender: 'male' | 'female' | 'other' | '';
  feeStatus: 'paid' | 'pending' | 'overdue';
  photoURL?: string;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role?: string; // For categorization
  subjects: string[]; // Subject IDs
  classes: string[]; // Class IDs or formatted strings
  salaryStructure: number;
  joiningDetails: string;
  category?: 'Teacher';
  houseInchargeId?: string;
  isHouseIncharge?: boolean;
  classTeacherOf?: {
    classId: string;
    section: string;
  };
  photoURL?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string; // 'principal', 'accounts', 'security', etc.
  joiningDate: string;
  salary: number;
  status: 'active' | 'on-leave' | 'resigned';
  category?: 'Staff' | 'Management' | 'Administration';
  updatedAt?: string;
  photoURL?: string;
}

export type UnifiedStaff = (Teacher | StaffMember) & {
  staffCategory: 'Teacher' | 'Principal' | 'Accounts' | 'Admin' | 'Other Staff';
  baseSalary: number;
};

export interface Class {
  id: string;
  name: string;
  sections: {
    name: string;
    capacity: number;
    classTeacherId?: string;
  }[];
  subjects: string[]; // Subject IDs
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  type: 'theory' | 'practical' | 'both';
  teacherId?: string;
}

export interface House {
  id: string;
  name: string;
  color: string;
  teacherInchargeId?: string;
}

export interface TimeSlot {
  id: string;
  label: string; // e.g. "1st Period", "Break", "Lunch"
  startTime: string; // e.g. "08:30 AM"
  endTime: string; // e.g. "09:30 AM"
  type: 'period' | 'break' | 'lunch';
}

export interface TimetableConfig {
  id: string;
  slots: TimeSlot[];
  days: string[]; // e.g. ["Monday", "Tuesday", ...]
  updatedAt: string;
}

export interface Timetable {
  id: string;
  classId: string;
  schedule: {
    day: string;
    periods: {
      slotId: string;
      subjectId: string;
      teacherId: string;
      room?: string;
    }[];
  }[];
  updatedAt: string;
}

export interface FeeHead {
  name: string;
  amount: number;
  description?: string;
}

export interface FeeStructure {
  id: string;
  classId: string;
  heads: FeeHead[];
  updatedAt: string;
}

export interface FineSlab {
  startDay: number;
  endDay?: number;
  fixedPenalty: number;
  percentagePenalty: number;
  isHigherOf: boolean;
  escalationRate?: number;
}

export interface FineConfig {
  id: string;
  isEnabled: boolean;
  gracePeriodDays: number;
  slabs: FineSlab[];
  updatedBy: string;
  updatedAt: string;
}

export interface FeeRequest {
  id: string;
  studentId: string;
  classId: string;
  academicYear: string;
  month: string;
  heads: {
    name: string;
    amount: number;
    discount: number;
    finalAmount: number;
  }[];
  totalAmount: number;
  fineAmount: number;
  waivedAmount: number;
  paidAmount: number;
  status: 'paid' | 'pending' | 'partially_paid' | 'overdue';
  dueDate: string;
  createdAt: string;
  waivedBy?: string;
  waivedAt?: string;
  waiverReason?: string;
}

export type PaymentMethod = 'bank_transfer' | 'cheque' | 'cash' | 'upi' | 'net_banking' | 'online';

export interface PaymentHistory {
  id: string;
  feeRequestId: string;
  studentId: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  referenceNumber?: string;
  transactionId?: string;
  status: 'success' | 'failed' | 'pending';
  receiptUrl?: string;
}

export interface Fee {
  id: string;
  studentId: string;
  structure: {
    head: string;
    amount: number;
  }[];
  status: 'paid' | 'pending' | 'overdue';
  receipts: string[];
}

export interface Attendance {
  id: string;
  date: string;
  studentId: string;
  status: 'present' | 'absent' | 'late' | 'approved_leave' | 'leave_pending' | 'uninformed_absence';
  type: 'student' | 'staff';
  remarks?: string;
  classId?: string; // Add classId for better searching
}

export interface Homework {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  content: string;
  dueDate: string;
  attachmentUrl?: string;
  attachmentName?: string;
  submissions: {
    studentId: string;
    content: string;
    submittedAt: string;
    remarks?: string;
  }[];
}

export interface Exam {
  id: string;
  name: string;
  term: string;
  startDate: string;
  endDate: string;
  classIds: string[];
  subjectId: string;
  maxMarks: number;
  gradingScaleId: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'published';
  type: 'scheduled' | 'surprise' | 'internal' | 'practical';
  syllabus?: {
    text?: string;
    photoUrl?: string;
    storagePath?: string;
  };
  topic?: string;
  startTime?: string;
  room?: string;
  createdAt: string;
  createdBy: string;
}

export interface ExamResult {
  id: string;
  examId: string;
  studentId: string;
  classId: string;
  subjectResults: {
    subjectId: string;
    marksObtained: number;
    maxMarks: number;
    grade: string;
    remarks?: string;
  }[];
  totalMarks: number;
  percentage: number;
  overallGrade: string;
  rank?: number;
  published: boolean;
  updatedAt: string;
}

export interface GradingScale {
  id: string;
  name: string;
  ranges: {
    min: number;
    max: number;
    grade: string;
    point: number;
    description: string;
  }[];
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  targetRoles: UserRole[];
  priority: 'low' | 'medium' | 'high';
  authorId: string;
  authorName: string;
  createdAt: string;
  expiresAt?: string;
}

export interface SchoolEvent {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  type: 'holiday' | 'exam' | 'event' | 'meeting';
  allDay: boolean;
  location?: string;
  color?: string;
}

export interface Communication {
  id: string;
  type: 'sms' | 'whatsapp' | 'email' | 'notification';
  content: string;
  recipientId: string;
  sentAt: string;
}

export interface Expense {
  id: string;
  category: string;
  biller: string;
  amount: number;
  date: string;
  status: 'paid' | 'pending';
  description?: string;
  receiptUrl?: string;
  phone?: string;
  address?: string;
  paymentMode?: 'cash' | 'bank_transfer' | 'upi' | 'cheque' | 'card' | 'other';
}

export interface PayrollConfig {
  id: string;
  workingDaysInYear: number; // e.g. 240
  leaveDeductionPerDay?: number; // Fixed override if set
  pfRate: number; // percentage
  professionalTax: number; // flat amount
  updatedBy: string;
  updatedAt: string;
}

export interface Salary {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  month: string;
  baseAmount: number;
  allowances: number;
  deductions: {
    pf: number;
    tax: number;
    leaves: number;
    leaveDeduction: number;
    other: number;
  };
  netAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: 'pending' | 'partially_paid' | 'paid';
  remarks?: string;
  paymentHistory?: {
    amount: number;
    date: string;
    method: string;
    transactionId?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAllocation {
  headName: string;        // Must match a name in the parent FeeRequest.heads[]
  amount: number;          // Portion of FeePayment.amount applied to this head
}

export interface FeePayment {
  id: string;
  studentId: string;
  classId: string;
  feeRequestId: string;
  feeHead: string;                  // Primary head label (kept for backwards-compatibility)
  amount: number;
  fineAmount?: number;              // Fine snapshotted into this payment (if any)
  allocations?: PaymentAllocation[]; // Breakdown across the request's heads
  date: string;
  method: PaymentMethod;
  referenceNumber?: string;
  transactionId?: string;
  receiptNumber: string;
  remarks?: string;
}

export interface LessonLog {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  date: string;
  slotId: string;
  topic: string;
  classwork: string;
  classworkFileUrl?: string;
  classworkFileName?: string;
  homework: string;
  homeworkFileUrl?: string;
  homeworkFileName?: string;
  createdAt: string;
}

export type LeaveType = 'planned' | 'medical' | 'emergency' | 'half_day' | 'regularization';
export type LeaveStatus = 'submitted' | 'pending' | 'approved' | 'rejected' | 'document_required' | 'regularized' | 'unregularized' | 'cancelled';
export type LeaveReasonCategory = 'Medical' | 'Family Function' | 'Travel' | 'Emergency' | 'Religious Reason' | 'Personal Reason' | 'Exam-related' | 'Other';

export interface StudentLeaveRequest {
  id: string;
  studentId: string;
  parentId: string;
  studentName: string;
  classId: string;
  section: string;
  leaveType: LeaveType;
  reasonCategory: LeaveReasonCategory;
  reason: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  documentUrl?: string;
  documentName?: string;
  isEmergency: boolean;
  parentDeclaration: boolean;
  status: LeaveStatus;
  adminRemarks?: string;
  submittedAt: string;
  updatedAt: string;
  processedBy?: string;
  processedAt?: string;
  attendanceConnectionStatus: 'pending' | 'connected' | 'not_applicable';
}

export type ActivitySection = 'Super Admin' | 'Accounts' | 'Parents' | 'Students' | 'Academic' | 'Teachers' | 'Exam' | 'Staff' | 'Principal';

export interface ActivityLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  section: ActivitySection;
  details: string;
  ip?: string;
  userAgent?: string;
}
