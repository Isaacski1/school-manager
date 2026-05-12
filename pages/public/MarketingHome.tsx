import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, BarChart3, BookOpen, CalendarDays, CheckCircle, CreditCard, GraduationCap, ShieldCheck, Smartphone, Sparkles, Users, Heart, ChevronDown, Star, Quote, MessageCircle, Bell, Wallet } from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";
import { db } from "../../services/mockDb";

const fadeUp = { hidden: { opacity: 0, y: 32 }, show: { opacity: 1, y: 0, transition: { duration: 0.6 } } };
const stagger = { show: { transition: { staggerChildren: 0.12 } } };

const features = [
  { icon: CalendarDays, title: "Attendance Tracking", desc: "Daily student & teacher attendance with instant visibility and missed-record alerts.", color: "rgba(147, 197, 253, 0.15)", accent: "#93C5FD", badge: null },
  { icon: BookOpen, title: "Assessments & Reports", desc: "Record tests, homework, exams and generate professional report-ready data.", color: "rgba(147, 197, 253, 0.15)", accent: "#93C5FD", badge: null },
  { icon: CreditCard, title: "Fees & Payments", desc: "Manage school finances, track payment activity and plan billing from one screen.", color: "rgba(147, 197, 253, 0.15)", accent: "#93C5FD", badge: null },
  { icon: Users, title: "Staff & Student Records", desc: "Centralise classes, teachers and students so your school runs from one workspace.", color: "rgba(147, 197, 253, 0.15)", accent: "#93C5FD", badge: null },
  { icon: Smartphone, title: "Parent Dashboard", desc: "Real-time access for parents to track attendance, grades, and pay fees from any device.", color: "rgba(147, 197, 253, 0.15)", accent: "#93C5FD", badge: null },
  { icon: MessageCircle, title: "WhatsApp Broadcast", desc: "Send instant bulk messages to all parents via WhatsApp directly from the admin dashboard — no extra app needed.", color: "rgba(147, 197, 253, 0.15)", accent: "#93C5FD", badge: "Standard" },
  { icon: Wallet, title: "Online Fee Payments", desc: "Parents pay fees securely via Paystack — Mobile Money or card — directly from the parent portal with auto-generated PDF invoices.", color: "rgba(147, 197, 253, 0.15)", accent: "#93C5FD", badge: "Standard" },
  { icon: Bell, title: "Admin Payment Alerts", desc: "Get an instant WhatsApp notification whenever a parent completes a payment, including amount, student details, and a PDF receipt.", color: "rgba(147, 197, 253, 0.15)", accent: "#93C5FD", badge: "Standard" },
];

const roles = [
  { title: "School Admins", icon: ShieldCheck, desc: "Control students, teachers, reports, attendance, fees and settings from one dashboard.", color: "#0B4A82" },
  { title: "Teachers", icon: GraduationCap, desc: "Take attendance, enter assessments, review performance and maintain remarks quickly.", color: "#1160A8" },
  { title: "Parents", icon: Heart, desc: "Monitor child's progress, view report cards, and receive instant updates on school activities.", color: "#0D599A" },
  { title: "Platform Owners", icon: BarChart3, desc: "Oversee all schools, plans, payments and platform activity from the Super Admin layer.", color: "#1E40AF" },
];

const steps = [
  "Visit the marketing site & choose a plan",
  "Fill in your school details and create an admin account",
  "Platform provisions your workspace automatically",
  "Log in and start managing your school immediately",
];

const faqs = [
  {
    q: "What is School Manager GH?",
    a: "School Manager GH is a premium, all-in-one school management platform designed specifically for the Ghanaian educational landscape. It streamlines attendance, assessments, fee management, and parent communication in one secure workspace."
  },
  {
    q: "Is our school data secure?",
    a: "Absolutely. We use industry-standard encryption and secure cloud infrastructure to ensure your data is protected 24/7. We also provide automated daily backups so you never lose important records."
  },
  {
    q: "Can parents really track their children's performance?",
    a: "Yes! Parents get a dedicated dashboard where they can see real-time attendance, view digital report cards, check assessment results, and even receive school announcements directly on their devices."
  },
  {
    q: "Does it support different grading systems?",
    a: "We built the platform to be flexible. Whether you follow the standard GES grading system or an international curriculum, you can customize grading scales and report card templates to match your school's needs."
  },
  {
    q: "How do I get started?",
    a: "Starting is easy! Just click 'Register Your School', choose a plan, and fill in your details. Your school's workspace will be provisioned automatically, and you can start using it immediately."
  }
];

