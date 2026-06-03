import React, { useEffect, useRef, useState, memo } from "react";
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
  { href: "/blog", label: "Blog" },
  // { href: "/demos", label: "Watch Demos" }, // Disabled until demo videos are ready
];

const whatsappHref = `https://wa.me/233549175604?text=${encodeURIComponent(
  "Hello, I would like a demo of School Manager GH.",
)}`;

const PublicSiteLayout: React.FC<PublicSiteLayoutProps> = ({ children }) => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrolledRef = useRef(false);
  const showScrollTopRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const getScrollTop = () =>
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;

    const updateScrollState = () => {
      const scrollTop = getScrollTop();
      const nextScrolled = scrollTop > 16;
      const nextShowScrollTop = scrollTop > 400;

      if (scrolledRef.current !== nextScrolled) {
        scrolledRef.current = nextScrolled;
        setScrolled(nextScrolled);
      }

      if (showScrollTopRef.current !== nextShowScrollTop) {
        showScrollTopRef.current = nextShowScrollTop;
        setShowScrollTop(nextShowScrollTop);
      }
    };

    const onScroll = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        updateScrollState();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true });
    updateScrollState();

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const scrollTop =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      const nextScrolled = scrollTop > 16;
      const nextShowScrollTop = scrollTop > 400;
      scrolledRef.current = nextScrolled;
      showScrollTopRef.current = nextShowScrollTop;
      setScrolled(nextScrolled);
      setShowScrollTop(nextShowScrollTop);
    });

    return () => window.cancelAnimationFrame(id);
  }, [location.pathname]);

  const isActive = (href: string) => location.pathname === href;

  return (
    <div className="min-h-screen font-sans relative overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif", backgroundColor: "#041222", color: "white" }}>
      
      {/* Animated background: transform-only movement keeps it smooth on slower devices. */}
      <div className="marketing-bg fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="marketing-orb marketing-orb-blue animate-blob"></div>
        <div className="marketing-orb marketing-orb-green animate-blob animation-delay-2000"></div>
        <div className="marketing-orb marketing-orb-purple animate-blob animation-delay-4000"></div>
      </div>

      {/* Top announcement bar */}
      <div style={{ display: "none", background: "linear-gradient(90deg, #0B4A82 0%, #1160A8 50%, #0B4A82 100%)", padding: "8px 16px", textAlign: "center" }}>
        <p style={{ color: "white", fontSize: "13px", fontWeight: 600, margin: 0 }}>
          🇬🇭 Built for Ghana's schools — <Link to="/get-started" style={{ color: "#93C5FD", textDecoration: "underline" }}>Register your school today</Link>
        </p>
      </div>

      {/* Navbar */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        backgroundColor: scrolled ? "rgba(4, 18, 34, 0.9)" : "rgba(4, 18, 34, 0.6)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.05)",
        boxShadow: scrolled ? "0 4px 20px rgba(0,0,0,0.3)" : "none",
        transition: "all 0.3s ease",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 80 }}>

          {/* Logo */}
          <Link to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            <img src="/logo.png" alt="School Manager GH" style={{ height: 56, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
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
                  color: isActive(item.href) ? "white" : "rgba(255,255,255,0.7)",
                  backgroundColor: isActive(item.href) ? "rgba(255,255,255,0.1)" : "transparent",
                }}
                onMouseEnter={e => { if (!isActive(item.href)) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLElement).style.color = "white"; }}
                onMouseLeave={e => { if (!isActive(item.href)) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)"; }}
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
                border: "1.5px solid rgba(255,255,255,0.2)", color: "white", textDecoration: "none",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.1)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            >
              Login
            </Link>
            <Link
              to="/book-demo"
              style={{
                padding: "11px 24px", borderRadius: 999, fontSize: 14, fontWeight: 800,
                background: "linear-gradient(135deg, #22D3EE 0%, #38BDF8 38%, #2563EB 100%)",
                color: "white", textDecoration: "none",
                display: "flex", alignItems: "center", gap: 8,
                boxShadow: "0 12px 28px rgba(56,189,248,0.32)",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px) scale(1.02)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 18px 38px rgba(56,189,248,0.44)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 28px rgba(56,189,248,0.32)"; }}
            >
              Book Free Demo <ArrowRight size={15} />
            </Link>
            <Link
              to="/get-started"
              style={{
                padding: "10px 18px", borderRadius: 999, fontSize: 14, fontWeight: 700,
                border: "1.5px solid rgba(255,255,255,0.2)", color: "white", textDecoration: "none",
                background: "rgba(255,255,255,0.06)",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.06)"; }}
            >
              Register Your School
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(p => !p)}
            style={{
              display: "none",
              width: 44, height: 44, borderRadius: 12,
              border: "1.5px solid rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.05)",
              color: "white", cursor: "pointer", alignItems: "center", justifyContent: "center",
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
              style={{ overflow: "hidden", borderTop: "1px solid rgba(255,255,255,0.1)", backgroundColor: "#041222" }}
            >
              <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
                {navLinks.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    style={{
                      padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 600,
                      color: isActive(item.href) ? "white" : "rgba(255,255,255,0.7)",
                      backgroundColor: isActive(item.href) ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
                      textDecoration: "none",
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
                <Link to="/login" style={{ padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "white", border: "1.5px solid rgba(255,255,255,0.2)", textDecoration: "none", textAlign: "center" }}>Login</Link>
                <Link
                  to="/book-demo"
                  style={{
                    padding: "14px 16px", borderRadius: 12, fontWeight: 800,
                    background: "linear-gradient(135deg, #22D3EE 0%, #38BDF8 38%, #2563EB 100%)",
                    color: "white", textDecoration: "none", textAlign: "center", fontSize: 14,
                  }}
                >
                  Book Free Demo
                </Link>
                <Link
                  to="/get-started"
                  style={{
                    padding: "13px 16px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                    background: "rgba(255,255,255,0.06)",
                    border: "1.5px solid rgba(255,255,255,0.18)",
                    color: "white", textDecoration: "none", textAlign: "center",
                  }}
                >
                  Register Your School
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <style>{`
        select option {
          background-color: #041222;
          color: white;
        }
        @keyframes blobBlue {
          0% { transform: translate3d(-4vw, -2vh, 0) scale(1); }
          35% { transform: translate3d(12vw, 7vh, 0) scale(1.08); }
          70% { transform: translate3d(2vw, 18vh, 0) scale(0.96); }
          100% { transform: translate3d(-7vw, 5vh, 0) scale(1.04); }
        }
        @keyframes blobGreen {
          0% { transform: translate3d(4vw, 2vh, 0) scale(1); }
          40% { transform: translate3d(-10vw, 10vh, 0) scale(1.06); }
          75% { transform: translate3d(-4vw, -8vh, 0) scale(0.98); }
          100% { transform: translate3d(7vw, 4vh, 0) scale(1.03); }
        }
        @keyframes blobPurple {
          0% { transform: translate3d(0, 5vh, 0) scale(1); }
          45% { transform: translate3d(10vw, -7vh, 0) scale(1.07); }
          80% { transform: translate3d(-8vw, -3vh, 0) scale(0.97); }
          100% { transform: translate3d(4vw, 8vh, 0) scale(1.04); }
        }
        .marketing-bg {
          z-index: 0;
          overflow: hidden;
          contain: paint;
          transform: translateZ(0);
          background:
            linear-gradient(135deg, #041222 0%, #082f49 48%, #041222 100%);
        }
        .marketing-orb {
          position: absolute;
          border-radius: 9999px;
          backface-visibility: hidden;
          contain: strict;
          transform: translateZ(0);
          will-change: transform;
          opacity: 0.78;
        }
        .marketing-orb-blue {
          top: -12%;
          left: -8%;
          width: min(52vw, 520px);
          height: min(52vw, 520px);
          background: radial-gradient(circle, rgba(37,99,235,0.64) 0%, rgba(37,99,235,0.28) 42%, rgba(37,99,235,0) 70%);
          animation: blobBlue 20s infinite alternate ease-in-out;
        }
        .marketing-orb-green {
          top: 14%;
          right: -10%;
          width: min(54vw, 560px);
          height: min(54vw, 560px);
          background: radial-gradient(circle, rgba(16,185,129,0.56) 0%, rgba(16,185,129,0.24) 42%, rgba(16,185,129,0) 70%);
          animation: blobGreen 24s infinite alternate ease-in-out;
        }
        .marketing-orb-purple {
          left: 12%;
          bottom: -18%;
          width: min(56vw, 580px);
          height: min(56vw, 580px);
          background: radial-gradient(circle, rgba(147,51,234,0.52) 0%, rgba(147,51,234,0.22) 42%, rgba(147,51,234,0) 70%);
          animation: blobPurple 28s infinite alternate ease-in-out;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes whatsappPulse {
          0% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.42), 0 18px 42px rgba(0,0,0,0.34); }
          70% { box-shadow: 0 0 0 16px rgba(37, 211, 102, 0), 0 18px 42px rgba(0,0,0,0.34); }
          100% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0), 0 18px 42px rgba(0,0,0,0.34); }
        }
        .whatsapp-float {
          animation: whatsappPulse 2.4s infinite;
        }
        .whatsapp-float:hover {
          transform: translateY(-3px) scale(1.04);
          background: rgba(37, 211, 102, 0.96) !important;
        }
        @supports (content-visibility: auto) {
          .marketing-main > section:not(:first-child) {
            content-visibility: auto;
            contain-intrinsic-size: 760px;
          }
        }
        @media (max-width: 1024px) {
          .desktop-nav, .desktop-ctas { display: none !important; }
          .mobile-toggle { display: flex !important; }
          .marketing-orb {
            opacity: 0.56;
          }
          .marketing-orb-blue { width: 360px; height: 360px; }
          .marketing-orb-green { width: 390px; height: 390px; }
          .marketing-orb-purple { width: 420px; height: 420px; }
          header {
            backdrop-filter: blur(10px) !important;
            -webkit-backdrop-filter: blur(10px) !important;
          }
        }
        @media (max-width: 640px) {
          .marketing-bg {
            background:
              linear-gradient(135deg, #041222 0%, #082f49 48%, #041222 100%);
          }
          .marketing-orb {
            opacity: 0.44;
          }
          .marketing-orb-blue { width: 280px; height: 280px; }
          .marketing-orb-green { width: 300px; height: 300px; }
          .marketing-orb-purple { width: 320px; height: 320px; }
        }
        @media (max-width: 640px), (pointer: coarse) {
          .marketing-orb-blue { animation-duration: 28s; }
          .marketing-orb-green { animation-duration: 32s; }
          .marketing-orb-purple { animation-duration: 36s; }
        }
        @media (max-width: 640px) {
          .footer-grid { grid-template-columns: 1fr !important; gap: 32px !important; text-align: center; }
          .footer-branding { grid-column: span 1 !important; }
          .footer-branding div { justify-content: center !important; }
          .footer-branding p { margin: 0 auto 20px auto !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-blob {
            animation-duration: 48s;
          }
          .whatsapp-float {
            animation-duration: 4s;
          }
        }
      `}</style>

      <main className="relative marketing-main" style={{ zIndex: 10 }}>{children}</main>

      {/* Footer */}
      <footer style={{ background: "linear-gradient(180deg, rgba(4, 18, 34, 0.8) 0%, rgba(4, 18, 34, 1) 100%)", color: "white", paddingTop: 64, paddingBottom: 40, position: "relative", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
          <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 48, marginBottom: 48 }}>

            <div className="footer-branding" style={{ gridColumn: "span 2" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                <img src="/logo.png" alt="School Manager GH" style={{ height: 48, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.7)", maxWidth: 340, margin: "0 0 20px 0" }}>
                The premium school operations platform built for Ghanaian schools. Attendance, reports, fees, and parent engagement — all in one place.
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>🇬🇭 Proudly built for Ghana</p>
            </div>

            <div>
              <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, color: "rgba(255,255,255,0.9)" }}>Platform</p>
              {[["Home", "/"], ["Features", "/features"], ["Pricing", "/pricing"], ["Book Free Demo", "/book-demo"], ["Register Your School", "/get-started"]].map(([label, href]) => (
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
              <a href="mailto:info@schoolmanagergh.com" style={{ display: "block", fontSize: 14, color: "rgba(255,255,255,0.6)", textDecoration: "none", marginBottom: 10 }}>info@schoolmanagergh.com</a>
              <a href="tel:+233419175604" style={{ display: "block", fontSize: 14, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>+233 419 175 604</a>
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0 }}>© {new Date().getFullYear()} School Manager GH. All rights reserved.</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0 }}>Built with &hearts; for Ghanaian schools</p>
          </div>
        </div>
      </footer>

      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        className="whatsapp-float"
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          width: 62,
          height: 62,
          borderRadius: 999,
          background: "rgba(37, 211, 102, 0.9)",
          color: "white",
          border: "1px solid rgba(255,255,255,0.34)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 120,
          transition: "transform 180ms ease, background 180ms ease",
          textDecoration: "none",
        }}
      >
        <svg
          width="31"
          height="31"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M16.04 3.2C9.02 3.2 3.32 8.86 3.32 15.82c0 2.24.6 4.43 1.74 6.35L3.2 28.8l6.83-1.79a12.8 12.8 0 0 0 6.01 1.5c7.02 0 12.72-5.66 12.72-12.62S23.06 3.2 16.04 3.2Zm0 23.18c-1.9 0-3.76-.51-5.38-1.48l-.39-.23-4.05 1.06 1.08-3.93-.26-.41a10.38 10.38 0 0 1-1.6-5.57c0-5.79 4.75-10.49 10.6-10.49s10.6 4.7 10.6 10.49-4.75 10.56-10.6 10.56Zm5.8-7.85c-.32-.16-1.88-.92-2.17-1.03-.29-.1-.5-.16-.72.16-.21.32-.82 1.03-1.01 1.24-.19.21-.37.24-.69.08-.32-.16-1.35-.49-2.57-1.57-.95-.84-1.59-1.89-1.78-2.21-.19-.32-.02-.49.14-.65.15-.15.32-.37.48-.56.16-.19.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.72-.98-2.36-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.08-1.12 2.64s1.15 3.07 1.3 3.28c.16.21 2.27 3.43 5.5 4.81.77.33 1.37.53 1.84.68.77.24 1.47.21 2.02.13.62-.09 1.88-.76 2.14-1.49.27-.74.27-1.37.19-1.5-.08-.13-.29-.21-.61-.37Z"
          />
        </svg>
      </a>

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
              bottom: 96,
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
