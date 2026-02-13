import React, { useEffect, useMemo, useState } from "react";
import Layout from "../../../components/Layout";
import { firestore } from "../../../services/firebase";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { AuditLog } from "../../../types";

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(firestore, "auditLogs"),
            orderBy("timestamp", "desc"),
            limit(200),
          ),
        );
        setLogs(
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as AuditLog),
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
    if (!term) return logs;
    return logs.filter((log) =>
      [log.actionType, log.actorId, log.targetId, log.schoolId]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(term)),
    );
  }, [logs, search]);

  return (
    <Layout title="Audit Logs">
      <div className="p-6 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
          <p className="text-slate-600">
            Track platform-wide administrative actions.
          </p>
        </div>

        <input
          className="border border-slate-300 rounded-lg px-3 py-2 w-full"
          placeholder="Search by action, actor, target..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold">
                <tr>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Actor</th>
                  <th className="px-6 py-4">Target</th>
                  <th className="px-6 py-4">School</th>
                  <th className="px-6 py-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-6 py-6" colSpan={5}>
                      Loading logs...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="px-6 py-6" colSpan={5}>
                      No audit logs found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((log) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {log.actionType}
                      </td>
                      <td className="px-6 py-4">{log.actorId}</td>
                      <td className="px-6 py-4">
                        {log.targetType} {log.targetId || ""}
                      </td>
                      <td className="px-6 py-4">{log.schoolId || "—"}</td>
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

export default AuditLogs;
