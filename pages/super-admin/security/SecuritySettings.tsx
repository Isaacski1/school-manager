import React, { useEffect, useState } from "react";
import Layout from "../../../components/Layout";
import { firestore } from "../../../services/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { PlatformSecuritySettings } from "../../../types";
import { useAuth } from "../../../context/AuthContext";
import { showToast } from "../../../services/toast";

const defaultSettings = (updatedBy: string): PlatformSecuritySettings => ({
  enabledForSuperAdmins: false,
  enabledForSchoolAdmins: false,
  enforcementMode: "optional",
  updatedAt: Date.now(),
  updatedBy,
});

const SecuritySettings: React.FC = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PlatformSecuritySettings | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const ref = doc(firestore, "platformSecuritySettings", "2fa");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setSettings({
          ...defaultSettings(user?.id || "system"),
          ...(snap.data() as Partial<PlatformSecuritySettings>),
        });
      } else {
        setSettings(defaultSettings(user?.id || "system"));
      }
    };
    loadSettings();
  }, [user?.id]);

  const saveSettings = async (
    next: PlatformSecuritySettings,
    successMessage: string,
  ) => {
    setSaving(true);
    try {
      await setDoc(doc(firestore, "platformSecuritySettings", "2fa"), next, {
        merge: true,
      });
      setSettings(next);
      showToast(successMessage, { type: "success" });
    } catch (error: any) {
      showToast(error?.message || "Failed to save setting.", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleAudience = async (
    field: "enabledForSuperAdmins" | "enabledForSchoolAdmins",
  ) => {
    if (!settings) return;
    await saveSettings(
      {
        ...settings,
        [field]: !settings[field],
        updatedAt: Date.now(),
        updatedBy: user?.id || "system",
      },
      "Admin MFA audience updated.",
    );
  };

  const setEnforcementMode = async (
    enforcementMode: PlatformSecuritySettings["enforcementMode"],
  ) => {
    if (!settings || settings.enforcementMode === enforcementMode) return;
    await saveSettings(
      {
        ...settings,
        enforcementMode,
        updatedAt: Date.now(),
        updatedBy: user?.id || "system",
      },
      "Admin MFA policy saved.",
    );
  };

  return (
    <Layout title="Security Settings">
      <div className="p-6 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            Admin MFA Policy
          </h1>
          <p className="text-slate-600">
            Store the platform policy for two-factor authentication on admin
            accounts. Firebase enrollment and challenge UI still needs to be
            completed before strict enforcement is switched on.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-800">
                Enable MFA for Super Admins
              </h2>
              <p className="text-sm text-slate-500">
                Recommended for every top-level account.
              </p>
            </div>
            <button
              onClick={() => toggleAudience("enabledForSuperAdmins")}
              disabled={saving || !settings}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings?.enabledForSuperAdmins
                  ? "bg-emerald-500"
                  : "bg-slate-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings?.enabledForSuperAdmins
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-800">
                Enable MFA for School Admins
              </h2>
              <p className="text-sm text-slate-500">
                Use this before requiring MFA across school-level admins.
              </p>
            </div>
            <button
              onClick={() => toggleAudience("enabledForSchoolAdmins")}
              disabled={saving || !settings}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings?.enabledForSchoolAdmins
                  ? "bg-emerald-500"
                  : "bg-slate-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings?.enabledForSchoolAdmins
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="mt-6">
            <h2 className="font-semibold text-slate-800">Enforcement Mode</h2>
            <p className="mt-1 text-sm text-slate-500">
              Keep this on optional until enrollment and verification steps are
              fully rolled out for admins.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {(["off", "optional", "required"] as const).map((mode) => {
                const active = settings?.enforcementMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setEnforcementMode(mode)}
                    disabled={saving || !settings}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "border-[#0B4A82] bg-[#0B4A82] text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {mode === "off"
                      ? "Off"
                      : mode === "optional"
                        ? "Optional"
                        : "Required"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Enabling this policy records the intended admin MFA posture. It
            does not yet replace Firebase's actual second-factor enrollment and
            verification flow.
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SecuritySettings;
