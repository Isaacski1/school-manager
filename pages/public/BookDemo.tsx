import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2, Calendar, Phone, School, Users } from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";
import { submitBookDemoRequest } from "../../services/backendApi";
import { showToast } from "../../services/toast";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "13px 16px", borderRadius: 12, fontSize: 15,
  border: "1.5px solid #DBEAFE", outline: "none", background: "white",
  color: "#0f172a", fontFamily: "inherit", boxSizing: "border-box",
  transition: "border-color 0.2s",
};

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 };

const BookDemo = () => {
  const [form, setForm] = useState({ fullName: "", schoolName: "", role: "", phone: "", email: "", studentCount: "", schoolType: "", preferredDate: "", preferredTime: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.email || !form.schoolName) {
      showToast("Please fill in your name, email and school name.", { type: "error" }); return;
    }
    setLoading(true);
    try {
      await submitBookDemoRequest({ ...form, source: "book_demo_page" });
      setDone(true);
    } catch {
      showToast("Something went wrong. Please try again.", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicSiteLayout>
      {/* Responsive Design System */}
      <style>{`
        @media (max-width: 960px) {
          .book-demo-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .book-demo-header { padding: 60px 24px 80px !important; }
          .book-demo-section { margin-top: -30px !important; }
        }
        @media (max-width: 640px) {
          .form-grid-2 { grid-template-columns: 1fr !important; gap: 16px !important; }
          .book-demo-form { padding: 32px 20px !important; border-radius: 24px !important; }
          .sidebar-card { padding: 24px 20px !important; }
          .hero-image-container { height: 220px !important; }
        }
      `}</style>

      {/* Header */}
      <section className="book-demo-header" style={{ background: "linear-gradient(135deg, #0B4A82 0%, #1160A8 100%)", padding: "80px 24px 100px" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.65)", margin: "0 0 12px 0" }}>Book a Demo</p>
          <h1 style={{ fontSize: "clamp(30px, 5vw, 48px)", fontWeight: 800, color: "white", margin: "0 0 16px 0", lineHeight: 1.15 }}>See School Manager GH in action</h1>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.8)", margin: 0 }}>Fill in your details and our team will reach out to schedule a personalised walkthrough for your school.</p>
        </motion.div>
      </section>

      {/* Content */}
      <section className="book-demo-section" style={{ padding: "0 24px 80px", marginTop: -48 }}>
        <div className="book-demo-grid" style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 32, alignItems: "start" }}>

          {/* Left: Photo + info */}
          <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            <div className="hero-image-container" style={{ borderRadius: 24, overflow: "hidden", marginBottom: 24, position: "relative", height: 280 }}>
              <img src="/img-teacher.png" alt="Teacher using School Manager GH" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(11,74,130,0.8) 0%, transparent 60%)" }} />
              <div style={{ position: "absolute", bottom: 20, left: 20, right: 20 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: "white", margin: "0 0 4px 0" }}>Personalised for your school</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", margin: 0 }}>30-minute walkthrough tailored to your needs</p>
              </div>
            </div>

            <div className="sidebar-card" style={{ background: "white", borderRadius: 20, padding: 24, border: "1.5px solid #DBEAFE" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#0B4A82", margin: "0 0 16px 0", textTransform: "uppercase", letterSpacing: "0.1em" }}>What you'll see</p>
              {[
                [Calendar, "Full platform walkthrough"],
                [School, "Live demo of your school setup"],
                [Users, "Role views: Admin & Teacher"],
                [Phone, "Q&A with our team"],
              ].map(([Icon, text]) => (
                <div key={text as string} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={18} color="#0B4A82" />
                  </div>
                  <span style={{ fontSize: 14, color: "#374151", fontWeight: 500 }}>{text as string}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: Form */}
          <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
            <div className="book-demo-form" style={{ background: "white", borderRadius: 28, padding: "36px 32px", boxShadow: "0 8px 48px rgba(11,74,130,0.1)", border: "1.5px solid #DBEAFE" }}>
              <AnimatePresence mode="wait">
                {done ? (
                  <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: "center", padding: "48px 24px" }}>
                    <CheckCircle2 size={64} color="#16A34A" style={{ margin: "0 auto 20px" }} />
                    <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "0 0 12px 0" }}>Demo request received!</h2>
                    <p style={{ fontSize: 16, color: "#64748B", lineHeight: 1.7, margin: 0 }}>Our team will be in touch within 24 hours to schedule your personalised walkthrough.</p>
                  </motion.div>
                ) : (
                  <motion.form key="form" onSubmit={handleSubmit}>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 24px 0" }}>Your details</h2>
                    <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                      <div>
                        <label style={labelStyle}>Full Name *</label>
                        <input style={inputStyle} value={form.fullName} onChange={set("fullName")} placeholder="e.g. Kwame Mensah" required />
                      </div>
                      <div>
                        <label style={labelStyle}>Your Role</label>
                        <select style={inputStyle} value={form.role} onChange={set("role")}>
                          <option value="">Select role</option>
                          <option>School Principal</option>
                          <option>Head Teacher</option>
                          <option>Administrator</option>
                          <option>IT Manager</option>
                          <option>Other</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                      <div>
                        <label style={labelStyle}>Email Address *</label>
                        <input style={inputStyle} type="email" value={form.email} onChange={set("email")} placeholder="you@school.edu.gh" required />
                      </div>
                      <div>
                        <label style={labelStyle}>Phone Number</label>
                        <input style={inputStyle} type="tel" value={form.phone} onChange={set("phone")} placeholder="+233 24 000 0000" />
                      </div>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>School Name *</label>
                      <input style={inputStyle} value={form.schoolName} onChange={set("schoolName")} placeholder="Name of your school" required />
                    </div>
                    <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                      <div>
                        <label style={labelStyle}>School Type</label>
                        <select style={inputStyle} value={form.schoolType} onChange={set("schoolType")}>
                          <option value="">Select type</option>
                          <option>Primary School</option>
                          <option>Junior High School</option>
                          <option>Senior High School</option>
                          <option>Basic School (K-9)</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Number of Students</label>
                        <input style={inputStyle} type="number" value={form.studentCount} onChange={set("studentCount")} placeholder="e.g. 250" />
                      </div>
                    </div>
                    <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                      <div>
                        <label style={labelStyle}>Preferred Date</label>
                        <input style={inputStyle} type="date" value={form.preferredDate} onChange={set("preferredDate")} />
                      </div>
                      <div>
                        <label style={labelStyle}>Preferred Time</label>
                        <select style={inputStyle} value={form.preferredTime} onChange={set("preferredTime")}>
                          <option value="">Select time</option>
                          <option>8:00 AM – 10:00 AM</option>
                          <option>10:00 AM – 12:00 PM</option>
                          <option>12:00 PM – 2:00 PM</option>
                          <option>2:00 PM – 4:00 PM</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom: 24 }}>
                      <label style={labelStyle}>Message (optional)</label>
                      <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={form.message} onChange={set("message")} placeholder="Anything specific you'd like us to cover..." />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        width: "100%", padding: "14px 24px", borderRadius: 999, fontSize: 16, fontWeight: 700,
                        background: loading ? "#94A3B8" : "linear-gradient(135deg, #0B4A82, #1160A8)",
                        color: "white", border: "none", cursor: loading ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                        boxShadow: loading ? "none" : "0 6px 24px rgba(11,74,130,0.3)",
                        transition: "all 0.2s",
                      }}
                    >
                      {loading ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Submitting...</> : <>Request Demo <ArrowRight size={18} /></>}
                    </button>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </section>
    </PublicSiteLayout>
  );
};

export default BookDemo;
