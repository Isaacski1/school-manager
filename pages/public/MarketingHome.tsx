import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, BarChart3, BookOpen, CalendarDays, CheckCircle, CreditCard, GraduationCap, ShieldCheck, Smartphone, Sparkles, Users, Heart, ChevronDown, MessageCircle, Bell, Wallet, X } from "lucide-react";
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

const showcaseScreens = [
  {
    title: "Admin dashboard",
    description: "Track attendance, staff activity, payments, and school operations from one command center.",
    accent: "#38BDF8",
    image: "/product-preview/optimized/admin-dashboard-1200.jpg",
    imageSmall: "/product-preview/optimized/admin-dashboard-760.jpg",
  },
  {
    title: "Parent dashboard",
    description: "Give parents a clear view of attendance, results, fees, and school updates from their phone.",
    accent: "#22C55E",
    image: "/product-preview/optimized/parent-dashboard-1200.jpg",
    imageSmall: "/product-preview/optimized/parent-dashboard-760.jpg",
  },
  {
    title: "Fee payment page",
    description: "Record fee payments, monitor balances, and keep finance work organized by term.",
    accent: "#F59E0B",
    image: "/product-preview/optimized/fees-payment-dashboard-1200.jpg",
    imageSmall: "/product-preview/optimized/fees-payment-dashboard-760.jpg",
  },
  {
    title: "Report card page",
    description: "Generate professional report cards with grades, remarks, skills, and term summaries.",
    accent: "#A78BFA",
    image: "/product-preview/optimized/report-card-dashboard-1200.jpg",
    imageSmall: "/product-preview/optimized/report-card-dashboard-760.jpg",
  },
  {
    title: "Attendance page",
    description: "Capture daily student and teacher attendance with quick visibility into missing records.",
    accent: "#06B6D4",
    image: "/product-preview/optimized/attendance-dashboard-1200.jpg",
    imageSmall: "/product-preview/optimized/attendance-dashboard-760.jpg",
  },
];

const trustMetrics = [
  { label: "Students Managed", value: 1280, suffix: "+" },
  { label: "Fee Transactions", value: 4200, suffix: "+" },
  { label: "Reports Generated", value: 3100, suffix: "+" },
  { label: "Parent Notifications Sent", value: 9600, suffix: "+" },
];

const operationalTrustCards = [
  {
    icon: BookOpen,
    title: "Faster report generation",
    desc: "Turn assessments, remarks, skills, and term records into ready-to-share reports with less manual formatting.",
  },
  {
    icon: Wallet,
    title: "Transparent fee tracking",
    desc: "Track paid, partial, and outstanding balances by learner, class, term, and payment channel.",
  },
  {
    icon: Bell,
    title: "Instant WhatsApp alerts",
    desc: "Notify admins and parents quickly when payments, announcements, or school updates need attention.",
  },
  {
    icon: MessageCircle,
    title: "Easier parent communication",
    desc: "Give parents a cleaner way to follow attendance, fees, report cards, and school notices from their phones.",
  },
];

const ghanaComparisonCards = [
  "WhatsApp payment alerts",
  "Ghana-friendly fee tracking",
  "Report cards for KG to JHS",
  "Parent portal access",
  "Mobile money compatibility",
];

const primaryCtaStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "16px 34px",
  borderRadius: 999,
  background: "linear-gradient(135deg, #22D3EE 0%, #38BDF8 38%, #2563EB 100%)",
  color: "white",
  fontWeight: 800,
  fontSize: 16,
  textDecoration: "none",
  boxShadow: "0 18px 42px rgba(56,189,248,0.34)",
  border: "1px solid rgba(255,255,255,0.22)",
  transition: "transform 180ms ease, box-shadow 180ms ease, filter 180ms ease",
};

const secondaryCtaStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "15px 30px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.1)",
  color: "white",
  fontWeight: 750,
  fontSize: 15,
  textDecoration: "none",
  border: "1.5px solid rgba(255,255,255,0.22)",
  backdropFilter: "blur(10px)",
  transition: "transform 180ms ease, background 180ms ease, border-color 180ms ease",
};

