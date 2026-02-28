import React, { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../../components/Layout";
import { useSchool } from "../../context/SchoolContext";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../services/mockDb";
import { showToast } from "../../services/toast";
import { logActivity } from "../../services/activityLog";
import {
  FeeDefinition,
  FeeAppliesTo,
  FeeFrequency,
  FeeTerm,
  FinanceSettings,
  OnboardingMode,
  PaymentMethod,
  Student,
  StudentFeeLedger,
  StudentFeePayment,
  SchoolConfig,
} from "../../types";
import { ACADEMIC_YEAR, CLASSES_LIST } from "../../constants";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarRange,
  Download,
  Eye,
  FilePenLine,
  Filter,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

const termOptions: FeeTerm[] = ["Term 1", "Term 2", "Term 3"];
const paymentMethods: PaymentMethod[] = ["Cash", "MoMo", "Bank"];
const statusFilters = ["all", "paid", "part-paid", "unpaid"] as const;
const feeFrequencyOptions: { value: FeeFrequency; label: string }[] = [
  { value: "one_time", label: "One-time" },
  { value: "per_term", label: "Per term" },
  { value: "per_year", label: "Per year" },
];
const feeAppliesToOptions: { value: FeeAppliesTo; label: string }[] = [
  { value: "all_students", label: "All students" },
  { value: "class", label: "Specific class" },
  { value: "selected_students", label: "Selected students" },
  { value: "new_students_only", label: "New students only" },
];

const feeTemplates = [
  {
    label: "Tuition (Per Term)",
    value: {
      feeName: "Tuition",
      feeFrequency: "per_term" as FeeFrequency,
      appliesTo: "all_students" as FeeAppliesTo,
    },
  },
  {
    label: "Admission (One-time, New Students)",
    value: {
      feeName: "Admission",
      feeFrequency: "one_time" as FeeFrequency,
      appliesTo: "new_students_only" as FeeAppliesTo,
    },
  },
  {
    label: "PTA (Per Term)",
    value: {
      feeName: "PTA",
      feeFrequency: "per_term" as FeeFrequency,
      appliesTo: "all_students" as FeeAppliesTo,
    },
  },
];

const financeFiltersStorageKey = "financeFilters";

const readStoredFilters = (): {
  academicYear?: string;
  term?: FeeTerm;
  selectedClassId?: string;
} => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(financeFiltersStorageKey);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const buildLedgerId = (
  schoolId: string,
  studentId: string,
  academicYear: string,
  term: FeeTerm,
) => `${schoolId}_${studentId}_${academicYear.replace(/\s+/g, "")}_${term}`;

const SkeletonBlock: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse rounded-xl bg-slate-100 ${className || ""}`} />
);

const formatMoney = (value: number) => `GHS ${value.toFixed(2)}`;

const FeesPayments: React.FC = () => {
  const { school } = useSchool();
  const { user } = useAuth();
  const schoolId = school?.id || "";
  const [loading, setLoading] = useState(false);

  const feeSetupRef = useRef<HTMLDivElement | null>(null);
  const recordPaymentRef = useRef<HTMLDivElement | null>(null);

  const [academicYear, setAcademicYear] = useState(() => {
    const stored = readStoredFilters();
    return stored.academicYear || ACADEMIC_YEAR;
  });
  const [term, setTerm] = useState<FeeTerm>(() => {
    const stored = readStoredFilters();
    return stored.term || "Term 1";
  });
  const [selectedClassId, setSelectedClassId] = useState(() => {
    const stored = readStoredFilters();
    return stored.selectedClassId || "all";
  });
  const [statusFilter, setStatusFilter] =
    useState<(typeof statusFilters)[number]>("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("This term");

  const [fees, setFees] = useState<FeeDefinition[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [ledgers, setLedgers] = useState<StudentFeeLedger[]>([]);
  const [payments, setPayments] = useState<StudentFeePayment[]>([]);
  const [lastTermLedgers, setLastTermLedgers] = useState<StudentFeeLedger[]>(
    [],
  );
  const [lastTermPayments, setLastTermPayments] = useState<StudentFeePayment[]>(
    [],
  );
  const [financeSettings, setFinanceSettings] =
    useState<FinanceSettings | null>(null);
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);

  const [isCreatingFee, setIsCreatingFee] = useState(false);
  const [isUpdatingFee, setIsUpdatingFee] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeQuickExport, setActiveQuickExport] = useState<
    "defaulters" | "weekly" | "class" | null
  >(null);
  const [isSavingOnboarding, setIsSavingOnboarding] = useState(false);

  const [paymentPage, setPaymentPage] = useState(1);
  const paymentPageSize = 6;

  const [feeForm, setFeeForm] = useState({
    feeName: "",
    amount: "",
    classId: "",
    feeFrequency: "per_term" as FeeFrequency,
    appliesTo: "all_students" as FeeAppliesTo,
    effectiveFromDate: "",
    dueDate: "",
    selectedStudentIds: [] as string[],
    applyToAcademicYear: "",
    applyToTerm: "" as FeeTerm | "",
  });

  const [paymentForm, setPaymentForm] = useState({
    classId: "",
    studentId: "",
    feeId: "",
    amountPaid: "",
    paymentMethod: "MoMo" as PaymentMethod,
    receiptNumber: "",
  });

  const [selectedPayment, setSelectedPayment] =
    useState<StudentFeePayment | null>(null);
  const [ledgerPaymentModal, setLedgerPaymentModal] = useState<{
    ledgerId: string;
    studentId: string;
  } | null>(null);
  const [editingPayment, setEditingPayment] =
    useState<StudentFeePayment | null>(null);
  const [paymentEditForm, setPaymentEditForm] = useState({
    amountPaid: "",
    paymentMethod: "MoMo" as PaymentMethod,
    receiptNumber: "",
  });
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [deletingFeeId, setDeletingFeeId] = useState<string | null>(null);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [openingLedgerForm, setOpeningLedgerForm] = useState<{
    [key: string]: {
      openingStatus: "Paid" | "Part-paid" | "Unpaid";
      openingPaidAmount: string;
      openingBalance: string;
    };
  }>({});
  const [selectedOpeningFeeId, setSelectedOpeningFeeId] = useState<string>("");
  const [bulkOpeningClassId, setBulkOpeningClassId] = useState<string>("");
  const [bulkOpeningStatus, setBulkOpeningStatus] = useState<
    "Paid" | "Part-paid" | "Unpaid"
  >("Paid");
  const [bulkOpeningPaidAmount, setBulkOpeningPaidAmount] =
    useState<string>("");
  const [bulkOpeningBalance, setBulkOpeningBalance] = useState<string>("");
  const [onboardingMode, setOnboardingMode] =
    useState<OnboardingMode>("fresh_start");
  const [onboardingDate, setOnboardingDate] = useState("");

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const csvEscape = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "";
    const text = String(value).replace(/"/g, '""');
    return `"${text}"`;
  };

  const downloadCsv = (
    filename: string,
    headers: string[],
    rows: Array<Array<string | number | null | undefined>>,
  ) => {
    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => row.map(csvEscape).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleExportReport = () => {
    if (isExporting) return;
    setIsExporting(true);
    const headers = [
      "Student",
      "Class",
      "Fee",
      "Amount Paid",
      "Method",
      "Receipt",
      "Academic Year",
      "Term",
      "Date",
    ];
    const rows = paymentsSorted.map((payment) => {
      const student = students.find((s) => s.id === payment.studentId);
      const className = CLASSES_LIST.find(
        (c) => c.id === payment.classId,
      )?.name;
      return [
        student?.name || payment.studentId,
        className || payment.classId,
        payment.feeName,
        payment.amountPaid,
        payment.paymentMethod,
        payment.receiptNumber || "",
        payment.academicYear,
        payment.term,
        new Date(payment.createdAt).toLocaleString(),
      ];
    });

    downloadCsv(`payments_${academicYear}_${term}.csv`, headers, rows);
    setIsExporting(false);
  };

  const handleExportDefaulters = () => {
    setActiveQuickExport("defaulters");
    const headers = ["Student", "Class", "Balance", "Status"];
    const rows = defaulters.map(({ ledger, student, balance, status }) => {
      const className = CLASSES_LIST.find((c) => c.id === ledger.classId)?.name;
      return [
        student?.name || ledger.studentId,
        className || ledger.classId,
        balance,
        status,
      ];
    });
    downloadCsv(`defaulters_${academicYear}_${term}.csv`, headers, rows);
    setTimeout(() => setActiveQuickExport(null), 600);
  };

  const handleExportWeeklyPayments = () => {
    setActiveQuickExport("weekly");
    const headers = ["Week", "Amount Collected"];
    const rows = collectionTrend.map((item) => [item.label, item.value]);
    downloadCsv(
      `collections_weekly_${academicYear}_${term}.csv`,
      headers,
      rows,
    );
    setTimeout(() => setActiveQuickExport(null), 600);
  };

  const handleExportClassCollections = () => {
    setActiveQuickExport("class");
    const headers = ["Class", "Amount Collected"];
    const rows = classCollection.map((item) => [item.label, item.value]);
    downloadCsv(
      `collections_by_class_${academicYear}_${term}.csv`,
      headers,
      rows,
    );
    setTimeout(() => setActiveQuickExport(null), 600);
  };

  const fetchData = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const termIndex = termOptions.indexOf(term);
      const previousTerm = termIndex > 0 ? termOptions[termIndex - 1] : null;
      const [
        studentsData,
        feesData,
        ledgersData,
        paymentsData,
        settings,
        config,
        previousLedgers,
        previousPayments,
      ] = await Promise.all([
        db.getStudents(
          schoolId,
          selectedClassId === "all" ? undefined : selectedClassId,
        ),
        db.getFees({
          schoolId,
          academicYear,
          term,
        }),
        db.getStudentLedgers({
          schoolId,
          academicYear,
          term,
          classId: selectedClassId === "all" ? undefined : selectedClassId,
        }),
        db.getPayments({
          schoolId,
          academicYear,
          term,
          classId: selectedClassId === "all" ? undefined : selectedClassId,
        }),
        db.getFinanceSettings(schoolId),
        db.getSchoolConfig(schoolId),
        previousTerm
          ? db.getStudentLedgers({
              schoolId,
              academicYear,
              term: previousTerm,
              classId: selectedClassId === "all" ? undefined : selectedClassId,
            })
          : Promise.resolve([] as StudentFeeLedger[]),
        previousTerm
          ? db.getPayments({
              schoolId,
              academicYear,
              term: previousTerm,
              classId: selectedClassId === "all" ? undefined : selectedClassId,
            })
          : Promise.resolve([] as StudentFeePayment[]),
      ]);
      setStudents(studentsData);
      setFees(feesData);
      setLedgers(ledgersData);
      setPayments(paymentsData);
      setLastTermLedgers(previousLedgers);
      setLastTermPayments(previousPayments);
      setFinanceSettings(settings);
      setSchoolConfig(config);
      setOnboardingMode(settings.onboardingMode || "fresh_start");
      setOnboardingDate(settings.onboardingDate || "");
    } catch (error) {
      console.error("Failed to load finance data", error);
      showToast("Failed to load finance data.", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [schoolId, academicYear, term, selectedClassId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      financeFiltersStorageKey,
      JSON.stringify({ academicYear, term, selectedClassId }),
    );
  }, [academicYear, term, selectedClassId]);

  const isStudentNewSinceOnboarding = (student: Student) => {
    if (!onboardingDate) return true;
    const createdAt = student.createdAt
      ? new Date(student.createdAt).getTime()
      : 0;
    const onboardingAt = new Date(onboardingDate).getTime();
    if (!Number.isNaN(onboardingAt) && onboardingAt > 0) {
      return createdAt >= onboardingAt;
    }
    return true;
  };

  const parseAcademicYearRange = (value?: string | null) => {
    if (!value) return null;
    const match = value.match(/(\d{4})\s*\/\s*(\d{4})/);
    if (!match) return null;
    return { start: Number(match[1]), end: Number(match[2]) };
  };

  const resolveFeeAssignments = (
    student: Student,
    feeSnapshot: FeeDefinition[],
  ) => {
    return feeSnapshot.filter((fee) => {
      if (fee.effectiveFromDate) {
        const effectiveAt = new Date(fee.effectiveFromDate).getTime();
        if (!Number.isNaN(effectiveAt) && Date.now() < effectiveAt) {
          return false;
        }
      }
      if (fee.feeFrequency === "per_year") {
        if (
          fee.applyToAcademicYear &&
          fee.applyToAcademicYear !== academicYear
        ) {
          return false;
        }
      }
      if (fee.feeFrequency === "one_time" && fee.applyToAcademicYear) {
        const range = parseAcademicYearRange(fee.applyToAcademicYear);
        if (range && student.createdAt) {
          const year = new Date(student.createdAt).getFullYear();
          if (year < range.start || year > range.end) return false;
        }
      }
      if (fee.feeFrequency === "per_term") {
        if (fee.applyToTerm && fee.applyToTerm !== term) {
          return false;
        }
      }
      switch (fee.appliesTo) {
        case "class":
          return fee.classId ? fee.classId === student.classId : false;
        case "selected_students":
          return fee.selectedStudentIds?.includes(student.id) ?? false;
        case "new_students_only":
          return isStudentNewSinceOnboarding(student);
        case "all_students":
        default:
          return true;
      }
    });
  };

  const ensureLedger = async (
    student: Student,
    feeSnapshot: FeeDefinition[],
  ) => {
    const ledgerId = buildLedgerId(schoolId, student.id, academicYear, term);
    const existing = ledgers.find((l) => l.id === ledgerId);
    const assignedFees = resolveFeeAssignments(student, feeSnapshot);
    const existingFees = existing?.fees || [];
    const feesList = assignedFees.map((fee) => {
      const previous = existingFees.find((item) => item.feeId === fee.id);
      return {
        feeId: fee.id,
        feeName: fee.feeName,
        amount: fee.amount,
        openingPaidAmount: previous?.openingPaidAmount ?? null,
        openingBalance: previous?.openingBalance ?? null,
        openingStatus: previous?.openingStatus ?? null,
      };
    });
    const openingPaidTotal = feesList.reduce(
      (sum, fee) => sum + (fee.openingPaidAmount || 0),
      0,
    );
    const openingBalanceTotal = feesList.reduce((sum, fee) => {
      const paid = fee.openingPaidAmount || 0;
      const balanceValue =
        fee.openingBalance !== undefined && fee.openingBalance !== null
          ? fee.openingBalance
          : Math.max(0, fee.amount - paid);
      return sum + balanceValue;
    }, 0);
    const openingStatusDerived =
      openingPaidTotal <= 0
        ? "Unpaid"
        : openingPaidTotal >= feesList.reduce((sum, fee) => sum + fee.amount, 0)
          ? "Paid"
          : "Part-paid";
    const payload: StudentFeeLedger = {
      id: ledgerId,
      schoolId,
      studentId: student.id,
      classId: student.classId,
      academicYear,
      term,
      fees: feesList,
      openingPaidAmount: openingPaidTotal,
      openingBalance: openingBalanceTotal,
      openingStatus: openingStatusDerived,
      openingDate: existing?.openingDate || onboardingDate || null,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    await db.upsertStudentLedger(payload);
    return payload;
  };

  const handleCreateFee = async () => {
    if (!schoolId || !user?.id) return;
    if (!feeForm.feeName.trim() || !feeForm.amount) {
      showToast("Enter a fee name and amount.", { type: "error" });
      return;
    }
    const amount = Number(feeForm.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      showToast("Enter a valid amount.", { type: "error" });
      return;
    }
    try {
      setIsCreatingFee(true);
      const effectiveDate = feeForm.effectiveFromDate?.trim() || "";
      const dueDate = feeForm.dueDate?.trim() || "";
      const normalizedFeeName = feeForm.feeName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const feeSlug = normalizedFeeName || `fee-${Date.now()}`;
      const feeId = `${schoolId}_${feeSlug}_${academicYear.replace(
        /\s+/g,
        "",
      )}_${term}`;
      const payload: FeeDefinition = {
        id: feeId,
        schoolId,
        feeName: feeForm.feeName.trim(),
        amount,
        classId: feeForm.appliesTo === "class" ? feeForm.classId || null : null,
        academicYear,
        term,
        createdAt: Date.now(),
        createdBy: user.id,
        feeFrequency: feeForm.feeFrequency,
        appliesTo: feeForm.appliesTo,
        effectiveFromDate: effectiveDate || null,
        dueDate: dueDate || null,
        selectedStudentIds:
          feeForm.appliesTo === "selected_students"
            ? feeForm.selectedStudentIds
            : [],
        applyToAcademicYear:
          feeForm.feeFrequency === "per_year"
            ? feeForm.applyToAcademicYear || academicYear
            : null,
        applyToTerm:
          feeForm.feeFrequency === "per_term"
            ? feeForm.applyToTerm || term
            : null,
      };
      await db.saveFee(payload);

      const eligibleStudents = students.filter((student) => {
        return resolveFeeAssignments(student, [payload]).length > 0;
      });

      const nextFees = [...fees, payload];
      for (const student of eligibleStudents) {
        await ensureLedger(student, nextFees);
      }

      showToast("Fee created and ledgers updated.", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user.id,
        actorRole: user.role,
        eventType: "fee_created",
        entityId: payload.id,
        meta: {
          status: "success",
          module: "Fees & Payments",
          feeName: payload.feeName,
          amount: payload.amount,
          appliesTo: payload.appliesTo,
          classId: payload.classId || "",
          actorName: user.fullName || "",
        },
      });
      setFeeForm({
        feeName: "",
        amount: "",
        classId: "",
        feeFrequency: "per_term",
        appliesTo: "all_students",
        effectiveFromDate: "",
        dueDate: "",
        selectedStudentIds: [],
        applyToAcademicYear: "",
        applyToTerm: "",
      });
      await fetchData();
    } catch (error) {
      console.error("Failed to create fee", error);
      showToast("Failed to create fee.", { type: "error" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "fee_create_failed",
        entityId: feeForm.feeName || "",
        meta: {
          status: "failed",
          module: "Fees & Payments",
          feeName: feeForm.feeName || "",
          amount: feeForm.amount || "",
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setIsCreatingFee(false);
    }
  };

  const handleEditFee = (fee: FeeDefinition) => {
    setEditingFeeId(fee.id);
    setFeeForm({
      feeName: fee.feeName || "",
      amount: String(fee.amount || ""),
      classId: fee.classId || "",
      feeFrequency: fee.feeFrequency || "per_term",
      appliesTo: fee.appliesTo || "all_students",
      effectiveFromDate: fee.effectiveFromDate || "",
      dueDate: fee.dueDate || "",
      selectedStudentIds: fee.selectedStudentIds || [],
      applyToAcademicYear: fee.applyToAcademicYear || "",
      applyToTerm: fee.applyToTerm || "",
    });
  };

  const handleUpdateFee = async () => {
    if (!schoolId || !user?.id || !editingFeeId) return;
    if (!feeForm.feeName.trim() || !feeForm.amount) {
      showToast("Enter a fee name and amount.", { type: "error" });
      return;
    }
    const amount = Number(feeForm.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      showToast("Enter a valid amount.", { type: "error" });
      return;
    }
    const existing = fees.find((fee) => fee.id === editingFeeId);
    if (!existing) return;
    try {
      setIsUpdatingFee(true);
      const payload: FeeDefinition = {
        ...existing,
        feeName: feeForm.feeName.trim(),
        amount,
        classId: feeForm.appliesTo === "class" ? feeForm.classId || null : null,
        feeFrequency: feeForm.feeFrequency,
        appliesTo: feeForm.appliesTo,
        effectiveFromDate: feeForm.effectiveFromDate?.trim() || null,
        dueDate: feeForm.dueDate?.trim() || null,
        selectedStudentIds:
          feeForm.appliesTo === "selected_students"
            ? feeForm.selectedStudentIds
            : [],
        applyToAcademicYear:
          feeForm.feeFrequency === "per_year"
            ? feeForm.applyToAcademicYear || academicYear
            : null,
        applyToTerm:
          feeForm.feeFrequency === "per_term"
            ? feeForm.applyToTerm || term
            : null,
        updatedAt: Date.now(),
      } as FeeDefinition & { updatedAt?: number };

      await db.saveFee(payload);

      const impactedStudents = students.filter((student) => {
        return resolveFeeAssignments(student, [payload]).length > 0;
      });
      const nextFees = fees.map((fee) =>
        fee.id === payload.id ? payload : fee,
      );
      for (const student of impactedStudents) {
        await ensureLedger(student, nextFees);
      }

      showToast("Fee updated.", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user.id,
        actorRole: user.role,
        eventType: "fee_updated",
        entityId: payload.id,
        meta: {
          status: "success",
          module: "Fees & Payments",
          feeName: payload.feeName,
          amount: payload.amount,
          appliesTo: payload.appliesTo,
          classId: payload.classId || "",
          actorName: user.fullName || "",
        },
      });
      setEditingFeeId(null);
      setFeeForm({
        feeName: "",
        amount: "",
        classId: "",
        feeFrequency: "per_term",
        appliesTo: "all_students",
        effectiveFromDate: "",
        dueDate: "",
        selectedStudentIds: [],
        applyToAcademicYear: "",
        applyToTerm: "",
      });
      await fetchData();
    } catch (error) {
      console.error("Failed to update fee", error);
      showToast("Failed to update fee.", { type: "error" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "fee_update_failed",
        entityId: editingFeeId,
        meta: {
          status: "failed",
          module: "Fees & Payments",
          feeName: feeForm.feeName || "",
          amount: feeForm.amount || "",
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setIsUpdatingFee(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!schoolId || !user?.id) return;
    if (
      !paymentForm.studentId ||
      !paymentForm.feeId ||
      !paymentForm.amountPaid
    ) {
      showToast("Select student, fee and amount.", { type: "error" });
      return;
    }
    const student = students.find((s) => s.id === paymentForm.studentId);
    const fee = fees.find((f) => f.id === paymentForm.feeId);
    if (!student || !fee) {
      showToast("Invalid student or fee.", { type: "error" });
      return;
    }
    if (resolveFeeAssignments(student, [fee]).length === 0) {
      showToast("Selected fee does not apply to this student.", {
        type: "error",
      });
      return;
    }
    const amountPaid = Number(paymentForm.amountPaid);
    if (Number.isNaN(amountPaid) || amountPaid <= 0) {
      showToast("Enter a valid amount.", { type: "error" });
      return;
    }
    try {
      setIsRecordingPayment(true);
      const paymentId = `${schoolId}_${student.id}_${Date.now()}`;
      const payload: StudentFeePayment = {
        id: paymentId,
        schoolId,
        studentId: student.id,
        classId: student.classId,
        feeId: fee.id,
        feeName: fee.feeName,
        amountPaid,
        paymentMethod: paymentForm.paymentMethod,
        receiptNumber: paymentForm.receiptNumber || null,
        academicYear,
        term,
        createdAt: Date.now(),
        recordedBy: user.id,
      };
      await db.recordStudentPayment(payload);

      const updatedLedger = await ensureLedger(student, fees);
      const ledgerPayments = payments.filter(
        (p) =>
          p.studentId === student.id &&
          p.academicYear === academicYear &&
          p.term === term,
      );
      const totals = await db.computeLedgerTotals(updatedLedger, [
        ...ledgerPayments,
        payload,
      ]);

      showToast(`Payment recorded. Balance: ${formatMoney(totals.balance)}`, {
        type: "success",
      });
      await logActivity({
        schoolId,
        actorUid: user.id,
        actorRole: user.role,
        eventType: "payment_recorded",
        entityId: payload.id,
        meta: {
          status: "success",
          module: "Fees & Payments",
          studentId: student.id,
          studentName: student.name,
          feeName: fee.feeName,
          amountPaid: payload.amountPaid,
          paymentMethod: payload.paymentMethod,
          actorName: user.fullName || "",
        },
      });
      setPaymentForm({
        classId: "",
        studentId: "",
        feeId: "",
        amountPaid: "",
        paymentMethod: "MoMo",
        receiptNumber: "",
      });
      await fetchData();
    } catch (error) {
      console.error("Failed to record payment", error);
      showToast("Failed to record payment.", { type: "error" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "payment_record_failed",
        entityId: paymentForm.studentId || "",
        meta: {
          status: "failed",
          module: "Fees & Payments",
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const openLedgerPayments = (ledgerId: string, studentId: string) => {
    setLedgerPaymentModal({ ledgerId, studentId });
  };

  const startEditPayment = (payment: StudentFeePayment) => {
    setEditingPayment(payment);
    setPaymentEditForm({
      amountPaid: String(payment.amountPaid),
      paymentMethod: payment.paymentMethod,
      receiptNumber: payment.receiptNumber || "",
    });
  };

  const handleSavePaymentEdit = async () => {
    if (!editingPayment) return;
    const amountPaid = Number(paymentEditForm.amountPaid);
    if (Number.isNaN(amountPaid) || amountPaid <= 0) {
      showToast("Enter a valid amount.", { type: "error" });
      return;
    }
    try {
      await db.updateStudentPayment(
        editingPayment.id,
        {
          amountPaid,
          paymentMethod: paymentEditForm.paymentMethod,
          receiptNumber: paymentEditForm.receiptNumber || null,
        },
        schoolId,
      );
      showToast("Payment updated.", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "payment_updated",
        entityId: editingPayment.id,
        meta: {
          status: "success",
          module: "Fees & Payments",
          amountPaid,
          paymentMethod: paymentEditForm.paymentMethod,
          actorName: user?.fullName || "",
        },
      });
      setEditingPayment(null);
      await fetchData();
    } catch (error) {
      console.error("Failed to update payment", error);
      showToast("Failed to update payment.", { type: "error" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "payment_update_failed",
        entityId: editingPayment.id,
        meta: {
          status: "failed",
          module: "Fees & Payments",
          amountPaid,
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    }
  };

  const handleDeleteFee = async (feeId: string) => {
    if (!feeId || !schoolId) return;
    if (deletingFeeId) return;
    setDeletingFeeId(feeId);
    try {
      const feeToDelete = fees.find((fee) => fee.id === feeId);
      await db.deleteFee(feeId, schoolId);

      if (feeToDelete) {
        const allLedgers = await db.getStudentLedgers({
          schoolId,
          academicYear,
          term,
        });
        const impactedLedgers = allLedgers.filter((ledger) =>
          ledger.fees.some((fee) => fee.feeId === feeToDelete.id),
        );
        await Promise.all(
          impactedLedgers.map((ledger) =>
            db.upsertStudentLedger({
              ...ledger,
              fees: ledger.fees.filter((fee) => fee.feeId !== feeToDelete.id),
              updatedAt: Date.now(),
            }),
          ),
        );
      }

      showToast("Fee deleted.", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "fee_deleted",
        entityId: feeId,
        meta: {
          status: "success",
          module: "Fees & Payments",
          feeName: feeToDelete?.feeName || "",
          actorName: user?.fullName || "",
        },
      });
      await fetchData();
    } catch (error) {
      console.error("Failed to delete fee", error);
      showToast("Failed to delete fee.", { type: "error" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "fee_delete_failed",
        entityId: feeId,
        meta: {
          status: "failed",
          module: "Fees & Payments",
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setDeletingFeeId(null);
    }
  };

  const ledgerRows = useMemo(() => {
    return ledgers.map((ledger) => {
      const student = students.find((s) => s.id === ledger.studentId);
      const ledgerPayments = payments.filter(
        (p) =>
          p.studentId === ledger.studentId &&
          p.academicYear === academicYear &&
          p.term === term,
      );
      const totalDue = ledger.fees.reduce((sum, fee) => sum + fee.amount, 0);
      const openingPaid = ledger.fees.reduce(
        (sum, fee) => sum + (fee.openingPaidAmount || 0),
        0,
      );
      const totalPaidSinceOnboarding = ledgerPayments.reduce(
        (sum, payment) => sum + payment.amountPaid,
        0,
      );
      const totalPaid = openingPaid + totalPaidSinceOnboarding;
      const balance = Math.max(0, totalDue - totalPaid);
      const status =
        totalPaid <= 0 ? "unpaid" : balance > 0 ? "part-paid" : "paid";
      return {
        ledger,
        student,
        ledgerPayments,
        totalDue,
        totalPaid,
        totalPaidSinceOnboarding,
        openingPaid,
        balance,
        status,
      };
    });
  }, [ledgers, students, payments, academicYear, term]);

  const filteredLedgerRows = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    return ledgerRows.filter(({ student, status }) => {
      const matchesSearch = queryText
        ? [student?.name, student?.guardianName, student?.guardianPhone]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(queryText))
        : true;
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [ledgerRows, search, statusFilter]);

  const financeMetrics = useMemo(() => {
    let totalDue = 0;
    let totalPaidSinceOnboarding = 0;
    let totalPaidIncludingOpening = 0;
    let defaulters = 0;
    filteredLedgerRows.forEach(
      ({
        totalDue: due,
        totalPaid,
        totalPaidSinceOnboarding: paidSince,
        balance,
      }) => {
        totalDue += due;
        totalPaidSinceOnboarding += paidSince;
        totalPaidIncludingOpening += totalPaid;
        if (balance > 0) defaulters += 1;
      },
    );
    const collectionRate =
      totalDue > 0 ? (totalPaidIncludingOpening / totalDue) * 100 : 0;
    return {
      totalDue,
      totalPaidSinceOnboarding,
      totalPaidIncludingOpening,
      totalOutstanding: Math.max(0, totalDue - totalPaidIncludingOpening),
      defaulters,
      collectionRate,
    };
  }, [filteredLedgerRows]);

  const termScopeLabel = useMemo(() => {
    const className =
      selectedClassId === "all"
        ? "All Classes"
        : CLASSES_LIST.find((cls) => cls.id === selectedClassId)?.name ||
          "Class";
    return `${academicYear} · ${term} · ${className}`;
  }, [academicYear, term, selectedClassId]);

  const onboardingSummary = useMemo(() => {
    return ledgers.reduce(
      (acc, ledger) => {
        acc.openingPaid += ledger.openingPaidAmount || 0;
        acc.openingBalance += ledger.openingBalance || 0;
        return acc;
      },
      { openingPaid: 0, openingBalance: 0 },
    );
  }, [ledgers]);

  const reconciliationStats = useMemo(() => {
    const today = new Date();
    const todayKey = today.toDateString();
    const todayCount = payments.filter(
      (payment) => new Date(payment.createdAt).toDateString() === todayKey,
    ).length;
    const pendingVerification = payments.filter(
      (payment) => !payment.receiptNumber,
    ).length;
    return { todayCount, pendingVerification };
  }, [payments]);

  const feeImpactPreview = useMemo(() => {
    const amount = Number(feeForm.amount);
    const normalizedAmount = Number.isNaN(amount) ? 0 : amount;
    const previewFee: FeeDefinition = {
      id: "preview",
      schoolId: schoolId || "",
      feeName: feeForm.feeName || "Preview",
      amount: normalizedAmount,
      classId: feeForm.appliesTo === "class" ? feeForm.classId || null : null,
      academicYear,
      term,
      createdAt: Date.now(),
      createdBy: user?.id || "",
      feeFrequency: feeForm.feeFrequency,
      appliesTo: feeForm.appliesTo,
      effectiveFromDate: feeForm.effectiveFromDate || null,
      dueDate: feeForm.dueDate || null,
      selectedStudentIds:
        feeForm.appliesTo === "selected_students"
          ? feeForm.selectedStudentIds
          : [],
      applyToAcademicYear:
        feeForm.feeFrequency === "per_year"
          ? feeForm.applyToAcademicYear || academicYear
          : null,
      applyToTerm:
        feeForm.feeFrequency === "per_term"
          ? feeForm.applyToTerm || term
          : null,
    };
    const eligibleStudents = students.filter(
      (student) => resolveFeeAssignments(student, [previewFee]).length > 0,
    );
    return {
      eligibleCount: eligibleStudents.length,
      expectedIncrease: normalizedAmount * eligibleStudents.length,
    };
  }, [academicYear, feeForm, students, term, user?.id, schoolId]);

  const feeHealthChecks = useMemo(() => {
    const warnings: string[] = [];
    fees.forEach((fee) => {
      if (fee.appliesTo === "class" && !fee.classId) {
        warnings.push(
          `"${fee.feeName}" is set to class but no class selected.`,
        );
      }
      if (
        fee.appliesTo === "selected_students" &&
        (!fee.selectedStudentIds || fee.selectedStudentIds.length === 0)
      ) {
        warnings.push(`"${fee.feeName}" has no selected students.`);
      }
      if (fee.feeFrequency === "per_year" && !fee.applyToAcademicYear) {
        warnings.push(`"${fee.feeName}" is per year without an academic year.`);
      }
    });
    return warnings;
  }, [fees]);

  const previousTermMetrics = useMemo(() => {
    const totals = lastTermLedgers.reduce(
      (acc, ledger) => {
        const totalDue = ledger.fees.reduce((sum, fee) => sum + fee.amount, 0);
        const openingPaid = ledger.fees.reduce(
          (sum, fee) => sum + (fee.openingPaidAmount || 0),
          0,
        );
        const termPayments = lastTermPayments.filter(
          (payment) => payment.studentId === ledger.studentId,
        );
        const paidSince = termPayments.reduce(
          (sum, payment) => sum + payment.amountPaid,
          0,
        );
        const totalPaid = openingPaid + paidSince;
        const balance = Math.max(0, totalDue - totalPaid);
        acc.totalDue += totalDue;
        acc.totalPaid += totalPaid;
        if (balance > 0) acc.defaulters += 1;
        return acc;
      },
      { totalDue: 0, totalPaid: 0, defaulters: 0 },
    );
    const collectionRate =
      totals.totalDue > 0 ? (totals.totalPaid / totals.totalDue) * 100 : 0;
    return { ...totals, collectionRate };
  }, [lastTermLedgers, lastTermPayments]);

  const termComparison = useMemo(() => {
    const currentRate = financeMetrics.collectionRate || 0;
    const previousRate = previousTermMetrics.collectionRate || 0;
    const deltaRate = currentRate - previousRate;
    const deltaDefaulters =
      financeMetrics.defaulters - previousTermMetrics.defaulters;
    return { deltaRate, deltaDefaulters };
  }, [
    financeMetrics.collectionRate,
    financeMetrics.defaulters,
    previousTermMetrics,
  ]);

  const recentPayments = useMemo(() => {
    return [...payments]
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      .slice(0, 6);
  }, [payments]);

  const defaulters = useMemo(() => {
    return filteredLedgerRows.filter(
      ({ balance, totalPaid }) => balance > 0 && totalPaid > 0,
    );
  }, [filteredLedgerRows]);

  const onboardingLedgers = useMemo(() => {
    const scopedLedgers =
      selectedClassId === "all"
        ? ledgers
        : ledgers.filter((ledger) => ledger.classId === selectedClassId);
    return scopedLedgers.map((ledger) => {
      const student = students.find((s) => s.id === ledger.studentId);
      const row = ledgerRows.find((r) => r.ledger.id === ledger.id);
      return { ledger, student, row };
    });
  }, [ledgers, students, ledgerRows, selectedClassId]);

  const resolveOpeningForm = (ledgerId: string, feeId?: string) => {
    const existing = ledgers.find((ledger) => ledger.id === ledgerId);
    const key = feeId ? `${ledgerId}::${feeId}` : ledgerId;
    const feeEntry = feeId
      ? existing?.fees.find((fee) => fee.feeId === feeId)
      : undefined;
    return (
      openingLedgerForm[key] || {
        openingStatus:
          feeEntry?.openingStatus || existing?.openingStatus || "Unpaid",
        openingPaidAmount: String(
          feeEntry?.openingPaidAmount ?? existing?.openingPaidAmount ?? "",
        ),
        openingBalance: String(
          feeEntry?.openingBalance ?? existing?.openingBalance ?? "",
        ),
      }
    );
  };

  const handleSaveOnboardingSettings = async (options?: {
    closeOnSuccess?: boolean;
    persistOpeningBalances?: boolean;
  }) => {
    if (!schoolId) return;
    if (isSavingOnboarding) return;
    setIsSavingOnboarding(true);
    const payload: FinanceSettings = {
      schoolId,
      financeVersion: "v2",
      onboardingMode,
      onboardingDate: onboardingDate || null,
    };
    try {
      await db.saveFinanceSettings(payload);
      setFinanceSettings(payload);
      if (options?.persistOpeningBalances) {
        await saveBulkOpeningBalances();
        await fetchData();
      }
      showToast("Onboarding settings saved.", { type: "success" });
      if (options?.closeOnSuccess) {
        setShowOnboardingWizard(false);
        setOnboardingStep(1);
      }
    } catch (error) {
      console.error("Failed to save onboarding settings", error);
      showToast("Failed to save onboarding settings.", { type: "error" });
    } finally {
      setIsSavingOnboarding(false);
    }
  };

  const applyBulkOpeningStatus = async () => {
    if (!schoolId || !bulkOpeningClassId) return;
    if (!selectedOpeningFeeId && fees.length === 0) {
      showToast("Create a fee before applying opening status.", {
        type: "error",
      });
      return;
    }
    try {
      const targetStudents = students.filter(
        (student) => student.classId === bulkOpeningClassId,
      );
      const targetFeeIds = selectedOpeningFeeId
        ? [selectedOpeningFeeId]
        : fees.map((fee) => fee.id);
      const nextEntries: typeof openingLedgerForm = { ...openingLedgerForm };
      targetStudents.forEach((student) => {
        const ledgerId = buildLedgerId(
          schoolId,
          student.id,
          academicYear,
          term,
        );
        targetFeeIds.forEach((feeId) => {
          const key = `${ledgerId}::${feeId}`;
          nextEntries[key] = {
            openingStatus: bulkOpeningStatus,
            openingPaidAmount: bulkOpeningPaidAmount,
            openingBalance: bulkOpeningBalance,
          };
        });
      });
      setOpeningLedgerForm(nextEntries);
      showToast("Bulk opening status applied.", { type: "success" });
    } catch (error) {
      console.error("Failed to apply bulk opening status", error);
      showToast("Failed to apply bulk opening status.", { type: "error" });
    }
  };

  const saveBulkOpeningBalances = async () => {
    if (!schoolId) return;
    const entries = Object.entries(openingLedgerForm);
    if (entries.length === 0) return;
    const formMap = new Map(entries);
    const ledgersToUpdate = ledgers.filter((ledger) =>
      ledger.fees.some((fee) => formMap.has(`${ledger.id}::${fee.feeId}`)),
    );
    for (const ledger of ledgersToUpdate) {
      const updatedFees = ledger.fees.map((fee) => {
        const key = `${ledger.id}::${fee.feeId}`;
        const form = formMap.get(key);
        if (!form) return fee;
        return {
          ...fee,
          openingStatus: form.openingStatus,
          openingPaidAmount: Number(form.openingPaidAmount || 0),
          openingBalance: Number(form.openingBalance || 0),
        };
      });
      const totalDue = updatedFees.reduce((sum, fee) => sum + fee.amount, 0);
      const openingPaidTotal = updatedFees.reduce(
        (sum, fee) => sum + (fee.openingPaidAmount || 0),
        0,
      );
      const openingBalanceTotal = updatedFees.reduce((sum, fee) => {
        const paid = fee.openingPaidAmount || 0;
        const balanceValue =
          fee.openingBalance !== undefined && fee.openingBalance !== null
            ? fee.openingBalance
            : Math.max(0, fee.amount - paid);
        return sum + balanceValue;
      }, 0);
      const openingStatusDerived =
        openingPaidTotal <= 0
          ? "Unpaid"
          : openingPaidTotal >= totalDue
            ? "Paid"
            : "Part-paid";
      const updatedLedger: StudentFeeLedger = {
        ...ledger,
        fees: updatedFees,
        openingStatus: openingStatusDerived,
        openingPaidAmount: openingPaidTotal,
        openingBalance: openingBalanceTotal,
        openingDate: onboardingDate || ledger.openingDate || null,
        updatedAt: Date.now(),
      };
      await db.upsertStudentLedger(updatedLedger);
    }
  };

  const saveOpeningStatusForLedger = async (
    ledger: StudentFeeLedger,
    feeId?: string,
  ) => {
    if (!schoolId) return;
    const form = resolveOpeningForm(ledger.id, feeId);
    const openingPaidAmount = Number(form.openingPaidAmount || 0);
    const openingBalance = Number(form.openingBalance || 0);
    const updatedFees = feeId
      ? ledger.fees.map((fee) =>
          fee.feeId === feeId
            ? {
                ...fee,
                openingStatus: form.openingStatus,
                openingPaidAmount,
                openingBalance,
              }
            : fee,
        )
      : ledger.fees;
    const totalDue = updatedFees.reduce((sum, fee) => sum + fee.amount, 0);
    const openingPaidTotal = updatedFees.reduce(
      (sum, fee) => sum + (fee.openingPaidAmount || 0),
      0,
    );
    const openingBalanceTotal = updatedFees.reduce((sum, fee) => {
      const paid = fee.openingPaidAmount || 0;
      const balanceValue =
        fee.openingBalance !== undefined && fee.openingBalance !== null
          ? fee.openingBalance
          : Math.max(0, fee.amount - paid);
      return sum + balanceValue;
    }, 0);
    const openingStatusDerived =
      openingPaidTotal <= 0
        ? "Unpaid"
        : openingPaidTotal >= totalDue
          ? "Paid"
          : "Part-paid";
    const updatedLedger: StudentFeeLedger = {
      ...ledger,
      fees: updatedFees,
      openingStatus: openingStatusDerived,
      openingPaidAmount: openingPaidTotal,
      openingBalance: openingBalanceTotal,
      openingDate: onboardingDate || ledger.openingDate || null,
      updatedAt: Date.now(),
    };
    try {
      await db.upsertStudentLedger(updatedLedger);
      showToast("Opening status saved.", { type: "success" });
      await fetchData();
    } catch (error) {
      console.error("Failed to save opening status", error);
      showToast("Failed to save opening status.", { type: "error" });
    }
  };

  const collectionTrend = useMemo(() => {
    const now = new Date();
    const termStartDate =
      schoolConfig?.schoolReopenDate || onboardingDate || "";
    const reopenDate = termStartDate
      ? new Date(`${termStartDate}T00:00:00`)
      : null;
    const msInWeek = 7 * 24 * 60 * 60 * 1000;
    const weekIndex = reopenDate
      ? Math.max(
          1,
          Math.floor((now.getTime() - reopenDate.getTime()) / msInWeek) + 1,
        )
      : 1;
    const totalWeeks = weekIndex;
    const startOfWeek = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day;
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const weeks = Array.from({ length: totalWeeks }, (_, index) => {
      const anchor = new Date(now);
      anchor.setDate(anchor.getDate() - 7 * (totalWeeks - 1 - index));
      const start = startOfWeek(anchor);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const labelIndex = totalWeeks - (totalWeeks - 1 - index);
      return { start, end, total: 0, label: `W${labelIndex}` };
    });

    payments.forEach((payment) => {
      const paymentDate = new Date(payment.createdAt);
      weeks.forEach((week) => {
        if (paymentDate >= week.start && paymentDate < week.end) {
          week.total += payment.amountPaid;
        }
      });
    });

    const maxTotal = Math.max(1, ...weeks.map((week) => week.total));
    return weeks.map((week) => ({
      label: week.label,
      value: week.total,
      height: Math.round((week.total / maxTotal) * 100),
    }));
  }, [payments, schoolConfig?.schoolReopenDate, onboardingDate]);

  const [hoveredWeekIndex, setHoveredWeekIndex] = useState<number | null>(null);
  const weeklyTotal = useMemo(
    () => collectionTrend.reduce((sum, item) => sum + item.value, 0),
    [collectionTrend],
  );
  const weeklySegments = useMemo(() => {
    const palette = [
      "#6366F1",
      "#38BDF8",
      "#22C55E",
      "#F59E0B",
      "#F97316",
      "#EC4899",
      "#8B5CF6",
    ];
    let offset = 0;
    const total = weeklyTotal || 1;
    return collectionTrend.map((item, index) => {
      const percentage = (item.value / total) * 100;
      const start = offset;
      offset += percentage;
      return {
        ...item,
        percentage,
        color: palette[index % palette.length],
        start,
      };
    });
  }, [collectionTrend, weeklyTotal]);

  const paymentsSorted = useMemo(() => {
    return [...payments].sort(
      (a, b) => Number(b.createdAt) - Number(a.createdAt),
    );
  }, [payments]);

  const ledgerPayments = useMemo(() => {
    if (!ledgerPaymentModal) return [] as StudentFeePayment[];
    return paymentsSorted.filter(
      (payment) =>
        payment.studentId === ledgerPaymentModal.studentId &&
        payment.academicYear === academicYear &&
        payment.term === term,
    );
  }, [paymentsSorted, ledgerPaymentModal, academicYear, term]);

  const recordPaymentSummary = useMemo(() => {
    if (!paymentForm.studentId || !paymentForm.feeId) return null;
    const ledger = ledgers.find(
      (item) =>
        item.studentId === paymentForm.studentId &&
        item.academicYear === academicYear &&
        item.term === term,
    );
    const feeEntry = ledger?.fees.find(
      (fee) => fee.feeId === paymentForm.feeId,
    );
    const fee = fees.find((item) => item.id === paymentForm.feeId);
    const paidSince = payments
      .filter(
        (payment) =>
          payment.studentId === paymentForm.studentId &&
          payment.feeId === paymentForm.feeId &&
          payment.academicYear === academicYear &&
          payment.term === term,
      )
      .reduce((sum, payment) => sum + payment.amountPaid, 0);
    const paidBefore = feeEntry?.openingPaidAmount || 0;
    const remainingBefore = feeEntry?.openingBalance;
    const totalDue = feeEntry?.amount ?? fee?.amount ?? 0;
    const remaining =
      remainingBefore !== undefined && remainingBefore !== null
        ? Math.max(0, remainingBefore - paidSince)
        : Math.max(0, totalDue - paidBefore - paidSince);
    const totalPaid = paidBefore + paidSince;
    return {
      totalDue,
      totalPaid,
      remaining,
      paidBefore,
      paidSince,
    };
  }, [
    paymentForm.studentId,
    paymentForm.feeId,
    ledgers,
    fees,
    payments,
    academicYear,
    term,
  ]);

  const selectedLedgerSummary = useMemo(() => {
    if (!ledgerPaymentModal) return null;
    const row = ledgerRows.find(
      (item) => item.ledger.id === ledgerPaymentModal.ledgerId,
    );
    if (!row) return null;
    return {
      student: row.student,
      totalDue: row.totalDue,
      openingPaid: row.openingPaid,
      paidSince: row.totalPaidSinceOnboarding,
      balance: row.balance,
    };
  }, [ledgerPaymentModal, ledgerRows]);

  const paginatedPayments = useMemo(() => {
    const start = (paymentPage - 1) * paymentPageSize;
    return paymentsSorted.slice(start, start + paymentPageSize);
  }, [paymentsSorted, paymentPage]);

  const paymentPages = Math.max(
    1,
    Math.ceil(paymentsSorted.length / paymentPageSize),
  );

  const classCollection = useMemo(() => {
    const summary = CLASSES_LIST.map((cls) => {
      const classPayments = payments.filter((p) => p.classId === cls.id);
      const totalPaid = classPayments.reduce((sum, p) => sum + p.amountPaid, 0);
      return { label: cls.name, value: totalPaid };
    });
    return summary
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [payments]);

  return (
    <Layout title="Finance & Payments">
      <div className="relative rounded-[32px] bg-gradient-to-br from-amber-50 via-rose-50 to-violet-100 p-4 sm:p-6 lg:p-8">
        <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.25),_transparent_40%),radial-gradient(circle_at_80%_20%,_rgba(244,114,182,0.25),_transparent_35%),radial-gradient(circle_at_20%_80%,_rgba(139,92,246,0.2),_transparent_40%)]" />
        <div className="relative space-y-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Finance Overview
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">
                Finance & Payments Dashboard
              </h1>
              <p className="text-sm text-slate-500">
                Advanced visibility into fee setup, collections, and defaulters.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] text-slate-600">
                <Filter size={12} /> {termScopeLabel}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                <RefreshCw size={14} /> Refresh
              </button>
              <button
                onClick={handleExportReport}
                disabled={isExporting}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isExporting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                    Exporting...
                  </span>
                ) : (
                  <>
                    <Download size={14} /> Export
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/60 bg-white/75 p-4 shadow-lg shadow-rose-100/40 backdrop-blur">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                Start here
              </span>
              {[
                "1. Set onboarding mode",
                "2. Create fees",
                "3. Assign to classes",
                "4. Record payments",
              ].map((step) => (
                <span
                  key={step}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600"
                >
                  {step}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="xl:col-span-1">
                <label className="text-xs text-slate-500">Academic Year</label>
                <input
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="2024/2025"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Term</label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value as FeeTerm)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  {termOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Class</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="all">All Classes</option>
                  {CLASSES_LIST.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as typeof statusFilter)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  {statusFilters.map((status) => (
                    <option key={status} value={status}>
                      {status === "all" ? "All Status" : status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Date range</label>
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <CalendarRange size={16} className="text-slate-400" />
                  <input
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="w-full bg-transparent text-sm text-slate-700 outline-none"
                    placeholder="This term"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <div className="relative w-full">
                  <Search
                    className="absolute left-3 top-2.5 text-slate-400"
                    size={16}
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-9 py-2 text-sm"
                    placeholder="Search student"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="block lg:hidden">
            <div className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-lg shadow-rose-100/40 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Mobile snapshot
                  </p>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Quick view
                  </h3>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500">
                  {termScopeLabel}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <p className="text-[11px] text-slate-400">Expected</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatMoney(financeMetrics.totalDue)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <p className="text-[11px] text-slate-400">Collected</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatMoney(financeMetrics.totalPaidIncludingOpening)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <p className="text-[11px] text-slate-400">Outstanding</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatMoney(financeMetrics.totalOutstanding)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <p className="text-[11px] text-slate-400">Defaulters</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {financeMetrics.defaulters}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => scrollToSection(feeSetupRef)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                >
                  <Plus size={14} /> Add Fee
                </button>
                <button
                  onClick={() => scrollToSection(recordPaymentRef)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                >
                  <Banknote size={14} /> Record Payment
                </button>
                <button
                  onClick={() => setShowOnboardingWizard(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                >
                  <Users size={14} /> Onboarding
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            {[
              {
                label: "Total Expected",
                value: financeMetrics.totalDue,
                subtitle: "Total due",
                trend: `${termComparison.deltaRate >= 0 ? "+" : ""}${termComparison.deltaRate.toFixed(1)}% vs last term`,
                icon: Wallet,
                accent: "text-indigo-600",
                tooltip:
                  "Total amount the school expects to collect for the selected term and class.",
              },
              {
                label: "Collected (Since Onboarding)",
                value: financeMetrics.totalPaidSinceOnboarding,
                subtitle: "Since onboarding",
                trend: `${termComparison.deltaRate >= 0 ? "+" : ""}${termComparison.deltaRate.toFixed(1)}% vs last term`,
                icon: TrendingUp,
                accent: "text-emerald-600",
                tooltip:
                  "Payments recorded after the onboarding date. Use this to see current-term performance.",
              },
              {
                label: "Collected (All-time)",
                value: financeMetrics.totalPaidIncludingOpening,
                subtitle: "Including opening",
                trend: `${termComparison.deltaRate >= 0 ? "+" : ""}${termComparison.deltaRate.toFixed(1)}% vs last term`,
                icon: TrendingUp,
                accent: "text-emerald-600",
                tooltip:
                  "All collections including opening balances imported at onboarding.",
              },
              {
                label: "Outstanding",
                value: financeMetrics.totalOutstanding,
                subtitle: "Expected - collected",
                trend: `${termComparison.deltaDefaulters >= 0 ? "+" : ""}${termComparison.deltaDefaulters} defaulters vs last term`,
                icon: TrendingDown,
                accent: "text-rose-600",
                tooltip:
                  "What is still owed after all payments and opening balances are applied.",
              },
              {
                label: "Defaulters",
                value: financeMetrics.defaulters,
                subtitle: "With balance",
                trend: `${termComparison.deltaDefaulters >= 0 ? "+" : ""}${termComparison.deltaDefaulters} vs last term`,
                icon: Users,
                accent: "text-amber-600",
                tooltip:
                  "Number of students who still have a balance greater than zero.",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-lg shadow-rose-100/40 backdrop-blur"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      {card.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {card.label === "Defaulters"
                        ? card.value
                        : formatMoney(card.value)}
                    </p>
                  </div>
                  <div
                    className={`rounded-full bg-slate-50 p-2 ${card.accent}`}
                  >
                    <card.icon size={18} />
                  </div>
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
                  {card.subtitle}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  {card.trend.startsWith("-") ? (
                    <ArrowDownRight size={14} className="text-rose-500" />
                  ) : (
                    <ArrowUpRight size={14} className="text-emerald-500" />
                  )}
                  <span>{card.trend}</span>
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                    {card.tooltip}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-rose-100/40 backdrop-blur xl:col-span-2">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.25),_transparent_45%),radial-gradient(circle_at_80%_20%,_rgba(244,114,182,0.2),_transparent_45%)]" />
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Collections Trend
                    </p>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Weekly Collections
                    </h2>
                    <p className="text-xs text-slate-500">
                      Total collected over the last six weeks.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs text-slate-500">
                    <Filter size={14} /> Auto
                  </div>
                </div>

                <div className="mt-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      Total last 7 weeks: {formatMoney(weeklyTotal)}
                    </div>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500">
                      Average:{" "}
                      {formatMoney(weeklyTotal / (collectionTrend.length || 1))}
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex h-[260px] items-center justify-center rounded-3xl border border-white/60 bg-white/70">
                      <SkeletonBlock className="h-40 w-40 rounded-full" />
                    </div>
                  ) : weeklyTotal <= 0 ? (
                    <div className="flex h-[260px] flex-col items-center justify-center gap-3 rounded-3xl border border-white/60 bg-white/70 text-center">
                      <div className="h-12 w-12 rounded-full bg-slate-100" />
                      <div>
                        <p className="text-sm font-semibold text-slate-700">
                          No collections yet
                        </p>
                        <p className="text-xs text-slate-500">
                          Weekly distribution will appear once payments are
                          recorded.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[260px_1fr]">
                      <div className="relative mx-auto flex h-[220px] w-[220px] items-center justify-center">
                        <div
                          className="absolute inset-0 rounded-full shadow-[0_20px_45px_rgba(15,23,42,0.12)]"
                          style={{
                            background: `conic-gradient(${weeklySegments
                              .map(
                                (segment) =>
                                  `${segment.color} ${segment.start}% ${segment.start + segment.percentage}%`,
                              )
                              .join(", ")})`,
                          }}
                        />
                        <div className="absolute inset-[16px] rounded-full bg-white/90 shadow-inner" />
                        <div className="relative flex flex-col items-center justify-center text-center">
                          <span className="text-xs uppercase tracking-[0.25em] text-slate-400">
                            Total
                          </span>
                          <span className="mt-1 text-lg font-semibold text-slate-900">
                            {formatMoney(weeklyTotal)}
                          </span>
                        </div>

                        {hoveredWeekIndex !== null &&
                          weeklySegments[hoveredWeekIndex] && (
                            <div className="absolute -top-10 rounded-full bg-slate-900 px-3 py-1 text-[11px] text-white shadow-lg">
                              {weeklySegments[hoveredWeekIndex].label} •{" "}
                              {formatMoney(
                                weeklySegments[hoveredWeekIndex].value,
                              )}{" "}
                              •{" "}
                              {weeklySegments[
                                hoveredWeekIndex
                              ].percentage.toFixed(1)}
                              %
                            </div>
                          )}

                        <div className="absolute inset-0">
                          {weeklySegments.map((segment, index) => (
                            <button
                              key={segment.label}
                              type="button"
                              onMouseEnter={() => setHoveredWeekIndex(index)}
                              onMouseLeave={() => setHoveredWeekIndex(null)}
                              className="absolute inset-0 rounded-full transition-all duration-300"
                              style={{
                                background: `conic-gradient(transparent 0% ${segment.start}%, rgba(255,255,255,0.5) ${segment.start}% ${segment.start + segment.percentage}%, transparent ${segment.start + segment.percentage}% 100%)`,
                                transform:
                                  hoveredWeekIndex === index
                                    ? "scale(1.02)"
                                    : "scale(1)",
                              }}
                              aria-label={`${segment.label} ${segment.value}`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {weeklySegments.map((segment, index) => (
                          <div
                            key={segment.label}
                            onMouseEnter={() => setHoveredWeekIndex(index)}
                            onMouseLeave={() => setHoveredWeekIndex(null)}
                            className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white/80 px-3 py-2 text-xs text-slate-600 shadow-sm transition hover:shadow-md"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: segment.color }}
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800">
                                {segment.label}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {formatMoney(segment.value)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-rose-100/40 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Collection Rate
                    </h2>
                    <p className="text-xs text-slate-500">
                      Percentage of expected fees collected.
                    </p>
                  </div>
                  <PieChart size={20} className="text-slate-400" />
                </div>
                <div className="mt-6 flex items-center justify-center">
                  <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-slate-50">
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `conic-gradient(#22c55e ${financeMetrics.collectionRate}%, #e2e8f0 0)`,
                      }}
                    />
                    <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white text-2xl font-semibold text-slate-900 shadow-sm">
                      {financeMetrics.collectionRate.toFixed(0)}%
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-center text-xs text-slate-500">
                  {formatMoney(financeMetrics.totalPaidSinceOnboarding)}{" "}
                  collected since onboarding from{" "}
                  {formatMoney(financeMetrics.totalDue)}
                  expected.
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-lg shadow-rose-100/40 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Term comparison
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">
                    Last term vs now
                  </h3>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm">
                      <span className="text-slate-600">Collection rate</span>
                      <span className="font-semibold text-slate-900">
                        {financeMetrics.collectionRate.toFixed(0)}%{" "}
                        {termComparison.deltaRate >= 0 ? (
                          <span className="text-emerald-600">
                            +{termComparison.deltaRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-rose-600">
                            {termComparison.deltaRate.toFixed(1)}%
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm">
                      <span className="text-slate-600">Defaulters</span>
                      <span className="font-semibold text-slate-900">
                        {financeMetrics.defaulters}{" "}
                        {termComparison.deltaDefaulters >= 0 ? (
                          <span className="text-rose-600">
                            +{termComparison.deltaDefaulters}
                          </span>
                        ) : (
                          <span className="text-emerald-600">
                            {termComparison.deltaDefaulters}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-lg shadow-rose-100/40 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Reconciliation
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">
                    Today’s activity
                  </h3>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm">
                      <span className="text-slate-600">Payments today</span>
                      <span className="font-semibold text-slate-900">
                        {reconciliationStats.todayCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm">
                      <span className="text-slate-600">
                        Missing receipt/ref
                      </span>
                      <span className="font-semibold text-slate-900">
                        {reconciliationStats.pendingVerification}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-lg shadow-rose-100/40 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Onboarding summary
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">
                    Opening balances
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Opening paid = amounts collected before onboarding. Opening
                    balance = amounts still owed before onboarding.
                  </p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm">
                      <span className="text-slate-600">Opening paid</span>
                      <span className="font-semibold text-slate-900">
                        {formatMoney(onboardingSummary.openingPaid)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm">
                      <span className="text-slate-600">Opening balance</span>
                      <span className="font-semibold text-slate-900">
                        {formatMoney(onboardingSummary.openingBalance)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-rose-100/40 backdrop-blur xl:col-span-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Collections
                  </p>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Recent Payments
                  </h2>
                  <p className="text-xs text-slate-500">
                    Track latest receipts and verify transactions.
                  </p>
                </div>
                <button
                  onClick={handleExportReport}
                  disabled={isExporting}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isExporting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                      Exporting...
                    </span>
                  ) : (
                    <>
                      <Download size={14} /> Export CSV
                    </>
                  )}
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {loading ? (
                  Array.from({ length: paymentPageSize }).map((_, index) => (
                    <SkeletonBlock key={index} className="h-16 w-full" />
                  ))
                ) : paginatedPayments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                    No payments recorded yet.
                  </div>
                ) : (
                  paginatedPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
                          <Wallet size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {students.find((s) => s.id === payment.studentId)
                              ?.name || payment.studentId}
                          </p>
                          <p className="text-xs text-slate-500">
                            {payment.feeName} • {payment.paymentMethod}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatMoney(payment.amountPaid)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {new Date(payment.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedPayment(payment)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                        >
                          <Eye size={14} /> Details
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing {(paymentPage - 1) * paymentPageSize + 1} -{" "}
                  {Math.min(
                    paymentPage * paymentPageSize,
                    paymentsSorted.length,
                  )}{" "}
                  of {paymentsSorted.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setPaymentPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={paymentPage === 1}
                    className="rounded-full border border-slate-200 px-3 py-1 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() =>
                      setPaymentPage((prev) => Math.min(paymentPages, prev + 1))
                    }
                    disabled={paymentPage === paymentPages}
                    className="rounded-full border border-slate-200 px-3 py-1 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-rose-100/40 backdrop-blur">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">
                    Quick Actions
                  </h3>
                  <BarChart3 size={18} className="text-slate-400" />
                </div>
                <div className="mt-4 grid gap-3">
                  <button
                    onClick={() => setShowOnboardingWizard(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700"
                  >
                    <Users size={16} /> Onboarding Setup
                  </button>
                  <button
                    onClick={() => scrollToSection(feeSetupRef)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700"
                  >
                    <Plus size={16} /> Add Fee
                  </button>
                  <button
                    onClick={() => scrollToSection(recordPaymentRef)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700"
                  >
                    <Banknote size={16} /> Record Payment
                  </button>
                  <button
                    onClick={handleExportReport}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700"
                  >
                    <Download size={16} /> Export Report
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-rose-100/40 backdrop-blur">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">
                    Top Class Collections
                  </h3>
                  <PieChart size={18} className="text-slate-400" />
                </div>
                <div className="mt-4 space-y-3">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                      <SkeletonBlock key={index} className="h-10" />
                    ))
                  ) : classCollection.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      No collections recorded yet.
                    </p>
                  ) : (
                    classCollection.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm"
                      >
                        <span className="text-slate-600">{item.label}</span>
                        <span className="font-semibold text-slate-800">
                          {formatMoney(item.value)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-lg shadow-rose-100/40 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Quick exports
                    </p>
                    <h3 className="text-lg font-semibold text-slate-900">
                      One-click reports
                    </h3>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500">
                    Ready to download
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    onClick={handleExportDefaulters}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600"
                    disabled={activeQuickExport === "defaulters"}
                  >
                    {activeQuickExport === "defaulters" ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                        Downloading...
                      </span>
                    ) : (
                      <>
                        <Download size={14} /> Defaulters list
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleExportWeeklyPayments}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600"
                    disabled={activeQuickExport === "weekly"}
                  >
                    {activeQuickExport === "weekly" ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                        Downloading...
                      </span>
                    ) : (
                      <>
                        <Download size={14} /> Weekly collections
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleExportClassCollections}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 sm:col-span-2"
                    disabled={activeQuickExport === "class"}
                  >
                    {activeQuickExport === "class" ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                        Downloading...
                      </span>
                    ) : (
                      <>
                        <Download size={14} /> By class
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-5 shadow-lg shadow-rose-100/40 backdrop-blur">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_45%),radial-gradient(circle_at_80%_20%,_rgba(14,165,233,0.12),_transparent_45%)]" />
                <div className="relative">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Admin tips
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">
                        Helpful tips
                      </h3>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] text-slate-500">
                      Quick guide
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {[
                      {
                        title: "Set onboarding date",
                        description:
                          "Use this if the school joined mid-term so totals are accurate.",
                      },
                      {
                        title: "Use one-time fees",
                        description:
                          "Best for admission, PTA, or device fees that should not repeat.",
                      },
                      {
                        title: "New students only",
                        description:
                          "Avoid charging legacy balances when importing existing students.",
                      },
                      {
                        title: "Export quickly",
                        description:
                          "Use one-click reports for defaulters, weekly, or class totals.",
                      },
                    ].map((tip) => (
                      <div
                        key={tip.title}
                        className="flex items-start gap-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-3"
                      >
                        <span className="mt-1 flex h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {tip.title}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            {tip.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div
              ref={feeSetupRef}
              className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-rose-100/40 backdrop-blur"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Fee Setup
                  </h2>
                  <p className="text-xs text-slate-500">
                    Define fee types and automatically create ledgers.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white/80 px-3 py-2">
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    Templates
                  </label>
                  <select
                    onChange={(e) => {
                      const template = feeTemplates.find(
                        (item) => item.label === e.target.value,
                      );
                      if (!template) return;
                      setFeeForm((prev) => ({
                        ...prev,
                        feeName: template.value.feeName,
                        feeFrequency: template.value.feeFrequency,
                        appliesTo: template.value.appliesTo,
                      }));
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                    defaultValue=""
                  >
                    <option value="">Choose a template</option>
                    {feeTemplates.map((item) => (
                      <option key={item.label} value={item.label}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
                {feeImpactPreview.eligibleCount > 0 ? (
                  <span>
                    This fee will apply to {feeImpactPreview.eligibleCount}{" "}
                    students and add{" "}
                    {formatMoney(feeImpactPreview.expectedIncrease)} to expected
                    collections.
                  </span>
                ) : (
                  <span>
                    Preview: Select who the fee applies to and enter an amount
                    to see the expected impact.
                  </span>
                )}
              </div>
              {feeHealthChecks.length > 0 && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-700">
                  <p className="font-semibold">Fee setup warnings</p>
                  <ul className="mt-2 space-y-1">
                    {feeHealthChecks.map((warning) => (
                      <li key={warning}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-500">Fee Name</label>
                  <input
                    value={feeForm.feeName}
                    onChange={(e) =>
                      setFeeForm({ ...feeForm, feeName: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Tuition"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Amount (GHS)</label>
                  <input
                    value={feeForm.amount}
                    onChange={(e) =>
                      setFeeForm({ ...feeForm, amount: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="300"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">
                    Fee Frequency
                  </label>
                  <select
                    value={feeForm.feeFrequency}
                    onChange={(e) =>
                      setFeeForm({
                        ...feeForm,
                        feeFrequency: e.target.value as FeeFrequency,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {feeFrequencyOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Applies To</label>
                  <select
                    value={feeForm.appliesTo}
                    onChange={(e) =>
                      setFeeForm({
                        ...feeForm,
                        appliesTo: e.target.value as FeeAppliesTo,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {feeAppliesToOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">
                    Class (optional)
                  </label>
                  <select
                    value={feeForm.classId}
                    onChange={(e) =>
                      setFeeForm((prev) => {
                        const nextClassId = e.target.value;
                        const nextAppliesTo = nextClassId
                          ? "class"
                          : prev.appliesTo === "class"
                            ? "all_students"
                            : prev.appliesTo;
                        return {
                          ...prev,
                          classId: nextClassId,
                          appliesTo: nextAppliesTo as FeeAppliesTo,
                        };
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">All Classes</option>
                    {CLASSES_LIST.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>
                {feeForm.appliesTo === "selected_students" && (
                  <div className="sm:col-span-2">
                    <label className="text-xs text-slate-500">
                      Selected Students
                    </label>
                    <select
                      multiple
                      value={feeForm.selectedStudentIds}
                      onChange={(e) =>
                        setFeeForm({
                          ...feeForm,
                          selectedStudentIds: Array.from(
                            e.target.selectedOptions,
                          ).map((option) => option.value),
                        })
                      }
                      className="mt-1 h-32 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      {students.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Hold Ctrl / Cmd to select multiple students.
                    </p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-slate-500">
                    Effective From
                  </label>
                  <input
                    type="date"
                    value={feeForm.effectiveFromDate}
                    onChange={(e) =>
                      setFeeForm({
                        ...feeForm,
                        effectiveFromDate: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Due Date</label>
                  <input
                    type="date"
                    value={feeForm.dueDate}
                    onChange={(e) =>
                      setFeeForm({ ...feeForm, dueDate: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                {feeForm.feeFrequency === "per_year" && (
                  <div>
                    <label className="text-xs text-slate-500">
                      Apply To Academic Year
                    </label>
                    <input
                      value={feeForm.applyToAcademicYear}
                      onChange={(e) =>
                        setFeeForm({
                          ...feeForm,
                          applyToAcademicYear: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      placeholder={academicYear}
                    />
                  </div>
                )}
                {feeForm.feeFrequency === "per_term" && (
                  <div>
                    <label className="text-xs text-slate-500">
                      Apply To Term
                    </label>
                    <select
                      value={feeForm.applyToTerm}
                      onChange={(e) =>
                        setFeeForm({
                          ...feeForm,
                          applyToTerm: e.target.value as FeeTerm,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Use current term</option>
                      {termOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex items-end">
                  {editingFeeId ? (
                    <div className="flex w-full items-center gap-2">
                      <button
                        onClick={handleUpdateFee}
                        disabled={isUpdatingFee}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isUpdatingFee ? (
                          <span className="flex items-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Updating...
                          </span>
                        ) : (
                          "Update Fee"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFeeId(null);
                          setFeeForm({
                            feeName: "",
                            amount: "",
                            classId: "",
                            feeFrequency: "per_term",
                            appliesTo: "all_students",
                            effectiveFromDate: "",
                            dueDate: "",
                            selectedStudentIds: [],
                            applyToAcademicYear: "",
                            applyToTerm: "",
                          });
                        }}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateFee}
                      disabled={isCreatingFee}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isCreatingFee ? (
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Saving...
                        </span>
                      ) : (
                        <>
                          <Plus size={16} /> Add Fee
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {fees.length === 0 ? (
                  <p className="text-sm text-slate-400">No fees created yet.</p>
                ) : (
                  fees.map((fee) => (
                    <div
                      key={fee.id}
                      className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm transition hover:shadow-md"
                    >
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.08),_transparent_45%)]" />
                      <div className="relative">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {fee.feeName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {(fee.appliesTo === "class" && fee.classId
                                ? CLASSES_LIST.find((c) => c.id === fee.classId)
                                    ?.name
                                : fee.appliesTo === "selected_students"
                                  ? "Selected students"
                                  : fee.appliesTo === "new_students_only"
                                    ? "New students only"
                                    : "All students") || "All students"}
                            </p>
                          </div>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            {formatMoney(fee.amount)}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 uppercase tracking-wide">
                            {(fee.feeFrequency || "per_term").replace("_", " ")}
                          </span>
                          {fee.applyToAcademicYear && (
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                              {fee.applyToAcademicYear}
                            </span>
                          )}
                          {fee.applyToTerm && (
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                              {fee.applyToTerm}
                            </span>
                          )}
                        </div>

                        {(fee.effectiveFromDate || fee.dueDate) && (
                          <div className="mt-3 text-[11px] text-slate-400">
                            {fee.effectiveFromDate && (
                              <span>
                                Starts{" "}
                                {new Date(
                                  fee.effectiveFromDate,
                                ).toLocaleDateString()}
                              </span>
                            )}
                            {fee.effectiveFromDate && fee.dueDate && (
                              <span className="mx-1">•</span>
                            )}
                            {fee.dueDate && (
                              <span>
                                Due {new Date(fee.dueDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="mt-4 flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEditFee(fee)}
                            className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
                          >
                            <FilePenLine size={14} /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteFee(fee.id)}
                            disabled={deletingFeeId === fee.id}
                            className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {deletingFeeId === fee.id ? (
                              <span className="flex items-center gap-2">
                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
                                Deleting...
                              </span>
                            ) : (
                              <>
                                <Trash2 size={14} /> Delete
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div
              ref={recordPaymentRef}
              className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-rose-100/40 backdrop-blur"
            >
              <h2 className="text-lg font-semibold text-slate-900">
                Record Payment
              </h2>
              <p className="text-xs text-slate-500">
                Capture receipts and update balances instantly.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-500">Class</label>
                  <select
                    value={paymentForm.classId}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        classId: e.target.value,
                        studentId: "",
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">All Classes</option>
                    {CLASSES_LIST.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Student</label>
                  <select
                    value={paymentForm.studentId}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        studentId: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Select student</option>
                    {students
                      .filter((student) =>
                        paymentForm.classId
                          ? student.classId === paymentForm.classId
                          : true,
                      )
                      .map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Fee</label>
                  <select
                    value={paymentForm.feeId}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, feeId: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Select fee</option>
                    {fees.map((fee) => (
                      <option key={fee.id} value={fee.id}>
                        {fee.feeName}
                      </option>
                    ))}
                  </select>
                </div>
                {recordPaymentSummary && (
                  <div className="sm:col-span-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-500">
                          Payment summary
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          Paid so far:{" "}
                          {formatMoney(recordPaymentSummary.totalPaid)}
                          <span className="mx-2 text-slate-400">•</span>
                          Remaining:{" "}
                          {formatMoney(recordPaymentSummary.remaining)}
                        </p>
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-[11px] text-slate-500">
                        Due: {formatMoney(recordPaymentSummary.totalDue)}
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-slate-500">Amount Paid</label>
                  <input
                    value={paymentForm.amountPaid}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        amountPaid: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="150"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">
                    Payment Method
                  </label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        paymentMethod: e.target.value as PaymentMethod,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">
                    Receipt / Ref
                  </label>
                  <input
                    value={paymentForm.receiptNumber}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        receiptNumber: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleRecordPayment}
                    disabled={isRecordingPayment}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B4A82] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isRecordingPayment ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Saving...
                      </span>
                    ) : (
                      <>
                        <Banknote size={16} /> Save Payment
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-rose-100/40 backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Student Ledgers
                </h2>
                <p className="text-xs text-slate-500">
                  Balances are computed from payments in real time.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs text-slate-500">
                <Filter size={14} /> {filteredLedgerRows.length} records
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-slate-400">
                    <th className="py-2">Student</th>
                    <th className="py-2">Class</th>
                    <th className="py-2">Total Due</th>
                    <th className="py-2">Paid</th>
                    <th className="py-2">Balance</th>
                    <th className="py-2">Status</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <tr key={index} className="border-t border-slate-100">
                        <td className="py-3" colSpan={7}>
                          <SkeletonBlock className="h-6 w-full" />
                        </td>
                      </tr>
                    ))
                  ) : filteredLedgerRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-6 text-center text-slate-400"
                      >
                        No ledgers available for this term.
                      </td>
                    </tr>
                  ) : (
                    filteredLedgerRows.map(
                      ({
                        ledger,
                        student,
                        totalDue,
                        totalPaid,
                        balance,
                        status,
                      }) => (
                        <tr
                          key={ledger.id}
                          className="border-t border-slate-100"
                        >
                          <td className="py-3 font-medium text-slate-800">
                            {student?.name || ledger.studentId}
                          </td>
                          <td className="py-3 text-slate-500">
                            {CLASSES_LIST.find(
                              (cls) => cls.id === ledger.classId,
                            )?.name || "-"}
                          </td>
                          <td className="py-3 text-slate-600">
                            {formatMoney(totalDue)}
                          </td>
                          <td className="py-3 text-slate-600">
                            {formatMoney(totalPaid)}
                          </td>
                          <td className="py-3 text-slate-600">
                            {formatMoney(balance)}
                          </td>
                          <td className="py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                status === "paid"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : status === "part-paid"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() =>
                                openLedgerPayments(ledger.id, ledger.studentId)
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                            >
                              <FilePenLine size={14} /> Edit
                            </button>
                          </td>
                        </tr>
                      ),
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-rose-100/40 backdrop-blur">
              <h2 className="text-lg font-semibold text-slate-900">
                Defaulters
              </h2>
              <p className="text-xs text-slate-500">
                Students with outstanding balances.
              </p>
              <div className="mt-4 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                {loading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <SkeletonBlock key={index} className="h-12" />
                  ))
                ) : defaulters.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No defaulters for selected term.
                  </p>
                ) : (
                  defaulters.map(({ ledger, student, balance }) => (
                    <div
                      key={ledger.id}
                      className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/40 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {student?.name || ledger.studentId}
                        </p>
                        <p className="text-xs text-slate-500">
                          {CLASSES_LIST.find((cls) => cls.id === ledger.classId)
                            ?.name || ""}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-rose-700">
                        {formatMoney(balance)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-rose-100/40 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Finance onboarding
                  </p>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Onboarding Setup
                  </h2>
                  <p className="text-xs text-slate-500">
                    Configure onboarding mode, date, and opening balances.
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] text-slate-500">
                  {onboardingMode === "fresh_start"
                    ? "Fresh start"
                    : "Full history"}
                </span>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                  <span className="text-slate-500">Onboarding date</span>
                  <span className="font-semibold text-slate-800">
                    {onboardingDate
                      ? new Date(onboardingDate).toLocaleDateString()
                      : "Not set"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                  <span className="text-slate-500">Opening paid</span>
                  <span className="font-semibold text-slate-800">
                    {formatMoney(onboardingSummary.openingPaid)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                  <span className="text-slate-500">Opening balance</span>
                  <span className="font-semibold text-slate-800">
                    {formatMoney(onboardingSummary.openingBalance)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowOnboardingWizard(true)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                <Users size={16} /> Open Onboarding Wizard
              </button>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-rose-100/40 backdrop-blur">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(244,114,182,0.18),_transparent_45%),radial-gradient(circle_at_80%_20%,_rgba(251,191,36,0.18),_transparent_45%)]" />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Insights
                    </p>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Finance Signals
                    </h2>
                    <p className="text-xs text-slate-500">
                      Quick narrative insights for leadership.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/80 px-3 py-2 text-right text-xs text-slate-500 shadow-sm">
                    <div className="text-[10px] uppercase tracking-[0.2em]">
                      Collection Rate
                    </div>
                    <div className="text-base font-semibold text-slate-900">
                      {financeMetrics.collectionRate.toFixed(0)}%
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
                  <p className="font-semibold text-slate-600">Quick guide</p>
                  <ul className="mt-2 space-y-1">
                    <li>
                      • Fresh start uses opening balances to represent past
                      payments.
                    </li>
                    <li>
                      • Full history is for schools importing all old
                      transactions.
                    </li>
                    <li>
                      • The onboarding date separates “since onboarding” from
                      “all-time” totals.
                    </li>
                  </ul>
                </div>

                <div className="mt-5 grid gap-4">
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                        <Wallet size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Collections Performance
                        </p>
                        <p className="text-xs text-slate-500">
                          {financeMetrics.collectionRate.toFixed(0)}% of
                          expected fees collected (including opening).
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                        <Users size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Outstanding Balances
                        </p>
                        <p className="text-xs text-slate-500">
                          {financeMetrics.defaulters} students still owe
                          balances.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <TrendingUp size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Growth Signal
                        </p>
                        <p className="text-xs text-slate-500">
                          Largest payments are coming from top classes above.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {selectedPayment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur">
              <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className="flex items-start justify-between bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-6 py-5 text-white">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/70">
                      Receipt
                    </p>
                    <h3 className="text-xl font-semibold">Payment Details</h3>
                  </div>
                  <button
                    onClick={() => setSelectedPayment(null)}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="px-6 py-6">
                  <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-indigo-500">
                        Amount Paid
                      </p>
                      <p className="text-2xl font-semibold text-slate-900">
                        {formatMoney(selectedPayment.amountPaid)}
                      </p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-600">
                      {selectedPayment.paymentMethod}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 text-sm text-slate-600">
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                      <span className="text-slate-500">Student</span>
                      <span className="font-medium text-slate-800">
                        {students.find(
                          (s) => s.id === selectedPayment.studentId,
                        )?.name || selectedPayment.studentId}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                      <span className="text-slate-500">Fee</span>
                      <span className="font-medium text-slate-800">
                        {selectedPayment.feeName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                      <span className="text-slate-500">Receipt</span>
                      <span className="font-medium text-slate-800">
                        {selectedPayment.receiptNumber || "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                      <span className="text-slate-500">Date</span>
                      <span className="font-medium text-slate-800">
                        {new Date(selectedPayment.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
                  <div className="text-xs text-slate-500">
                    Transaction recorded by finance team.
                  </div>
                  <button
                    onClick={() => setSelectedPayment(null)}
                    className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
          {ledgerPaymentModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur">
              <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className="flex items-start justify-between bg-gradient-to-r from-amber-500 via-rose-500 to-violet-500 px-6 py-5 text-white">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/70">
                      Student Payments
                    </p>
                    <h3 className="text-xl font-semibold">
                      Edit Recorded Payments
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      setLedgerPaymentModal(null);
                      setEditingPayment(null);
                    }}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="px-6 py-6">
                  {selectedLedgerSummary && (
                    <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-indigo-500">
                        Balance timeline
                      </p>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                        <div className="rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-xs text-slate-600">
                          <span className="block text-[11px] text-slate-400">
                            Total Due
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {formatMoney(selectedLedgerSummary.totalDue)}
                          </span>
                        </div>
                        <div className="rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-xs text-slate-600">
                          <span className="block text-[11px] text-slate-400">
                            Opening Paid
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {formatMoney(selectedLedgerSummary.openingPaid)}
                          </span>
                        </div>
                        <div className="rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-xs text-slate-600">
                          <span className="block text-[11px] text-slate-400">
                            Paid Since Onboarding
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {formatMoney(selectedLedgerSummary.paidSince)}
                          </span>
                        </div>
                        <div className="rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-xs text-slate-600">
                          <span className="block text-[11px] text-slate-400">
                            Current Balance
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {formatMoney(selectedLedgerSummary.balance)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {ledgerPayments.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                        No payments recorded for this student yet.
                      </div>
                    ) : (
                      ledgerPayments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {payment.feeName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {payment.paymentMethod} •{" "}
                              {new Date(payment.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-slate-800">
                              {formatMoney(payment.amountPaid)}
                            </span>
                            <button
                              onClick={() => startEditPayment(payment)}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                            >
                              <FilePenLine size={14} /> Edit
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {editingPayment && (
                    <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-amber-500">
                            Edit Payment
                          </p>
                          <p className="text-sm font-semibold text-slate-900">
                            {editingPayment.feeName}
                          </p>
                        </div>
                        <button
                          onClick={() => setEditingPayment(null)}
                          className="text-xs font-semibold text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div>
                          <label className="text-xs text-slate-500">
                            Amount
                          </label>
                          <input
                            value={paymentEditForm.amountPaid}
                            onChange={(e) =>
                              setPaymentEditForm({
                                ...paymentEditForm,
                                amountPaid: e.target.value,
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">
                            Method
                          </label>
                          <select
                            value={paymentEditForm.paymentMethod}
                            onChange={(e) =>
                              setPaymentEditForm({
                                ...paymentEditForm,
                                paymentMethod: e.target.value as PaymentMethod,
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            {paymentMethods.map((method) => (
                              <option key={method} value={method}>
                                {method}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">
                            Receipt / Ref
                          </label>
                          <input
                            value={paymentEditForm.receiptNumber}
                            onChange={(e) =>
                              setPaymentEditForm({
                                ...paymentEditForm,
                                receiptNumber: e.target.value,
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={handleSavePaymentEdit}
                          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {showOnboardingWizard && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur">
              <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className="flex items-start justify-between bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 px-6 py-5 text-white">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/70">
                      Finance Onboarding
                    </p>
                    <h3 className="text-xl font-semibold">
                      Onboarding Setup Wizard
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowOnboardingWizard(false)}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`rounded-full border px-3 py-1 ${
                          onboardingStep === step
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                            : "border-slate-200"
                        }`}
                      >
                        Step {step}
                      </div>
                    ))}
                  </div>

                  {onboardingStep === 1 && (
                    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs text-slate-500">
                          Onboarding Mode
                        </label>
                        <select
                          value={onboardingMode}
                          onChange={(e) =>
                            setOnboardingMode(e.target.value as OnboardingMode)
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        >
                          <option value="fresh_start">
                            Fresh Start (Recommended)
                          </option>
                          <option value="full_history">
                            Full History Import
                          </option>
                        </select>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Fresh start uses opening balances; full history keeps
                          past transactions.
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">
                          Onboarding Date
                        </label>
                        <input
                          type="date"
                          value={onboardingDate}
                          onChange={(e) => setOnboardingDate(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          onClick={() => {
                            void handleSaveOnboardingSettings();
                          }}
                          disabled={isSavingOnboarding}
                          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {isSavingOnboarding ? (
                            <span className="flex items-center gap-2">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Saving...
                            </span>
                          ) : (
                            "Save Settings"
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {onboardingStep === 2 && (
                    <div className="mt-6">
                      <p className="text-sm text-slate-600">
                        Configure fee frequency and applicability in the Fee
                        Setup section. One-time fees can be set to apply only to
                        new students to avoid inflating expected balances.
                      </p>
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-400">
                        Tip: Set Admission fee as One-time + New students only.
                      </div>
                    </div>
                  )}

                  {onboardingStep === 3 && (
                    <div className="mt-6">
                      <p className="text-sm text-slate-600">
                        Assign fees to all students, specific classes, or
                        selected students. Use the "Applies To" field in Fee
                        Setup.
                      </p>
                    </div>
                  )}

                  {onboardingStep === 4 && (
                    <div className="mt-6 space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                        <p className="text-sm font-semibold text-slate-900">
                          Bulk Opening Status
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Sets opening balances for all students in a class to
                          reflect payments made before onboarding.
                        </p>
                        <div className="mt-3">
                          <label className="text-xs text-slate-500">
                            Filter Fee for Opening Status
                          </label>
                          <select
                            value={selectedOpeningFeeId}
                            onChange={(e) =>
                              setSelectedOpeningFeeId(e.target.value)
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          >
                            <option value="">All fees (bulk)</option>
                            {fees.map((fee) => (
                              <option key={fee.id} value={fee.id}>
                                {fee.feeName}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                          <div>
                            <label className="text-xs text-slate-500">
                              Class
                            </label>
                            <select
                              value={bulkOpeningClassId}
                              onChange={(e) =>
                                setBulkOpeningClassId(e.target.value)
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            >
                              <option value="">Select class</option>
                              {CLASSES_LIST.map((cls) => (
                                <option key={cls.id} value={cls.id}>
                                  {cls.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">
                              Status
                            </label>
                            <select
                              value={bulkOpeningStatus}
                              onChange={(e) =>
                                setBulkOpeningStatus(
                                  e.target.value as
                                    | "Paid"
                                    | "Part-paid"
                                    | "Unpaid",
                                )
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            >
                              <option value="Paid">Paid</option>
                              <option value="Part-paid">Part-paid</option>
                              <option value="Unpaid">Unpaid</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">
                              Opening Paid
                            </label>
                            <input
                              value={bulkOpeningPaidAmount}
                              onChange={(e) =>
                                setBulkOpeningPaidAmount(e.target.value)
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              placeholder="0"
                            />
                            <p className="mt-1 text-[11px] text-slate-400">
                              Amount already paid before onboarding.
                            </p>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">
                              Opening Balance
                            </label>
                            <input
                              value={bulkOpeningBalance}
                              onChange={(e) =>
                                setBulkOpeningBalance(e.target.value)
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              placeholder="0"
                            />
                            <p className="mt-1 text-[11px] text-slate-400">
                              Remaining amount owed before onboarding.
                            </p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <button
                            onClick={applyBulkOpeningStatus}
                            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                          >
                            Apply to Class
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {onboardingLedgers
                          .filter(({ ledger }) =>
                            selectedOpeningFeeId
                              ? ledger.fees.some(
                                  (fee) => fee.feeId === selectedOpeningFeeId,
                                )
                              : true,
                          )
                          .map(({ ledger, student }) => {
                            const feeMatch = selectedOpeningFeeId
                              ? ledger.fees.find(
                                  (fee) => fee.feeId === selectedOpeningFeeId,
                                )
                              : undefined;
                            const form = resolveOpeningForm(
                              ledger.id,
                              feeMatch?.feeId,
                            );
                            return (
                              <div
                                key={ledger.id}
                                className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3"
                              >
                                <div className="min-w-[160px]">
                                  <p className="text-sm font-semibold text-slate-900">
                                    {student?.name || ledger.studentId}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {CLASSES_LIST.find(
                                      (cls) => cls.id === ledger.classId,
                                    )?.name || ""}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">
                                    Status
                                  </label>
                                  <select
                                    value={form.openingStatus}
                                    onChange={(e) =>
                                      setOpeningLedgerForm((prev) => ({
                                        ...prev,
                                        [`${ledger.id}::${feeMatch?.feeId}`]: {
                                          ...form,
                                          openingStatus: e.target.value as
                                            | "Paid"
                                            | "Part-paid"
                                            | "Unpaid",
                                        },
                                      }))
                                    }
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                                  >
                                    <option value="Paid">Paid</option>
                                    <option value="Part-paid">Part-paid</option>
                                    <option value="Unpaid">Unpaid</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">
                                    Opening Paid
                                  </label>
                                  <input
                                    value={form.openingPaidAmount}
                                    onChange={(e) =>
                                      setOpeningLedgerForm((prev) => ({
                                        ...prev,
                                        [`${ledger.id}::${feeMatch?.feeId}`]: {
                                          ...form,
                                          openingPaidAmount: e.target.value,
                                        },
                                      }))
                                    }
                                    className="mt-1 w-24 rounded-xl border border-slate-200 px-3 py-2 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">
                                    Opening Balance
                                  </label>
                                  <input
                                    value={form.openingBalance}
                                    onChange={(e) =>
                                      setOpeningLedgerForm((prev) => ({
                                        ...prev,
                                        [`${ledger.id}::${feeMatch?.feeId}`]: {
                                          ...form,
                                          openingBalance: e.target.value,
                                        },
                                      }))
                                    }
                                    className="mt-1 w-24 rounded-xl border border-slate-200 px-3 py-2 text-xs"
                                  />
                                </div>
                                <button
                                  onClick={() =>
                                    saveOpeningStatusForLedger(
                                      ledger,
                                      feeMatch?.feeId,
                                    )
                                  }
                                  className="ml-auto rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                                >
                                  Save
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    Step {onboardingStep} of 4
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setOnboardingStep((prev) => Math.max(1, prev - 1))
                      }
                      className="rounded-full border border-slate-200 px-4 py-2 text-xs"
                      disabled={onboardingStep === 1}
                    >
                      Back
                    </button>
                    {onboardingStep < 4 ? (
                      <button
                        onClick={() =>
                          setOnboardingStep((prev) => Math.min(4, prev + 1))
                        }
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          void handleSaveOnboardingSettings({
                            closeOnSuccess: true,
                            persistOpeningBalances: true,
                          });
                        }}
                        disabled={isSavingOnboarding}
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isSavingOnboarding ? (
                          <span className="flex items-center gap-2">
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Saving...
                          </span>
                        ) : (
                          "Save"
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default FeesPayments;
