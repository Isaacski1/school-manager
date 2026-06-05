import React, { useState, useEffect } from "react";
import { useSchool } from "../../context/SchoolContext";
import { useAuth } from "../../context/AuthContext";
import { showToast } from "../../services/toast";
import { 
  Building2, 
  Smartphone, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  CreditCard,
  ChevronRight,
  ShieldCheck,
  Settings,
  RefreshCw,
  X
} from "lucide-react";
import { firestore, auth } from "../../services/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { API_BASE_URL } from "../../src/config";

const BANK_CODES: Record<string, string> = {
  "Absa Bank Ghana": "004",
  "Access Bank Ghana": "005",
  "ADB Bank": "006",
  "Bank of Africa Ghana": "007",
  "CalBank": "008",
  "Consolidated Bank Ghana (CBG)": "009",
  "Ecobank Ghana": "010",
  "FBNBank Ghana": "011",
  "Fidelity Bank Ghana": "012",
  "First National Bank Ghana": "013",
  "GCB Bank": "014",
  "Guaranty Trust Bank (Ghana)": "015",
  "National Investment Bank": "016",
  "OmniBSIC Bank Ghana": "017",
  "Prudential Bank Ghana": "018",
  "Republic Bank Ghana": "019",
  "Société Générale Ghana": "020",
  "Stanbic Bank Ghana": "021",
  "Standard Chartered Ghana": "022",
  "United Bank for Africa (UBA)": "023",
  "Universal Merchant Bank (UMB)": "024",
  "Zenith Bank Ghana": "025"
};

const GHANA_BANKS = Object.keys(BANK_CODES).sort();

const MOMO_NETWORKS = [
  { 
    id: "MTN", // Paystack code for MTN Ghana
    name: "MTN", 
    logo: "/mtn-logo.jpg",
    color: "bg-yellow-400" 
  },
  { 
    id: "VOD", // Paystack code for Telecel (Vodafone) Ghana
    name: "Telecel", 
    logo: "/telecel-logo.jpg", 
    color: "bg-white" 
  },
  { 
    id: "ATL", // Paystack code for AT (AirtelTigo) Ghana
    name: "AT", 
    logo: "/airtelTigo-logo.jpg", 
    color: "bg-white" 
  }
];

interface PaymentConfig {
  method: "Bank" | "MoMo";
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  momoNetwork?: string;
  momoNumber?: string;
  momoName?: string;
  subaccountCode?: string;
  platformFeePercentage?: number;
  schoolSettlementPercentage?: number;
  status: "pending" | "active" | "error";
}

const DEFAULT_PLATFORM_FEE_PERCENTAGE = 2.5;
const DEFAULT_SCHOOL_SETTLEMENT_PERCENTAGE = 97.5;

const CURRENT_PLATFORM_FEE_PERCENTAGE = DEFAULT_PLATFORM_FEE_PERCENTAGE;
const CURRENT_SCHOOL_SETTLEMENT_PERCENTAGE = 100 - CURRENT_PLATFORM_FEE_PERCENTAGE;

