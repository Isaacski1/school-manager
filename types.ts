export enum UserRole {
  SUPER_ADMIN = "super_admin",
  SCHOOL_ADMIN = "school_admin",
  TEACHER = "teacher",
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  schoolId: string | null;
  assignedClassIds?: string[];
  status: "active" | "inactive";
  createdAt?: Date;
  lastLogin?: Date | number | string | null;
  lastLoginAt?: number | null;
  isActive?: boolean;
  disabledAt?: Date | number | null;
  disabledBy?: string | null;
  disabledReason?: string | null;
  tokenVersion?: number;
  tokensRevokedAt?: Date | number | null;
  forcedLogoutAt?: Date | number | null;
  forcedLogoutBy?: string | null;
  roleUpdatedAt?: Date | number | null;
  roleUpdatedBy?: string | null;
}

export interface School {
  id: string;
  name: string;
  code: string;
  logoUrl: string;
  phone: string;
  address: string;
  status: "active" | "inactive";
  plan: "free" | "trial" | "monthly" | "termly" | "yearly";
  planEndsAt: Date | null;
  createdAt: Date;
  createdBy: string;
  notes?: string;
  subscription?: {
    planId?: string;
  };
  limits?: {
    maxStudents?: number;
  };
  studentsCount?: number;
}

