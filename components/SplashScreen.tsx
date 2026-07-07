import React from "react";
import schoolLogo from "../logo/apple-icon-180x180.png";

type SplashScreenProps = {
  roleLabel?: string;
  schoolName?: string;
  schoolLogoUrl?: string;
  hideDefaultBranding?: boolean;
  message?: string;
};

const SplashScreen: React.FC<SplashScreenProps> = ({
  roleLabel,
  schoolName,
  schoolLogoUrl,
  hideDefaultBranding = false,
  message,
}) => {
  // If we should hide default or have any school context, don't show the main brand
  const shouldShowDefault = !hideDefaultBranding && !schoolName && !schoolLogoUrl;
  
  const displayName = shouldShowDefault ? "School Manager GH" : (schoolName || "");
  const displayLogo = shouldShowDefault ? schoolLogo : (schoolLogoUrl || "");

  return (
    <div className="splash-screen min-h-screen flex flex-col items-center justify-center text-white relative overflow-hidden">
      <div className="splash-gradient-shift" />
      <div className="splash-light-sweep" />

      <div className="relative flex w-full max-w-sm flex-col items-center px-6 text-center z-10">
        <div className="w-28 h-28 rounded-[2rem] bg-white/10 border border-white/20 flex items-center justify-center shadow-2xl backdrop-blur-xl mb-8 group overflow-hidden">
          {displayLogo ? (
            <img 
              src={displayLogo} 
              alt={displayName} 
              loading="eager"
              decoding="async"
              className="w-20 h-20 object-contain transition-transform duration-700 group-hover:scale-110" 
            />
          ) : (
            <div className="w-20 h-20 bg-white/10 rounded-2xl animate-pulse" />
          )}
        </div>

        {displayName && (
          <h1 className="text-3xl font-bold tracking-tight text-white mb-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {displayName}
          </h1>
        )}

        <p className="text-blue-100/80 font-medium tracking-wide text-sm uppercase mb-8">
          {message || (roleLabel ? `Welcome back, ${roleLabel}` : "Loading...")}
        </p>

        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-duration:0.8s]" />
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-duration:0.8s] [animation-delay:0.15s]" />
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-duration:0.8s] [animation-delay:0.3s]" />
        </div>
      </div>

      {/* Decorative glass border */}
      <div className="absolute inset-4 border border-white/5 rounded-[2.5rem] pointer-events-none" />
    </div>
  );
};

export default SplashScreen;