const PaymentSettings: React.FC = () => {
  const { school } = useSchool();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [config, setConfig] = useState<PaymentConfig>({
    method: "Bank",
    status: "pending"
  });
  const [activeConfig, setActiveConfig] = useState<PaymentConfig | null>(null);
  const [showForm, setShowForm] = useState(false);
  const platformFeePercentage = CURRENT_PLATFORM_FEE_PERCENTAGE;
  const schoolSettlementPercentage = CURRENT_SCHOOL_SETTLEMENT_PERCENTAGE;

  useEffect(() => {
    async function fetchPaymentSettings() {
      if (!school?.id) return;
      try {
        const schoolDoc = await getDoc(doc(firestore, "schools", school.id));
        if (schoolDoc.exists()) {
          const data = schoolDoc.data();
          if (data.paymentSettings) {
            const normalizedPaymentSettings = {
              ...data.paymentSettings,
              platformFeePercentage: CURRENT_PLATFORM_FEE_PERCENTAGE,
              schoolSettlementPercentage: CURRENT_SCHOOL_SETTLEMENT_PERCENTAGE,
            };
            setConfig(normalizedPaymentSettings);
            setActiveConfig(normalizedPaymentSettings);
          }
        }
      } catch (error) {
        console.error("Error fetching payment settings:", error);
      } finally {
        setInitialLoading(false);
      }
    }
    fetchPaymentSettings();
  }, [school?.id]);

  const handleSave = async () => {
    if (!school?.id) return;

    // Validation
    if (config.method === "Bank") {
      if (!config.bankName || !config.accountNumber || !config.accountName) {
        showToast("Please fill in all bank details", { type: "error" });
        return;
      }
    } else {
      if (!config.momoNetwork || !config.momoNumber || !config.momoName) {
        showToast("Please fill in all Mobile Money details", { type: "error" });
        return;
      }
    }

    setLoading(true);
    try {
      const businessName = config.method === "Bank" ? config.accountName : config.momoName;
      const bankCode = config.method === "Bank" ? BANK_CODES[config.bankName || ""] : config.momoNetwork;
      const accountNumber = config.method === "Bank" ? config.accountNumber : config.momoNumber;

      const idToken = await auth.currentUser?.getIdToken();

      const response = await fetch(`${API_BASE_URL}/api/schools/setup-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ 
          ...config,
          schoolId: school.id,
          businessName,
          bankCode,
          accountNumber,
          contactPhone: school.phone || ""
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to setup Paystack subaccount");
      }

      const activatedConfig: PaymentConfig = {
        ...config,
        ...(result.paymentSettings || {}),
        subaccountCode: result.subaccountCode || result.paymentSettings?.subaccountCode,
        platformFeePercentage: result.paymentSettings?.platformFeePercentage ?? DEFAULT_PLATFORM_FEE_PERCENTAGE,
        schoolSettlementPercentage: result.paymentSettings?.schoolSettlementPercentage ?? DEFAULT_SCHOOL_SETTLEMENT_PERCENTAGE,
        status: "active"
      };

      setConfig(prev => ({
        ...prev,
        ...activatedConfig,
        status: "active"
      }));
      setActiveConfig(activatedConfig);

      showToast("Payment settings activated successfully!", { type: "success" });
      setShowForm(false);
    } catch (error: any) {
      console.error("Error saving payment settings:", error);
      showToast(error.message || "Failed to update payment settings", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1160A8]"></div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-[#1160A8]/10 rounded-lg text-[#1160A8]">
              <CreditCard size={24} />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Payment Settings</h1>
              <p className="text-xs sm:text-sm text-slate-500">Configure how you receive fee payments from parents</p>
            </div>
          </div>
                  {activeConfig?.status === "active" ? (
            <div className="space-y-4">
              <div className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg border border-green-100 text-xs sm:text-sm font-medium w-fit">
                <CheckCircle2 size={14} />
                Online Payments Active
              </div>

              {/* Current Account Summary */}
              <div className="bg-slate-900 text-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-10 group-hover:scale-110 transition-transform">
                  <ShieldCheck size={80} className="sm:w-[120px] sm:h-[120px]" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-2 text-slate-400 text-[10px] uppercase tracking-widest mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Current Payout Account
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <p className="text-slate-400 text-[10px] mb-0.5">Payment Method</p>
                      <p className="font-bold text-sm sm:text-lg flex items-center gap-2">
                        {activeConfig.method === "Bank" ? <Building2 size={16} /> : <Smartphone size={16} />}
                        {activeConfig.method === "Bank" ? "Bank Transfer" : "Mobile Money"}
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-400 text-[10px] mb-0.5">Account Holder</p>
                      <p className="font-bold text-sm sm:text-lg uppercase truncate">
                        {activeConfig.method === "Bank" 
                          ? (activeConfig.accountName || "Not set") 
                          : (activeConfig.momoName || "Not set")}
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-400 text-[10px] mb-0.5">
                        {activeConfig.method === "Bank" ? "Bank Name" : "Network"}
                      </p>
                      <p className="font-bold text-sm sm:text-lg">
                        {activeConfig.method === "Bank" 
                          ? activeConfig.bankName 
                          : MOMO_NETWORKS.find(n => n.id === activeConfig.momoNetwork)?.name || activeConfig.momoNetwork || "Not set"}
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-400 text-[10px] mb-0.5">Account Number</p>
                      <p className="font-bold text-sm sm:text-lg tracking-wider">
                        {activeConfig.method === "Bank" 
                          ? (activeConfig.accountNumber || "Not set") 
                          : (activeConfig.momoNumber || "Not set")}
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-400 text-[10px] mb-0.5">School Settlement</p>
                      <p className="font-bold text-sm sm:text-lg">
                        {schoolSettlementPercentage}%
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-400 text-[10px] mb-0.5">Platform Fee</p>
                      <p className="font-bold text-sm sm:text-lg">
                        {platformFeePercentage}%
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-white/10 flex items-center justify-between gap-2">
                    <div className="text-[9px] sm:text-[10px] text-slate-500 font-mono uppercase truncate">
                      ID: {activeConfig.subaccountCode}
                    </div>
                    <div className="text-[9px] sm:text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/30 whitespace-nowrap">
                      VERIFIED
                    </div>
                  </div>
                </div>

                {/* Edit Button */}
                <button
                  onClick={() => setShowForm(!showForm)}
                  className="absolute top-4 right-4 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all sm:hidden group-hover:block"
                  title="Change Account Details"
                >
                  <Settings size={18} />
                </button>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900">
                <div className="flex gap-3">
                  <Info className="mt-0.5 shrink-0 text-blue-600" size={18} />
                  <div className="space-y-2">
                    <p className="font-bold">How online payment settlement works</p>
                    <p>
                      When a parent pays online, Paystack sends {schoolSettlementPercentage}% of the payment to your payout account and keeps {platformFeePercentage}% for School Manager GH platform services.
                    </p>
                    <p className="text-xs leading-5 text-blue-800">
                      Example: if a parent pays GHS 1,000, your school receives GHS {schoolSettlementPercentage * 10} and the platform fee is GHS {platformFeePercentage * 10}. Paystack processing charges may also apply according to Paystack's settlement rules.
                    </p>
                  </div>
                </div>
              </div>

              {activeConfig?.status === "active" && !showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 font-medium hover:border-[#1160A8] hover:text-[#1160A8] transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={18} />
                  Change Payout Account Details
                </button>
              )}
              
              {showForm && (
                <button
                  onClick={() => {
                    setShowForm(false);
                    // Reset config to active values
                    if (activeConfig) setConfig(activeConfig);
                  }}
                  className="w-full py-3 text-slate-500 font-medium hover:text-red-500 transition-all flex items-center justify-center gap-2"
                >
                  <X size={18} />
                  Cancel and Keep Current Account
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 rounded-lg border border-amber-100 text-xs sm:text-sm font-medium">
              <AlertCircle size={16} />
              Setup required for online payments
            </div>
          )}
        </div>

        <div className={`p-6 space-y-8 ${(activeConfig?.status === "active" && !showForm) ? "hidden" : "block"}`}>
          {/* Info Card */}
          <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
            <div className="flex gap-3">
              <Info className="text-blue-600 shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-blue-800 leading-relaxed">
                <p className="font-semibold mb-1">How it works:</p>
                <p>When parents pay fees online, the funds will be automatically routed to the account you provide below. 
                Our payment partner (Paystack) handles the transfers securely. Payouts are typically processed the next business day.</p>
              </div>
            </div>
          </div>

          {/* Method Selection */}
          <div>
            <label className="text-sm font-bold text-slate-700 block mb-4 uppercase tracking-wider">
              Payout Destination
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setConfig({ ...config, method: "Bank" })}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                  config.method === "Bank"
                    ? "border-[#1160A8] bg-[#1160A8]/5 ring-2 ring-[#1160A8]/10"
                    : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <div className={`p-3 rounded-lg ${config.method === "Bank" ? "bg-[#1160A8] text-white" : "bg-slate-100 text-slate-500"}`}>
                  <Building2 size={24} />
                </div>
                <div>
                  <span className="block font-bold text-slate-900">Bank Account</span>
                  <span className="text-xs text-slate-500">Transfer to local bank account</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, method: "MoMo" })}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                  config.method === "MoMo"
                    ? "border-[#1160A8] bg-[#1160A8]/5 ring-2 ring-[#1160A8]/10"
                    : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <div className={`p-3 rounded-lg ${config.method === "MoMo" ? "bg-[#1160A8] text-white" : "bg-slate-100 text-slate-500"}`}>
                  <Smartphone size={24} />
                </div>
                <div>
                  <span className="block font-bold text-slate-900">Mobile Money</span>
                  <span className="text-xs text-slate-500">Instant payout to MoMo wallet</span>
                </div>
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-6 pt-4 border-t border-slate-100">
            {config.method === "Bank" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Bank Name</label>
                  <select
                    value={config.bankName || ""}
                    onChange={(e) => setConfig({ ...config, bankName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-[#1160A8] focus:ring-1 focus:ring-[#1160A8] outline-none transition-all"
                  >
                    <option value="">Select a bank</option>
                    {GHANA_BANKS.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Account Number</label>
                  <input
                    type="text"
                    value={config.accountNumber || ""}
                    onChange={(e) => setConfig({ ...config, accountNumber: e.target.value.replace(/\D/g, "") })}
                    placeholder="Enter account number"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-[#1160A8] focus:ring-1 focus:ring-[#1160A8] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Account Holder Name</label>
                  <input
                    type="text"
                    value={config.accountName || ""}
                    onChange={(e) => setConfig({ ...config, accountName: e.target.value })}
                    placeholder="Enter account name"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-[#1160A8] focus:ring-1 focus:ring-[#1160A8] outline-none transition-all"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">MoMo Network</label>
                  <div className="grid grid-cols-3 gap-3">
                    {MOMO_NETWORKS.map(net => (
                      <button
                        key={net.id}
                        type="button"
                        onClick={() => setConfig({ ...config, momoNetwork: net.id })}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                          config.momoNetwork === net.id
                            ? "border-[#1160A8] bg-[#1160A8]/5 font-bold"
                            : "border-slate-100 bg-slate-50 hover:border-slate-200"
                        }`}
                      >
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden shadow-sm bg-white border border-slate-100`}>
                          <img 
                            src={net.logo} 
                            alt={net.name} 
                            className="w-full h-full object-contain p-1"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              if (target.parentElement) {
                                target.parentElement.innerHTML = `<span class="text-[10px] font-bold text-slate-400">${net.name}</span>`;
                              }
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-700 font-bold">{net.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mobile Number</label>
                  <input
                    type="text"
                    value={config.momoNumber || ""}
                    onChange={(e) => setConfig({ ...config, momoNumber: e.target.value.replace(/\D/g, "") })}
                    placeholder="024XXXXXXX"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-[#1160A8] focus:ring-1 focus:ring-[#1160A8] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Wallet Holder Name</label>
                  <input
                    type="text"
                    value={config.momoName || ""}
                    onChange={(e) => setConfig({ ...config, momoName: e.target.value })}
                    placeholder="Enter wallet name"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-[#1160A8] focus:ring-1 focus:ring-[#1160A8] outline-none transition-all"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Security Note */}
          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <ShieldCheck className="text-slate-400 shrink-0 mt-0.5" size={20} />
            <div className="text-xs text-slate-500 leading-relaxed">
              <strong>Security Assurance:</strong> Your bank details are encrypted and used only for automated payouts via Paystack. We do not store full account access tokens.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[10px] sm:text-xs text-slate-500 max-w-none sm:max-w-[60%] text-center sm:text-left">
            By activating payments, you agree to the platform's payment terms and Paystack's service agreement.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-[#1160A8] text-white rounded-xl font-bold hover:bg-[#0d4d86] disabled:opacity-50 transition-all shadow-md shadow-[#1160A8]/20"
          >
            {loading ? (
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
            ) : (
              <Save size={18} />
            )}
            Save & Activate
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentSettings;
