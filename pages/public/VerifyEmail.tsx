import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, ArrowLeft, ShieldCheck, RefreshCw, CheckCircle2 } from "lucide-react";
import {
  ActionCodeSettings,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";
import { auth } from "../../services/firebase";
import { showToast } from "../../services/toast";
import { resendPublicVerificationEmail } from "../../services/backendApi";

const buildEmailVerificationUrl = (email: string) => {
  const params = new URLSearchParams({
    authAction: "emailVerified",
    email,
  });
  return `${window.location.origin}/?${params.toString()}`;
};

const VerifyEmail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { email?: string; password?: string } | null;

  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState("");

  const clearUnverifiedSession = async () => {
    if (auth.currentUser && !auth.currentUser.emailVerified) {
      await signOut(auth);
    }
  };

  const handleResend = async () => {
    if (!state?.email) {
      setResendError("Please go back to the registration form and try again.");
      return;
    }
    setResendLoading(true);
    setResendError("");
    try {
      const result = await resendPublicVerificationEmail({
        email: state.email.trim().toLowerCase(),
      });
      await clearUnverifiedSession();
      setResendSuccess(true);
      showToast(result.message || "Verification email sent.", { type: "success" });
    } catch (err: any) {
      if (!state.password) {
        const details = [
          err?.message || "Failed to resend verification email.",
          err?.code ? `Code: ${err.code}` : "",
          err?.status ? `Status: ${err.status}` : "",
        ].filter(Boolean).join(" ");
        setResendError(details);
        return;
      }

      try {
        const userCredential = await signInWithEmailAndPassword(auth, state.email, state.password);
        const actionSettings: ActionCodeSettings = {
          url: buildEmailVerificationUrl(state.email.trim().toLowerCase()),
          handleCodeInApp: true,
        };
        await sendEmailVerification(userCredential.user, actionSettings);
        await clearUnverifiedSession();
        setResendSuccess(true);
        showToast("Verification email sent. Please check your inbox, spam, or promotions folder.", { type: "success" });
      } catch (fallbackErr: any) {
        await clearUnverifiedSession();
        if (fallbackErr?.code === "auth/too-many-requests") {
          setResendError("Too many verification attempts. Please wait a few minutes, then click resend again.");
          return;
        }
        setResendError(
          [
            fallbackErr?.message ||
              err?.message ||
              "Failed to resend verification email.",
            fallbackErr?.code ? `Firebase code: ${fallbackErr.code}` : "",
            err?.code ? `Server code: ${err.code}` : "",
            err?.status ? `Server status: ${err.status}` : "",
          ].filter(Boolean).join(" "),
        );
      }
    } finally {
      setResendLoading(false);
    }
  };

  const [checkLoading, setCheckLoading] = useState(false);

  const checkStatus = async () => {
    setCheckLoading(true);
    setResendError("");
    try {
      // First try to use existing auth state
      if (auth.currentUser) {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          showToast("Email verified! Redirecting to login...", { type: "success" });
          window.location.href = "/login";
          return;
        }
        await clearUnverifiedSession();
      }

      // If no current user but we have credentials, try to sign in
      if (state?.email && state?.password) {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, state.email, state.password);
          await userCredential.user.reload();
          if (userCredential.user.emailVerified) {
            showToast("Email verified! Redirecting to login...", { type: "success" });
            window.location.href = "/login";
            return;
          } else {
            await clearUnverifiedSession();
            setResendError("Email not verified yet. Please check your inbox and click the verification link.");
          }
        } catch (signInErr: any) {
          console.error("Sign in failed:", signInErr);
          setResendError("Session expired. Please log in again.");
          setTimeout(() => navigate("/login"), 2000);
        }
      } else {
        setResendError("No active session found. Redirecting to login...");
        setTimeout(() => navigate("/login"), 2000);
      }
    } catch (err: any) {
      console.error("Status check failed:", err);
      setResendError("Failed to check status. Please try logging in again.");
    } finally {
      setCheckLoading(false);
    }
  };

  return (
    <PublicSiteLayout>
      <section style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)"
      }}>
        {/* Blue-White Gradient Header */}
        <div style={{
          background: "linear-gradient(135deg, #0B4A82 0%, #1E40AF 50%, #3B82F6 100%)",
          padding: "32px 24px",
          textAlign: "center",
          boxShadow: "0 4px 12px rgba(11, 74, 130, 0.15)"
        }}>
          <h1 style={{
            fontSize: 28,
            fontWeight: 800,
            color: "white",
            margin: 0,
            letterSpacing: "-0.02em"
          }}>
            Verify your School Manager GH account
          </h1>
          <p style={{
            fontSize: 14,
            color: "rgba(255, 255, 255, 0.9)",
            margin: "8px 0 0 0",
            fontWeight: 500
          }}>
            Complete your email verification to access your school workspace
          </p>
        </div>

        {/* Main Content */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px"
        }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            style={{
              maxWidth: 520,
              width: "100%",
              background: "white",
              borderRadius: 32,
              padding: "48px 40px",
              boxShadow: "0 20px 50px rgba(11,74,130,0.1)",
              border: "1.5px solid #DBEAFE",
              textAlign: "center"
            }}
          >
            {/* Icon */}
            <div style={{
              width: 120,
              height: 120,
              borderRadius: 32,
              background: "linear-gradient(135deg, #0B4A82, #0F5BA8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 28px",
              border: "2px solid #BFDBFE",
              boxShadow: "0 8px 24px rgba(11, 74, 130, 0.2)"
            }}>
              <Mail size={56} color="white" strokeWidth={1.5} />
            </div>

          <h1 style={{ fontSize: 30, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>
            Check your inbox
          </h1>

          {state?.email ? (
            <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.7, marginBottom: 8 }}>
              We sent a verification link to
            </p>
          ) : (
            <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.7, marginBottom: 8 }}>
              We've sent a verification link to your email address.
            </p>
          )}

          {state?.email && (
            <p style={{
              fontSize: 16, fontWeight: 700, color: "#0B4A82",
              background: "#EFF6FF", borderRadius: 12,
              padding: "10px 20px", marginBottom: 20,
              border: "1px solid #BFDBFE", display: "inline-block"
            }}>
              {state.email}
            </p>
          )}

          <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.7, marginBottom: 28 }}>
            Click the link in the email to activate your school workspace. Then click the button below to continue.
          </p>

          <button
            onClick={checkStatus}
            disabled={checkLoading}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: 16,
              background: "linear-gradient(135deg, #16A34A, #15803D)",
              color: "white",
              fontWeight: 700,
              border: "none",
              cursor: checkLoading ? "not-allowed" : "pointer",
              fontSize: 16,
              marginBottom: 20,
              boxShadow: "0 4px 12px rgba(22, 163, 74, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10
            }}
          >
            {checkLoading ? <RefreshCw size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
            {checkLoading ? "Checking..." : "I have verified my email"}
          </button>

          {/* Security note */}
          <div style={{
            background: "#F8FAFC",
            borderRadius: 16,
            padding: "16px 20px",
            border: "1px solid #E2E8F0",
            marginBottom: 28,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            textAlign: "left"
          }}>
            <ShieldCheck size={22} color="#0B4A82" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 13, color: "#475569", margin: 0, lineHeight: 1.6 }}>
              Can't find the email? Check your <strong>Spam</strong> or <strong>Promotions</strong> folder.
            </p>
          </div>

          {/* Resend section */}
          {resendSuccess ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "14px", borderRadius: 12, background: "#F0FDF4", border: "1px solid #BBF7D0",
              marginBottom: 20
            }}>
              <CheckCircle2 size={18} color="#16A34A" />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#15803D" }}>Verification email resent!</span>
            </div>
          ) : state?.email ? (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 10 }}>Didn't receive the email?</p>
              {resendError && (
                <p style={{ fontSize: 13, color: "#EF4444", marginBottom: 10 }}>{resendError}</p>
              )}
              <button
                onClick={handleResend}
                disabled={resendLoading}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "10px 24px", borderRadius: 999, fontSize: 14, fontWeight: 600,
                  border: "1.5px solid #DBEAFE", background: "white", color: "#0B4A82",
                  cursor: resendLoading ? "not-allowed" : "pointer",
                  opacity: resendLoading ? 0.6 : 1
                }}
              >
                <RefreshCw size={15} style={{ animation: resendLoading ? "spin 1s linear infinite" : "none" }} />
                {resendLoading ? "Resending..." : "Resend verification email"}
              </button>
            </div>
          ) : (
            resendError && <p style={{ fontSize: 13, color: "#EF4444", marginBottom: 10 }}>{resendError}</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Link
              to="/login"
              onClick={() => void signOut(auth)}
              style={{
                color: "#0B4A82",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: 15
              }}
            >
              Sign in with a different account
            </Link>

            <Link
              to="/"
              onClick={() => void signOut(auth)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                color: "#64748B",
                fontWeight: 600,
                textDecoration: "none",
                fontSize: 14
              }}
            >
              <ArrowLeft size={16} /> Back to Home
            </Link>
          </div>
        </motion.div>
        </div>
      </section>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </PublicSiteLayout>
  );
};

export default VerifyEmail;