const reviews = [
  {
    name: "Dr. Kwesi Appiah",
    role: "Proprietor, Alpha Preparatory",
    content: "School Manager GH has completely transformed how we handle attendance and reports. The automation saves us hours of manual work every week.",
    rating: 5,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Kwesi"
  },
  {
    name: "Sarah Mensah",
    role: "Administrator, Beacon International",
    content: "The fees and payments module is a game changer. Our fee collection has improved by 40% since we started using the parent portal for payments.",
    rating: 5,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah"
  },
  {
    name: "Ebenezer Tetteh",
    role: "Senior Teacher, Delta Schools",
    content: "As a teacher, I love how quickly I can enter assessments. The automated report cards are professional and save me so much stress at the end of term.",
    rating: 5,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Ebenezer"
  }
];

const MarketingHome = () => {
  const [partnerSchools, setPartnerSchools] = useState<any[]>([
    { id: "f1", name: "Alpha Preparatory", logoUrl: "https://api.dicebear.com/7.x/initials/svg?seed=AP&backgroundColor=0B4A82" },
    { id: "f2", name: "Beacon International", logoUrl: "https://api.dicebear.com/7.x/initials/svg?seed=BI&backgroundColor=1160A8" },
    { id: "f3", name: "Crystal Academy", logoUrl: "https://api.dicebear.com/7.x/initials/svg?seed=CA&backgroundColor=1E40AF" },
    { id: "f4", name: "Delta Schools", logoUrl: "https://api.dicebear.com/7.x/initials/svg?seed=DS&backgroundColor=2563EB" },
    { id: "f5", name: "Elite Scholars", logoUrl: "https://api.dicebear.com/7.x/initials/svg?seed=ES&backgroundColor=3B82F6" }
  ]);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [showPopup, setShowPopup] = useState(false);
  const popupShown = React.useRef(false);

  useEffect(() => {
    // Exit-intent: trigger when mouse moves near the top of the page
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 20 && !popupShown.current) {
        popupShown.current = true;
        setShowPopup(true);
      }
    };
    // Also show after 45 seconds as a fallback
    const timer = setTimeout(() => {
      if (!popupShown.current) {
        popupShown.current = true;
        setShowPopup(true);
      }
    }, 45000);
    document.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const loadSchools = async () => {
      try {
        const data = await db.getPublicSchools();
        if (data && data.length > 0) {
          setPartnerSchools(data);
        }
      } catch (err) {
        console.error("Failed to load partner schools", err);
      }
    };
    loadSchools();
  }, []);

  return (
    <PublicSiteLayout>
      {/* ── EXIT-INTENT POPUP ── */}
      <AnimatePresence>
        {showPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(6px)",
              zIndex: 9999,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 24
            }}
            onClick={(e) => e.target === e.currentTarget && setShowPopup(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 40 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              style={{
                background: "white",
                borderRadius: 28,
                overflow: "hidden",
                maxWidth: 780,
                width: "100%",
                display: "grid",
                gridTemplateColumns: "5fr 7fr",
                boxShadow: "0 40px 100px rgba(0,0,0,0.5)",
                position: "relative"
              }}
              className="popup-grid"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowPopup(false)}
                style={{
                  position: "absolute", top: 16, right: 16,
                  width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(0,0,0,0.08)", border: "none",
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", zIndex: 10, fontSize: 18,
                  color: "#555", fontWeight: 700
                }}
                aria-label="Close popup"
              >
                ×
              </button>

              {/* Left: Image */}
              <div style={{
                background: "linear-gradient(160deg, #f0f4ff 0%, #dce8ff 100%)",
                display: "flex", alignItems: "flex-end", justifyContent: "center",
                minHeight: 420, overflow: "hidden"
              }}>
                <img
                  src="/about-photo.png"
                  alt="School Manager GH offer"
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
                />
              </div>

              {/* Right: Content */}
              <div style={{ padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <h2 style={{ fontSize: 26, fontWeight: 800, color: "#CC0000", margin: "0 0 12px 0", lineHeight: 1.3 }}>
                  Wait! — Don't Miss This!<br />
                  <span style={{ color: "#CC0000" }}>Start Free Today!</span>
                </h2>
                <p style={{ fontSize: 15, color: "#555", margin: "0 0 8px 0" }}>
                  You're about to leave... but before you go —
                </p>
                <p style={{ fontSize: 17, fontWeight: 800, color: "#111", margin: "0 0 24px 0" }}>
                  School Manager GH is Free to try — Yes, FREE!
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
                  {[
                    "Real-time attendance & grade tracking",
                    "Parent portal for instant school updates",
                    "Digital report cards & fee management"
                  ].map((item) => (
                    <div key={item} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <CheckCircle size={14} color="#0B4A82" strokeWidth={2.5} />
                      </div>
                      <span style={{ fontSize: 15, color: "#333" }}>{item}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Link
                    to="/get-started"
                    onClick={() => setShowPopup(false)}
                    style={{
                      padding: "16px 24px", borderRadius: 999,
                      background: "linear-gradient(135deg, #0B4A82, #1E40AF)",
                      color: "white", fontWeight: 700, textDecoration: "none",
                      textAlign: "center", fontSize: 16,
                      boxShadow: "0 8px 24px rgba(11,74,130,0.3)"
                    }}
                  >
                    Start Your Free Trial
                  </Link>
                  <button
                    onClick={() => setShowPopup(false)}
                    style={{
                      padding: "14px 24px", borderRadius: 999,
                      background: "transparent", border: "1.5px solid #ddd",
                      color: "#888", fontWeight: 600, cursor: "pointer", fontSize: 14
                    }}
                  >
                    No thanks, I'll pass
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width: 640px) {
          .popup-grid { grid-template-columns: 1fr !important; }
          .popup-grid > div:first-child { display: none !important; }
        }
        html, body { max-width: 100%; overflow-x: hidden; }
        @media (max-width: 1024px) { section { padding: 80px 24px !important; } }
        @media (max-width: 968px) {
          .hero-grid { grid-template-columns: 1fr !important; text-align: center; gap: 40px !important; }
          .hero-text-container { align-items: center !important; max-width: 100% !important; }
          .hero-card-container { display: none !important; }
          .hero-badges { justify-content: center !important; }
          .hero-buttons { justify-content: center !important; }
        }
        @media (max-width: 480px) {
          .hero-buttons { flex-direction: column; width: 100%; }
          .hero-buttons a { width: 100%; justify-content: center; }
          h1 { font-size: 32px !important; }
        }
        @media (max-width: 768px) {
          .stats-section { height: auto !important; padding: 80px 32px !important; margin-top: 0 !important; }
          .stats-container { padding: 40px 32px !important; justify-content: center; text-align: center; position: relative !important; }
          .stats-grid { justify-content: center !important; gap: 40px !important; margin-top: 32px !important; }
        }
        @media (max-width: 850px) {
          .responsive-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
          .teacher-card-inner { grid-template-columns: 1fr !important; }
          .teacher-card-img { min-height: 300px !important; order: -1; padding: 0 !important; }
          .teacher-card-content { padding: 40px 24px !important; }
        }
        @media (max-width: 640px) {
          .features-header { text-align: center !important; }
          .feature-card { padding: 24px !important; }
        }
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-wrapper {
          display: flex;
          width: fit-content;
          animation: ticker 40s linear infinite;
        }
        .ticker-wrapper:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* ── HERO ── */}
      <section style={{ minHeight: "85vh", display: "flex", alignItems: "center", padding: "120px 24px 80px", position: "relative", overflow: "hidden" }}>
        <img src="/img-students.png" alt="" aria-hidden="true" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%", zIndex: 0 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(4,18,34,0.9) 0%, rgba(11,74,130,0.7) 100%)", zIndex: 1 }} />

        <div className="hero-grid" style={{ maxWidth: 1280, margin: "0 auto", width: "100%", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 64, alignItems: "center", position: "relative", zIndex: 2 }}>
          <motion.div initial="hidden" animate="show" variants={stagger} className="hero-text-container" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <motion.div variants={fadeUp} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 999, padding: "8px 18px", marginBottom: 24 }}>
              <Sparkles size={14} color="white" />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "white" }}>🇬🇭 Built for Ghana</span>
            </motion.div>

            <motion.h1 variants={fadeUp} style={{ fontSize: "clamp(34px, 5vw, 60px)", fontWeight: 800, lineHeight: 1.1, color: "white", margin: "0 0 20px 0" }}>
              The #1 School<br />
              <span style={{ background: "linear-gradient(90deg, #93C5FD, #67E8F9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Management System
              </span><br />
              in Ghana
            </motion.h1>

            <motion.p variants={fadeUp} style={{ fontSize: "clamp(16px, 2vw, 18px)", lineHeight: 1.7, color: "rgba(255,255,255,0.8)", margin: "0 0 36px 0", maxWidth: 520 }}>
              The most affordable and comprehensive school management system in Ghana. Manage attendance, assessments, fees, and parent communication in one premium platform built for real Ghanaian school teams.
            </motion.p>

            <motion.div variants={fadeUp} className="hero-buttons" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Link to="/get-started" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 999, background: "white", color: "#0B4A82", fontWeight: 700, textDecoration: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
                Register Your School <ArrowRight size={16} />
              </Link>
              <Link to="/book-demo" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 999, background: "rgba(255,255,255,0.1)", color: "white", fontWeight: 700, textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.2)", backdropFilter: "blur(8px)" }}>
                Book a Demo
              </Link>
            </motion.div>
          </motion.div>

          <motion.div className="hero-card-container" style={{ perspective: 1200 }}>
            <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} style={{ transform: "rotateX(8deg) rotateY(-10deg) translateZ(0)", transformStyle: "preserve-3d", width: "100%", maxWidth: 460, willChange: "transform" }}>
              <div style={{ background: "rgba(255,255,255,0.96)", borderRadius: 28, padding: 28, boxShadow: "0 40px 100px rgba(0,0,0,0.35)", backdropFilter: "blur(20px)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <img src="/logo.png" alt="Logo" style={{ height: 60 }} />
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ShieldCheck size={22} color="#0B4A82" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  {[["Attendance", "98.2%", "#ECFDF5", "#16A34A"], ["Students", "524", "#EFF6FF", "#0B4A82"], ["Reports", "Ready", "#FAF5FF", "#7C3AED"], ["Fees", "Active", "#FFFBEB", "#D97706"]].map(([label, val, bg, clr]) => (
                    <div key={label} style={{ background: bg, borderRadius: 14, padding: "12px 14px" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", margin: 0 }}>{label}</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: clr, margin: 0 }}>{val}</p>
                    </div>
                  ))}
                </div>
                <div style={{ background: "linear-gradient(135deg, #0B4A82, #1160A8)", borderRadius: 16, padding: "16px 18px" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", margin: "0 0 4px 0" }}>Today's Summary</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "white", margin: 0 }}>Everything running smoothly</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── TRUSTED BY ── */}
      <section style={{ padding: "60px 0", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", margin: 0 }}>Trusted by schools across Ghana</p>
          </div>
          <div style={{ overflow: "hidden", position: "relative" }}>
            <div className="ticker-wrapper" style={{ gap: 60, opacity: 0.6 }}>
              {/* First set of logos */}
              {partnerSchools.map((school) => (
                <div key={`${school.id}-1`} style={{ display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
                  <img src={school.logoUrl} alt={school.name} style={{ height: 32 }} />
                  <span style={{ fontWeight: 600, color: "white", fontSize: 14 }}>{school.name}</span>
                </div>
              ))}
              {/* Duplicated set of logos for seamless loop */}
              {partnerSchools.map((school) => (
                <div key={`${school.id}-2`} style={{ display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
                  <img src={school.logoUrl} alt={school.name} style={{ height: 32 }} />
                  <span style={{ fontWeight: 600, color: "white", fontSize: 14 }}>{school.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ABOUT SCHOOL MANAGER GH ── */}
      <section style={{ padding: "100px 24px", background: "linear-gradient(180deg, rgba(4,18,34,0) 0%, rgba(11,74,130,0.1) 50%, rgba(4,18,34,0) 100%)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}>
              <motion.div variants={fadeUp} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(147, 197, 253, 0.1)", border: "1px solid rgba(147, 197, 253, 0.2)", borderRadius: 999, padding: "8px 16px", marginBottom: 24 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#93C5FD", textTransform: "uppercase", letterSpacing: "0.05em" }}>Our Story</span>
              </motion.div>
              <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, color: "white", marginBottom: 24, lineHeight: 1.2 }}>
                Empowering the next generation of <span style={{ color: "#93C5FD" }}>Ghanaian education.</span>
              </motion.h2>
              <motion.p variants={fadeUp} style={{ fontSize: 18, lineHeight: 1.8, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>
                School Manager GH was founded with a single mission: to provide Ghanaian schools with world-class digital tools that are tailored to our local context. We believe that every school, regardless of size, deserves access to technology that simplifies administration and enhances learning.
              </motion.p>
              <motion.div variants={fadeUp} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(147, 197, 253, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <ShieldCheck size={24} color="#93C5FD" />
                  </div>
                  <div>
                    <h4 style={{ fontSize: 16, fontWeight: 700, color: "white", marginBottom: 4 }}>Secure & Reliable</h4>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: 0 }}>Built on industry-leading cloud infrastructure.</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(147, 197, 253, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Sparkles size={24} color="#93C5FD" />
                  </div>
                  <div>
                    <h4 style={{ fontSize: 16, fontWeight: 700, color: "white", marginBottom: 4 }}>Built for Ghana</h4>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: 0 }}>Aligned with local curriculum and reporting standards.</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              whileInView={{ opacity: 1, scale: 1 }} 
              viewport={{ once: true }} 
              transition={{ duration: 0.8 }}
              style={{ position: "relative" }}
            >
              <div style={{ position: "absolute", inset: "-20px", background: "radial-gradient(circle, rgba(147, 197, 253, 0.15) 0%, transparent 70%)", zIndex: 0 }} />
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 32, border: "1px solid rgba(255,255,255,0.1)", padding: 12, position: "relative", zIndex: 1, backdropFilter: "blur(20px)" }}>
                <img 
                  src="/about-photo.png" 
                  alt="Ghanaian students learning with School Manager GH" 
                  style={{ width: "100%", height: "auto", borderRadius: 24, boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }} 
                />
                <div style={{ position: "absolute", bottom: 40, left: -40, background: "white", borderRadius: 20, padding: "20px 24px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Users size={24} color="#0B4A82" />
                  </div>
                  <div>
                    <p style={{ fontSize: 24, fontWeight: 800, color: "#0B4A82", margin: 0 }}>500+</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#64748B", margin: 0 }}>Schools Impacted</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section style={{ padding: "64px 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="features-header" style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#93C5FD", margin: "0 0 12px 0" }}>Core Platform</p>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "white", margin: "0 0 12px 0" }}>Everything your school needs</h2>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", margin: 0 }}>From core management to advanced communications — all in one place.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="feature-card" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 24, border: "1.5px solid rgba(255,255,255,0.1)", padding: 28, backdropFilter: "blur(10px)", position: "relative" }}>
                  {f.badge && (
                    <div style={{ position: "absolute", top: 16, right: 16, background: "rgba(147,197,253,0.15)", border: "1px solid rgba(147,197,253,0.3)", borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: "#93C5FD", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {f.badge}
                    </div>
                  )}
                  <div style={{ width: 52, height: 52, borderRadius: 16, background: f.color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <Icon size={24} color={f.accent} />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: "white", margin: "0 0 10px 0" }}>{f.title}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,0.7)", margin: 0 }}>{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ padding: "100px 24px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", borderRadius: "40px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(20px)", overflow: "hidden" }}>
          <div className="teacher-card-inner" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
            <div className="teacher-card-content" style={{ padding: "60px 50px" }}>
              <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, color: "white", marginBottom: 24 }}>Empowering teachers to <span style={{ color: "#93C5FD" }}>focus on teaching.</span></h2>
              <p style={{ fontSize: 18, color: "rgba(255,255,255,0.8)", marginBottom: 32 }}>Automate the boring stuff. From digital attendance to term reports.</p>
              <Link to="/get-started" style={{ display: "inline-flex", padding: "14px 28px", borderRadius: 999, background: "#0B4A82", color: "white", fontWeight: 700, textDecoration: "none" }}>Get Started</Link>
            </div>
            <div className="teacher-card-img" style={{ minHeight: 400 }}>
              <img src="/img-teacher-2.PNG" alt="Teacher" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: "100px 24px", background: "linear-gradient(180deg, rgba(4,18,34,0) 0%, rgba(11,74,130,0.05) 100%)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#93C5FD", margin: "0 0 12px 0" }}>Testimonials</p>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "white", margin: 0 }}>Trusted by educators</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 32 }}>
            {reviews.map((r, idx) => (
              <motion.div 
                key={idx}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                variants={fadeUp}
                style={{ 
                  background: "rgba(255,255,255,0.03)", 
                  borderRadius: 32, 
                  padding: 40, 
                  border: "1px solid rgba(255,255,255,0.1)",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <div style={{ position: "absolute", top: 32, right: 40, opacity: 0.1 }}>
                  <Quote size={48} color="white" />
                </div>
                
                <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
                  {[...Array(r.rating)].map((_, i) => (
                    <Star key={i} size={16} fill="#FACC15" color="#FACC15" />
                  ))}
                </div>

                <p style={{ fontSize: 18, lineHeight: 1.8, color: "rgba(255,255,255,0.8)", marginBottom: 32, flexGrow: 1 }}>
                  "{r.content}"
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <img 
                    src={r.avatar} 
                    alt={r.name} 
                    style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.1)" }} 
                  />
                  <div>
                    <h4 style={{ fontSize: 17, fontWeight: 700, color: "white", margin: "0 0 4px 0" }}>{r.name}</h4>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: 0 }}>{r.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "100px 24px", background: "transparent" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#93C5FD", margin: "0 0 12px 0" }}>FAQs</p>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "white", margin: 0 }}>Common Questions</h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {faqs.map((faq, idx) => (
              <div 
                key={idx} 
                style={{ 
                  background: "rgba(255,255,255,0.03)", 
                  borderRadius: 20, 
                  border: "1px solid rgba(255,255,255,0.1)", 
                  overflow: "hidden",
                  transition: "all 0.3s ease"
                }}
              >
                <button 
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  style={{ 
                    width: "100%", 
                    padding: "24px 28px", 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between", 
                    background: "transparent", 
                    border: "none", 
                    cursor: "pointer",
                    textAlign: "left"
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 700, color: "white" }}>{faq.q}</span>
                  <motion.div animate={{ rotate: activeFaq === idx ? 180 : 0 }}>
                    <ChevronDown size={20} color="rgba(255,255,255,0.5)" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {activeFaq === idx && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div style={{ padding: "0 28px 24px", fontSize: 16, lineHeight: 1.7, color: "rgba(255,255,255,0.6)" }}>
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "100px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 800, color: "white", marginBottom: 24 }}>Ready to modernize your school?</h2>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <Link to="/get-started" style={{ padding: "16px 36px", borderRadius: 999, background: "#0B4A82", color: "white", fontWeight: 700, textDecoration: "none" }}>Register Your School</Link>
          <Link to="/book-demo" style={{ padding: "16px 36px", borderRadius: 999, background: "rgba(255,255,255,0.05)", color: "white", fontWeight: 700, textDecoration: "none", border: "1px solid rgba(255,255,255,0.2)" }}>Schedule a Demo</Link>
        </div>
      </section>
    </PublicSiteLayout>
  );
};

export default MarketingHome;
