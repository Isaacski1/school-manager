import React, { lazy, Suspense } from "react";
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
const Login = lazy(() => import("./pages/Login"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const ManageStudents = lazy(() => import("./pages/admin/ManageStudents"));
const ManageTeachers = lazy(() => import("./pages/admin/ManageTeachers"));
const StudentHistory = lazy(() => import("./pages/admin/StudentHistory"));
const AttendanceStats = lazy(() => import("./pages/admin/AttendanceStats"));
const TeacherAttendanceStats = lazy(() => import("./pages/admin/TeacherAttendanceStats"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const ReportCard = lazy(() => import("./pages/admin/ReportCard"));
const SystemSettings = lazy(() => import("./pages/admin/SystemSettings"));
const ManageBackups = lazy(() => import("./pages/admin/ManageBackups"));
const Timetable = lazy(() => import("./pages/admin/Timetable"));
const Billing = lazy(() => import("./pages/admin/Billing"));
const FeesPayments = lazy(() => import("./pages/admin/FeesPayments"));
const StaffPayroll = lazy(() => import("./pages/admin/StaffPayroll"));
const ActivityMonitor = lazy(() => import("./pages/admin/ActivityMonitor"));
const TeacherDashboard = lazy(() => import("./pages/teacher/TeacherDashboard"));
const Attendance = lazy(() => import("./pages/teacher/Attendance"));
const TeacherAttendance = lazy(() => import("./pages/teacher/TeacherAttendance"));
const Assessment = lazy(() => import("./pages/teacher/Assessment"));
const WriteRemarks = lazy(() => import("./pages/teacher/WriteRemarks"));
const EditSkills = lazy(() => import("./pages/teacher/EditSkills"));
const StudentPerformance = lazy(() => import("./pages/teacher/StudentPerformance"));
const ParentDashboard = lazy(() => import("./pages/parent/ParentDashboard"));
const Schools = lazy(() => import("./pages/super-admin/Schools"));
const SchoolDetails = lazy(() => import("./pages/super-admin/SchoolDetails"));
const Dashboard = lazy(() => import("./pages/super-admin/Dashboard"));
const SmsManager = lazy(() => import("./pages/super-admin/SmsManager"));
const SuperAdminBackups = lazy(() => import("./pages/super-admin/Backups"));
const SuperAdminPayments = lazy(() => import("./pages/super-admin/Payments"));
const SuperAdminUsers = lazy(() => import("./pages/super-admin/Users"));
const SuperAdminAnalytics = lazy(() => import("./pages/super-admin/Analytics"));
const SuperAdminSystemHealth = lazy(() => import("./pages/super-admin/SystemHealth"));
const SuperAdminBroadcasts = lazy(() => import("./pages/super-admin/Broadcasts"));
const SuperAdminWhatsAppPairing = lazy(() => import("./pages/super-admin/WhatsAppPairing"));
const LoginHistory = lazy(() => import("./pages/super-admin/security/LoginHistory"));
const SuspiciousEvents = lazy(() => import("./pages/super-admin/security/SuspiciousEvents"));
const AuditLogs = lazy(() => import("./pages/super-admin/security/AuditLogs"));
const SecuritySettings = lazy(() => import("./pages/super-admin/security/SecuritySettings"));
const MfaSetup = lazy(() => import("./pages/account/MfaSetup"));

import Layout from "./components/Layout";
import SplashScreen from "./components/SplashScreen";
import InstallPrompt from "./components/InstallPrompt";
import WhatsAppBroadcastProgress from "./components/WhatsAppBroadcastProgress";
import PlatformAnnouncementPopup from "./components/PlatformAnnouncementPopup";

// Public Marketing Pages
const MarketingHome = lazy(() => import("./pages/public/MarketingHome"));
const Pricing = lazy(() => import("./pages/public/Pricing"));
const BookDemo = lazy(() => import("./pages/public/BookDemo"));
const DemoVideos = lazy(() => import("./pages/public/DemoVideos"));
const GetStarted = lazy(() => import("./pages/public/GetStarted"));
const VerifyEmail = lazy(() => import("./pages/public/VerifyEmail"));
const Features = lazy(() => import("./pages/public/Features"));
const Blog = lazy(() => import("./pages/public/Blog"));
const EmailVerified = lazy(() => import("./pages/public/EmailVerified"));
const WhatsAppBroadcast = lazy(() => import("./pages/admin/WhatsAppBroadcast"));
const PaymentSettingsPage = lazy(() => import("./pages/admin/PaymentSettingsPage"));
const Reminders = lazy(() => import("./pages/admin/Reminders"));
const OfflineAccess = lazy(() => import("./pages/OfflineAccess"));

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

  return `${url.origin}${url.pathname}#/login?${nextParams.toString()}`;
};

const AppContent = () => {
  const { user, loading, authLoading, error, logout } = useAuth();
  const { school, schoolLoading, schoolError, classCatalogReady } = useSchool();

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
    try {
      // 1. Check persistent branding cache first (survives logout)
      const persistentCache = localStorage.getItem(`persistent_school_branding_${resolvedSchoolId}`);
      if (persistentCache) {
        return JSON.parse(persistentCache) as { name?: string; logoUrl?: string };
      }

      // 2. Check main school cache (cleared on logout)
      const cacheKey = `school_${resolvedSchoolId}`;
      const cached = localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      if (!cached) return null;
      
      return JSON.parse(cached) as { name?: string; logoUrl?: string };
    } catch {
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
  const isPublicRoute = ["/", "/features", "/pricing", "/book-demo", "/demos", "/get-started", "/verify-email", "/email-verified", "/login"].includes(currentPath);

  const isSchoolUser = user?.role === UserRole.SCHOOL_ADMIN || user?.role === UserRole.TEACHER || user?.role === UserRole.PARENT;
  
  const isDefinitiveSchoolRoute = currentPath.startsWith("/admin") || currentPath.startsWith("/teacher") || currentPath.startsWith("/parent");
  const isSuperAdminRoute = currentPath.startsWith("/super-admin");

  const shouldShowSchoolBranding = () => {
    if (user?.role === UserRole.SUPER_ADMIN || isSuperAdminRoute) return false;
    if (isSchoolUser || isDefinitiveSchoolRoute) return true;
    return false;
  };

  const showSchoolBranding = shouldShowSchoolBranding();
  const splashSchoolName = showSchoolBranding ? (school?.name || cachedSchool?.name || "") : "";
  const splashSchoolLogo = showSchoolBranding ? (school?.logoUrl || cachedSchool?.logoUrl || "") : "";
  const hideDefault = showSchoolBranding;
  
  const lastSchoolId = localStorage.getItem("lastSchoolId") || localStorage.getItem("activeSchoolId");
  const hasSchoolContext = Boolean(lastSchoolId);

  const splashMessage = showSchoolBranding ? "Preparing Your Dashboard." : "Loading";

  // Show splash screen while auth is initializing
  if (authLoading) {
    return (
      <SplashScreen
        hideDefaultBranding={hideDefault}
        schoolName={splashSchoolName}
        schoolLogoUrl={splashSchoolLogo}
        message={splashMessage}
      />
    );
  }

  if (
    !isPublicRoute &&
    user &&
    (isSchoolUser || cachedSchool || hasSchoolContext) &&
    (!classCatalogReady ||
      (schoolLoading && !school && !cachedSchool) ||
      (!school && !cachedSchool && !schoolError)) &&
    !(user.role === UserRole.PARENT && !hasSchoolContext)
  ) {
    return (
      <SplashScreen
        hideDefaultBranding={hideDefault}
        schoolName={splashSchoolName}
        schoolLogoUrl={splashSchoolLogo}
        message="Preparing Your Dashboard."
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
      {user?.role === UserRole.SCHOOL_ADMIN && <WhatsAppBroadcastProgress />}
      <PlatformAnnouncementPopup />
      <Suspense fallback={
        <SplashScreen 
          message={splashMessage} 
          schoolName={splashSchoolName}
          schoolLogoUrl={splashSchoolLogo}
          hideDefaultBranding={hideDefault}
        />
      }>
        <AppRoutes 
          splashSchoolName={splashSchoolName} 
          splashSchoolLogo={splashSchoolLogo}
          hideDefault={hideDefault}
        />
      </Suspense>
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
    const resolvedSchoolId =
      localStorage.getItem("activeSchoolId") ||
      user?.schoolId ||
      localStorage.getItem("lastSchoolId") ||
      "";
    
    let splashName = school?.name || "";
    let splashLogo = school?.logoUrl || "";

    if (!splashName && resolvedSchoolId) {
      const persistentCache = localStorage.getItem(`persistent_school_branding_${resolvedSchoolId}`);
      const cacheKey = `school_${resolvedSchoolId}`;
      const cached = persistentCache || localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          splashName = parsed.name || "";
          splashLogo = parsed.logoUrl || "";
        } catch (e) {}
      }
    }

    const showBranding = user?.role !== UserRole.SUPER_ADMIN && Boolean(splashName || splashLogo);

    return (
      <SplashScreen 
        schoolName={showBranding ? splashName : ""} 
        schoolLogoUrl={showBranding ? splashLogo : ""} 
        hideDefaultBranding={showBranding}
        message={showBranding ? "Preparing Your Dashboard." : "Loading"}
      />
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user && !user.emailVerified && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.PARENT) {
    return <Navigate to="/verify-email" replace state={{ email: user.email }} />;
  }

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

const AppRoutes = ({ 
  splashSchoolName, 
  splashSchoolLogo,
  hideDefault
}: { 
  splashSchoolName: string; 
  splashSchoolLogo: string;
  hideDefault: boolean;
}) => {
  const { isAuthenticated, authLoading } = useAuth();
  const routeSplashMessage = hideDefault ? "Preparing Your Dashboard." : "Loading";
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Public Marketing Pages */}
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/book-demo" element={<BookDemo />} />
      <Route path="/demos" element={<DemoVideos />} />
      <Route path="/get-started" element={<GetStarted />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/features" element={<Features />} />
      <Route path="/blog" element={<Blog />} />
      <Route path="/email-verified" element={<EmailVerified />} />

      {/* Root redirects based on role */}
      <Route
        path="/"
        element={
          authLoading ? (
            <SplashScreen 
              message={routeSplashMessage} 
              schoolName={splashSchoolName}
              schoolLogoUrl={splashSchoolLogo}
              hideDefaultBranding={hideDefault}
            />
          ) : isAuthenticated ? (
            <ProtectedRoute>
              <RoleBasedHome />
            </ProtectedRoute>
          ) : (
            <MarketingHome />
          )
        }
      />

      {/* Admin Routes */}
      <Route
        path="/offline"
        element={
          <ProtectedRoute
            allowedRoles={[
              UserRole.SCHOOL_ADMIN,
              UserRole.TEACHER,
              UserRole.PARENT,
            ]}
          >
            <OfflineAccess />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account/mfa-setup"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN]}
          >
            <MfaSetup />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SCHOOL_ADMIN]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
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
        path="/admin/assessment"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="basic_exam_reports"
          >
            <Assessment />
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
        path="/admin/payroll"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
            requiredFeature="teacher_management"
          >
            <StaffPayroll />
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

      <Route
        path="/admin/whatsapp"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
          >
            <WhatsAppBroadcast />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/payment-settings"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
          >
            <PaymentSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reminders"
        element={
          <ProtectedRoute
            allowedRoles={[UserRole.SCHOOL_ADMIN]}
          >
            <Reminders />
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
        path="/super-admin/sms"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <Layout title="SMS Resale Manager">
              <SmsManager />
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
        path="/super-admin/whatsapp"
        element={
          <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
            <SuperAdminWhatsAppPairing />
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
