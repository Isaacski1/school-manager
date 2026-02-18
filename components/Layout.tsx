import schoolLogo from "../logo/apple-icon-180x180.png";
import React, { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useSchool } from "../context/SchoolContext";
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
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const { user, logout } = useAuth();
  const { school } = useSchool();
  const schoolId = school?.id || null;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isBillingRoute = location.pathname.startsWith("/admin/billing");

  // Notification State
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const isAdmin = user?.role === UserRole.SCHOOL_ADMIN;
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isFreePlan = (school as any)?.plan === "free";
  const subscriptionGate = useMemo(() => {
    if (!school || isFreePlan || isSuperAdmin) return null;
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
    if (isAdmin || isSuperAdmin) {
      const fetchNotifications = async () => {
        try {
          if (!schoolId && !isSuperAdmin) return;

          if (isSuperAdmin) {
            const dismissedIds = new Set(loadSuperAdminDismissed());
            const readIds = new Set(loadSuperAdminRead());
            const paymentsQuery = query(
              collection(firestore, "payments"),
              orderBy("createdAt", "desc"),
              limit(20),
            );
            const snap = await getDocs(paymentsQuery);
            const notes: SystemNotification[] = snap.docs
              .filter((doc) => !dismissedIds.has(doc.id))
              .map((doc) => {
                const payment = doc.data() as any;
                const amountLabel = formatPaymentAmount(
                  payment.amount,
                  payment.currency || "GHS",
                );
                const status = String(
                  payment.status || "pending",
                ).toLowerCase();
                const statusLabel = ["success", "paid", "active"].includes(
                  status,
                )
                  ? "paid"
                  : ["failed", "failure", "past_due"].includes(status)
                    ? "failed"
                    : "pending";
                const schoolLabel =
                  payment.schoolName || payment.schoolId || "";

                return {
                  id: doc.id,
                  schoolId: payment.schoolId || "system",
                  message: `${schoolLabel} payment ${statusLabel}${amountLabel ? ` · ${amountLabel}` : ""}`,
                  createdAt: toTimestamp(payment.createdAt),
                  isRead: readIds.has(doc.id),
                  type: "system",
                };
              });
            setNotifications(notes);
            setUnreadCount(notes.filter((n) => !n.isRead).length);
            return;
          }

          const notes = await db.getSystemNotifications(schoolId);
          setNotifications(notes);
          setUnreadCount(notes.filter((n) => !n.isRead).length);
        } catch (e) {
          console.error("Failed to fetch notifications", e);
        }
      };
      fetchNotifications();

      // Poll every 30 seconds for simplicity in this MVP
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, isSuperAdmin, schoolId]);

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
      // adjust unread count if needed
      setUnreadCount((prev) => {
        const removedWasUnread = notifications.find(
          (n) => n.id === id && !n.isRead,
        );
        return removedWasUnread ? Math.max(0, prev - 1) : prev;
      });
    } catch (err) {
      console.error("Failed to delete notification", err);
    }
  };

  const NavItem = ({
    href,
    icon: Icon,
    label,
  }: {
    href: string;
    icon: any;
    label: string;
  }) => {
    const isActive = location.pathname === href;
    return (
      <Link
        to={href}
        className={`flex items-center px-4 py-3 transition-colors ${
          isActive
            ? "bg-[#0B4A82] text-white border-r-4 border-[#1160A8]"
            : "text-[#E6F0FA] hover:bg-[#1160A8] hover:text-white"
        }`}
        onClick={() => setSidebarOpen(false)}
      >
        <Icon
          className={`w-5 h-5 mr-3 ${isActive ? "text-white" : "text-[#E6F0FA]"}`}
        />
        <span className="font-medium">{label}</span>
      </Link>
    );
  };

  return (
    <div className="h-screen bg-[#fafafa] flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
        fixed inset-y-0 left-0 z-30 w-72 sm:w-64 bg-[#0B4A82] text-white transform transition-transform duration-200 ease-in-out overflow-y-auto
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        md:relative md:translate-x-0 flex flex-col shadow-xl border-r border-[#0B4A82]
      `}
      >
        <div className="p-5 sm:p-6 border-b border-[#0B4A82] bg-[#0B4A82] flex flex-col items-center justify-center relative">
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden absolute top-4 right-4 text-[#E6F0FA] hover:text-white"
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
              <div className="w-16 h-16 sm:w-20 sm:h-20 mb-3 bg-white rounded-full p-1 shadow-lg border-2 border-amber-500 overflow-hidden">
                <img
                  src={school?.logoUrl || schoolLogo}
                  alt={school?.name || "School Management System"}
                  className="w-full h-full object-contain rounded-full"
                />
              </div>
              <div className="text-center">
                <h1 className="text-lg sm:text-xl font-bold text-[#E6F0FA] leading-tight tracking-wide font-serif break-words px-2">
                  {school?.name || "School Management System"}
                </h1>
                <p className="text-xs text-[#E6F0FA] mt-1 uppercase tracking-wider">
                  Management System
                </p>
              </div>
            </>
          )}
        </div>

        <nav className="flex-1 py-4 sm:py-6 space-y-1">
          {isSuperAdmin ? (
            <>
              <NavItem href="/" icon={LayoutDashboard} label="Dashboard" />
              <NavItem
                href="/super-admin/schools"
                icon={GraduationCap}
                label="Schools"
              />
              <NavItem href="/super-admin/users" icon={Users} label="Users" />
              <NavItem
                href="/super-admin/broadcasts"
                icon={Megaphone}
                label="Broadcasts"
              />
              <NavItem
                href="/super-admin/security/login-history"
                icon={Lock}
                label="Login History"
              />
              <NavItem
                href="/super-admin/security/suspicious"
                icon={Shield}
                label="Suspicious Events"
              />
              <NavItem
                href="/super-admin/security/audit-logs"
                icon={FileText}
                label="Audit Logs"
              />
              <NavItem
                href="/super-admin/security/settings"
                icon={Settings}
                label="Security Settings"
              />
              <NavItem
                href="/super-admin/analytics"
                icon={BarChart3}
                label="Analytics"
              />
              <NavItem
                href="/super-admin/backups"
                icon={Shield}
                label="Backups"
              />
              <NavItem
                href="/super-admin/payments"
                icon={Wallet}
                label="Payments"
              />
            </>
          ) : isAdmin ? (
            <>
              {subscriptionGate ? (
                <NavItem
                  href="/admin/billing"
                  icon={CreditCard}
                  label="Billing"
                />
              ) : (
                <>
                  <NavItem href="/" icon={LayoutDashboard} label="Dashboard" />
                  <NavItem
                    href="/admin/students"
                    icon={GraduationCap}
                    label="Students"
                  />
                  <NavItem
                    href="/admin/student-history"
                    icon={History}
                    label="Student History"
                  />
                  <NavItem
                    href="/admin/teachers"
                    icon={Users}
                    label="Teachers"
                  />
                  <NavItem
                    href="/admin/attendance"
                    icon={BarChart}
                    label="Student Attendance"
                  />
                  <NavItem
                    href="/admin/teacher-attendance"
                    icon={ClipboardCheck}
                    label="Teacher Attendance"
                  />
                  <NavItem
                    href="/admin/reports"
                    icon={BookOpen}
                    label="Reports"
                  />
                  <NavItem
                    href="/admin/report-card"
                    icon={BookOpen}
                    label="Report Card"
                  />
                  <NavItem
                    href="/admin/timetable"
                    icon={CalendarDays}
                    label="Timetable"
                  />
                  <NavItem
                    href="/admin/settings"
                    icon={Settings}
                    label="Settings"
                  />
                  {!isFreePlan && (
                    <NavItem
                      href="/admin/billing"
                      icon={CreditCard}
                      label="Billing"
                    />
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {subscriptionGate ? (
                <NavItem
                  href="/admin/billing"
                  icon={CreditCard}
                  label="Billing"
                />
              ) : (
                <>
                  <NavItem href="/" icon={LayoutDashboard} label="Dashboard" />
                  <NavItem
                    href="/teacher/my-attendance"
                    icon={ClipboardCheck}
                    label="My Attendance"
                  />
                  <NavItem
                    href="/teacher/attendance"
                    icon={Users}
                    label="Student Attendance"
                  />
                  <NavItem
                    href="/teacher/assessment"
                    icon={BookOpen}
                    label="Assessment"
                  />
                </>
              )}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-[#0B4A82] bg-[#0B4A82]">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 rounded-full bg-[#1160A8] border-2 border-[#E6F0FA] flex items-center justify-center text-sm font-bold shadow-lg text-white">
              {user?.fullName.charAt(0)}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-white truncate max-w-[160px]">
                {user?.fullName}
              </p>
              <p className="text-xs text-[#E6F0FA] capitalize">
                {user?.role === UserRole.SUPER_ADMIN
                  ? "Super Admin"
                  : user?.role === UserRole.SCHOOL_ADMIN
                    ? "School Admin"
                    : "Teacher"}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center px-4 py-2 text-sm text-[#E6F0FA] hover:text-white hover:bg-[#1160A8] rounded-md transition-colors"
          >
            <LogOut size={16} className="mr-2" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <header className="bg-white shadow-sm h-14 sm:h-16 flex items-center z-10 border-b border-[#E6F0FA]">
          <div className="mx-auto w-full max-w-[1200px] 2xl:max-w-[1400px] px-3 sm:px-4 md:px-8 flex items-center justify-between gap-3">
            <div className="flex items-center min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 -ml-2 text-[#0B4A82] hover:text-[#1160A8]"
              >
                <Menu size={24} />
              </button>
              <h2 className="text-base sm:text-xl font-bold text-[#0B4A82] ml-2 md:ml-0 truncate">
                {title}
              </h2>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Notification Bell - FOR ADMIN AND SUPER ADMIN */}
              {(isAdmin || isSuperAdmin) && (
                <div className="relative">
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className={`relative p-2 transition-colors ${showNotifications ? "text-[#0B4A82] bg-[#E6F0FA] rounded-full" : "text-slate-400 hover:text-[#0B4A82]"}`}
                  >
                    <Bell size={20} />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#1160A8] rounded-full border-2 border-white"></span>
                    )}
                  </button>

                  {/* Dropdown */}
                  {showNotifications && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowNotifications(false)}
                      ></div>
                      <div className="fixed right-3 sm:right-4 top-14 sm:top-16 w-[90vw] max-w-[22rem] sm:w-96 bg-white bg-opacity-100 rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                        <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                          <h4 className="font-bold text-slate-800 text-sm">
                            Notifications
                          </h4>
                          <span className="text-xs text-slate-500">
                            {unreadCount} unread
                          </span>
                        </div>
                        <div className="max-h-80 overflow-y-auto bg-white">
                          {notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-sm">
                              No new activity.
                            </div>
                          ) : (
                            notifications.map((n) => (
                              <div
                                key={n.id}
                                className={`p-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${n.isRead ? "bg-slate-50" : "bg-white border-l-4 border-l-[#1160A8]"}`}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex-1">
                                    <p
                                      className={`text-sm leading-snug mb-1 ${n.isRead ? "text-slate-500" : "text-slate-800 font-medium"}`}
                                    >
                                      {n.message}
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${n.isRead ? "bg-slate-200 text-slate-500" : "bg-[#E6F0FA] text-[#0B4A82]"}`}
                                      >
                                        {n.isRead ? "Read" : "Unread"}
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        {new Date(n.createdAt).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {!n.isRead && (
                                      <button
                                        onClick={(e) => handleMarkRead(n.id, e)}
                                        className="text-emerald-500 hover:text-emerald-700 p-1 hover:bg-emerald-50 rounded transition-colors shrink-0"
                                        title="Mark as read"
                                      >
                                        <Check size={16} />
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) =>
                                        handleDeleteNotification(n.id, e)
                                      }
                                      className="text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors shrink-0"
                                      title="Delete notification"
                                    >
                                      <X size={16} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="h-6 w-px bg-slate-200 mx-2 hidden sm:block"></div>

              <div className="text-sm text-slate-500 hidden sm:block font-medium">
                {new Date().toLocaleDateString("en-GB", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            </div>
          </div>
        </header>

        {subscriptionGate && !isBillingRoute && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4">
            <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="absolute -top-10 right-6 h-16 w-16 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg">
                <Lock size={28} />
              </div>
              <div className="flex flex-col gap-4 pt-6">
                {isAdmin ? (
                  <>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-rose-500">
                        Subscription expired
                      </p>
                      <h2 className="text-2xl font-bold text-slate-900 mt-1">
                        Access paused until renewal
                      </h2>
                      <p className="text-sm text-slate-600 mt-2">
                        Your one-week grace period ended on{" "}
                        <span className="font-semibold text-slate-800">
                          {subscriptionGate.graceEndsAt.toLocaleDateString()}
                        </span>
                        . Renew now to restore access for your team.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <Link
                        to="/admin/billing"
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0B4A82] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1160A8]"
                      >
                        <CreditCard size={16} />
                        Renew Subscription
                      </Link>
                      <span className="text-xs text-slate-500">
                        Need help? Contact your super admin.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-rose-500">
                        Subscription expired
                      </p>
                      <h2 className="text-2xl font-bold text-slate-900 mt-1">
                        Access temporarily paused
                      </h2>
                      <p className="text-sm text-slate-600 mt-2">
                        Your school’s subscription grace period ended on{" "}
                        <span className="font-semibold text-slate-800">
                          {subscriptionGate.graceEndsAt.toLocaleDateString()}
                        </span>
                        . Please contact your school admin to renew and restore
                        access.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <span className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">
                        Waiting for admin renewal
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-8">
          <div className="mx-auto w-full max-w-[1200px] 2xl:max-w-[1400px]">
            {children}
          </div>
        </main>
        <Toast />
      </div>
    </div>
  );
};

export default Layout;
