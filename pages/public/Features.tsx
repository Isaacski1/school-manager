import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  CalendarDays,
  BookOpen,
  CreditCard,
  Users,
  BarChart3,
  ShieldCheck,
  GraduationCap,
  FileText,
  Bell,
  Settings,
  CalendarRange,
  Activity,
  Database,
  Globe,
  Smartphone,
  ClipboardCheck,
  Award,
  Heart,
  MessageCircle,
  Wallet,
} from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";

const fadeUp = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.55 } } };
const stagger = { show: { transition: { staggerChildren: 0.12 } } };

const featureCategories = [
  {
    title: "Core Management",
    desc: "Essential tools every school needs to operate efficiently",
    color: "#93C5FD",
    bgColor: "rgba(147, 197, 253, 0.15)",
    features: [
      { icon: CalendarDays, title: "Attendance Tracking", desc: "Daily student & teacher attendance with instant visibility, missed-record alerts, and comprehensive reporting.", bullets: ["Real-time attendance marking", "Automated absence alerts", "Teacher attendance tracking", "Export attendance reports"] },
      { icon: BookOpen, title: "Assessments & Reports", desc: "Record tests, homework, exams and generate professional report cards ready for distribution.", bullets: ["Multiple assessment types", "Customizable grading scales", "Auto-generated report cards", "Performance analytics"] },
      { icon: Users, title: "Student & Staff Records", desc: "Centralize classes, teachers, and students so your school runs from one unified workspace.", bullets: ["Complete student profiles", "Teacher management", "Class & section organization", "Bulk import/export"] },
      { icon: CreditCard, title: "Fees & Billing", desc: "Manage school finances, track payment activity, and plan billing from one screen.", bullets: ["Fee structure management", "Payment tracking", "Invoice generation", "Financial reporting"] },
      { icon: Smartphone, title: "Parent Portal", desc: "Dedicated access for parents to monitor their child's academic journey and stay connected with the school.", bullets: ["Real-time attendance view", "Digital report cards", "Online fee payments", "School announcements"] },
    ],
  },
  {
    title: "Academic Tools",
    desc: "Empower teachers with tools that enhance learning outcomes",
    color: "#93C5FD",
    bgColor: "rgba(147, 197, 253, 0.15)",
    features: [
      { icon: CalendarRange, title: "Timetable Management", desc: "Create and manage class schedules, teacher timetables, and room allocations with ease.", bullets: ["Drag-and-drop scheduling", "Conflict detection", "Teacher timetables", "Period management"] },
      { icon: ClipboardCheck, title: "Skills & Remarks", desc: "Track student skills development and write meaningful remarks for holistic assessment.", bullets: ["Skill categorization", "Progress tracking", "Teacher remarks", "Parent visibility"] },
      { icon: Award, title: "Student Performance", desc: "Monitor academic progress with detailed analytics and identify students needing attention.", bullets: ["Performance dashboards", "At-risk student alerts", "Progress reports", "Comparative analytics"] },
      { icon: FileText, title: "Report Cards", desc: "Generate professional, customizable report cards with all assessments and remarks included.", bullets: ["Custom templates", "Bulk generation", "PDF export", "Digital distribution"] },
    ],
  },
  {
    title: "Administration",
    desc: "Powerful admin tools for complete school oversight",
    color: "#93C5FD",
    bgColor: "rgba(147, 197, 253, 0.15)",
    features: [
      { icon: BarChart3, title: "Analytics & Reports", desc: "Comprehensive dashboards with insights into attendance, performance, and school operations.", bullets: ["Attendance statistics", "Performance trends", "Custom report builder", "Data visualization"] },
      { icon: Activity, title: "Activity Monitoring", desc: "Track all system activities with detailed logs for transparency and accountability.", bullets: ["User activity logs", "System change tracking", "Login history", "Audit trails"] },
      { icon: Database, title: "Backup & Recovery", desc: "Automated backups and easy data recovery to keep your school data safe and secure.", bullets: ["Automated daily backups", "One-click restore", "Data export tools", "Backup scheduling"] },
      { icon: Settings, title: "System Settings", desc: "Configure school branding, academic terms, and system preferences from one place.", bullets: ["School branding", "Term management", "User role configuration", "System preferences"] },
    ],
  },
  {
    title: "Platform Features",
    desc: "Built for modern schools with security and scalability in mind",
    color: "#93C5FD",
    bgColor: "rgba(147, 197, 253, 0.15)",
    features: [
      { icon: ShieldCheck, title: "Security & Access Control", desc: "Role-based access control with multi-layer security for schools, teachers, and administrators.", bullets: ["Role-based permissions", "Two-factor authentication", "Suspicious activity detection", "Security audit logs"] },
      { icon: Globe, title: "Multi-School Platform", desc: "Super Admin dashboard to manage multiple schools, subscriptions, and platform-wide settings.", bullets: ["School provisioning", "Subscription management", "Platform analytics", "Global settings"] },
      { icon: Smartphone, title: "Mobile Responsive", desc: "Access your school data anywhere with a fully responsive design that works on all devices.", bullets: ["Mobile-optimized UI", "PWA support", "Offline capabilities", "Cross-device sync"] },
      { icon: Bell, title: "Notifications & Alerts", desc: "Keep everyone informed with automated notifications for attendance, fees, and important events.", bullets: ["Email notifications", "In-app alerts", "SMS integration ready", "Custom notification rules"] },
    ],
  },
  {
    title: "Communication & Payments",
    desc: "Standard-plan features that connect your school to parents and streamline fee collection",
    color: "#93C5FD",
    bgColor: "rgba(147, 197, 253, 0.15)",
    badge: "Standard Plan",
    features: [
      {
        icon: MessageCircle,
        title: "WhatsApp Broadcast",
        desc: "Send bulk messages to all parents instantly via WhatsApp — directly from your admin dashboard, no extra app or subscription needed.",
        bullets: ["Bulk-message all parents at once", "Custom quick-reply templates", "Real-time delivery tracking", "Filter recipients by class"]
      },
      {
        icon: Wallet,
        title: "Online Fee Payments",
        desc: "Parents pay school fees online via Paystack using Mobile Money or card. Payments are reflected instantly on the admin finance dashboard.",
        bullets: ["Mobile Money (MTN, Vodafone, AirtelTigo)", "Card & Paystack support", "Auto-generated PDF invoice to parent", "Instant balance reconciliation"]
      },
      {
        icon: Bell,
        title: "Admin Payment Alerts",
        desc: "The admin receives a WhatsApp notification the moment any parent completes a payment — with full details and a PDF receipt attached.",
        bullets: ["Instant WhatsApp alert on payment", "Payment amount & student name included", "PDF receipt attached automatically", "In-dashboard notification log"]
      },
    ],
  },
];

