import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, ChevronDown, Info } from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";

const fadeUp = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.55 } } };
const stagger = { show: { transition: { staggerChildren: 0.15 } } };

type Cycle = "monthly" | "termly" | "yearly";

const formatCurrency = (amount: number) => `GH₵ ${amount.toLocaleString()}`;

function getSubscriptionPrice(monthlyPrice: number, cycle: Cycle): { amount: number; label: string; savings: number } {
  if (cycle === "monthly") {
    return { amount: monthlyPrice, label: "/ month", savings: 0 };
  }

  if (cycle === "termly") {
    const undiscounted = monthlyPrice * 3;
    const amount = Math.round(undiscounted * 0.9);
    return { amount, label: "/ term", savings: undiscounted - amount };
  }

  const undiscounted = monthlyPrice * 12;
  const amount = Math.round(undiscounted * 0.8);
  return { amount, label: "/ year", savings: undiscounted - amount };
}

const plans = [
  {
    name: "Starter Plan",
    tagline: "For schools that want a clean digital foundation.",
    popular: false,
    monthlyPrice: 100,
    setupFee: 300,
    onboardingDetails: "Covers standard Excel student data import and remote admin walk-through.",
    bullets: [
      "Up to 200 Students",
      "Student & Staff Profiles",
      "Core School Setup Tools",
    ],
  },
  {
    name: "Standard Plan",
    tagline: "For schools that need deeper operations visibility.",
    popular: true,
    monthlyPrice: 300,
    setupFee: 1000,
    onboardingDetails: "Covers complete physical/digital record migration, custom grading configuration, and 1 day of on-site staff training.",
    bullets: [
      "Unlimited Students",
      "All Starter Features",
      "NaCCA Grading System & Terminal Reports",
      "Exam Results Analytics",
      "Parent Portal Access",
    ],
  },
];

const faqs = [
  { q: "Do I need a credit card to start?", a: "No. You can start a free trial and set up your school with no payment required upfront." },
  { q: "Can I switch plans later?", a: "Yes. You can upgrade from Starter Plan to Standard Plan at any time from your admin settings." },
  { q: "Is there a setup fee?", a: "Yes. Starter Plan has a GH₵ 300 one-time setup fee, and Standard Plan has a GH₵ 1,000 one-time setup fee. These fees are cover onboarding, data migration, configuration, and training, and they can be negotiated if you need a smaller arrangement." },
  { q: "How long does onboarding take?", a: "Starter onboarding is handled remotely. Standard onboarding includes record migration, grading configuration, and 1 day of on-site staff training." },
  { q: "Is my school data safe?", a: "Yes. All data is stored securely on Firebase with role-based access control and regular backups." },
  { q: "How do monthly, termly, and yearly prices work?", a: "Monthly is billed every month. Termly covers 3 months with a 10% discount, and yearly covers 12 months with a 20% discount. The one-time setup fee is charged only when the school is first onboarded." },
];

const featureComparisonRows = [
  { feature: "Up to 200 Students", starter: true, standard: true },
  { feature: "Unlimited Students", starter: false, standard: true },
  { feature: "Student & Staff Records", starter: true, standard: true },
  { feature: "Class & Section Organization", starter: true, standard: true },
  { feature: "Attendance Tracking", starter: true, standard: true },
  { feature: "Teacher Attendance Tracking", starter: true, standard: true },
  { feature: "Fees & Billing", starter: false, standard: true },
  { feature: "Payment Tracking", starter: false, standard: true },
  { feature: "Financial Reporting", starter: false, standard: true },
  { feature: "Assessments & Reports", starter: false, standard: true },
  { feature: "NaCCA Grading System & Terminal Reports", starter: false, standard: true },
  { feature: "Exam Results Analytics", starter: false, standard: true },
  { feature: "Report Cards", starter: false, standard: true },
  { feature: "Skills & Remarks", starter: false, standard: true },
  { feature: "Student Performance", starter: false, standard: true },
  { feature: "Timetable Management", starter: false, standard: true },
  { feature: "Parent Portal Access", starter: false, standard: true },
  { feature: "School Announcements", starter: false, standard: true },
  { feature: "WhatsApp Broadcast", starter: false, standard: true },
  { feature: "Online Fee Payments", starter: false, standard: true },
  { feature: "Admin Payment Alerts", starter: false, standard: true },
  { feature: "Notifications & Alerts", starter: false, standard: true },
  { feature: "Analytics & Reports", starter: false, standard: true },
  { feature: "Activity Monitoring", starter: false, standard: true },
  { feature: "Backup & Recovery", starter: false, standard: true },
  { feature: "System Settings", starter: false, standard: true },
  { feature: "Security & Access Control", starter: true, standard: true },
  { feature: "Mobile Responsive Access", starter: true, standard: true },
];

