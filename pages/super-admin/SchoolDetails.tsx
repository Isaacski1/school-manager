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
  CheckCircle2,
  Building2,
  Calendar,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  GraduationCap,
  MapPin,
  Phone,
  Save,
  Settings2,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
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

type PaidPlan = Extract<
  SchoolFormState["plan"],
  "monthly" | "termly" | "yearly"
>;

const PAID_PLAN_OPTIONS: Array<{
  value: PaidPlan;
  label: string;
  description: string;
  months: number;
}> = [
  {
    value: "monthly",
    label: "Monthly",
    description: "One month access, billed on a shorter cycle.",
    months: 1,
  },
  {
    value: "termly",
    label: "Termly",
    description: "Three months access for a school-term billing cycle.",
    months: 3,
  },
  {
    value: "yearly",
    label: "Yearly",
    description: "Twelve months access for long-term subscription coverage.",
    months: 12,
  },
];

const SURFACE_CLASS =
  "relative overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_28px_80px_-52px_rgba(15,23,42,0.45)] backdrop-blur";

const PANEL_CLASS =
  "rounded-[24px] border border-slate-200/70 bg-white/80 p-5 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.45)]";

const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500";

const INPUT_CLASS =
  "mt-2 w-full rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100";

const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-[132px] resize-y`;

const PLAN_META: Record<
  SchoolFormState["plan"],
  {
    badgeClass: string;
    softClass: string;
    buttonClass: string;
    dotClass: string;
  }
> = {
  free: {
    badgeClass: "border-slate-200 bg-slate-100/90 text-slate-700",
    softClass:
      "border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-50 text-slate-700",
    buttonClass: "border-slate-300 bg-slate-50 text-slate-700",
    dotClass: "bg-slate-500",
  },
  trial: {
    badgeClass: "border-amber-200 bg-amber-50/90 text-amber-700",
    softClass:
      "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-700",
    buttonClass: "border-amber-300 bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
  },
  monthly: {
    badgeClass: "border-sky-200 bg-sky-50/90 text-sky-700",
    softClass:
      "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-blue-50 text-sky-700",
    buttonClass: "border-sky-300 bg-sky-50 text-sky-700",
    dotClass: "bg-sky-500",
  },
  termly: {
    badgeClass: "border-emerald-200 bg-emerald-50/90 text-emerald-700",
    softClass:
      "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-emerald-700",
    buttonClass: "border-emerald-300 bg-emerald-50 text-emerald-700",
    dotClass: "bg-emerald-500",
  },
  yearly: {
    badgeClass: "border-violet-200 bg-violet-50/90 text-violet-700",
    softClass:
      "border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 text-violet-700",
    buttonClass: "border-violet-300 bg-violet-50 text-violet-700",
    dotClass: "bg-violet-500",
  },
};

const STATUS_META = {
  active: {
    badgeClass: "border-emerald-200 bg-emerald-50/90 text-emerald-700",
    softClass:
      "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-emerald-700",
    dotClass: "bg-emerald-500",
  },
  inactive: {
    badgeClass: "border-slate-200 bg-slate-100/90 text-slate-700",
    softClass:
      "border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-50 text-slate-700",
    dotClass: "bg-slate-500",
  },
} as const;

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
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
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
  const [planUpdating, setPlanUpdating] = useState<PaidPlan | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  const formatPlanEndsAt = (value: any) => {
    if (!value) return "";
    const rawDate =
      typeof value?.toDate === "function" ? value.toDate() : value;
    const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (!parsed || Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().split("T")[0];
  };

  const formatDisplayDate = (value: any) => {
    if (!value) return "Not set";
    const rawDate =
      typeof value?.toDate === "function" ? value.toDate() : value;
    const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (!parsed || Number.isNaN(parsed.getTime())) return "Not set";
    return parsed.toLocaleDateString();
  };

  const formatPlanLabel = (plan: SchoolFormState["plan"]) =>
    plan.charAt(0).toUpperCase() + plan.slice(1);

  const calculatePlanEndDate = (plan: PaidPlan) => {
    const monthsToAdd =
      PAID_PLAN_OPTIONS.find((option) => option.value === plan)?.months || 1;
    const nextDate = new Date();
    nextDate.setHours(0, 0, 0, 0);
    nextDate.setMonth(nextDate.getMonth() + monthsToAdd);
    return nextDate;
  };

  const CROP_PREVIEW_SIZE = 180;
  const OUTPUT_SIZE = 512;
  const MAX_OFFSET = CROP_PREVIEW_SIZE / 2;

  const fetchSchoolAdmins = async (targetSchoolId: string) => {
    const adminQuery = query(
      collection(firestore, "users"),
      where("role", "==", UserRole.SCHOOL_ADMIN),
      where("schoolId", "==", targetSchoolId),
    );
    const adminSnap = await getDocs(adminQuery);
    const admins = adminSnap.docs
      .map((adminDoc) => ({ id: adminDoc.id, ...adminDoc.data() }) as User)
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
    setAdminUsers(admins);
    return admins;
  };

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

        await fetchSchoolAdmins(schoolData.id);

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
          lastActivity: createdAt
            ? createdAt.toLocaleDateString()
            : "Not available",
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
    if (!school?.createdAt) return "Not available";
    const dateValue = (school.createdAt as any)?.toDate?.()
      ? (school.createdAt as any).toDate()
      : new Date(school.createdAt as any);
    if (!dateValue || Number.isNaN(dateValue.getTime())) return "Not available";
    return dateValue.toLocaleDateString();
  }, [school?.createdAt]);

  const currentPlanEndsLabel = useMemo(() => {
    const sourceValue = formState?.planEndsAt || school?.planEndsAt || null;
    return formatDisplayDate(sourceValue);
  }, [formState?.planEndsAt, school?.planEndsAt]);

  const currentPlanMeta =
    PLAN_META[
      (formState?.plan || school?.plan || "trial") as SchoolFormState["plan"]
    ];
  const currentStatusMeta =
    STATUS_META[
      (formState?.status ||
        school?.status ||
        "inactive") as SchoolFormState["status"]
    ];
  const adminSummary = useMemo(() => {
    if (!adminUsers.length) {
      return {
        label: "Not assigned",
        activeCount: 0,
        inactiveCount: 0,
      };
    }

    const activeCount = adminUsers.filter(
      (admin) => admin.status === "active",
    ).length;
    const inactiveCount = adminUsers.length - activeCount;

    return {
      label: `${activeCount}/${adminUsers.length} active`,
      activeCount,
      inactiveCount,
    };
  }, [adminUsers]);

  const handleFormChange = (field: keyof SchoolFormState, value: string) => {
    if (!formState) return;
    setFormState({ ...formState, [field]: value });
  };

  const handleQuickPlanChange = async (nextPlan: PaidPlan) => {
    if (!resolvedSchoolId) return;

    const nextPlanEndsAt = calculatePlanEndDate(nextPlan);
    setPlanUpdating(nextPlan);

    try {
      await updateDoc(doc(firestore, "schools", resolvedSchoolId), {
        plan: nextPlan,
        planEndsAt: nextPlanEndsAt,
        status: "active",
        "billing.status": "active",
      });

      setSchool((prev) =>
        prev
          ? ({
              ...prev,
              plan: nextPlan,
              planEndsAt: nextPlanEndsAt,
              status: "active",
              billing: {
                ...(prev as any).billing,
                status: "active",
              },
            } as School)
          : prev,
      );

      setFormState((prev) =>
        prev
          ? {
              ...prev,
              plan: nextPlan,
              planEndsAt: formatPlanEndsAt(nextPlanEndsAt),
              status: "active",
            }
          : prev,
      );

      showToast(
        `${formatPlanLabel(nextPlan)} plan applied. Ends on ${formatDisplayDate(nextPlanEndsAt)}.`,
        {
          type: "success",
        },
      );
    } catch (error: any) {
      console.error("Failed to update school plan", error);
      showToast(error.message || "Failed to update subscription plan.", {
        type: "error",
      });
    } finally {
      setPlanUpdating(null);
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
      await fetchSchoolAdmins(resolvedSchoolId);
    } catch (error: any) {
      console.error("Error creating admin:", error);
      showToast(error.message || "Failed to create admin.", {
        type: "error",
      });
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleResetAdminPassword = async (adminUser: User) => {
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

  const handleToggleAdminStatus = async (adminUser: User) => {
    const nextStatus = adminUser.status === "active" ? "inactive" : "active";
    try {
      await updateDoc(doc(firestore, "users", adminUser.id), {
        status: nextStatus,
      });
      setAdminUsers((prev) =>
        prev.map((existingAdmin) =>
          existingAdmin.id === adminUser.id
            ? { ...existingAdmin, status: nextStatus }
            : existingAdmin,
        ),
      );
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
        <div className="flex min-h-[28rem] items-center justify-center p-6">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 px-8 py-10 text-center shadow-[0_28px_80px_-52px_rgba(15,23,42,0.45)]">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[#0B4A82]" />
            <p className="mt-4 text-sm font-medium text-slate-500">
              Loading school workspace...
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!school || !formState) {
    return (
      <Layout title="School Details">
        <div className="flex min-h-[28rem] items-center justify-center p-6">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 px-8 py-10 text-center shadow-[0_28px_80px_-52px_rgba(15,23,42,0.45)]">
            <h2 className="text-xl font-semibold text-slate-900">
              School not found
            </h2>
            <p className="mt-3 text-sm text-slate-500">
              The requested school record could not be loaded.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="School Details">
      <div className="relative p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden">
          <div className="absolute -left-20 top-6 h-52 w-52 rounded-full bg-cyan-200/40 blur-3xl" />
          <div className="absolute right-0 top-10 h-64 w-64 rounded-full bg-violet-200/35 blur-3xl" />
          <div className="absolute left-1/3 top-40 h-56 w-56 rounded-full bg-emerald-200/20 blur-3xl" />
        </div>

        <div className="space-y-6">
          <button
            onClick={() => navigate("/super-admin/schools")}
            className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
          >
            <ArrowLeft
              size={16}
              className="transition group-hover:-translate-x-0.5"
            />
            Schools / {school.name}
          </button>

          <section className="relative overflow-hidden rounded-[32px] border border-white/20 bg-gradient-to-br from-slate-950 via-[#0B4A82] to-cyan-500 p-6 text-white shadow-[0_35px_100px_-50px_rgba(11,74,130,0.85)] sm:p-8">
            <div className="absolute -right-12 top-0 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-5">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-sky-50/90 backdrop-blur">
                  <Sparkles size={14} />
                  School Control Center
                </span>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[26px] border border-white/15 bg-white/12 shadow-lg backdrop-blur">
                    {school.logoUrl || formState.logoUrl ? (
                      <img
                        src={school.logoUrl || formState.logoUrl}
                        alt={school.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Building2 size={32} className="text-white/90" />
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h1 className="text-2xl font-bold tracking-tight text-white sm:text-4xl">
                        {school.name}
                      </h1>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-sky-50/80 sm:text-base">
                        Manage subscription access, branding, admin control, and
                        operational details for this school from one refined
                        control panel.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm text-sky-50/90">
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur">
                        <Globe size={14} />
                        Code: {school.code || "Not set"}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur">
                        <Calendar size={14} />
                        Created: {createdAtLabel}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur">
                        <CreditCard size={14} />
                        Ends: {currentPlanEndsLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:w-[360px]">
                <div className="rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-50/70">
                    School Status
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${currentStatusMeta.dotClass}`}
                    />
                    <span className="text-lg font-semibold text-white">
                      {formState.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-sky-50/75">
                    {formState.status === "active"
                      ? "Billing and school access are currently enabled."
                      : "School access is currently in a paused state."}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-50/70">
                    Current Plan
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${currentPlanMeta.dotClass}`}
                    />
                    <span className="text-lg font-semibold text-white">
                      {formatPlanLabel(formState.plan)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-sky-50/75">
                    Managed renewal date: {currentPlanEndsLabel}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Students",
                  value: stats.students,
                  icon: GraduationCap,
                },
                {
                  label: "Teachers",
                  value: stats.teachers,
                  icon: Users,
                },
                {
                  label: "Last Activity",
                  value: stats.lastActivity,
                  icon: Calendar,
                },
                {
                  label: "Admin Accounts",
                  value: adminSummary.label,
                  icon: CheckCircle2,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="rounded-[24px] border border-white/12 bg-white/10 p-4 backdrop-blur"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-50/70">
                        {item.label}
                      </span>
                      <Icon size={16} className="text-sky-100/80" />
                    </div>
                    <div className="mt-3 text-xl font-semibold text-white">
                      {item.value}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.28fr]">
            <div className="space-y-6">
              <section className={`${SURFACE_CLASS} p-6`}>
                <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-r from-sky-100/70 via-cyan-50/30 to-emerald-100/70" />
                <div className="relative space-y-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                        <CreditCard size={14} />
                        Subscription
                      </div>
                      <h2 className="mt-4 text-xl font-semibold text-slate-900">
                        Billing Plan Management
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Apply a paid plan instantly and keep the school access
                        lifecycle aligned with its billing period.
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${currentPlanMeta.badgeClass}`}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${currentPlanMeta.dotClass}`}
                      />
                      {formatPlanLabel(formState.plan)}
                    </span>
                  </div>

                  <div
                    className={`grid gap-3 rounded-[24px] border p-4 ${currentPlanMeta.softClass} sm:grid-cols-2`}
                  >
                    <div>
                      <p className={LABEL_CLASS}>Renewal Date</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {currentPlanEndsLabel}
                      </p>
                    </div>
                    <div>
                      <p className={LABEL_CLASS}>Operational State</p>
                      <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${currentStatusMeta.dotClass}`}
                        />
                        {formState.status === "active"
                          ? "School active"
                          : "School inactive"}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {PAID_PLAN_OPTIONS.map((option) => {
                      const optionMeta = PLAN_META[option.value];
                      const isCurrent = formState.plan === option.value;
                      const isUpdating = planUpdating === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleQuickPlanChange(option.value)}
                          disabled={!!planUpdating || isCurrent}
                          className={`group relative overflow-hidden rounded-[24px] border p-0 text-left transition-all duration-200 ${
                            isCurrent
                              ? `${optionMeta.softClass} shadow-lg`
                              : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                          } ${planUpdating || isCurrent ? "opacity-80" : ""}`}
                        >
                          <div
                            className={`absolute inset-x-0 top-0 h-1.5 ${optionMeta.dotClass}`}
                          />
                          <div className="relative p-5">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-base font-semibold text-slate-900">
                                {option.label}
                              </span>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${optionMeta.buttonClass}`}
                              >
                                {option.months} month
                                {option.months > 1 ? "s" : ""}
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-500">
                              {option.description}
                            </p>
                            <div className="mt-5 flex items-center justify-between text-xs font-semibold">
                              <span className="text-slate-400">
                                {isUpdating
                                  ? "Applying..."
                                  : isCurrent
                                    ? "Already active"
                                    : "Apply instantly"}
                              </span>
                              {isCurrent && (
                                <span className="rounded-full bg-white/90 px-2.5 py-1 text-[#0B4A82] shadow-sm">
                                  Current
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-xs text-slate-400">
                    Plan changes here update the school immediately and
                    recalculate the next end date from today.
                  </p>
                </div>
              </section>

              <section className={`${SURFACE_CLASS} p-6`}>
                <div className="relative space-y-5">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      <Building2 size={14} />
                      School Snapshot
                    </div>
                    <h2 className="mt-4 text-xl font-semibold text-slate-900">
                      Overview & Contact
                    </h2>
                  </div>

                  <div className="grid gap-3">
                    {[
                      {
                        label: "Phone",
                        value: school.phone || "No phone on record",
                        icon: Phone,
                      },
                      {
                        label: "Address",
                        value: school.address || "No address added yet",
                        icon: MapPin,
                      },
                      {
                        label: "Portal code",
                        value: school.code || "Not assigned",
                        icon: Globe,
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.label}
                          className="rounded-[22px] border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 p-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                              <Icon size={18} />
                            </div>
                            <div className="min-w-0">
                              <p className={LABEL_CLASS}>{item.label}</p>
                              <p className="mt-1 text-sm leading-6 text-slate-700">
                                {item.value}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                    <p className={LABEL_CLASS}>Internal Notes</p>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {school.notes || "No internal notes have been added yet."}
                    </p>
                  </div>
                </div>
              </section>

              <section className={`${SURFACE_CLASS} p-6`}>
                <div className="relative space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                        <Users size={14} />
                        Administration
                      </div>
                      <h2 className="mt-4 text-xl font-semibold text-slate-900">
                        School Admin Access
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Add, secure, or suspend one or more school
                        administrators without leaving this page.
                      </p>
                    </div>

                    <button
                      onClick={() => setShowCreateAdmin(true)}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      <UserPlus size={16} />
                      Add Administrator
                    </button>
                  </div>

                  {adminUsers.length > 0 ? (
                    <div className="grid gap-4">
                      <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-600">
                        {adminUsers.length} admin
                        {adminUsers.length !== 1 ? "s" : ""} linked to this
                        school: {adminSummary.activeCount} active,{" "}
                        {adminSummary.inactiveCount} inactive.
                      </div>

                      {adminUsers.map((adminUser) => {
                        const adminStatusMeta =
                          STATUS_META[
                            adminUser.status === "active"
                              ? "active"
                              : "inactive"
                          ];

                        return (
                          <div
                            key={adminUser.id}
                            className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-violet-50 p-5"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex min-w-0 items-start gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-slate-900 text-white">
                                  <Users size={22} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-lg font-semibold text-slate-900">
                                    {adminUser.fullName}
                                  </p>
                                  <p className="mt-1 break-all text-sm text-slate-500">
                                    {adminUser.email}
                                  </p>
                                </div>
                              </div>

                              <span
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${adminStatusMeta.badgeClass}`}
                              >
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${adminStatusMeta.dotClass}`}
                                />
                                {adminUser.status}
                              </span>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              <button
                                onClick={() =>
                                  handleResetAdminPassword(adminUser)
                                }
                                className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                              >
                                Reset Password
                              </button>
                              <button
                                onClick={() => handleToggleAdminStatus(adminUser)}
                                className={`rounded-[20px] border px-4 py-3 text-sm font-medium transition ${
                                  adminUser.status === "active"
                                    ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                }`}
                              >
                                {adminUser.status === "active"
                                  ? "Disable Admin"
                                  : "Activate Admin"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 p-6 text-sm text-slate-500">
                      No admin account is linked to this school yet. Add one or
                      more administrators to enable delegated management.
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className={`${SURFACE_CLASS} p-6 sm:p-7`}>
                <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-r from-violet-100/60 via-cyan-50/20 to-sky-100/60" />
                <div className="relative space-y-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                        <Settings2 size={14} />
                        Settings Workspace
                      </div>
                      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
                        Edit School Settings
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                        Update profile details, branding, lifecycle settings,
                        and internal notes in a structured editor.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={handleCancel}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                      >
                        <Save size={16} />
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className={PANEL_CLASS}>
                      <div className="mb-5">
                        <p className={LABEL_CLASS}>Profile Details</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-900">
                          Identity & Operations
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={LABEL_CLASS}>School Name</label>
                          <input
                            value={formState.name}
                            onChange={(e) =>
                              handleFormChange("name", e.target.value)
                            }
                            className={INPUT_CLASS}
                            placeholder="Enter school name"
                          />
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>School Code</label>
                          <input
                            value={formState.code}
                            onChange={(e) =>
                              handleFormChange("code", e.target.value)
                            }
                            className={INPUT_CLASS}
                            placeholder="Enter short code"
                          />
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>Phone Number</label>
                          <input
                            value={formState.phone}
                            onChange={(e) =>
                              handleFormChange("phone", e.target.value)
                            }
                            className={INPUT_CLASS}
                            placeholder="Add contact number"
                          />
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>Status</label>
                          <select
                            value={formState.status}
                            onChange={(e) =>
                              handleFormChange(
                                "status",
                                e.target.value as SchoolFormState["status"],
                              )
                            }
                            className={INPUT_CLASS}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className={LABEL_CLASS}>Address</label>
                          <input
                            value={formState.address}
                            onChange={(e) =>
                              handleFormChange("address", e.target.value)
                            }
                            className={INPUT_CLASS}
                            placeholder="Add school location or address"
                          />
                        </div>
                      </div>
                    </div>

                    <div className={PANEL_CLASS}>
                      <div className="mb-5">
                        <p className={LABEL_CLASS}>Branding Studio</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-900">
                          Logo & Visual Identity
                        </h3>
                      </div>

                      <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Preview</span>
                          <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-500 shadow-sm">
                            512 x 512 export
                          </span>
                        </div>

                        <div className="mt-4 flex flex-col items-center gap-4">
                          <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-inner">
                            {logoPreview ? (
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
                                          (CROP_PREVIEW_SIZE /
                                            logoNatural.height) *
                                            logoNatural.width,
                                        ) * logoZoom
                                      }px`
                                    : "auto",
                                  height: logoNatural.height
                                    ? `${
                                        Math.max(
                                          CROP_PREVIEW_SIZE,
                                          (CROP_PREVIEW_SIZE /
                                            logoNatural.width) *
                                            logoNatural.height,
                                        ) * logoZoom
                                      }px`
                                    : "auto",
                                  transform: `translate(${logoOffset.x}px, ${logoOffset.y}px)`,
                                }}
                              />
                            ) : school.logoUrl || formState.logoUrl ? (
                              <img
                                src={school.logoUrl || formState.logoUrl}
                                alt={school.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Building2 size={40} className="text-slate-400" />
                            )}
                          </div>

                          <div className="text-center text-xs leading-6 text-slate-500">
                            Upload a square-friendly logo for a cleaner profile
                            presentation across the admin workspace.
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className={LABEL_CLASS}>Logo Upload</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoFileChange}
                          className={INPUT_CLASS}
                        />
                        {formState.logoUrl && !logoPreview && (
                          <p className="mt-2 text-xs text-slate-500">
                            Current logo is already saved. Upload a new image to
                            replace it.
                          </p>
                        )}
                      </div>

                      {logoPreview && (
                        <div className="mt-5 space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Crop Controls</span>
                            <span>{Math.round(logoZoom * 100)}%</span>
                          </div>

                          <div className="space-y-2">
                            <label className={LABEL_CLASS}>Zoom</label>
                            <input
                              type="range"
                              min={1}
                              max={3}
                              step={0.05}
                              value={logoZoom}
                              onChange={(event) =>
                                setLogoZoom(parseFloat(event.target.value))
                              }
                              className="w-full accent-cyan-600"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={LABEL_CLASS}>Move X</label>
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
                                className="w-full accent-cyan-600"
                              />
                            </div>
                            <div>
                              <label className={LABEL_CLASS}>Move Y</label>
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
                                className="w-full accent-cyan-600"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
                    <div className={PANEL_CLASS}>
                      <div className="mb-5">
                        <p className={LABEL_CLASS}>Access Lifecycle</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-900">
                          Billing & Access Settings
                        </h3>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className={LABEL_CLASS}>
                            Subscription Plan
                          </label>
                          <select
                            value={formState.plan}
                            onChange={(e) =>
                              handleFormChange(
                                "plan",
                                e.target.value as SchoolFormState["plan"],
                              )
                            }
                            className={INPUT_CLASS}
                          >
                            <option value="free">Free (No Billing)</option>
                            <option value="trial">Trial</option>
                            <option value="monthly">Monthly</option>
                            <option value="termly">Termly</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        </div>

                        <div>
                          <label className={LABEL_CLASS}>Plan Ends At</label>
                          <input
                            type="date"
                            value={formState.planEndsAt}
                            onChange={(e) =>
                              handleFormChange("planEndsAt", e.target.value)
                            }
                            className={INPUT_CLASS}
                          />
                        </div>

                        <div
                          className={`rounded-[22px] border p-4 ${currentPlanMeta.softClass}`}
                        >
                          <p className={LABEL_CLASS}>Current Selection</p>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-slate-900">
                                {formatPlanLabel(formState.plan)}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                Ends on {currentPlanEndsLabel}
                              </p>
                            </div>
                            <span
                              className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${currentPlanMeta.buttonClass}`}
                            >
                              <CreditCard size={18} />
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={PANEL_CLASS}>
                      <div className="mb-5">
                        <p className={LABEL_CLASS}>Internal Notes</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-900">
                          Team Context & Record Keeping
                        </h3>
                      </div>

                      <textarea
                        value={formState.notes}
                        onChange={(e) =>
                          handleFormChange("notes", e.target.value)
                        }
                        rows={6}
                        className={TEXTAREA_CLASS}
                        placeholder="Add onboarding notes, billing context, special instructions, or school-specific operational details."
                      />

                      <div className="mt-4 rounded-[22px] border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 p-4 text-sm leading-6 text-slate-500">
                        Keep notes concise and action-focused so other admins
                        can understand the school history quickly.
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="relative overflow-hidden rounded-[28px] border border-red-200/70 bg-gradient-to-br from-red-50 via-white to-rose-50 p-6 shadow-[0_28px_80px_-52px_rgba(220,38,38,0.3)]">
                <div className="space-y-5">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">
                      <ShieldAlert size={14} />
                      Danger Zone
                    </div>
                    <h2 className="mt-4 text-xl font-semibold text-slate-900">
                      Critical Actions
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Use these actions carefully. They affect school access or
                      permanently remove the account.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <button
                      onClick={() =>
                        handleFormChange(
                          "status",
                          formState.status === "active" ? "inactive" : "active",
                        )
                      }
                      className="flex items-center justify-between rounded-[20px] border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
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
                      className="flex items-center justify-between rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-100"
                    >
                      <span>Delete School Permanently</span>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {showCreateAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_35px_100px_-45px_rgba(15,23,42,0.55)]">
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-violet-100/70 via-cyan-50/20 to-sky-100/70" />
            <div className="relative p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                    <UserPlus size={14} />
                    Admin Setup
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-slate-900">
                    Create School Admin
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Assign a dedicated administrator to manage this school.
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateAdmin(false)}
                  className="rounded-full border border-slate-200 bg-white p-2 text-slate-400 transition hover:text-slate-700"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div>
                  <label className={LABEL_CLASS}>Full Name</label>
                  <input
                    value={adminForm.fullName}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, fullName: e.target.value })
                    }
                    className={INPUT_CLASS}
                    placeholder="Enter admin full name"
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Email Address</label>
                  <input
                    type="email"
                    value={adminForm.email}
                    onChange={(e) =>
                      setAdminForm({ ...adminForm, email: e.target.value })
                    }
                    className={INPUT_CLASS}
                    placeholder="Enter admin email"
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Password (Optional)</label>
                  <div className="relative">
                    <input
                      type={showAdminPassword ? "text" : "password"}
                      value={adminForm.password}
                      onChange={(e) =>
                        setAdminForm({ ...adminForm, password: e.target.value })
                      }
                      className={`${INPUT_CLASS} pr-12`}
                      placeholder="Leave blank to send reset link"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showAdminPassword ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Leave blank if you prefer to send a reset link instead.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isCreatingAdmin}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  <UserPlus size={16} />
                  {isCreatingAdmin ? "Creating..." : "Create Admin"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-red-200 bg-white shadow-[0_35px_100px_-45px_rgba(220,38,38,0.35)]">
            <div className="bg-gradient-to-r from-red-50 via-white to-rose-50 p-6">
              <div className="flex items-start gap-3 text-red-600">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100">
                  <ShieldAlert size={18} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">
                    Delete School
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Type <span className="font-semibold">{school.name}</span> to
                    confirm permanent deletion.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <label className={LABEL_CLASS}>Confirmation Text</label>
                <input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder={`Type ${school.name}`}
                />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteSchool}
                  disabled={
                    deleteConfirmText.trim() !== school.name || isDeleting
                  }
                  className="flex-1 rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_35px_100px_-45px_rgba(15,23,42,0.55)]">
            <div className="bg-gradient-to-r from-slate-50 via-white to-sky-50 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <ShieldAlert size={18} />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">
                      Reset Admin Password
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Open the secure reset link to complete the password reset
                      flow for this school admin.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowResetModal(false)}
                  className="rounded-full border border-slate-200 bg-white p-2 text-slate-400 transition hover:text-slate-600"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600"
                >
                  Close
                </button>
                <a
                  href={resetLink || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex-1 rounded-full px-4 py-3 text-center text-sm font-semibold text-white ${resetLink ? "bg-[#0B4A82] hover:bg-[#1160A8]" : "pointer-events-none bg-slate-300"}`}
                >
                  Open Reset Link
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default SchoolDetails;
