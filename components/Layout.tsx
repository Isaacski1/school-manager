import schoolLogo from "../logo/apple-icon-180x180.png";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
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
import { UserRole, SystemNotification } from "../types";
import Toast from "./Toast";

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
  History,
  Activity,
  BadgeDollarSign,
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const { user, logout } = useAuth();
  const { school } = useSchool();
  const activeSchoolId =
    school?.id ||
    user?.schoolId ||
    localStorage.getItem("activeSchoolId") ||
    localStorage.getItem("lastSchoolId") ||
    null;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isBillingRoute = location.pathname.startsWith("/admin/billing");

  // Notification State
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsPollRef = useRef(true);

  const isAdmin = user?.role === UserRole.SCHOOL_ADMIN;
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isParent = user?.role === UserRole.PARENT;
  const isFreePlan = (school as any)?.plan === "free";
  const hasFeature = (feature: FeatureKey) =>
    canAccessFeature(user, school, feature);
  const subscriptionGate = useMemo(() => {
    if (!school || isFreePlan || isSuperAdmin || isParent) return null;
    const normalizeDate = (raw: any) => {
      if (!raw) return null;
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

    let baseDate = normalizeDate(rawLastPayment) || normalizeDate(rawCreatedAt);
    if (!baseDate) return null;

    if (rawLastPayment) {
      baseDate = new Date(baseDate);
      baseDate.setDate(1);
      baseDate.setHours(0, 0, 0, 0);
    }

    const planEndsAt =
      explicitEndsAt ||
      (() => {
        const endDate = new Date(baseDate);
        endDate.setMonth(endDate.getMonth() + getPlanMonths(plan));
        return endDate;
      })();

    const graceMs = 7 * 24 * 60 * 60 * 1000;
    const graceEndsAt = new Date(planEndsAt.getTime() + graceMs);
    const now = new Date();
    if (now < graceEndsAt) return null;

    const status = String((school as any)?.billing?.status || "")
      .toLowerCase()
      .trim();
    if (["active", "success", "paid"].includes(status)) return null;

    return {
      planEndsAt,
      graceEndsAt,
    };
  }, [school, isFreePlan, isSuperAdmin]);

  const formatPaymentAmount = (amount?: number, currency = "GHS") => {
    if (!amount && amount !== 0) return "";
    const normalized = amount >= 100 ? amount / 100 : amount;
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(normalized);
  };

  const getSuperAdminDismissedKey = () =>
    `superAdminDismissedNotifications:${user?.id || "unknown"}`;
  const getSuperAdminReadKey = () =>
    `superAdminReadNotifications:${user?.id || "unknown"}`;

  const loadSuperAdminDismissed = () => {
    try {
      const raw = localStorage.getItem(getSuperAdminDismissedKey());
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  };

  const saveSuperAdminDismissed = (ids: string[]) => {
    try {
      localStorage.setItem(getSuperAdminDismissedKey(), JSON.stringify(ids));
    } catch {
      // ignore storage errors
    }
  };

  const loadSuperAdminRead = () => {
    try {
      const raw = localStorage.getItem(getSuperAdminReadKey());
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  };

  const saveSuperAdminRead = (ids: string[]) => {
    try {
      localStorage.setItem(getSuperAdminReadKey(), JSON.stringify(ids));
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

  // Fetch Notifications for Admin / Super Admin
  useEffect(() => {
    if (!isAdmin && !isSuperAdmin) return;

    notificationsPollRef.current = true;

    // For regular admins, require a valid schoolId (not null, not empty string)
    if (!isSuperAdmin) {
      const hasValidSchoolId = activeSchoolId && typeof activeSchoolId === "string" && activeSchoolId.trim() !== "";
      if (!hasValidSchoolId) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }
    }

    console.info("[Notifications] subscribe", {
      isSuperAdmin,
      schoolId: activeSchoolId || null,
      path: "admin_notifications",
    });

    let notificationsQuery;

    if (isSuperAdmin) {
      notificationsQuery = query(
        collection(firestore, "admin_notifications"),
        orderBy("createdAt", "desc"),
        limit(20),
      );
    } else {
      // Only set up query if we have a valid schoolId
      const validSchoolId = String(activeSchoolId).trim();
      if (!validSchoolId) {
        setNotifications([]);
        setUnreadCount(0);
        return () => {};
      }

      notificationsQuery = query(
        collection(firestore, "admin_notifications"),
        where("schoolId", "==", validSchoolId),
        orderBy("createdAt", "desc"),
        limit(20),
      );
    }

    const unsubscribe = onSnapshot(
      notificationsQuery as any,
      (snap: any) => {
        if (!notificationsPollRef.current) return;

        if (isSuperAdmin) {
          const dismissedIds = new Set(loadSuperAdminDismissed());
          const readIds = new Set(loadSuperAdminRead());
          const notes: SystemNotification[] = snap.docs
            .filter((doc) => !dismissedIds.has(doc.id))
            .map((doc) => {
              const notice = doc.data() as any;
              return {
                id: doc.id,
                schoolId: notice.schoolId || "system",
                message: notice.message || "System notification",
                createdAt: toTimestamp(notice.createdAt),
                isRead: readIds.has(doc.id),
                type: notice.type || "system",
              };
            });
          setNotifications(notes);
          setUnreadCount(notes.filter((n) => !n.isRead).length);
          return;
        }

        const notes: SystemNotification[] = snap.docs.map((docSnap) => {
          const notice = docSnap.data() as Partial<SystemNotification> & {
            createdAt?: unknown;
          };
          return {
            id: notice.id || docSnap.id,
            schoolId: notice.schoolId || activeSchoolId || "",
            message: notice.message || "System notification",
            createdAt: toTimestamp(notice.createdAt),
            isRead: Boolean(notice.isRead),
            type: notice.type || "system",
          };
        });
        setNotifications(notes);
        setUnreadCount(notes.filter((n) => !n.isRead).length);
      },
      (e: any) => {
        console.error("Failed to subscribe to notifications", e);
        const message = String(e?.message || "").toLowerCase();
        if (
          message.includes("permission") ||
          message.includes("insufficient")
        ) {
          notificationsPollRef.current = false;
        }
      },
    );

    return () => {
      notificationsPollRef.current = false;
      unsubscribe();
    };
  }, [isAdmin, isSuperAdmin, activeSchoolId]);

  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSuperAdmin) {
      const nextRead = Array.from(new Set([...loadSuperAdminRead(), id]));
      saveSuperAdminRead(nextRead);
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
    if (isSuperAdmin) {
      const removedWasUnread = notifications.find(
        (n) => n.id === id && !n.isRead,
      );
      const nextDismissed = Array.from(
        new Set([...loadSuperAdminDismissed(), id]),
      );
      saveSuperAdminDismissed(nextDismissed);
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
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center gap-3 px-4 py-3 mx-3 my-1 rounded-xl text-[15px] font-medium transition-all
          ${isActive
            ? "bg-[#E6F0FA] text-[#0B4A82] shadow-sm"
            : "text-[#E6F0FA] hover:bg-[#0B4A82] hover:text-white"
          }`}
      >
        {icon}
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  return (
    <div className="h-screen bg-[#fafafa] flex overflow-hidden">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-72 max-w-[85vw] sm:w-64 bg-[#0B4A82] text-white transform transition-transform duration-200 ease-in-out overflow-y-auto shrink-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          xl:relative xl:translate-x-0 flex flex-col shadow-xl border-r border-[#0B4A82]
        `}
      >
        <div className="p-5 sm:p-6 border-b border-[#0B4A82] bg-[#0B4A82] flex flex-col items-center justify-center relative">
          <button
            onClick={() => setSidebarOpen(false)}
            className="xl:hidden absolute top-4 right-4 text-[#E6F0FA] hover:text-white"
          >
            <X size={24} />
          </button>

          {isSuperAdmin ? (
            <>
              <div className="w-16 h-16 sm:w-20 sm:h-20 mb-3 bg-white rounded-full p-1 shadow-lg border-2 border-[#E6F0FA] overflow-hidden">
                <img
                  src={schoolLogo}
                  alt="School Manager GH Logo"
                  className="w-full h-full object-contain rounded-full"
                />
              </div>
              <div className="text-center">
                <h1 className="text-lg sm:text-xl font-bold text-[#E6F0FA] leading-tight tracking-wide font-serif break-words px-2">
                  Super Admin Panel
                </h1>
                <p className="text-xs text-[#E6F0FA] mt-1 uppercase tracking-wider">
                  System Administration
                </p>
              </div>
            </>
          ) : (
            <>
              {isParent ? (
                <div className="w-16 h-16 sm:w-20 sm:h-20 mb-3 bg-white rounded-full p-1 shadow-lg border-2 border-green-500 overflow-hidden flex items-center justify-center">
                  <Users size={32} className="text-green-600" />
                </div>
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 mb-3 bg-white rounded-full p-1 shadow-lg border-2 border-amber-500 overflow-hidden">
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
              <div className="text-center">
                <h1 className="text-lg sm:text-xl font-bold text-[#E6F0FA] leading-tight tracking-wide font-serif break-words px-2">
                  {isParent ? "Parent Portal" : (school?.name || "School Management System")}
                </h1>
                <p className="text-xs text-[#E6F0FA] mt-1 uppercase tracking-wider">
                  {isParent ? "Student Tracker" : "Management System"}
                </p>
              </div>
            </>
          )}
        </div>

        <nav className="flex-1 py-4 sm:py-6 space-y-1">
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
                label="Isaacski AI"
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
                href="/super-admin/payments"
                icon={<BadgeDollarSign size={18} />}
                label="Payments"
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
              <NavItem
                href="/parent?view=fees"
                icon={<CreditCard size={18} />}
                label="Fees & Bills"
              />
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
          ) : (
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
              {hasFeature("teacher_attendance") && (
                <NavItem href="/teacher/my-attendance" icon={<CalendarDays size={18} />} label="My Attendance" />
              )}
              {hasFeature("basic_exam_reports") && (
                <NavItem href="/admin/assessment" icon={<BookOpen size={18} />} label="Assessments" />
              )}
              {hasFeature("basic_exam_reports") && (
                <NavItem href="/admin/report-card" icon={<FileText size={18} />} label="Report Cards" />
              )}
              {hasFeature("timetable") && (
                <NavItem href="/admin/timetable" icon={<CalendarDays size={18} />} label="Timetable" />
              )}
              {hasFeature("fees_payments") && (
                <NavItem href="/admin/fees" icon={<CreditCard size={18} />} label="Fees & Payments" />
              )}
              {hasFeature("activity_monitor") && (
                <NavItem href="/admin/activity" icon={<Activity size={18} />} label="Activity" />
              )}
              {!isFreePlan && (
                <NavItem href="/admin/billing" icon={<Wallet size={18} />} label="Billing" />
              )}
              {hasFeature("backups") && (
                <NavItem href="/admin/backups" icon={<History size={18} />} label="Backups" />
              )}
              {hasFeature("academic_year") && (
                <NavItem href="/admin/system-settings" icon={<Settings size={18} />} label="Settings" />
              )}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-[#0B4A82]">
          <button
            onClick={() => {
              logout();
            }}
            className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-white/10 border border-[#E6F0FA]/30 text-[#E6F0FA] hover:text-white px-4 py-3 rounded-xl font-semibold transition-colors text-[15px]"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-screen overflow-hidden">
        {/* Top Header */}
        <header className="bg-white shadow-sm h-14 sm:h-16 flex items-center z-10 border-b border-[#E6F0FA]">
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
              {/* Notifications */}
              {!isSuperAdmin && (
                <div className="relative">
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
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 max-h-96 overflow-y-auto">
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
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-contain p-3 sm:p-4 md:p-5 lg:p-6 xl:p-8">
          {children}
        </main>
      </div>

      <Toast />
    </div>
  );
};

export default Layout;
