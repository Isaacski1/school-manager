import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import {
  EmailAuthProvider,
  getMultiFactorResolver,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  reauthenticateWithCredential,
  sendEmailVerification,
  TotpMultiFactorGenerator,
} from "firebase/auth";
import {
  AlertCircle,
  Download,
  CheckCircle,
  Copy,
  Loader2,
  KeyRound,
  QrCode,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../services/firebase";
import {
  getAdminMfaPolicyStatus,
  type AdminMfaPolicyStatus,
} from "../../services/backendApi";
import { getFriendlyErrorMessage } from "../../services/errorMessages";
import { showToast } from "../../services/toast";

const MfaSetup: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requiredFromLogin = searchParams.get("required") === "1";
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerIdRef = useRef(
    `mfa-enroll-recaptcha-container-${Date.now()}`,
  );

  const [policyStatus, setPolicyStatus] =
    useState<AdminMfaPolicyStatus | null>(null);
  const [totpDisplayName, setTotpDisplayName] = useState("Authenticator app");
  const [totpSecret, setTotpSecret] = useState<any | null>(null);
  const [totpQrDataUrl, setTotpQrDataUrl] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [generatingTotp, setGeneratingTotp] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [sendingVerificationEmail, setSendingVerificationEmail] =
    useState(false);
  const [needsRecentLogin, setNeedsRecentLogin] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthResolver, setReauthResolver] = useState<any | null>(null);
  const [reauthHintIndex, setReauthHintIndex] = useState(0);
  const [reauthVerificationId, setReauthVerificationId] = useState("");
  const [reauthCode, setReauthCode] = useState("");
  const [reauthenticating, setReauthenticating] = useState(false);
  const [reauthMfaLoading, setReauthMfaLoading] = useState(false);
  const [removingUid, setRemovingUid] = useState("");
  const [error, setError] = useState("");
  const [recaptchaContainerId, setRecaptchaContainerId] = useState(
    recaptchaContainerIdRef.current,
  );

  const currentUser = auth.currentUser;
  const enrolledFactors = useMemo(
    () => (currentUser ? multiFactor(currentUser).enrolledFactors : []),
    [currentUser, enrolling, removingUid],
  );
  const hasEnrolledFactor = enrolledFactors.length > 0;
  const emailVerified = Boolean(currentUser?.emailVerified);
  const hasTotpSetup = Boolean(totpSecret && totpQrDataUrl);
  const reauthHints = useMemo(
    () => reauthResolver?.hints || [],
    [reauthResolver],
  );
  const selectedReauthHint = reauthHints[reauthHintIndex] || null;

  const getFactorLabel = (factor: any, index = 0) => {
    if (!factor) return `Factor ${index + 1}`;
    if (factor.factorId === TotpMultiFactorGenerator.FACTOR_ID) {
      return factor.displayName || "Authenticator app";
    }
    if (factor.factorId === PhoneMultiFactorGenerator.FACTOR_ID) {
      const phone = factor.phoneInfo?.phoneNumber || factor.phoneNumber || "";
      const ending = phone.replace(/\D/g, "").slice(-4);
      return `${factor.displayName || "SMS"}${ending ? ` ending in ${ending}` : ""}`;
    }
    return factor.displayName || `Factor ${index + 1}`;
  };

  const refreshPolicyStatus = async () => {
    setLoadingStatus(true);
    try {
      const status = await getAdminMfaPolicyStatus();
      setPolicyStatus(status);
    } catch (err) {
      console.warn("Failed to load admin MFA policy status", err);
      setPolicyStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    refreshPolicyStatus();
  }, []);

  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    };
  }, []);

  const resetRecaptcha = () => {
    if (recaptchaRef.current) {
      try {
        recaptchaRef.current.clear();
      } catch {
        // Firebase may already have cleared the widget after a failed attempt.
      }
      recaptchaRef.current = null;
    }
    const container = document.getElementById(recaptchaContainerIdRef.current);
    if (container) container.innerHTML = "";
  };

  const rebuildRecaptchaContainer = async () => {
    resetRecaptcha();
    const nextId = `mfa-enroll-recaptcha-container-${Date.now()}`;
    recaptchaContainerIdRef.current = nextId;
    setRecaptchaContainerId(nextId);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  };

  const getRecaptchaVerifier = () => {
    if (recaptchaRef.current) return recaptchaRef.current;
    const verifier = new RecaptchaVerifier(
      auth,
      recaptchaContainerIdRef.current,
      { size: "invisible" },
    );
    recaptchaRef.current = verifier;
    return verifier;
  };

  const handleStartTotpEnrollment = async () => {
    if (!currentUser) {
      setError("You need to sign in again before setting up MFA.");
      return;
    }
    if (!currentUser.emailVerified) {
      setError("Verify your email address before setting up MFA.");
      return;
    }

    setGeneratingTotp(true);
    setError("");
    setTotpSecret(null);
    setTotpQrDataUrl("");
    setTotpCode("");

    try {
      const session = await multiFactor(currentUser).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      const qrCodeUrl = secret.generateQrCodeUrl(
        currentUser.email || user?.email || "admin",
        "School Manager GH",
      );
      const qrDataUrl = await QRCode.toDataURL(qrCodeUrl, {
        margin: 1,
        width: 220,
      });
      setTotpSecret(secret);
      setTotpQrDataUrl(qrDataUrl);
      showToast("Authenticator setup code generated.", { type: "success" });
    } catch (err: any) {
      console.error("TOTP enrollment setup failed", err);
      const fallback =
        err?.code === "auth/requires-recent-login"
          ? "Confirm your password below, then start authenticator setup again."
          : err?.code === "auth/unverified-email"
            ? "Verify your email address before setting up MFA."
            : err?.code === "auth/operation-not-allowed"
              ? "Authenticator app MFA is not enabled for this Firebase project yet."
              : "Failed to start authenticator app setup. Please try again.";
      if (err?.code === "auth/requires-recent-login") {
        setNeedsRecentLogin(true);
      }
      setError(
        err?.code === "auth/requires-recent-login"
          ? fallback
          : getFriendlyErrorMessage(err, fallback),
      );
    } finally {
      setGeneratingTotp(false);
    }
  };

  const handleReauthenticate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser?.email) {
      setError("This account needs to sign in again before setting up MFA.");
      return;
    }
    if (!reauthPassword) {
      setError("Enter your password to continue.");
      return;
    }

    setReauthenticating(true);
    setError("");
    try {
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        reauthPassword,
      );
      await reauthenticateWithCredential(currentUser, credential);
      setNeedsRecentLogin(false);
      setReauthPassword("");
      setReauthResolver(null);
      setReauthVerificationId("");
      setReauthCode("");
      showToast("Login refreshed. You can send the MFA code now.", {
        type: "success",
      });
    } catch (err: any) {
      console.error("MFA setup reauthentication failed", err);
      if (err?.code === "auth/multi-factor-auth-required") {
        setReauthResolver(getMultiFactorResolver(auth, err));
        setReauthHintIndex(0);
        setReauthVerificationId("");
        setReauthCode("");
        setError("");
        return;
      }
      setError(
        getFriendlyErrorMessage(
          err,
          "Password confirmation failed. Check your password and try again.",
        ),
      );
    } finally {
      setReauthenticating(false);
    }
  };

  const handleSendReauthMfaCode = async () => {
    if (!reauthResolver || !selectedReauthHint) {
      setError("No second factor is available for this password confirmation.");
      return;
    }

    setReauthMfaLoading(true);
    setError("");
    setReauthVerificationId("");
    setReauthCode("");

    try {
      if (selectedReauthHint.factorId === TotpMultiFactorGenerator.FACTOR_ID) {
        setReauthVerificationId("totp");
        return;
      }

      if (selectedReauthHint.factorId !== PhoneMultiFactorGenerator.FACTOR_ID) {
        throw new Error("Unsupported second factor type.");
      }

      await rebuildRecaptchaContainer();
      const phoneProvider = new PhoneAuthProvider(auth);
      const id = await phoneProvider.verifyPhoneNumber(
        {
          multiFactorHint: selectedReauthHint,
          session: reauthResolver.session,
        },
        getRecaptchaVerifier(),
      );
      setReauthVerificationId(id);
      showToast("Verification code requested.", { type: "success" });
    } catch (err: any) {
      console.error("Reauthentication MFA code send failed", err);
      const fallback =
        err?.code === "auth/billing-not-enabled"
          ? "Firebase billing is not enabled for SMS verification. Use your Firebase test code if this is a test number."
          : "Failed to prepare second-factor verification. Please try again.";
      setError(getFriendlyErrorMessage(err, fallback));
      resetRecaptcha();
    } finally {
      setReauthMfaLoading(false);
    }
  };

  const handleVerifyReauthMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reauthResolver || !selectedReauthHint || !reauthVerificationId) {
      setError("Request or prepare the second-factor verification first.");
      return;
    }
    if (!reauthCode.trim()) {
      setError("Enter your second-factor code.");
      return;
    }

    setReauthMfaLoading(true);
    setError("");

    try {
      const assertion =
        selectedReauthHint.factorId === TotpMultiFactorGenerator.FACTOR_ID
          ? TotpMultiFactorGenerator.assertionForSignIn(
              selectedReauthHint.uid,
              reauthCode.trim(),
            )
          : PhoneMultiFactorGenerator.assertion(
              PhoneAuthProvider.credential(
                reauthVerificationId,
                reauthCode.trim(),
              ),
            );
      await reauthResolver.resolveSignIn(assertion);
      setNeedsRecentLogin(false);
      setReauthPassword("");
      setReauthResolver(null);
      setReauthVerificationId("");
      setReauthCode("");
      showToast("Login refreshed. You can continue MFA setup now.", {
        type: "success",
      });
    } catch (err: any) {
      console.error("Reauthentication MFA verification failed", err);
      setError(
        getFriendlyErrorMessage(
          err,
          "Second-factor verification failed. Check the code and try again.",
        ),
      );
    } finally {
      setReauthMfaLoading(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    if (!currentUser) {
      setError("You need to sign in again before verifying your email.");
      return;
    }

    setSendingVerificationEmail(true);
    setError("");
    try {
      await sendEmailVerification(currentUser);
      showToast("Verification email sent.", { type: "success" });
    } catch (err: any) {
      console.error("Failed to send verification email", err);
      setError(
        getFriendlyErrorMessage(
          err,
          "Failed to send verification email. Please try again.",
        ),
      );
    } finally {
      setSendingVerificationEmail(false);
    }
  };

  const handleEnrollTotp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser || !totpSecret) {
      setError("Start authenticator app setup first.");
      return;
    }
    if (!totpCode.trim()) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setEnrolling(true);
    setError("");

    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        totpCode.trim(),
      );
      await multiFactor(currentUser).enroll(
        assertion,
        totpDisplayName.trim() || "Authenticator app",
      );
      await currentUser.reload();
      setTotpSecret(null);
      setTotpQrDataUrl("");
      setTotpCode("");
      await refreshPolicyStatus();
      showToast("Authenticator app MFA has been set up.", {
        type: "success",
      });
    } catch (err: any) {
      console.error("TOTP enrollment failed", err);
      const fallback =
        err?.code === "auth/invalid-verification-code"
          ? "That authenticator code is not correct. Try the latest code from your app."
          : "Failed to finish authenticator app setup. Please try again.";
      setError(getFriendlyErrorMessage(err, fallback));
    } finally {
      setEnrolling(false);
    }
  };

  const handleCopySetupKey = async () => {
    const setupKey = String(totpSecret?.secretKey || "");
    if (!setupKey) return;
    try {
      await navigator.clipboard.writeText(setupKey);
      showToast("Manual setup key copied.", { type: "success" });
    } catch {
      setError("Could not copy the setup key. Press and hold the key to copy it manually.");
    }
  };

  const handleRemoveFactor = async (factor: any) => {
    if (!currentUser || !factor?.uid) return;
    const confirmed = window.confirm(
      "Remove this second factor from your account?",
    );
    if (!confirmed) return;

    setRemovingUid(factor.uid);
    setError("");
    try {
      await multiFactor(currentUser).unenroll(factor.uid);
      await currentUser.reload();
      await refreshPolicyStatus();
      showToast("Second factor removed.", { type: "success" });
    } catch (err: any) {
      console.error("Failed to remove MFA factor", err);
      setError(
        getFriendlyErrorMessage(
          err,
          "Failed to remove this second factor. You may need to sign in again first.",
        ),
      );
    } finally {
      setRemovingUid("");
    }
  };

  return (
    <Layout title="MFA Setup">
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        {requiredFromLogin && !hasEnrolledFactor && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Your admin policy now requires MFA. Add a second factor to continue
            using the admin dashboard.
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B4A82] text-white">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                    Set Up Admin MFA
                  </h1>
                  <p className="text-sm text-slate-500">
                    Add authenticator app protection to this signed-in admin account.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
            >
              Continue
            </button>
          </div>

          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="font-semibold text-slate-800">Policy</div>
              <div className="mt-1 text-slate-500">
                {loadingStatus
                  ? "Loading..."
                  : policyStatus?.appliesTo
                    ? policyStatus.enforcementMode
                    : "Not applied"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="font-semibold text-slate-800">Enrolled</div>
              <div className="mt-1 text-slate-500">
                {enrolledFactors.length} second factor
                {enrolledFactors.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="font-semibold text-slate-800">Status</div>
              <div className="mt-1 flex items-center gap-2 text-slate-500">
                {hasEnrolledFactor ? (
                  <>
                    <CheckCircle size={16} className="text-emerald-600" />
                    Ready
                  </>
                ) : (
                  <>
                    <AlertCircle size={16} className="text-amber-600" />
                    Setup needed
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <ShieldCheck size={18} />
              Verification Method
            </h2>
            {!emailVerified && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="font-semibold">Verify your email first</div>
                <p className="mt-1">
                  Firebase requires a verified email address before this admin
                  account can enroll a second factor.
                </p>
                <button
                  type="button"
                  onClick={handleSendVerificationEmail}
                  disabled={sendingVerificationEmail}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {sendingVerificationEmail && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  Send Verification Email
                </button>
              </div>
            )}
            {needsRecentLogin && emailVerified && (
              <form
                onSubmit={handleReauthenticate}
                className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              >
                <div className="font-semibold">Confirm your password</div>
                <p className="mt-1">
                  Firebase requires a fresh login before adding MFA to this
                  account.
                </p>
                <input
                  type="password"
                  value={reauthPassword}
                  onChange={(event) => setReauthPassword(event.target.value)}
                  className="mt-3 w-full rounded-xl border border-amber-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="submit"
                  disabled={reauthenticating}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {reauthenticating && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  Confirm Password
                </button>

                {reauthResolver && (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-white p-4">
                    <div className="font-semibold text-amber-950">
                      Verify existing MFA
                    </div>
                    <p className="mt-1 text-amber-900">
                      This account already has MFA, so Firebase also needs that
                      code before allowing a new factor.
                    </p>

                    {reauthHints.length > 1 && (
                      <div className="mt-3">
                        <label className="block text-sm font-semibold text-amber-950">
                          Existing factor
                        </label>
                        <select
                          value={reauthHintIndex}
                          onChange={(event) => {
                            setReauthHintIndex(Number(event.target.value));
                            setReauthVerificationId("");
                            setReauthCode("");
                          }}
                          className="mt-1 w-full rounded-xl border border-amber-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                        >
                          {reauthHints.map((factor: any, index: number) => (
                            <option key={factor.uid || index} value={index}>
                              {getFactorLabel(factor, index)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="mt-3 text-sm font-semibold text-amber-950">
                      {getFactorLabel(selectedReauthHint)}
                    </div>

                    {!reauthVerificationId ? (
                      <button
                        type="button"
                        onClick={handleSendReauthMfaCode}
                        disabled={reauthMfaLoading}
                        className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#0B4A82] px-4 py-2 font-semibold text-white hover:bg-[#083a66] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {reauthMfaLoading && (
                          <Loader2 size={16} className="animate-spin" />
                        )}
                        {selectedReauthHint?.factorId ===
                        TotpMultiFactorGenerator.FACTOR_ID
                          ? "Enter Authenticator Code"
                          : "Send Existing MFA Code"}
                      </button>
                    ) : (
                      <div className="mt-3">
                        <label className="block text-sm font-semibold text-amber-950">
                          Existing MFA code
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={reauthCode}
                          onChange={(event) =>
                            setReauthCode(
                              event.target.value.replace(/[^0-9]/g, ""),
                            )
                          }
                          className="mt-1 w-full rounded-xl border border-amber-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                          placeholder="Enter 6-digit code"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyReauthMfa}
                          disabled={reauthMfaLoading}
                          className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {reauthMfaLoading && (
                            <Loader2 size={16} className="animate-spin" />
                          )}
                          Verify Existing MFA
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>
            )}
            <div className="mt-5">
              <div className="rounded-xl border border-[#1160A8] bg-[#1160A8]/5 p-4 text-left ring-2 ring-[#1160A8]/10">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0B4A82] text-white">
                    <Smartphone size={19} />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-900">
                      Authenticator app
                    </span>
                    <span className="text-sm text-slate-500">
                      Recommended. No SMS billing required.
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700">
                  Factor name
                </label>
                <input
                  type="text"
                  value={totpDisplayName}
                  onChange={(event) => setTotpDisplayName(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-[#1160A8] focus:ring-2 focus:ring-[#1160A8]/20"
                  placeholder="Authenticator app"
                />
              </div>

              {!hasTotpSetup ? (
                <button
                  type="button"
                  onClick={handleStartTotpEnrollment}
                  disabled={generatingTotp || enrolling || !emailVerified}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B4A82] px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-[#083a66] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                >
                  {generatingTotp && (
                    <Loader2 size={18} className="animate-spin" />
                  )}
                  Start Authenticator Setup
                </button>
              ) : (
                <form onSubmit={handleEnrollTotp} className="space-y-4">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    <strong>Using a computer?</strong> Scan the QR code with your
                    phone. <strong>Using this same phone?</strong> Copy the manual
                    setup key below and add it to your authenticator app. Then
                    enter the 6-digit code created by the app.
                  </div>
                  <div className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
                    <img
                      src={totpQrDataUrl}
                      alt="Authenticator app QR code"
                      className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-2"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-700">
                        Manual setup key
                      </div>
                      <div className="mt-2 break-all rounded-lg bg-slate-50 p-3 font-mono text-sm text-slate-700">
                        {totpSecret?.secretKey}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopySetupKey}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Copy size={16} />
                        Copy Setup Key
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700">
                      Authenticator code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={totpCode}
                      onChange={(event) =>
                        setTotpCode(event.target.value.replace(/[^0-9]/g, ""))
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-[#1160A8] focus:ring-2 focus:ring-[#1160A8]/20"
                      placeholder="Enter 6-digit code"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={enrolling}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                  >
                    {enrolling && (
                      <Loader2 size={18} className="animate-spin" />
                    )}
                    Finish Authenticator Setup
                  </button>
                </form>
              )}
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <div id={recaptchaContainerId} key={recaptchaContainerId} className="hidden" />
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="font-semibold text-slate-900">
                How to Set It Up
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Follow these steps from top to bottom. You will need your phone,
                your School Manager GH password, and about two minutes. An
                authenticator app creates a temporary 6-digit security code and
                works even when your phone has no internet connection.
              </p>

              <div className="mt-5 space-y-4">
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0B4A82]">
                    <Download size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">
                      1. Install an authenticator app
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      On your phone, open the Google Play Store (Android) or App
                      Store (iPhone). Search for <strong>Google Authenticator</strong>
                      {" "}or <strong>Microsoft Authenticator</strong>, install one,
                      and open it. You do not need both apps.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0B4A82]">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">
                      2. Start the setup on this page
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Click <strong>Start Authenticator Setup</strong> in the panel
                      on the left. If you are asked to confirm your password,
                      enter the same password you use to sign in, click
                      <strong> Confirm Password</strong>, then click Start
                      Authenticator Setup again.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0B4A82]">
                    <QrCode size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">
                      3. Add School Manager GH to the authenticator app
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      <strong>If this page is open on a computer:</strong> open
                      the app on your phone, tap <strong>+</strong> or
                      <strong> Add account</strong>, choose
                      <strong> Scan a QR code</strong>, and scan the QR code on
                      the computer screen.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      <strong>If this page is open on the same phone:</strong>
                      {" "}tap <strong>Copy Setup Key</strong> on this page. Open
                      the authenticator app, tap <strong>+</strong> or
                      <strong> Add account</strong>, choose
                      <strong> Enter a setup key</strong> or
                      <strong> Enter code manually</strong>, type
                      <strong> School Manager GH</strong> as the account name,
                      paste the copied key, select <strong>Time based</strong> if
                      asked, and save it. Return to this page afterward.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0B4A82]">
                    <Smartphone size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">
                      4. Find the new 6-digit code
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      After scanning the QR code or saving the manual key, the
                      app will show a School Manager GH entry with a 6-digit
                      number. The number changes about
                      every 30 seconds, which is normal. Use the code currently
                      visible in the app.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0B4A82]">
                    <KeyRound size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">
                      5. Confirm and finish setup
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Return to this page and type that number into the
                      <strong> Authenticator code</strong> box. Click
                      <strong> Finish Authenticator Setup</strong>. If the code is
                      rejected, wait for the next code in the app and try again.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <CheckCircle size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">
                      6. Use it when you sign in
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Setup is complete when the authenticator appears under
                      <strong> Enrolled Factors</strong>. From your next login,
                      enter your email and password first, then open the app and
                      enter its current 6-digit code when requested.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <strong>Keep access to your authenticator app.</strong> Do not
                delete its School Manager GH entry after setup. If the QR code
                will not scan—or you are using the same phone—use
                <strong> Copy Setup Key</strong> and the app's manual setup
                option. Never share the QR code, setup key, or 6-digit code with
                another person.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="font-semibold text-slate-900">Enrolled Factors</h2>
              <div className="mt-4 space-y-3">
                {enrolledFactors.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    No second factor has been added to this account yet.
                  </div>
                ) : (
                  enrolledFactors.map((factor: any) => (
                    <div
                      key={factor.uid}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-800">
                          {factor.displayName || "Second factor"}
                        </div>
                        <div className="truncate text-sm text-slate-500">
                          {factor.factorId ===
                          TotpMultiFactorGenerator.FACTOR_ID
                            ? "Authenticator app"
                            : factor.phoneNumber || factor.factorId}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFactor(factor)}
                        disabled={Boolean(removingUid)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Remove second factor"
                      >
                        {removingUid === factor.uid ? (
                          <Loader2 size={17} className="animate-spin" />
                        ) : (
                          <Trash2 size={17} />
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default MfaSetup;
