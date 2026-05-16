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
import { auth } from "../../services/firebase";
import html2pdf from "html2pdf.js";
import { API_BASE_URL } from "../../src/config";

interface FeesViewProps {
  student: Student;
  onClose?: () => void;
}

const FeesView: React.FC<FeesViewProps> = ({ student, onClose }) => {
  const { school } = useSchool();
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
    school?.paymentSettings?.status === "active"
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
        return !fee.classId || fee.classId === student.classId;
      case "selected_students":
        return fee.selectedStudentIds?.includes(student.id) || false;
      case "new_students_only": {
        const cutoffDate = schoolReopenDate || "";
        if (!cutoffDate) return true;
        const createdAtMs = getStudentCreatedAtMs();
        if (createdAtMs === null) return true;
        const cutoffMs = new Date(`${cutoffDate}T00:00:00`).getTime();
        return Number.isNaN(cutoffMs) || createdAtMs >= cutoffMs;
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

        // Fetch ALL fee ledgers for the student to discover available years
        const allLedgers = await db.getStudentLedgers({
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

  const enrichedLedgers = useMemo(() => {
    const termLedgers = selectedTerm === "all" ? ledgers : ledgers.filter(l => l.term === selectedTerm);
    
    return termLedgers.map(ledger => {
      let ledgerTotalDue = 0;
      let ledgerTotalPaid = 0;
      
      const enrichedFees = ledger.fees.map(fee => {
        // Find payments for this specific fee
        const feePayments = payments.filter(p => p.feeId === fee.feeId);
        
        const paidSinceOnboarding = feePayments.reduce((sum, p) => sum + p.amountPaid, 0);
        const totalPaidForFee = (fee.openingPaidAmount || 0) + paidSinceOnboarding;
        const balanceForFee = Math.max(0, fee.amount - totalPaidForFee);
        
        let statusForFee = fee.openingStatus || "Unpaid";
        if (totalPaidForFee > 0) {
           statusForFee = balanceForFee <= 0 ? "Paid" : "Part-paid";
        }

        ledgerTotalDue += fee.amount;
        ledgerTotalPaid += totalPaidForFee;

        return {
          ...fee,
          actualPaid: totalPaidForFee,
          actualBalance: balanceForFee,
          actualStatus: statusForFee
        };
      });

      const ledgerBalance = Math.max(0, ledgerTotalDue - ledgerTotalPaid);
      let ledgerStatus = ledger.openingStatus || "Unpaid";
      if (ledgerTotalPaid > 0) {
         ledgerStatus = ledgerBalance <= 0 ? "Paid" : "Part-paid";
      }

      return {
        ...ledger,
        fees: enrichedFees,
        actualTotalDue: ledgerTotalDue,
        actualTotalPaid: ledgerTotalPaid,
        actualBalance: ledgerBalance,
        actualStatus: ledgerStatus
      };
    });
  }, [ledgers, selectedTerm, payments]);

  const totalStats = useMemo(() => {
    let totalFees = 0;
    let totalPaidInLedgers = 0;
    let totalBalance = 0;

    enrichedLedgers.forEach(ledger => {
      totalFees += ledger.actualTotalDue;
      totalPaidInLedgers += ledger.actualTotalPaid;
      totalBalance += ledger.actualBalance;
    });

    // Also account for payments not yet allocated to a specific fee (like "online_payment")
    const unallocatedPayments = payments
      .filter(p => p.feeId === "online_payment" && p.academicYear === academicYear)
      .reduce((sum, p) => sum + p.amountPaid, 0);

    const finalPaid = totalPaidInLedgers + unallocatedPayments;
    const finalBalance = Math.max(0, totalFees - finalPaid);

    return { totalFees, totalPaid: finalPaid, totalBalance: finalBalance };
  }, [enrichedLedgers, payments, academicYear]);

  const visiblePayments = useMemo(() => {
    let filtered = payments.filter(p => p.academicYear === academicYear);
    if (selectedTerm !== "all") {
      filtered = filtered.filter(p => p.term === selectedTerm);
    }
    // Sort payments descending by createdAt
    return filtered.sort((a, b) => (b.createdAt as number) - (a.createdAt as number));
  }, [payments, academicYear, selectedTerm]);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "Paid":
        return "bg-green-100 text-green-700 border-green-300";
      case "Part-paid":
        return "bg-yellow-100 text-yellow-700 border-yellow-300";
      case "Unpaid":
        return "bg-red-100 text-red-700 border-red-300";
      default:
        return "bg-gray-100 text-gray-600 border-gray-300";
    }
  };

  const formatCurrency = (amount: number) => {
    return `GHS ${amount.toFixed(2)}`;
  };

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

      for (const p of paymentsToRecord) {
        await db.recordStudentPayment(p as StudentFeePayment);
      }

      setLastPaymentInfo({ reference, amount, date: paymentDate });
      
      // Notify Admin Dashboard
      try {
        await db.addSystemNotification(
          `Payment Received: GHS ${amount} for ${student.name} (${feeName || "School Fees"})`,
          "system",
          student.schoolId
        );
      } catch (err) {
        console.error("Failed to add system notification", err);
      }
      

      if (student.guardianPhone) {
        console.log("[Invoice] Starting Flash Capture Invoicing...");
        
        // Make it visible and keep it there for a moment to force a browser paint









        // Wait 2 seconds for the browser to definitely render the text
        // 1. Create a temporary container
        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.top = "0";
        container.style.left = "-9999px"; // Off-screen but attached
        container.style.width = "800px";
        container.style.backgroundColor = "white";
        document.body.appendChild(container);

        try {
          // 2. Pre-load school logo if it exists
          let logoBase64 = "";
          if (school?.logoUrl) {
            try {
              logoBase64 = await urlToBase64(school.logoUrl);
            } catch (e) {
              console.warn("[Invoice] Logo pre-load failed, using original URL", e);
              logoBase64 = school.logoUrl;
            }
          }

          // 3. Render the template into the container
          const root = createRoot(container);
          root.render(
            <InvoiceTemplate
              schoolName={school?.name || "School Manager"}
              schoolLogo={logoBase64}
              studentName={student.name}
              studentId={student.id}
              amount={amount}
              reference={reference}
              date={paymentDate}
              academicYear={academicYear}
              term={selectedTerm === "all" ? "All Terms" : selectedTerm}
            />
          );

          // 4. Wait for React to render and the browser to paint
          await waitForNextPaint();
          await new Promise(resolve => setTimeout(resolve, 800)); // Extra safety for complex styles

          // 5. Capture as PDF
          let pdfBlob = await generateSinglePagePdfBlob(container.firstElementChild as HTMLElement);
          
          // 6. Diagnostic validation
          console.log(`[Invoice] Captured PDF size: ${(pdfBlob.size / 1024).toFixed(2)} KB`);
          
          if (pdfBlob.size < 5000) { // If < 5KB, it's likely blank or failed
            console.warn("[Invoice] PDF size looks suspicious, retrying...");
            await new Promise(resolve => setTimeout(resolve, 1000));
            pdfBlob = await generateSinglePagePdfBlob(container.firstElementChild as HTMLElement);
          }

          // 7. Convert to base64 for transmission
          const reader = new FileReader();
          const pdfBase64Promise = new Promise<string>((resolve) => {
            reader.onloadend = () => {
              const base64 = reader.result as string;
              resolve(base64);
            };
          });
          reader.readAsDataURL(pdfBlob);
          const pdfBase64 = await pdfBase64Promise;

          // 8. Clean up DOM
          root.unmount();
          document.body.removeChild(container);

          // 9. Send to WhatsApp
          const idToken = await auth.currentUser?.getIdToken();
          const response = await fetch(`${API_BASE_URL}/api/payments/send-invoice`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
            },
            body: JSON.stringify({
              studentId: student.id,
              studentName: student.name,
              guardianPhone: student.guardianPhone,
              adminPhone: school?.phone,
              amount,
              reference,
              base64Pdf: pdfBase64,
              feeName: feeName || "School Fees"
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server returned ${response.status}`);
          }

          console.log("[Invoice] WhatsApp transmission triggered successfully.");
          showToast("Invoice sent to WhatsApp!", { type: "success" });
        } catch (captureError: any) {
          console.error("[Invoice] Capture/Send failed:", captureError);
          showToast(captureError.message || "Failed to send WhatsApp invoice.", { type: "error" });
          if (document.body.contains(container)) {
            document.body.removeChild(container);
          }
        }
      }



      setTimeout(() => { window.location.reload(); }, 2000);
    } catch (error) {
      console.error("Error processing payment:", error);
      showToast("Payment recorded. Please refresh.", { type: "warning" });
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ background: '#eff6ff', padding: '14px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: '10px', color: '#1d4ed8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Fees</div>
                    <div style={{ fontSize: '18px', fontWeight: '900', color: '#1e3a8a', marginTop: '4px' }}>{formatCurrency(totalStats.totalFees)}</div>
                  </div>
                  <div style={{ background: '#f0fdf4', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: '10px', color: '#15803d', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Paid</div>
                    <div style={{ fontSize: '18px', fontWeight: '900', color: '#14532d', marginTop: '4px' }}>{formatCurrency(totalStats.totalPaid)}</div>
                  </div>
                  <div style={{ background: '#fef2f2', padding: '14px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                    <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Balance Due</div>
                    <div style={{ fontSize: '18px', fontWeight: '900', color: '#7f1d1d', marginTop: '4px' }}>{formatCurrency(totalStats.totalBalance)}</div>
                  </div>
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
                              <td style={{ padding: '10px 12px', border: '1px solid #e5e7eb', fontWeight: '600', color: '#111827' }}>{fee.feeName}</td>
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
              {/* Summary Stats Card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-slate-100">
                  {/* Total Fees */}
                  <div className="p-2 sm:p-5 text-center">
                    <p className="text-[10px] sm:text-xs text-slate-500 mb-1 font-medium">Total Fees</p>
                    <p className="text-xs sm:text-xl font-bold text-blue-700 break-all leading-tight">{formatCurrency(totalStats.totalFees)}</p>
                  </div>
                  {/* Total Paid */}
                  <div className="p-2 sm:p-5 text-center">
                    <p className="text-[10px] sm:text-xs text-slate-500 mb-1 font-medium">Paid</p>
                    <p className="text-xs sm:text-xl font-bold text-green-600 break-all leading-tight">{formatCurrency(totalStats.totalPaid)}</p>
                  </div>
                  {/* Balance Due */}
                  <div className={`p-2 sm:p-5 text-center ${totalStats.totalBalance > 0 ? 'bg-red-50' : ''}`}>
                    <p className="text-[10px] sm:text-xs text-slate-500 mb-1 font-medium">Balance</p>
                    <p className={`text-xs sm:text-xl font-bold break-all leading-tight ${totalStats.totalBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(totalStats.totalBalance)}
                    </p>
                  </div>
                </div>

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
                      {feeDefinitions.map(f => {
                        const ledgerFee = enrichedLedgers.flatMap(l => l.fees).find(lf => lf.feeId === f.id || lf.feeName === f.feeName);
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
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-blue-100"
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
              {enrichedLedgers.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-8 text-center">
                  <CreditCard size={48} className="text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No fee records found for this student.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {enrichedLedgers.map(ledger => (
                    <div key={ledger.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-3 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-slate-800 text-sm sm:text-base">{ledger.term} - {ledger.academicYear}</h3>
                          <p className="text-xs sm:text-sm text-slate-500">{CLASSES_LIST.find(c => c.id === ledger.classId)?.name || ledger.classId}</p>
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
                              <tr key={index} className="border-b border-slate-100 last:border-0">
                                <td className="py-2 sm:py-3 text-slate-800 text-xs sm:text-sm">{fee.feeName}</td>
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
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment History */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 sm:px-5 py-3 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-800 text-sm sm:text-base">Payment History</h3>
                </div>
                <div className="p-3 sm:p-5">
                  {visiblePayments.length === 0 ? (
                    <p className="text-slate-500 text-center py-4 text-sm">No payment records found.</p>
                  ) : (
                    <div className="space-y-2 sm:space-y-3">
                      {visiblePayments.map(payment => (
                        <div key={payment.id} className="flex items-center justify-between py-2 sm:py-3 border-b border-slate-100 last:border-0 gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 text-sm truncate">{payment.feeName}</p>
                            <p className="text-xs text-slate-500">
                              {payment.paymentMethod} • {new Date(payment.createdAt as number).toLocaleDateString()}
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
