import schoolLogo from "../logo/apple-icon-180x180.png";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useSchool } from "../context/SchoolContext";
import {
  canAccessFeature,
  FeatureKey,
  resolveFeaturePlan,
} from "../services/featureAccess";
import { db } from "../services/mockDb";
import { firestore } from "../services/firebase";
import {
  getAdminMfaPolicyStatus,
  type AdminMfaPolicyStatus,
} from "../services/backendApi";
import { UserRole, SystemNotification } from "../types";
import Toast from "./Toast";
import UserAvatar from "./UserAvatar";
import SchoolAssistantDrawer, {
  SchoolAssistantLauncher,
} from "./SchoolAssistantDrawer";
import { showToast } from "../services/toast";

import {
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardCheck,
  BookOpen,
  Settings,
  Bell,
  CalendarDays,
  BarChart,
  Check,
  MessageSquare,
  Edit,
  FileText,
  Shield,
  CreditCard,
  Wallet,
  Lock,
  BarChart3,
  Megaphone,
  ClipboardList,
  History,
  Activity,
  BadgeDollarSign,
  HandCoins,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  CircleHelp,
} from "lucide-react";
import GuidedTour from "./GuidedTour";

// WhatsApp SVG icon (official brand logo)
const WhatsAppIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>
);

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

