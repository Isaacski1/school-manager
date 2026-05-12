import React from "react";
import Layout from "../../components/Layout";
import PaymentSettings from "../../components/dashboard/PaymentSettings";

const PaymentSettingsPage: React.FC = () => {
  return (
    <Layout title="Online Payment Settings">
      <div className="max-w-4xl mx-auto py-4 sm:py-8 px-2 sm:px-4">
        <div className="mb-6 sm:mb-8 px-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Online Payment</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">
            Configure how you receive payments from parents via Mobile Money and Bank Transfer.
          </p>
        </div>
        
        <div className="shadow-sm overflow-hidden">
          <PaymentSettings />
        </div>
      </div>
    </Layout>
  );
};

export default PaymentSettingsPage;