const roleFeatures = [
  { role: "School Admins", icon: ShieldCheck, color: "#0B4A82", features: ["Full student & teacher management", "Financial oversight & reporting", "System configuration", "Activity monitoring", "Backup management"] },
  { role: "Teachers", icon: GraduationCap, color: "#16A34A", features: ["Quick attendance marking", "Assessment entry", "Student performance view", "Remark writing", "Timetable access"] },
  { role: "Parents", icon: Heart, color: "#0B4A82", features: ["Attendance tracking", "Report card access", "Fee payment portal", "Teacher communication", "School announcements"] },
  { role: "Super Admins", icon: BarChart3, color: "#9333EA", features: ["Multi-school management", "Platform analytics", "Subscription billing", "System health monitoring", "Security oversight"] },
];

const Features = () => {
  return (
    <PublicSiteLayout>
      <style>{`
        @media (max-width: 1024px) { .category-section { padding: 80px 24px !important; } }
        @media (max-width: 768px) {
          .hero-title { font-size: 34px !important; }
          .category-grid, .role-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .cta-buttons { flex-direction: column; width: 100%; }
          .cta-buttons a { width: 100%; justify-content: center; }
        }
        @media (max-width: 480px) {
          .hero-title { font-size: 28px !important; }
          .feature-card { padding: 24px !important; }
        }
      `}</style>

      <section style={{ background: "transparent", padding: "100px 24px 80px", position: "relative", overflow: "hidden" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ maxWidth: 800, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", padding: "8px 20px", borderRadius: "999px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#93C5FD", fontSize: "13px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "20px" }}>Platform Features</div>
          <h1 className="hero-title" style={{ fontSize: "clamp(34px, 5vw, 60px)", fontWeight: 800, color: "white", margin: "0 0 24px 0", lineHeight: 1.1 }}>Powerful School Management Features for Ghana</h1>
          <p style={{ fontSize: "clamp(16px, 2vw, 20px)", color: "rgba(255,255,255,0.7)", margin: "0 0 48px 0", lineHeight: 1.6, maxWidth: 600, marginLeft: "auto", marginRight: "auto" }}>Discover why School Manager GH is the best management system for schools in Ghana. Everything you need from attendance to automated payments.</p>
        </motion.div>
      </section>

      {featureCategories.map((category) => (
        <section key={category.title} className="category-section" style={{ padding: "100px 24px", background: "transparent" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 20px", borderRadius: "12px", background: "rgba(255,255,255,0.05)", color: category.color, fontSize: "13px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "16px", border: "1px solid rgba(255,255,255,0.1)" }}>
                {category.title}
                {(category as any).badge && (
                  <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(147,197,253,0.2)", color: "#93C5FD", border: "1px solid rgba(147,197,253,0.3)", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.1em" }}>{(category as any).badge}</span>
                )}
              </div>
              <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "white", margin: "0 0 16px 0" }}>{category.title}</h2>
              <p style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", maxWidth: 600, margin: "0 auto" }}>{category.desc}</p>
            </div>

            <div className="category-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 32 }}>
              {category.features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <motion.div key={feature.title} whileHover={{ y: -8, translateZ: 0 }} className="feature-card" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 24, padding: "32px", border: "1.5px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)", willChange: "transform", position: "relative" }}>
                    {(category as any).badge && (
                      <div style={{ position: "absolute", top: 16, right: 16, background: "rgba(147,197,253,0.15)", border: "1px solid rgba(147,197,253,0.3)", borderRadius: 999, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: "#93C5FD", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Standard
                      </div>
                    )}
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: category.bgColor, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                      <Icon size={28} color={category.color} strokeWidth={2} />
                    </div>
                    <h3 style={{ fontSize: 22, fontWeight: 700, color: "white", margin: "0 0 12px 0" }}>{feature.title}</h3>
                    <p style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", margin: "0 0 20px 0", lineHeight: 1.7 }}>{feature.desc}</p>
                    <div>
                      {feature.bullets.map((bullet) => (
                        <div key={bullet} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                          <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                            <Check size={12} color="white" strokeWidth={3} />
                          </div>
                          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{bullet}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      <section style={{ padding: "100px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(30px, 4vw, 48px)", fontWeight: 800, color: "white", margin: "0 0 24px 0" }}>Transform your school today</h2>
        <Link to="/get-started" style={{ display: "inline-flex", padding: "18px 40px", borderRadius: 999, background: "#0B4A82", color: "white", fontWeight: 700, textDecoration: "none" }}>Register Your School</Link>
      </section>
    </PublicSiteLayout>
  );
};

export default Features;
