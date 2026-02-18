import React from "react";
import schoolLogo from "../logo/apple-icon-180x180.png";

type SplashScreenProps = {
  roleLabel?: string;
  schoolName?: string;
  schoolLogoUrl?: string;
  hideDefaultBranding?: boolean;
};

const SplashScreen: React.FC<SplashScreenProps> = ({
  roleLabel,
  schoolName,
  schoolLogoUrl,
  hideDefaultBranding,
}) => {
  const displayName =
    hideDefaultBranding && !schoolName ? "" : schoolName || "School Manager GH";
  const displayLogo =
    hideDefaultBranding && !schoolLogoUrl ? "" : schoolLogoUrl || schoolLogo;
  return (
    <div className="min-h-screen bg-[#0B4A82] flex flex-col items-center justify-center text-white relative overflow-hidden">
      <div className="absolute -top-32 -right-20 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-emerald-200/10 rounded-full blur-3xl" />

      <div className="relative flex flex-col items-center">
        <div className="w-24 h-24 rounded-3xl bg-white/15 border border-white/20 flex items-center justify-center shadow-2xl animate-pulse">
          {displayLogo ? (
            <img src={displayLogo} alt={displayName} className="w-16 h-16" />
          ) : (
            <div className="w-16 h-16" />
          )}
        </div>
        {displayName ? (
          <h1 className="mt-6 text-2xl font-bold tracking-wide">
            {displayName}
          </h1>
        ) : null}
        <p className="mt-2 text-sm text-white/80">
          {roleLabel
            ? `Welcome back, ${roleLabel}.`
            : "Preparing your dashboard..."}
        </p>
        <div className="mt-6 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-white/80 animate-bounce" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/60 animate-bounce [animation-delay:120ms]" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/40 animate-bounce [animation-delay:240ms]" />
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
