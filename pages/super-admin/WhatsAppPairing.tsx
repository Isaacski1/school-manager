import React from "react";
import { AlertTriangle, MessageCircleOff } from "lucide-react";
import Layout from "../../components/Layout";

const WhatsAppPairing: React.FC = () => {
  return (
    <Layout title="WhatsApp Pairing Paused">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <MessageCircleOff size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 text-amber-900">
                <AlertTriangle size={18} />
                <h1 className="text-xl font-bold">WhatsApp pairing is paused</h1>
              </div>
              <p className="mt-3 text-sm leading-6 text-amber-900">
                WhatsApp pairing and background WhatsApp sending are temporarily disabled while the service is paused.
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-800">
                SMS reminders and other non-WhatsApp admin tools remain available.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default WhatsAppPairing;
