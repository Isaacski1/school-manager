import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { UserRole } from "../types";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  CloudOff,
  Database,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

const useOnlineStatus = () => {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
};

const OfflineAccess: React.FC = () => {
  const { user } = useAuth();
  const online = useOnlineStatus();

  const quickActions = useMemo(() => {
    if (user?.role === UserRole.TEACHER) {
      return [
        {
          label: "Student Attendance",
          to: "/teacher/attendance",
          icon: <ClipboardCheck className="h-5 w-5" />,
          description: "Use cached class lists and queue attendance saves.",
        },
        {
          label: "My Attendance",
          to: "/teacher/my-attendance",
          icon: <ShieldCheck className="h-5 w-5" />,
          description: "Submit staff attendance for sync when data returns.",
        },
        {
          label: "Teacher Dashboard",
          to: "/teacher",
          icon: <LayoutDashboard className="h-5 w-5" />,
          description: "Open the cached teacher workspace.",
        },
      ];
    }

    if (user?.role === UserRole.SCHOOL_ADMIN) {
      return [
        {
          label: "Dashboard",
          to: "/admin",
          icon: <LayoutDashboard className="h-5 w-5" />,
          description: "Review the last cached school snapshot.",
        },
        {
          label: "Students",
          to: "/admin/students",
          icon: <Database className="h-5 w-5" />,
          description: "Open cached student records when available.",
        },
        {
          label: "Attendance",
          to: "/admin/attendance",
          icon: <ClipboardCheck className="h-5 w-5" />,
          description: "Review cached attendance statistics.",
        },
      ];
    }

    return [
      {
        label: "Dashboard",
        to: user?.role === UserRole.PARENT ? "/parent" : "/",
        icon: <LayoutDashboard className="h-5 w-5" />,
        description: "Return to the cached workspace.",
      },
    ];
  }, [user?.role]);

  return (
    <Layout title="Offline Access">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-6 sm:p-8">
              <div
                className={`mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
                  online
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {online ? (
                  <Cloud className="h-4 w-4" />
                ) : (
                  <CloudOff className="h-4 w-4" />
                )}
                {online ? "Online" : "Offline"}
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Offline Workspace
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Staff who already opened the app on this device can keep using
                cached school data. Attendance updates are saved locally by
                Firebase and sync automatically after the device reconnects.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <CheckCircle2 className="mb-3 h-5 w-5 text-emerald-600" />
                  <p className="text-sm font-bold text-slate-900">
                    Cached Login
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Works after a previous successful login on this browser.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <RefreshCw className="mb-3 h-5 w-5 text-blue-600" />
                  <p className="text-sm font-bold text-slate-900">
                    Auto Sync
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Pending Firestore writes are sent when data is restored.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <AlertTriangle className="mb-3 h-5 w-5 text-amber-600" />
                  <p className="text-sm font-bold text-slate-900">
                    First Login
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    New sign-ins still need internet for account verification.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-[#0B4A82] p-6 text-white lg:border-l lg:border-t-0 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-wider text-blue-100">
                Current User
              </p>
              <h2 className="mt-3 text-2xl font-bold">
                {user?.fullName || "Signed-in user"}
              </h2>
              <p className="mt-1 text-sm capitalize text-blue-100">
                {(user?.role || "user").replace("_", " ")}
              </p>
              <div className="mt-6 rounded-xl border border-white/15 bg-white/10 p-4 text-sm leading-6 text-blue-50">
                Keep this browser signed in on school devices that need offline
                attendance. Avoid signing out before the school day starts.
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Quick Access</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {online ? "Live data available" : "Cached data only"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {quickActions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#0B4A82]/30 hover:shadow-md"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#0B4A82] transition group-hover:bg-[#0B4A82] group-hover:text-white">
                  {action.icon}
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {action.label}
                </h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {action.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default OfflineAccess;