const Pricing = () => {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [activeSetupTooltip, setActiveSetupTooltip] = useState<string | null>(null);

  return (
    <PublicSiteLayout>
      <style>{`
        @media (max-width: 960px) {
          .pricing-header { padding: 80px 24px 100px !important; }
          .pricing-grid-section { margin-top: -40px !important; }
          .pricing-grid { 
            grid-template-columns: 1fr !important; 
            gap: 40px !important; 
            max-width: 420px !important;
            margin: 0 auto !important;
          }
        }
        @media (max-width: 600px) {
          .pricing-header h1 { font-size: 30px !important; line-height: 1.2 !important; }
          .pricing-header p { font-size: 15px !important; margin-bottom: 32px !important; }
          .pricing-card { padding: 32px 24px !important; border-radius: 28px !important; }
          .pricing-card h3 { font-size: 24px !important; margin-bottom: 4px !important; }
          .pricing-card .tagline { font-size: 14px !important; margin-bottom: 24px !important; min-height: auto !important; }
          .pricing-card .price-amount { font-size: 36px !important; }
          .pricing-card .features-list { margin-bottom: 32px !important; }
          .pricing-card .feature-item { font-size: 14px !important; margin-bottom: 12px !important; gap: 10px !important; }
          .pricing-card .feature-icon { width: 18px !important; height: 18px !important; }
          .pricing-card .cta-link { padding: 14px 20px !important; font-size: 15px !important; }
          .popular-badge-container { top: -12px !important; }
          .popular-badge-container div { padding: 4px 16px !important; font-size: 11px !important; }
          .cta-buttons { flex-direction: column; width: 100%; }
          .cta-buttons a { width: 100%; justify-content: center; }
          .scroll-hint { display: flex !important; }
          .cycle-toggle { flex-direction: column !important; width: 100% !important; max-width: 280px; margin: 0 auto !important; border-radius: 20px !important; padding: 8px !important; }
          .cycle-toggle button { width: 100% !important; padding: 12px !important; }
          .pricing-grid-section { margin-top: 0 !important; padding: 40px 20px !important; }
        }
      `}</style>

      {/* Header */}
      <section className="pricing-header" style={{ background: "transparent", padding: "100px 24px 140px", position: "relative", overflow: "hidden" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", padding: "8px 20px", borderRadius: "999px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#93C5FD", fontSize: "13px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "20px" }}>
            Pricing Plans
          </div>
          <h1 style={{ fontSize: "clamp(34px, 5vw, 56px)", fontWeight: 800, color: "white", margin: "0 0 20px 0", lineHeight: 1.1, letterSpacing: "-0.02em" }}>Affordable School Management Pricing in Ghana</h1>
          <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: "rgba(255,255,255,0.7)", margin: "0 0 48px 0", lineHeight: 1.6 }}>Choose the most cost-effective school management software for your Ghanaian school. Simple, transparent plans with no hidden fees.</p>

          <div className="cycle-toggle" style={{ display: "inline-flex", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 999, padding: 6, gap: 4 }}>
            {(["monthly", "termly", "yearly"] as Cycle[]).map((billingCycle) => (
              <button
                key={billingCycle}
                onClick={() => setCycle(billingCycle)}
                style={{
                  padding: "10px 22px",
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.25s",
                  background: cycle === billingCycle ? "#0B4A82" : "transparent",
                  color: cycle === billingCycle ? "white" : "rgba(255,255,255,0.6)",
                }}
              >
                {billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1)}
                {billingCycle === "termly" && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: "#FBBF24", background: "rgba(251,191,36,0.12)", borderRadius: 999, padding: "2px 8px" }}>-10%</span>}
                {billingCycle === "yearly" && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: "#FBBF24", background: "rgba(251,191,36,0.12)", borderRadius: 999, padding: "2px 8px" }}>-20%</span>}
              </button>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Plan cards */}
      <section className="pricing-grid-section" style={{ padding: "0 24px", marginTop: -80, position: "relative", zIndex: 10 }}>
        <motion.div initial="hidden" animate="show" variants={stagger} className="pricing-grid" style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 32 }}>
          {plans.map((plan) => {
            const subscription = getSubscriptionPrice(plan.monthlyPrice, cycle);
            const totalDueToday = subscription.amount + plan.setupFee;
            const isSetupTooltipOpen = activeSetupTooltip === plan.name;
            return (
              <motion.div
                key={plan.name}
                variants={fadeUp}
                whileHover={{ y: -8, boxShadow: "0 30px 70px rgba(0,0,0,0.4)" }}
                transition={{ type: "spring", stiffness: 200 }}
                className={`pricing-card ${plan.popular ? "popular" : ""}`}
                style={{
                  background: plan.popular ? "rgba(11, 74, 130, 0.15)" : "rgba(255,255,255,0.05)",
                  borderRadius: "32px",
                  padding: "48px 40px",
                  border: plan.popular ? "2px solid #0B4A82" : "1.5px solid rgba(255,255,255,0.1)",
                  position: "relative",
                  transition: "all 0.3s",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                  backdropFilter: "blur(10px)",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                {plan.popular && (
                  <div className="popular-badge-container" style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", zIndex: 10, whiteSpace: "nowrap" }}>
                    <div style={{ background: "#0B4A82", color: "white", padding: "6px 20px", borderRadius: "999px", fontSize: "12px", fontWeight: "700", letterSpacing: "0.05em" }}>MOST POPULAR</div>
                  </div>
                )}
                <h3 style={{ fontSize: "28px", fontWeight: "800", color: "white", marginBottom: "8px" }}>{plan.name}</h3>
                <p className="tagline" style={{ fontSize: "15px", color: "rgba(255,255,255,0.7)", marginBottom: "32px", minHeight: "44px" }}>{plan.tagline}</p>

                {/* Price */}
                <div style={{ marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                    <span className="price-amount" style={{ fontSize: "48px", fontWeight: "800", color: "white", lineHeight: 1 }}>{formatCurrency(subscription.amount)}</span>
                  </div>
                  <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", margin: "4px 0 0 0" }}>{subscription.label}</p>
                  {subscription.savings > 0 && (
                    <p style={{ fontSize: 13, color: "#10B981", margin: "6px 0 0 0", fontWeight: 700 }}>
                      Save {formatCurrency(subscription.savings)}
                    </p>
                  )}
                  <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 14, color: "rgba(255,255,255,0.62)", fontWeight: 600 }}>
                      + {formatCurrency(plan.setupFee)} one-time setup fee
                    </span>
                    <button
                      type="button"
                      aria-label={`${plan.name} setup fee details`}
                      onClick={() => setActiveSetupTooltip(isSetupTooltipOpen ? null : plan.name)}
                      onMouseEnter={() => setActiveSetupTooltip(plan.name)}
                      onMouseLeave={() => setActiveSetupTooltip(null)}
                      style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid rgba(245, 158, 11, 0.45)", background: "rgba(245, 158, 11, 0.12)", color: "#FBBF24", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                    >
                      <Info size={14} />
                    </button>
                    {isSetupTooltipOpen && (
                      <div style={{ position: "absolute", left: 0, top: "calc(100% + 10px)", width: 280, maxWidth: "min(280px, calc(100vw - 64px))", padding: "12px 14px", borderRadius: 12, background: "#082A4A", border: "1px solid rgba(251, 191, 36, 0.35)", color: "rgba(255,255,255,0.86)", fontSize: 13, lineHeight: 1.5, boxShadow: "0 18px 45px rgba(0,0,0,0.35)", zIndex: 30 }}>
                        {plan.onboardingDetails}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "24px 0 32px" }} />

                <div style={{ border: "1px solid rgba(251, 191, 36, 0.28)", borderRadius: 18, padding: "16px", marginBottom: 28, background: "rgba(251, 191, 36, 0.08)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, color: "rgba(255,255,255,0.68)", fontSize: 13, marginBottom: 8 }}>
                    <span>{cycle.charAt(0).toUpperCase() + cycle.slice(1)} subscription</span>
                    <strong style={{ color: "white" }}>{formatCurrency(subscription.amount)}</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, color: "rgba(255,255,255,0.68)", fontSize: 13, marginBottom: 12 }}>
                    <span>One-time setup</span>
                    <strong style={{ color: "white" }}>{formatCurrency(plan.setupFee)}</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 12, borderTop: "1px solid rgba(251, 191, 36, 0.24)" }}>
                    <span style={{ color: "#FBBF24", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Due Today</span>
                    <strong style={{ color: "#FBBF24", fontSize: 20 }}>{formatCurrency(totalDueToday)}</strong>
                  </div>
                </div>

                <div className="features-list" style={{ flex: 1, marginBottom: 48 }}>
                  <p style={{ fontSize: "13px", fontWeight: "700", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>What's included:</p>
                  {plan.bullets.map((feature, idx) => (
                    <div key={idx} className="feature-item" style={{ display: "flex", alignItems: "center", gap: "14px", color: "rgba(255,255,255,0.9)", fontSize: "15px", fontWeight: "500", marginBottom: "18px" }}>
                      <div className="feature-icon" style={{ width: "22px", height: "22px", borderRadius: "50%", background: "rgba(147, 197, 253, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Check size={14} color="#93C5FD" strokeWidth={3} />
                      </div>
                      {feature}
                    </div>
                  ))}
                </div>

                <Link
                  to="/get-started"
                  className="cta-link"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    padding: "18px 24px", borderRadius: 999, fontSize: 16, fontWeight: 700,
                    textDecoration: "none", transition: "all 0.3s",
                    background: plan.popular ? "#0B4A82" : "transparent",
                    color: "white",
                    border: "2px solid #0B4A82",
                    boxShadow: plan.popular ? "0 10px 25px rgba(0,0,0,0.3)" : "none",
                  }}
                  onMouseEnter={e => { if (!plan.popular) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { if (!plan.popular) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  Get Started <ArrowRight size={18} />
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Free trial note */}
        <p style={{ textAlign: "center", marginTop: 32, fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          All plans come with a <strong style={{ color: "white" }}>30-day free trial</strong>. No credit card required.
        </p>
      </section>

      {/* Feature Comparison Table */}
      <section style={{ padding: "80px 24px 0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, color: "white", margin: "0 0 12px 0" }}>Plan feature comparison</h2>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 16 }}>See exactly what's included in each plan.</p>
            <div className="scroll-hint" style={{ display: "none", alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 16 }}>
              <span>← Scroll to see all plans →</span>
            </div>
          </div>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 24, border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ minWidth: 600, background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px", padding: "14px 24px", background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.08)", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Feature</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>Starter</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#93C5FD", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>Standard</span>
            </div>
            {featureComparisonRows.map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px", padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center", gap: 8, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                <span style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{row.feature}</span>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  {row.starter
                    ? <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(147,197,253,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={13} color="#93C5FD" strokeWidth={3} /></div>
                    : <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 14, color: "rgba(255,255,255,0.2)", lineHeight: 1 }}>—</span></div>
                  }
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  {row.standard
                    ? <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(147,197,253,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={13} color="#93C5FD" strokeWidth={3} /></div>
                    : <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 14, color: "rgba(255,255,255,0.2)", lineHeight: 1 }}>—</span></div>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>

      {/* Comparison table */}
      <section style={{ padding: "100px 24px 0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center", marginBottom: 48 }}>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, color: "white", margin: "0 0 12px 0" }}>Quick price comparison</h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 16 }}>See exactly what each plan costs across billing cycles.</p>
          <div className="scroll-hint" style={{ display: "none", alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 16 }}>
            <span>← Scroll to see all pricing details →</span>
          </div>
        </div>
        <div style={{ maxWidth: 860, margin: "0 auto", overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 24, border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ minWidth: 720, background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr 1fr 1fr 1fr", padding: "16px 24px", background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Plan</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>Monthly</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#93C5FD", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>Termly <span style={{ fontSize: 10 }}>(-10%)</span></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#93C5FD", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>Yearly <span style={{ fontSize: 10 }}>(-20%)</span></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#FBBF24", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>Setup Fee</span>
            </div>
            {plans.map((plan) => (
              <div key={plan.name} style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr 1fr 1fr 1fr", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", alignItems: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "white" }}>{plan.name}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.8)", textAlign: "center" }}>{formatCurrency(getSubscriptionPrice(plan.monthlyPrice, "monthly").amount)}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#93C5FD", textAlign: "center" }}>{formatCurrency(getSubscriptionPrice(plan.monthlyPrice, "termly").amount)}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#93C5FD", textAlign: "center" }}>{formatCurrency(getSubscriptionPrice(plan.monthlyPrice, "yearly").amount)}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#FBBF24", textAlign: "center" }}>{formatCurrency(plan.setupFee)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section style={{ padding: "120px 24px 100px", background: "transparent" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "80px" }}>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, color: "white", marginBottom: "16px" }}>Frequently Asked Questions</h2>
            <p style={{ fontSize: "18px", color: "rgba(255,255,255,0.7)" }}>Everything you need to know about our plans and billing</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {faqs.map((faq, idx) => (
              <div key={idx} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <button
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  style={{ width: "100%", padding: "22px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ fontSize: 17, fontWeight: 700, color: "white" }}>{faq.q}</span>
                  <motion.div animate={{ rotate: activeFaq === idx ? 180 : 0 }} style={{ flexShrink: 0 }}>
                    <ChevronDown size={20} color="rgba(255,255,255,0.5)" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {activeFaq === idx && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                      <div style={{ padding: "0 28px 22px", fontSize: 15, lineHeight: 1.7, color: "rgba(255,255,255,0.6)" }}>{faq.a}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{ padding: "100px 24px 140px" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(30px, 4vw, 48px)", fontWeight: 800, color: "white", margin: "0 0 24px 0", lineHeight: 1.1 }}>Ready to modernize your school?</h2>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", margin: "0 0 48px 0", lineHeight: 1.6 }}>Join forward-thinking schools across Ghana, register your school, and start your trial today. No credit card required.</p>
          <div className="cta-buttons" style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/get-started" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "18px 40px", borderRadius: 999, background: "#0B4A82", color: "white", fontWeight: 700, fontSize: 16, textDecoration: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}>
              Register Your School <ArrowRight size={18} />
            </Link>
            <Link to="/book-demo" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "18px 40px", borderRadius: 999, border: "2px solid rgba(255,255,255,0.2)", color: "white", fontWeight: 700, fontSize: 16, textDecoration: "none", backdropFilter: "blur(10px)" }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
              Book a Demo
            </Link>
          </div>
        </motion.div>
      </section>
    </PublicSiteLayout>
  );
};

export default Pricing;
