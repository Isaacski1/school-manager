import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, BookOpen, CalendarDays, CheckCircle, CreditCard, GraduationCap, ShieldCheck, Sparkles, Users } from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";
import { db } from "../../services/mockDb";

const fadeUp = { hidden: { opacity: 0, y: 32 }, show: { opacity: 1, y: 0, transition: { duration: 0.6 } } };
const stagger = { show: { transition: { staggerChildren: 0.12 } } };

const features = [
  { icon: CalendarDays, title: "Attendance Tracking", desc: "Daily student & teacher attendance with instant visibility and missed-record alerts.", color: "#EFF6FF", accent: "#2563EB" },
  { icon: BookOpen, title: "Assessments & Reports", desc: "Record tests, homework, exams and generate professional report-ready data.", color: "#F0FDF4", accent: "#16A34A" },
  { icon: CreditCard, title: "Fees & Payments", desc: "Manage school finances, track payment activity and plan billing from one screen.", color: "#FFFBEB", accent: "#D97706" },
  { icon: Users, title: "Staff & Student Records", desc: "Centralise classes, teachers and students so your school runs from one workspace.", color: "#FDF4FF", accent: "#9333EA" },
];

const roles = [
  { title: "School Admins", icon: ShieldCheck, desc: "Control students, teachers, reports, attendance, fees and settings from one dashboard.", color: "#0B4A82" },
  { title: "Teachers", icon: GraduationCap, desc: "Take attendance, enter assessments, review performance and maintain remarks quickly.", color: "#1160A8" },
  { title: "Platform Owners", icon: BarChart3, desc: "Oversee all schools, plans, payments and platform activity from the Super Admin layer.", color: "#1E40AF" },
];

const steps = [
  "Visit the marketing site & choose a plan",
  "Fill in your school details and create an admin account",
  "Platform provisions your workspace automatically",
  "Log in and start managing your school immediately",
];

