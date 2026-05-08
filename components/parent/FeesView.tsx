import React, { useState, useEffect, useMemo } from "react";
import { db } from "../../services/mockDb";
import { StudentFeeLedger, StudentFeePayment, FeeDefinition, Student, FeeTerm } from "../../types";
import { Calendar, CreditCard, CheckCircle, AlertTriangle, Clock, Download, Loader2 } from "lucide-react";
import { useSchool } from "../../context/SchoolContext";
// @ts-ignore
import html2pdf from "html2pdf.js";

interface FeesViewProps {
  student: Student;
  onClose?: () => void;
}

const FeesView: React.FC<FeesViewProps> = ({ student, onClose }) => {
  const { school } = useSchool();
  const [ledgers, setLedgers] = useState<StudentFeeLedger[]>([]);
  const [feeDefinitions, setFeeDefinitions] = useState<FeeDefinition[]>([]);
  const [payments, setPayments] = useState<StudentFeePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState<FeeTerm | "all">("all");
  const [academicYear] = useState("2024/2025"); // TODO: Make this dynamic
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    async function fetchFeeData() {
      if (!student.schoolId || !student.classId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch fee ledgers for the student
        const ledgerData = await db.getStudentLedgers({
          schoolId: student.schoolId,
          classId: student.classId,
          academicYear,
          studentId: student.id,
        });
        const studentLedgers = ledgerData;
        setLedgers(studentLedgers);

        // Fetch fee definitions
        const feeData = await db.getFees({
          schoolId: student.schoolId,
          academicYear,
          classId: student.classId,
        });
        setFeeDefinitions(feeData);

        // TODO: Fetch payments for the student
        // This would need a getStudentPayments method in mockDb
        // For now, we'll use an empty array
        setPayments([]);

      } catch (error) {
        console.error("Error fetching fee data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchFeeData();
  }, [student.schoolId, student.classId, student.id, academicYear]);

  const termOptions: FeeTerm[] = ["Term 1", "Term 2", "Term 3"];

  const filteredLedgers = useMemo(() => {
    if (selectedTerm === "all") return ledgers;
    return ledgers.filter(l => l.term === selectedTerm);
  }, [ledgers, selectedTerm]);

  const totalStats = useMemo(() => {
    let totalFees = 0;
    let totalPaid = 0;
    let totalBalance = 0;

    filteredLedgers.forEach(ledger => {
      ledger.fees.forEach(fee => {
        totalFees += fee.amount;
        totalPaid += fee.openingPaidAmount || 0;
        totalBalance += fee.openingBalance || 0;
      });
    });

    return { totalFees, totalPaid, totalBalance };
  }, [filteredLedgers]);

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
        margin: 0.5,
        filename: `${student.name.replace(/\s+/g, '_')}_Fee_Statement.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
      };
      
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error("Error downloading fee statement:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className={onClose ? "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" : "flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200"}>
        <div className={onClose ? "bg-white rounded-2xl max-w-4xl w-full p-8" : ""}>
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={onClose ? "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" : "h-full flex flex-col"}>
      <div className={onClose ? "bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" : "bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col flex-1"}>
        {/* Header */}
        {onClose && (
          <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Fees & Bills</h2>
              <p className="text-sm text-slate-500">{student.name} - {student.classId}</p>
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

        {/* Hidden Printable PDF Template */}
        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
          <div id="printable-fee-statement" className="bg-white text-black p-10" style={{ width: '800px' }}>
            {/* Header */}
            <div className="flex justify-between items-center border-b-4 border-blue-900 pb-6 mb-8">
              <div className="flex items-center gap-4">
                {school?.logoUrl && <img src={school.logoUrl} alt="Logo" className="w-20 h-20 object-contain" crossOrigin="anonymous" />}
                <div>
                  <h1 className="text-3xl font-bold uppercase text-blue-900 tracking-wider">{school?.name || "School Name"}</h1>
                  <p className="text-gray-600 font-medium mt-1">{school?.address || "School Address"}</p>
                  <p className="text-gray-600 font-medium">{school?.phone || "Contact Number"}</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-3xl font-black text-gray-800 uppercase tracking-widest">INVOICE</h2>
                <p className="text-gray-500 font-medium mt-2">Date: {new Date().toLocaleDateString()}</p>
                <p className="text-gray-500 font-medium">Academic Year: {academicYear}</p>
              </div>
            </div>

            {/* Student Info */}
            <div className="bg-gray-50 rounded-lg p-6 mb-8 border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2 uppercase tracking-wide">Student Details</h3>
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <div className="flex"><span className="w-24 text-gray-500 font-medium">Name:</span> <span className="font-bold text-gray-900">{student.name}</span></div>
                <div className="flex"><span className="w-24 text-gray-500 font-medium">Class:</span> <span className="font-bold text-gray-900">{student.classId}</span></div>
                <div className="flex"><span className="w-24 text-gray-500 font-medium">Guardian:</span> <span className="font-bold text-gray-900">{student.guardianName}</span></div>
                <div className="flex"><span className="w-24 text-gray-500 font-medium">Phone:</span> <span className="font-bold text-gray-900">{student.guardianPhone}</span></div>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="flex gap-6 mb-8">
              <div className="flex-1 bg-blue-50 p-6 rounded-lg border border-blue-100">
                <p className="text-blue-600 font-semibold mb-1 uppercase tracking-wide text-xs">Total Fees</p>
                <p className="text-xl font-black text-blue-900">{formatCurrency(totalStats.totalFees)}</p>
              </div>
              <div className="flex-1 bg-green-50 p-6 rounded-lg border border-green-100">
                <p className="text-green-600 font-semibold mb-1 uppercase tracking-wide text-xs">Total Paid</p>
                <p className="text-xl font-black text-green-900">{formatCurrency(totalStats.totalPaid)}</p>
              </div>
              <div className="flex-1 bg-red-50 p-6 rounded-lg border border-red-100">
                <p className="text-red-600 font-semibold mb-1 uppercase tracking-wide text-xs">Balance Due</p>
                <p className="text-xl font-black text-red-900">{formatCurrency(totalStats.totalBalance)}</p>
              </div>
            </div>

            {/* Fee Breakdown */}
            <div className="mb-8">
              <h3 className="font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2 uppercase tracking-wide">Fee Breakdown ({selectedTerm === "all" ? "All Terms" : selectedTerm})</h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 text-sm">
                    <th className="py-3 px-4 border border-gray-200 font-semibold">Term</th>
                    <th className="py-3 px-4 border border-gray-200 font-semibold">Description</th>
                    <th className="py-3 px-4 border border-gray-200 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredLedgers.map((ledger, idx) => (
                    <React.Fragment key={idx}>
                      {ledger.fees.map((fee, feeIdx) => (
                        <tr key={`${idx}-${feeIdx}`} className="border-b border-gray-200">
                          <td className="py-3 px-4 text-gray-800">{ledger.term}</td>
                          <td className="py-3 px-4 text-gray-800 font-medium">{fee.feeName}</td>
                          <td className="py-3 px-4 text-right font-bold text-gray-900">{formatCurrency(fee.amount)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Footer */}
            <div className="mt-16 text-center text-gray-500 text-xs border-t border-gray-200 pt-8">
              <p>This is an officially generated document from {school?.name || "School Manager GH"}.</p>
              <p>For any questions or discrepancies, please contact the administration.</p>
            </div>
          </div>
        </div>

        <div id="fee-statement-content" className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard size={18} className="text-blue-600" />
                <span className="text-sm text-blue-700 font-medium">Total Fees</span>
              </div>
              <p className="text-2xl font-bold text-blue-800">{formatCurrency(totalStats.totalFees)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 border border-green-100">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={18} className="text-green-600" />
                <span className="text-sm text-green-700 font-medium">Total Paid</span>
              </div>
              <p className="text-2xl font-bold text-green-800">{formatCurrency(totalStats.totalPaid)}</p>
            </div>
            <div className={`${totalStats.totalBalance > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'} rounded-xl p-4 border`}>
              <div className="flex items-center gap-2 mb-2">
                {totalStats.totalBalance > 0 ? (
                  <AlertTriangle size={18} className="text-red-600" />
                ) : (
                  <CheckCircle size={18} className="text-green-600" />
                )}
                <span className={`text-sm font-medium ${totalStats.totalBalance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  Balance Due
                </span>
              </div>
              <p className={`text-2xl font-bold ${totalStats.totalBalance > 0 ? 'text-red-800' : 'text-green-800'}`}>
                {formatCurrency(totalStats.totalBalance)}
              </p>
            </div>
          </div>

          {/* Term Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Filter by term:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedTerm("all")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedTerm === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Terms
              </button>
              {termOptions.map(term => (
                <button
                  key={term}
                  onClick={() => setSelectedTerm(term)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedTerm === term
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* Fee Ledgers */}
          {filteredLedgers.length === 0 ? (
            <div className="bg-slate-50 rounded-xl p-8 text-center">
              <CreditCard size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No fee records found for this student.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLedgers.map(ledger => (
                <div key={ledger.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-800">{ledger.term} - {ledger.academicYear}</h3>
                      <p className="text-sm text-slate-500">Class {ledger.classId}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(ledger.openingStatus)}`}>
                      {ledger.openingStatus || "Unpaid"}
                    </span>
                  </div>

                  <div className="p-5">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-sm text-slate-600 border-b border-slate-200">
                          <th className="pb-2">Fee Name</th>
                          <th className="pb-2 text-right">Amount</th>
                          <th className="pb-2 text-right">Paid</th>
                          <th className="pb-2 text-right">Balance</th>
                          <th className="pb-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.fees.map((fee, index) => (
                          <tr key={index} className="border-b border-slate-100 last:border-0">
                            <td className="py-3 text-slate-800">{fee.feeName}</td>
                            <td className="py-3 text-right text-slate-600">{formatCurrency(fee.amount)}</td>
                            <td className="py-3 text-right text-green-600">{formatCurrency(fee.openingPaidAmount || 0)}</td>
                            <td className="py-3 text-right text-red-600">{formatCurrency(fee.openingBalance || 0)}</td>
                            <td className="py-3 text-right">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(fee.openingStatus)}`}>
                                {fee.openingStatus || "Unpaid"}
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
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">Payment History</h3>
            </div>
            <div className="p-5">
              {payments.length === 0 ? (
                <p className="text-slate-500 text-center py-4">No payment records found.</p>
              ) : (
                <div className="space-y-3">
                  {payments.map(payment => (
                    <div key={payment.id} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                      <div>
                        <p className="font-medium text-slate-800">{payment.feeName}</p>
                        <p className="text-sm text-slate-500">
                          {payment.paymentMethod} • {new Date(payment.createdAt as number).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="font-bold text-green-600">+{formatCurrency(payment.amountPaid)}</p>
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
  );
};

export default FeesView;
