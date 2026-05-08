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
  Lock,
  Globe,
  Smartphone,
  Download,
  Upload,
  Mail,
  MessageSquare,
  PieChart,
  TrendingUp,
  School,
  UserCheck,
  ClipboardCheck,
  Award,
  Layers,
} from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";

const fadeUp = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.55 } } };
const stagger = { show: { transition: { staggerChildren: 0.12 } } };

const featureCategories = [
  {
    title: "Core Management",
    desc: "Essential tools every school needs to operate efficiently",
    color: "#0B4A82",
    bgColor: "#EFF6FF",
    features: [
      {
        icon: CalendarDays,
        title: "Attendance Tracking",
        desc: "Daily student & teacher attendance with instant visibility, missed-record alerts, and comprehensive reporting.",
        bullets: ["Real-time attendance marking", "Automated absence alerts", "Teacher attendance tracking", "Export attendance reports"],
      },
      {
        icon: BookOpen,
        title: "Assessments & Reports",
        desc: "Record tests, homework, exams and generate professional report cards ready for distribution.",
        bullets: ["Multiple assessment types", "Customizable grading scales", "Auto-generated report cards", "Performance analytics"],
      },
      {
        icon: Users,
        title: "Student & Staff Records",
        desc: "Centralize classes, teachers, and students so your school runs from one unified workspace.",
        bullets: ["Complete student profiles", "Teacher management", "Class & section organization", "Bulk import/export"],
      },
      {
        icon: CreditCard,
        title: "Fees & Billing",
        desc: "Manage school finances, track payment activity, and plan billing from one screen.",
        bullets: ["Fee structure management", "Payment tracking", "Invoice generation", "Financial reporting"],
      },
    ],
  },
  {
    title: "Academic Tools",
    desc: "Empower teachers with tools that enhance learning outcomes",
    color: "#16A34A",
    bgColor: "#F0FDF4",
    features: [
      {
        icon: CalendarRange,
        title: "Timetable Management",
        desc: "Create and manage class schedules, teacher timetables, and room allocations with ease.",
        bullets: ["Drag-and-drop scheduling", "Conflict detection", "Teacher timetables", "Period management"],
      },
      {
        icon: ClipboardCheck,
        title: "Skills & Remarks",
        desc: "Track student skills development and write meaningful remarks for holistic assessment.",
        bullets: ["Skill categorization", "Progress tracking", "Teacher remarks", "Parent visibility"],
      },
      {
        icon: Award,
        title: "Student Performance",
        desc: "Monitor academic progress with detailed analytics and identify students needing attention.",
        bullets: ["Performance dashboards", "At-risk student alerts", "Progress reports", "Comparative analytics"],
      },
      {
        icon: FileText,
        title: "Report Cards",
        desc: "Generate professional, customizable report cards with all assessments and remarks included.",
        bullets: ["Custom templates", "Bulk generation", "PDF export", "Digital distribution"],
      },
    ],
  },
  {
    title: "Administration",
    desc: "Powerful admin tools for complete school oversight",
    color: "#D97706",
    bgColor: "#FFFBEB",
    features: [
      {
        icon: BarChart3,
        title: "Analytics & Reports",
        desc: "Comprehensive dashboards with insights into attendance, performance, and school operations.",
        bullets: ["Attendance statistics", "Performance trends", "Custom report builder", "Data visualization"],
      },
      {
        icon: Activity,
        title: "Activity Monitoring",
        desc: "Track all system activities with detailed logs for transparency and accountability.",
        bullets: ["User activity logs", "System change tracking", "Login history", "Audit trails"],
      },
      {
        icon: Database,
        title: "Backup & Recovery",
        desc: "Automated backups and easy data recovery to keep your school data safe and secure.",
        bullets: ["Automated daily backups", "One-click restore", "Data export tools", "Backup scheduling"],
      },
      {
        icon: Settings,
        title: "System Settings",
        desc: "Configure school branding, academic terms, and system preferences from one place.",
        bullets: ["School branding", "Term management", "User role configuration", "System preferences"],
      },
    ],
  },
  {
    title: "Platform Features",
    desc: "Built for modern schools with security and scalability in mind",
    color: "#9333EA",
    bgColor: "#FDF4FF",
    features: [
      {
        icon: ShieldCheck,
        title: "Security & Access Control",
        desc: "Role-based access control with multi-layer security for schools, teachers, and administrators.",
        bullets: ["Role-based permissions", "Two-factor authentication", "Suspicious activity detection", "Security audit logs"],
      },
      {
        icon: Globe,
        title: "Multi-School Platform",
        desc: "Super Admin dashboard to manage multiple schools, subscriptions, and platform-wide settings.",
        bullets: ["School provisioning", "Subscription management", "Platform analytics", "Global settings"],
      },
      {
        icon: Smartphone,
        title: "Mobile Responsive",
        desc: "Access your school data anywhere with a fully responsive design that works on all devices.",
        bullets: ["Mobile-optimized UI", "PWA support", "Offline capabilities", "Cross-device sync"],
      },
      {
        icon: Bell,
        title: "Notifications & Alerts",
        desc: "Keep everyone informed with automated notifications for attendance, fees, and important events.",
        bullets: ["Email notifications", "In-app alerts", "SMS integration ready", "Custom notification rules"],
      },
    ],
  },
];

