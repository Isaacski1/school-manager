import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { auth } from "../services/firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { AlertCircle, ArrowLeft, CheckCircle } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  // Forgot Password State
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState("");

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // AuthContext listener will handle the redirection via the useEffect above
    } catch (err: any) {
      console.error(err);
      let msg = "Failed to sign in.";
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password"
      ) {
        msg = "Invalid email or password.";
      } else if (err.code === "auth/too-many-requests") {
        msg = "Too many failed attempts. Please try again later.";
      }
      setFormError(msg);
      setLoading(false);
    }
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
                  '<div class="w-24 h-24 bg-[#0B4A82] rounded-full flex items-center justify-center text-[#E6F0FA] font-bold border-4 border-[#1160A8] text-xs text-center p-1">SCHOOL MANAGER GH</div>';
              }}
            />
          </div>
          <h1 className="text-2xl font-bold text-[#0B4A82] font-serif">
            School Manager GH
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            {isResetting
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

        {/* Success Message (Reset Link Sent) */}
        {resetSuccess && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-100 flex items-center">
            <CheckCircle size={16} className="mr-2 flex-shrink-0" />
            {resetSuccess}
          </div>
        )}

        {isResetting ? (
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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-[#1160A8] outline-none transition-all"
                placeholder="Enter your password"
                required
              />
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
    </div>
  );
};

export default Login;

