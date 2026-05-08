import React from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SchoolProvider, useSchool } from "./context/SchoolContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { requireRole } from "./services/authProfile";
import { canAccessFeature, FeatureKey } from "./services/featureAccess";
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
import FeesPayments from "./pages/admin/FeesPayments";
import ActivityMonitor from "./pages/admin/ActivityMonitor";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import Attendance from "./pages/teacher/Attendance";
import TeacherAttendance from "./pages/teacher/TeacherAttendance";
import Assessment from "./pages/teacher/Assessment";
import WriteRemarks from "./pages/teacher/WriteRemarks";
import EditSkills from "./pages/teacher/EditSkills";
import StudentPerformance from "./pages/teacher/StudentPerformance";
import ParentDashboard from "./pages/parent/ParentDashboard";
import Schools from "./pages/super-admin/Schools";
import SchoolDetails from "./pages/super-admin/SchoolDetails";
import Dashboard from "./pages/super-admin/Dashboard";
import SuperAdminBackups from "./pages/super-admin/Backups";
import SuperAdminPayments from "./pages/super-admin/Payments";
import SuperAdminUsers from "./pages/super-admin/Users";
import SuperAdminAnalytics from "./pages/super-admin/Analytics";
import SuperAdminSystemHealth from "./pages/super-admin/SystemHealth";
import SuperAdminBroadcasts from "./pages/super-admin/Broadcasts";
import LoginHistory from "./pages/super-admin/security/LoginHistory";
import SuspiciousEvents from "./pages/super-admin/security/SuspiciousEvents";
import AuditLogs from "./pages/super-admin/security/AuditLogs";
import SecuritySettings from "./pages/super-admin/security/SecuritySettings";
import Layout from "./components/Layout";
import SplashScreen from "./components/SplashScreen";
import InstallPrompt from "./components/InstallPrompt";

// Public Marketing Pages
import MarketingHome from "./pages/public/MarketingHome";
import Pricing from "./pages/public/Pricing";
import BookDemo from "./pages/public/BookDemo";
import GetStarted from "./pages/public/GetStarted";
import VerifyEmail from "./pages/public/VerifyEmail";
import Features from "./pages/public/Features";
import EmailVerified from "./pages/public/EmailVerified";

