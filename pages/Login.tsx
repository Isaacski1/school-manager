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
  TotpMultiFactorGenerator,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { AlertCircle, ArrowLeft, CheckCircle, Eye, EyeOff, KeyRound, Phone } from "lucide-react";
import schoolLogo from "../logo/apple-icon-180x180.png";
import SplashScreen from "../components/SplashScreen";
import { API_BASE_URL } from "../src/config";
import { getFriendlyErrorMessage } from "../services/errorMessages";

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
  const [redirectingToMfaSetup, setRedirectingToMfaSetup] = useState(false);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Parent Login State
  const [isParentLogin, setIsParentLogin] = useState(false);
  const [parentPhone, setParentPhone] = useState("");
  const [parentOtp, setParentOtp] = useState("");
  const [parentDob, setParentDob] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [parentConfirmationResult, setParentConfirmationResult] = useState<any | null>(null);
  const [parentLoading, setParentLoading] = useState(false);
  const [parentError, setParentError] = useState("");
  const [parentSuccess, setParentSuccess] = useState("");
  const parentRecaptchaRef = useRef<RecaptchaVerifier | null>(null);

  // Persistence State
  const [rememberMe, setRememberMe] = useState(true);

  const isMfaFlow = Boolean(mfaResolver);
  const mfaHints = useMemo(() => mfaResolver?.hints || [], [mfaResolver]);
  const selectedMfaHint = useMemo(
    () => mfaHints[mfaSelectedHintIndex] || null,
    [mfaHints, mfaSelectedHintIndex],
  );
  const selectedMfaHintIsPhone =
    selectedMfaHint?.factorId === PhoneMultiFactorGenerator.FACTOR_ID;
  const selectedMfaHintIsTotp =
    selectedMfaHint?.factorId === TotpMultiFactorGenerator.FACTOR_ID;
  const selectedMfaHintSupported =
    selectedMfaHintIsPhone || selectedMfaHintIsTotp;

  const normalizeEmailInput = (value: string) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const resetMfaFlow = () => {
    setMfaResolver(null);
    setMfaSelectedHintIndex(0);
    setMfaVerificationId("");
    setMfaCode("");
    setMfaError("");
    setMfaLoading(false);
  };

  const maskPhoneNumber = (phoneNumber?: string) => {
    if (!phoneNumber) return "Phone number";
    const visibleDigits = phoneNumber.replace(/\D/g, "").slice(-4);
    return visibleDigits ? `ending in ${visibleDigits}` : "Phone number";
  };

  const getMfaHintDetails = (hint: any, index: number) => {
    if (!hint) {
      return {
        method: "Second factor",
        name: `Factor ${index + 1}`,
        detail: "Verification required",
      };
    }

    const isPhone = hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID;
    const isTotp = hint.factorId === TotpMultiFactorGenerator.FACTOR_ID;
    return {
      method: isPhone
        ? "SMS verification"
        : isTotp
          ? "Authenticator app"
          : "Second factor",
      name:
        hint.displayName ||
        (isPhone
          ? "Admin phone"
          : isTotp
            ? "Authenticator app"
            : `Factor ${index + 1}`),
      detail: isPhone
        ? maskPhoneNumber(hint.phoneInfo?.phoneNumber || hint.phoneNumber)
        : isTotp
          ? "Enter the 6-digit code"
          : "Verification required",
    };
  };

  const getRecaptchaVerifier = () => {
    if (recaptchaVerifierRef.current) return recaptchaVerifierRef.current;
    const verifier = new RecaptchaVerifier(auth, "mfa-recaptcha-container", {
      size: "invisible",
    });
    recaptchaVerifierRef.current = verifier;
    return verifier;
  };

  const getParentRecaptchaVerifier = () => {
    // If we already have one, try to clear it to start fresh for this request
    if (parentRecaptchaRef.current) {
      try {
        parentRecaptchaRef.current.clear();
      } catch (e) {}
      parentRecaptchaRef.current = null;
    }
    
    // Ensure the DOM container is empty to avoid overlapping iframes
    const container = document.getElementById("parent-recaptcha-container");
    if (container) {
      container.innerHTML = "";
    }

    const verifier = new RecaptchaVerifier(auth, "parent-recaptcha-container", {
      size: "invisible",
      callback: (response: string) => {
        console.log("reCAPTCHA v2 verified for parent login", response ? "successfully" : "no response");
      },
      "expired-callback": () => {
        console.warn("reCAPTCHA v2 token expired for parent login");
        if (parentRecaptchaRef.current) {
          try { parentRecaptchaRef.current.clear(); } catch (e) {}
          parentRecaptchaRef.current = null;
        }
      },
      "error-callback": (error: any) => {
        console.error("reCAPTCHA v2 error:", error);
      }
    });
    
    parentRecaptchaRef.current = verifier;
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

  useEffect(() => {
    if (isAuthenticated && !authLoading && !redirectingToMfaSetup) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, redirectingToMfaSetup]);

  useEffect(() => {
    return () => {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
      parentRecaptchaRef.current?.clear();
      parentRecaptchaRef.current = null;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setFormError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    setFormError("");

    try {
      // Set persistence based on rememberMe preference
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );

      await signInWithEmailAndPassword(auth, normalizeEmailInput(email), password);

      try {
        await evaluateAdminMfaPolicy();
      } catch (mfaError: any) {
        if (isMfaEnrollmentRequiredError(mfaError)) {
          setRedirectingToMfaSetup(true);
          await safeLogSecurityLogin({
            status: "SUCCESS",
            email: normalizeEmailInput(email),
            userAgent: navigator.userAgent,
          });
          navigate("/account/mfa-setup?required=1", { replace: true });
          return;
        }
        console.warn("Skipping admin MFA policy check due to backend error", mfaError);
      }
      
      await safeLogSecurityLogin({
        status: "SUCCESS",
        email: normalizeEmailInput(email),
        userAgent: navigator.userAgent,
      });
    } catch (err: any) {
      console.error("Login failed", err);

      if (err?.code === "auth/multi-factor-auth-required") {
        setMfaResolver(getMultiFactorResolver(auth, err));
        setFormError("");
        return;
      }
      
      await safeLogSecurityLogin({
        status: "FAILED",
        email: normalizeEmailInput(email),
        errorCode: err?.code || "unknown",
        userAgent: navigator.userAgent,
      });

      let msg = "The email or password is not correct. Please try again.";
      
      if (isMfaEnrollmentRequiredError(err)) {
        msg = "Your account needs extra sign-in security. Please contact your administrator to set it up.";
      } else if (err?.code === "auth/too-many-requests") {
        msg = "Too many attempts. Please wait a few minutes, then try again.";
      } else if (err?.code === "auth/user-not-found" || err?.code === "auth/wrong-password") {
        msg = "The email or password is not correct. Please try again.";
      } else if (err?.code === "auth/invalid-email") {
        msg = "Please enter a valid email address.";
      } else if (err?.message) {
        msg = getFriendlyErrorMessage(err, msg);
      }

      setFormError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMfaCode = async () => {
    const hint = mfaHints[mfaSelectedHintIndex];
    if (!hint) return;

    setMfaLoading(true);
    setMfaError("");

    try {
      if (hint.factorId === TotpMultiFactorGenerator.FACTOR_ID) {
        setMfaVerificationId("totp");
        return;
      }

      const verifier = getRecaptchaVerifier();
      let verificationId: string;

      if (hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID) {
        const phoneProvider = new PhoneAuthProvider(auth);
        verificationId = await phoneProvider.verifyPhoneNumber(
          {
            multiFactorHint: hint,
            session: mfaResolver.session
          },
          verifier
        );
      } else {
        throw new Error("Unsupported second factor type.");
      }

      setMfaVerificationId(verificationId);
    } catch (err: any) {
      console.error("MFA code send failed", err);
      let msg = "Failed to send verification code. Please try again.";
      if (err?.code === "auth/billing-not-enabled") {
        msg =
          "Firebase billing is not enabled for SMS verification. Enable billing on the Firebase project, or use your configured Firebase test code.";
      } else if (err?.code === "auth/operation-not-allowed") {
        msg =
          "SMS multi-factor authentication is not enabled in Firebase Authentication.";
      } else if (err?.code === "auth/too-many-requests") {
        msg = "Too many attempts. Please wait a few minutes, then try again.";
      } else if (err?.message) {
        msg = getFriendlyErrorMessage(err, msg);
      }
      setMfaError(msg);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerifyMfaCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaResolver || !mfaVerificationId) {
      setMfaError("Verification session missing. Please request a new code.");
      return;
    }
    if (!mfaCode.trim()) {
      setMfaError("Enter the verification code.");
      return;
    }

    setMfaLoading(true);
    setMfaError("");

    try {
      const assertion =
        selectedMfaHint?.factorId === TotpMultiFactorGenerator.FACTOR_ID
          ? TotpMultiFactorGenerator.assertionForSignIn(
              selectedMfaHint.uid,
              mfaCode.trim(),
            )
          : PhoneMultiFactorGenerator.assertion(
              PhoneAuthProvider.credential(
                mfaVerificationId,
                mfaCode.trim(),
              ),
            );
      await mfaResolver.resolveSignIn(assertion);

      await safeLogSecurityLogin({
        status: "SUCCESS",
        email: normalizeEmailInput(email),
        userAgent: navigator.userAgent,
      });
    } catch (err: any) {
      console.error("MFA verification failed", err);
      let msg = "Invalid verification code. Please try again.";
      if (err?.code === "auth/too-many-requests") {
        msg = "Too many attempts. Please try again later.";
      }
      setMfaError(msg);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleParentLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Combine day, month, year into YYYY-MM-DD
    if (!dobDay || !dobMonth || !dobYear) {
      setParentError("Please enter your child's complete Date of Birth.");
      return;
    }

    const formattedDay = dobDay.padStart(2, "0");
    const formattedMonth = dobMonth.padStart(2, "0");
    const formattedDob = `${dobYear}-${formattedMonth}-${formattedDay}`;

    if (!parentPhone.trim()) {
      setParentError("Please enter your registered phone number.");
      return;
    }

    let formattedPhone = parentPhone.trim();
    if (!formattedPhone.startsWith("+")) {
      if (formattedPhone.startsWith("0")) {
        formattedPhone = "+233" + formattedPhone.substring(1);
      } else {
        formattedPhone = "+233" + formattedPhone;
      }
    }

    setParentLoading(true);
    setParentError("");
    setParentSuccess("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/parent-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: formattedPhone,
          dob: formattedDob,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Invalid login credentials.");
      }

      // Set persistence based on rememberMe preference
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );

      await signInWithCustomToken(auth, data.token);

      await safeLogSecurityLogin({
        status: "SUCCESS",
        email: formattedPhone || "phone_login",
        userAgent: navigator.userAgent,
      });
    } catch (err: any) {
      console.error("Parent Custom Login failed", err);
      let msg = getFriendlyErrorMessage(
        err,
        "We could not sign you in. Please check your phone number and date of birth, then try again.",
      );
      
      if (err?.code === "auth/invalid-custom-token") {
        msg = "We could not complete sign in right now. Please contact the school office or support.";
      }
      
      setParentError(msg);
    } finally {
      setParentLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setFormError("Enter your email address to reset your password.");
      return;
    }

    setLoading(true);
    setFormError("");
    setResetSuccess("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/send-password-reset-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmailInput(email) }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data?.error || "Failed to send reset email. Please try again.";
        setFormError(msg);
        return;
      }

      setResetSuccess("Password reset email sent! Check your inbox.");
      setEmail("");
    } catch (err: any) {
      console.error("Password reset failed", err);
      setFormError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleResetMode = () => {
    setIsResetting(!isResetting);
    setFormError("");
    setResetSuccess("");
  };

  const toggleParentLogin = () => {
    setIsParentLogin(!isParentLogin);
    setParentPhone("");
    setParentDob("");
    setDobDay("");
    setDobMonth("");
    setDobYear("");
    setParentOtp("");
    setParentConfirmationResult(null);
    setParentError("");
    setParentSuccess("");
    if (parentRecaptchaRef.current) {
      try {
        parentRecaptchaRef.current.clear();
      } catch (e) {
        // Ignore
      }
      parentRecaptchaRef.current = null;
    }
  };

  const cancelMfaFlow = () => {
    resetMfaFlow();
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch (e) {
        // Ignore
      }
      recaptchaVerifierRef.current = null;
    }
  };

  if (authLoading) {
    const lastSchoolId = localStorage.getItem("activeSchoolId") || localStorage.getItem("lastSchoolId");
    let splashName = "";
    let splashLogo = "";
    
    if (lastSchoolId) {
      const cacheKey = `school_${lastSchoolId}`;
      const cached = localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          splashName = parsed.name || "";
          splashLogo = parsed.logoUrl || "";
        } catch (e) {}
      }
    }

    return (
      <SplashScreen
        roleLabel=""
        schoolName={splashName}
        schoolLogoUrl={splashLogo}
        hideDefaultBranding={Boolean(splashName || splashLogo)}
      />
    );
  }

  return (
    <>
      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(50px, -50px) scale(1.1); }
          66% { transform: translate(-30px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 8s infinite alternate ease-in-out;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-[#041222]">
        
        {/* Animated Glowing Orbs */}
        <div className="absolute top-[10%] left-[10%] w-[400px] h-[400px] rounded-full bg-blue-600/80 mix-blend-screen filter blur-[100px] opacity-80 animate-blob"></div>
        <div className="absolute top-[20%] right-[10%] w-[500px] h-[500px] rounded-full bg-emerald-500/80 mix-blend-screen filter blur-[120px] opacity-60 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[0%] left-[30%] w-[600px] h-[600px] rounded-full bg-purple-600/80 mix-blend-screen filter blur-[120px] opacity-60 animate-blob animation-delay-4000"></div>

        {/* Main Card Container */}
        <div className="w-full max-w-5xl min-h-[600px] flex flex-col md:flex-row bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden border border-white/20 relative z-10">
        {/* Left Column: Full Background Image and Content */}
        <div className="md:w-1/2 relative hidden md:flex flex-col justify-between p-12 overflow-hidden bg-[#0B4A82]">
          {/* Background Image with Overlay */}
          <div 
            className="absolute inset-0 z-0 opacity-50 bg-cover bg-center"
            style={{ backgroundImage: "url('/img-school.png')" }}
          />
          {/* Overlay gradient to ensure text readability */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0B4A82]/90 via-[#0B4A82]/70 to-[#0B4A82]/90 z-0" />

          {/* Top Logo */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-md border border-white/20 shadow-xl">
              <img src={schoolLogo} alt="Logo" className="w-10 h-10 object-contain rounded-lg" />
            </div>
            <span className="text-xl font-bold text-white tracking-wide">School Manager GH</span>
          </div>

          {/* Middle Content */}
          <div className="relative z-10 my-auto pt-8">
            <h2 className="text-4xl font-bold text-white mb-6 leading-tight drop-shadow-md">
              Manage Your School<br />with Confidence
            </h2>
            <p className="text-white/90 text-lg leading-relaxed mb-10 max-w-md">
              Empowering schools with digital tools for attendance tracking, grade management, fee collection, and more.
            </p>
            <div className="space-y-6">
              <div className="flex items-center text-white">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center backdrop-blur-sm mr-4 border border-emerald-500/30">
                  <CheckCircle size={20} className="text-emerald-400" />
                </div>
                <span className="font-medium text-[17px]">Easy attendance management</span>
              </div>
              <div className="flex items-center text-white">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center backdrop-blur-sm mr-4 border border-emerald-500/30">
                  <CheckCircle size={20} className="text-emerald-400" />
                </div>
                <span className="font-medium text-[17px]">Digital report cards</span>
              </div>
              <div className="flex items-center text-white">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center backdrop-blur-sm mr-4 border border-emerald-500/30">
                  <CheckCircle size={20} className="text-emerald-400" />
                </div>
                <span className="font-medium text-[17px]">Parent-teacher communication</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Login Form */}
        <div className="md:w-1/2 p-8 sm:p-12 flex flex-col justify-center bg-white relative">
          {/* Visit Marketing Site Link */}
          <a
            href="/"
            className="absolute top-6 right-6 flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-[#0B4A82] transition-colors group"
          >
            <span>Visit our website</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>

          {/* Logo & Header */}
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Welcome Back</h1>
            <p className="text-slate-500 mt-2 text-sm font-medium">
              {isParentLogin
                ? "Parent Portal - Login with your phone number"
                : isResetting
                ? "Reset your password"
                : "Please enter your details to sign in."}
            </p>
          </div>

          {/* Global Error */}
          {globalError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start">
              <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0 text-red-500" />
              <span>{globalError}</span>
            </div>
          )}

          {isParentLogin ? (
            <div className="space-y-6">
              <form onSubmit={handleParentLoginSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Registered Phone Number
                    </label>
                    <input
                      type="tel"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all bg-white text-slate-900 placeholder:text-slate-400"
                      placeholder="e.g., +233 24 123 4567"
                      required
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Enter the exact phone number registered with the school.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Child's Date of Birth
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          value={dobDay}
                          onChange={(e) => setDobDay(e.target.value.replace(/[^0-9]/g, ""))}
                          className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all bg-white text-slate-900 placeholder:text-slate-400 text-center"
                          placeholder="Day"
                          required
                        />
                      </div>
                      <div>
                        <select
                          value={dobMonth}
                          onChange={(e) => setDobMonth(e.target.value)}
                          className="w-full px-2 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all bg-white text-slate-900 placeholder:text-slate-400"
                          required
                        >
                          <option value="">Month</option>
                          <option value="01">January</option>
                          <option value="02">February</option>
                          <option value="03">March</option>
                          <option value="04">April</option>
                          <option value="05">May</option>
                          <option value="06">June</option>
                          <option value="07">July</option>
                          <option value="08">August</option>
                          <option value="09">September</option>
                          <option value="10">October</option>
                          <option value="11">November</option>
                          <option value="12">December</option>
                        </select>
                      </div>
                      <div>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          value={dobYear}
                          onChange={(e) => setDobYear(e.target.value.replace(/[^0-9]/g, ""))}
                          className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all bg-white text-slate-900 placeholder:text-slate-400 text-center"
                          placeholder="Year"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <input
                      id="parent-remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 text-[#0B4A82] focus:ring-[#1160A8] border-slate-300 rounded cursor-pointer"
                    />
                    <label htmlFor="parent-remember-me" className="ml-2 block text-sm text-slate-600 cursor-pointer font-medium">
                      Remember me
                    </label>
                  </div>

                  {parentError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start">
                      <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0 text-red-500" />
                      <span>{parentError}</span>
                    </div>
                  )}

                  {parentSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-start">
                      <CheckCircle size={16} className="mr-2 mt-0.5 flex-shrink-0 text-emerald-500" />
                      <span>{parentSuccess}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={parentLoading}
                    className={`w-full py-3 px-4 bg-[#0B4A82] hover:bg-[#0B4A82]/90 text-white font-bold rounded-lg transition-colors shadow-md flex justify-center items-center ${parentLoading ? "opacity-70 cursor-not-allowed" : ""}`}
                  >
                    {parentLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                        Verifying...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </button>
                </form>

              <button
                type="button"
                onClick={toggleParentLogin}
                disabled={parentLoading}
                className="w-full text-center text-sm text-slate-600 hover:text-[#0B4A82] font-medium flex items-center justify-center mt-4"
              >
                <ArrowLeft size={16} className="mr-1" /> Back to Sign In
              </button>
            </div>
          ) : isMfaFlow ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Choose verification method
                </label>
                <div className="space-y-3">
                  {mfaHints.map((hint: any, index: number) => {
                    const active = mfaSelectedHintIndex === index;
                    const details = getMfaHintDetails(hint, index);
                    const isTotp =
                      hint.factorId === TotpMultiFactorGenerator.FACTOR_ID;
                    return (
                      <button
                        key={`${hint.uid || index}`}
                        type="button"
                        onClick={() => {
                          setMfaSelectedHintIndex(index);
                          setMfaVerificationId("");
                          setMfaCode("");
                          setMfaError("");
                        }}
                        disabled={mfaLoading}
                        aria-pressed={active}
                        className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                          active
                            ? "border-[#1160A8] bg-[#1160A8]/5 shadow-sm ring-2 ring-[#1160A8]/10"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        } ${mfaLoading ? "cursor-not-allowed opacity-70" : ""}`}
                      >
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                            active
                              ? "bg-[#0B4A82] text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {isTotp ? <KeyRound size={20} /> : <Phone size={20} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900">
                            {details.method}
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-slate-500">
                            {details.name} · {details.detail}
                          </span>
                        </span>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                            active
                              ? "border-[#0B4A82] bg-[#0B4A82]"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          {active && (
                            <span className="h-2 w-2 rounded-full bg-white" />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {!mfaVerificationId ? (
                <button
                  type="button"
                  onClick={handleSendMfaCode}
                  disabled={mfaLoading || !selectedMfaHintSupported}
                  className={`w-full py-3 px-4 bg-[#0B4A82] hover:bg-[#0B4A82]/90 text-white font-bold rounded-lg transition-colors shadow-md flex justify-center items-center ${
                    mfaLoading || !selectedMfaHintSupported
                      ? "opacity-70 cursor-not-allowed"
                      : ""
                  }`}
                >
                  {mfaLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                      Sending code...
                    </>
                  ) : selectedMfaHintIsTotp ? (
                    "Enter Authenticator Code"
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
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all bg-white text-slate-900 placeholder:text-slate-400"
                      placeholder={
                        selectedMfaHintIsTotp
                          ? "Enter authenticator code"
                          : "Enter code sent to your phone"
                      }
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={mfaLoading}
                    className={`w-full py-3 px-4 bg-[#0B4A82] hover:bg-[#0B4A82]/90 text-white font-bold rounded-lg transition-colors shadow-md flex justify-center items-center ${
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

                  {!selectedMfaHintIsTotp && (
                    <button
                      type="button"
                      onClick={handleSendMfaCode}
                      disabled={mfaLoading || !selectedMfaHintIsPhone}
                      className="w-full text-center text-sm text-[#1160A8] hover:text-[#0B4A82] font-medium"
                    >
                      Resend code
                    </button>
                  )}
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
            <form onSubmit={handlePasswordReset} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all bg-white text-slate-900 placeholder:text-slate-400"
                  placeholder="Enter your email"
                  required
                />
              </div>

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start">
                  <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0 text-red-500" />
                  <span>{formError}</span>
                </div>
              )}

              {resetSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-start">
                  <CheckCircle size={16} className="mr-2 mt-0.5 flex-shrink-0 text-emerald-500" />
                  <span>{resetSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 px-4 bg-[#0B4A82] hover:bg-[#0B4A82]/90 text-white font-bold rounded-lg transition-colors shadow-md flex justify-center items-center ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                    Sending...
                  </>
                ) : (
                  "Send Reset Email"
                )}
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
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all bg-white text-slate-900 placeholder:text-slate-400"
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all bg-white text-slate-900 placeholder:text-slate-400 pr-12"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-[#0B4A82] focus:ring-[#1160A8] border-slate-300 rounded cursor-pointer"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-600 cursor-pointer font-medium">
                  Remember me
                </label>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={toggleResetMode}
                  className="text-sm font-medium text-[#1160A8] hover:text-[#0B4A82] transition-colors"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={toggleParentLogin}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  Parent Login
                </button>
              </div>

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start">
                  <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0 text-red-500" />
                  <span>{formError}</span>
                </div>
              )}

              {resetSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-start">
                  <CheckCircle size={16} className="mr-2 mt-0.5 flex-shrink-0 text-emerald-500" />
                  <span>{resetSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 px-4 bg-[#0B4A82] hover:bg-[#0B4A82]/90 text-white font-bold rounded-lg transition-colors shadow-md flex justify-center items-center ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                    Signing In...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          )}

          <div id="parent-recaptcha-container"></div>
          <div id="mfa-recaptcha-container"></div>

          {/* Marketing Site CTA */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-500 mb-3">Don't have a school account yet?</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <a
                href="/get-started"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#0B4A82] text-white text-sm font-bold hover:bg-[#0B4A82]/90 transition-colors shadow-md"
              >
                Register Your School
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </a>
              <a
                href="/"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Learn more
              </a>
            </div>
          </div>
        </div>
        </div>
      </div>
    </>
  );
};

export default Login;
