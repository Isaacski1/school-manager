import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserRole } from './types';

// Pages
import Login from './pages/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import ManageStudents from './pages/admin/ManageStudents';
import ManageTeachers from './pages/admin/ManageTeachers';
import AttendanceStats from './pages/admin/AttendanceStats';
import TeacherAttendanceStats from './pages/admin/TeacherAttendanceStats';
import Reports from './pages/admin/Reports';
import ReportCard from './pages/admin/ReportCard';
import SystemSettings from './pages/admin/SystemSettings';
import ManageBackups from './pages/admin/ManageBackups';
import Timetable from './pages/admin/Timetable';
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import Attendance from './pages/teacher/Attendance';
import TeacherAttendance from './pages/teacher/TeacherAttendance';
import AssessmentPage from './pages/teacher/Assessment';
import WriteRemarks from './pages/teacher/WriteRemarks';
import EditSkills from './pages/teacher/EditSkills';

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactElement, allowedRoles?: UserRole[] }) => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Redirect based on actual role if they try to access unauthorized pages
    return <Navigate to={user.role === UserRole.ADMIN ? "/" : "/teacher"} replace />;
  }

  return children;
};

const RoleBasedHome = () => {
  const { user } = useAuth();
  if (user?.role === UserRole.ADMIN) return <AdminDashboard />;
  if (user?.role === UserRole.TEACHER) return <TeacherDashboard />;
  return <Navigate to="/login" />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Root redirects based on role */}
      <Route path="/" element={
        <ProtectedRoute>
          <RoleBasedHome />
        </ProtectedRoute>
      } />

      {/* Admin Routes */}
      <Route path="/admin/students" element={
        <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
          <ManageStudents />
        </ProtectedRoute>
      } />
      <Route path="/admin/teachers" element={
        <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
           <ManageTeachers />
        </ProtectedRoute>
      } />
      <Route path="/admin/attendance" element={
        <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
           <AttendanceStats />
        </ProtectedRoute>
      } />
      <Route path="/admin/teacher-attendance" element={
        <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
           <TeacherAttendanceStats />
        </ProtectedRoute>
      } />
       <Route path="/admin/reports" element={
        <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
           <Reports />
        </ProtectedRoute>
      } />
      <Route path="/admin/report-card" element={
        <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
            <ReportCard />
        </ProtectedRoute>
      } />
       <Route path="/admin/timetable" element={
        <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
           <Timetable />
        </ProtectedRoute>
      } />

      <Route path="/admin/settings" element={
        <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
           <SystemSettings />
        </ProtectedRoute>
      } />

      <Route path="/admin/backups" element={
        <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
           <ManageBackups />
        </ProtectedRoute>
      } />

      {/* Teacher Routes */}
      <Route path="/teacher" element={
        <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
          <TeacherDashboard />
        </ProtectedRoute>
      } />
      <Route path="/teacher/attendance" element={
        <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
          <Attendance />
        </ProtectedRoute>
      } />
      <Route path="/teacher/assessment" element={
        <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
          <AssessmentPage />
        </ProtectedRoute>
      } />
      <Route path="/teacher/my-attendance" element={
        <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
          <TeacherAttendance />
        </ProtectedRoute>
      } />
      <Route path="/teacher/write-remarks" element={
        <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
          <WriteRemarks />
        </ProtectedRoute>
      } />
      <Route path="/teacher/edit-skills" element={
        <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
          <EditSkills />
        </ProtectedRoute>
      } />
    </Routes>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
};

export default App;
