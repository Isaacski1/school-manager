import React, { useState } from "react";
import { X, ShieldCheck, Landmark, Smartphone, CreditCard as CardIcon, ChevronRight } from "lucide-react";
import { Student, FeeTerm } from "../../types";
// @ts-ignore
import { usePaystackPayment } from "react-paystack";

interface PaymentModalProps {
  student: Student;
  amount: number;
  schoolName: string;
  subaccountCode?: string;
  paystackPublicKey: string;
  academicYear: string;
  term: string;
  feeId?: string;
  feeName?: string;
  onSuccess: (reference: string, amount: number, feeId?: string, feeName?: string) => void;
  onClose: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  student,
  amount,
  schoolName,
  subaccountCode,
  paystackPublicKey,
  academicYear,
  term,
  feeId,
  feeName,
  onSuccess,
  onClose
}) => {
  const [payAmount, setPayAmount] = useState<string>(amount.toFixed(2));
  const [isProcessing, setIsProcessing] = useState(false);

  // Paystack Configuration
  const names = (student.guardianName || "Parent Guardian").split(" ");
  const firstname = names[0];
  const lastname = names.slice(1).join(" ") || "Guardian";
  
  const emailName = (student.guardianName || "Parent")
    .replace(/[^a-zA-Z0-9]/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
    
  const config = {
    reference: `FEES-${student.id.slice(0, 5)}-${new Date().getTime()}`,
    email: student.guardianEmail || `${emailName}@sm.gh`,
    label: student.guardianName, // This might show the name in the header
    firstname,
    lastname,
    amount: parseFloat(payAmount) * 100, // Paystack takes amount in kobo/pesewas
    currency: "GHS",
    publicKey: paystackPublicKey,
    subaccount: subaccountCode, // This is what routes the money to the school!
    metadata: {
      studentId: student.id,
      studentName: student.name,
      guardianName: student.guardianName,
      schoolId: student.schoolId,
      feeId: feeId || "general",
      feeName: feeName || "School Fees",
      academicYear,
      term,
      custom_fields: [
        {
          display_name: "Student Name",
          variable_name: "student_name",
          value: student.name
        },
        {
          display_name: "Parent Name",
          variable_name: "parent_name",
          value: student.guardianName
        }
      ]
    }
  };

  const initializePayment = usePaystackPayment(config);

  const handlePayment = () => {
    const numericAmount = parseFloat(payAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    if (numericAmount > amount) {
      alert(`The maximum you can pay for this is GH₵ ${amount.toFixed(2)}`);
      setPayAmount(amount.toFixed(2));
      return;
    }

    setIsProcessing(true);
    
    // @ts-ignore
    initializePayment({
      onSuccess: (response: any) => {
        // onSuccess callback
        setIsProcessing(false);
        onSuccess(response.reference, numericAmount, feeId, feeName);
      },
      onClose: () => {
        // onClose callback
        setIsProcessing(false);
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
              <CardIcon size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Pay Fees Online</h3>
              <p className="text-xs text-slate-500">{schoolName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-full text-slate-400 hover:text-slate-600 transition-colors shadow-sm"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Student Info Chip */}
          <div className="flex items-center gap-3 p-3 bg-blue-50/50 rounded-2xl border border-blue-100">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
              {student.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{student.name}</p>
              <p className="text-[10px] text-blue-600 font-medium uppercase tracking-wider">{academicYear} • {term}</p>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Amount to Pay (GHS)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">GH₵</span>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  const numVal = parseFloat(val);
                  if (numVal > amount) {
                    setPayAmount(amount.toFixed(2));
                  } else {
                    setPayAmount(val);
                  }
                }}
                className={`w-full pl-12 pr-4 py-4 bg-slate-50 border rounded-2xl text-2xl font-bold outline-none transition-all ${
                  parseFloat(payAmount) >= amount ? 'text-blue-600 border-blue-200 focus:border-blue-600' : 'text-slate-900 border-slate-200 focus:border-blue-600'
                }`}
                placeholder="0.00"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 italic">Total outstanding balance: GH₵ {amount.toFixed(2)}</p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Smartphone, label: "MoMo" },
              { icon: Landmark, label: "Bank" },
              { icon: CardIcon, label: "Card" }
            ].map((method) => (
              <div key={method.label} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 bg-slate-50/30">
                <method.icon size={20} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{method.label}</span>
              </div>
            ))}
          </div>

          {/* Security Note */}
          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <ShieldCheck className="text-emerald-500 shrink-0" size={20} />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              <strong>Secure Payment:</strong> Your transaction is encrypted and secured by Paystack. Funds are routed directly to the school's account.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100">
          <button
            onClick={handlePayment}
            disabled={isProcessing || !payAmount || parseFloat(payAmount) <= 0}
            className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold transition-all shadow-xl shadow-blue-200 disabled:opacity-50 group"
          >
            {isProcessing ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Proceed to Secure Payment
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