const DASHBOARD_THEME_STORAGE_KEY = "school_manager_dashboard_theme_v1";
const LEGACY_SUPER_ADMIN_THEME_STORAGE_KEY =
  "super_admin_dashboard_theme_v1";

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const { user, logout, updateUser } = useAuth();
  const { school } = useSchool();
  const activeSchoolId = useMemo(() => 
    school?.id ||
    user?.schoolId ||
    localStorage.getItem("activeSchoolId") ||
    localStorage.getItem("lastSchoolId") ||
    null
  , [school?.id, user?.schoolId]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [schoolAssistantOpen, setSchoolAssistantOpen] = useState(false);
  const [tourRestartSignal, setTourRestartSignal] = useState(0);
  const [tourCompleted, setTourCompleted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", String(isCollapsed));
  }, [isCollapsed]);

  const location = useLocation();
  const navigate = useNavigate();
  const isBillingRoute = location.pathname.startsWith("/admin/billing");
  const [subscriptionClock, setSubscriptionClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(
      () => setSubscriptionClock(Date.now()),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  // Notification State
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsPollRef = useRef(true);
  const notificationRef = useRef<HTMLDivElement>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const mainContentRef = useRef<HTMLElement>(null);

  const compressImageToBase64 = (file: File, maxPx = 300, quality = 0.7): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingPhoto(true);
    try {
      const base64 = await compressImageToBase64(file);
      await db.updateUserProfilePhoto(user.id, base64);
      updateUser({ photoUrl: base64 });
      showToast("Profile photo updated successfully!", { type: "success" });
    } catch (error) {
      console.error("Profile photo upload error:", error);
      showToast("Failed to upload profile photo.", { type: "error" });
    } finally {
      setUploadingPhoto(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNotifications]);

  useEffect(() => {
    const guide = (
      location.state as {
        assistantGuide?: { target?: string };
      } | null
    )?.assistantGuide;
    if (!guide || !mainContentRef.current) return;

    let stopped = false;
    let attempts = 0;
    let highlightTimer: number | undefined;
    let retryTimer: number | undefined;
    const findTarget = () => {
      const root = mainContentRef.current;
      if (!root) return null;
      if (!guide.target) return null;
      return root.querySelector<HTMLElement>(
        `[data-assistant-focus="${CSS.escape(guide.target)}"]`,
      );
    };

    const focusDestination = () => {
      if (stopped) return;
      const target = findTarget();
      if (!target && attempts < 16) {
        attempts += 1;
        retryTimer = window.setTimeout(focusDestination, 150);
        return;
      }
      if (!target) return;

      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
      target.classList.remove("assistant-guided-highlight");
      window.requestAnimationFrame(() => {
        target.classList.add("assistant-guided-highlight");
      });
      highlightTimer = window.setTimeout(() => {
        target.classList.remove("assistant-guided-highlight");
      }, 4200);
    };

    retryTimer = window.setTimeout(focusDestination, 120);
    return () => {
      stopped = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (highlightTimer) window.clearTimeout(highlightTimer);
    };
  }, [location.key, location.state]);

  const isAdmin = user?.role === UserRole.SCHOOL_ADMIN;
  const isTeacher = user?.role === UserRole.TEACHER;
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isParent = user?.role === UserRole.PARENT;
  const [adminMfaPolicy, setAdminMfaPolicy] =
    useState<AdminMfaPolicyStatus | null>(null);
  const [mfaBannerDismissed, setMfaBannerDismissed] = useState(false);
  const mfaReminderDismissKey = useMemo(
    () => `admin_mfa_reminder_dismissed_until:${user?.id || "anonymous"}`,
    [user?.id],
  );
  const [dashboardDarkMode, setDashboardDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const savedTheme =
      window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_SUPER_ADMIN_THEME_STORAGE_KEY);
    return savedTheme === "dark";
  });

  useEffect(() => {
    if (!isAdmin && !isSuperAdmin && !isTeacher && !isParent) return;
    try {
      window.localStorage.setItem(
        DASHBOARD_THEME_STORAGE_KEY,
        dashboardDarkMode ? "dark" : "light",
      );
    } catch {
      // The selected theme still works for the current session.
    }
  }, [dashboardDarkMode, isAdmin, isParent, isSuperAdmin, isTeacher]);

  useEffect(() => {
    let cancelled = false;
    const isAdminRole = isAdmin || isSuperAdmin;
    const isSetupRoute = location.pathname.startsWith("/account/mfa-setup");

    if (!user?.id || !isAdminRole || isSetupRoute) {
      setAdminMfaPolicy(null);
      return;
    }

    try {
      const dismissedUntil = Number(
        window.localStorage.getItem(mfaReminderDismissKey) || 0,
      );
      setMfaBannerDismissed(dismissedUntil > Date.now());
    } catch {
      setMfaBannerDismissed(false);
    }

    getAdminMfaPolicyStatus()
      .then((status) => {
        if (!cancelled) setAdminMfaPolicy(status);
      })
      .catch((error) => {
        console.warn("Failed to load admin MFA reminder status", error);
        if (!cancelled) setAdminMfaPolicy(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isAdmin,
    isSuperAdmin,
    location.pathname,
    mfaReminderDismissKey,
    user?.id,
  ]);

  const shouldShowMfaReminder =
    Boolean(
      adminMfaPolicy?.appliesTo &&
        adminMfaPolicy.enforcementMode !== "off" &&
        Number(adminMfaPolicy.enrolledFactorsCount || 0) === 0,
    ) && (!mfaBannerDismissed || Boolean(adminMfaPolicy?.required));

  const dismissMfaReminder = () => {
    setMfaBannerDismissed(true);
    try {
      window.localStorage.setItem(
        mfaReminderDismissKey,
        String(Date.now() + 24 * 60 * 60 * 1000),
      );
    } catch {
      // The banner can still be hidden for this session.
    }
  };

  const isFreePlan = (school as any)?.plan === "free";
  const hasFeature = (feature: FeatureKey) =>
    canAccessFeature(user, school, feature);
  const subscriptionGate = useMemo(() => {
    if (!school || isFreePlan || isSuperAdmin) return null;
    const normalizeDate = (raw: any) => {
      if (!raw) return null;
      if (
        typeof raw === "object" &&
        typeof raw.seconds === "number" &&
        typeof raw.toDate !== "function"
      ) {
        const date = new Date(
          raw.seconds * 1000 +
            Math.floor(Number(raw.nanoseconds || 0) / 1_000_000),
        );
        return Number.isNaN(date.getTime()) ? null : date;
      }
      const date =
        raw instanceof Date
          ? raw
          : new Date(typeof raw?.toDate === "function" ? raw.toDate() : raw);
      if (Number.isNaN(date.getTime())) return null;
      return date;
    };

    const getPlanMonths = (plan?: string) => {
      if (plan === "termly") return 4;
      if (plan === "yearly") return 12;
      return 1;
    };

    const plan = (school as any)?.plan || "monthly";
    const explicitEndsAt = normalizeDate((school as any)?.planEndsAt);
    const rawLastPayment = (school as any)?.billing?.lastPaymentAt || null;
    const rawCreatedAt =
      (school as any)?.createdAt || (school as any)?.billing?.createdAt || null;

    const lastPaymentAt = normalizeDate(rawLastPayment);
    const createdAt = normalizeDate(rawCreatedAt);
    const calculateEndDate = (baseDate: Date | null) => {
      if (!baseDate) return null;
      const endDate = new Date(baseDate);
      endDate.setMonth(endDate.getMonth() + getPlanMonths(plan));
      return endDate;
    };

    const paymentBasedEndsAt = calculateEndDate(lastPaymentAt);
    const fallbackEndsAt = calculateEndDate(createdAt);
    const planEndsAt =
      explicitEndsAt && lastPaymentAt && lastPaymentAt > explicitEndsAt
        ? new Date(
            Math.max(
              explicitEndsAt.getTime(),
              paymentBasedEndsAt?.getTime() || 0,
            ),
          )
        : explicitEndsAt || paymentBasedEndsAt || fallbackEndsAt;
    if (!planEndsAt) return null;

    const graceMs = 7 * 24 * 60 * 60 * 1000;
    const graceEndsAt = new Date(planEndsAt.getTime() + graceMs);
    if (subscriptionClock < graceEndsAt.getTime()) return null;

    return {
      planEndsAt,
      graceEndsAt,
    };
  }, [school, isFreePlan, isSuperAdmin, subscriptionClock]);

  const formatPaymentAmount = (amount?: number, currency = "GHS") => {
    if (!amount && amount !== 0) return "";
    const normalized = amount >= 100 ? amount / 100 : amount;
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(normalized);
  };

  const notificationScope = isSuperAdmin
    ? "superAdmin"
    : `schoolAdmin:${activeSchoolId || "unknown"}`;
  const getDismissedNotificationsKey = () =>
    `dismissedNotifications:${notificationScope}:${user?.id || "unknown"}`;
  const getReadNotificationsKey = () =>
    `readNotifications:${notificationScope}:${user?.id || "unknown"}`;

  const loadDismissedNotifications = () => {
    try {
      const raw = localStorage.getItem(getDismissedNotificationsKey());
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  };

  const saveDismissedNotifications = (ids: string[]) => {
    try {
      localStorage.setItem(getDismissedNotificationsKey(), JSON.stringify(ids));
    } catch {
      // ignore storage errors
    }
  };

  const loadReadNotifications = () => {
    try {
      const raw = localStorage.getItem(getReadNotificationsKey());
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  };

  const saveReadNotifications = (ids: string[]) => {
    try {
      localStorage.setItem(getReadNotificationsKey(), JSON.stringify(ids));
    } catch {
      // ignore storage errors
    }
  };

  const toTimestamp = (value: any) => {
    if (!value) return Date.now();
    if (value instanceof Timestamp) return value.toMillis();
    if (typeof value === "number") return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
  };

  const formatActivityNotificationMessage = (activity: any) => {
    const actionType = String(activity.actionType || activity.eventType || "activity");
    const role = String(activity.role || activity.actorRole || "User").replace(/_/g, " ");
    const actor = activity.userName || activity.metadata?.actorName || activity.metadata?.email || role;
    const module = activity.module || activity.metadata?.module || "the system";
    const description = activity.description || activity.metadata?.description || "";

    switch (actionType) {
      case "user_login":
        return `${actor} signed in.`;
      case "teacher_attendance_marked":
      case "teacher_attendance_submitted":
        return `${actor} submitted teacher attendance.`;
      case "attendance_saved":
      case "student_attendance_marked":
        return `${actor} marked student attendance.`;
      case "assessment_saved":
      case "assessment_updated":
        return `${actor} updated assessment records.`;
      case "remarks_saved":
      case "student_remarks_saved":
        return `${actor} saved student remarks.`;
      case "student_skills_saved":
        return `${actor} updated student skills.`;
      case "fee_payment_recorded":
        return `${actor} recorded a fee payment.`;
      default:
        return description || `${actor} performed an activity in ${module}.`;
    }
  };

  const isSmsTopupPayment = (payment: any) => {
    const values = [
      payment.type,
      payment.category,
      payment.paymentType,
      payment.metadata?.type,
    ].map((value) => String(value || "").toLowerCase());
    return values.some((value) => value.includes("sms_topup"));
  };

  const isBillingPlanPayment = (payment: any) => {
    const values = [
      payment.type,
      payment.category,
      payment.paymentType,
      payment.module,
      payment.metadata?.type,
    ].map((value) => String(value || "").toLowerCase());
    return values.some((value) =>
      value === "subscription" ||
      value === "billing" ||
      value === "school_billing" ||
      value.includes("subscription") ||
      value.includes("billing"),
    );
  };

  const formatPaymentNotificationMessage = (payment: any) => {
    const schoolName = payment.schoolName || payment.metadata?.schoolName || "A school";
    const amount = formatPaymentAmount(Number(payment.amount || 0), payment.currency || "GHS");
    const status = String(payment.status || "pending").toLowerCase();
    const statusLabel =
      status === "success" || status === "paid"
        ? "completed"
        : status === "failed"
          ? "failed"
          : "started";

    if (isSmsTopupPayment(payment)) {
      return `${schoolName} ${statusLabel} an SMS wallet top-up${amount ? ` of ${amount}` : ""}.`;
    }

    return `${schoolName} ${statusLabel} a billing plan payment${amount ? ` of ${amount}` : ""}.`;
  };

  const isLocalNotification = (id: string) =>
    id.startsWith("activity:") || id.startsWith("payment:");

  // Fetch Notifications for Admin / Super Admin
  useEffect(() => {
    if (!isAdmin && !isSuperAdmin) return;

    notificationsPollRef.current = true;
    const currentSchoolId = String(activeSchoolId || "").trim();

    // For regular admins, require a valid schoolId
    if (!isSuperAdmin) {
      if (!currentSchoolId) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }
    }

    const notificationsQuery = isSuperAdmin
      ? query(collection(firestore, "payments"), orderBy("createdAt", "desc"), limit(50))
      : query(
          collection(firestore, "schools", currentSchoolId, "activityLogs"),
          orderBy("timestamp", "desc"),
          limit(30),
        );

    const setupSubscription = (q: any) => {
      return onSnapshot(
        q,
        (snap: any) => {
          if (!notificationsPollRef.current) return;

          const dismissedIds = new Set(loadDismissedNotifications());
          const readIds = new Set(loadReadNotifications());

          const notes: SystemNotification[] = snap.docs
            .map((docSnap: any) => {
              const row = docSnap.data() as any;
              const id = isSuperAdmin ? `payment:${docSnap.id}` : `activity:${docSnap.id}`;
              if (dismissedIds.has(id)) return null;
              if (isSuperAdmin && !isSmsTopupPayment(row) && !isBillingPlanPayment(row)) return null;

              return {
                id,
                schoolId: row.schoolId || activeSchoolId || "system",
                message: isSuperAdmin
                  ? formatPaymentNotificationMessage(row)
                  : formatActivityNotificationMessage(row),
                createdAt: toTimestamp(isSuperAdmin ? row.createdAt : row.timestamp),
                isRead: readIds.has(id),
                type: isSuperAdmin
                  ? isSmsTopupPayment(row) ? "system" : "assessment"
                  : row.module === "Attendance" ? "attendance" : "system",
              };
            })
            .filter(Boolean)
            .sort((a, b) => b.createdAt - a.createdAt);

          setNotifications(notes);
          setUnreadCount(notes.filter((n) => !n.isRead).length);
        },
        (e: any) => {
          console.error("Failed to subscribe to notifications", e);
          const message = String(e?.message || "").toLowerCase();
          
          if (message.includes("index") || message.includes("composite")) {
            const fallbackQuery = isSuperAdmin 
              ? query(collection(firestore, "payments"), limit(80))
              : query(collection(firestore, "schools", currentSchoolId, "activityLogs"), limit(40));
            
            unsubscribe = setupSubscription(fallbackQuery);
          } else if (
            message.includes("permission") ||
            message.includes("insufficient")
          ) {
            notificationsPollRef.current = false;
          }
        }
      );
    };

    let unsubscribe = setupSubscription(notificationsQuery);

    return () => {
      notificationsPollRef.current = false;
      if (unsubscribe) unsubscribe();
    };
  }, [isAdmin, isSuperAdmin, activeSchoolId]);

  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSuperAdmin || isLocalNotification(id)) {
      const nextRead = Array.from(new Set([...loadReadNotifications(), id]));
      saveReadNotifications(nextRead);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      return;
    }
    await db.markNotificationAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleDeleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSuperAdmin || isLocalNotification(id)) {
      const removedWasUnread = notifications.find(
        (n) => n.id === id && !n.isRead,
      );
      const nextDismissed = Array.from(
        new Set([...loadDismissedNotifications(), id]),
      );
      saveDismissedNotifications(nextDismissed);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((prev) =>
        removedWasUnread ? Math.max(0, prev - 1) : prev,
      );
      return;
    }

    try {
      await db.deleteSystemNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to delete notification", err);
    }
  };

  const NavItem = ({
    href,
    icon,
    label,
  }: {
    href: string;
    icon: React.ReactNode;
    label: string;
  }) => {
    // Determine active state by checking exact match with search params,
    // or fallback to pathname match if href has no search params.
    // If we are on a parent sub-view (like ?view=attendance), the main /parent dashboard link should NOT be active.
    const isSubView = location.search.includes('view=');
    const isActive = href.includes('?') 
      ? location.pathname + location.search === href
      : location.pathname === href && (!isSubView || !href.includes('/parent'));

    return (
      <Link
        to={href}
        data-tour={href}
        onClick={() => setSidebarOpen(false)}
        title={isCollapsed ? label : ""}
        className={`flex items-center gap-3 px-4 py-3 mx-3 my-1 rounded-xl text-[17px] font-medium transition-all
          ${isActive
            ? "bg-[#E6F0FA] text-[#0B4A82] shadow-sm"
            : "text-[#E6F0FA] hover:bg-[#0B4A82] hover:text-white"
          } ${isCollapsed ? "justify-center px-0 mx-2" : ""}`}
      >
        <span className={`${isCollapsed ? "flex-shrink-0" : ""}`}>{icon}</span>
        {!isCollapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  };

  return (
    <div
      data-super-admin-theme={
        isAdmin || isSuperAdmin || isTeacher || isParent
          ? dashboardDarkMode
            ? "dark"
            : "light"
          : undefined
      }
      className="h-screen bg-[#fafafa] flex overflow-hidden transition-colors duration-300"
    >
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 bg-[#0B4A82] text-white transform transition-all duration-300 ease-in-out shrink-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          xl:relative xl:translate-x-0 flex flex-col shadow-xl border-r border-[#0B4A82]
          ${isCollapsed ? "w-20" : "w-72 max-w-[85vw] sm:w-64"}
        `}
      >
        <div className={`p-5 sm:p-6 border-b border-[#0B4A82] bg-[#0B4A82] flex flex-col items-center justify-center relative transition-all duration-300 ${isCollapsed ? "p-4" : ""}`}>
          <button
            onClick={() => setSidebarOpen(false)}
            className="xl:hidden absolute top-4 right-4 text-[#E6F0FA] hover:text-white"
          >
            <X size={24} />
          </button>

          {/* Desktop Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden xl:flex absolute -right-3 top-10 w-6 h-6 bg-white text-[#0B4A82] rounded-full items-center justify-center shadow-md border border-slate-200 hover:bg-[#E6F0FA] transition-colors z-50"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {isSuperAdmin ? (
            <>
              <div className="w-12 h-12 sm:w-16 sm:h-16 mb-2 bg-white rounded-full p-1 shadow-lg border-2 border-[#E6F0FA] overflow-hidden transition-all">
                <img
                  src={schoolLogo}
                  alt="School Manager GH Logo"
                  className="w-full h-full object-contain rounded-full"
                />
              </div>
              {!isCollapsed && (
                <div className="text-center animate-fadeIn">
                  <h1 className="text-lg sm:text-xl font-bold text-[#E6F0FA] leading-tight tracking-wide font-poppins break-words px-2">
                    Super Admin Panel
                  </h1>
                  <p className="text-xs text-[#E6F0FA] mt-1 uppercase tracking-wider">
                    System Administration
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {isParent && !school ? (
                <div className={`${isCollapsed ? "w-10 h-10" : "w-16 h-16 sm:w-20 sm:h-20"} mb-2 bg-white rounded-full p-1 shadow-lg border-2 border-green-500 overflow-hidden flex items-center justify-center transition-all`}>
                  <Users size={isCollapsed ? 20 : 32} className="text-green-600" />
                </div>
              ) : (
                <div className={`${isCollapsed ? "w-12 h-12" : "w-16 h-16 sm:w-20 sm:h-20"} mb-2 bg-white rounded-full p-1 shadow-lg border-2 border-amber-500 overflow-hidden transition-all`}>
                  <img
                    src={school?.logoUrl || schoolLogo}
                    alt={school?.name || "School Management System"}
                    className="w-full h-full object-contain rounded-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = schoolLogo;
                    }}
                  />
                </div>
              )}
              {!isCollapsed && (
                <div className="text-center animate-fadeIn">
                  <h1 className="text-lg sm:text-xl font-bold text-[#E6F0FA] leading-tight tracking-wide font-poppins break-words px-2">
                    {school?.name || (isParent ? "Parent Portal" : "School Management System")}
                  </h1>
                  <p className="text-xs text-[#E6F0FA] mt-1 uppercase tracking-wider">
                    {isParent ? (school ? "Parent Portal" : "Student Tracker") : "Management System"}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <nav className="flex-1 py-4 sm:py-6 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {isSuperAdmin ? (
            <>
              <NavItem
                href="/super-admin/dashboard"
                icon={<LayoutDashboard size={18} />}
                label="Dashboard"
              />
              <NavItem
                href="/super-admin/dashboard?assistant=1"
                icon={<MessageSquare size={18} />}
                label="School Manager GH AI"
              />
              <NavItem
                href="/super-admin/schools"
                icon={<GraduationCap size={18} />}
                label="Schools"
              />
              <NavItem href="/super-admin/users" icon={<Users size={18} />} label="Users" />
              <NavItem
                href="/super-admin/broadcasts"
                icon={<Megaphone size={18} />}
                label="Broadcasts"
              />
              <NavItem
                href="/super-admin/outreach"
                icon={<ClipboardList size={18} />}
                label="Outreach Tracker"
              />
              <NavItem
                href="/super-admin/security/login-history"
                icon={<Lock size={18} />}
                label="Login History"
              />
              <NavItem
                href="/super-admin/security/suspicious"
                icon={<Shield size={18} />}
                label="Suspicious Events"
              />
              <NavItem
                href="/super-admin/security/audit-logs"
                icon={<FileText size={18} />}
                label="Audit Logs"
              />
              <NavItem
                href="/super-admin/security/settings"
                icon={<Settings size={18} />}
                label="Security Settings"
              />
              <NavItem
                href="/super-admin/analytics"
                icon={<BarChart3 size={18} />}
                label="Analytics"
              />
              <NavItem
                href="/super-admin/system-health"
                icon={<Activity size={18} />}
                label="System Health"
              />
              <NavItem
                href="/super-admin/payments"
                icon={<BadgeDollarSign size={18} />}
                label="Payments"
              />
              <NavItem
                href="/super-admin/sms"
                icon={<MessageSquare size={18} />}
                label="SMS Resale Manager"
              />
              <NavItem
                href="/super-admin/backups"
                icon={<History size={18} />}
                label="Backups"
              />
            </>
          ) : isParent ? (
            <>
              <NavItem
                href="/parent"
                icon={<LayoutDashboard size={18} />}
                label="Dashboard"
              />
              <NavItem
                href="/parent?view=attendance"
                icon={<ClipboardCheck size={18} />}
                label="Attendance"
              />
              {hasFeature("parent_portal") && (
                <NavItem
                  href="/parent?view=fees"
                  icon={<CreditCard size={18} />}
                  label="Fees & Bills"
                />
              )}
              <NavItem
                href="/parent?view=report"
                icon={<FileText size={18} />}
                label="Report Cards"
              />
              <NavItem
                href="/parent?view=remarks"
                icon={<MessageSquare size={18} />}
                label="Remarks"
              />
            </>
          ) : isAdmin ? (
            <>
              {subscriptionGate ? (
                <div className="mx-4 mb-4 p-4 bg-amber-500/20 border border-amber-400/40 rounded-xl text-amber-100 text-sm">
                  <p className="font-semibold mb-1">Subscription Expired</p>
                  <p className="text-xs opacity-90 mb-3">
                    Your school's subscription has expired. Please renew to access all features.
                  </p>
                  <Link
                    to="/admin/billing"
                    className="inline-block text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    Renew Now
                  </Link>
                </div>
              ) : null}

              <NavItem
                href="/admin"
                icon={<LayoutDashboard size={18} />}
                label="Dashboard"
              />
              {hasFeature("teacher_management") && (
                <NavItem href="/admin/teachers" icon={<Users size={18} />} label="Teachers" />
              )}
              {hasFeature("student_management") && (
                <NavItem href="/admin/students" icon={<GraduationCap size={18} />} label="Students" />
              )}
              {hasFeature("attendance") && (
                <NavItem href="/admin/attendance" icon={<ClipboardCheck size={18} />} label="Attendance" />
              )}
              
              {hasFeature("basic_exam_reports") && (
                <NavItem href="/admin/report-card" icon={<FileText size={18} />} label="Report Cards" />
              )}
              {hasFeature("basic_exam_reports") && (
                <NavItem href="/admin/reports" icon={<BookOpen size={18} />} label="Academic Reports" />
              )}
              {hasFeature("timetable") && (
                <NavItem href="/admin/timetable" icon={<CalendarDays size={18} />} label="Timetable" />
              )}
              {hasFeature("fees_payments") && (
                <NavItem href="/admin/fees" icon={<CreditCard size={18} />} label="Fees & Payments" />
              )}
              {hasFeature("staff_payroll") && (
                <NavItem href="/admin/payroll" icon={<HandCoins size={18} />} label="Staff Payroll" />
              )}
              {hasFeature("fees_payments") && (
                <NavItem href="/admin/payment-settings" icon={<Wallet size={18} />} label="Online Payment" />
              )}
              {hasFeature("activity_monitor") && (
                <NavItem href="/admin/activity" icon={<Activity size={18} />} label="Activity" />
              )}
              {false && hasFeature("whatsapp_broadcast") && (
                <NavItem href="/admin/whatsapp" icon={<WhatsAppIcon size={18} />} label="WhatsApp Broadcast" />
              )}
              {hasFeature("whatsapp_broadcast") && (
                <NavItem href="/admin/reminders" icon={<MessageSquare size={18} />} label="SMS Reminders" />
              )}
              {hasFeature("student_history") && (
                <NavItem href="/admin/student-history" icon={<History size={18} />} label="Student History" />
              )}

              {!isFreePlan && (
                <NavItem href="/admin/billing" icon={<Wallet size={18} />} label="Billing" />
              )}
              {hasFeature("backups") && (
                <NavItem href="/admin/backups" icon={<History size={18} />} label="Backups" />
              )}
              {hasFeature("school_ai") && (
                <button
                  type="button"
                  data-tour="school-assistant"
                  onClick={() => {
                    setSchoolAssistantOpen(true);
                    setSidebarOpen(false);
                  }}
                  title={isCollapsed ? "School Assistant" : ""}
                  className={`flex w-[calc(100%_-_1.5rem)] items-center gap-3 px-4 py-3 mx-3 my-1 rounded-xl text-[17px] font-medium text-[#E6F0FA] transition-all hover:bg-[#0B4A82] hover:text-white ${
                    isCollapsed ? "justify-center px-0 mx-2 w-[calc(100%_-_1rem)]" : ""
                  }`}
                >
                  <MessageSquare size={18} />
                  {!isCollapsed && <span className="truncate">School Assistant</span>}
                </button>
              )}
              {hasFeature("academic_year") && (
                <NavItem href="/admin/settings" icon={<Settings size={18} />} label="Settings" />
              )}
            </>
          ) : isTeacher ? (
            <>
              <NavItem
                href="/teacher"
                icon={<LayoutDashboard size={18} />}
                label="Dashboard"
              />
              {hasFeature("attendance") && (
                <NavItem href="/teacher/attendance" icon={<ClipboardCheck size={18} />} label="Attendance" />
              )}
              {hasFeature("basic_exam_reports") && (
                <NavItem href="/teacher/assessment" icon={<BookOpen size={18} />} label="Assessments" />
              )}
              {hasFeature("teacher_attendance") && (
                <NavItem href="/teacher/my-attendance" icon={<CalendarDays size={18} />} label="My Attendance" />
              )}
              {hasFeature("basic_exam_reports") && (
                <NavItem href="/teacher/write-remarks" icon={<MessageSquare size={18} />} label="Write Remarks" />
              )}
              {hasFeature("basic_exam_reports") && (
                <NavItem href="/teacher/student-performance" icon={<BarChart size={18} />} label="Student Performance" />
              )}

            </>
          ) : null}
        </nav>

        <div className="p-4 border-t border-[#0B4A82]">
            <button
              onClick={() => {
                logout();
              }}
              className={`w-full flex items-center justify-center gap-2 bg-transparent hover:bg-white/10 border border-[#E6F0FA]/30 text-[#E6F0FA] hover:text-white px-4 py-3 rounded-xl font-semibold transition-all text-[15px] ${isCollapsed ? "px-0" : ""}`}
              title={isCollapsed ? "Sign Out" : ""}
            >
              <LogOut size={18} />
              {!isCollapsed && <span>Sign Out</span>}
            </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-screen overflow-hidden">
        {/* Top Header */}
        <header className="bg-white shadow-sm min-h-14 sm:min-h-16 lg:min-h-20 flex items-center z-10 border-b border-[#E6F0FA]">
          <div className="flex items-center justify-between w-full px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="xl:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600"
              >
                <Menu size={20} />
              </button>
              <h2 className="text-base sm:text-lg font-semibold text-slate-800 truncate">
                {title}
              </h2>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {(isAdmin || isTeacher || isParent) && !tourCompleted && (
                <button
                  type="button"
                  onClick={() => setTourRestartSignal((current) => current + 1)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:text-cyan-700 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-cyan-100"
                  aria-label="Start dashboard tour"
                  title="Dashboard tour"
                >
                  <CircleHelp size={19} />
                  <span className="hidden lg:inline">Help</span>
                </button>
              )}

              {(isAdmin || isSuperAdmin || isTeacher || isParent) && (
                <button
                  type="button"
                  onClick={() => setDashboardDarkMode((current) => !current)}
                  className="dashboard-theme-toggle inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:text-cyan-700 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-cyan-100"
                  aria-label={
                    dashboardDarkMode
                      ? "Switch dashboard to light mode"
                      : "Switch dashboard to dark mode"
                  }
                  aria-pressed={dashboardDarkMode}
                  title={dashboardDarkMode ? "Light mode" : "Dark mode"}
                >
                  {dashboardDarkMode ? <Sun size={19} /> : <Moon size={19} />}
                </button>
              )}

              {/* Notifications */}
              {(isAdmin || isSuperAdmin) && (
                <div className="relative" ref={notificationRef}>
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                  >
                    <Bell size={20} />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>

                  {showNotifications && (
                    <div className="fixed left-1/2 top-16 z-50 max-h-[min(26rem,calc(100vh-5rem))] w-[calc(100vw-1.5rem)] max-w-sm -translate-x-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 sm:max-w-none sm:translate-x-0">
                      <div className="p-4 border-b border-slate-100">
                        <h3 className="font-semibold text-slate-800">Notifications</h3>
                      </div>
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm">
                          No new notifications
                        </div>
                      ) : (
                        <div>
                          {notifications.map((notification) => (
                            <div
                              key={notification.id}
                              className={`p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors ${notification.isRead ? "opacity-60" : ""}`}
                              onClick={() => handleMarkRead(notification.id, {} as React.MouseEvent)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm text-slate-700 flex-1">{notification.message}</p>
                                <button
                                  onClick={(e) => handleDeleteNotification(notification.id, e)}
                                  className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 transition-colors shrink-0"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <p className="text-xs text-slate-400 mt-1">
                                {new Date(notification.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* User Menu */}
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-semibold text-slate-700">{user?.fullName || "User"}</p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role?.replace("_", " ") || "User"}</p>
                </div>
                <div className="relative group cursor-pointer shrink-0">
                  <UserAvatar
                    user={user}
                    size="lg"
                    className="lg:!h-16 lg:!w-16 lg:!text-xl"
                  />
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 rounded-full cursor-pointer transition-opacity overflow-hidden" title="Change Profile Photo">
                    {uploadingPhoto ? (
                      <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Edit size={18} />
                    )}
                    <input type="file" className="hidden" accept="image/*" onChange={handleProfilePhotoUpload} disabled={uploadingPhoto} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main data-tour="dashboard-content" ref={mainContentRef} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-contain p-3 sm:p-4 md:p-5 lg:p-6 xl:p-8">
          {subscriptionGate && !isBillingRoute ? (
            <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center">
              <section className="w-full max-w-xl rounded-[28px] border border-amber-200 bg-white p-6 text-center shadow-[0_24px_70px_-38px_rgba(15,23,42,0.45)] sm:p-10">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <Lock size={30} />
                </div>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Access paused
                </p>
                <h1 className="mt-2 text-2xl font-bold text-slate-900">
                  School subscription expired
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  The seven-day grace period ended on{" "}
                  <span className="font-semibold text-slate-800">
                    {subscriptionGate.graceEndsAt.toLocaleDateString()}
                  </span>
                  . School Manager GH access will resume after the subscription
                  is renewed.
                </p>
                {isAdmin ? (
                  <Link
                    to="/admin/billing"
                    className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B4A82] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#083b69]"
                  >
                    <Wallet size={18} />
                    Renew Subscription
                  </Link>
                ) : (
                  <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                    Please contact your school administrator to renew the
                    subscription.
                  </p>
                )}
              </section>
            </div>
          ) : (
            <>
              {shouldShowMfaReminder ? (
                <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm sm:mb-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Shield size={20} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-amber-950">
                          Secure your admin account
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-amber-900">
                          Add an authenticator app to protect school data with
                          two-factor authentication.
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
                      <Link
                        to="/account/mfa-setup"
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B4A82] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#083a66]"
                      >
                        <Lock size={16} />
                        Set up
                      </Link>
                      {!adminMfaPolicy?.required ? (
                        <button
                          type="button"
                          onClick={dismissMfaReminder}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-200 bg-white text-amber-800 transition-colors hover:bg-amber-100"
                          aria-label="Remind me later"
                          title="Remind me later"
                        >
                          <X size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}
              {children}
            </>
          )}
        </main>
      </div>

      {isAdmin && hasFeature("school_ai") && !subscriptionGate ? (
        <>
          {!schoolAssistantOpen ? (
            <SchoolAssistantLauncher onClick={() => setSchoolAssistantOpen(true)} />
          ) : null}
          <SchoolAssistantDrawer
            open={schoolAssistantOpen}
            onClose={() => setSchoolAssistantOpen(false)}
          />
        </>
      ) : null}

      {user?.id && (isAdmin || isTeacher || isParent) && !subscriptionGate ? (
        <GuidedTour
          role={isAdmin ? "school_admin" : isTeacher ? "teacher" : "parent"}
          userId={user.id}
          userName={user.fullName}
          autoStart={
            (isAdmin && location.pathname === "/admin") ||
            (isTeacher && location.pathname === "/teacher") ||
            (isParent && location.pathname === "/parent")
          }
          restartSignal={tourRestartSignal}
          darkMode={dashboardDarkMode}
          onOpenSidebar={() => setSidebarOpen(true)}
          onCloseSidebar={() => setSidebarOpen(false)}
          onCompletionStateChange={setTourCompleted}
        />
      ) : null}

      <Toast />
    </div>
  );
};

export default Layout;
