import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { auth } from "../services/firebase";
import {
  getAdminMfaPolicyStatus,
  logSecurityLogin,
} from "../services/backendApi";
import {
  getMultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { AlertCircle, ArrowLeft, CheckCircle, Eye, EyeOff } from "lucide-react";
import schoolLogo from "../logo/apple-icon-180x180.png";

const Login = () => {
  const {
    isAuthenticated,
    loading: authLoading,
    error: globalError,
  } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  // Forgot Password State
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState("");

  // MFA Sign-in State
  const [mfaResolver, setMfaResolver] = useState<any | null>(null);
  const [mfaSelectedHintIndex, setMfaSelectedHintIndex] = useState(0);
  const [mfaVerificationId, setMfaVerificationId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const isMfaFlow = Boolean(mfaResolver);
  const mfaHints = useMemo(() => mfaResolver?.hints || [], [mfaResolver]);
  const selectedMfaHint = useMemo(
    () => mfaHints[mfaSelectedHintIndex] || null,
    [mfaHints, mfaSelectedHintIndex],
  );
  const selectedMfaHintIsPhone =
    selectedMfaHint?.factorId === PhoneMultiFactorGenerator.FACTOR_ID;

  const resetMfaFlow = () => {
    setMfaResolver(null);
    setMfaSelectedHintIndex(0);
    setMfaVerificationId("");
    setMfaCode("");
    setMfaError("");
    setMfaLoading(false);
  };

  const getMfaHintLabel = (hint: any, index: number) => {
    if (!hint) return `Factor ${index + 1}`;
    const factorType =
      hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID
        ? "SMS"
        : hint.factorId || "Second factor";
    const displayName = hint.displayName ? ` (${hint.displayName})` : "";
    const phone = hint.phoneNumber ? ` ${hint.phoneNumber}` : "";
    return `${factorType}${displayName}${phone}`.trim();
  };

  const getRecaptchaVerifier = () => {
    if (recaptchaVerifierRef.current) return recaptchaVerifierRef.current;
    const verifier = new RecaptchaVerifier(auth, "mfa-recaptcha-container", {
      size: "invisible",
    });
    recaptchaVerifierRef.current = verifier;
    return verifier;
  };

  const evaluateAdminMfaPolicy = async () => {
    const policy = await getAdminMfaPolicyStatus();
    if (!policy.required || policy.compliant) return;
    throw new Error(
      policy.message ||
        "Admin MFA policy requires second-factor enrollment for your role.",
    );
  };

  const isMfaEnrollmentRequiredError = (err: any) => {
    const message = String(err?.message || "").toLowerCase();
    return (
      message.includes("requires mfa enrollment") ||
      message.includes("requires second-factor enrollment") ||
      message.includes("enroll at least one second factor")
    );
  };

  const safeLogSecurityLogin = async (payload: {
    status: "SUCCESS" | "FAILED";
    email?: string | null;
    errorCode?: string | null;
    userAgent?: string | null;
  }) => {
    try {
      await logSecurityLogin(payload);
    } catch (logError) {
      console.warn("Security login logging failed", logError);
    }
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    return () => {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError("");
    setMfaError("");
    let firstFactorSignedIn = false;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      firstFactorSignedIn = true;
      try {
        await evaluateAdminMfaPolicy();
      } catch (policyError: any) {
        if (isMfaEnrollmentRequiredError(policyError)) {
          throw policyError;
        }
        // Do not block sign-in when backend policy lookup is unreachable.
        console.warn(
          "Skipping admin MFA policy check due to backend error",
          policyError,
        );
      }

      await safeLogSecurityLogin({
        status: "SUCCESS",
        email,
        userAgent: navigator.userAgent,
      });
      // AuthContext listener will handle the redirection via the useEffect above
    } catch (err: any) {
      console.error(err);

      if (err?.code === "auth/multi-factor-auth-required") {
        const resolver = getMultiFactorResolver(auth, err);
        if (!resolver?.hints?.length) {
          setFormError(
            "This account requires MFA, but no enrolled second factor was found.",
          );
          setLoading(false);
          return;
        }

        setMfaResolver(resolver);
        setMfaSelectedHintIndex(0);
        setMfaVerificationId("");
        setMfaCode("");
        setMfaError("");
        setFormError("");
        setLoading(false);
        return;
      }

      let msg = "Failed to sign in.";
      if (
        err?.code === "auth/invalid-credential" ||
        err?.code === "auth/user-not-found" ||
        err?.code === "auth/wrong-password"
      ) {
        msg = "Invalid email or password.";
      } else if (err?.code === "auth/too-many-requests") {
        msg = "Too many failed attempts. Please try again later.";
      } else if (isMfaEnrollmentRequiredError(err)) {
        msg = err.message;
      }

      if (firstFactorSignedIn && isMfaEnrollmentRequiredError(err)) {
        try {
          await signOut(auth);
        } catch {
          // no-op
        }
      }

      await safeLogSecurityLogin({
        status: "FAILED",
        email,
        errorCode: err?.code || "login_failed",
        userAgent: navigator.userAgent,
      });
      setFormError(msg);
      setLoading(false);
    }
  };

  const handleSendMfaCode = async () => {
    if (!mfaResolver || !selectedMfaHint) {
      setMfaError("No second factor is available for this login.");
      return;
    }

    if (!selectedMfaHintIsPhone) {
      setMfaError(
        "This factor type is not supported in this screen yet. Use an SMS factor or Firebase admin tooling.",
      );
      return;
    }

    setMfaLoading(true);
    setMfaError("");
    try {
      const phoneInfoOptions = {
        multiFactorHint: selectedMfaHint,
        session: mfaResolver.session,
      };
      const verifier = getRecaptchaVerifier();
      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneAuthProvider.verifyPhoneNumber(
        phoneInfoOptions as any,
        verifier,
      );
      setMfaVerificationId(verificationId);
      setMfaCode("");
    } catch (err: any) {
      console.error("MFA code send failed", err);
      setMfaError(
        err?.message || "Failed to send verification code. Please try again.",
      );
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerifyMfaCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaResolver || !mfaVerificationId) {
      setMfaError("Verification session is missing. Please request a new code.");
      return;
    }
    if (!mfaCode.trim()) {
      setMfaError("Enter the verification code.");
      return;
    }

    setMfaLoading(true);
    setMfaError("");
    try {
      const credential = PhoneAuthProvider.credential(
        mfaVerificationId,
        mfaCode.trim(),
      );
      const assertion = PhoneMultiFactorGenerator.assertion(credential);
      await mfaResolver.resolveSignIn(assertion);

      await logSecurityLogin({
        status: "SUCCESS",
        email,
        userAgent: navigator.userAgent,
      });

      resetMfaFlow();
    } catch (err: any) {
      console.error("MFA verification failed", err);
      let msg = "Could not verify the security code.";
      if (
        err?.code === "auth/invalid-verification-code" ||
        err?.code === "auth/code-expired"
      ) {
        msg = "Invalid or expired verification code. Request a new one.";
      }
      setMfaError(msg);
      await safeLogSecurityLogin({
        status: "FAILED",
        email,
        errorCode: err?.code || "mfa_verification_failed",
        userAgent: navigator.userAgent,
      });
    } finally {
      setMfaLoading(false);
    }
  };

  const cancelMfaFlow = () => {
    resetMfaFlow();
    setFormError("");
    setLoading(false);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError("");
    setResetSuccess("");

    if (!email) {
      setFormError("Please enter your email address to reset password.");
      setLoading(false);
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setResetSuccess("Password reset link has been sent to your email.");
      setFormError("");
    } catch (err: any) {
      console.error(err);
      let msg = "Failed to send reset email.";
      if (err.code === "auth/user-not-found") {
        msg = "No account found with this email address.";
      } else if (err.code === "auth/invalid-email") {
        msg = "Please enter a valid email address.";
      }
      setFormError(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleResetMode = () => {
    setIsResetting(!isResetting);
    setFormError("");
    setResetSuccess("");
    setMfaError("");
    // Keep email if typed, clear password
    setPassword("");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-red-900 animate-pulse font-semibold">
          Loading School Manager GH...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#E6F0FA] via-[#E6F0FA] to-[#E6F0FA] flex items-center justify-center p-4">
      <style>{`
        @keyframes loginGradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes floatBlob {
          0% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(20px, -30px, 0) scale(1.08); }
          100% { transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes floatBlobReverse {
          0% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-25px, 25px, 0) scale(1.05); }
          100% { transform: translate3d(0, 0, 0) scale(1); }
        }
      `}</style>
      <div
        className="absolute inset-0 opacity-70 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(120deg, rgba(11,143,165,0.14), rgba(216,241,244,0.35), rgba(4,107,126,0.12))",
          backgroundSize: "200% 200%",
          animation: "loginGradientShift 18s ease-in-out infinite",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute -top-24 -left-24 w-80 h-80 bg-[#E6F0FA]/35 rounded-full blur-3xl pointer-events-none"
        style={{ animation: "floatBlob 16s ease-in-out infinite" }}
        aria-hidden="true"
      />
      <div
        className="absolute top-1/3 -right-28 w-96 h-96 bg-[#1160A8]/25 rounded-full blur-3xl pointer-events-none"
        style={{ animation: "floatBlobReverse 20s ease-in-out infinite" }}
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-28 left-1/4 w-72 h-72 bg-[#E6F0FA]/60 rounded-full blur-3xl pointer-events-none"
        style={{ animation: "floatBlob 22s ease-in-out infinite" }}
        aria-hidden="true"
      />
      <div className="max-w-md w-full bg-white rounded-xl shadow-xl p-8 border-t-8 border-[#0B4A82]">
        <div className="text-center mb-8">
          <div className="mx-auto w-28 h-28 mb-4 relative p-2 bg-white rounded-full shadow-sm border border-[#E6F0FA]">
            <img
              src={schoolLogo}
              alt="School Manager GH Logo"
              className="w-full h-full object-contain rounded-full"
              onError={(e) => {
                // Fallback if image not found
                e.currentTarget.style.display = "none";
                e.currentTarget.parentElement!.innerHTML =
                  '<div class="w-24 h-24 bg-[#0B4A82] rounded-full flex items-center justify-center text-[#E6F0FA] font-bold border-4 border-[#1160A8] text-xs text-center p-1">School Manager GH</div>';
              }}
            />
          </div>
          <h1 className="text-2xl font-bold text-[#0B4A82] font-serif">
            School Manager GH
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            {isMfaFlow
              ? "Complete your second-factor verification"
              : isResetting
                ? "Reset your password"
                : "Sign in to manage the system"}
          </p>
        </div>

        {/* Global Configuration Error (Firestore Missing) */}
        {globalError && (
          <div className="mb-6 p-4 bg-red-50 text-red-800 text-sm rounded-lg border border-red-200 flex items-start">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block mb-1">System Error</span>
              {globalError}
            </div>
          </div>
        )}

        {/* Form Error */}
        {formError && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center">
            <AlertCircle size={16} className="mr-2 flex-shrink-0" />
            {formError}
          </div>
        )}

        {/* MFA Error */}
        {mfaError && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center">
            <AlertCircle size={16} className="mr-2 flex-shrink-0" />
            {mfaError}
          </div>
        )}

        {/* Success Message (Reset Link Sent) */}
        {resetSuccess && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-100 flex items-center">
            <CheckCircle size={16} className="mr-2 flex-shrink-0" />
            {resetSuccess}
          </div>
        )}

        {isMfaFlow ? (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Select Second Factor
              </label>
              <select
                value={mfaSelectedHintIndex}
                onChange={(e) => {
                  setMfaSelectedHintIndex(Number(e.target.value));
                  setMfaVerificationId("");
                  setMfaCode("");
                  setMfaError("");
                }}
                disabled={mfaLoading}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all"
              >
                {mfaHints.map((hint: any, index: number) => (
                  <option key={`${hint.uid || index}`} value={index}>
                    {getMfaHintLabel(hint, index)}
                  </option>
                ))}
              </select>
            </div>

            {!mfaVerificationId ? (
              <button
                type="button"
                onClick={handleSendMfaCode}
                disabled={mfaLoading || !selectedMfaHintIsPhone}
                className={`w-full py-3 px-4 bg-[#0B4A82] hover:bg-[#0B4A82] text-white font-bold rounded-lg transition-colors shadow-md flex justify-center items-center ${
                  mfaLoading || !selectedMfaHintIsPhone
                    ? "opacity-70 cursor-not-allowed"
                    : ""
                }`}
              >
                {mfaLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                    Sending code...
                  </>
                ) : (
                  "Send Verification Code"
                )}
              </button>
            ) : (
              <form onSubmit={handleVerifyMfaCode} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mfaCode}
                    onChange={(e) =>
                      setMfaCode(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all"
                    placeholder="Enter code sent to your phone"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={mfaLoading}
                  className={`w-full py-3 px-4 bg-[#0B4A82] hover:bg-[#0B4A82] text-white font-bold rounded-lg transition-colors shadow-md flex justify-center items-center ${
                    mfaLoading ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                >
                  {mfaLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                      Verifying...
                    </>
                  ) : (
                    "Verify & Sign In"
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSendMfaCode}
                  disabled={mfaLoading || !selectedMfaHintIsPhone}
                  className="w-full text-center text-sm text-[#1160A8] hover:text-[#0B4A82] font-medium"
                >
                  Resend code
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={cancelMfaFlow}
              disabled={mfaLoading}
              className="w-full text-center text-sm text-slate-600 hover:text-[#0B4A82] font-medium flex items-center justify-center mt-4"
            >
              <ArrowLeft size={16} className="mr-1" /> Back to Sign In
            </button>
          </div>
        ) : isResetting ? (
          // RESET PASSWORD FORM
          <form onSubmit={handlePasswordReset} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all"
                placeholder="Enter your registered email"
                required
              />
              <p className="text-xs text-slate-400 mt-1">
                We'll send you a link to reset your password.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 bg-[#1160A8] hover:bg-[#0B4A82] text-white font-bold rounded-lg transition-colors shadow-md flex justify-center items-center ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <button
              type="button"
              onClick={toggleResetMode}
              className="w-full text-center text-sm text-slate-600 hover:text-[#0B4A82] font-medium flex items-center justify-center mt-4"
            >
              <ArrowLeft size={16} className="mr-1" /> Back to Sign In
            </button>
          </form>
        ) : (
          // LOGIN FORM
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all"
                placeholder="e.g., admin@school.com"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-semibold text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={toggleResetMode}
                  className="text-xs text-[#1160A8] hover:text-[#0B4A82] font-medium"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-slate-500 hover:text-[#0B4A82]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 bg-[#0B4A82] hover:bg-[#0B4A82] text-white font-bold rounded-lg transition-colors shadow-md flex justify-center items-center ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} School Manager GH &bull;
            Empowering Excellence
          </p>
        </div>
      </div>

      <div id="mfa-recaptcha-container" className="hidden" />
    </div>
  );
};

export default Login;