const getEmailVerificationRedirect = () => {
  if (typeof window === "undefined") return "";

  const url = new URL(window.location.href);
  const mode = url.searchParams.get("mode") || "";
  const oobCode = url.searchParams.get("oobCode") || "";
  const authAction = url.searchParams.get("authAction") || "";

  if (!oobCode || (mode !== "verifyEmail" && authAction !== "emailVerified")) {
    return "";
  }

  const nextParams = new URLSearchParams();
  ["mode", "oobCode", "apiKey", "lang"].forEach((key) => {
    const value = url.searchParams.get(key);
    if (value) nextParams.set(key, value);
  });

  const email = url.searchParams.get("email") || (() => {
    const continueUrl = url.searchParams.get("continueUrl");
    if (!continueUrl) return "";
    try {
      const parsedContinueUrl = new URL(continueUrl);
      const hashQuery = parsedContinueUrl.hash.split("?")[1] || "";
      return (
        parsedContinueUrl.searchParams.get("email") ||
        new URLSearchParams(hashQuery).get("email") ||
        ""
      );
    } catch {
      return "";
    }
  })();

  if (email) nextParams.set("email", email);

  return `${url.origin}${url.pathname}#/email-verified?${nextParams.toString()}`;
};

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

  const location = useLocation();

  React.useEffect(() => {
    const redirectUrl = getEmailVerificationRedirect();
    if (
      redirectUrl &&
      !window.location.hash.startsWith("#/email-verified")
    ) {
      window.location.replace(redirectUrl);
    }
  }, []);

  // For HashRouter, extract the path from hash (e.g., "#/email-verified?email=test@example.com" -> "/email-verified")
  const getPathFromHash = (hash: string) => {
    if (!hash || !hash.startsWith("#")) return "/";
    const hashContent = hash.substring(1); // Remove "#"
    const pathPart = hashContent.split("?")[0]; // Remove query string
    return pathPart || "/";
  };
  
  const currentPath = location.pathname === "/" && location.hash
    ? getPathFromHash(location.hash)
    : location.pathname;
  const isPublicRoute = ["/", "/features", "/pricing", "/book-demo", "/get-started", "/verify-email", "/email-verified", "/login"].includes(currentPath);

  const isSchoolUser = user?.role === UserRole.SCHOOL_ADMIN || user?.role === UserRole.TEACHER || user?.role === UserRole.PARENT;
  const splashSchoolName = school?.name || cachedSchool?.name || "";
  const splashSchoolLogo = school?.logoUrl || cachedSchool?.logoUrl || "";

  // Show splash screen while auth is initializing
  if (authLoading && !isPublicRoute) {
    const hasBranding = Boolean(splashSchoolName || splashSchoolLogo);
    // For school users, always hide default "School Manager GH" branding
    const hideDefault = isSchoolUser || hasBranding;
    return (
      <SplashScreen
        hideDefaultBranding={hideDefault}
        schoolName={splashSchoolName}
        schoolLogoUrl={splashSchoolLogo}
      />
    );
  }

  if (
    !isPublicRoute &&
    user &&
    (isSchoolUser || cachedSchool) &&
    (schoolLoading || (!school && !schoolError))
  ) {
    const hasBranding = Boolean(splashSchoolName || splashSchoolLogo);
    const hideDefault = isSchoolUser || hasBranding;
    return (
      <SplashScreen
        hideDefaultBranding={hideDefault}
        schoolName={splashSchoolName}
        schoolLogoUrl={splashSchoolLogo}
      />
    );
  }

  // Show account not provisioned error
  if (
    !isPublicRoute &&
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

  // Show school access error (only for non-super-admin and non-parent users)
  if (!isPublicRoute && schoolError && user?.role !== UserRole.SUPER_ADMIN && user?.role !== UserRole.PARENT) {
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
  requiredFeature,
}: {
  children: React.ReactElement;
  allowedRoles?: UserRole[];
  requiredFeature?: FeatureKey;
}) => {
  const { user, isAuthenticated, authLoading } = useAuth();
  const { school } = useSchool();

  // Show splash screen while auth is being determined
  if (authLoading) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // TEMP DEV BYPASS: Commented out email verification check to allow rapid testing without checking emails
  /*
  if (user && !user.emailVerified && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.PARENT) {
    return <Navigate to="/verify-email" replace />;
  }
  */

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Redirect based on actual role if they try to access unauthorized pages
    const redirectPath =
      user.role === UserRole.SUPER_ADMIN
        ? "/super-admin/schools"
        : user.role === UserRole.SCHOOL_ADMIN
          ? "/admin/students" // Use a specific admin route instead of root
          : user.role === UserRole.PARENT
            ? "/parent"
            : "/teacher";
    return <Navigate to={redirectPath} replace />;
  }

  if (requiredFeature && !canAccessFeature(user, school, requiredFeature)) {
    const fallbackPath =
      user?.role === UserRole.TEACHER ? "/teacher" : user?.role === UserRole.PARENT ? "/parent" : "/admin/students";
    return <Navigate to={fallbackPath} replace />;
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
  if (user?.role === UserRole.PARENT) return <ParentDashboard />;
  return <Navigate to="/login" />;
};

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Public Marketing Pages */}
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/book-demo" element={<BookDemo />} />
      <Route path="/get-started" element={<GetStarted />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/features" element={<Features />} />
      <Route path="/email-verified" element={<EmailVerified />} />

      {/* Root redirects based on role */}
      <Route
        path="/"
        element={isAuthenticated ? <ProtectedRoute><RoleBasedHome /></ProtectedRoute> : <MarketingHome />}
      />

      {/* Admin Routes */}
      <Route
        path="/admin/students"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="student_management"
          >
            <ManageStudents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/student-history"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="student_history"
          >
            <StudentHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/teachers"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="teacher_management"
          >
            <ManageTeachers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/attendance"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="attendance"
          >
            <AttendanceStats />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/teacher-attendance"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="teacher_attendance"
          >
            <TeacherAttendanceStats />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="basic_exam_reports"
          >
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/report-card"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="basic_exam_reports"
          >
            <ReportCard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/timetable"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="timetable"
          >
            <Timetable />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="academic_year"
          >
            <SystemSettings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/backups"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="backups"
          >
            <ManageBackups />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/billing"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="billing"
          >
            <Billing />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/fees"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="fees_payments"
          >
            <FeesPayments />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/activity"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="activity_monitor"
          >
            <ActivityMonitor />
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
        path="/super-admin/system-health"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <SuperAdminSystemHealth />
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
          <ProtectedRoute
            allowedRoles={[UserRole.TEACHER]}
            requiredFeature="teacher_dashboard"
          >
            <TeacherDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/attendance"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.TEACHER]}
            requiredFeature="attendance"
          >
            <Attendance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/assessment"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.TEACHER]}
            requiredFeature="basic_exam_reports"
          >
            <Assessment />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/my-attendance"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.TEACHER]}
            requiredFeature="teacher_attendance"
          >
            <TeacherAttendance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/write-remarks"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.TEACHER]}
            requiredFeature="basic_exam_reports"
          >
            <WriteRemarks />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/edit-skills"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.TEACHER]}
            requiredFeature="basic_exam_reports"
          >
            <EditSkills />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/student-performance"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.TEACHER]}
            requiredFeature="basic_exam_reports"
          >
            <StudentPerformance />
          </ProtectedRoute>
        }
      />

      {/* Parent Routes */}
      <Route
        path="/parent"
        element={
          <ProtectedRoute allowedRoles={[UserRole.PARENT]}>
            <ParentDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default App;
