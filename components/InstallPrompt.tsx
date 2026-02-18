import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setVisible(false);
    };

    const handleSwActivated = () => {
      // Re-show prompt when SW updates; browser may trigger beforeinstallprompt
      if (!installed && deferredPrompt) setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("sw-activated", handleSwActivated);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("sw-activated", handleSwActivated);
    };
  }, [deferredPrompt, installed]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
      setVisible(false);
    } else {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!visible || installed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200] w-[280px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-10 w-10 rounded-xl bg-[#E6F0FA] flex items-center justify-center text-[#0B4A82]">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">
            Install School Manager
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Add the app to your device for faster access.
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={() => setVisible(false)}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          Not now
        </button>
        <button
          onClick={handleInstall}
          className="inline-flex items-center justify-center rounded-full bg-[#0B4A82] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#1160A8]"
        >
          Install
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
