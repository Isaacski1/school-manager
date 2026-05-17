import React from "react";
import {
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import Layout from "../../components/Layout";

const comingSoonFeatures = [
  {
    icon: Wallet,
    title: "MoMo and bank payouts",
    description: "Prepare staff salary payments and send approved payroll directly to staff payout accounts.",
  },
  {
    icon: FileText,
    title: "Payroll records",
    description: "Keep a clear history of payroll periods, staff paid, totals, and transfer status.",
  },
  {
    icon: MessageSquare,
    title: "WhatsApp and SMS alerts",
    description: "Notify staff automatically when salary reaches their MoMo or bank account.",
  },
  {
    icon: ShieldCheck,
    title: "Controlled approvals",
    description: "Review totals and confirm before any payroll is submitted for payment.",
  },
];

const StaffPayroll: React.FC = () => {
  return (
    <Layout title="Staff Payroll">
      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <CreditCard size={22} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold text-slate-900">Staff Payroll</h1>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                      Coming Soon
                    </span>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600">
                    A faster way for schools to pay staff salaries through MoMo or bank accounts, with payment history and automatic staff notifications.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                  <Clock size={16} />
                  Being prepared for selected schools
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-5 lg:p-6">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                  Planned finance workflow
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">
                  Pay staff with review, confirmation, and clear records.
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  This feature is currently reserved for future release. When launched, admins will be able to prepare payroll, review totals, approve payouts, and notify staff after successful payment.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {comingSoonFeatures.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div key={feature.title} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                          <Icon size={18} />
                        </div>
                        <h3 className="font-bold text-slate-900">{feature.title}</h3>
                        <p className="mt-1 text-sm leading-5 text-slate-500">{feature.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-50 p-5 lg:border-l lg:border-t-0 lg:p-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Bell size={18} className="text-blue-700" />
                  Launch Preview
                </div>

                <div className="mt-5 space-y-4">
                  {[
                    "Add staff payout account",
                    "Prepare salary draft",
                    "Review payroll total",
                    "Confirm before sending",
                    "Notify staff after successful payment",
                  ].map((item, index) => (
                    <div key={item} className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        {index + 1}
                      </div>
                      <span className="text-sm font-medium text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                    <p className="text-sm leading-5 text-emerald-800">
                      This page is visible for marketing and planning only. Real payroll actions are disabled until the feature is launched.
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    <Smartphone size={13} /> MoMo
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    <CreditCard size={13} /> Bank
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    <MessageSquare size={13} /> Staff alerts
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default StaffPayroll;
