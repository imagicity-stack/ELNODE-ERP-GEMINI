export const SCHOOL_NAME = "The Elden Heights School";
export const APP_NAME = "EL-NODE";
export const SCHOOL_DOMAIN = "eldenheights.org";
export const APP_LOGO = "/pwa-512x512.png";

export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  STUDENT: 'student',
  PARENT: 'parent',
  ACCOUNTS: 'accounts',
  TEACHER: 'teacher',
  PRINCIPAL: 'principal',
} as const;

export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
} as const;

export const FEE_STATUS = {
  PAID: 'paid',
  PENDING: 'pending',
  OVERDUE: 'overdue',
} as const;

export const EXAM_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
} as const;

export const COMMUNICATION_TYPES = {
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
  NOTIFICATION: 'notification',
} as const;