const MarketingHome = () => {
  const [partnerSchools, setPartnerSchools] = useState<any[]>([
    { id: "f1", name: "Alpha Preparatory", logoUrl: "https://api.dicebear.com/7.x/initials/svg?seed=AP&backgroundColor=0B4A82" },
    { id: "f2", name: "Beacon International", logoUrl: "https://api.dicebear.com/7.x/initials/svg?seed=BI&backgroundColor=1160A8" },
    { id: "f3", name: "Crystal Academy", logoUrl: "https://api.dicebear.com/7.x/initials/svg?seed=CA&backgroundColor=1E40AF" },
    { id: "f4", name: "Delta Schools", logoUrl: "https://api.dicebear.com/7.x/initials/svg?seed=DS&backgroundColor=2563EB" },
    { id: "f5", name: "Elite Scholars", logoUrl: "https://api.dicebear.com/7.x/initials/svg?seed=ES&backgroundColor=3B82F6" }
  ]);

  useEffect(() => {
    const loadSchools = async () => {
      try {
        const data = await db.getPublicSchools();
        if (data && data.length > 0) {
          setPartnerSchools(data);
        }
      } catch (err) {
        console.error("Failed to load partner schools", err);
        // Fallback is already in state, so we don't need to do anything here
      }
    };
    loadSchools();
  }, []);

  return (
    <PublicSiteLayout>

      {/* Comprehensive Responsive Design System */}
      <style>{`
        /* Prevent horizontal scroll */
        html, body {
          max-width: 100%;
          overflow-x: hidden;
        }

        /* Global Responsive Tweaks */
        @media (max-width: 1024px) {
          section { padding: 80px 24px !important; }
        }

        /* Hero Responsive */
        @media (max-width: 968px) {
          .hero-grid { 
            grid-template-columns: 1fr !important; 
            text-align: center;
            gap: 40px !important;
          }
          .hero-text-container {
            align-items: center !important;
            max-width: 100% !important;
          }
          .hero-card-container {
            display: none !important;
          }
          .hero-badges {
            justify-content: center !important;
          }
          .hero-buttons {
            justify-content: center !important;
          }
        }

        @media (max-width: 480px) {
          .hero-buttons { flex-direction: column; width: 100%; }
          .hero-buttons a { width: 100%; justify-content: center; }
          h1 { font-size: 32px !important; }
        }

        /* Stats Section Responsive */
        @media (max-width: 768px) {
          .stats-section {
            height: auto !important;
            padding: 80px 32px !important;
            margin-top: 0 !important;
          }
          .stats-container {
            padding: 40px 32px !important;
            justify-content: center;
            text-align: center;
            position: relative !important;
          }
          .stats-grid {
            justify-content: center !important;
            gap: 40px !important;
            margin-top: 32px !important;
          }
        }

        /* Who Its For & Teacher Card Responsive */
        @media (max-width: 850px) {
          .responsive-grid {
            grid-template-columns: 1fr !important;
            gap: 48px !important;
          }
          .teacher-card-inner {
            grid-template-columns: 1fr !important;
          }
          .teacher-card-img {
            min-height: 300px !important;
            order: -1;
            padding: 0 !important;
          }
          .teacher-card-content {
            padding: 40px 24px !important;
          }
        }

        /* Feature Cards Tweaks */
        @media (max-width: 640px) {
          .features-header { text-align: center !important; }
          .feature-card { padding: 24px !important; }
        }
      `}</style>

      {/* ── HERO ── */}
      <section style={{ minHeight: "85vh", display: "flex", alignItems: "center", padding: "120px 24px 80px", position: "relative", overflow: "hidden" }}>
        {/* Real photo background */}
        <img src="/img-students.png" alt="" aria-hidden="true" loading="eager" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%", zIndex: 0 }} />
        {/* Blue brand overlay */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(11,74,130,0.85) 0%, rgba(17,96,168,0.75) 55%, rgba(30,64,175,0.65) 100%)", zIndex: 1 }} />

        <div className="hero-grid" style={{ maxWidth: 1280, margin: "0 auto", width: "100%", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 64, alignItems: "center", position: "relative", zIndex: 2 }}>

          <motion.div initial="hidden" animate="show" variants={stagger} className="hero-text-container" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <motion.div variants={fadeUp} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 999, padding: "8px 18px", marginBottom: 24 }}>
              <Sparkles size={14} color="white" />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.9)" }}>🇬🇭 Built for Ghana</span>
            </motion.div>

            <motion.h1 variants={fadeUp} style={{ fontSize: "clamp(34px, 5vw, 60px)", fontWeight: 800, lineHeight: 1.1, color: "white", margin: "0 0 20px 0", letterSpacing: "-0.02em" }}>
              The Smart School<br />
              <span style={{ background: "linear-gradient(90deg, #93C5FD, #67E8F9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Management Platform
              </span><br />
              for Ghana
            </motion.h1>

            <motion.p variants={fadeUp} style={{ fontSize: "clamp(16px, 2vw, 18px)", lineHeight: 1.7, color: "rgba(255,255,255,0.8)", margin: "0 0 36px 0", maxWidth: 520 }}>
              Attendance, assessments, fees, reports, and teacher tools — all in one premium platform built for real Ghanaian school teams.
            </motion.p>

            <motion.div variants={fadeUp} className="hero-buttons" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Link to="/get-started" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 999, background: "white", color: "#0B4A82", fontWeight: 700, fontSize: 15, textDecoration: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", transition: "all 0.2s" }}>
                Start Free Trial <ArrowRight size={16} />
              </Link>
              <Link to="/book-demo" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 999, background: "rgba(255,255,255,0.12)", color: "white", fontWeight: 700, fontSize: 15, textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.25)", backdropFilter: "blur(8px)", transition: "all 0.2s" }}>
                Book a Demo
              </Link>
            </motion.div>

            <motion.div variants={fadeUp} className="hero-badges" style={{ display: "flex", gap: 24, marginTop: 40, flexWrap: "wrap" }}>
              {[["✅ No credit card needed", ""], ["⚡ Setup in under 5 minutes", ""], ["🏫 Built for Ghanaian schools", ""]].map(([label]) => (
                <span key={label} style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{label}</span>
              ))}
            </motion.div>
          </motion.div>

          {/* 3D floating card */}
          <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="hero-card-container" style={{ perspective: 1200, display: "flex", justifyContent: "center" }}>
            <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} style={{ transform: "rotateX(8deg) rotateY(-10deg)", transformStyle: "preserve-3d", width: "100%", maxWidth: 460 }}>
              <div style={{ background: "rgba(255,255,255,0.96)", borderRadius: 28, padding: 28, boxShadow: "0 40px 100px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.15)", backdropFilter: "blur(20px)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <img src="/logo.png" alt="School Manager GH" style={{ height: 60, objectFit: "contain" }} />
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ShieldCheck size={22} color="#0B4A82" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  {[["Attendance", "98.2%", "#ECFDF5", "#16A34A"], ["Students", "524", "#EFF6FF", "#0B4A82"], ["Reports", "Ready ✓", "#FAF5FF", "#7C3AED"], ["Fees", "Active", "#FFFBEB", "#D97706"]].map(([label, val, bg, clr]) => (
                    <div key={label} style={{ background: bg, borderRadius: 14, padding: "12px 14px" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#94A3B8", margin: "0 0 6px 0" }}>{label}</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: clr, margin: 0 }}>{val}</p>
                    </div>
                  ))}
                </div>
                <div style={{ background: "linear-gradient(135deg, #0B4A82, #1160A8)", borderRadius: 16, padding: "16px 18px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", margin: "0 0 4px 0" }}>Today's Summary</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "white", margin: "0 0 4px 0" }}>Everything running smoothly</p>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: 0 }}>Attendance taken · 3 reports pending · 12 payments recorded</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── TRUSTED BY ── */}
      <section style={{ padding: "60px 0", background: "white", borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ textAlign: "center", marginBottom: 40 }}
          >
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#64748B", margin: 0 }}>
              Trusted by schools across Ghana
            </p>
          </motion.div>

          <div style={{ position: "relative", width: "100%", overflow: "hidden", padding: "20px 0" }}>
            {/* Fading Edges for that high-end look */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "100px", background: "linear-gradient(to right, #FFFFFF, transparent)", zIndex: 2, pointerEvents: "none" }} />
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "100px", background: "linear-gradient(to left, #FFFFFF, transparent)", zIndex: 2, pointerEvents: "none" }} />

            {partnerSchools.length > 0 ? (
              <motion.div
                animate={{ x: ["0%", "-50%"] }}
                transition={{
                  duration: 20,
                  ease: "linear",
                  repeat: Infinity
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 60,
                  width: "max-content",
                  padding: "0 30px"
                }}
              >
                {/* Double the list for seamless looping */}
                {[...partnerSchools, ...partnerSchools, ...partnerSchools].map((school, idx) => (
                  <div
                    key={`${school.id}-${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: "12px 20px",
                      background: "rgba(255, 255, 255, 0.7)",
                      backdropFilter: "blur(8px)",
                      borderRadius: "16px",
                      border: "1px solid rgba(241, 245, 249, 0.8)",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.03)",
                      transition: "all 0.3s ease",
                      cursor: "default"
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.06)";
                      e.currentTarget.style.borderColor = "#E2E8F0";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.03)";
                      e.currentTarget.style.borderColor = "rgba(241, 245, 249, 0.8)";
                    }}
                  >
                    <div style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <img
                        src={school.logoUrl}
                        alt={school.name}
                        style={{ width: "100%", height: "100%", objectFit: "contain", filter: "grayscale(100%)", opacity: 0.7, transition: "all 0.3s ease" }}
                        onMouseEnter={e => { e.currentTarget.style.filter = "grayscale(0%)"; e.currentTarget.style.opacity = "1"; }}
                        onMouseLeave={e => { e.currentTarget.style.filter = "grayscale(100%)"; e.currentTarget.style.opacity = "0.7"; }}
                      />
                    </div>
                    <span style={{ fontWeight: 600, color: "#475569", fontSize: 15, whiteSpace: "nowrap" }}>
                      {school.name}
                    </span>
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                style={{ textAlign: "center", color: "#94A3B8", fontSize: 14, fontStyle: "italic", padding: "20px 0" }}
              >
                Join growing schools across Ghana managing operations smarter.
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ── PHOTO + STATS ── */}
      <section className="stats-section" style={{ position: "relative", height: 280, overflow: "hidden", marginTop: "40px" }}>
        <img src="/img-school.png" alt="Schools across Ghana" loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(11,74,130,0.92) 0%, rgba(11,74,130,0.6) 50%, rgba(11,74,130,0.4) 100%)" }} />
        <div className="stats-container" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "0 48px", maxWidth: 1280, margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, x: -32 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 12px 0" }}>Real Impact</p>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 800, color: "white", margin: "0 0 20px 0", lineHeight: 1.2 }}>Real results for real schools</h2>
            <div className="stats-grid" style={{ display: "flex", gap: "clamp(24px, 5vw, 48px)", flexWrap: "wrap" }}>
              {[["500+", "Students managed"], ["50+", "Teachers onboarded"], ["24/7", "Platform uptime"]].map(([num, label]) => (
                <div key={label}>
                  <p style={{ fontSize: 36, fontWeight: 800, color: "white", margin: 0 }}>{num}</p>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", margin: 0 }}>{label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ padding: "64px 24px", background: "white" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger} className="features-header" style={{ textAlign: "center", marginBottom: 56 }}>
            <motion.p variants={fadeUp} style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0B4A82", margin: "0 0 12px 0" }}>Core Platform</motion.p>
            <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "#0f172a", margin: "0 0 16px 0" }}>Everything your school needs, connected</motion.h2>
            <motion.p variants={fadeUp} style={{ fontSize: 17, color: "#64748B", maxWidth: 540, margin: "0 auto" }}>Every module is built to reduce manual work and give your team clear, instant visibility.</motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <motion.div key={f.title} variants={fadeUp} whileHover={{ y: -6, boxShadow: "0 20px 60px rgba(11,74,130,0.12)" }} className="feature-card" style={{ background: "white", borderRadius: 24, border: "1.5px solid #E2E8F0", padding: 28, cursor: "default", transition: "box-shadow 0.3s" }}>
                  <div style={{ width: 52, height: 52, borderRadius: 16, background: f.color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <Icon size={24} color={f.accent} />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "0 0 10px 0" }}>{f.title}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: "#64748B", margin: 0 }}>{f.desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ── WHO ITS FOR ── */}
      <section style={{ padding: "80px 24px", background: "#F8FAFC" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 48, alignItems: "center" }}>
            <motion.div initial={{ opacity: 0, x: -32 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0B4A82", margin: "0 0 12px 0" }}>Designed for Impact</p>
              <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "#0f172a", margin: "0 0 24px 0", lineHeight: 1.2 }}>Built for every role in your school</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {roles.map((r) => {
                  const Icon = r.icon;
                  return (
                    <div key={r.title} style={{ display: "flex", gap: 16 }}>
                      <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
                        <Icon size={20} color={r.color} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", margin: "0 0 4px 0" }}>{r.title}</h4>
                        <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.5, margin: 0 }}>{r.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.7 }} style={{ position: "relative" }}>
              <div style={{ position: "absolute", inset: "-20px", background: "radial-gradient(circle, rgba(11,74,130,0.1) 0%, transparent 70%)", zIndex: 0 }} />
              <img src="/img-teacher.png" alt="Teacher using School Manager GH" style={{ width: "100%", borderRadius: 32, boxShadow: "0 32px 64px rgba(11,74,130,0.15)", position: "relative", zIndex: 1 }} />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── TEACHER CARD ── */}
      <section style={{ padding: "100px 24px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", position: "relative", borderRadius: "40px", overflow: "hidden", background: "linear-gradient(135deg, #F8FAFC 0%, #ffffff 100%)", boxShadow: "0 40px 100px rgba(11,74,130,0.08), 0 0 0 1px #F1F5F9" }}>
          <div style={{ position: "absolute", top: "-10%", left: "-10%", width: "40%", height: "60%", background: "radial-gradient(circle, rgba(11,74,130,0.05) 0%, transparent 70%)", filter: "blur(60px)", zIndex: 0 }} />
          <div style={{ position: "absolute", bottom: "-10%", right: "-10%", width: "40%", height: "60%", background: "radial-gradient(circle, rgba(147,197,253,0.1) 0%, transparent 70%)", filter: "blur(60px)", zIndex: 0 }} />

          <div className="teacher-card-inner" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", alignItems: "center", position: "relative", zIndex: 1 }}>
            <div className="teacher-card-content" style={{ padding: "60px 50px" }}>
              <div style={{ display: "inline-flex", padding: "8px 16px", borderRadius: "12px", background: "rgba(11,74,130,0.06)", color: "#0B4A82", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>
                For the Classroom
              </div>
              <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: "800", color: "#0f172a", lineHeight: "1.1", marginBottom: "24px" }}>
                Empowering teachers to <span style={{ color: "#0B4A82" }}>focus on teaching.</span>
              </h2>
              <p style={{ fontSize: "18px", color: "#475569", lineHeight: "1.7", marginBottom: "32px" }}>
                Automate the boring stuff. From digital attendance sheets to instant term reports, we give your teachers their time back.
              </p>
              <div style={{ display: "grid", gap: "16px" }}>
                {[
                  "One-tap attendance taking",
                  "Simplified assessment entry",
                  "Automated term-end report cards",
                  "Direct student performance insights"
                ].map(item => (
                  <div key={item} style={{ display: "flex", alignItems: "center", gap: "12px", color: "#1e293b", fontWeight: "600" }}>
                    <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <CheckCircle size={14} color="#10B981" />
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="teacher-card-img" style={{ height: "100%", minHeight: "500px", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
              <img src="public/img-teacher-2.PNG" alt="Happy Teacher" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "24px" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: "100px 24px", textAlign: "center", background: "white" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 800, color: "#0f172a", margin: "0 0 24px 0", lineHeight: 1.1 }}>Ready to modernize your school?</h2>
          <p style={{ fontSize: 19, color: "#64748B", margin: "0 0 40px 0", lineHeight: 1.6 }}>Join forward-thinking schools across Ghana and start your 14-day free trial today. No credit card required.</p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/get-started" style={{ padding: "16px 36px", borderRadius: 999, background: "#0B4A82", color: "white", fontWeight: 700, fontSize: 16, textDecoration: "none", boxShadow: "0 12px 32px rgba(11,74,130,0.25)" }}>Start Free Trial</Link>
            <Link to="/book-demo" style={{ padding: "16px 36px", borderRadius: 999, background: "white", color: "#0B4A82", fontWeight: 700, fontSize: 16, textDecoration: "none", border: "2px solid #E2E8F0" }}>Schedule a Demo</Link>
          </div>
        </div>
      </section>

    </PublicSiteLayout>
  );
};

export default MarketingHome;
