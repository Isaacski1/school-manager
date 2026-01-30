import React from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SchoolProvider, useSchool } from "./context/SchoolContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { requireRole } from "./services/authProfile";
import { UserRole } from "./types";

// Pages
import Login from "./pages/Login";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ManageStudents from "./pages/admin/ManageStudents";
import ManageTeachers from "./pages/admin/ManageTeachers";
import AttendanceStats from "./pages/admin/AttendanceStats";
import TeacherAttendanceStats from "./pages/admin/TeacherAttendanceStats";
import Reports from "./pages/admin/Reports";
import ReportCard from "./pages/admin/ReportCard";
import SystemSettings from "./pages/admin/SystemSettings";
import ManageBackups from "./pages/admin/ManageBackups";
import Timetable from "./pages/admin/Timetable";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import Attendance from "./pages/teacher/Attendance";
import TeacherAttendance from "./pages/teacher/TeacherAttendance";
import Assessment from "./pages/teacher/Assessment";
import WriteRemarks from "./pages/teacher/WriteRemarks";
import EditSkills from "./pages/teacher/EditSkills";
import Schools from "./pages/super-admin/Schools";
import SchoolDetails from "./pages/super-admin/SchoolDetails";
import Dashboard from "./pages/super-admin/Dashboard";
import Layout from "./components/Layout";

const AppContent = () => {
  const { user, loading, authLoading, error, logout } = useAuth();
  const { school, schoolLoading, schoolError } = useSchool();

  // Show loading spinner while auth is initializing
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B4A82] mb-4"></div>
          <p className="text-slate-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  // Show account not provisioned error
  if (
    error ===
    "Your account is not set up yet. Please contact your administrator for access."
  ) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-100 p-8 text-center">
          <div className="w-16 h-16 bg-[#E6F0FA] rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-[#0B4A82]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-4">
            Account Not Set Up
          </h1>
          <p className="text-slate-600 mb-6">
            Your account is not set up yet. Please contact your administrator
            for access to the system.
          </p>
          <button
            onClick={logout}
            className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Show school access error (only for non-super-admin users)
  if (schoolError && user?.role !== UserRole.SUPER_ADMIN) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-100 p-8 text-center">
          <div className="w-16 h-16 bg-[#E6F0FA] rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-[#0B4A82]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-4">
            School Access Issue
          </h1>
          <p className="text-slate-600 mb-6">{schoolError}</p>
          <button
            onClick={logout}
            className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <SchoolProvider>
        <Router>
          <AppContent />
        </Router>
      </SchoolProvider>
    </AuthProvider>
  );
};

const ProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactElement;
  allowedRoles?: UserRole[];
}) => {
  const { user, isAuthenticated, authLoading } = useAuth();

  // Show loading while auth is being determined
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B4A82] mb-4"></div>
          <p className="text-slate-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Redirect based on actual role if they try to access unauthorized pages
    const redirectPath =
      user.role === UserRole.SUPER_ADMIN
        ? "/super-admin/schools"
        : user.role === UserRole.SCHOOL_ADMIN
          ? "/admin/students" // Use a specific admin route instead of root
          : "/teacher";
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

const RoleBasedHome = () => {
  const { user } = useAuth();
  if (user?.role === UserRole.SUPER_ADMIN)
    return (
      <Layout title="Super Admin Dashboard">
        <Dashboard />
      </Layout>
    );
  if (user?.role === UserRole.SCHOOL_ADMIN) return <AdminDashboard />;
  if (user?.role === UserRole.TEACHER) return <TeacherDashboard />;
  return <Navigate to="/login" />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Root redirects based on role */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RoleBasedHome />
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin/students"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <ManageStudents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/teachers"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <ManageTeachers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/attendance"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <AttendanceStats />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/teacher-attendance"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <TeacherAttendanceStats />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/report-card"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <ReportCard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/timetable"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <Timetable />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <SystemSettings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/backups"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <ManageBackups />
          </ProtectedRoute>
        }
      />

      {/* Super Admin Routes */}
      <Route
        path="/super-admin/schools"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <Schools />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin/dashboard"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <Layout title="Super Admin Dashboard">
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin/schools/:schoolId"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <SchoolDetails />
          </ProtectedRoute>
        }
      />

      {/* Teacher Routes */}
      <Route
        path="/teacher"
        element={
          <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
            <TeacherDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/attendance"
        element={
          <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
            <Attendance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/assessment"
        element={
          <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
            <Assessment />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/my-attendance"
        element={
          <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
            <TeacherAttendance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/write-remarks"
        element={
          <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
            <WriteRemarks />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/edit-skills"
        element={
          <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
            <EditSkills />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default App;
