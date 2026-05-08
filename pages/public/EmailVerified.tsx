import React, { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight, Home, LogIn, Loader2, X } from "lucide-react";

import { applyActionCode } from "firebase/auth";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";
import { auth } from "../../services/firebase";
import { showToast } from "../../services/toast";

const fadeUp = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.55 } } };
const scaleIn = { hidden: { opacity: 0, scale: 0.8 }, show: { opacity: 1, scale: 1, transition: { duration: 0.5, delay: 0.2 } } };

const getVerificationParams = (searchParams: URLSearchParams) => {
  const hashSearch = window.location.hash.split("?")[1] || "";
  const hashParams = new URLSearchParams(hashSearch);
  const browserParams = new URLSearchParams(window.location.search);

  return {
    email:
      searchParams.get("email") ||
      hashParams.get("email") ||
      browserParams.get("email") ||
      "",
    oobCode:
      searchParams.get("oobCode") ||
      hashParams.get("oobCode") ||
      browserParams.get("oobCode") ||
      "",
  };
};

const EmailVerified = () => {
  const [searchParams] = useSearchParams();
  const { email, oobCode } = getVerificationParams(searchParams);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    setVerifying(true);
    const verifyEmail = async () => {
      try {
        if (oobCode) {
          console.log("[EmailVerified] Attempting to verify email with oobCode");
          await applyActionCode(auth, oobCode);
        } else if (auth.currentUser) {
          await auth.currentUser.reload();
          if (!auth.currentUser.emailVerified) {
            throw new Error("missing-action-code");
          }
        } else {
          throw new Error("missing-action-code");
        }

        await auth.currentUser?.reload();
        setVerified(true);
        setVerifying(false);
        showToast("Email verified successfully!", { type: "success" });
      } catch (err: any) {
        console.error("[EmailVerified] Email verification failed:", err);
        setVerifying(false);
        if (err.message === "missing-action-code") {
          setError("Invalid verification link. Please check your email and try again.");
        } else if (err.code === "auth/invalid-action-code" || err.code === "auth/expired-action-code") {
          setError("This verification link has expired or already been used.");
        } else {
          setError("Failed to verify email. Please try logging in.");
        }
      }
    };

    verifyEmail();
  }, [oobCode]);

  // Show loading state while verifying
  if (verifying) {
    return (
      <PublicSiteLayout>
        <section style={{
          minHeight: "80vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 24px",
          background: "linear-gradient(135deg, #F0FDF4 0%, #EFF6FF 50%, #F0FDF4 100%)",
        }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              maxWidth: 600,
              width: "100%",
              background: "white",
              borderRadius: 32,
              padding: "64px 48px",
              boxShadow: "0 25px 60px rgba(11,74,130,0.1)",
              border: "1.5px solid #BBF7D0",
              textAlign: "center",
            }}
          >
            <Loader2 size={60} color="#0B4A82" style={{ animation: "spin 1s linear infinite" }} />
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", marginTop: 24 }}>
              Verifying your email...
            </h1>
            <p style={{ fontSize: 16, color: "#475569", marginTop: 12 }}>
              Please wait while we verify your email address.
            </p>
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </motion.div>
        </section>
      </PublicSiteLayout>
    );
  }

  // Show error state
  if (error) {
    return (
      <PublicSiteLayout>
        {/* Responsive Design System */}
        <style>{`
          @media (max-width: 768px) {
            .verified-card { padding: 40px 24px !important; border-radius: 24px !important; }
            .verified-title { font-size: 28px !important; }
            .verified-buttons { flex-direction: column !important; width: 100% !important; }
            .verified-buttons a { width: 100% !important; justify-content: center !important; }
          }
          @media (max-width: 480px) {
            .verified-title { font-size: 24px !important; }
            .verified-subtitle { font-size: 15px !important; }
          }
        `}</style>

        <section style={{
          minHeight: "80vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 24px",
          background: "linear-gradient(135deg, #FEF2F2 0%, #EFF6FF 50%, #FEF2F2 100%)",
        }}>
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="verified-card"
            style={{
              maxWidth: 600,
              width: "100%",
              background: "white",
              borderRadius: 32,
              padding: "64px 48px",
              boxShadow: "0 25px 60px rgba(11,74,130,0.1)",
              border: "1.5px solid #FECACA",
              textAlign: "center",
            }}
          >
            {/* Error Icon */}
            <motion.div
              initial="hidden"
              animate="show"
              variants={scaleIn}
              style={{
                width: 120,
                height: 120,
                borderRadius: 999,
                background: "linear-gradient(135deg, #DC2626, #991B1B)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 32px",
                boxShadow: "0 12px 32px rgba(220,38,38,0.3)",
              }}
            >
              <X size={60} color="white" strokeWidth={2} />
            </motion.div>

            {/* Error Message */}
            <motion.div variants={fadeUp}>
              <h1
                className="verified-title"
                style={{
                  fontSize: "clamp(28px, 4vw, 40px)",
                  fontWeight: 800,
                  color: "#0f172a",
                  margin: "0 0 16px 0",
                  letterSpacing: "-0.01em",
                }}
              >
                Verification Failed
              </h1>
              <p
                className="verified-subtitle"
                style={{
                  fontSize: 17,
                  color: "#475569",
                  lineHeight: 1.7,
                  margin: "0 0 40px 0",
                }}
              >
                {error}
              </p>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              variants={fadeUp}
              className="verified-buttons"
              style={{
                display: "flex",
                gap: 16,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Link
                to="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 28px",
                  borderRadius: 999,
                  background: "white",
                  color: "#0B4A82",
                  fontWeight: 700,
                  fontSize: 15,
                  textDecoration: "none",
                  border: "2px solid #DBEAFE",
                  transition: "all 0.3s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#EFF6FF"; (e.currentTarget as HTMLElement).style.borderColor = "#BFDBFE"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "white"; (e.currentTarget as HTMLElement).style.borderColor = "#DBEAFE"; }}
              >
                <Home size={18} /> Home
              </Link>
              <Link
                to="/login"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 28px",
                  borderRadius: 999,
                  background: "linear-gradient(135deg, #0B4A82, #1E40AF)",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 15,
                  textDecoration: "none",
                  boxShadow: "0 8px 24px rgba(11,74,130,0.3)",
                  transition: "all 0.3s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(11,74,130,0.4)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(11,74,130,0.3)"; }}
              >
                <LogIn size={18} /> Login to Dashboard <ArrowRight size={16} />
              </Link>
            </motion.div>

            {/* Footer Note */}
            <motion.p
              variants={fadeUp}
              style={{
                fontSize: 13,
                color: "#94A3B8",
                marginTop: 32,
                marginBottom: 0,
              }}
            >
              Welcome to School Manager GH 🇬🇭 — Powering Ghanaian schools
            </motion.p>
          </motion.div>
        </section>
      </PublicSiteLayout>
    );
  }

  // Show success state (verified)
  return (
    <PublicSiteLayout>
      {/* Responsive Design System */}
      <style>{`
        @media (max-width: 768px) {
          .verified-card { padding: 40px 24px !important; border-radius: 24px !important; }
          .verified-title { font-size: 28px !important; }
          .verified-buttons { flex-direction: column !important; width: 100% !important; }
          .verified-buttons a { width: 100% !important; justify-content: center !important; }
        }
        @media (max-width: 480px) {
          .verified-title { font-size: 24px !important; }
          .verified-subtitle { font-size: 15px !important; }
        }
      `}</style>

      <section style={{
        minHeight: "80vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 24px",
        background: "linear-gradient(135deg, #F0FDF4 0%, #EFF6FF 50%, #F0FDF4 100%)",
      }}>
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="verified-card"
          style={{
            maxWidth: 600,
            width: "100%",
            background: "white",
            borderRadius: 32,
            padding: "64px 48px",
            boxShadow: "0 25px 60px rgba(11,74,130,0.1)",
            border: "1.5px solid #BBF7D0",
            textAlign: "center",
          }}
        >
          {/* Animated Success Icon */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={scaleIn}
            style={{
              width: 120,
              height: 120,
              borderRadius: 999,
              background: "linear-gradient(135deg, #16A34A, #15803D)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 32px",
              boxShadow: "0 12px 32px rgba(22,163,74,0.3)",
            }}
          >
            <CheckCircle2 size={60} color="white" strokeWidth={2} />
          </motion.div>

          {/* Success Message */}
          <motion.div variants={fadeUp}>
            <h1
              className="verified-title"
              style={{
                fontSize: "clamp(28px, 4vw, 40px)",
                fontWeight: 800,
                color: "#0f172a",
                margin: "0 0 16px 0",
                letterSpacing: "-0.01em",
              }}
            >
              Email Verified!
            </h1>
            <p
              className="verified-subtitle"
              style={{
                fontSize: 17,
                color: "#475569",
                lineHeight: 1.7,
                margin: "0 0 12px 0",
              }}
            >
              Your email has been successfully verified. Your School Manager GH account is now fully activated.
            </p>
            {email && (
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 999,
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                marginBottom: 40,
              }}>
                <CheckCircle2 size={16} color="#16A34A" />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#15803D" }}>
                  {email}
                </span>
              </div>
            )}
          </motion.div>

          {/* Next Steps */}
          <motion.div
            variants={fadeUp}
            style={{
              background: "#F8FAFC",
              borderRadius: 20,
              padding: "24px",
              border: "1px solid #E2E8F0",
              marginBottom: 40,
              textAlign: "left",
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 16px 0" }}>
              What's Next?
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "Log in to your dashboard",
                "Set up your school profile",
                "Add teachers and students",
                "Start managing your school",
              ].map((step, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: "#EFF6FF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#0B4A82" }}>{idx + 1}</span>
                  </div>
                  <span style={{ fontSize: 15, color: "#334155", fontWeight: 500 }}>{step}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            variants={fadeUp}
            className="verified-buttons"
            style={{
              display: "flex",
              gap: 16,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              to="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 28px",
                borderRadius: 999,
                background: "white",
                color: "#0B4A82",
                fontWeight: 700,
                fontSize: 15,
                textDecoration: "none",
                border: "2px solid #DBEAFE",
                transition: "all 0.3s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#EFF6FF"; (e.currentTarget as HTMLElement).style.borderColor = "#BFDBFE"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "white"; (e.currentTarget as HTMLElement).style.borderColor = "#DBEAFE"; }}
            >
              <Home size={18} /> Home
            </Link>
            <Link
              to="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 28px",
                borderRadius: 999,
                background: "linear-gradient(135deg, #0B4A82, #1E40AF)",
                color: "white",
                fontWeight: 700,
                fontSize: 15,
                textDecoration: "none",
                boxShadow: "0 8px 24px rgba(11,74,130,0.3)",
                transition: "all 0.3s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(11,74,130,0.4)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(11,74,130,0.3)"; }}
            >
              <LogIn size={18} /> Login to Dashboard <ArrowRight size={16} />
            </Link>
          </motion.div>

          {/* Footer Note */}
          <motion.p
            variants={fadeUp}
            style={{
              fontSize: 13,
              color: "#94A3B8",
              marginTop: 32,
              marginBottom: 0,
            }}
          >
            Welcome to School Manager GH 🇬🇭 — Powering Ghanaian schools
          </motion.p>
        </motion.div>
      </section>
    </PublicSiteLayout>
  );
};

export default EmailVerified;
