export type UserRole = 'super_admin' | 'student' | 'parent' | 'accounts' | 'teacher' | 'principal';

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
  feeStatus: 'paid' | 'pending' | 'overdue';
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  subjects: string[]; // Subject IDs
  classes: string[]; // Class IDs or formatted strings
  salaryStructure: number;
  joiningDetails: string;
  houseInchargeId?: string;
  isHouseIncharge?: boolean;
  classTeacherOf?: {
    classId: string;
    section: string;
  };
}

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

export interface Timetable {
  id: string;
  classId: string;
  schedule: {
    day: string;
    periods: {
      time: string;
      subjectId: string;
      teacherId: string;
    }[];
  }[];
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
  status: 'paid' | 'pending' | 'overdue';
  dueDate: string;
  createdAt: string;
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
  status: 'present' | 'absent' | 'late';
  type: 'student' | 'staff';
}

export interface Homework {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  content: string;
  dueDate: string;
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
  type: 'scheduled' | 'surprise';
  syllabus?: {
    text?: string;
    photoUrl?: string;
  };
  topic?: string;
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
}

export interface Salary {
  id: string;
  teacherId: string;
  month: string; // e.g. "2023-10"
  amount: number;
  status: 'paid' | 'pending';
  paidAt?: string;
  bonus?: number;
  deductions?: number;
  remarks?: string;
}

export interface FeePayment {
  id: string;
  studentId: string;
  feeRequestId: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  referenceNumber?: string;
  transactionId?: string;
  receiptNumber: string;
  remarks?: string;
}
