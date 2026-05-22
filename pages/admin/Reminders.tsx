import React, { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { useSchool } from "../../context/SchoolContext";
import { useAuth } from "../../context/AuthContext";
import { firestore } from "../../services/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { showToast } from "../../services/toast";
import { MessageSquare, Users, Send, Loader2, RefreshCw, AlertTriangle, Sparkles, CreditCard, Wallet, ShieldAlert, ChevronDown, Filter } from "lucide-react";
import { CLASSES_LIST, getFilteredClasses } from "../../constants";
import { usePaystackPayment } from "react-paystack";

// Types
type ParentContact = { name: string; phone: string; class?: string; studentName?: string };
type SendResult = { phone: string; success: boolean; error?: string };

// Dynamic SMS Rate fetched from settings
const SAFE_BROADCAST_LIMIT = 50;

const TEMPLATES = [
  { label: "School Fees Reminder", text: "Dear Parent, this is a reminder that school fees for this term are due. Kindly make payment at your earliest convenience. Thank you." },
  { label: "School Resumption", text: "Dear Parent, school resumes on Monday. Please ensure your ward is in school early. Thank you." },
  { label: "PTA Meeting", text: "Dear Parent, you are invited to a PTA Meeting on [DATE] at [TIME]. Your attendance is very important. Thank you." },
  { label: "Report Card Ready", text: "Dear Parent, your ward's report card is ready for collection. Please visit the school office. Thank you." },
];

const Reminders: React.FC = () => {
  const { school } = useSchool();
  const { user } = useAuth();
  
  // Recipients
  const [parents, setParents] = useState<ParentContact[]>([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [classFilter, setClassFilter] = useState("All");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Dynamic Rate state
  const [smsCostPerMessage, setSmsCostPerMessage] = useState(0.05);

  useEffect(() => {
    const fetchSmsRate = async () => {
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const docRef = doc(firestore, "settings", "platform_sms");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && typeof data.retailRatePerSms === "number") {
            setSmsCostPerMessage(data.retailRatePerSms);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch dynamic platform SMS rate from settings, falling back to 0.05:", err);
      }
    };
    fetchSmsRate();
  }, []);

  // Message
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  
  // Stats
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [topupModalOpen, setTopupModalOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("50");
  const [processingTopup, setProcessingTopup] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [rightSidebarTab, setRightSidebarTab] = useState<"recipients" | "history">("recipients");
  const [generatedReference, setGeneratedReference] = useState("");
  const [paymentsHistory, setPaymentsHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [confirmSendModalOpen, setConfirmSendModalOpen] = useState(false);
  const [broadcastsHistory, setBroadcastsHistory] = useState<any[]>([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(false);

  useEffect(() => {
    setWalletBalance(school?.smsWallet?.balance || 0);
  }, [school]);

  // Verify SMS topup payment on return from Paystack redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference");
    if (!reference || !school?.id) return;

    const verifyTopup = async () => {
      try {
        setVerifyingPayment(true);
        const { verifySchoolPayment } = await import("../../services/backendApi");
        const res = await verifySchoolPayment({ reference });
        if (res.success && res.status === "success") {
          showToast("SMS Wallet topped up successfully!", { type: "success" });
          
          // Fetch updated balance from database immediately
          const { doc, getDoc } = await import("firebase/firestore");
          const schoolRef = doc(firestore, "schools", school.id);
          const snap = await getDoc(schoolRef);
          if (snap.exists()) {
             const data = snap.data();
             setWalletBalance(data?.smsWallet?.balance ?? 0);
          }
          
          // Clean URL parameters
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          showToast(`Top up status: ${res.status || "Pending verification."}`, { type: "info" });
        }
      } catch (error: any) {
        console.error("SMS Topup verification error:", error);
        showToast(error.message || "Failed to verify top up payment.", { type: "error" });
      } finally {
        setVerifyingPayment(false);
      }
    };

    verifyTopup();
  }, [school?.id]);

  // Load SMS Top-up history
  const loadHistory = async () => {
    if (!school?.id) return;
    setLoadingHistory(true);
    try {
      const { collection, query, where, getDocs } = await import("firebase/firestore");
      const q = query(
        collection(firestore, "payments"),
        where("schoolId", "==", school.id)
      );
      const snap = await getDocs(q);
      const list = snap.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now())
          };
        })
        .filter((payment: any) => payment.type === "sms_topup")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 50);
      setPaymentsHistory(list);
    } catch (err: any) {
      console.error("Error loading payment history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load Broadcasts Sent History
  const loadBroadcastsHistory = async () => {
    if (!school?.id) return;
    setLoadingBroadcasts(true);
    try {
      const { collection, query, where, getDocs } = await import("firebase/firestore");
      const q = query(
        collection(firestore, "reminders"),
        where("schoolId", "==", school.id)
      );
      const snap = await getDocs(q);
      const list = snap.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now())
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 50);
      setBroadcastsHistory(list);
    } catch (err: any) {
      console.error("Error loading broadcasts history:", err);
    } finally {
      setLoadingBroadcasts(false);
    }
  };

  useEffect(() => {
    loadHistory();
    loadBroadcastsHistory();
  }, [school?.id]);

  const paystackConfig = {
    reference: generatedReference,
    email: user?.email || "admin@school.com",
    amount: Math.round(Number(topupAmount) * 100),
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "",
    currency: "GHS",
  };

  const initializePayment = usePaystackPayment(paystackConfig);

  useEffect(() => {
    if (generatedReference && paystackConfig.publicKey) {
      initializePayment({
        onSuccess: async (refObj: any) => {
          setVerifyingPayment(true);
          try {
            const { verifySchoolPayment } = await import("../../services/backendApi");
            const res = await verifySchoolPayment({ reference: refObj.reference });
            if (res.success && res.status === "success") {
              showToast("SMS Wallet topped up successfully!", { type: "success" });
              
              // Load new balance dynamically
              const { doc, getDoc } = await import("firebase/firestore");
              const schoolRef = doc(firestore, "schools", school?.id);
              const snap = await getDoc(schoolRef);
              if (snap.exists()) {
                 const data = snap.data();
                 setWalletBalance(data?.smsWallet?.balance ?? 0);
              }
              // Reload transaction history
              loadHistory();
              // Close the modal
              setTopupModalOpen(false);
            } else {
              showToast(`Payment status: ${res.status || "Success but verification pending."}`, { type: "info" });
            }
          } catch (err: any) {
            showToast(err.message || "Failed to verify topup payment.", { type: "error" });
          } finally {
            setVerifyingPayment(false);
            setGeneratedReference(""); // clear reference
          }
        },
        onClose: () => {
          showToast("Payment cancelled.", { type: "info" });
          setGeneratedReference(""); // clear reference
        }
      });
    }
  }, [generatedReference]);

  const handleTopup = async () => {
    const numericAmount = Number(topupAmount);
    if (!numericAmount || numericAmount <= 0) {
      showToast("Please enter a valid amount.", { type: "error" });
      return;
    }
    
    if (!import.meta.env.VITE_PAYSTACK_PUBLIC_KEY) {
      showToast("Payment gateway configuration missing. Contact system owner.", { type: "error" });
      return;
    }
    
    try {
      setProcessingTopup(true);
      const { initiateSmsTopup } = await import("../../services/backendApi");
      const response = await initiateSmsTopup({
        amount: numericAmount,
        currency: "GHS",
      });
      // Set reference to trigger usePaystackPayment inline popup
      setGeneratedReference(response.reference);
    } catch (error: any) {
      console.error("SMS topup initiation error:", error);
      showToast(error.message || "Failed to initiate top up payment.", { type: "error" });
    } finally {
      setProcessingTopup(false);
    }
  };

  // Load parents from Firestore
  useEffect(() => {
    if (!school?.id) return;
    const load = async () => {
      setLoadingParents(true);
      try {
        const q = query(collection(firestore, "students"), where("schoolId", "==", school.id));
        const snap = await getDocs(q);
        const list: ParentContact[] = [];
        const seen = new Set<string>();
        snap.docs.forEach((doc) => {
          const d = doc.data() as any;
          const phone = String(d.guardianPhone || d.parentPhone || d.guardian_phone || d.contactPhone || "").trim();
          const name = String(d.guardianName || d.parentName || d.guardian_name || d.contactName || "Parent").trim();
          const studentName = d.firstName && d.lastName ? `${d.firstName} ${d.lastName}` : "Student";
          
          let className = d.class || d.className || d.classLevel || d.grade;
          if (d.classId) {
             const found = CLASSES_LIST.find(c => c.id === d.classId);
             if (found) className = found.name;
          }
          
          const seenKey = `${phone}-${className || "No Class"}`;
          if (phone && !seen.has(seenKey)) {
            seen.add(seenKey);
            list.push({ name, phone, class: className, studentName });
          }
        });
        setParents(list);
        setSelectedPhones(new Set());
      } catch (err: any) {
        showToast("Failed to load parent contacts: " + err.message, { type: "error" });
      } finally {
        setLoadingParents(false);
      }
    };
    load();
  }, [school?.id]);

  const classes = ["All", ...Array.from(new Set(parents.map((p) => p.class).filter(Boolean) as string[])).sort()];
  
  const filteredParents = classFilter === "All"
      ? parents
      : classFilter === "No Class"
        ? parents.filter((p) => !p.class)
        : parents.filter((p) => p.class === classFilter);
        
  const availableClasses = getFilteredClasses(school?.schoolType);

  const getClassParentCount = (className: string) => {
    return parents.filter((p) => p.class === className).length;
  };

  const noClassCount = parents.filter((p) => !p.class).length;

  const selectClassGroup = (label: string, contacts: ParentContact[]) => {
    setClassFilter(label === "All School" ? "All" : label);
    setSelectedPhones(new Set(contacts.map((p) => p.phone).slice(0, SAFE_BROADCAST_LIMIT)));
  };

  const togglePhone = (phone: string) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); 
      else {
        if (next.size >= SAFE_BROADCAST_LIMIT) {
           showToast(`Limit of ${SAFE_BROADCAST_LIMIT} recipients reached.`, { type: "info" });
           return prev;
        }
        next.add(phone);
      }
      return next;
    });
  };

  const toggleAll = () => {
    const visible = filteredParents.map((p) => p.phone);
    const allSelected = visible.every((ph) => selectedPhones.has(ph));
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visible.forEach((ph) => next.delete(ph));
      } else {
        // Only add up to the limit
        let added = 0;
        for (const ph of visible) {
          if (!next.has(ph)) {
            if (next.size >= SAFE_BROADCAST_LIMIT) break;
            next.add(ph);
            added++;
          }
        }
        if (next.size >= SAFE_BROADCAST_LIMIT && added < visible.length) {
            showToast(`Selected up to the safe limit of ${SAFE_BROADCAST_LIMIT}.`, { type: "info" });
        }
      }
      return next;
    });
  };

  const estimatedCost = selectedPhones.size * smsCostPerMessage;
  const messageLength = message.length;
  // A standard SMS is 160 characters. Above that, it uses multiple credits.
  const smsParts = messageLength === 0 ? 0 : Math.ceil(messageLength / 160);
  const totalEstimatedCost = estimatedCost * (smsParts || 1);
  const topupNumericAmount = Number(topupAmount || 0);
  const topupEstimatedSmsCredits =
    smsCostPerMessage > 0 && topupNumericAmount > 0
      ? Math.floor(topupNumericAmount / smsCostPerMessage)
      : 0;

  const getCreditsForAmount = (amount: string | number) => {
    const numericAmount = Number(amount || 0);
    if (!numericAmount || smsCostPerMessage <= 0) return 0;
    return Math.floor(numericAmount / smsCostPerMessage);
  };

  const handleSend = () => {
    if (!message.trim()) { showToast("Please enter a message.", { type: "error" }); return; }
    if (selectedPhones.size === 0) { showToast("Select at least one recipient.", { type: "error" }); return; }
    if (selectedPhones.size > SAFE_BROADCAST_LIMIT) {
      showToast(`Safe sending allows up to ${SAFE_BROADCAST_LIMIT} parents per broadcast.`, { type: "error" });
      return;
    }
    
    if (walletBalance < totalEstimatedCost) {
        showToast("Insufficient SMS balance. Please top up.", { type: "error" });
        return;
    }

    setConfirmSendModalOpen(true);
  };

  const executeSend = async () => {
    setConfirmSendModalOpen(false);
    setSending(true);

    try {
      const { getAuth } = await import("firebase/auth");
      const fb = getAuth();
      const token = await fb.currentUser?.getIdToken() ?? "";
      
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";
      
      const res = await fetch(`${API_BASE}/api/admin/reminders/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: message.trim(), phones: Array.from(selectedPhones) }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to send SMS reminders");
      }

      showToast(`Successfully sent ${selectedPhones.size} messages!`, { type: "success" });
      setMessage("");
      setSelectedPhones(new Set());
      
      // Update local wallet balance for UI
      if (data.newBalance !== undefined) {
         setWalletBalance(data.newBalance);
      }
      
      // Reload broadcasts log list dynamically
      loadBroadcastsHistory();
      
    } catch (err: any) {
      showToast(err.message || "Failed to send reminders.", { type: "error" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout title="SMS Reminders">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 px-0">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 p-4 sm:p-6 text-white shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <MessageSquare size={20} />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold leading-tight">SMS Reminders</h1>
                <p className="text-indigo-100 text-xs sm:text-sm">Send important notifications directly via SMS</p>
              </div>
            </div>

            {/* SMS Wallet Balance */}
            <div className="flex items-center gap-3 bg-white/10 rounded-xl p-3 border border-white/20">
              <div className="bg-white/20 p-2 rounded-lg">
                <Wallet size={20} className="text-indigo-50" />
              </div>
              <div>
                <p className="text-xs text-indigo-100 font-medium">SMS Balance</p>
                <div className="flex items-end gap-1">
                  <p className="text-xl font-bold">GHS {walletBalance.toFixed(2)}</p>
                  <button 
                    onClick={() => setTopupModalOpen(true)}
                    className="ml-2 bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider transition"
                  >
                    Top Up
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main grid ────────────────────────────────── */}
        <div className="flex flex-col xl:grid xl:grid-cols-3 gap-4 sm:gap-6">

          {/* ── LEFT: Composer ─────────────────────────────── */}
          <div className="xl:col-span-2 space-y-4 sm:space-y-5">
            
            {/* ── Message Composer ─────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-indigo-500 shrink-0" />
                  <h2 className="font-semibold text-slate-800 text-sm sm:text-base">Compose SMS</h2>
                </div>
                {/* Cost Badge */}
                <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                    <CreditCard size={13} />
                    <span className="text-xs font-bold">Estimated Cost: GHS {totalEstimatedCost.toFixed(2)}</span>
                </div>
              </div>

              {/* Templates */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Quick Templates</p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => setMessage(t.text)}
                      className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4 bg-amber-50/50 border border-amber-100 rounded-xl p-3 sm:p-4">
                <p className="text-xs text-amber-800 font-medium mb-1 flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-amber-600" />
                  Safety Guardrails
                </p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  To prevent accidental bulk spending, there is a hard limit of <strong>{SAFE_BROADCAST_LIMIT} recipients per message</strong>.
                  1 standard SMS is 160 characters. Longer messages will cost multiple credits per recipient.
                </p>
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Type your SMS message here..."
                className="w-full border border-slate-200 rounded-xl p-3 sm:p-4 text-sm text-slate-800 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              />
              
              <div className="flex items-center justify-between mt-1.5">
                <div className="flex flex-col">
                    <p className="text-xs text-slate-500 font-medium">{message.length} chars ({smsParts} SMS part{smsParts !== 1 ? 's' : ''})</p>
                </div>
                <p className={`text-xs ${selectedPhones.size >= SAFE_BROADCAST_LIMIT ? "text-amber-500 font-bold" : "text-slate-400 font-medium"}`}>
                  {selectedPhones.size} / {SAFE_BROADCAST_LIMIT} max recipients
                </p>
              </div>

              <button
                onClick={handleSend}
                disabled={sending || !message.trim() || selectedPhones.size === 0 || walletBalance < totalEstimatedCost}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-full bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {sending ? (
                  <><Loader2 size={15} className="animate-spin" /> Sending...</>
                ) : (
                  <><Send size={15} /> Send SMS (Cost: GHS {totalEstimatedCost.toFixed(2)})</>
                )}
              </button>
            </div>
          </div>

          {/* ── RIGHT: Sidebar (Recipients & Top-Up History Tabs) ─────────────────────────────── */}
          <div className="xl:col-span-1 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[500px] xl:h-[650px]">
            {/* Tab Header Selector */}
            <div className="p-2 border-b border-slate-100 shrink-0 flex items-center gap-1 bg-slate-50/50 rounded-t-2xl">
              <button
                type="button"
                onClick={() => setRightSidebarTab("recipients")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition ${rightSidebarTab === "recipients" ? "bg-white text-indigo-600 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-800"}`}
              >
                <Users size={15} />
                Recipients
              </button>
              <button
                type="button"
                onClick={() => {
                  setRightSidebarTab("history");
                  loadHistory();
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition ${rightSidebarTab === "history" ? "bg-white text-indigo-600 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-800"}`}
              >
                <RefreshCw size={15} className={loadingHistory ? "animate-spin" : ""} />
                Top-Up History
              </button>
            </div>

            {/* TAB CONTENT 1: Recipients List */}
            {rightSidebarTab === "recipients" && (
              <>
                <div className="p-4 sm:p-5 border-b border-slate-100 shrink-0 relative">
                  <div className="flex items-center gap-2 mb-3">
                    <Users size={16} className="text-slate-500" />
                    <h2 className="font-semibold text-slate-800 text-sm sm:text-base">Select Recipients</h2>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Filter size={14} className="text-indigo-500" />
                        Class: <strong className="text-indigo-700">{classFilter === "All" ? "All Classes" : classFilter}</strong>
                      </span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                    </button>

                    {dropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setDropdownOpen(false)}
                        />
                        <div className="absolute left-0 right-0 mt-2 z-20 bg-white border border-slate-150 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar p-1">
                          <button
                            onClick={() => {
                              selectClassGroup("All School", parents);
                              setDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition ${classFilter === "All" ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600"}`}
                          >
                            All Classes
                          </button>
                          {availableClasses.map((cls) => {
                            const count = getClassParentCount(cls.name);
                            return (
                              <button
                                key={cls.id}
                                onClick={() => {
                                  selectClassGroup(cls.name, parents.filter((p) => p.class === cls.name));
                                  setDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between ${classFilter === cls.name ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600"}`}
                              >
                                <span>{cls.name}</span>
                                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px]">{count}</span>
                              </button>
                            );
                          })}
                          {noClassCount > 0 && (
                            <button
                              onClick={() => {
                                selectClassGroup("No Class", parents.filter((p) => !p.class));
                                  setDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-between ${classFilter === "No Class" ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-600"}`}
                            >
                              <span>No Class</span>
                              <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px]">{noClassCount}</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
                  {loadingParents ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                      <Loader2 size={24} className="animate-spin" />
                      <p className="text-sm font-medium">Loading parents...</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between mb-3 px-2">
                        <p className="text-xs font-semibold text-slate-500">
                          {filteredParents.length} Contacts {classFilter !== "All" && `in ${classFilter}`}
                        </p>
                        <button
                          onClick={toggleAll}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
                        >
                          {filteredParents.every(p => selectedPhones.has(p.phone)) ? "Deselect All" : "Select Max Allowed"}
                        </button>
                      </div>
                      {filteredParents.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 text-sm">No parents found.</div>
                      ) : (
                        filteredParents.map((p) => {
                          const isSelected = selectedPhones.has(p.phone);
                          return (
                            <label
                              key={`${p.phone}-${p.class || "No Class"}`}
                              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition border ${isSelected ? "bg-indigo-50/50 border-indigo-200" : "hover:bg-slate-50 border-transparent"}`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => togglePhone(p.phone)}
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                                <p className="text-[11px] text-slate-500 truncate">{p.phone} • Ward: {p.studentName}</p>
                              </div>
                              {p.class && (
                                <span className="shrink-0 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                                  {p.class}
                                </span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* TAB CONTENT 2: Transaction History */}
            {rightSidebarTab === "history" && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar flex flex-col">
                {loadingHistory ? (
                  <div className="h-full flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <Loader2 size={24} className="animate-spin text-indigo-600" />
                    <p className="text-xs font-semibold">Loading payment history...</p>
                  </div>
                ) : paymentsHistory.length === 0 ? (
                  <div className="h-full flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400 gap-2 my-auto">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 text-slate-400 mb-2">
                      <CreditCard size={20} />
                    </div>
                    <p className="text-sm font-bold text-slate-700">No transactions found</p>
                    <p className="text-xs max-w-[200px]">Top up your wallet to start tracking SMS billing activities.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Transaction Logs ({paymentsHistory.length})</p>
                    <div className="space-y-2.5">
                      {paymentsHistory.map((p) => {
                        const dateStr = p.createdAt instanceof Date 
                          ? p.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "Date Unknown";
                        
                        const statusColors = p.status === "success" 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100 animate-pulse" 
                          : p.status === "pending" 
                            ? "bg-amber-50 text-amber-700 border-amber-100" 
                            : "bg-rose-50 text-rose-700 border-rose-100";

                        return (
                          <div 
                            key={p.id}
                            className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-1.5 shadow-sm hover:border-slate-200 transition"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800">GHS {Number(p.amount / 100 || 0).toFixed(2)}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColors} uppercase tracking-wider`}>
                                {p.status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                              <span className="font-mono text-[9px] truncate max-w-[150px]">{p.reference || p.id}</span>
                              <span>{dateStr}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Sent Broadcast Logs ────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6 transition hover:shadow-md duration-300">
          <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <MessageSquare size={16} />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 text-sm sm:text-base">Sent Broadcast Logs</h2>
                <p className="text-slate-500 text-[11px] font-medium">Track your school reminder dispatches and costs</p>
              </div>
            </div>
            <button
              onClick={loadBroadcastsHistory}
              disabled={loadingBroadcasts}
              className="p-2 hover:bg-slate-50 rounded-xl border border-slate-100 text-slate-400 hover:text-slate-600 transition flex items-center justify-center gap-1 text-xs font-bold disabled:opacity-50"
            >
              <RefreshCw size={14} className={loadingBroadcasts ? "animate-spin text-indigo-600" : ""} />
              {loadingBroadcasts ? "Refreshing..." : "Refresh Logs"}
            </button>
          </div>

          {loadingBroadcasts ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 size={24} className="animate-spin text-indigo-600" />
              <p className="text-xs font-bold">Loading sent broadcasts...</p>
            </div>
          ) : broadcastsHistory.length === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 text-slate-400">
                <Send size={18} />
              </div>
              <p className="text-sm font-bold text-slate-700">No broadcasts sent yet</p>
              <p className="text-xs max-w-xs leading-relaxed">Compose a message above and select recipients to send your first reminder broadcast.</p>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar -mx-5 px-5">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                    <th className="pb-3 pr-4 font-bold">Date & Time</th>
                    <th className="pb-3 pr-4 font-bold">Recipients</th>
                    <th className="pb-3 pr-4 font-bold">Message Content</th>
                    <th className="pb-3 font-bold text-right">Cost (GHS)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/60">
                  {broadcastsHistory.map((b) => {
                    const dateStr = b.createdAt instanceof Date 
                      ? b.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "Date Unknown";
                    
                    return (
                      <tr key={b.id} className="text-xs text-slate-700 hover:bg-slate-50/50 transition">
                        <td className="py-3.5 pr-4 whitespace-nowrap font-semibold text-slate-600">{dateStr}</td>
                        <td className="py-3.5 pr-4 whitespace-nowrap">
                          <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full font-bold">
                            {b.recipientCount} parent{b.recipientCount !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="py-3.5 pr-4 max-w-xs sm:max-w-md truncate font-medium text-slate-800" title={b.message}>
                          {b.message}
                        </td>
                        <td className="py-3.5 font-bold text-right text-slate-800">
                          GHS {Number(b.cost || 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Up Wallet Modal */}
        {topupModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => !processingTopup && setTopupModalOpen(false)}
            />
            
            {/* Content Container */}
            <div className="relative my-4 max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-100 bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="p-5 sm:p-6 space-y-5 sm:space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                      <CreditCard size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">Top Up SMS Balance</h3>
                      <p className="text-xs text-slate-500">Buy SMS credits with Mobile Money / Card</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setTopupModalOpen(false)}
                    disabled={processingTopup}
                    className="text-slate-400 hover:text-slate-600 font-bold text-lg leading-none"
                  >
                    ×
                  </button>
                </div>

                {/* Balance & Info */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-500">
                    <span>SMS Segment Rate</span>
                    <span className="text-slate-800">GHS {smsCostPerMessage.toFixed(2)} / SMS</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-slate-500">
                    <span>Platform Service</span>
                    <span className="text-emerald-600 font-bold">Secured via Paystack</span>
                  </div>
                </div>

                {/* Amount input & Packages */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Select Package Amount (GHS)
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {["20", "50", "100", "200"].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setTopupAmount(amt)}
                          className={`py-2 rounded-xl text-xs font-bold transition border ${topupAmount === amt ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                        >
                          <span className="block">GH₵ {amt}</span>
                          <span className={`mt-0.5 block text-[9px] font-semibold ${topupAmount === amt ? "text-indigo-100" : "text-slate-400"}`}>
                            {getCreditsForAmount(amt).toLocaleString()} SMS
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Or Enter Custom Amount (GHS)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">GH₵</span>
                      <input
                        type="number"
                        min="5"
                        step="1"
                        value={topupAmount}
                        onChange={(e) => setTopupAmount(e.target.value)}
                        placeholder="Min GHS 5"
                        className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Credit Estimate */}
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                        SMS credits you will receive
                      </p>
                      <p className="mt-1 text-3xl font-extrabold text-emerald-800">
                        {topupEstimatedSmsCredits.toLocaleString()}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-emerald-700/80">
                        Standard 160-character SMS parts
                      </p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm border border-emerald-100">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Calculation
                      </p>
                      <p className="mt-1 text-xs font-extrabold text-slate-700">
                        GHS {topupNumericAmount.toFixed(2)} / GHS {smsCostPerMessage.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Info Note */}
                <div className="flex gap-2.5 bg-indigo-50/60 rounded-2xl p-3 border border-indigo-100 text-xs text-indigo-700 leading-relaxed font-semibold">
                  <ShieldAlert size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                  <p>Funds go directly to Super Admin wallet. Your school wallet receives the paid amount, and each SMS is charged at the current retail rate.</p>
                </div>

                {/* Submit button */}
                <button
                  type="button"
                  onClick={handleTopup}
                  disabled={processingTopup || Number(topupAmount) <= 0}
                  className="w-full bg-emerald-600 text-white py-3.5 rounded-full font-semibold hover:bg-emerald-700 transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 disabled:opacity-60 disabled:shadow-none"
                >
                  {processingTopup ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Initializing Payment...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Pay GH₵ {Number(topupAmount || 0).toFixed(2)}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Confirm Send SMS Modal */}
        {confirmSendModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with elegant blur */}
            <div 
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => setConfirmSendModalOpen(false)}
            />
            
            {/* Modal Box */}
            <div className="relative bg-white rounded-3xl border border-slate-100 shadow-2xl p-6 sm:p-7 max-w-md w-full z-10 transform scale-100 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center">
                {/* Stunning Alert Icon */}
                <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 mb-4 animate-bounce">
                  <AlertTriangle size={28} />
                </div>
                
                <h3 className="text-lg font-bold text-slate-800">Confirm Broadcast</h3>
                <p className="text-slate-500 text-xs mt-1 max-w-xs leading-relaxed">
                  You are about to broadcast an SMS to parents. Please verify the billing estimates below.
                </p>

                {/* Estimate Breakdown Card */}
                <div className="w-full mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-150 text-left space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Total Recipients:</span>
                    <span className="text-slate-800 font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{selectedPhones.size} contact{selectedPhones.size !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Message Length:</span>
                    <span className="text-slate-800 font-bold">{message.length} chars ({smsParts} part{smsParts !== 1 ? 's' : ''})</span>
                  </div>
                  <div className="h-px bg-slate-200/60 my-2" />
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Rate per SMS Part:</span>
                    <span className="text-slate-700 font-bold">GHS {smsCostPerMessage.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Estimated Cost:</span>
                    <span className="text-amber-600 font-extrabold text-sm">GHS {totalEstimatedCost.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-slate-200/60 my-2" />
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500 font-semibold">Wallet Balance:</span>
                    <span className="text-slate-600 font-semibold">GHS {walletBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500 font-semibold">Remaining Balance:</span>
                    <span className="text-emerald-600 font-bold">GHS {(walletBalance - totalEstimatedCost).toFixed(2)}</span>
                  </div>
                </div>

                {/* Confirm & Cancel Buttons */}
                <div className="w-full grid grid-cols-2 gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setConfirmSendModalOpen(false)}
                    className="w-full py-3 rounded-full border border-slate-200 text-slate-500 font-bold text-xs hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={executeSend}
                    className="w-full py-3 rounded-full bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100"
                  >
                    <Send size={13} />
                    Send Broadcast
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default Reminders;