export interface PlanConfig {
  id: string;
  name: string;
  maxStudents: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BroadcastType = "GENERAL" | "SYSTEM_UPDATE" | "MAINTENANCE";
export type BroadcastPriority = "NORMAL" | "IMPORTANT" | "CRITICAL";
export type BroadcastTargetType = "ALL" | "SCHOOLS";
export type BroadcastStatus = "DRAFT" | "PUBLISHED" | "SCHEDULED";

export interface PlatformBroadcast {
  id: string;
  title: string;
  message: string;
  type: BroadcastType;
  priority: BroadcastPriority;
  targetType: BroadcastTargetType;
  targetSchoolIds?: string[];
  createdAt: Date | number;
  createdBy: string;
  publishAt?: Date | number | null;
  expiresAt?: Date | number | null;
  status: BroadcastStatus;
  version?: string;
  whatsNew?: string[];
  effectiveDate?: string | Date | number | null;
  maintenanceStart?: string | Date | number | null;
  maintenanceEnd?: string | Date | number | null;
  maintenanceDowntime?: boolean;
}

export type LoginStatus = "SUCCESS" | "FAILED";
export type SuspiciousSeverity = "LOW" | "MEDIUM" | "HIGH";
export type SuspiciousStatus = "OPEN" | "RESOLVED";

export interface SecurityLoginLog {
  id: string;
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  role?: UserRole | string | null;
  schoolId?: string | null;
  schoolName?: string | null;
  timestamp: number;
  userAgent?: string | null;
  ipAddress?: string | null;
  status: LoginStatus;
  errorCode?: string | null;
}

export interface SuspiciousEvent {
  id: string;
  eventType: string;
  severity: SuspiciousSeverity;
  userId?: string | null;
  schoolId?: string | null;
  relatedLogIds?: string[];
  createdAt: number;
  status: SuspiciousStatus;
  resolvedBy?: string | null;
  resolvedAt?: number | null;
  resolutionNote?: string | null;
  metadata?: Record<string, any>;
}

export interface AuditLog {
  id: string;
  actionType: string;
  actorId: string;
  actorRole: UserRole | string;
  targetType: "SCHOOL" | "USER" | "SUBSCRIPTION" | "SETTINGS" | "BROADCAST";
  targetId?: string | null;
  schoolId?: string | null;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface PlatformSecuritySettings {
  enabledForSuperAdmins: boolean;
  updatedAt: number;
  updatedBy: string;
}

export interface SchoolConfig {
  schoolId: string;
  schoolName: string;
  academicYear: string;
  currentTerm: string;
  headTeacherRemark: string;
  termEndDate: string;
  schoolReopenDate: string;
  vacationDate: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  nextTermBegins: string;
  termTransitionProcessed: boolean;
  holidayDates?: { date: string; reason?: string }[];
  gradingScale?: {
    A: number;
    B: number;
    C: number;
    D: number;
  };
  positionRule?: "total" | "average" | "subject";
}

export interface Backup {
  id: string;
  schoolId: string;
  schoolName?: string;
  timestamp: number; // Unix timestamp
  term: string;
  academicYear: string;
  backupType?: "term-reset" | "manual";
  dedupeKey?: string;
  data?: {
    // Make data optional
    schoolConfig?: SchoolConfig;
    schoolSettings?: SchoolConfig;
    students: Student[];
    attendanceRecords: AttendanceRecord[];
    teacherAttendanceRecords: TeacherAttendanceRecord[];
    assessments: Assessment[];
    studentRemarks: StudentRemark[];
    adminRemarks?: AdminRemark[];
    studentSkills: StudentSkills[];
    timetables: ClassTimetable[];
    users: User[];
    classSubjects: ClassSubjectConfig[];
    notices?: Notice[];
    adminNotifications?: SystemNotification[];
    activityLogs?: any[];
    payments?: any[];
  };
  dataCollectionRef?: string; // New field to store reference to subcollection
}

export interface ClassSubjectConfig {
  schoolId: string;
  classId: string;
  subjects: string[];
}

export interface ClassRoom {
  id: string;
  schoolId: string;
  name: string; // e.g., "Primary 4", "JHS 1"
  level: "NURSERY" | "KG" | "PRIMARY" | "JHS";
}

export interface Student {
  id: string;
  schoolId: string;
  name: string;
  gender: "Male" | "Female";
  dob: string;
  classId: string;
  guardianName: string;
  guardianPhone: string;
}

export interface AttendanceRecord {
  id: string;
  schoolId: string;
  date: string; // YYYY-MM-DD
  classId: string;
  presentStudentIds: string[];
  isHoliday?: boolean;
  holidayReason?: string;
}

export interface TeacherAttendanceRecord {
  id: string;
  schoolId: string;
  date: string; // YYYY-MM-DD
  teacherId: string;
  status: "present" | "absent";
  approvalStatus?: "pending" | "approved" | "rejected";
  approvedBy?: string;
  approvedAt?: number;
  rejectedBy?: string;
  rejectedAt?: number;
  isHoliday?: boolean;
  holidayReason?: string;
}

export interface Assessment {
  id: string;
  schoolId: string;
  studentId: string;
  classId: string;
  term: 1 | 2 | 3;
  academicYear: string;
  subject: string;
  testScore: number; // Out of e.g., 20
  homeworkScore: number;
  projectScore: number;
  examScore: number; // Out of e.g., 70
  total?: number;
}

export interface ComputedGrade {
  total: number;
  grade: string; // A, B, C, D, F
  remark: string; // Excellent, Very Good, etc.
}

export interface StudentRemark {
  id: string;
  schoolId: string;
  studentId: string;
  classId: string;
  term: 1 | 2 | 3;
  academicYear: string;
  remark: string;
  behaviorTag: "Excellent" | "Good" | "Needs Improvement" | "";
  teacherId: string;
  dateCreated: string; // YYYY-MM-DD
}

export interface AdminRemark {
  id: string;
  schoolId: string;
  studentId: string;
  classId: string;
  term: 1 | 2 | 3;
  academicYear: string;
  remark: string;
  adminId: string;
  dateCreated: string; // YYYY-MM-DD
}

export interface StudentSkills {
  id: string;
  schoolId: string;
  studentId: string;
  classId: string;
  term: 1 | 2 | 3;
  academicYear: string;
  punctuality: "Excellent" | "Very Good" | "Good" | "Fair" | "Poor";
  neatness: "Excellent" | "Very Good" | "Good" | "Fair" | "Poor";
  conduct: "Excellent" | "Very Good" | "Good" | "Fair" | "Poor";
  attitudeToWork: "Excellent" | "Very Good" | "Good" | "Fair" | "Poor";
  classParticipation: "Excellent" | "Very Good" | "Good" | "Fair" | "Poor";
  homeworkCompletion: "Excellent" | "Very Good" | "Good" | "Fair" | "Poor";
}

export interface Notice {
  id: string;
  schoolId: string;
  message: string;
  date: string;
  type: "info" | "urgent";
  createdAt?: number;
}

export interface SystemNotification {
  id: string;
  schoolId: string;
  message: string;
  createdAt: number; // Timestamp
  isRead: boolean;
  type: "attendance" | "assessment" | "system";
}

export interface TimeSlot {
  id: string;
  startTime: string; // e.g. "08:00"
  endTime: string; // e.g. "09:00"
  subject: string; // e.g. "Mathematics" or "Break"
  type:
    | "lesson"
    | "break"
    | "worship"
    | "closing"
    | "assembly"
    | "arrival"
    | "lunch"
    | "snack"
    | "cleaning"
    | "games"
    | "nap"
    | "clubs";
}

export interface ClassTimetable {
  schoolId: string;
  classId: string;
  schedule: Record<string, TimeSlot[]>; // Key is Day name (Monday, Tuesday...)
  updatedAt?: number;
}

export interface MonthlyTeacherAttendance {
  teacherId: string;
  teacherName: string;
  month: string; // YYYY-MM format
  year: number;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  attendanceRate: number;
  trend: "improving" | "declining" | "stable";
}

export interface TeacherAttendanceAnalytics {
  teacherId: string;
  teacherName: string;
  overallAttendance: number;
  monthlyBreakdown: MonthlyTeacherAttendance[];
  termStartDate: string;
  vacationDate?: string;
}
