import React, { useEffect, useState } from "react";
import Layout from "../../../components/Layout";
import { firestore } from "../../../services/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { PlatformSecuritySettings } from "../../../types";
import { useAuth } from "../../../context/AuthContext";
import { showToast } from "../../../services/toast";

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
        setSettings(snap.data() as PlatformSecuritySettings);
      } else {
        setSettings({
          enabledForSuperAdmins: false,
          updatedAt: Date.now(),
          updatedBy: user?.id || "system",
        });
      }
    };
    loadSettings();
  }, [user?.id]);

  const toggle = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const next = {
        ...settings,
        enabledForSuperAdmins: !settings.enabledForSuperAdmins,
        updatedAt: Date.now(),
        updatedBy: user?.id || "system",
      };
      await setDoc(doc(firestore, "platformSecuritySettings", "2fa"), next, {
        merge: true,
      });
      setSettings(next);
      showToast("2FA setting saved.", { type: "success" });
    } catch (error: any) {
      showToast(error?.message || "Failed to save setting.", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="Security Settings">
      <div className="p-6 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            2FA (Coming Soon)
          </h1>
          <p className="text-slate-600">
            Prepare two-factor authentication for Super Admin accounts.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">
                Enable 2FA for Super Admins
              </h2>
              <p className="text-sm text-slate-500">
                Recommended: Authenticator app (future)
              </p>
            </div>
            <button
              onClick={toggle}
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
        </div>
      </div>
    </Layout>
  );
};

export default SecuritySettings;
