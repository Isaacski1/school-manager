import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, Lightbulb, Loader2, Rocket, ShieldCheck, UploadCloud, X } from "lucide-react";
import { signOut } from "firebase/auth";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";
import { showToast } from "../../services/toast";
import { startPublicSchoolSetup } from "../../services/backendApi";
import { auth } from "../../services/firebase";

const STEPS = ["School Profile", "Admin Account", "Subscription Plan", "Setup Details", "Review & Launch"];

const inputCls: React.CSSProperties = {
  width: "100%", padding: "13px 16px", borderRadius: 12, fontSize: 15,
  border: "1.5px solid rgba(255,255,255,0.1)", outline: "none", background: "rgba(255,255,255,0.03)",
  color: "white", fontFamily: "inherit", boxSizing: "border-box",
  transition: "all 0.2s",
};
const labelCls: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", display: "block", marginBottom: 6 };
const gridTwo: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };

const GetStarted = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [formData, setFormData] = useState({
    schoolName: "", schoolPhone: "", schoolEmail: "", address: "",
    schoolType: "", studentEstimate: "", adminFullName: "", adminEmail: "",
    password: "", confirmPassword: "", academicYear: "", currentTerm: "Term 1",
    onboardingTemplate: "default",
    logoFile: null as File | null,
    logoPreview: "",
    plan: "trial",
    featurePlan: "starter",
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast("Logo size must be less than 2MB", { type: "error" });
        return;
      }
      setFormData(p => ({ ...p, logoFile: file, logoPreview: URL.createObjectURL(file) }));
    }
  };

  const set = (field: keyof typeof formData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setFormData(p => ({ ...p, [field]: e.target.value }));

  const valid = useMemo(() => {
    if (currentStep === 0) return !!(formData.schoolName.trim() && formData.schoolPhone.trim() && formData.schoolEmail.trim());
    if (currentStep === 1) return !!(formData.adminFullName.trim() && formData.adminEmail.trim() && formData.password.length >= 6 && formData.password === formData.confirmPassword);
    if (currentStep === 2) return !!(formData.plan && formData.featurePlan && !(formData.featurePlan === "starter" && Number(formData.studentEstimate) > 200));
    if (currentStep === 3) return !!(formData.academicYear.trim() && formData.currentTerm.trim());
    return true;
  }, [currentStep, formData]);

  useEffect(() => {
    if (Number(formData.studentEstimate) > 200 && formData.featurePlan === "starter") {
      setFormData((prev) => ({ ...prev, featurePlan: "standard" }));
    }
  }, [formData.studentEstimate, formData.featurePlan]);

  const handleNext = () => {
    if (!valid) { showToast("Please complete all required fields.", { type: "error" }); return; }
    setCurrentStep(p => Math.min(p + 1, STEPS.length - 1));
  };

  const executeLaunch = async () => {
    if (formData.password !== formData.confirmPassword) {
      showToast("Passwords do not match.", { type: "error" });
      return;
    }
    setLoading(true);
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }

      const getBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });
      };

      let logoData = undefined;
      if (formData.logoFile) {
        logoData = await getBase64(formData.logoFile);
      }

      const response = await startPublicSchoolSetup({
        schoolName: formData.schoolName.trim(),
        schoolPhone: formData.schoolPhone.trim(),
        schoolEmail: formData.schoolEmail.trim(),
        address: formData.address.trim(),
        schoolType: formData.schoolType.trim(),
        studentEstimate: Number(formData.studentEstimate) || undefined,
        adminFullName: formData.adminFullName.trim(),
        adminEmail: formData.adminEmail.trim().toLowerCase(),
        password: formData.password,
        academicYear: formData.academicYear.trim(),
        currentTerm: formData.currentTerm,
        onboardingTemplate: formData.onboardingTemplate,
        logoData,
        logoFileName: formData.logoFile?.name,
        plan: formData.plan,
        featurePlan: formData.featurePlan,
      });

      if (!response?.schoolId) {
        throw new Error("Backend did not return a valid schoolId.");
      }

      setShowSuccessPopup(true);
      const failedNotifications = Object.values(response?.notifications || {}).some(
        (result: any) => !result?.sent,
      );
      if (failedNotifications && response?.message) {
        showToast(response.message, { type: "warning" });
      }
    } catch (err: any) {
      if (err?.code === "ADMIN_EMAIL_EXISTS") {
        showToast(err.message, { type: "warning" });
        navigate("/verify-email", {
          replace: true,
          state: {
            email: formData.adminEmail.trim().toLowerCase(),
            password: formData.password,
          },
        });
        return;
      }

      showToast(err?.message || "Failed to start school setup.", {
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep < STEPS.length - 1) {
      handleNext();
    } else {
      executeLaunch();
    }
  };

  const reviewRows = [
    ["School Name", formData.schoolName],
    ["School Email", formData.schoolEmail],
    ["School Phone", formData.schoolPhone],
    ["School Type", formData.schoolType],
    ["Admin Name", formData.adminFullName],
    ["Admin Email", formData.adminEmail],
    ["Feature Plan", formData.featurePlan.charAt(0).toUpperCase() + formData.featurePlan.slice(1)],
    ["Billing Cycle", formData.plan.charAt(0).toUpperCase() + formData.plan.slice(1)],
    ["Academic Year", formData.academicYear],
    ["Current Term", formData.currentTerm],
    ["School Logo", formData.logoPreview ? (
      <img 
        src={formData.logoPreview} 
        alt="Logo" 
        style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(255,255,255,0.1)" }} 
      />
    ) : "Not provided"],
  ];

  return (
    <PublicSiteLayout>
      <style>{`
        select option {
          background-color: #041222;
          color: white;
        }
        @media (max-width: 960px) {
          .get-started-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .get-started-header { padding: 60px 24px 80px !important; }
          .get-started-section { margin-top: -30px !important; }
        }
        @media (max-width: 640px) {
          .form-grid-2 { grid-template-columns: 1fr !important; gap: 16px !important; }
          .get-started-section { padding: 0 14px 72px !important; }
          .get-started-form { padding: 32px 20px !important; border-radius: 24px !important; }
          .progress-card { padding: 20px !important; border-radius: 20px !important; }
          .trust-badge { padding: 16px !important; }
          .school-profile-card { padding: 18px !important; border-radius: 20px !important; }
          .school-logo-upload { grid-template-columns: 1fr !important; text-align: center !important; padding: 20px !important; }
          .school-logo-visual { margin: 0 auto !important; }
          .school-profile-grid { grid-template-columns: 1fr !important; }
          .school-profile-header { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
          .school-profile-header h3 { font-size: 20px !important; }
          .school-profile-field-full { grid-column: auto !important; }
          .subscription-plan-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .subscription-plan-card {
            min-height: auto !important;
            padding: 18px !important;
            display: grid !important;
            grid-template-columns: 42px 1fr !important;
            column-gap: 14px !important;
            align-items: start !important;
          }
          .subscription-plan-card-icon { width: 42px !important; height: 42px !important; margin-bottom: 0 !important; }
          .subscription-plan-card h3 { font-size: 17px !important; margin-top: 1px !important; }
          .subscription-plan-card p { font-size: 13px !important; line-height: 1.45 !important; }
          .billing-cycle-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
          .billing-cycle-option {
            min-height: 58px !important;
            padding: 12px 14px !important;
            display: grid !important;
            grid-template-columns: 1fr auto !important;
            align-items: center !important;
            text-align: left !important;
          }
          .billing-cycle-option span { line-height: 1.2 !important; }
          .billing-cycle-option .billing-discount { grid-column: 2 !important; justify-self: end !important; }
          .billing-note { align-items: flex-start !important; line-height: 1.45 !important; }
          .review-intro { line-height: 1.55 !important; }
          .review-row {
            align-items: flex-start !important;
            gap: 8px !important;
          }
          .review-label { flex: 0 0 auto !important; }
          .review-value {
            min-width: 0 !important;
            max-width: 58% !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
            white-space: normal !important;
          }
          .form-actions { gap: 12px !important; }
          .form-actions button { flex: 1 1 0 !important; min-width: 0 !important; padding-left: 16px !important; padding-right: 16px !important; }
        }
        @media (max-width: 420px) {
          .get-started-form { padding: 28px 18px !important; }
          .review-row {
            flex-direction: column !important;
            justify-content: flex-start !important;
            align-items: stretch !important;
          }
          .review-value {
            max-width: none !important;
            text-align: left !important;
          }
          .form-actions { flex-direction: column-reverse !important; align-items: stretch !important; }
          .form-actions button { width: 100% !important; }
        }
        @media (min-width: 641px) and (max-width: 960px) {
          .school-profile-grid { grid-template-columns: 1fr 1fr !important; }
          .school-profile-field-full { grid-column: 1 / -1 !important; }
          .subscription-plan-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (min-width: 961px) {
          .school-profile-grid { grid-template-columns: 1.1fr 1fr !important; }
          .school-profile-field-full { grid-column: 1 / -1 !important; }
        }
      `}</style>

      <section className="get-started-header" style={{ background: "transparent", padding: "72px 24px 100px" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", margin: "0 0 12px 0" }}>Register Your School</p>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800, color: "white", margin: "0 0 14px 0", lineHeight: 1.15 }}>
            Launch your school workspace today 🇬🇭
          </h1>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.78)", margin: 0 }}>
            Set up your school profile, create your admin account, and go live — all in under 5 minutes.
          </p>
        </motion.div>
      </section>

      <section className="get-started-section" style={{ padding: "0 24px 80px", marginTop: -52 }}>
        <div className="get-started-grid" style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "320px 1fr", gap: 28, alignItems: "start" }}>

          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <div className="progress-card" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 24, padding: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", border: "1.5px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)", marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", margin: "0 0 16px 0" }}>Your Progress</p>
              {STEPS.map((label, i) => {
                const done = i < currentStep;
                const active = i === currentStep;
                return (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: i < STEPS.length - 1 ? 4 : 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14,
                        background: done ? "#10B981" : active ? "#0B4A82" : "rgba(255,255,255,0.05)",
                        color: done || active ? "white" : "rgba(255,255,255,0.4)",
                        boxShadow: active ? "0 4px 16px rgba(0,0,0,0.3)" : "none",
                        flexShrink: 0,
                      }}>
                        {done ? <CheckCircle2 size={18} /> : i + 1}
                      </div>
                      {i < STEPS.length - 1 && (
                        <div style={{ width: 2, height: 20, background: done ? "#10B981" : "rgba(255,255,255,0.1)", margin: "2px 0" }} />
                      )}
                    </div>
                    <p style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? "white" : done ? "#10B981" : "rgba(255,255,255,0.4)", margin: 0, paddingBottom: i < STEPS.length - 1 ? 24 : 0 }}>{label}</p>
                  </div>
                );
              })}
            </div>

            <div className="trust-badge" style={{ background: "rgba(255,255,255,0.02)", borderRadius: 20, padding: 20, border: "1.5px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "#0B4A82", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ShieldCheck size={20} color="white" />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "white", margin: "0 0 4px 0" }}>Secure & Private</p>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, margin: 0 }}>Your school data is protected with enterprise-grade security on Firebase.</p>
                </div>
              </div>
            </div>

            <p style={{ marginTop: 16, fontSize: 13, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
              Prefer a walkthrough first?{" "}
              <Link to="/book-demo" style={{ color: "#93C5FD", fontWeight: 700 }}>Book a demo</Link>
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            <div className="get-started-form" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 28, padding: "36px 32px", boxShadow: "0 8px 48px rgba(0,0,0,0.3)", border: "1.5px solid rgba(255,255,255,0.1)", backdropFilter: "blur(20px)" }}>
              <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", margin: "0 0 6px 0" }}>Step {currentStep + 1} of {STEPS.length}</p>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: "white", margin: 0 }}>{STEPS[currentStep]}</h2>
              </div>

              <form onSubmit={handleFormSubmit}>
                <AnimatePresence mode="wait">
                  <motion.div key={currentStep} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>

                    {currentStep === 0 && (
                      <div className="school-profile-card" style={{ display: "flex", flexDirection: "column", gap: 20, padding: 22, borderRadius: 24, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        <div className="school-profile-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                          <div>
                            <h3 style={{ fontSize: 22, fontWeight: 800, color: "white", margin: "0 0 6px 0" }}>Tell us about your school</h3>
                            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, margin: 0 }}>Add your school details so your workspace starts with the right profile.</p>
                          </div>
                          <span style={{ flexShrink: 0, borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#93C5FD", fontSize: 12, fontWeight: 700, padding: "8px 12px" }}>Step 1</span>
                        </div>

                        <label className="school-logo-upload" style={{ border: "2px dashed rgba(255,255,255,0.2)", borderRadius: 22, padding: 24, background: "rgba(255,255,255,0.03)", cursor: "pointer", position: "relative", display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", alignItems: "center", gap: 18, overflow: "hidden" }}>
                          <input type="file" accept="image/*" onChange={handleLogoChange} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                          <div className="school-logo-visual" style={{ width: 96, height: 96, borderRadius: 24, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 14px 30px rgba(0,0,0,0.3)", position: "relative", overflow: "hidden" }}>
                            {formData.logoPreview ? (
                              <>
                                <img src={formData.logoPreview} alt="Logo preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFormData(p => ({ ...p, logoFile: null, logoPreview: "" })); }} style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.95)", border: "1px solid #E2E8F0", borderRadius: "50%", padding: 5, cursor: "pointer", boxShadow: "0 4px 10px rgba(15,23,42,0.14)" }}>
                                  <X size={14} color="#64748B" />
                                </button>
                              </>
                            ) : (
                              <UploadCloud size={34} color="rgba(255,255,255,0.5)" />
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 15, fontWeight: 800, color: "white", margin: "0 0 5px 0" }}>{formData.logoPreview ? "Logo selected" : "Upload school logo"}</p>
                            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, margin: 0 }}>Click this area to choose a PNG, JPG, WEBP, GIF, or SVG logo up to 2MB.</p>
                          </div>
                        </label>

                        <div className="school-profile-grid" style={{ display: "grid", gap: 16 }}>
                          <div className="school-profile-field-full">
                            <label style={labelCls}>School Name *</label>
                            <input style={inputCls} required value={formData.schoolName} onChange={set("schoolName")} placeholder="e.g. Akosombo International School" />
                          </div>
                          <div>
                            <label style={labelCls}>Phone Number *</label>
                            <input style={inputCls} required value={formData.schoolPhone} onChange={set("schoolPhone")} placeholder="+233 24 000 0000" />
                          </div>
                          <div>
                            <label style={labelCls}>School Email *</label>
                            <input style={inputCls} required type="email" value={formData.schoolEmail} onChange={set("schoolEmail")} placeholder="school@email.com" />
                          </div>
                          <div className="school-profile-field-full">
                            <label style={labelCls}>Address</label>
                            <input style={inputCls} value={formData.address} onChange={set("address")} placeholder="Street, City, Region" />
                          </div>
                          <div>
                            <label style={labelCls}>School Type</label>
                            <select style={inputCls} value={formData.schoolType} onChange={set("schoolType")}>
                              <option value="">Select type</option>
                              <option>Primary School</option>
                              <option>Junior High School</option>
                              <option>Basic School (Nursery to JHS)</option>
                              <option>Nursery/Kindergarten</option>
                            </select>
                          </div>
                          <div>
                            <label style={labelCls}>Estimated Students</label>
                            <input style={inputCls} type="number" min="0" value={formData.studentEstimate} onChange={set("studentEstimate")} placeholder="e.g. 350" />
                          </div>
                        </div>
                      </div>
                    )}

                    {currentStep === 1 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div>
                          <label style={labelCls}>Admin Full Name *</label>
                          <input style={inputCls} required value={formData.adminFullName} onChange={set("adminFullName")} placeholder="e.g. Kwame Asante" />
                        </div>
                        <div>
                          <label style={labelCls}>Admin Email Address *</label>
                          <input style={inputCls} required type="email" value={formData.adminEmail} onChange={set("adminEmail")} placeholder="admin@school.edu.gh" />
                        </div>
                        <div className="form-grid-2" style={gridTwo}>
                          <div>
                            <label style={labelCls}>Password * (min. 6 chars)</label>
                            <input style={inputCls} required type="password" value={formData.password} onChange={set("password")} placeholder="••••••••" />
                          </div>
                          <div>
                            <label style={labelCls}>Confirm Password *</label>
                            <input style={{ ...inputCls, borderColor: formData.confirmPassword && formData.confirmPassword !== formData.password ? "#EF4444" : "rgba(255,255,255,0.1)" }} required type="password" value={formData.confirmPassword} onChange={set("confirmPassword")} placeholder="••••••••" />
                            {formData.confirmPassword && formData.confirmPassword !== formData.password && (
                              <p style={{ fontSize: 12, color: "#EF4444", margin: "4px 0 0 0" }}>Passwords do not match</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {currentStep === 2 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        <div className="subscription-plan-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          <div 
                            className="subscription-plan-card"
                            onClick={() => { if (Number(formData.studentEstimate) <= 200) setFormData(p => ({ ...p, featurePlan: "starter" })); }}
                            style={{ 
                              padding: 24, borderRadius: 20, border: `2px solid ${formData.featurePlan === "starter" ? "#0B4A82" : "rgba(255,255,255,0.1)"}`,
                              background: formData.featurePlan === "starter" ? "rgba(11, 74, 130, 0.1)" : "rgba(255,255,255,0.03)", 
                              cursor: Number(formData.studentEstimate) > 200 ? "not-allowed" : "pointer", 
                              transition: "all 0.2s", opacity: Number(formData.studentEstimate) > 200 ? 0.72 : 1, position: "relative", backdropFilter: "blur(10px)", minHeight: 180
                            }}
                          >
                            <div className="subscription-plan-card-icon" style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(16, 185, 129, 0.1)", display: "flex", alignItems: "center", justifyItems: "center", marginBottom: 16 }}>
                              <CheckCircle2 size={24} color="#10B981" style={{ margin: "auto" }} />
                            </div>
                            <div>
                              <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px 0", color: "white" }}>Starter</h3>
                              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.5 }}>Max 200 Students. Perfect for small schools.</p>
                              {Number(formData.studentEstimate) > 200 && (
                                <p style={{ fontSize: 11, color: "#F87171", fontWeight: 700, marginTop: 8 }}>Est. {formData.studentEstimate} students exceeds limit</p>
                              )}
                            </div>
                          </div>
                          <div 
                            className="subscription-plan-card"
                            onClick={() => setFormData(p => ({ ...p, featurePlan: "standard" }))}
                            style={{ 
                              padding: 24, borderRadius: 20, border: `2px solid ${formData.featurePlan === "standard" ? "#0B4A82" : "rgba(255,255,255,0.1)"}`,
                              background: formData.featurePlan === "standard" ? "rgba(11, 74, 130, 0.1)" : "rgba(255,255,255,0.03)", cursor: "pointer", transition: "all 0.2s", backdropFilter: "blur(10px)", minHeight: 180
                            }}
                          >
                            <div className="subscription-plan-card-icon" style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(11, 74, 130, 0.1)", display: "flex", alignItems: "center", justifyItems: "center", marginBottom: 16 }}>
                              <ShieldCheck size={24} color="#93C5FD" style={{ margin: "auto" }} />
                            </div>
                            <div>
                              <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px 0", color: "white" }}>Standard</h3>
                              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.5 }}>Unlimited Students. Advanced features for growing schools.</p>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label style={labelCls}>Preferred Billing Cycle (Post-Trial)</label>
                          <div className="billing-cycle-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                            {([
                              { key: "monthly", label: "Monthly", discount: null, price: (base: number) => base },
                              { key: "termly", label: "Termly", discount: "10% off", price: (base: number) => Math.round(base * 3 * 0.9) },
                              { key: "yearly", label: "Yearly", discount: "20% off", price: (base: number) => Math.round(base * 12 * 0.8) },
                            ] as const).map(({ key, label, discount, price }) => {
                              const base = formData.featurePlan === "starter" ? 100 : 300;
                              const amt = price(base);
                              return (
                                <button
                                  className="billing-cycle-option"
                                  key={key} type="button" onClick={() => setFormData(prev => ({ ...prev, plan: key }))}
                                  style={{
                                    padding: "14px 10px", borderRadius: 12, fontSize: 13, fontWeight: 600,
                                    border: `1.5px solid ${formData.plan === key ? "#0B4A82" : "rgba(255,255,255,0.1)"}`,
                                    background: formData.plan === key ? "#0B4A82" : "rgba(255,255,255,0.03)",
                                    color: "white", cursor: "pointer", transition: "all 0.2s",
                                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                                  }}
                                >
                                  <span style={{ fontWeight: 700 }}>{label}</span>
                                  <span style={{ fontSize: 15, fontWeight: 800 }}>GH₵ {amt.toLocaleString()}</span>
                                  {discount && (
                                    <span className="billing-discount" style={{ fontSize: 10, fontWeight: 800, color: "#93C5FD", background: "rgba(147,197,253,0.15)", borderRadius: 999, padding: "2px 8px" }}>{discount}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          <p className="billing-note" style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 12, fontStyle: "italic", display: "flex", alignItems: "center", gap: 6 }}>
                            <Lightbulb size={14} color="#93C5FD" style={{ flexShrink: 0 }} /> Pricing shown is after your free 30-day trial. You can change your plan anytime.
                          </p>
                        </div>
                      </div>
                    )}

                    {currentStep === 3 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div className="form-grid-2" style={gridTwo}>
                          <div>
                            <label style={labelCls}>Academic Year *</label>
                            <input style={inputCls} required value={formData.academicYear} onChange={set("academicYear")} placeholder="e.g. 2025/2026" />
                          </div>
                          <div>
                            <label style={labelCls}>Current Term *</label>
                            <select style={inputCls} value={formData.currentTerm} onChange={set("currentTerm")}>
                              <option>Term 1</option>
                              <option>Term 2</option>
                              <option>Term 3</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label style={labelCls}>Setup Template</label>
                          <select style={inputCls} value={formData.onboardingTemplate} onChange={set("onboardingTemplate")}>
                            <option value="default">Default School Template</option>
                            <option value="basic">Basic Operational Setup</option>
                          </select>
                          <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
                            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.6, display: "flex", gap: 8 }}>
                              <Lightbulb size={16} color="#93C5FD" style={{ flexShrink: 0, marginTop: 2 }} />
                              {formData.onboardingTemplate === "default" ? (
                                <span><strong>Default Template:</strong> Pre-configured with standard classes, grading systems, and roles. Recommended for a quick start.</span>
                              ) : (
                                <span><strong>Basic Setup:</strong> Provides a clean workspace with only core modules. Best if you want to configure everything yourself.</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div style={{ background: "rgba(11, 74, 130, 0.1)", borderRadius: 16, padding: 16, border: "1px solid rgba(11, 74, 130, 0.2)", display: "flex", gap: 10 }}>
                          <CheckCircle2 size={18} color="#93C5FD" style={{ flexShrink: 0, marginTop: 1 }} />
                          <p style={{ fontSize: 13, color: "#93C5FD", margin: 0, lineHeight: 1.6 }}>After launch, you can add teachers, students, classes, and configure all settings from your admin dashboard.</p>
                        </div>
                      </div>
                    )}

                    {currentStep === 4 && (
                      <div>
                        <p className="review-intro" style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 20 }}>Please review your details before creating your school workspace.</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {reviewRows.map(([label, value], index) => (
                            <div className="review-row" key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
                              <span className="review-label" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{label}</span>
                              <span className="review-value" style={{ fontSize: 14, color: "white", fontWeight: 700, textAlign: "right", maxWidth: "60%", minWidth: 0, overflowWrap: "anywhere" }}>{value || <span style={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>Not set</span>}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                <div className="form-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                  <button
                    type="button" onClick={() => setCurrentStep(p => Math.max(p - 1, 0))}
                    disabled={currentStep === 0 || loading}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap", padding: "11px 24px", borderRadius: 999, fontSize: 14, fontWeight: 600, border: "1.5px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", cursor: currentStep === 0 ? "not-allowed" : "pointer", opacity: currentStep === 0 ? 0.4 : 1 }}
                  >
                    <ArrowLeft size={16} /> Back
                  </button>

                  <button
                    type="submit" disabled={loading}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 8, padding: "12px 28px", borderRadius: 999, fontSize: 15, fontWeight: 700, background: loading ? "rgba(255,255,255,0.1)" : "#0B4A82", color: "white", border: "none", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 4px 16px rgba(0,0,0,0.3)" }}
                  >
                    {currentStep < STEPS.length - 1 ? (<>Continue <ArrowRight size={16} /></>) : (loading ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Creating workspace...</> : <><Rocket size={18} /> Launch School Workspace</>)}
                  </button>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </form>
            </div>
          </motion.div>
        </div>
      </section>

      <AnimatePresence>
        {showSuccessPopup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1000 }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} style={{ background: "#041222", borderRadius: 24, padding: "40px 32px", maxWidth: 440, width: "100%", textAlign: "center", boxShadow: "0 24px 48px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(16, 185, 129, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><CheckCircle2 size={40} color="#10B981" /></div>
              <h3 style={{ fontSize: 24, fontWeight: 800, color: "white", margin: "0 0 12px 0" }}>School Created Successfully!</h3>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: "0 0 32px 0" }}>Your school workspace has been set up. We've sent a verification link to <strong>{formData.adminEmail}</strong>.</p>
              <button onClick={() => navigate("/verify-email", { replace: true, state: { email: formData.adminEmail.trim().toLowerCase(), password: formData.password } })} style={{ width: "100%", padding: "14px", borderRadius: 999, fontSize: 15, fontWeight: 700, background: "#0B4A82", color: "white", border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>Continue</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PublicSiteLayout>
  );
};

export default GetStarted;
