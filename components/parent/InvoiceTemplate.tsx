import React from "react";

interface InvoiceTemplateProps {
  schoolName: string;
  schoolLogo?: string;
  studentName: string;
  studentId: string;
  amount: number;
  reference: string;
  date: number;
  academicYear: string;
  term: string;
}

const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({
  schoolName,
  schoolLogo,
  studentName,
  studentId,
  amount,
  reference,
  date,
  academicYear,
  term
}) => {
  const formatDate = (d: number) => {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(d));
  };

  // Note: The outer hidden container in FeesView provides the required ID for PDF generation.
  // We intentionally omit any "id" attribute here to avoid duplicate IDs.

  const formatTime = (d: number) => {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(d));
  };

  return (
    <div className="bg-white p-10 font-sans text-slate-800" style={{ width: "800px" }}>
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-8 mb-8">
        <div>
          {schoolLogo ? (
            <img src={schoolLogo} alt={schoolName} className="h-20 w-auto mb-4 object-contain" />
          ) : (
            <div className="h-20 w-20 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-bold text-2xl mb-4 uppercase">
              {schoolName.charAt(0)}
            </div>
          )}
          <h1 className="text-2xl font-black uppercase tracking-tight">{schoolName}</h1>
          <p className="text-slate-500 text-sm mt-1 uppercase tracking-widest font-bold">Official Payment Receipt</p>
        </div>
        <div className="text-right">
          <h2 className="text-4xl font-black text-slate-900 mb-2">RECEIPT</h2>
          <p className="text-sm font-bold text-slate-500 uppercase">Reference</p>
          <p className="text-lg font-black text-blue-700">{reference}</p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-12 mb-12">
        <div>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Student Details</h3>
          <div className="space-y-2">
            <p className="text-xl font-bold">{studentName}</p>
            <p className="text-slate-600 text-sm">ID: {studentId}</p>
            <p className="text-slate-600 text-sm">{academicYear} • {term}</p>
          </div>
        </div>
        <div className="text-right">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Payment Details</h3>
          <div className="space-y-2">
            <p className="text-xl font-bold">{formatDate(date)}</p>
            <p className="text-slate-600 text-sm">Time: {formatTime(date)}</p>
            <p className="text-slate-600 text-sm">Method: Online Payment (Paystack)</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="mb-12">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Description</th>
              <th className="py-4 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Amount (GHS)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-6 font-bold text-lg">School Fees Payment</td>
              <td className="py-6 text-right font-black text-lg">{amount.toFixed(2)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="py-8 text-right font-black text-slate-400 uppercase tracking-widest">Total Paid</td>
              <td className="py-8 text-right font-black text-3xl text-blue-700">GH₵ {amount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-20 pt-8 border-t border-slate-100 text-center">
        <p className="text-sm text-slate-400 font-medium">This is a system-generated receipt and does not require a physical signature.</p>
        <p className="text-xs text-slate-300 mt-2 uppercase tracking-widest font-black">School Manager GH • Integrated Payments</p>
      </div>
    </div>
  );
};

export default InvoiceTemplate;
