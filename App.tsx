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
import StudentHistory from "./pages/admin/StudentHistory";
import AttendanceStats from "./pages/admin/AttendanceStats";
import TeacherAttendanceStats from "./pages/admin/TeacherAttendanceStats";
import Reports from "./pages/admin/Reports";
import ReportCard from "./pages/admin/ReportCard";
import SystemSettings from "./pages/admin/SystemSettings";
import ManageBackups from "./pages/admin/ManageBackups";
import Timetable from "./pages/admin/Timetable";
import Billing from "./pages/admin/Billing";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import Attendance from "./pages/teacher/Attendance";
import TeacherAttendance from "./pages/teacher/TeacherAttendance";
import Assessment from "./pages/teacher/Assessment";
import WriteRemarks from "./pages/teacher/WriteRemarks";
import EditSkills from "./pages/teacher/EditSkills";
import Schools from "./pages/super-admin/Schools";
import SchoolDetails from "./pages/super-admin/SchoolDetails";
import Dashboard from "./pages/super-admin/Dashboard";
import SuperAdminBackups from "./pages/super-admin/Backups";
import SuperAdminPayments from "./pages/super-admin/Payments";
import SuperAdminUsers from "./pages/super-admin/Users";
import SuperAdminAnalytics from "./pages/super-admin/Analytics";
import SuperAdminBroadcasts from "./pages/super-admin/Broadcasts";
import LoginHistory from "./pages/super-admin/security/LoginHistory";
import SuspiciousEvents from "./pages/super-admin/security/SuspiciousEvents";
import AuditLogs from "./pages/super-admin/security/AuditLogs";
import SecuritySettings from "./pages/super-admin/security/SecuritySettings";
import Layout from "./components/Layout";
import SplashScreen from "./components/SplashScreen";
import InstallPrompt from "./components/InstallPrompt";

const AppContent = () => {
  const { user, loading, authLoading, error, logout } = useAuth();
  const { school, schoolLoading, schoolError } = useSchool();

  const [brandingVersion, setBrandingVersion] = React.useState(0);

  React.useEffect(() => {
    const handleBrandingUpdate = () => setBrandingVersion((prev) => prev + 1);
    window.addEventListener("school-branding-updated", handleBrandingUpdate);
    return () =>
      window.removeEventListener(
        "school-branding-updated",
        handleBrandingUpdate,
      );
  }, []);

  const cachedSchool = React.useMemo(() => {
    const resolvedSchoolId =
      localStorage.getItem("activeSchoolId") ||
      user?.schoolId ||
      localStorage.getItem("lastSchoolId") ||
      "";
    if (!resolvedSchoolId) return null;
    const cacheKey = `school_${resolvedSchoolId}`;
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    try {
      return JSON.parse(cached) as { name?: string; logoUrl?: string };
    } catch {
      localStorage.removeItem(cacheKey);
      return null;
    }
  }, [user?.schoolId, brandingVersion]);

  const getSchoolErrorDetails = (message: string) => {
    const lower = message.toLowerCase();
    if (lower.includes("inactive")) {
      return {
        title: "School Inactive",
        description:
          "Your school has been deactivated. Please contact your administrator for support.",
      };
    }
    if (lower.includes("not found")) {
      return {
        title: "School Not Found",
        description:
          "Your school profile could not be found. Please contact your administrator.",
      };
    }
    if (lower.includes("no school")) {
      return {
        title: "No School Assigned",
        description:
          "Your account does not have a school assigned. Please contact your administrator.",
      };
    }
    return {
      title: "School Access Issue",
      description: message,
    };
  };

  // Show splash screen while auth is initializing
  if (authLoading) {
    const hasSchoolBranding = Boolean(
      localStorage.getItem("activeSchoolId") &&
      (cachedSchool?.name || cachedSchool?.logoUrl),
    );
    return (
      <SplashScreen
        hideDefaultBranding={Boolean(
          localStorage.getItem("activeSchoolId") || cachedSchool,
        )}
        schoolName={hasSchoolBranding ? cachedSchool?.name || "" : ""}
        schoolLogoUrl={hasSchoolBranding ? cachedSchool?.logoUrl || "" : ""}
      />
    );
  }

  const isSchoolUser =
    user?.role === UserRole.SCHOOL_ADMIN || user?.role === UserRole.TEACHER;
  const splashSchoolName = school?.name || cachedSchool?.name || "";
  const splashSchoolLogo = school?.logoUrl || cachedSchool?.logoUrl || "";

  if (
    user &&
    (isSchoolUser || cachedSchool) &&
    (schoolLoading || (!school && !schoolError))
  ) {
    return (
      <SplashScreen
        hideDefaultBranding
        schoolName={splashSchoolName}
        schoolLogoUrl={splashSchoolLogo}
      />
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
    const details = getSchoolErrorDetails(schoolError);
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
            {details.title}
          </h1>
          <p className="text-slate-600 mb-6">{details.description}</p>
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
      <InstallPrompt />
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

  // Show splash screen while auth is being determined
  if (authLoading) {
    return <SplashScreen />;
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
        path="/admin/student-history"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <StudentHistory />
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

      <Route
        path="/admin/billing"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <Billing />
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
      <Route
        path="/super-admin/backups"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <SuperAdminBackups />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin/payments"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <Layout title="Payments">
              <SuperAdminPayments />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin/users"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <SuperAdminUsers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin/analytics"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <SuperAdminAnalytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin/broadcasts"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <SuperAdminBroadcasts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin/security/login-history"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <LoginHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin/security/suspicious"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <SuspiciousEvents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin/security/audit-logs"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <AuditLogs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin/security/settings"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <SecuritySettings />
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
