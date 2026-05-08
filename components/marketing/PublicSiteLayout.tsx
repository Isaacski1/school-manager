import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Menu, X, ArrowUp } from "lucide-react";
import schoolLogo from "../../logo/apple-icon-180x180.png";

type PublicSiteLayoutProps = {
  children: React.ReactNode;
};

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/book-demo", label: "Book Demo" },
];

const PublicSiteLayout: React.FC<PublicSiteLayoutProps> = ({ children }) => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 16);
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const isActive = (href: string) => location.pathname === href;

  return (
    <div className="min-h-screen font-sans" style={{ fontFamily: "'Inter', system-ui, sans-serif", backgroundColor: "#f8fafc", overflowX: "hidden" }}>

      {/* Top announcement bar */}
      <div style={{ background: "linear-gradient(90deg, #0B4A82 0%, #1160A8 50%, #0B4A82 100%)", padding: "8px 16px", textAlign: "center" }}>
        <p style={{ color: "white", fontSize: "13px", fontWeight: 600, margin: 0 }}>
          🇬🇭 Built for Ghana's schools — <Link to="/get-started" style={{ color: "#93C5FD", textDecoration: "underline" }}>Register your school today</Link>
        </p>
      </div>

      {/* Navbar */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        backgroundColor: scrolled ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: scrolled ? "1px solid #DBEAFE" : "1px solid rgba(219,234,254,0.6)",
        boxShadow: scrolled ? "0 1px 24px rgba(11,74,130,0.08)" : "none",
        transition: "all 0.3s ease",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 80 }}>

          {/* Logo */}
          <Link to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            <img src="/logo.png" alt="School Manager GH" style={{ height: 56, objectFit: "contain" }} />
          </Link>

          {/* Desktop Nav */}
          <nav style={{ display: "flex", alignItems: "center", gap: 4 }} className="desktop-nav">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  transition: "all 0.2s",
                  color: isActive(item.href) ? "#0B4A82" : "#475569",
                  backgroundColor: isActive(item.href) ? "#EFF6FF" : "transparent",
                }}
                onMouseEnter={e => { if (!isActive(item.href)) (e.currentTarget as HTMLElement).style.backgroundColor = "#F1F5F9"; }}
                onMouseLeave={e => { if (!isActive(item.href)) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }} className="desktop-ctas">
            <Link
              to="/login"
              style={{
                padding: "9px 20px", borderRadius: 999, fontSize: 14, fontWeight: 600,
                border: "1.5px solid #DBEAFE", color: "#0B4A82", textDecoration: "none",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#EFF6FF"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            >
              Login
            </Link>
            <Link
              to="/get-started"
              style={{
                padding: "10px 22px", borderRadius: 999, fontSize: 14, fontWeight: 700,
                background: "linear-gradient(135deg, #0B4A82 0%, #1160A8 100%)",
                color: "white", textDecoration: "none",
                display: "flex", alignItems: "center", gap: 8,
                boxShadow: "0 4px 16px rgba(11,74,130,0.3)",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(11,74,130,0.4)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(11,74,130,0.3)"; }}
            >
              Register Your School <ArrowRight size={15} />
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(p => !p)}
            style={{
              display: "none",
              width: 44, height: 44, borderRadius: 12,
              border: "1.5px solid #DBEAFE", backgroundColor: "white",
              color: "#0B4A82", cursor: "pointer", alignItems: "center", justifyContent: "center",
            }}
            className="mobile-toggle"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              style={{ overflow: "hidden", borderTop: "1px solid #DBEAFE", backgroundColor: "white" }}
            >
              <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
                {navLinks.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    style={{
                      padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 600,
                      color: isActive(item.href) ? "#0B4A82" : "#475569",
                      backgroundColor: isActive(item.href) ? "#EFF6FF" : "#F8FAFC",
                      textDecoration: "none",
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
                <Link to="/login" style={{ padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "#0B4A82", border: "1.5px solid #DBEAFE", textDecoration: "none", textAlign: "center" }}>Login</Link>
                <Link
                  to="/get-started"
                  style={{
                    padding: "13px 16px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                    background: "linear-gradient(135deg, #0B4A82 0%, #1160A8 100%)",
                    color: "white", textDecoration: "none", textAlign: "center",
                  }}
                >
                  Register Your School →
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <style>{`
        @media (max-width: 1024px) {
          .desktop-nav, .desktop-ctas { display: none !important; }
          .mobile-toggle { display: flex !important; }
        }
        @media (max-width: 640px) {
          .footer-grid { grid-template-columns: 1fr !important; gap: 32px !important; text-align: center; }
          .footer-branding { grid-column: span 1 !important; }
          .footer-branding div { justify-content: center !important; }
          .footer-branding p { margin: 0 auto 20px auto !important; }
        }
      `}</style>

      <main>{children}</main>

      {/* Footer */}
      <footer style={{ background: "linear-gradient(180deg, #0B4A82 0%, #082E52 100%)", color: "white", paddingTop: 64, paddingBottom: 40 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 48, marginBottom: 48 }}>

            <div className="footer-branding" style={{ gridColumn: "span 2" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                <img src="/logo.png" alt="School Manager GH" style={{ height: 48, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.7)", maxWidth: 340, margin: "0 0 20px 0" }}>
                The premium school operations platform built for Ghanaian schools. Attendance, reports, assessments, and fee management — all in one place.
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>🇬🇭 Proudly built for Ghana</p>
            </div>

            <div>
              <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, color: "rgba(255,255,255,0.9)" }}>Platform</p>
              {[["Home", "/"], ["Pricing", "/pricing"], ["Book Demo", "/book-demo"], ["Register Your School", "/get-started"]].map(([label, href]) => (
                <Link key={href} to={href} style={{ display: "block", fontSize: 14, color: "rgba(255,255,255,0.6)", textDecoration: "none", marginBottom: 10, transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "white"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"}
                >
                  {label}
                </Link>
              ))}
            </div>

            <div>
              <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, color: "rgba(255,255,255,0.9)" }}>Contact</p>
              {[
                ["Login to App", "/login"],
              ].map(([label, href]) => (
                <Link key={href} to={href} style={{ display: "block", fontSize: 14, color: "rgba(255,255,255,0.6)", textDecoration: "none", marginBottom: 10 }}>{label}</Link>
              ))}
              <a href="mailto:isaacskiwebdev@gmail.com" style={{ display: "block", fontSize: 14, color: "rgba(255,255,255,0.6)", textDecoration: "none", marginBottom: 10 }}>isaacskiwebdev@gmail.com</a>
              <a href="tel:+233419175604" style={{ display: "block", fontSize: 14, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>+233 419 175 604</a>
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0 }}>© {new Date().getFullYear()} School Manager GH. All rights reserved.</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0 }}>Built with &hearts; for Ghanaian schools</p>
          </div>
        </div>
      </footer>

      {/* Scroll to Top Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              width: 56,
              height: 56,
              borderRadius: 999,
              background: "linear-gradient(135deg, #0B4A82, #1E40AF)",
              color: "white",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(11,74,130,0.3)",
              transition: "all 0.3s",
              zIndex: 100,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.1)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(11,74,130,0.4)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(11,74,130,0.3)"; }}
            aria-label="Scroll to top"
          >
            <ArrowUp size={24} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PublicSiteLayout;