const AnimatedCounter: React.FC<{ value: number; suffix?: string }> = ({
  value,
  suffix = "",
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const counterRef = React.useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const node = counterRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    let frameId = 0;
    const duration = 800;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isVisible, value]);

  return (
    <span ref={counterRef}>
      {displayValue.toLocaleString()}
      {suffix}
    </span>
  );
};

const getSchoolInitials = (name: string) =>
  String(name || "SM")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SM";

const SchoolLogoMark: React.FC<{ school: any }> = ({ school }) => {
  if (school.logoUrl) {
    return (
      <img
        src={school.logoUrl}
        alt={school.name}
        loading="lazy"
        decoding="async"
        style={{ height: 32, maxWidth: 120, objectFit: "contain" }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #38BDF8, #2563EB)",
        color: "white",
        fontSize: 11,
        fontWeight: 800,
        boxShadow: "0 10px 24px rgba(37,99,235,0.24)",
      }}
    >
      {getSchoolInitials(school.name)}
    </div>
  );
};

const MarketingHome = () => {
  const [partnerSchools, setPartnerSchools] = useState<any[]>([
    { id: "f1", name: "Alpha Preparatory" },
    { id: "f2", name: "Beacon International" },
    { id: "f3", name: "Crystal Academy" },
    { id: "f4", name: "Delta Schools" },
    { id: "f5", name: "Elite Scholars" }
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
    let cancelled = false;
    const loadSchools = async () => {
      try {
        const data = await db.getPublicSchools();
        if (!cancelled && data && data.length > 0) {
          setPartnerSchools(data);
        }
      } catch (err) {
        console.error("Failed to load partner schools", err);
      }
    };

    const runWhenIdle = () => {
      const browserWindow = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };

      if (browserWindow.requestIdleCallback) {
        const idleId = browserWindow.requestIdleCallback(loadSchools, {
          timeout: 2500,
        });
        return () => browserWindow.cancelIdleCallback?.(idleId);
      }

      const timer = globalThis.setTimeout(loadSchools, 900);
      return () => globalThis.clearTimeout(timer);
    };

    const cleanupIdle = runWhenIdle();
    return () => {
      cancelled = true;
      cleanupIdle?.();
    };
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
                  width: 40, height: 40, borderRadius: "50%",
                  background: "white", 
                  border: "1px solid rgba(0,0,0,0.1)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", zIndex: 100, fontSize: 24,
                  color: "#111", fontWeight: 400,
                  transition: "all 0.2s"
                }}
                className="popup-close-button"
                aria-label="Close popup"
              >
                <X size={20} />
              </button>

              {/* Left: Image */}
              <div className="popup-image-container" style={{
                background: "linear-gradient(160deg, #f0f4ff 0%, #dce8ff 100%)",
                display: "flex", alignItems: "flex-end", justifyContent: "center",
                minHeight: 420, overflow: "hidden"
              }}>
                <img
                  src="/about-photo.png"
                  alt="School Manager GH offer"
                  loading="lazy"
                  decoding="async"
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
                />
              </div>

              {/* Right: Content */}
              <div className="popup-content-container" style={{ padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
                    to="/book-demo"
                    onClick={() => setShowPopup(false)}
                    className="primary-cta"
                    style={{
                      ...primaryCtaStyle,
                      width: "100%",
                      textAlign: "center",
                    }}
                  >
                    Book Free Demo
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
          .popup-grid { grid-template-columns: 1fr !important; max-width: 90vw !important; max-height: 85vh !important; overflow-y: auto !important; }
          .popup-image-container { min-height: 200px !important; height: 200px !important; }
          .popup-content-container { padding: 24px 20px !important; }
          .popup-content-container h2 { font-size: 20px !important; }
          .popup-content-container p { font-size: 14px !important; }
          .popup-content-container div { margin-bottom: 20px !important; }
        }
        html, body { max-width: 100%; overflow-x: hidden; }
        @media (max-width: 1024px) { section { padding: 80px 24px !important; } }
        @media (max-width: 968px) {
          .hero-grid { grid-template-columns: 1fr !important; text-align: center; gap: 40px !important; }
          .hero-text-container { align-items: center !important; max-width: 100% !important; }
          .hero-card-container { width: 100% !important; }
          .hero-badges { justify-content: center !important; }
          .hero-buttons { justify-content: center !important; }
        }
        @media (max-width: 768px) {
          section { padding: 80px 16px 60px !important; }
          .hero-card-container { max-width: 100% !important; }
        }
        @media (max-width: 480px) {
          .hero-buttons { flex-direction: column; width: 100%; }
          .hero-buttons a { width: 100%; justify-content: center; }
          h1 { font-size: 32px !important; }
          section { padding: 60px 12px 40px !important; }
        }
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
          .teacher-card-content { padding: 32px 20px !important; text-align: center; }
          .teacher-card-content h2 { margin-bottom: 16px !important; }
          .teacher-card-content p { font-size: 16px !important; margin-bottom: 24px !important; }
        }
        @media (max-width: 640px) {
          .features-header { text-align: center !important; }
          .feature-card { padding: 24px !important; }
          .showcase-section { padding: 72px 16px !important; }
          .showcase-grid { grid-template-columns: 1fr !important; gap: 22px !important; }
          .showcase-card { padding: 12px !important; border-radius: 22px !important; }
          .showcase-preview { aspect-ratio: 2.08 / 1 !important; min-height: 0 !important; }
          .showcase-header { margin-bottom: 36px !important; }
          .about-stats-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .impact-badge { left: auto !important; right: 12px !important; bottom: 12px !important; padding: 8px 12px !important; gap: 8px !important; border-radius: 12px !important; }
          .impact-badge div:first-child { width: 28px !important; height: 28px !important; }
          .impact-badge div:first-child svg { width: 16px !important; height: 16px !important; }
          .impact-badge p:first-of-type { font-size: 14px !important; }
          .impact-badge p:last-child { font-size: 10px !important; }
          .trust-card-grid, .ghana-comparison-grid, .trust-metrics-grid { grid-template-columns: 1fr !important; }
          .faq-button { padding: 18px 20px !important; }
          .faq-button span { font-size: 16px !important; }
          .faq-answer { padding: 0 20px 18px !important; font-size: 14px !important; }
          .final-cta-section { padding: 80px 24px !important; }
          .final-cta-section h2 { font-size: 28px !important; }
          .final-cta-buttons { flex-direction: column !important; width: 100% !important; max-width: 300px !important; margin: 0 auto !important; gap: 12px !important; }
          .final-cta-buttons a { width: 100% !important; text-align: center !important; }
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
        .showcase-card {
          transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease, background 220ms ease;
        }
        .showcase-card:hover {
          transform: translateY(-8px);
          border-color: rgba(147,197,253,0.45) !important;
          background: rgba(255,255,255,0.08) !important;
          box-shadow: 0 26px 70px rgba(0,0,0,0.28);
        }
        .showcase-card:hover .showcase-preview {
          transform: translateY(-3px) scale(1.012);
        }
        .showcase-preview {
          transition: transform 220ms ease;
        }
        .primary-cta:hover {
          transform: translateY(-3px) scale(1.025);
          filter: brightness(1.08);
          box-shadow: 0 24px 54px rgba(56,189,248,0.46) !important;
        }
        .secondary-cta:hover {
          transform: translateY(-2px);
          background: rgba(255,255,255,0.16) !important;
          border-color: rgba(255,255,255,0.34) !important;
        }
        .trust-card, .ghana-comparison-card, .trust-metric-card {
          transition: transform 220ms ease, border-color 220ms ease, background 220ms ease, box-shadow 220ms ease;
        }
        .trust-card:hover, .ghana-comparison-card:hover, .trust-metric-card:hover {
          transform: translateY(-6px);
          border-color: rgba(147,197,253,0.38) !important;
          background: rgba(255,255,255,0.075) !important;
          box-shadow: 0 22px 60px rgba(0,0,0,0.22);
        }
      `}</style>

      {/* ── HERO ── */}
      <section style={{ minHeight: "85vh", display: "flex", alignItems: "center", padding: "120px 24px 80px", position: "relative", overflow: "hidden" }}>
        <img src="/img-students.png" alt="" aria-hidden="true" fetchPriority="high" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%", zIndex: 0 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(4,18,34,0.9) 0%, rgba(11,74,130,0.7) 100%)", zIndex: 1 }} />

        <div className="hero-grid" style={{ maxWidth: 1440, margin: "0 auto", width: "100%", display: "grid", gridTemplateColumns: "1fr", gap: 60, alignItems: "flex-start", position: "relative", zIndex: 2 }}>
          <motion.div initial="hidden" animate="show" variants={stagger} className="hero-text-container" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <motion.div variants={fadeUp} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 999, padding: "8px 18px", marginBottom: 24 }}>
              <Sparkles size={14} color="white" />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "white" }}>🇬🇭 Built for Ghana</span>
            </motion.div>

            <motion.h1 variants={fadeUp} style={{ fontSize: "clamp(34px, 5vw, 60px)", fontWeight: 800, lineHeight: 1.1, color: "white", margin: "0 0 20px 0" }}>
              Automate report cards,<br />
              <span style={{ background: "linear-gradient(90deg, #93C5FD, #67E8F9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                fee tracking, and parent
              </span><br />
              communication in one platform.
            </motion.h1>

            <motion.p variants={fadeUp} style={{ fontSize: "clamp(16px, 2vw, 18px)", lineHeight: 1.7, color: "rgba(255,255,255,0.8)", margin: "0 0 36px 0", maxWidth: 700 }}>
              Reduce manual work for Ghanaian schools by bringing assessments, fee records, attendance, parent updates, and daily admin tasks into one organized workspace.
            </motion.p>

            <motion.div variants={fadeUp} className="hero-buttons" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Link to="/book-demo" className="primary-cta" style={primaryCtaStyle}>
                Book Free Demo <ArrowRight size={18} />
              </Link>
              <Link to="/get-started" className="secondary-cta" style={secondaryCtaStyle}>
                Register Your School
              </Link>
            </motion.div>
          </motion.div>

          <motion.div className="hero-card-container" style={{ perspective: 1200, width: "100%" }}>
            <motion.div animate={{ y: [0, -16, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} style={{ transform: "rotateX(8deg) rotateY(-6deg) rotateZ(1deg) translateZ(0)", transformStyle: "preserve-3d", width: "100%", willChange: "transform" }}>
              {/* Glow effect */}
              <div style={{ position: "absolute", inset: "-50px", background: "radial-gradient(circle, rgba(11,74,130,0.35) 0%, transparent 70%)", zIndex: 0, borderRadius: 40 }} />
              
              {/* Dashboard Image */}
              <img 
                src="/hero-img.png" 
                alt="School Manager GH Dashboard"
                loading="lazy"
                decoding="async"
                style={{ 
                  width: "100%", 
                  height: "auto", 
                  
                  position: "relative", 
                  zIndex: 1, 
                  display: "block"
                }} 
              />
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section style={{ padding: "34px 24px 28px", background: "rgba(255,255,255,0.025)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="trust-metrics-grid" style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {trustMetrics.map((metric) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="trust-metric-card"
              style={{
                borderRadius: 22,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.045)",
                backdropFilter: "blur(16px)",
                padding: "22px 18px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 850, color: "white", lineHeight: 1 }}>
                <AnimatedCounter value={metric.value} suffix={metric.suffix} />
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.54)" }}>
                {metric.label}
              </div>
            </motion.div>
          ))}
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
                  <SchoolLogoMark school={school} />
                  <span style={{ fontWeight: 600, color: "white", fontSize: 14 }}>{school.name}</span>
                </div>
              ))}
              {/* Duplicated set of logos for seamless loop */}
              {partnerSchools.map((school) => (
                <div key={`${school.id}-2`} style={{ display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
                  <SchoolLogoMark school={school} />
                  <span style={{ fontWeight: 600, color: "white", fontSize: 14 }}>{school.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ABOUT SCHOOL MANAGER GH ── */}
      <section style={{ padding: "100px 24px", background: "linear-gradient(180deg, rgba(4,18,34,0) 0%, rgba(11,74,130,0.1) 50%, rgba(4,18,34,0) 100%)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto" }}>
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
              <motion.div variants={fadeUp} className="about-stats-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
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
                  loading="lazy"
                  decoding="async"
                />
                 <div className="impact-badge" style={{ position: "absolute", bottom: 40, left: -40, background: "white", borderRadius: 20, padding: "20px 24px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 16 }}>
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

      {/* â”€â”€ PRODUCT SHOWCASE â”€â”€ */}
      <section className="showcase-section" style={{ padding: "96px 24px", background: "linear-gradient(180deg, rgba(4,18,34,0) 0%, rgba(11,74,130,0.12) 50%, rgba(4,18,34,0) 100%)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="showcase-header" style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#93C5FD", margin: "0 0 12px 0", letterSpacing: "0.12em" }}>Product preview</p>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 46px)", fontWeight: 800, color: "white", margin: "0 0 14px 0", lineHeight: 1.15 }}>
              See School Manager GH in Action
            </h2>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.62)", margin: "0 auto", maxWidth: 680, lineHeight: 1.7 }}>
              Explore the core screens schools use to manage daily operations, communicate with parents, and reduce repetitive admin work.
            </p>
          </div>

          <div className="showcase-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 28 }}>
            {showcaseScreens.map((screen) => (
              <motion.div
                key={screen.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45 }}
                className="showcase-card"
                style={{
                  background: "rgba(255,255,255,0.055)",
                  border: "1.5px solid rgba(255,255,255,0.1)",
                  borderRadius: 26,
                  padding: 18,
                  overflow: "hidden",
                  backdropFilter: "blur(18px)",
                }}
              >
                <div
                  className="showcase-preview"
                  style={{
                    aspectRatio: "2.08 / 1",
                    borderRadius: 18,
                    overflow: "hidden",
                    background: "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.9))",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
                    position: "relative",
                  }}
                >
                  <img
                    src={screen.image}
                    srcSet={`${screen.imageSmall} 760w, ${screen.image} 1200w`}
                    sizes="(max-width: 640px) calc(100vw - 56px), (max-width: 1024px) calc(100vw - 96px), 680px"
                    alt={`${screen.title} preview`}
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      objectPosition: "top center",
                      display: "block",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      boxShadow: `inset 0 0 0 1px ${screen.accent}44`,
                    }}
                  />
                </div>

                <div style={{ padding: "18px 4px 2px" }}>
                  <h3 style={{ fontSize: 19, fontWeight: 800, color: "white", margin: "0 0 8px 0" }}>{screen.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.64)", margin: 0 }}>{screen.description}</p>
                </div>
              </motion.div>
            ))}
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
                <div key={f.title} className="feature-card" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 24, border: "1.5px solid rgba(255,255,255,0.1)", padding: 28, position: "relative" }}>
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
              <h2 style={{ fontSize: "clamp(26px, 4vw, 48px)", fontWeight: 800, color: "white", marginBottom: 24, lineHeight: 1.2 }}>Empowering teachers to <span style={{ color: "#93C5FD" }}>focus on teaching.</span></h2>
              <p style={{ fontSize: 18, color: "rgba(255,255,255,0.8)", marginBottom: 32 }}>Automate the boring stuff. From digital attendance to term reports.</p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Link to="/book-demo" className="primary-cta" style={primaryCtaStyle}>Book Free Demo</Link>
                <Link to="/get-started" className="secondary-cta" style={secondaryCtaStyle}>Register Your School</Link>
              </div>
            </div>
            <div className="teacher-card-img" style={{ minHeight: 400 }}>
              <img src="/img-teacher-2.PNG" alt="Teacher" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: "100px 24px", background: "linear-gradient(180deg, rgba(4,18,34,0) 0%, rgba(11,74,130,0.08) 100%)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#93C5FD", margin: "0 0 12px 0", letterSpacing: "0.12em" }}>Operational trust</p>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "white", margin: "0 0 14px 0" }}>Why Schools Choose School Manager GH</h2>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.62)", margin: "0 auto", maxWidth: 680, lineHeight: 1.7 }}>
              Practical tools for the work schools repeat every day: reports, fees, communication, attendance, and parent visibility.
            </p>
          </div>

          <div className="trust-card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 22 }}>
            {operationalTrustCards.map((card) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="trust-card"
                  style={{
                    background: "rgba(255,255,255,0.045)",
                    borderRadius: 26,
                    padding: 26,
                    border: "1.5px solid rgba(255,255,255,0.1)",
                    backdropFilter: "blur(18px)",
                  }}
                >
                  <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(147,197,253,0.13)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <Icon size={24} color="#93C5FD" />
                  </div>
                  <h3 style={{ fontSize: 19, fontWeight: 800, color: "white", margin: "0 0 10px 0" }}>{card.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.66)", margin: 0 }}>{card.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ padding: "88px 24px", background: "rgba(255,255,255,0.025)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 36, alignItems: "center" }} className="ghana-comparison-grid">
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#93C5FD", margin: "0 0 12px 0", letterSpacing: "0.12em" }}>Local fit</p>
              <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "white", margin: "0 0 18px 0", lineHeight: 1.15 }}>Built Specifically for Ghanaian Schools</h2>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.66)", lineHeight: 1.75, margin: "0 0 28px 0" }}>
                School Manager GH focuses on the operational details Ghanaian schools actually need, from WhatsApp communication to term-based fee handling and mobile-friendly parent access.
              </p>
              <Link to="/book-demo" className="primary-cta" style={primaryCtaStyle}>Book Free Demo <ArrowRight size={18} /></Link>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {ghanaComparisonCards.map((feature, index) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: 24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="ghana-comparison-card"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "42px 1fr auto",
                    alignItems: "center",
                    gap: 14,
                    borderRadius: 22,
                    padding: "16px 18px",
                    background: "rgba(255,255,255,0.052)",
                    border: "1.5px solid rgba(255,255,255,0.1)",
                    backdropFilter: "blur(16px)",
                  }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: index % 2 === 0 ? "rgba(34,211,238,0.14)" : "rgba(34,197,94,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle size={20} color={index % 2 === 0 ? "#67E8F9" : "#86EFAC"} />
                  </div>
                  <span style={{ color: "white", fontSize: 16, fontWeight: 750 }}>{feature}</span>
                  <span style={{ borderRadius: 999, padding: "5px 10px", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.62)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Included
                  </span>
                </motion.div>
              ))}
            </div>
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
                className="faq-item"
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
                  className="faq-button"
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
                      <div className="faq-answer" style={{ padding: "0 28px 24px", fontSize: 16, lineHeight: 1.7, color: "rgba(255,255,255,0.6)" }}>
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

      <section className="final-cta-section" style={{ padding: "100px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 800, color: "white", marginBottom: 24 }}>Ready to modernize your school?</h2>
        <div className="final-cta-buttons" style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <Link to="/book-demo" className="primary-cta" style={primaryCtaStyle}>Book Free Demo <ArrowRight size={18} /></Link>
          <Link to="/get-started" className="secondary-cta" style={secondaryCtaStyle}>Register Your School</Link>
        </div>
      </section>
    </PublicSiteLayout>
  );
};

export default MarketingHome;
