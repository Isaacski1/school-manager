import React, { useEffect, useMemo, useState } from "react";
import Layout from "../../../components/Layout";
import { firestore } from "../../../services/firebase";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { SecurityLoginLog } from "../../../types";

const LoginHistory: React.FC = () => {
  const [logs, setLogs] = useState<SecurityLoginLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(firestore, "securityLoginLogs"),
          orderBy("timestamp", "desc"),
          limit(200),
        );
        const snap = await getDocs(q);
        setLogs(
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as SecurityLoginLog),
          })),
        );
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesRole = !roleFilter || log.role === roleFilter;
      const matchesStatus = !statusFilter || log.status === statusFilter;
      const matchesSearch = !term
        ? true
        : [log.email, log.name, log.schoolName]
            .filter(Boolean)
            .some((val) => String(val).toLowerCase().includes(term));
      return matchesRole && matchesStatus && matchesSearch;
    });
  }, [logs, roleFilter, search, statusFilter]);

  return (
    <Layout title="Login History">
      <div className="p-6 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Login History</h1>
          <p className="text-slate-600">
            Platform-wide login activity across all schools.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            className="border border-slate-300 rounded-lg px-3 py-2"
            placeholder="Search by email/name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border border-slate-300 rounded-lg px-3 py-2"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="school_admin">School Admin</option>
            <option value="teacher">Teacher</option>
          </select>
          <select
            className="border border-slate-300 rounded-lg px-3 py-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">School</th>
                  <th className="px-6 py-4">IP</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-6 py-6" colSpan={6}>
                      Loading logs...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="px-6 py-6" colSpan={6}>
                      No logs found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((log) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4">
                        <div className="text-slate-900 font-medium">
                          {log.name || "Unknown"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {log.email}
                        </div>
                      </td>
                      <td className="px-6 py-4">{log.role || "—"}</td>
                      <td className="px-6 py-4">{log.schoolName || "—"}</td>
                      <td className="px-6 py-4">
                        {log.ipAddress
                          ? log.ipAddress.replace(/\d+$/, "***")
                          : "—"}
                      </td>
                      <td className="px-6 py-4">{log.status}</td>
                      <td className="px-6 py-4">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default LoginHistory;