const roleFeatures = [
  {
    role: "School Admins",
    icon: ShieldCheck,
    color: "#0B4A82",
    features: ["Full student & teacher management", "Financial oversight & reporting", "System configuration", "Activity monitoring", "Backup management"],
  },
  {
    role: "Teachers",
    icon: GraduationCap,
    color: "#16A34A",
    features: ["Quick attendance marking", "Assessment entry", "Student performance view", "Remark writing", "Timetable access"],
  },
  {
    role: "Super Admins",
    icon: BarChart3,
    color: "#9333EA",
    features: ["Multi-school management", "Platform analytics", "Subscription billing", "System health monitoring", "Security oversight"],
  },
];

const Features = () => (
  <PublicSiteLayout>
    {/* Responsive Design System */}
    <style>{`
      @media (max-width: 1024px) {
        .features-header { padding: 80px 24px 100px !important; }
        .category-section { padding: 80px 24px !important; }
      }
      @media (max-width: 768px) {
        .hero-title { font-size: 34px !important; }
        .category-grid { 
          grid-template-columns: 1fr !important; 
          gap: 24px !important; 
        }
        .role-grid { 
          grid-template-columns: 1fr !important; 
          gap: 24px !important; 
        }
        .cta-buttons { flex-direction: column; width: 100%; }
        .cta-buttons a { width: 100%; justify-content: center; }
      }
      @media (max-width: 480px) {
        .hero-title { font-size: 28px !important; }
        .feature-card { padding: 24px !important; }
        .category-title { font-size: 24px !important; }
      }
    `}</style>

    {/* Hero Section */}
    <section style={{ background: "linear-gradient(135deg, #0B4A82 0%, #1E40AF 50%, #0B4A82 100%)", padding: "100px 24px 140px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-10%", right: "-10%", width: "40%", height: "80%", background: "radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)", filter: "blur(60px)" }} />
      <div style={{ position: "absolute", bottom: "-20%", left: "-5%", width: "30%", height: "60%", background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)", filter: "blur(60px)" }} />
      
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ maxWidth: 800, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}
      >
        <div style={{ display: "inline-flex", padding: "8px 20px", borderRadius: "999px", background: "rgba(255,255,255,0.15)", color: "white", fontSize: "13px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "20px" }}>
          Platform Features
        </div>
        <h1 className="hero-title" style={{ fontSize: "clamp(34px, 5vw, 60px)", fontWeight: 800, color: "white", margin: "0 0 24px 0", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
          Everything your school needs to succeed
        </h1>
        <p style={{ fontSize: "clamp(16px, 2vw, 20px)", color: "rgba(255,255,255,0.9)", margin: "0 0 48px 0", lineHeight: 1.6, maxWidth: 600, marginLeft: "auto", marginRight: "auto" }}>
          From attendance tracking to advanced analytics, School Manager GH provides all the tools Ghana's schools need to operate efficiently in one unified platform.
        </p>
        <div className="cta-buttons" style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            to="/get-started"
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "16px 36px", borderRadius: 999,
              background: "white", color: "#0B4A82",
              fontWeight: 700, fontSize: 16, textDecoration: "none",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              transition: "all 0.3s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 15px 40px rgba(0,0,0,0.3)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 30px rgba(0,0,0,0.2)"; }}
          >
            Register Your School <ArrowRight size={18} />
          </Link>
          <Link
            to="/pricing"
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "16px 36px", borderRadius: 999,
              border: "2px solid rgba(255,255,255,0.5)", color: "white",
              fontWeight: 700, fontSize: 16, textDecoration: "none",
              transition: "all 0.3s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "white"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.5)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            View Pricing
          </Link>
        </div>
      </motion.div>
    </section>

    {/* Feature Categories */}
    {featureCategories.map((category, catIdx) => (
      <section
        key={category.title}
        className="category-section"
        style={{
          padding: "100px 24px",
          background: catIdx % 2 === 0 ? "white" : "#F8FAFC",
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={stagger}
            style={{ textAlign: "center", marginBottom: 64 }}
          >
            <motion.div variants={fadeUp}>
              <div style={{
                display: "inline-flex", padding: "8px 20px", borderRadius: "12px",
                background: category.bgColor, color: category.color,
                fontSize: "13px", fontWeight: "700", textTransform: "uppercase",
                letterSpacing: "0.12em", marginBottom: "16px",
              }}>
                {category.title}
              </div>
            </motion.div>
            <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "#0f172a", margin: "0 0 16px 0", letterSpacing: "-0.01em" }}>
              {category.title}
            </motion.h2>
            <motion.p variants={fadeUp} style={{ fontSize: 18, color: "#64748B", margin: 0, lineHeight: 1.6, maxWidth: 600, marginLeft: "auto", marginRight: "auto" }}>
              {category.desc}
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={stagger}
            className="category-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 32,
            }}
          >
            {category.features.map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  variants={fadeUp}
                  whileHover={{ y: -8, boxShadow: "0 20px 50px rgba(0,0,0,0.1)" }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="feature-card"
                  style={{
                    background: "white",
                    borderRadius: 24,
                    padding: "32px",
                    border: "1.5px solid #F1F5F9",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
                    transition: "all 0.3s",
                  }}
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: category.bgColor,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 24,
                  }}>
                    <Icon size={28} color={category.color} strokeWidth={2} />
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 12px 0" }}>
                    {feature.title}
                  </h3>
                  <p style={{ fontSize: 15, color: "#64748B", margin: "0 0 20px 0", lineHeight: 1.7 }}>
                    {feature.desc}
                  </p>
                  <div>
                    {feature.bullets.map((bullet) => (
                      <div key={bullet} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: category.bgColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                          <Check size={12} color={category.color} strokeWidth={3} />
                        </div>
                        <span style={{ fontSize: 14, color: "#475569", fontWeight: 500 }}>{bullet}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>
    ))}

    {/* Role-Based Features */}
    <section style={{ padding: "100px 24px", background: "linear-gradient(135deg, #0B4A82 0%, #1E40AF 100%)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "10%", left: "-5%", width: "30%", height: "60%", background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)", filter: "blur(60px)" }} />
      
      <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={stagger}
          style={{ textAlign: "center", marginBottom: 64 }}
        >
          <motion.div variants={fadeUp}>
            <div style={{
              display: "inline-flex", padding: "8px 20px", borderRadius: "12px",
              background: "rgba(255,255,255,0.15)", color: "white",
              fontSize: "13px", fontWeight: "700", textTransform: "uppercase",
              letterSpacing: "0.12em", marginBottom: "16px",
            }}>
              Built For Everyone
            </div>
          </motion.div>
          <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "white", margin: "0 0 16px 0", letterSpacing: "-0.01em" }}>
            Tailored for every role
          </motion.h2>
          <motion.p variants={fadeUp} style={{ fontSize: 18, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.6, maxWidth: 600, marginLeft: "auto", marginRight: "auto" }}>
            Each user gets exactly the tools they need, nothing more, nothing less.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={stagger}
          className="role-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 32,
          }}
        >
          {roleFeatures.map((role) => {
            const Icon = role.icon;
            return (
              <motion.div
                key={role.role}
                variants={fadeUp}
                whileHover={{ y: -8 }}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  backdropFilter: "blur(10px)",
                  borderRadius: 24,
                  padding: "40px 32px",
                  border: "1.5px solid rgba(255,255,255,0.2)",
                  transition: "all 0.3s",
                }}
              >
                <div style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: "rgba(255,255,255,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 24,
                }}>
                  <Icon size={32} color="white" strokeWidth={2} />
                </div>
                <h3 style={{ fontSize: 24, fontWeight: 700, color: "white", margin: "0 0 12px 0" }}>
                  {role.role}
                </h3>
                <div style={{ marginTop: 20 }}>
                  {role.features.map((feature) => (
                    <div key={feature} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                      <Check size={18} color="rgba(255,255,255,0.9)" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 15, color: "rgba(255,255,255,0.95)", fontWeight: 500, lineHeight: 1.5 }}>{feature}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>

    {/* CTA Section */}
    <section style={{ padding: "100px 24px", background: "white" }}>
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        variants={stagger}
        style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}
      >
        <motion.div variants={fadeUp}>
          <div style={{
            display: "inline-flex", padding: "8px 20px", borderRadius: "12px",
            background: "#EFF6FF", color: "#0B4A82",
            fontSize: "13px", fontWeight: "700", textTransform: "uppercase",
            letterSpacing: "0.12em", marginBottom: "20px",
          }}>
            Ready to Get Started?
          </div>
        </motion.div>
        <motion.h2 variants={fadeUp} style={{ fontSize: "clamp(30px, 4vw, 48px)", fontWeight: 800, color: "#0f172a", margin: "0 0 24px 0", lineHeight: 1.1 }}>
          Transform your school today
        </motion.h2>
        <motion.p variants={fadeUp} style={{ fontSize: 18, color: "#64748B", margin: "0 0 48px 0", lineHeight: 1.6 }}>
          Join forward-thinking schools across Ghana, register your school, and start your trial today. No credit card required.
        </motion.p>
        <motion.div variants={fadeUp} className="cta-buttons" style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            to="/get-started"
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "18px 40px", borderRadius: 999,
              background: "linear-gradient(135deg, #0B4A82, #1E40AF)",
              color: "white", fontWeight: 700, fontSize: 16,
              textDecoration: "none",
              boxShadow: "0 10px 30px rgba(11,74,130,0.3)",
              transition: "all 0.3s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 15px 40px rgba(11,74,130,0.4)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 30px rgba(11,74,130,0.3)"; }}
          >
            Register Your School <ArrowRight size={18} />
          </Link>
          <Link
            to="/book-demo"
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "18px 40px", borderRadius: 999,
              border: "2px solid #0B4A82", color: "#0B4A82",
              fontWeight: 700, fontSize: 16, textDecoration: "none",
              transition: "all 0.3s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#EFF6FF"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            Book a Demo
          </Link>
        </motion.div>
      </motion.div>
    </section>
  </PublicSiteLayout>
);

export default Features;
