import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";

const fadeUp = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.55 } } };
const stagger = { show: { transition: { staggerChildren: 0.15 } } };

const plans = [
  {
    name: "Starter",
    tagline: "For schools that want a clean digital foundation.",
    featured: false,
    bullets: ["Student & teacher attendance", "Teacher workflows & timetable", "Assessments and report cards", "Core school setup tools", "Basic dashboard analytics"],
  },
  {
    name: "Standard",
    tagline: "For schools that need deeper operations visibility.",
    featured: true,
    bullets: ["Everything in Starter", "Full student academic history", "Fees, billing & payment tracking", "Advanced admin control panel", "Multi-term data management", "Priority support"],
  },
];

const faqs = [
  { q: "Do I need a credit card to start?", a: "No. You can start a free trial and set up your school with no payment required upfront." },
  { q: "Can I switch plans later?", a: "Yes. You can upgrade from Starter to Standard at any time from your admin settings." },
  { q: "How long does onboarding take?", a: "Most schools are fully set up within 5–10 minutes using our self-serve wizard." },
  { q: "Is my school data safe?", a: "Yes. All data is stored securely on Firebase with role-based access control and regular backups." },
];

const Pricing = () => (
  <PublicSiteLayout>
    {/* Responsive Design System */}
    <style>{`
      @media (max-width: 960px) {
        .pricing-header { padding: 80px 24px 100px !important; }
        .pricing-grid-section { margin-top: -40px !important; }
        .pricing-grid { 
          grid-template-columns: 1fr !important; 
          gap: 40px !important; 
          max-width: 400px !important;
          margin: 0 auto !important;
        }
      }
      @media (max-width: 480px) {
        .pricing-header h1 { font-size: 34px !important; }
        .pricing-card { padding: 40px 24px !important; border-radius: 32px !important; }
        .cta-buttons { flex-direction: column; width: 100%; }
        .cta-buttons a { width: 100%; justify-content: center; }
        .faq-item { padding: 20px 0 !important; }
        .faq-question { font-size: 16px !important; }
      }
    `}</style>

    {/* Header */}
    <section className="pricing-header" style={{ background: "linear-gradient(135deg, #0B4A82 0%, #1E40AF 100%)", padding: "100px 24px 140px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-10%", right: "-10%", width: "40%", height: "80%", background: "radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)", filter: "blur(60px)" }} />
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)", margin: "0 0 16px 0" }}>Pricing Plans</p>
        <h1 style={{ fontSize: "clamp(34px, 5vw, 56px)", fontWeight: 800, color: "white", margin: "0 0 20px 0", lineHeight: 1.1, letterSpacing: "-0.02em" }}>Simple, transparent plans for every school</h1>
        <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.6 }}>Choose the plan that fits your school's needs. No hidden fees, no complexity, just results.</p>
      </motion.div>
    </section>

    {/* Plan cards */}
    <section className="pricing-grid-section" style={{ padding: "0 24px", marginTop: -80, position: "relative", zIndex: 10 }}>
      <motion.div initial="hidden" animate="show" variants={stagger} className="pricing-grid" style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 32 }}>
        {plans.map((plan) => (
          <motion.div
            key={plan.name}
            variants={fadeUp}
            whileHover={{ y: -8, boxShadow: plan.featured ? "0 30px 70px rgba(11,74,130,0.22)" : "0 20px 50px rgba(0,0,0,0.1)" }}
            transition={{ type: "spring", stiffness: 200 }}
            className="pricing-card"
            style={{
              background: "white",
              borderRadius: 36,
              padding: "48px 40px",
              border: plan.featured ? "2px solid #0B4A82" : "1.5px solid #F1F5F9",
              boxShadow: plan.featured ? "0 20px 60px rgba(11,74,130,0.15)" : "0 10px 40px rgba(0,0,0,0.05)",
              position: "relative",
              display: "flex",
              flexDirection: "column"
            }}
          >
            {plan.featured && (
              <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, #0B4A82, #1E40AF)", color: "white", fontSize: 11, fontWeight: 800, padding: "6px 20px", borderRadius: 999, letterSpacing: "0.12em", boxShadow: "0 4px 12px rgba(11,74,130,0.3)" }}>
                RECOMMENDED
              </div>
            )}
            <h2 style={{ fontSize: 32, fontWeight: 800, color: "#0f172a", margin: "0 0 10px 0" }}>{plan.name}</h2>
            <p style={{ fontSize: 16, color: "#64748B", margin: "0 0 32px 0", lineHeight: 1.6, minHeight: 48 }}>{plan.tagline}</p>
            
            <div style={{ flex: 1, marginBottom: 40 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20 }}>What's included:</p>
              {plan.bullets.map((b) => (
                <div key={b} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: plan.featured ? "#EFF6FF" : "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <Check size={14} color={plan.featured ? "#0B4A82" : "#10B981"} strokeWidth={3} />
                  </div>
                  <span style={{ fontSize: 16, color: "#334155", fontWeight: 500 }}>{b}</span>
                </div>
              ))}
            </div>

            <Link
              to="/get-started"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                padding: "16px 24px", borderRadius: 999, fontSize: 16, fontWeight: 700,
                textDecoration: "none", transition: "all 0.3s",
                background: plan.featured ? "linear-gradient(135deg, #0B4A82, #1E40AF)" : "white",
                color: plan.featured ? "white" : "#0B4A82",
                border: plan.featured ? "none" : "2px solid #E2E8F0",
                boxShadow: plan.featured ? "0 10px 25px rgba(11,74,130,0.3)" : "none",
              }}
              onMouseEnter={e => { if(!plan.featured) (e.currentTarget as HTMLElement).style.borderColor = "#0B4A82"; }}
              onMouseLeave={e => { if(!plan.featured) (e.currentTarget as HTMLElement).style.borderColor = "#E2E8F0"; }}
            >
              Get Started <ArrowRight size={18} />
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </section>

    {/* FAQ */}
    <section style={{ padding: "100px 24px", background: "white" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 60 }}>
          <div style={{ display: "inline-flex", padding: "8px 16px", borderRadius: "12px", background: "rgba(11,74,130,0.06)", color: "#0B4A82", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>
            Got Questions?
          </div>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.01em" }}>Frequently Asked Questions</h2>
        </motion.div>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={stagger}>
          {faqs.map((faq) => (
            <motion.div key={faq.q} variants={fadeUp} className="faq-item" style={{ borderBottom: "1px solid #F1F5F9", padding: "32px 0" }}>
              <p className="faq-question" style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", margin: "0 0 12px 0" }}>{faq.q}</p>
              <p style={{ fontSize: 16, color: "#64748B", margin: 0, lineHeight: 1.8 }}>{faq.a}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>

    {/* CTA */}
    <section style={{ padding: "100px 24px", background: "#F8FAFC" }}>
      <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(30px, 4vw, 48px)", fontWeight: 800, color: "#0f172a", margin: "0 0 24px 0", lineHeight: 1.1 }}>Ready to modernize your school?</h2>
        <p style={{ fontSize: 18, color: "#64748B", margin: "0 0 48px 0", lineHeight: 1.6 }}>Join forward-thinking schools across Ghana, register your school, and start your trial today. No credit card required.</p>
        <div className="cta-buttons" style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/get-started" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "18px 40px", borderRadius: 999, background: "linear-gradient(135deg, #0B4A82, #1E40AF)", color: "white", fontWeight: 700, fontSize: 16, textDecoration: "none", boxShadow: "0 10px 30px rgba(11,74,130,0.3)" }}>
            Register Your School <ArrowRight size={18} />
          </Link>
          <Link to="/book-demo" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "18px 40px", borderRadius: 999, border: "2px solid #0B4A82", color: "#0B4A82", fontWeight: 700, fontSize: 16, textDecoration: "none" }}>
            Book a Demo
          </Link>
        </div>
      </motion.div>
    </section>
  </PublicSiteLayout>
);

export default Pricing;
