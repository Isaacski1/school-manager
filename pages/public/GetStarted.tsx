import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, Lightbulb, Loader2, Rocket, ShieldCheck, UploadCloud, X } from "lucide-react";
import { signInWithEmailAndPassword, sendEmailVerification, signOut } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";
import { auth, firestore, storage } from "../../services/firebase";
import { showToast } from "../../services/toast";
import { startPublicSchoolSetup } from "../../services/backendApi";

const STEPS = ["School Profile", "Admin Account", "Subscription Plan", "Setup Details", "Review & Launch"];

const inputCls: React.CSSProperties = {
  width: "100%", padding: "13px 16px", borderRadius: 12, fontSize: 15,
  border: "1.5px solid #DBEAFE", outline: "none", background: "white",
  color: "#0f172a", fontFamily: "inherit", boxSizing: "border-box",
  transition: "border-color 0.2s",
};
const labelCls: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 };
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
    if (currentStep === 2) return !!(formData.plan && formData.featurePlan);
    if (currentStep === 3) return !!(formData.academicYear.trim() && formData.currentTerm.trim());
    return true;
  }, [currentStep, formData]);

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
    console.log("[Launch] Starting setup with payload:", {
      ...formData,
      password: "***",
      confirmPassword: "***",
    });

    try {
      // Helper to convert file to base64
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
        logoData, // Pass the base64 data
        logoFileName: formData.logoFile?.name,
        plan: formData.plan,
        featurePlan: formData.featurePlan,
      });

      console.log("[Launch] Backend response:", response);

      if (!response?.schoolId) {
        throw new Error("Backend did not return a valid schoolId.");
      }

      console.log("[Launch] Signing in to verify account...");
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.adminEmail.trim().toLowerCase(),
        formData.password
      );

      if (userCredential.user) {
        try {
          console.log("[Launch] Sending verification email...");
          await sendEmailVerification(userCredential.user);
        } catch (emailError) {
          console.error("[Launch] Verification email failed to send:", emailError);
        }

      }

      console.log("[Launch] Showing success popup.");
      setShowSuccessPopup(true);
    } catch (err: any) {
      console.error("[Launch] Critical error:", err);
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
        style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", border: "1px solid #E2E8F0" }} 
      />
    ) : "Not provided"],
  ];

  return (
    <PublicSiteLayout>
      {/* Responsive Design System */}
      <style>{`
        @media (max-width: 960px) {
          .get-started-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .get-started-header { padding: 60px 24px 80px !important; }
          .get-started-section { margin-top: -30px !important; }
        }
        @media (max-width: 640px) {
          .form-grid-2 { grid-template-columns: 1fr !important; gap: 16px !important; }
          .get-started-form { padding: 32px 20px !important; border-radius: 24px !important; }
          .progress-card { padding: 20px !important; border-radius: 20px !important; }
          .trust-badge { padding: 16px !important; }
        }
      `}</style>

      {/* Blue hero header */}
      <section className="get-started-header" style={{ background: "linear-gradient(135deg, #0B4A82 0%, #1160A8 100%)", padding: "72px 24px 100px" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", margin: "0 0 12px 0" }}>Start Free Trial</p>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800, color: "white", margin: "0 0 14px 0", lineHeight: 1.15 }}>
            Launch your school workspace today 🇬🇭
          </h1>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.78)", margin: 0 }}>
            Set up your school profile, create your admin account, and go live — all in under 5 minutes.
          </p>
        </motion.div>
      </section>

      {/* Main content */}
      <section className="get-started-section" style={{ padding: "0 24px 80px", marginTop: -52 }}>
        <div className="get-started-grid" style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "320px 1fr", gap: 28, alignItems: "start" }}>

          {/* Left sidebar */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            {/* Steps list */}
            <div className="progress-card" style={{ background: "white", borderRadius: 24, padding: 24, boxShadow: "0 4px 24px rgba(11,74,130,0.1)", border: "1.5px solid #DBEAFE", marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#94A3B8", margin: "0 0 16px 0" }}>Your Progress</p>
              {STEPS.map((label, i) => {
                const done = i < currentStep;
                const active = i === currentStep;
                return (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: i < STEPS.length - 1 ? 4 : 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14,
                        background: done ? "#16A34A" : active ? "linear-gradient(135deg, #0B4A82, #1160A8)" : "#F1F5F9",
                        color: done || active ? "white" : "#94A3B8",
                        boxShadow: active ? "0 4px 16px rgba(11,74,130,0.25)" : "none",
                        flexShrink: 0,
                      }}>
                        {done ? <CheckCircle2 size={18} /> : i + 1}
                      </div>
                      {i < STEPS.length - 1 && (
                        <div style={{ width: 2, height: 20, background: done ? "#16A34A" : "#E2E8F0", margin: "2px 0" }} />
                      )}
                    </div>
                    <p style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? "#0B4A82" : done ? "#16A34A" : "#94A3B8", margin: 0, paddingBottom: i < STEPS.length - 1 ? 24 : 0 }}>{label}</p>
                  </div>
                );
              })}
            </div>

            {/* Trust badge */}
            <div className="trust-badge" style={{ background: "#EFF6FF", borderRadius: 20, padding: 20, border: "1.5px solid #DBEAFE" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "#0B4A82", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ShieldCheck size={20} color="white" />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#0B4A82", margin: "0 0 4px 0" }}>Secure & Private</p>
                  <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>Your school data is protected with enterprise-grade security on Firebase.</p>
                </div>
              </div>
            </div>

            <p style={{ marginTop: 16, fontSize: 13, color: "#64748B", textAlign: "center" }}>
              Prefer a walkthrough first?{" "}
              <Link to="/book-demo" style={{ color: "#0B4A82", fontWeight: 700 }}>Book a demo</Link>
            </p>
          </motion.div>

          {/* Right: Form card */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            <div className="get-started-form" style={{ background: "white", borderRadius: 28, padding: "36px 32px", boxShadow: "0 8px 48px rgba(11,74,130,0.1)", border: "1.5px solid #DBEAFE" }}>
              {/* Step title */}
              <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#94A3B8", margin: "0 0 6px 0" }}>Step {currentStep + 1} of {STEPS.length}</p>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 }}>{STEPS[currentStep]}</h2>
              </div>

              <form onSubmit={handleFormSubmit}>
                <AnimatePresence mode="wait">
                  <motion.div key={currentStep} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>

                    {currentStep === 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div>
                          <label style={labelCls}>School Logo</label>
                          <div style={{
                            border: "2px dashed #DBEAFE", borderRadius: 16, padding: "24px",
                            textAlign: "center", background: "#F8FAFC", cursor: "pointer",
                            position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 8
                          }}>
                            <input
                              type="file" accept="image/*"
                              onChange={handleLogoChange}
                              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                            />
                            {formData.logoPreview ? (
                              <div style={{ position: "relative" }}>
                                <img src={formData.logoPreview} alt="Logo preview" style={{ width: 80, height: 80, borderRadius: 16, objectFit: "cover", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFormData(p => ({ ...p, logoFile: null, logoPreview: "" })) }} style={{ position: "absolute", top: -8, right: -8, background: "white", border: "1px solid #E2E8F0", borderRadius: "50%", padding: 4, cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                                  <X size={14} color="#64748B" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <UploadCloud size={24} color="#0B4A82" />
                                </div>
                                <div>
                                  <p style={{ fontSize: 14, fontWeight: 600, color: "#0B4A82", margin: "0 0 4px 0" }}>Click or drag logo to upload</p>
                                  <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>SVG, PNG, JPG (max. 2MB)</p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <div>
                          <label style={labelCls}>School Name *</label>
                          <input style={inputCls} required value={formData.schoolName} onChange={set("schoolName")} placeholder="e.g. Akosombo International School" />
                        </div>
                        <div className="form-grid-2" style={gridTwo}>
                          <div>
                            <label style={labelCls}>Phone Number *</label>
                            <input style={inputCls} required value={formData.schoolPhone} onChange={set("schoolPhone")} placeholder="+233 24 000 0000" />
                          </div>
                          <div>
                            <label style={labelCls}>School Email *</label>
                            <input style={inputCls} required type="email" value={formData.schoolEmail} onChange={set("schoolEmail")} placeholder="school@email.com" />
                          </div>
                        </div>
                        <div>
                          <label style={labelCls}>Address</label>
                          <input style={inputCls} value={formData.address} onChange={set("address")} placeholder="Street, City, Region" />
                        </div>
                        <div className="form-grid-2" style={gridTwo}>
                          <div>
                            <label style={labelCls}>School Type</label>
                            <select style={inputCls} value={formData.schoolType} onChange={set("schoolType")}>
                              <option value="">Select type</option>
                              <option>Primary School</option>
                              <option>Junior High School</option>
                              <option>Senior High School</option>
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
                            <input style={{ ...inputCls, borderColor: formData.confirmPassword && formData.confirmPassword !== formData.password ? "#EF4444" : "#DBEAFE" }} required type="password" value={formData.confirmPassword} onChange={set("confirmPassword")} placeholder="••••••••" />
                            {formData.confirmPassword && formData.confirmPassword !== formData.password && (
                              <p style={{ fontSize: 12, color: "#EF4444", margin: "4px 0 0 0" }}>Passwords do not match</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {currentStep === 2 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          {/* Starter Plan */}
                          <div 
                            onClick={() => {
                              if (Number(formData.studentEstimate) <= 300) {
                                setFormData(p => ({ ...p, featurePlan: "starter" }));
                              }
                            }}
                            style={{ 
                              padding: 24, borderRadius: 20, border: `2px solid ${formData.featurePlan === "starter" ? "#0B4A82" : "#E2E8F0"}`,
                              background: formData.featurePlan === "starter" ? "#F0F9FF" : "white", 
                              cursor: Number(formData.studentEstimate) > 300 ? "not-allowed" : "pointer", 
                              transition: "all 0.2s",
                              opacity: Number(formData.studentEstimate) > 300 ? 0.5 : 1,
                              position: "relative"
                            }}
                          >
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: "#E0F2FE", display: "flex", alignItems: "center", justifyItems: "center", marginBottom: 16 }}>
                              <CheckCircle2 size={24} color="#0369A1" style={{ margin: "auto" }} />
                            </div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px 0" }}>Starter</h3>
                            <p style={{ fontSize: 13, color: "#64748B", margin: 0, lineHeight: 1.5 }}>Max 300 Students. Perfect for small schools.</p>
                            {Number(formData.studentEstimate) > 300 && (
                              <p style={{ fontSize: 11, color: "#EF4444", fontWeight: 700, marginTop: 8 }}>Est. {formData.studentEstimate} students exceeds limit</p>
                            )}
                          </div>
                          {/* Standard Plan */}
                          <div 
                            onClick={() => setFormData(p => ({ ...p, featurePlan: "standard" }))}
                            style={{ 
                              padding: 24, borderRadius: 20, border: `2px solid ${formData.featurePlan === "standard" ? "#0B4A82" : "#E2E8F0"}`,
                              background: formData.featurePlan === "standard" ? "#F0F9FF" : "white", cursor: "pointer", transition: "all 0.2s"
                            }}
                          >
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: "#FEF3C7", display: "flex", alignItems: "center", justifyItems: "center", marginBottom: 16 }}>
                              <ShieldCheck size={24} color="#B45309" style={{ margin: "auto" }} />
                            </div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px 0" }}>Standard</h3>
                            <p style={{ fontSize: 13, color: "#64748B", margin: 0, lineHeight: 1.5 }}>Max 700 Students. Advanced features for growing schools.</p>
                          </div>
                        </div>

                        <div>
                          <label style={labelCls}>Preferred Billing Cycle (Post-Trial)</label>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                            {["monthly", "termly", "yearly"].map(p => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, plan: p }))}
                                style={{ 
                                  padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 600,
                                  border: `1.5px solid ${formData.plan === p ? "#0B4A82" : "#DBEAFE"}`,
                                  background: formData.plan === p ? "#0B4A82" : "white",
                                  color: formData.plan === p ? "white" : "#0B4A82",
                                  cursor: "pointer", transition: "all 0.2s"
                                }}
                              >
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                              </button>
                            ))}
                          </div>
                          <p style={{ fontSize: 12, color: "#64748B", marginTop: 12, fontStyle: "italic", display: "flex", alignItems: "center", gap: 6 }}>
                            <Lightbulb size={14} color="#0B4A82" /> You can change your plan or cycle anytime after your 30-day trial ends.
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
                          <div style={{ marginTop: 12, padding: "12px 16px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #E2E8F0" }}>
                            {formData.onboardingTemplate === "default" ? (
                              <p style={{ fontSize: 13, color: "#475569", margin: 0, lineHeight: 1.6, display: "flex", gap: 8 }}>
                                <Lightbulb size={16} color="#0B4A82" style={{ flexShrink: 0, marginTop: 2 }} />
                                <span><strong>Default Template:</strong> Pre-configured with standard classes, grading systems, and roles. Recommended for a quick start.</span>
                              </p>
                            ) : (
                              <p style={{ fontSize: 13, color: "#475569", margin: 0, lineHeight: 1.6, display: "flex", gap: 8 }}>
                                <Lightbulb size={16} color="#0B4A82" style={{ flexShrink: 0, marginTop: 2 }} />
                                <span><strong>Basic Setup:</strong> Provides a clean workspace with only core modules. Best if you want to configure everything yourself.</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <div style={{ background: "#EFF6FF", borderRadius: 16, padding: 16, border: "1px solid #DBEAFE", display: "flex", gap: 10 }}>
                          <CheckCircle2 size={18} color="#0B4A82" style={{ flexShrink: 0, marginTop: 1 }} />
                          <p style={{ fontSize: 13, color: "#0B4A82", margin: 0, lineHeight: 1.6 }}>
                            After launch, you can add teachers, students, classes, and configure all settings from your admin dashboard.
                          </p>
                        </div>
                      </div>
                    )}

                    {currentStep === 4 && (
                      <div>
                        <p style={{ fontSize: 14, color: "#64748B", marginBottom: 20 }}>Please review your details before creating your school workspace.</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {reviewRows.map(([label, value], index) => (
                            <div key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #E2E8F0" }}>
                              <span style={{ fontSize: 13, color: "#64748B", fontWeight: 600 }}>{label}</span>
                              <span style={{ fontSize: 14, color: "#0f172a", fontWeight: 700, textAlign: "right", maxWidth: "60%" }}>{value || <span style={{ color: "#94A3B8", fontStyle: "italic" }}>Not set</span>}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </motion.div>
                </AnimatePresence>

                {/* Navigation buttons */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 32, paddingTop: 24, borderTop: "1px solid #F1F5F9" }}>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(p => Math.max(p - 1, 0))}
                    disabled={currentStep === 0 || loading}
                    style={{ padding: "11px 24px", borderRadius: 999, fontSize: 14, fontWeight: 600, border: "1.5px solid #E2E8F0", background: "white", color: "#64748B", cursor: currentStep === 0 ? "not-allowed" : "pointer", opacity: currentStep === 0 ? 0.4 : 1 }}
                  >
                    <ArrowLeft size={16} /> Back
                  </button>

                  {currentStep < STEPS.length - 1 ? (
                    <button
                      type="submit"
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 999, fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg, #0B4A82, #1160A8)", color: "white", border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(11,74,130,0.28)" }}
                    >
                      Continue <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={loading}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 999, fontSize: 15, fontWeight: 700, background: loading ? "#94A3B8" : "linear-gradient(135deg, #0B4A82, #1160A8)", color: "white", border: "none", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 4px 16px rgba(11,74,130,0.28)" }}
                    >
                      {loading ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Creating workspace...</> : <><Rocket size={18} /> Launch School Workspace</>}
                    </button>
                  )}
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </form>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Success Popup */}
      <AnimatePresence>
        {showSuccessPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 24, zIndex: 1000
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              style={{
                background: "white", borderRadius: 24, padding: "40px 32px",
                maxWidth: 440, width: "100%", textAlign: "center",
                boxShadow: "0 24px 48px rgba(0,0,0,0.2)"
              }}
            >
              <div style={{
                width: 80, height: 80, borderRadius: "50%", background: "#DCFCE7",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 24px"
              }}>
                <CheckCircle2 size={40} color="#16A34A" />
              </div>
              
              <h3 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: "0 0 12px 0" }}>
                School Created Successfully!
              </h3>
              
              <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.6, margin: "0 0 32px 0" }}>
                Your school workspace has been set up. We've sent a verification link to <strong>{formData.adminEmail}</strong>.
              </p>
              
              <button
                onClick={() => navigate("/verify-email", { replace: true, state: { email: formData.adminEmail.trim().toLowerCase(), password: formData.password } })}
                style={{
                  width: "100%", padding: "14px", borderRadius: 999, fontSize: 15, fontWeight: 700,
                  background: "linear-gradient(135deg, #0B4A82, #1160A8)", color: "white",
                  border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(11,74,130,0.28)"
                }}
              >
                Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PublicSiteLayout>
  );
};

export default GetStarted;
