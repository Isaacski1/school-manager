import React, { useEffect, useMemo, useState } from "react";
import {
  Timestamp,
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import Layout from "../../components/Layout";
import { firestore } from "../../services/firebase";
import { showToast } from "../../services/toast";
import { User, UserRole } from "../../types";

const formatDate = (value?: Date | Timestamp | number | string | null) => {
  if (!value) return "—";
  if (value instanceof Date) return value.toLocaleDateString();
  if (value instanceof Timestamp) return value.toDate().toLocaleDateString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
};

const roleLabel = (role?: UserRole | string) => {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return "Super Admin";
    case UserRole.SCHOOL_ADMIN:
      return "School Admin";
    case UserRole.TEACHER:
      return "Teacher";
    default:
      return role || "—";
  }
};

const SuperAdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      try {
        const snapshot = await getDocs(
          query(collection(firestore, "users"), orderBy("createdAt", "desc")),
        );
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<User, "id">),
        }));
        setUsers(data);
      } catch (error: any) {
        console.error("Failed to load users", error);
        showToast(error?.message || "Failed to load users.", { type: "error" });
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const scoped = users.filter((user) => user.role !== UserRole.SUPER_ADMIN);
    if (!term) return scoped;
    return scoped.filter((user) =>
      [user.fullName, user.email, user.schoolId, user.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [search, users]);

  return (
    <Layout title="Users">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Users</h1>
              <p className="text-slate-600">
                Manage all platform users and review their status.
              </p>
            </div>
            <div className="w-full sm:w-72">
              <label className="sr-only" htmlFor="users-search">
                Search users
              </label>
              <input
                id="users-search"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, role..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              {loading
                ? "Loading users..."
                : `${filteredUsers.length} user${
                    filteredUsers.length === 1 ? "" : "s"
                  } found`}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">School</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-6 py-6 text-slate-500" colSpan={6}>
                      Loading users...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td className="px-6 py-6 text-slate-500" colSpan={6}>
                      No users match your search.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {user.fullName || "—"}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {user.email || "—"}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {roleLabel(user.role)}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {user.schoolId || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                            user.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {user.status || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {formatDate(user.lastLoginAt || user.lastLogin)}
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

export default SuperAdminUsers;
