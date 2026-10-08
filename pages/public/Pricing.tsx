import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";

const fadeUp = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.55 } } };
const stagger = { show: { transition: { staggerChildren: 0.15 } } };

type Cycle = "monthly" | "termly" | "yearly";

const formatCurrency = (amount: number) => `GH₵ ${amount.toLocaleString()}`;

function getSubscriptionPrice(cycle: Cycle): { amount: number; label: string } {
  if (cycle === "monthly") {
    return { amount: 150, label: "/ month" };
  }
  if (cycle === "termly") {
    return { amount: 400, label: "/ term" };
  }
  return { amount: 1200, label: "/ year" };
}

const plans = [
  {
    name: "Complete School Management",
    tagline: "Full-featured school management software for your school.",
    popular: true,
    bullets: [
      "Unlimited Students",
      "Student & Staff Profiles",
      "Core School Setup Tools",
      "NaCCA Grading System & Terminal Reports",
      "Exam Results Analytics",
      "Parent Portal Access",
      "Fees & Billing",
      "Payment Tracking",
      "Financial Reporting",
      "Assessments & Reports",
      "Report Cards",
      "Skills & Remarks",
      "Student Performance",
      "Timetable Management",
      "School Announcements",
      "Online Fee Payments",
      "Admin Payment Alerts",
      "Notifications & Alerts",
      "Analytics & Reports",
      "Activity Monitoring",
      "Backup & Recovery",
      "System Settings",
      "Security & Access Control",
      "Mobile Responsive Access",
    ],
  },
];

const faqs = [
  { q: "Do I need a credit card to start?", a: "No. You can start a free trial and set up your school with no payment required upfront." },
  { q: "Can I switch billing cycles later?", a: "Yes. You can change between monthly, termly, and yearly billing at any time from your admin settings." },
  { q: "How long does onboarding take?", a: "Onboarding is handled remotely and can be completed in minutes. Our team is available to assist if needed." },
  { q: "Is my school data safe?", a: "Yes. All data is stored securely on Firebase with role-based access control and regular backups." },
  { q: "How do monthly, termly, and yearly prices work?", a: "Monthly is billed every month. Termly is GHS 400 per term. Yearly is GHS 1,200 per year." },
  { q: "Are SMS credits included?", a: "No. SMS bundles are purchased separately and are not included in the software subscription." },
];

const Pricing = () => {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

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
              </button>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Plan cards */}
      <section className="pricing-grid-section" style={{ padding: "0 24px", marginTop: -80, position: "relative", zIndex: 10 }}>
        <motion.div initial="hidden" animate="show" variants={stagger} className="pricing-grid" style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 32 }}>
          {plans.map((plan) => {
            const subscription = getSubscriptionPrice(cycle);
            const isSetupTooltipOpen = false;
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
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "24px 0 32px" }} />

                <div style={{ border: "1px solid rgba(251, 191, 36, 0.28)", borderRadius: 18, padding: "16px", marginBottom: 28, background: "rgba(251, 191, 36, 0.08)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, color: "rgba(255,255,255,0.68)", fontSize: 13, marginBottom: 8 }}>
                    <span>{cycle.charAt(0).toUpperCase() + cycle.slice(1)} subscription</span>
                    <strong style={{ color: "white" }}>{formatCurrency(subscription.amount)}</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 12, borderTop: "1px solid rgba(251, 191, 36, 0.24)" }}>
                    <span style={{ color: "#FBBF24", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Due Today</span>
                    <strong style={{ color: "#FBBF24", fontSize: 20 }}>{formatCurrency(subscription.amount)}</strong>
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



      {/* Comparison table */}
      <section style={{ padding: "100px 24px 0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center", marginBottom: 48 }}>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, color: "white", margin: "0 0 12px 0" }}>Simple, transparent pricing</h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 16 }}>One plan. All features. No hidden fees.</p>
          <div className="scroll-hint" style={{ display: "none", alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 16 }}>
            <span>← Scroll to see all pricing details →</span>
          </div>
        </div>
        <div style={{ maxWidth: 860, margin: "0 auto", overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 24, border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ minWidth: 720, background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr 1fr 1fr", padding: "16px 24px", background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Plan</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>Monthly</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#93C5FD", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>Termly</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#93C5FD", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>Yearly</span>
            </div>
            {plans.map((plan) => (
              <div key={plan.name} style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr 1fr 1fr", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", alignItems: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "white" }}>{plan.name}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.8)", textAlign: "center" }}>{formatCurrency(getSubscriptionPrice("monthly").amount)}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#93C5FD", textAlign: "center" }}>{formatCurrency(getSubscriptionPrice("termly").amount)}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#93C5FD", textAlign: "center" }}>{formatCurrency(getSubscriptionPrice("yearly").amount)}</span>
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
