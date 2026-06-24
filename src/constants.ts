export const SCHOOL_NAME = "The Elden Heights School";
export const APP_NAME = "EL-NODE";
export const SCHOOL_DOMAIN = "ehs.elnode.in";
export const LEGACY_DOMAIN = "eldenheights.org";
export const APP_LOGO = "/logo high res tp-01.png";

// UIDs granted super_admin access at the Firestore rules level.
// Must stay in sync with isSuperAdminByEmail() in firestore.rules.
export const SUPER_ADMIN_UIDS: string[] = [
  "Sev825sC9HSFIBUlYN3SGIWHMss1",
  "8uTs7freEPaiVtywgpg5G9in4JF2",
  "ldnsKSufIyOLFiyPhdmmIErNi7P2",
];

export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  STUDENT: 'student',
  PARENT: 'parent',
  ACCOUNTS: 'accounts',
  TEACHER: 'teacher',
  PRINCIPAL: 'principal',
  GRIEVANCE_OFFICER: 'grievance_officer',
  CA: 'ca',
} as const;

// Default password assigned to a Chartered Accountant when their portal account is
// provisioned from Super Admin → CA Portal Access. The CA is prompted to change it
// on first login (see UserProfile.mustChangePassword).
export const DEFAULT_CA_PASSWORD = 'password123';

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
