import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { showToast } from "../../services/toast";
import { firestore } from "../../services/firebase";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  getCountFromServer,
  writeBatch,
} from "firebase/firestore";
import { PlanConfig, School } from "../../types";
import { useAuth } from "../../context/AuthContext";
import {
  createOrUpdatePlan,
  createSchool,
  updateSchoolPlan,
} from "../../services/backendApi";
import {
  Plus,
  Building,
  Eye,
  ToggleLeft,
  ToggleRight,
  MoreHorizontal,
  X,
  Save,
  Trash2,
} from "lucide-react";

const Schools = () => {
  const { user } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    logoUrl: "",
    plan: "trial" as "free" | "trial" | "monthly" | "termly" | "yearly",
  });
  const [cloneFromTemplate, setCloneFromTemplate] = useState(false);
  const [templateType, setTemplateType] = useState<"default" | "school">(
    "default",
  );
  const [templateSchoolId, setTemplateSchoolId] = useState("");
  const [planId, setPlanId] = useState("");
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>(
    {},
  );
  const [planForm, setPlanForm] = useState<{
    id: string;
    name: string;
    maxStudents: number;
  }>({ id: "starter", name: "Starter", maxStudents: 0 });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [schoolToDelete, setSchoolToDelete] = useState<School | null>(null);
  const [isCreatingSchool, setIsCreatingSchool] = useState(false);
  const [isDeletingSchool, setIsDeletingSchool] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [logoZoom, setLogoZoom] = useState(1);
  const [logoOffset, setLogoOffset] = useState({ x: 0, y: 0 });
  const [logoNatural, setLogoNatural] = useState({ width: 0, height: 0 });
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  const CROP_PREVIEW_SIZE = 180;
  const OUTPUT_SIZE = 512;
  const MAX_OFFSET = CROP_PREVIEW_SIZE / 2;

  const formatCreatedAt = (createdAt: School["createdAt"] | undefined) => {
    if (!createdAt) return "N/A";
    const value = createdAt as any;
    const date =
      value instanceof Date
        ? value
        : typeof value?.toDate === "function"
          ? value.toDate()
          : typeof value === "string" || typeof value === "number"
            ? new Date(value)
            : null;
    if (!date || Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString();
  };

  const loadPlans = async () => {
    setPlansLoading(true);
    try {
      const plansSnap = await getDocs(collection(firestore, "plans"));
      const planData = plansSnap.docs.map(
        (docSnap) =>
          ({ id: docSnap.id, ...(docSnap.data() as any) }) as PlanConfig,
      );
      setPlans(planData);
    } catch (error: any) {
      console.error("Failed to load plans", error);
      showToast("Failed to load plan configurations.", { type: "error" });
    } finally {
      setPlansLoading(false);
    }
  };

  useEffect(() => {
    const schoolsRef = collection(firestore, "schools");
    const unsubscribe = onSnapshot(schoolsRef, (snapshot) => {
      const schoolsData = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as School,
      );
      setSchools(schoolsData);
      setLoading(false);
    });

    loadPlans();

    return unsubscribe;
  }, []);

  useEffect(() => {
    const loadCounts = async () => {
      if (!schools.length) {
        setStudentCounts({});
        return;
      }
      try {
        const entries = await Promise.all(
          schools.map(async (school) => {
            const snap = await getCountFromServer(
              query(
                collection(firestore, "students"),
                where("schoolId", "==", school.id),
              ),
            );
            return [school.id, snap.data().count] as const;
          }),
        );
        setStudentCounts(Object.fromEntries(entries));
      } catch (error) {
        console.error("Failed to load student counts", error);
      }
    };

    loadCounts();
  }, [schools]);

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const getCroppedLogoDataUrl = () => {
      if (!logoPreview || !logoImgRef.current) return "";

      const image = logoImgRef.current;
      const naturalWidth = logoNatural.width || image.naturalWidth || 1;
      const naturalHeight = logoNatural.height || image.naturalHeight || 1;
      const baseScale = Math.max(
        CROP_PREVIEW_SIZE / naturalWidth,
        CROP_PREVIEW_SIZE / naturalHeight,
      );
      const scaleOut = baseScale * logoZoom * (OUTPUT_SIZE / CROP_PREVIEW_SIZE);
      const offsetOutX = logoOffset.x * (OUTPUT_SIZE / CROP_PREVIEW_SIZE);
      const offsetOutY = logoOffset.y * (OUTPUT_SIZE / CROP_PREVIEW_SIZE);

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");

      if (!ctx) return "";

      const drawWidth = naturalWidth * scaleOut;
      const drawHeight = naturalHeight * scaleOut;
      const drawX = OUTPUT_SIZE / 2 - drawWidth / 2 + offsetOutX;
      const drawY = OUTPUT_SIZE / 2 - drawHeight / 2 + offsetOutY;

      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      return canvas.toDataURL("image/png");
    };

    setIsCreatingSchool(true);
    try {
      const croppedLogo = getCroppedLogoDataUrl();
      await createSchool({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        logoUrl: croppedLogo || "",
        plan: formData.plan,
        cloneFromTemplate,
        templateType,
        templateSchoolId:
          templateType === "school" ? templateSchoolId : undefined,
        planId: planId || undefined,
      });

      setFormData({
        name: "",
        phone: "",
        address: "",
        logoUrl: "",
        plan: "trial",
      });
      setCloneFromTemplate(false);
      setTemplateType("default");
      setTemplateSchoolId("");
      setPlanId("");
      setLogoPreview("");
      setLogoZoom(1);
      setLogoOffset({ x: 0, y: 0 });
      setLogoNatural({ width: 0, height: 0 });
      setShowCreateModal(false);
      showToast("School created successfully!", { type: "success" });
    } catch (error: any) {
      console.error("Error creating school:", error);
      showToast(error.message || "Failed to create school", { type: "error" });
    } finally {
      setIsCreatingSchool(false);
    }
  };

  const handleLogoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setLogoPreview("");
      setLogoNatural({ width: 0, height: 0 });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(reader.result as string);
      setLogoZoom(1);
      setLogoOffset({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const toggleSchoolStatus = async (
    schoolId: string,
    currentStatus: "active" | "inactive",
  ) => {
    try {
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      await updateDoc(doc(firestore, "schools", schoolId), {
        status: newStatus,
      });
      showToast(
        `School ${newStatus === "active" ? "activated" : "deactivated"}`,
        { type: "success" },
      );
    } catch (error) {
      console.error("Error updating school status:", error);
      showToast("Failed to update school status", { type: "error" });
    }
  };

  const performDeleteSchool = async () => {
    if (!schoolToDelete) return;

    try {
      setIsDeletingSchool(true);
      const schoolId = schoolToDelete.id;
      const batchSize = 400; // Stay under 500 limit

      // 1. Find and delete all users associated with this school
      const usersSnapshot = await getDocs(
        query(
          collection(firestore, "users"),
          where("schoolId", "==", schoolId),
        ),
      );

      let deletedUsers = 0;
      const userBatches = [];

      // Group users into batches for deletion
      for (let i = 0; i < usersSnapshot.docs.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const batchUsers = usersSnapshot.docs.slice(i, i + batchSize);

        for (const userDoc of batchUsers) {
          batch.delete(doc(firestore, "users", userDoc.id));
        }

        userBatches.push(batch.commit());
        deletedUsers += batchUsers.length;
      }

      // Execute user deletions
      if (userBatches.length > 0) {
        await Promise.all(userBatches);
        console.log(`Deleted ${deletedUsers} user documents`);
      }

      // 2. Delete school-scoped collections
      const collectionsToDelete = [
        "students",
        "classes",
        "attendance",
        "assessments",
        "teacher_attendance",
        "notices",
        "student_remarks",
        "student_skills",
        "admin_remarks",
        "admin_notifications",
        "timetables",
        "class_subjects",
        "settings", // Special case
      ];

      let totalDocsDeleted = 0;

      for (const collectionName of collectionsToDelete) {
        if (collectionName === "settings") {
          // Settings is stored as settings/{schoolId}
          try {
            await deleteDoc(doc(firestore, "settings", schoolId));
            totalDocsDeleted += 1;
          } catch (error) {
            // Document might not exist, continue
            console.log(
              `Settings document ${schoolId} not found or already deleted`,
            );
          }
        } else {
          // Query documents where schoolId == schoolId
          const q = query(
            collection(firestore, collectionName),
            where("schoolId", "==", schoolId),
          );
          const snapshot = await getDocs(q);
          const docIds = snapshot.docs.map((doc) => doc.id);

          if (docIds.length > 0) {
            // Delete in batches
            for (let i = 0; i < docIds.length; i += batchSize) {
              const batch = writeBatch(firestore);
              const batchDocIds = docIds.slice(i, i + batchSize);

              for (const docId of batchDocIds) {
                batch.delete(doc(firestore, collectionName, docId));
              }

              await batch.commit();
              totalDocsDeleted += batchDocIds.length;
            }
          }
        }
      }

      // 3. Finally, delete the school document itself
      await deleteDoc(doc(firestore, "schools", schoolId));

      showToast(
        `School deleted successfully! Removed ${deletedUsers} users and ${totalDocsDeleted} data records.`,
        { type: "success" },
      );
      setShowDeleteModal(false);
      setSchoolToDelete(null);
    } catch (error: any) {
      console.error("Error deleting school:", error);
      showToast(error.message || "Failed to delete school", { type: "error" });
    } finally {
      setIsDeletingSchool(false);
    }
  };

  const openDeleteModal = (school: School) => {
    setSchoolToDelete(school);
    setShowDeleteModal(true);
  };

  const handleSavePlan = async () => {
    if (!planForm.id || !planForm.name) return;
    try {
      await createOrUpdatePlan({
        id: planForm.id,
        name: planForm.name,
        maxStudents: Number(planForm.maxStudents),
      });
      showToast("Plan saved successfully.", { type: "success" });
      await loadPlans();
    } catch (error: any) {
      console.error("Plan save failed", error);
      showToast(error?.message || "Failed to save plan.", { type: "error" });
    }
  };

  const handleAssignPlan = async (schoolId: string, nextPlanId: string) => {
    if (!nextPlanId) return;
    try {
      await updateSchoolPlan({ schoolId, planId: nextPlanId });
      showToast("Plan assigned successfully.", { type: "success" });
    } catch (error: any) {
      console.error("Plan assignment failed", error);
      showToast(error?.message || "Failed to assign plan.", { type: "error" });
    }
  };

  const resolvePlanName = (school: School) => {
    const planKey = school.subscription?.planId;
    const match = plans.find((p) => p.id === planKey);
    return match?.name || school.plan || "—";
  };

  const resolvePlanLimit = (school: School) => {
    const planKey = school.subscription?.planId;
    const match = plans.find((p) => p.id === planKey);
    return match?.maxStudents ?? school.limits?.maxStudents ?? 0;
  };

  const resolveUsageStatus = (used: number, limit: number) => {
    if (!limit) return { label: "N/A", color: "bg-slate-100 text-slate-600" };
    const ratio = used / Math.max(limit, 1);
    if (ratio >= 1)
      return { label: "Limit reached", color: "bg-red-100 text-red-700" };
    if (ratio >= 0.9)
      return { label: "Near limit", color: "bg-amber-100 text-amber-700" };
    return { label: "OK", color: "bg-emerald-100 text-emerald-700" };
  };

  if (loading) {
    return (
      <Layout title="Schools">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B4A82]"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Schools">
      <div className="p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Schools Management
            </h1>
            <p className="text-slate-500 mt-1">
              Manage all schools in the system
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowPlanModal(true)}
              className="flex items-center px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Manage Plans
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center px-4 py-2 bg-[#0B4A82] text-white rounded-lg hover:bg-[#0B4A82] transition-colors"
            >
              <Plus size={18} className="mr-2" />
              Create School
            </button>
          </div>
        </div>

        {/* Schools Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Code</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Plan</th>
                  <th className="px-6 py-4">Students Used</th>
                  <th className="px-6 py-4">Limit Status</th>
                  <th className="px-6 py-4">Created</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schools.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-8 text-center text-slate-400"
                    >
                      No schools created yet.
                    </td>
                  </tr>
                ) : (
                  schools.map((school) => (
                    <tr key={school.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-800 flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center overflow-hidden">
                          {school.logoUrl ? (
                            <img
                              src={school.logoUrl}
                              alt={school.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Building size={16} className="text-slate-600" />
                          )}
                        </div>
                        {school.name}
                      </td>
                      <td className="px-6 py-4 font-mono text-sm">
                        {school.code}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            school.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {school.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                            {resolvePlanName(school)}
                          </span>
                          <select
                            className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white"
                            value={school.subscription?.planId || ""}
                            onChange={(e) =>
                              handleAssignPlan(school.id, e.target.value)
                            }
                          >
                            <option value="">Select plan</option>
                            {plans.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {`${
                          school.studentsCount ?? studentCounts[school.id] ?? 0
                        }/${resolvePlanLimit(school) || "—"}`}
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const used = Number(school.studentsCount || 0);
                          const limit = Number(resolvePlanLimit(school) || 0);
                          const status = resolveUsageStatus(used, limit);
                          return (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${status.color}`}
                            >
                              {status.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        {formatCreatedAt(school.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() =>
                              toggleSchoolStatus(school.id, school.status)
                            }
                            className={`p-1 rounded transition-colors ${
                              school.status === "active"
                                ? "text-[#1160A8] hover:bg-[#E6F0FA]"
                                : "text-emerald-600 hover:bg-emerald-50"
                            }`}
                            title={
                              school.status === "active"
                                ? "Deactivate"
                                : "Activate"
                            }
                          >
                            {school.status === "active" ? (
                              <ToggleRight size={18} />
                            ) : (
                              <ToggleLeft size={18} />
                            )}
                          </button>
                          <Link
                            to={`/super-admin/schools/${school.id}`}
                            className="p-1 text-slate-600 hover:bg-slate-50 rounded transition-colors"
                            title="View Details"
                          >
                            <Eye size={18} />
                          </Link>
                          <button
                            onClick={() => openDeleteModal(school)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete School"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create School Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900">
                Create New School
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSchool} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  School Name
                </label>
                <input
                  type="text"
                  required
                  disabled={isCreatingSchool}
                  className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Enter school name"
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    disabled={isCreatingSchool}
                    className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="School phone number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Address
                  </label>
                  <input
                    type="text"
                    disabled={isCreatingSchool}
                    className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    placeholder="School address"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Logo Upload (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  disabled={isCreatingSchool}
                  className="w-full border border-slate-300 p-3 rounded-lg bg-white focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                  onChange={handleLogoFileChange}
                />

                {logoPreview && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Crop to square</span>
                      <span>{Math.round(logoZoom * 100)}%</span>
                    </div>

                    <div
                      className="rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden"
                      style={{
                        width: CROP_PREVIEW_SIZE,
                        height: CROP_PREVIEW_SIZE,
                      }}
                    >
                      <img
                        ref={logoImgRef}
                        src={logoPreview}
                        alt="Logo preview"
                        onLoad={(event) => {
                          const img = event.currentTarget;
                          setLogoNatural({
                            width: img.naturalWidth,
                            height: img.naturalHeight,
                          });
                        }}
                        style={{
                          width: logoNatural.width
                            ? `${
                                Math.max(
                                  CROP_PREVIEW_SIZE,
                                  (CROP_PREVIEW_SIZE / logoNatural.height) *
                                    logoNatural.width,
                                ) * logoZoom
                              }px`
                            : "auto",
                          height: logoNatural.height
                            ? `${
                                Math.max(
                                  CROP_PREVIEW_SIZE,
                                  (CROP_PREVIEW_SIZE / logoNatural.width) *
                                    logoNatural.height,
                                ) * logoZoom
                              }px`
                            : "auto",
                          transform: `translate(${logoOffset.x}px, ${logoOffset.y}px)`,
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-600">
                        Zoom
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.05}
                        value={logoZoom}
                        onChange={(event) =>
                          setLogoZoom(parseFloat(event.target.value))
                        }
                        className="w-full"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">
                          Move X
                        </label>
                        <input
                          type="range"
                          min={-MAX_OFFSET}
                          max={MAX_OFFSET}
                          value={logoOffset.x}
                          onChange={(event) =>
                            setLogoOffset((prev) => ({
                              ...prev,
                              x: parseFloat(event.target.value),
                            }))
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600">
                          Move Y
                        </label>
                        <input
                          type="range"
                          min={-MAX_OFFSET}
                          max={MAX_OFFSET}
                          value={logoOffset.y}
                          onChange={(event) =>
                            setLogoOffset((prev) => ({
                              ...prev,
                              y: parseFloat(event.target.value),
                            }))
                          }
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Plan
                </label>
                <select
                  disabled={isCreatingSchool}
                  className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                  value={formData.plan}
                  onChange={(e) =>
                    setFormData({ ...formData, plan: e.target.value as any })
                  }
                >
                  <option value="free">Free (No Billing)</option>
                  <option value="trial">Trial</option>
                  <option value="monthly">Monthly</option>
                  <option value="termly">Termly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Subscription Plan (Limits)
                </label>
                <select
                  disabled={isCreatingSchool || plansLoading}
                  className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                >
                  <option value="">Select plan (optional)</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
                {planId && (
                  <p className="text-xs text-slate-500 mt-2">
                    Plan limit:{" "}
                    {plans.find((plan) => plan.id === planId)?.maxStudents ?? 0}{" "}
                    students
                  </p>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">
                      Clone from Template
                    </h4>
                    <p className="text-xs text-slate-500">
                      Copy settings from a template or an existing school.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCloneFromTemplate((prev) => !prev)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      cloneFromTemplate ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                    aria-pressed={cloneFromTemplate}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        cloneFromTemplate ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                {cloneFromTemplate && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Template Type
                      </label>
                      <select
                        className="w-full border border-slate-300 p-2 rounded-lg text-sm"
                        value={templateType}
                        onChange={(e) =>
                          setTemplateType(
                            e.target.value as "default" | "school",
                          )
                        }
                      >
                        <option value="default">Default Template</option>
                        <option value="school">Existing School</option>
                      </select>
                    </div>
                    {templateType === "school" && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Select School Template
                        </label>
                        <select
                          className="w-full border border-slate-300 p-2 rounded-lg text-sm"
                          value={templateSchoolId}
                          onChange={(e) => setTemplateSchoolId(e.target.value)}
                        >
                          <option value="">Choose a school</option>
                          {schools.map((school) => (
                            <option key={school.id} value={school.id}>
                              {school.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isCreatingSchool}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSchool}
                  className="flex items-center px-4 py-2 bg-[#0B4A82] text-white rounded-lg hover:bg-[#0B4A82] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingSchool ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save size={18} className="mr-2" />
                      Create School
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Loading Animation Overlay */}
            {isCreatingSchool && (
              <div className="absolute inset-0 bg-white bg-opacity-95 flex items-center justify-center">
                <div className="text-center">
                  {/* Animated Building Icon */}
                  <div className="relative mb-4">
                    <div className="w-16 h-16 mx-auto">
                      <Building
                        size={64}
                        className="text-[#0B4A82] animate-pulse"
                      />
                    </div>
                    {/* Floating particles animation */}
                    <div className="absolute top-2 left-2 w-2 h-2 bg-[#1160A8] rounded-full animate-bounce"></div>
                    <div className="absolute top-4 right-3 w-1.5 h-1.5 bg-[#E6F0FA] rounded-full animate-ping"></div>
                    <div className="absolute bottom-2 left-4 w-1 h-1 bg-[#0B4A82] rounded-full animate-pulse"></div>
                  </div>

                  {/* Animated text */}
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-800 animate-pulse">
                      Creating Your School
                    </h3>
                    <p className="text-sm text-slate-600 animate-pulse delay-100">
                      Setting up everything perfectly...
                    </p>
                  </div>

                  {/* Progress dots animation */}
                  <div className="flex justify-center space-x-1 mt-4">
                    <div className="w-2 h-2 bg-[#1160A8] rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-[#1160A8] rounded-full animate-bounce delay-75"></div>
                    <div className="w-2 h-2 bg-[#1160A8] rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Plan Management Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900">
                Plan Configuration
              </h3>
              <button
                onClick={() => setShowPlanModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Plan Key
                  </label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none"
                    value={planForm.id}
                    onChange={(e) =>
                      setPlanForm((prev) => ({ ...prev, id: e.target.value }))
                    }
                    placeholder="starter"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Plan Name
                  </label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none"
                    value={planForm.name}
                    onChange={(e) =>
                      setPlanForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Starter"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Max Students
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none"
                    value={planForm.maxStudents}
                    onChange={(e) =>
                      setPlanForm((prev) => ({
                        ...prev,
                        maxStudents: Number(e.target.value),
                      }))
                    }
                    placeholder="200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSavePlan}
                  className="flex items-center px-4 py-2 bg-[#0B4A82] text-white rounded-lg hover:bg-[#0B4A82] transition-colors"
                >
                  <Save size={18} className="mr-2" />
                  Save Plan
                </button>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">
                  Existing Plans
                </h4>
                <div className="space-y-2">
                  {plans.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      {plansLoading
                        ? "Loading plans..."
                        : "No plans created yet."}
                    </p>
                  ) : (
                    plans.map((plan) => (
                      <div
                        key={plan.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {plan.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            Key: {plan.id} · Max Students: {plan.maxStudents}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setPlanForm({
                              id: plan.id,
                              name: plan.name,
                              maxStudents: plan.maxStudents,
                            })
                          }
                          className="text-xs text-[#1160A8] hover:underline"
                        >
                          Edit
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete School Modal */}
      {showDeleteModal && schoolToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900">
                Delete School
              </h3>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingSchool}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg
                      className="w-5 h-5 text-red-400"
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
                  <div>
                    <h4 className="text-sm font-medium text-red-800">
                      Are you sure you want to delete this school?
                    </h4>
                    <p className="text-sm text-red-700 mt-1">
                      This action cannot be undone. All associated data
                      including students, teachers, admin accounts, and all
                      school records will be permanently removed from the
                      system.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                    <Building size={20} className="text-slate-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      {schoolToDelete.name}
                    </p>
                    <p className="text-sm text-slate-500">
                      Code: {schoolToDelete.code}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingSchool}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={performDeleteSchool}
                disabled={isDeletingSchool}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingSchool ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Deleting...
                  </>
                ) : (
                  "Delete School"
                )}
              </button>
            </div>

            {isDeletingSchool && (
              <div className="absolute inset-0 bg-white bg-opacity-95 flex items-center justify-center">
                <div className="text-center">
                  <div className="relative mb-4">
                    <div className="w-16 h-16 mx-auto">
                      <Trash2
                        size={64}
                        className="text-red-600 animate-pulse"
                      />
                    </div>
                    <div className="absolute top-2 left-2 w-2 h-2 bg-red-400 rounded-full animate-bounce"></div>
                    <div className="absolute top-4 right-3 w-1.5 h-1.5 bg-red-300 rounded-full animate-ping"></div>
                    <div className="absolute bottom-2 left-4 w-1 h-1 bg-red-500 rounded-full animate-pulse"></div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-800 animate-pulse">
                      Deleting School
                    </h3>
                    <p className="text-sm text-slate-600 animate-pulse delay-100">
                      Removing associated data safely...
                    </p>
                  </div>

                  <div className="flex justify-center space-x-1 mt-4">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce delay-75"></div>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Schools;
