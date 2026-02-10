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
