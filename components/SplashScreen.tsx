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
    <div className="min-h-screen bg-[#041222] flex flex-col items-center justify-center text-white relative overflow-hidden">
      {/* Animated background blobs matching the new marketing theme */}
      <div className="absolute -top-32 -right-20 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] animate-pulse [animation-delay:1s]" />

      <div className="relative flex w-full max-w-sm flex-col items-center px-6 text-center z-10">
        <div className="w-28 h-28 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl backdrop-blur-xl mb-8 group overflow-hidden">
          {displayLogo ? (
            <img 
              src={displayLogo} 
              alt={displayName} 
              className="w-20 h-20 object-contain transition-transform duration-700 group-hover:scale-110" 
            />
          ) : (
            <div className="w-20 h-20 bg-white/5 rounded-2xl animate-pulse" />
          )}
        </div>

        {displayName && (
          <h1 className="text-3xl font-bold tracking-tight text-white mb-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {displayName}
          </h1>
        )}

        <p className="text-blue-200/60 font-medium tracking-wide text-sm uppercase mb-8">
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
