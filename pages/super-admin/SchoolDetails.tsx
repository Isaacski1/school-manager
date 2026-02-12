import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { showToast } from "../../services/toast";
import { firestore } from "../../services/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { School, User, UserRole } from "../../types";
import {
  createSchoolAdmin,
  resetSchoolAdminPassword,
} from "../../services/backendApi";
import { deleteSchool } from "../../services/functions";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Eye,
  EyeOff,
  FileText,
  Globe,
  MapPin,
  Phone,
  Save,
  ShieldAlert,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

type SchoolFormState = {
  name: string;
  code: string;
  phone: string;
  address: string;
  logoUrl: string;
  status: "active" | "inactive";
  plan: "free" | "trial" | "monthly" | "termly" | "yearly";
  planEndsAt: string;
  notes: string;
};

const SchoolDetails = () => {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const [school, setSchool] = useState<School | null>(null);
  const [formState, setFormState] = useState<SchoolFormState | null>(null);
  const [resolvedSchoolId, setResolvedSchoolId] = useState<string | null>(
    schoolId || null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminForm, setAdminForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [stats, setStats] = useState({
    students: "0",
    teachers: "0",
    lastActivity: "Coming soon",
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetLink, setResetLink] = useState<string>("");
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [logoZoom, setLogoZoom] = useState(1);
  const [logoOffset, setLogoOffset] = useState({ x: 0, y: 0 });
  const [logoNatural, setLogoNatural] = useState({ width: 0, height: 0 });
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  const formatPlanEndsAt = (value: any) => {
    if (!value) return "";
    const rawDate =
      typeof value?.toDate === "function" ? value.toDate() : value;
    const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (!parsed || Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().split("T")[0];
  };

  const CROP_PREVIEW_SIZE = 180;
  const OUTPUT_SIZE = 512;
  const MAX_OFFSET = CROP_PREVIEW_SIZE / 2;

  useEffect(() => {
    if (!schoolId) return;

    const fetchSchool = async () => {
      try {
        let schoolDoc = await getDoc(doc(firestore, "schools", schoolId));
        if (!schoolDoc.exists()) {
          const fallbackQuery = query(
            collection(firestore, "schools"),
            where("schoolId", "==", schoolId),
          );
          const fallbackSnap = await getDocs(fallbackQuery);
          const fallbackDoc = fallbackSnap.docs[0];
          if (!fallbackDoc) {
            showToast("School not found", { type: "error" });
            navigate("/super-admin/schools");
            return;
          }
          schoolDoc = fallbackDoc;
        }

        const schoolData = {
          id: schoolDoc.id,
          ...schoolDoc.data(),
        } as School;
        setSchool(schoolData);
        setResolvedSchoolId(schoolDoc.id);

        const createdAt =
          schoolData.createdAt && (schoolData.createdAt as any)?.toDate?.()
            ? (schoolData.createdAt as any).toDate()
            : null;

        setFormState({
          name: schoolData.name || "",
          code: schoolData.code || "",
          phone: schoolData.phone || "",
          address: schoolData.address || "",
          logoUrl: schoolData.logoUrl || "",
          status: schoolData.status || "active",
          plan: schoolData.plan || "trial",
          planEndsAt: formatPlanEndsAt(schoolData.planEndsAt),
          notes: schoolData.notes || "",
        });

        const adminQuery = query(
          collection(firestore, "users"),
          where("role", "==", UserRole.SCHOOL_ADMIN),
          where("schoolId", "==", schoolData.id),
        );
        const adminSnap = await getDocs(adminQuery);
        const adminDoc = adminSnap.docs[0];
        setAdminUser(
          adminDoc ? ({ id: adminDoc.id, ...adminDoc.data() } as User) : null,
        );

        const [studentsSnap, teachersSnap] = await Promise.all([
          getDocs(
            query(
              collection(firestore, "students"),
              where("schoolId", "==", schoolData.id),
            ),
          ),
          getDocs(
            query(
              collection(firestore, "users"),
              where("schoolId", "==", schoolData.id),
              where("role", "==", UserRole.TEACHER),
            ),
          ),
        ]);

        setStats({
          students: studentsSnap.size.toString(),
          teachers: teachersSnap.size.toString(),
          lastActivity: createdAt ? createdAt.toLocaleDateString() : "â€”",
        });
      } catch (error) {
        console.error("Error fetching school:", error);
        showToast("Failed to load school details", { type: "error" });
      } finally {
        setLoading(false);
      }
    };

    fetchSchool();
  }, [schoolId, navigate]);

  const createdAtLabel = useMemo(() => {
    if (!school?.createdAt) return "â€”";
    const dateValue = (school.createdAt as any)?.toDate?.()
      ? (school.createdAt as any).toDate()
      : new Date(school.createdAt as any);
    if (!dateValue || Number.isNaN(dateValue.getTime())) return "â€”";
    return dateValue.toLocaleDateString();
  }, [school?.createdAt]);

  const handleFormChange = (field: keyof SchoolFormState, value: string) => {
    if (!formState) return;
    setFormState({ ...formState, [field]: value });
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

  const validateForm = () => {
    if (!formState) return false;
    if (!formState.name.trim()) {
      showToast("School name is required.", { type: "error" });
      return false;
    }
    if (formState.phone && formState.phone.trim().length < 7) {
      showToast("Phone number is too short.", { type: "error" });
      return false;
    }
    if (formState.planEndsAt) {
      const chosen = new Date(formState.planEndsAt);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (chosen < today) {
        showToast("Plan end date cannot be in the past.", { type: "error" });
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!resolvedSchoolId || !formState) return;
    if (!validateForm()) return;

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

    setSaving(true);
    try {
      const croppedLogo = getCroppedLogoDataUrl();
      const nextLogoUrl = croppedLogo || formState.logoUrl.trim();
      await setDoc(
        doc(firestore, "schools", resolvedSchoolId),
        {
          name: formState.name.trim(),
          code: formState.code.trim(),
          phone: formState.phone.trim(),
          address: formState.address.trim(),
          logoUrl: nextLogoUrl,
          status: formState.status,
          plan: formState.plan,
          planEndsAt: formState.planEndsAt
            ? new Date(formState.planEndsAt)
            : null,
          notes: formState.notes.trim(),
        },
        { merge: true },
      );
      showToast("School updated successfully.", { type: "success" });
      setSchool((prev) =>
        prev
          ? {
              ...prev,
              ...formState,
              logoUrl: nextLogoUrl,
              planEndsAt: formState.planEndsAt
                ? new Date(formState.planEndsAt)
                : null,
            }
          : prev,
      );
      setFormState((prev) => (prev ? { ...prev, logoUrl: nextLogoUrl } : prev));
      setLogoPreview("");
      setLogoZoom(1);
      setLogoOffset({ x: 0, y: 0 });
      setLogoNatural({ width: 0, height: 0 });
    } catch (error: any) {
      console.error("Failed to update school", error);
      showToast(error.message || "Failed to update school.", {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!school) return;
    setFormState({
      name: school.name || "",
      code: school.code || "",
      phone: school.phone || "",
      address: school.address || "",
      logoUrl: school.logoUrl || "",
      status: school.status || "active",
      plan: school.plan || "trial",
      planEndsAt: formatPlanEndsAt(school.planEndsAt),
      notes: school.notes || "",
    });
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedSchoolId) return;
    if (!adminForm.fullName.trim() || !adminForm.email.trim()) return;

    setIsCreatingAdmin(true);
    try {
      const result = await createSchoolAdmin({
        schoolId: resolvedSchoolId,
        fullName: adminForm.fullName.trim(),
        email: adminForm.email.trim(),
        password: adminForm.password.trim() || undefined,
      });
      showToast(
        adminForm.password.trim()
          ? `Admin created: ${result.email}`
          : `Admin created: ${result.email}. Reset link sent.`,
        { type: "success" },
      );
      setAdminForm({ fullName: "", email: "", password: "" });
      setShowCreateAdmin(false);

      const adminQuery = query(
        collection(firestore, "users"),
        where("role", "==", UserRole.SCHOOL_ADMIN),
        where("schoolId", "==", schoolId),
      );
      const adminSnap = await getDocs(adminQuery);
      const adminDoc = adminSnap.docs[0];
      setAdminUser(
        adminDoc ? ({ id: adminDoc.id, ...adminDoc.data() } as User) : null,
      );
    } catch (error: any) {
      console.error("Error creating admin:", error);
      showToast(error.message || "Failed to create admin.", {
        type: "error",
      });
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleResetAdminPassword = async () => {
    if (!adminUser) return;
    try {
      const result = await resetSchoolAdminPassword({
        adminUid: adminUser.id,
      });
      setResetLink(result.resetLink || "");
      setShowResetModal(true);
      if (result.resetLink) {
        await navigator.clipboard.writeText(result.resetLink);
        showToast("Reset link copied to clipboard.", { type: "success" });
      }
    } catch (error: any) {
      console.error("Failed to reset admin password", error);
      showToast(error.message || "Failed to reset admin password.", {
        type: "error",
      });
    }
  };

  const handleToggleAdminStatus = async () => {
    if (!adminUser) return;
    const nextStatus = adminUser.status === "active" ? "inactive" : "active";
    try {
      await updateDoc(doc(firestore, "users", adminUser.id), {
        status: nextStatus,
      });
      setAdminUser({ ...adminUser, status: nextStatus });
      showToast(
        nextStatus === "active"
          ? "Admin activated successfully."
          : "Admin disabled successfully.",
        { type: "success" },
      );
    } catch (error: any) {
      console.error("Failed to update admin status", error);
      showToast(error.message || "Failed to update admin status.", {
        type: "error",
      });
    }
  };

  const handleDeleteSchool = async () => {
    if (!school || deleteConfirmText.trim() !== school.name) return;
    setIsDeleting(true);
    try {
      await deleteSchool({ schoolId: school.id });
      showToast("School deleted successfully.", { type: "success" });
      setShowDeleteModal(false);
      navigate("/super-admin/schools");
    } catch (error: any) {
      console.error("Failed to delete school", error);
      showToast(error.message || "Failed to delete school.", {
        type: "error",
      });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmText("");
    }
  };

  if (loading) {
    return (
      <Layout title="School Details">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B4A82]"></div>
        </div>
      </Layout>
    );
  }

  if (!school || !formState) {
    return (
      <Layout title="School Details">
        <div className="text-center py-12">
          <p className="text-slate-500">School not found</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="School Details">
      <div className="p-4 sm:p-6 space-y-8">
        <div className="flex flex-col gap-4">
          <button
            onClick={() => navigate("/super-admin/schools")}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm"
          >
            <ArrowLeft size={16} />
            Schools / {school.name}
          </button>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden">
                {school.logoUrl ? (
                  <img
                    src={school.logoUrl}
                    alt={school.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="text-slate-500" />
                )}
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {school.name}
                </h1>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <FileText size={14} /> Code: {school.code || "â€”"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={14} /> Created: {createdAtLabel}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  school.status === "active"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-[#E6F0FA] text-[#0B4A82]"
                }`}
              >
                {school.status === "active" ? "Active" : "Inactive"}
              </span>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-600">
                {school.plan}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.4fr] gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
              <div className="grid gap-3 text-sm text-slate-600">
                <div className="flex items-center gap-3">
                  <Phone size={16} />
                  <span>{school.phone || "No phone"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin size={16} />
                  <span>{school.address || "No address"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <FileText size={16} />
                  <span>{school.notes || "No internal notes"}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  Administration
                </h2>
                {!adminUser && (
                  <button
                    onClick={() => setShowCreateAdmin(true)}
                    className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    Create Admin
                  </button>
                )}
              </div>
              {adminUser ? (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {adminUser.fullName}
                      </p>
                      <p className="text-sm text-slate-500">
                        {adminUser.email}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        adminUser.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-[#E6F0FA] text-[#0B4A82]"
                      }`}
                    >
                      {adminUser.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleResetAdminPassword}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Reset Admin Password
                    </button>
                    <button
                      onClick={handleToggleAdminStatus}
                      className={`px-3 py-2 rounded-lg border text-sm ${
                        adminUser.status === "active"
                          ? "border-red-200 text-red-600 hover:bg-red-50"
                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                      }`}
                    >
                      {adminUser.status === "active"
                        ? "Disable Admin"
                        : "Activate Admin"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">
                  No admin assigned yet.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Total students", value: stats.students },
                { label: "Total teachers", value: stats.teachers },
                { label: "Last activity", value: stats.lastActivity },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"
                >
                  <p className="text-xs uppercase text-slate-400">
                    {item.label}
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Edit School Settings
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-600">
                    Name
                  </label>
                  <input
                    value={formState.name}
                    onChange={(e) => handleFormChange("name", e.target.value)}
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">
                    Code
                  </label>
                  <input
                    value={formState.code}
                    onChange={(e) => handleFormChange("code", e.target.value)}
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">
                    Phone
                  </label>
                  <input
                    value={formState.phone}
                    onChange={(e) => handleFormChange("phone", e.target.value)}
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">
                    Status
                  </label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      handleFormChange(
                        "status",
                        e.target.value as SchoolFormState["status"],
                      )
                    }
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-slate-600">
                    Address
                  </label>
                  <input
                    value={formState.address}
                    onChange={(e) =>
                      handleFormChange("address", e.target.value)
                    }
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-slate-600">
                    Logo Upload
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 bg-white"
                  />

                  {formState.logoUrl && !logoPreview && (
                    <p className="text-xs text-slate-500 mt-2">
                      Current logo is saved. Upload a new file to replace it.
                    </p>
                  )}

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
                  <label className="text-sm font-medium text-slate-600">
                    Plan
                  </label>
                  <select
                    value={formState.plan}
                    onChange={(e) =>
                      handleFormChange(
                        "plan",
                        e.target.value as SchoolFormState["plan"],
                      )
                    }
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 bg-white"
                  >
                    <option value="free">Free (No Billing)</option>
                    <option value="trial">Trial</option>
                    <option value="monthly">Monthly</option>
                    <option value="termly">Termly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">
                    Plan Ends At
                  </label>
                  <input
                    type="date"
                    value={formState.planEndsAt}
                    onChange={(e) =>
                      handleFormChange("planEndsAt", e.target.value)
                    }
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-slate-600">
                    Internal Notes
                  </label>
                  <textarea
                    value={formState.notes}
                    onChange={(e) => handleFormChange("notes", e.target.value)}
                    rows={4}
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-6">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white flex items-center gap-2 disabled:opacity-60"
                >
                  <Save size={16} /> {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
              <div className="flex items-center gap-2 text-red-600 mb-4">
                <ShieldAlert size={18} />
                <h2 className="text-lg font-semibold">Danger Zone</h2>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() =>
                    handleFormChange(
                      "status",
                      formState.status === "active" ? "inactive" : "active",
                    )
                  }
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
                >
                  <span>
                    {formState.status === "active"
                      ? "Deactivate School"
                      : "Activate School"}
                  </span>
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
                >
                  <span>Delete School</span>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCreateAdmin && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Create School Admin
              </h3>
              <button
                onClick={() => setShowCreateAdmin(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-600">
                  Full Name
                </label>
                <input
                  value={adminForm.fullName}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, fullName: e.target.value })
                  }
                  className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600">
                  Email
                </label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) =>
                    setAdminForm({ ...adminForm, email: e.target.value })
                  }
                  className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600">
                  Password (optional)
                </label>
                <div className="relative">
                  <input
                    type={showAdminPassword ? "text" : "password"}
                    value={adminForm.password}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, password: e.target.value })
                    }
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showAdminPassword ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Leave blank to send a reset link.
                </p>
              </div>
              <button
                type="submit"
                disabled={isCreatingAdmin}
                className="w-full py-2 rounded-xl bg-emerald-600 text-white flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <UserPlus size={16} />
                {isCreatingAdmin ? "Creating..." : "Create Admin"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <ShieldAlert size={18} />
              <h3 className="text-lg font-semibold">Delete School</h3>
            </div>
            <p className="text-sm text-slate-500">
              Type <span className="font-semibold">{school.name}</span> to
              confirm deletion.
            </p>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSchool}
                disabled={
                  deleteConfirmText.trim() !== school.name || isDeleting
                }
                className="flex-1 py-2 rounded-xl bg-red-600 text-white disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-700">
                <ShieldAlert size={18} />
                <h3 className="text-lg font-semibold">Reset Admin Password</h3>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Click the link button to be redirected to the reset password page.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600"
              >
                Close
              </button>
              <a
                href={resetLink || "#"}
                target="_blank"
                rel="noreferrer"
                className={`flex-1 py-2 rounded-xl text-center text-white ${resetLink ? "bg-[#0B4A82] hover:bg-[#1160A8]" : "bg-slate-300 pointer-events-none"}`}
              >
                Open Reset Link
              </a>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default SchoolDetails;
