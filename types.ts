
export enum UserRole {
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  assignedClassIds?: string[]; // Changed from single ID to array of IDs
}

export interface ClassRoom {
  id: string;
  name: string; // e.g., "Primary 4", "JHS 1"
  level: 'NURSERY' | 'KG' | 'PRIMARY' | 'JHS';
}

export interface Student {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  dob: string;
  classId: string;
  guardianName: string;
  guardianPhone: string;
}

export interface AttendanceRecord {
  id: string;
  date: string; // YYYY-MM-DD
  classId: string;
  presentStudentIds: string[];
}

export interface TeacherAttendanceRecord {
  id: string;
  date: string; // YYYY-MM-DD
  teacherId: string;
  status: 'present' | 'absent';
}

export interface Assessment {
  id: string;
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

export interface Notice {
  id: string;
  message: string;
  date: string;
  type: 'info' | 'urgent';
}

export interface SystemNotification {
  id: string;
  message: string;
  createdAt: number; // Timestamp
  isRead: boolean;
  type: 'attendance' | 'assessment' | 'system';
}

export interface TimeSlot {
  id: string;
  startTime: string; // e.g. "08:00"
  endTime: string;   // e.g. "09:00"
  subject: string;   // e.g. "Mathematics" or "Break"
  type: 'lesson' | 'break' | 'worship' | 'closing';
}

export interface ClassTimetable {
  classId: string;
  schedule: Record<string, TimeSlot[]>; // Key is Day name (Monday, Tuesday...)
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
  trend: 'improving' | 'declining' | 'stable';
}

export interface TeacherAttendanceAnalytics {
  teacherId: string;
  teacherName: string;
  overallAttendance: number;
  monthlyBreakdown: MonthlyTeacherAttendance[];
  termStartDate: string;
  vacationDate?: string;
}
