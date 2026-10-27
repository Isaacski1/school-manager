import React, { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../../services/mockDb";
import { StudentFeeLedger, StudentFeePayment, FeeDefinition, Student, FeeTerm } from "../../types";
import { Calendar, CreditCard, CheckCircle, AlertTriangle, Clock, Download, Loader2 } from "lucide-react";
import { useSchool } from "../../context/SchoolContext";
import { CLASSES_LIST } from "../../constants";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import PaymentModal from "./PaymentModal";
import InvoiceTemplate from "./InvoiceTemplate";
import { showToast } from "../../services/toast";
import { auth, storage } from "../../services/firebase";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import html2pdf from "html2pdf.js";
import { API_BASE_URL } from "../../src/config";
import { useAuth } from "../../context/AuthContext";
import { logActivity } from "../../services/activityLog";
import {
  getParentFeeTotals,
  normalizeParentFeeTerm,
} from "../../services/parentFees";
import { buildParentPaymentHistory } from "../../services/parentFeeData";
import { loadParentLedgers } from "../../services/parentLedgerSource";

interface FeesViewProps {
  student: Student;
  onClose?: () => void;
}

const FeesView: React.FC<FeesViewProps> = ({ student, onClose }) => {
  const { school } = useSchool();
  const { user } = useAuth();
  const userSelectedTermRef = useRef(false);
  const [ledgers, setLedgers] = useState<StudentFeeLedger[]>([]);
  const [feeDefinitions, setFeeDefinitions] = useState<FeeDefinition[]>([]);
  const [payments, setPayments] = useState<StudentFeePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState<FeeTerm | "all">(() => {
    return "Term 1";
  });
  const [academicYear, setAcademicYear] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(`fees-selected-year-${student.id}`) || "";
    }
    return "";
  });
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedFeeToPay, setSelectedFeeToPay] = useState<{ id: string, name: string } | null>(null);
  const [lastPaymentInfo, setLastPaymentInfo] = useState<{ reference: string; amount: number; date: number } | null>(null);
  const activeSubaccountCode =
    school?.paymentSettings?.status === "active" &&
    school?.paymentSettings?.isVerified === true
      ? school.paymentSettings.subaccountCode
      : undefined;

  useEffect(() => {
    sessionStorage.setItem(`fees-selected-term-${student.id}`, selectedTerm);
    if (academicYear) {
      sessionStorage.setItem(`fees-selected-year-${student.id}`, academicYear);
    }
  }, [selectedTerm, academicYear, student.id]);

  // More reliable: convert an image URL to base64 using Canvas
  const urlToBase64 = (url: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // IMPORTANT

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas context not available"));

          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => reject(new Error("Failed to load image for base64"));
      img.src = url;
    });

  const waitForNextPaint = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  const getStudentCreatedAtMs = () => {
    if (!student.createdAt) return null;
    const value =
      student.createdAt instanceof Date
        ? student.createdAt.getTime()
        : new Date(student.createdAt).getTime();
    return Number.isNaN(value) ? null : value;
  };

  const isStudentNewForAdmissionFee = () => {
    const createdAtMs = getStudentCreatedAtMs();
    if (createdAtMs === null) return false;
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - createdAtMs <= oneWeekMs;
  };

  const isAdmissionFeeNewStudentsOnly = (feeName: string, fees: FeeDefinition[]) => {
    const fee = fees.find(f => f.feeName === feeName);
    return fee && fee.appliesTo === "new_students_only" && fee.feeFrequency === "one_time";
  };

  const isFeeApplicableToStudent = (fee: FeeDefinition, currentYear: string, schoolReopenDate?: string) => {
    if (fee.academicYear !== currentYear) return false;
    if (fee.feeFrequency === "per_year" && fee.applyToAcademicYear && fee.applyToAcademicYear !== currentYear) {
      return false;
    }
    if (fee.feeFrequency === "per_term" && fee.applyToTerm && fee.applyToTerm !== fee.term) {
      return false;
    }

    switch (fee.appliesTo || "all_students") {
       case "class":
         if (fee.classIds && fee.classIds.length > 0) {
           return fee.classIds.includes(student.classId);
         }
         return !fee.classId || fee.classId === student.classId;
      case "selected_students":
        return fee.selectedStudentIds?.includes(student.id) || false;
      case "new_students_only": {
        const createdAtMs = getStudentCreatedAtMs();
        if (createdAtMs === null) return true;
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
        return Date.now() - createdAtMs <= oneWeekMs;
      }
      case "all_students":
      default:
        return true;
    }
  };

  const generateSinglePagePdfBlob = async (
    element: HTMLElement,
  ): Promise<Blob> => {
    const canvas = await html2canvas(element, {
      scale: 1.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.8);
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [canvas.width / 1.5, canvas.height / 1.5],
    });

    pdf.addImage(
      imgData,
      "JPEG",
      0,
      0,
      canvas.width / 1.5,
      canvas.height / 1.5,
    );
    return pdf.output("blob");
  };

  useEffect(() => {
    async function fetchFeeData() {
      if (!student.schoolId || !student.classId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Resolve academic year to fetch
        let yearToFetch = academicYear;
        let schoolReopenDate = "";
        let schoolConfig: any = null;
        try {
          schoolConfig = await db.getSchoolConfig(student.schoolId);
          schoolReopenDate = schoolConfig?.schoolReopenDate || "";
          if (!userSelectedTermRef.current) {
            const configuredTerm = schoolConfig?.currentTerm as FeeTerm | undefined;
            if (configuredTerm && ["Term 1", "Term 2", "Term 3"].includes(configuredTerm)) {
              setSelectedTerm(configuredTerm);
            }
          }
        } catch (e) {
          console.error("[FeesView] Error fetching school config:", e);
        }

        if (!yearToFetch) {
            if (schoolConfig && schoolConfig.academicYear) {
              yearToFetch = schoolConfig.academicYear;
            } else {
              yearToFetch = "2023-2024";
            }
            setAcademicYear(yearToFetch);
        }

        // Fetch ALL fee ledgers for the student to discover available years.
        // The Parent loader merges the two storage layouts so a carry-forward
        // entry is never lost when a school holds both copies of a ledger.
        const allLedgers = await loadParentLedgers({
          schoolId: student.schoolId,
          studentId: student.id,
        });

        // Extract unique years
        const yearsSet = new Set<string>();
        allLedgers.forEach(l => {
          if (l.academicYear) yearsSet.add(l.academicYear);
        });
        if (yearToFetch) yearsSet.add(yearToFetch);
        
        // Sort descending (e.g. 2024-2025, 2023-2024)
        const sortedYears = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
        setAvailableYears(sortedYears);

        // Fetch fee definitions (including global ones)
        const feeData = await db.getFees({
          schoolId: student.schoolId,
          academicYear: yearToFetch,
          // Remove classId here so we get global fees too
        });
        
        // Filter in memory to show global fees + class specific fees
        const relevantFees = feeData.filter(f => isFeeApplicableToStudent(f, yearToFetch, schoolReopenDate));
        setFeeDefinitions(relevantFees);

        // Filter ledgers for the selected year. If a newly-added student does
        // not have ledger rows yet, project the balance from fee definitions so
        // the parent still sees what the child owes.
        const studentLedgers = allLedgers.filter(l => l.academicYear === yearToFetch);
        if (studentLedgers.length > 0 || relevantFees.length === 0) {
          setLedgers(studentLedgers);
        } else {
          const virtualLedgers = termOptions
            .map((term) => {
              const termFees = relevantFees.filter((fee) => fee.term === term);
              if (termFees.length === 0) return null;

              return {
                id: `virtual_${student.id}_${yearToFetch}_${term}`,
                schoolId: student.schoolId,
                studentId: student.id,
                classId: student.classId,
                academicYear: yearToFetch,
                term,
                fees: termFees.map((fee) => ({
                  feeId: fee.id,
                  feeName: fee.feeName,
                  amount: fee.amount,
                  openingPaidAmount: 0,
                  openingStatus: "Unpaid" as const,
                })),
                openingPaidAmount: 0,
                openingStatus: "Unpaid" as const,
                createdAt: Date.now(),
              } satisfies StudentFeeLedger;
            })
            .filter(Boolean) as StudentFeeLedger[];

          setLedgers(virtualLedgers);
        }

        // 3. Fetch payments for the student
        const paymentData = await db.getPayments({
          schoolId: student.schoolId,
          studentId: student.id
        });
        setPayments(paymentData);

      } catch (error) {
        console.error("[FeesView] Error fetching fee data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchFeeData();
  }, [student.schoolId, student.classId, student.id, academicYear]);

  const termOptions: FeeTerm[] = ["Term 1", "Term 2", "Term 3"];
  const handleTermChange = (term: FeeTerm | "all") => {
    userSelectedTermRef.current = true;
    setSelectedTerm(term);
  };

  const feeSummary = useMemo(
    () => getParentFeeTotals(ledgers, payments, selectedTerm, academicYear),
    [ledgers, payments, selectedTerm, academicYear],
  );
  const enrichedLedgers = feeSummary.enrichedLedgers;
  const billLedgers = feeSummary.billLedgers;
  const totalStats = feeSummary.totals;
  const feeState = feeSummary.summary;

  // Fee id -> fee name, used to describe what a payment was allocated toward.
  const feeNameById = useMemo(() => {
    const map = new Map<string, string>();
    enrichedLedgers.forEach((ledger) => {
      (ledger.allFees || []).forEach((fee) => {
        if (fee.feeId && !map.has(fee.feeId)) map.set(fee.feeId, fee.feeName);
      });
    });
    return map;
  }, [enrichedLedgers]);

  const visiblePayments = useMemo(
    () =>
      buildParentPaymentHistory(payments, {
        studentId: student.id,
        academicYear,
        term: selectedTerm,
        feeIds: enrichedLedgers.flatMap((ledger) =>
          (ledger.allFees || []).map((fee) => fee.feeId),
        ),
        feeNameById,
      }),
    [
      payments,
      academicYear,
      selectedTerm,
      enrichedLedgers,
      feeNameById,
      student.id,
    ],
  );

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "Paid":
        return "parent-fee-status parent-fee-status-paid bg-green-100 text-green-700 border-green-300";
      case "Part-paid":
        return "parent-fee-status parent-fee-status-part-paid bg-yellow-100 text-yellow-700 border-yellow-300";
      case "Unpaid":
        return "parent-fee-status parent-fee-status-unpaid bg-red-100 text-red-700 border-red-300";
      default:
        return "bg-gray-100 text-gray-600 border-gray-300";
    }
  };

  const formatCurrency = (amount: number) => {
    return `GHS ${amount.toFixed(2)}`;
  };

  // Firestore timestamps, ISO strings and epoch numbers all have to render.
  const formatPaymentDate = (value: any) => {
    if (!value) return "";
    if (value instanceof Date) return value.toLocaleDateString();
    if (typeof value.toDate === "function") return value.toDate().toLocaleDateString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString();
  };

  // ---------------------------------------------------------------------------
  // Financial presentation.
  //
  // Every number below comes from the verified financial engine
  // (services/parentFees.js). The component never calculates a balance.
  // ---------------------------------------------------------------------------
  const compactPeriodKey = (value?: string) =>
    String(value || "").replace(/\s+/g, "").toLowerCase();

  const carryForward = feeState.carryForward;
  const previousTermBalance = carryForward ? carryForward.remaining : 0;
  const carryForwardCarried = carryForward ? carryForward.amount : 0;
  const carryForwardPaid = carryForward ? carryForward.paid : 0;

  const carryForwardSourceLabel = carryForward
    ? carryForward.entries.length === 1
      ? `Carried over from ${carryForward.entries[0].fromTerm}, ${carryForward.entries[0].fromAcademicYear}`
      : `Carried over from ${carryForward.entries.length} previous terms`
    : "No previous term balance carried forward";

  const previousTermHint = carryForward
    ? carryForward.outstanding
      ? `${carryForwardSourceLabel} · GHS ${carryForwardCarried.toFixed(2)} carried, GHS ${carryForwardPaid.toFixed(2)} paid`
      : `${carryForwardSourceLabel} · Fully cleared`
    : carryForwardSourceLabel;

  const paymentsHint =
    feeState.unallocatedPaid > 0
      ? `Includes ${formatCurrency(feeState.unallocatedPaid)} applied to overall balance`
      : "Payments credited to this period";

  const feeSummaryRows = [
    {
      key: "previous-term-balance",
      label: "Previous Term Balance",
      hint: previousTermHint,
      value: previousTermBalance,
      className: "text-amber-700",
      color: "#b45309",
      emphasis: false,
    },
    {
      key: "current-term-fees",
      label: "Current Term Fees",
      hint: "Current term fees, carry-forward excluded",
      value: feeState.currentTermFees,
      className: "text-slate-800",
      color: "#1f2937",
      emphasis: false,
    },
    {
      key: "total-amount-due",
      label: "Total Amount Due",
      hint: "Carried balance + current term fees",
      value: feeState.totalDue,
      className: "text-blue-700",
      color: "#1d4ed8",
      emphasis: true,
    },
    {
      key: "payments",
      label: "Payments",
      hint: paymentsHint,
      value: feeState.totalPaid,
      className: "text-green-600",
      color: "#15803d",
      emphasis: false,
    },
    {
      key: "remaining-balance",
      label: "Remaining Balance",
      hint: "Total amount due - payments",
      value: feeState.remaining,
      className: feeState.remaining > 0 ? "text-red-600" : "text-green-600",
      color: feeState.remaining > 0 ? "#dc2626" : "#16a34a",
      emphasis: true,
    },
  ];

  // Ledger that received a carried balance, so the "All terms" view can say
  // where the previous term went instead of showing it as a second debt.
  const carriedForwardTargets = useMemo(() => {
    const map = new Map<string, string>();
    enrichedLedgers.forEach((ledger) => {
      (ledger.allFees || []).forEach((fee) => {
        if (!fee.isCarryForward || !fee.carryForwardSource) return;
        const sourceKey = `${compactPeriodKey(fee.carryForwardSource.academicYear)}|${compactPeriodKey(fee.carryForwardSource.term)}`;
        if (!map.has(sourceKey)) {
          map.set(sourceKey, `${ledger.term}, ${ledger.academicYear}`);
        }
      });
    });
    return map;
  }, [enrichedLedgers]);

  const carryForwardNoteForLedger = (ledger: (typeof enrichedLedgers)[number]) => {
    if (!ledger?.isCarryForwardSource) return "";
    const key = `${compactPeriodKey(ledger.academicYear)}|${compactPeriodKey(ledger.term)}`;
    const target = carriedForwardTargets.get(key);
    return target
      ? `Balance carried into ${target}`
      : "Balance carried forward";
  };

  // The carried balance can be paid directly: the payment path records the
  // selected fee id, so the payment is credited to the carry-forward entry.
  const carryForwardPaymentOptions = useMemo(() => {
    const entries = feeState.carryForward?.entries || [];
    return entries
      .filter((entry) => entry.remaining > 0)
      .map((entry) => ({
        id: entry.feeId,
        name: entry.feeName,
        balance: entry.remaining,
        source: `${entry.fromTerm}, ${entry.fromAcademicYear}`,
      }));
  }, [feeState.carryForward]);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      
      const element = document.getElementById('printable-fee-statement');
      if (!element) return;
      
      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `${student.name.replace(/\s+/g, '_')}_Fee_Statement.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          windowWidth: 700,
          scrollX: 0,
          scrollY: 0,
        },
jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };
      
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
    } finally {
      setIsDownloading(false);
    }
  };



  const handlePaymentSuccess = async (reference: string, amount: number, feeId?: string, feeName?: string) => {
    try {
      setShowPaymentModal(false);
      setLoading(true);
      const paymentDate = Date.now();

      let paymentsToRecord = [];

      if (!feeId) {
        let remainingAmount = amount;
        const sortedLedgers = [...enrichedLedgers].reverse(); 
        for (const ledger of sortedLedgers) {
          if (remainingAmount <= 0) break;
          if (ledger.actualBalance > 0) {
            const payAmount = Math.min(remainingAmount, ledger.actualBalance);
            paymentsToRecord.push({
              id: `temp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
              schoolId: student.schoolId,
              studentId: student.id,
              classId: student.classId,
              feeId: "online_payment",
              feeName: "School Fees",
              amountPaid: payAmount,
              paymentMethod: "MoMo",
              receiptNumber: reference,
              academicYear: ledger.academicYear,
              term: ledger.term,
              createdAt: paymentDate,
              recordedBy: "Parent Portal"
            });
            remainingAmount -= payAmount;
          }
        }
        if (remainingAmount > 0 || paymentsToRecord.length === 0) {
           paymentsToRecord.push({
              id: `temp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
              schoolId: student.schoolId,
              studentId: student.id,
              classId: student.classId,
              feeId: "online_payment",
              feeName: "School Fees",
              amountPaid: remainingAmount > 0 ? remainingAmount : amount,
              paymentMethod: "MoMo",
              receiptNumber: reference,
              academicYear: academicYear,
              term: enrichedLedgers[0]?.term || "Term 1",
              createdAt: paymentDate,
              recordedBy: "Parent Portal"
           });
        }
      } else {
        let targetTerm = selectedTerm === "all" ? (enrichedLedgers[0]?.term || "Term 1") : selectedTerm;
        let targetYear = academicYear;
        const ledgerFeeEntry = enrichedLedgers.flatMap(l => l.fees.map(f => ({...f, term: l.term, academicYear: l.academicYear}))).find(f => f.feeId === feeId);
        if (ledgerFeeEntry) {
          targetTerm = ledgerFeeEntry.term;
          targetYear = ledgerFeeEntry.academicYear;
        }

        paymentsToRecord.push({
            id: `temp-${Date.now()}`,
            schoolId: student.schoolId,
            studentId: student.id,
            classId: student.classId,
            feeId: feeId,
            feeName: feeName || "School Fees",
            amountPaid: amount,
            paymentMethod: "MoMo",
            receiptNumber: reference,
            academicYear: targetYear,
            term: targetTerm,
            createdAt: paymentDate,
            recordedBy: "Parent Portal"
        });
      }

      // Record the payment server-side: the server verifies the Paystack
      // reference and writes the authoritative payment document(s) itself.
      // The browser must not write financial records directly.
      const allocations = paymentsToRecord.map((p) => ({
        feeId: p.feeId,
        feeName: p.feeName,
        amountPaid: p.amountPaid,
        academicYear: p.academicYear,
        term: p.term,
      }));

      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("Your login session has expired. Please sign in again.");
      }

      const verifyResponse = await fetch(`${API_BASE_URL}/api/payments/verify-and-record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          reference,
          schoolId: student.schoolId,
          studentId: student.id,
          allocations,
        }),
      });

      const verifyResult = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok || verifyResult.success !== true) {
        throw new Error(verifyResult.error || "We could not verify this payment with Paystack.");
      }

      await logActivity({
        schoolId: student.schoolId,
        actorUid: user?.id || auth.currentUser?.uid || null,
        actorRole: user?.role || "parent",
        eventType: "fee_payment_recorded",
        entityId: student.id,
        meta: {
          module: "Fees",
          status: "success",
          actorName: user?.fullName || "Parent Portal",
          studentName: student.name,
          amount,
          reference,
          feeName: feeName || "School Fees",
          description: `Parent payment received for ${student.name}.`,
        },
      });

      setLastPaymentInfo({ reference, amount, date: paymentDate });
      
      const hasNotificationPhone = Boolean(
        student.fatherPhone ||
          student.motherPhone ||
          student.guardianPhone ||
          student.fatherWhatsApp ||
          student.motherWhatsApp ||
          student.guardianWhatsApp,
      );

      if (hasNotificationPhone) {
        try {
          // Send SMS receipt and admin payment alert.
          const idToken = await auth.currentUser?.getIdToken();
          const response = await fetch(`${API_BASE_URL}/api/payments/send-invoice`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
            },
            body: JSON.stringify({
              schoolId: student.schoolId,
              source: "parent_dashboard_payment",
              notifyAdmin: true,
              studentId: student.id,
              studentName: student.name,
              guardianName: (student as any).guardianName || (student as any).parentName || "Parent",
              classId: student.classId,
              className: CLASSES_LIST.find((c) => c.id === student.classId)?.name || student.classId,
              fatherPhone: student.fatherPhone,
              motherPhone: student.motherPhone,
              guardianPhone: student.guardianPhone,
              adminPhone: school?.phone,
              amount,
              reference,
              feeName: feeName || "School Fees"
            })
          });

          const result = await response.json().catch(() => ({}));
          if (!response.ok || result.success === false) {
            throw new Error(result.error || `Server returned ${response.status}`);
          }

          console.log("[Invoice] SMS notification handled:", result);
          const notificationResults = Array.isArray(result.results) ? result.results : [];
          const sentToParentSms = notificationResults.some(
            (item) => item.success && item.channel === "sms" && item.type === "payment_invoice_parent",
          );
          const sentToAdminSms = notificationResults.some(
            (item) => item.success && item.channel === "sms" && item.type === "payment_alert_admin",
          );
          const allFailed = notificationResults.length > 0 && notificationResults.every((item) => !item.success);

          if (result.queued) {
            showToast("Payment saved. SMS notification is pending.", { type: "info" });
          } else if (result.skipped) {
            showToast("Payment saved. SMS notifications are disabled.", { type: "info" });
          } else if (sentToParentSms && sentToAdminSms) {
            showToast(
              "Payment saved. Receipt SMS sent to parent and payment alert SMS sent to admin.",
              { type: "success" },
            );
          } else if (sentToParentSms) {
            showToast("Payment saved and receipt SMS sent to parent.", { type: "success" });
          } else if (allFailed) {
            showToast(
              "Payment saved, but SMS notification failed. Please check SMS balance and phone numbers.",
              { type: "error" },
            );
          } else {
            showToast("Payment saved. Notification result is pending.", { type: "info" });
          }
        } catch (notificationError: any) {
          console.error("[Invoice] SMS send failed:", notificationError);
          showToast("Payment saved. SMS notification will need review.", { type: "warning" });
        }
      }



      setTimeout(() => { window.location.reload(); }, 2000);
    } catch (error: any) {
      console.error("Error processing payment:", error);
      showToast(
        error?.message ||
          "We could not confirm this payment. If you were charged, please contact your school.",
        { type: "error" },
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>

      {loading ? (
        <div className={onClose ? "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" : "flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200"}>
          <div className={onClose ? "bg-white rounded-2xl max-w-4xl w-full p-8" : ""}>
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          </div>
        </div>
      ) : (
        <div className={onClose ? "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" : "h-full flex flex-col"}>
          <div className={onClose ? "bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" : "bg-white rounded-2xl border border-slate-200 overflow-y-auto flex flex-col flex-1"}>
            {/* Header */}
            {onClose && (
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Fees & Bills</h2>
                  <p className="text-sm text-slate-500">{student.name} - {CLASSES_LIST.find(c => c.id === student.classId)?.name || student.classId}</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
              <div id="printable-fee-statement" className="bg-white text-black" style={{ width: '700px', padding: '32px', fontFamily: 'Arial, sans-serif', position: 'relative' }}>
                {/* Watermark Overlay */}
                {school?.logoUrl && (
                  <img 
                    src={school.logoUrl} 
                    alt="" 
                    style={{ 
                      position: 'absolute', 
                      top: '50%', 
                      left: '50%', 
                      transform: 'translate(-50%, -50%)', 
                      width: '450px', 
                      height: '450px', 
                      objectFit: 'contain', 
                      opacity: 0.05, 
                      pointerEvents: 'none',
                      zIndex: 50
                    }} 
                    crossOrigin="anonymous" 
                  />
                )}

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #1e3a8a', paddingBottom: '16px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {school?.logoUrl && <img src={school.logoUrl} alt="Logo" style={{ width: '60px', height: '60px', objectFit: 'contain' }} crossOrigin="anonymous" />}
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: '900', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '1px' }}>{school?.name || 'School Name'}</div>
                      <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>{school?.address || ''}</div>
                      <div style={{ fontSize: '11px', color: '#4b5563' }}>{school?.phone || ''}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: '#111827', letterSpacing: '2px' }}>INVOICE</div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Date: {new Date().toLocaleDateString()}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>Academic Year: {academicYear}</div>
                  </div>
                </div>

                {/* Student Info */}
                <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', marginBottom: '20px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: '700', fontSize: '11px', color: '#374151', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '12px' }}>Student Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                    <div><span style={{ color: '#6b7280', marginRight: '8px' }}>Name:</span><strong>{student.name}</strong></div>
                    <div><span style={{ color: '#6b7280', marginRight: '8px' }}>Class:</span><strong>{CLASSES_LIST.find(c => c.id === student.classId)?.name || student.classId}</strong></div>
                    <div><span style={{ color: '#6b7280', marginRight: '8px' }}>Guardian:</span><strong>{(student as any).guardianName || 'N/A'}</strong></div>
                    <div><span style={{ color: '#6b7280', marginRight: '8px' }}>Phone:</span><strong>{(student as any).guardianPhone || 'N/A'}</strong></div>
                  </div>
                </div>

                {/* Financial Summary */}
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '10px', color: '#374151', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Fee Summary</div>
                  {feeSummaryRows.map((row) => (
                    <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#374151', fontWeight: row.emphasis ? '700' : '500' }}>{row.label}</div>
                        <div style={{ fontSize: '9px', color: '#6b7280' }}>{row.hint}</div>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: '900', color: row.color, whiteSpace: 'nowrap' }}>{formatCurrency(row.value)}</div>
                    </div>
                  ))}
                </div>

                {/* Fee Breakdown */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontWeight: '700', fontSize: '11px', color: '#374151', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '12px' }}>
                    Fee Breakdown ({selectedTerm === 'all' ? 'All Terms' : selectedTerm})
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', border: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Term</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', border: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Description</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Charged</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Paid</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #e5e7eb', fontWeight: '600', color: '#374151' }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrichedLedgers.map((ledger, idx) => (
                        <React.Fragment key={idx}>
                          {ledger.fees.map((fee: any, feeIdx: number) => (
                            <tr key={`${idx}-${feeIdx}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '10px 12px', border: '1px solid #e5e7eb', color: '#374151' }}>{ledger.term}</td>
                              <td style={{ padding: '10px 12px', border: '1px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>
                                {fee.feeName}
                                {fee.isCarryForward && fee.carryForwardSource
                                  ? ` (Carried over from ${fee.carryForwardSource.term}, ${fee.carryForwardSource.academicYear})`
                                  : ''}
                              </td>
                              <td style={{ padding: '10px 12px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: '700' }}>{formatCurrency(fee.amount)}</td>
                              <td style={{ padding: '10px 12px', border: '1px solid #e5e7eb', textAlign: 'right', color: '#15803d', fontWeight: '700' }}>{formatCurrency(fee.actualPaid || 0)}</td>
                              <td style={{ padding: '10px 12px', border: '1px solid #e5e7eb', textAlign: 'right', color: fee.actualBalance > 0 ? '#dc2626' : '#15803d', fontWeight: '700' }}>{formatCurrency(fee.actualBalance || 0)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                      {/* Totals Row */}
                      <tr style={{ background: '#f9fafb' }}>
                        <td colSpan={2} style={{ padding: '10px 12px', border: '1px solid #e5e7eb', fontWeight: '700', color: '#111827' }}>TOTAL</td>
                        <td style={{ padding: '10px 12px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: '900', color: '#1e3a8a' }}>{formatCurrency(totalStats.totalFees)}</td>
                        <td style={{ padding: '10px 12px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: '900', color: '#14532d' }}>{formatCurrency(totalStats.totalPaid)}</td>
                        <td style={{ padding: '10px 12px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: '900', color: totalStats.totalBalance > 0 ? '#7f1d1d' : '#14532d' }}>{formatCurrency(totalStats.totalBalance)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div style={{ marginTop: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '10px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                  <p>This is an officially generated document from {school?.name || 'School Manager GH'}.</p>
                  <p>For any questions or discrepancies, please contact the administration.</p>
                </div>
              </div>
            </div>

            <div id="fee-statement-content" className="p-3 sm:p-6 pb-10 space-y-4 sm:space-y-5">
              {/* Financial Summary Card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-3 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm sm:text-base">Fee Summary</h3>
                    <p className="text-xs text-slate-500">
                      {selectedTerm === "all" ? "All terms" : selectedTerm} · {academicYear}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border shrink-0 ${getStatusColor(feeState.status)}`}>
                    {feeState.status}
                  </span>
                </div>

                <dl className="divide-y divide-slate-100">
                  {feeSummaryRows.map((row) => (
                    <div
                      key={row.key}
                      data-testid={`fee-summary-${row.key}`}
                      className={`flex items-center justify-between gap-3 px-3 sm:px-5 py-2.5 sm:py-3 ${row.key === "remaining-balance" && row.value > 0 ? "bg-red-50/60" : ""}`}
                    >
                      <div className="min-w-0">
                        <dt className="text-xs sm:text-sm font-semibold text-slate-700">{row.label}</dt>
                        <dd className="text-[11px] text-slate-500 break-words">{row.hint}</dd>
                      </div>
                      <dd
                        data-testid={`fee-summary-${row.key}-value`}
                        className={`text-sm sm:text-lg font-bold break-all text-right leading-tight shrink-0 ${row.className}`}
                      >
                        {formatCurrency(row.value)}
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Pay Online Action — full width below stats */}
                {totalStats.totalBalance > 0 && (
                  <div className="border-t border-slate-100 p-3 sm:p-4 space-y-2 bg-slate-50/50">
                    <select
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) setSelectedFeeToPay(null);
                        else {
                          const [id, name] = val.split("|");
                          setSelectedFeeToPay({ id, name });
                        }
                      }}
                      value={selectedFeeToPay ? `${selectedFeeToPay.id}|${selectedFeeToPay.name}` : ""}
                    >
                      <option value="">Select Fee to Pay (Optional)</option>
                      {carryForwardPaymentOptions.map(option => (
                        <option key={option.id} value={`${option.id}|${option.name}`}>
                          {option.name} — carried over from {option.source} — GH₵ {option.balance.toFixed(2)}
                        </option>
                      ))}
                      {feeDefinitions.map(f => {
                        const ledgerFee = billLedgers.flatMap(l => l.fees).find(lf => lf.feeId === f.id || lf.feeName === f.feeName);
                        const balance = ledgerFee ? ledgerFee.actualBalance : f.amount;
                        if (balance <= 0) return null;
                        const termLabel = f.term ? ` (${f.term})` : "";
                        return (
                          <option key={f.id} value={`${f.id}|${f.feeName}`}>
                            {f.feeName}{termLabel} — GH₵ {balance.toFixed(2)}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      onClick={() => {
                        if (!activeSubaccountCode) {
                          showToast("Online payments are not active for this school yet.", { type: "error" });
                          return;
                        }
                        setShowPaymentModal(true);
                      }}
                      className="parent-pay-online-button flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-blue-100 transition-all hover:bg-blue-700"
                    >
                      <CreditCard size={16} />
                      Pay Online Now
                    </button>
                  </div>
                )}
              </div>

              {/* Filters */}
              <div className="flex flex-col gap-3 bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs sm:text-sm font-medium text-slate-700 whitespace-nowrap">Year:</span>
                  <select
                    data-testid="year-select"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="bg-white border border-slate-300 text-slate-800 text-xs sm:text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 px-2 py-1.5 outline-none flex-1 min-w-0"
                  >
                    {availableYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="text-xs sm:text-sm font-medium text-slate-700">Term:</span>
                  <button
                    onClick={() => handleTermChange("all")}
                    className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      selectedTerm === "all"
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    All
                  </button>
                  {termOptions.map(term => (
                    <button
                      key={term}
                      onClick={() => handleTermChange(term)}
                      className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                        selectedTerm === term
                          ? "bg-blue-600 text-white"
                          : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fee Ledgers */}
              {billLedgers.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-8 text-center">
                  <CreditCard size={48} className="text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No fee records found for this student.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {billLedgers.map(ledger => (
                    <div key={ledger.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-3 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-slate-800 text-sm sm:text-base">{ledger.term} - {ledger.academicYear}</h3>
                          <p className="text-xs sm:text-sm text-slate-500">{CLASSES_LIST.find(c => c.id === ledger.classId)?.name || ledger.classId}</p>
                          {carryForwardNoteForLedger(ledger) && (
                            <p className="text-[11px] sm:text-xs font-medium text-amber-700 mt-0.5">
                              {carryForwardNoteForLedger(ledger)}
                            </p>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(ledger.actualStatus)}`}>
                          {ledger.actualStatus || "Unpaid"}
                        </span>
                      </div>

                      <div className="p-3 sm:p-5 overflow-x-auto">
                        <table className="w-full min-w-[400px]">
                          <thead>
                            <tr className="text-left text-xs sm:text-sm text-slate-600 border-b border-slate-200">
                              <th className="pb-2">Fee</th>
                              <th className="pb-2 text-right">Amount</th>
                              <th className="pb-2 text-right">Paid</th>
                              <th className="pb-2 text-right">Balance</th>
                              <th className="pb-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ledger.fees.map((fee, index) => (
                              <tr
                                key={index}
                                data-testid={`fee-row-${fee.feeId}`}
                                data-carry-forward={fee.isCarryForward ? "true" : "false"}
                                className="border-b border-slate-100 last:border-0"
                              >
                                <td className="py-2 sm:py-3 text-slate-800 text-xs sm:text-sm">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span>{fee.feeName}</span>
                                    {fee.isCarryForward && fee.carryForwardSource && (
                                      <span
                                        data-testid="carry-forward-badge"
                                        className={`px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded-full whitespace-nowrap ${
                                          fee.actualBalance > 0
                                            ? "bg-amber-100 text-amber-800"
                                            : "bg-green-100 text-green-700"
                                        }`}
                                      >
                                        Carried over from {fee.carryForwardSource.term}, {fee.carryForwardSource.academicYear}
                                        {fee.actualBalance > 0 ? "" : " · Cleared"}
                                      </span>
                                    )}
                                    {isAdmissionFeeNewStudentsOnly(fee.feeName, feeDefinitions) && isStudentNewForAdmissionFee() && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full whitespace-nowrap">
                                        New students only
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 sm:py-3 text-right text-slate-600 text-xs sm:text-sm">{formatCurrency(fee.amount)}</td>
                                <td className="py-2 sm:py-3 text-right text-green-600 text-xs sm:text-sm">{formatCurrency(fee.actualPaid || 0)}</td>
                                <td className="py-2 sm:py-3 text-right text-red-600 text-xs sm:text-sm">{formatCurrency(fee.actualBalance || 0)}</td>
                                <td className="py-2 sm:py-3 text-right">
                                  <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-xs font-medium ${getStatusColor(fee.actualStatus)}`}>
                                    {fee.actualStatus || "Unpaid"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {ledger.unallocatedPaid > 0 && (
                          <p
                            data-testid="unallocated-note"
                            className="mt-2 text-[11px] sm:text-xs text-slate-500"
                          >
                            {formatCurrency(ledger.unallocatedPaid)} of the payments recorded for this term was applied to the overall balance, so it is not shown against a single fee.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment History */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 sm:px-5 py-3 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-800 text-sm sm:text-base">
                    Payment History ({selectedTerm === "all" ? "All Terms" : selectedTerm})
                  </h3>
                </div>
                <div className="p-3 sm:p-5">
                  {visiblePayments.length === 0 ? (
                    <p className="text-slate-500 text-center py-4 text-sm">
                      No payment records found for {selectedTerm === "all" ? "this academic year" : selectedTerm}.
                    </p>
                  ) : (
                    <div className="space-y-2 sm:space-y-3">
                      {visiblePayments.map(payment => (
                        <div
                          key={payment.id}
                          data-testid="payment-history-item"
                          className="flex items-center justify-between py-2 sm:py-3 border-b border-slate-100 last:border-0 gap-2"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 text-sm break-words">{payment.displayLabel}</p>
                            {payment.appliedToOverallBalance && (
                              <p className="text-[11px] text-slate-500">
                                Paid against the overall balance, not a specific fee
                              </p>
                            )}
                            <p className="text-[11px] font-semibold text-slate-400">
                              {normalizeParentFeeTerm(payment.term)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {[payment.paymentMethod, formatPaymentDate(payment.createdAt)].filter(Boolean).join(" • ")}
                            </p>
                          </div>
                          <p className="font-bold text-green-600 text-sm shrink-0">+{formatCurrency(payment.amountPaid)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Download Button */}
              <div className="flex justify-center mt-8">
                <button 
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-colors font-medium ${
                    isDownloading ? "bg-blue-100 text-blue-600 cursor-not-allowed" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      Download Fee Statement
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showPaymentModal && (
        <PaymentModal
          student={student}
          amount={(() => {
            if (!selectedFeeToPay) return Number(totalStats.totalBalance.toFixed(2));
            const ledgerFee = enrichedLedgers.flatMap(l => l.fees).find(f => f.feeId === selectedFeeToPay.id);
            if (ledgerFee) return Number(ledgerFee.actualBalance.toFixed(2));
            const defFee = feeDefinitions.find(f => f.id === selectedFeeToPay.id);
            return defFee ? Number(defFee.amount.toFixed(2)) : Number(totalStats.totalBalance.toFixed(2));
          })()}
          schoolName={school?.name || "The School"}
          subaccountCode={activeSubaccountCode}
          academicYear={academicYear}
          term={selectedTerm === "all" ? (enrichedLedgers[0]?.term || "Term 1") : selectedTerm}
          feeId={selectedFeeToPay?.id}
          feeName={selectedFeeToPay?.name}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </>
  );
};

export default FeesView;
