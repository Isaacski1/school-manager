import React, { useState, useEffect, useMemo } from "react";
import {
  MessageSquare,
  BadgeDollarSign,
  Coins,
  TrendingUp,
  Settings,
  Sliders,
  Copy,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  HelpCircle
} from "lucide-react";
import {
  getSuperAdminSmsOverview,
  updateSuperAdminSmsConfig,
  SuperAdminSmsOverview
} from "../../services/backendApi";
import { showToast } from "../../services/toast";

const SmsManager: React.FC = () => {
  const [data, setData] = useState<SuperAdminSmsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creditRefreshError, setCreditRefreshError] = useState<string | null>(null);

  // Configuration Form State
  const [retailRate, setRetailRate] = useState(0.05);
  const [wholesaleRate, setWholesaleRate] = useState(0.02);
  const [senderId, setSenderId] = useState("SMGH");

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [transactionSearch, setTransactionSearch] = useState("");

  const fetchData = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    setCreditRefreshError(null);
    try {
      const overview = await getSuperAdminSmsOverview();
      setData(overview);
      if (overview.config) {
        setRetailRate(overview.config.retailRatePerSms ?? 0.05);
        setWholesaleRate(overview.config.wholesaleRatePerSms ?? 0.02);
        setSenderId(overview.config.providerSenderId ?? "SMGH");
      }
      
      // Show success message for credit refresh
      if (showRefreshIndicator && overview.provider && !overview.provider.error) {
        showToast("Credit information refreshed successfully", { type: "success" });
      } else if (showRefreshIndicator && overview.provider && overview.provider.error) {
        if (overview.provider.error !== "No record found for the requested message") {
          showToast(`Credit refresh completed with warning: ${overview.provider.error}`, { type: "warning" });
        }
      }
    } catch (err: any) {
      console.error("Error fetching SMS details:", err);
      const errorMessage = err.message || "Failed to load SMS resale overview statistics.";
      setCreditRefreshError(errorMessage);
      showToast(errorMessage, { type: "error" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await updateSuperAdminSmsConfig({
        retailRatePerSms: Number(retailRate),
        wholesaleRatePerSms: Number(wholesaleRate),
        providerSenderId: senderId
      });
      if (res.success) {
        showToast(res.message || "SMS resale configuration updated successfully.", { type: "success" });
        await fetchData();
      }
    } catch (err: any) {
      console.error("Error saving settings:", err);
      showToast(err.message || "Failed to save configuration details.", { type: "error" });
    } finally {
      setSubmitting(true);
      // Give a tiny delay for UX satisfaction
      setTimeout(() => setSubmitting(false), 500);
    }
  };

  // Copy transaction reference helper
  const handleCopyReference = (ref: string) => {
    navigator.clipboard.writeText(ref);
    showToast("Reference copied to clipboard", { type: "success" });
  };

  // Filtered Lists
  const filteredSchools = useMemo(() => {
    if (!data?.leaderboard) return [];
    return data.leaderboard.filter(
      (item) =>
        item.schoolName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.schoolId.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data?.leaderboard, searchTerm]);

  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    return data.transactions.filter(
      (item) =>
        item.schoolName.toLowerCase().includes(transactionSearch.toLowerCase()) ||
        item.reference.toLowerCase().includes(transactionSearch.toLowerCase()) ||
        (item.adminEmail || "").toLowerCase().includes(transactionSearch.toLowerCase())
    );
  }, [data?.transactions, transactionSearch]);

  // Real-time profit projections calculator
  const calculations = useMemo(() => {
    const profitMargin = retailRate - wholesaleRate;
    const marginPct = retailRate > 0 ? (profitMargin / retailRate) * 100 : 0;
    return {
      margin: profitMargin,
      pct: marginPct,
      proj10k: profitMargin * 10000,
      proj50k: profitMargin * 50000,
      proj100k: profitMargin * 100000
    };
  }, [retailRate, wholesaleRate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
        <RefreshCw className="w-10 h-10 text-[#0B4A82] animate-spin" />
        <p className="text-slate-500 font-medium animate-pulse">Loading SMS Resale stats...</p>
      </div>
    );
  }

  const analytics = data?.analytics || {
    totalSmsSent: 0,
    totalRevenue: 0,
    totalWholesaleCost: 0,
    totalProfitMargin: 0
  };

  const provider = data?.provider || {
    balance: 0,
    error: null,
    senderId: "SMGH"
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn text-slate-800">
      
      {/* Upper Title & Refresh Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-[#0B4A82] to-[#3b82f6] bg-clip-text text-transparent">
            Bulk SMS Resale Platform
          </h1>
          <p className="text-slate-500 mt-1">
            Configure dynamic pricing configurations, audit school usage margins, and track portal transaction receipts.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="self-start sm:self-center flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 rounded-xl shadow-sm hover:shadow transition-all text-sm font-semibold active:scale-[0.98] disabled:opacity-55"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-[#0B4A82]" : ""}`} />
            {refreshing ? "Refreshing Credits..." : "Refresh Credits"}
          </button>
          {creditRefreshError && (
            <div className="self-start sm:self-center px-3 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-xs font-medium">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              Credit sync issue
            </div>
          )}
        </div>
      </div>

      {/* Credit Refresh Error Display */}
      {creditRefreshError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900 text-sm">Credit Refresh Issue</h3>
              <p className="text-amber-700 text-xs mt-1">{creditRefreshError}</p>
              <p className="text-amber-600 text-xs mt-2 opacity-75">
                This may indicate a temporary API issue with the Arkesel platform. Please try again or check your API credentials.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Gateway API Status Block */}
      <div className={`p-5 rounded-2xl border transition-all ${
        provider.error
          ? "bg-amber-50/70 border-amber-200/60 text-amber-900"
          : "bg-emerald-50/70 border-emerald-200/60 text-emerald-900"
      }`}>
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${provider.error ? "bg-amber-100" : "bg-emerald-100"}`}>
            {provider.error ? (
              <AlertCircle className="w-6 h-6 text-amber-700" />
            ) : (
              <CheckCircle2 className="w-6 h-6 text-emerald-700" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="font-bold text-lg">
                Gateway Provider Connection: {provider.error ? "Partial / Error" : "Healthy"}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-semibold opacity-75">Provider:</span>
                <span className="px-2 py-0.5 bg-slate-800 text-white rounded text-xs font-bold">Arkesel GH</span>
              </div>
            </div>
            <p className="text-sm mt-1 opacity-90">
              {provider.error
                ? `System Warning: ${provider.error}`
                : `Gateway connection authenticated successfully. System has access to send broadcast alerts.`}
            </p>
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-current/10 text-sm font-semibold">
              <div>
                Sender ID: <span className="underline">{provider.senderId || "SMGH"}</span>
              </div>
              <div>
                Wholesale Provider Balance:{" "}
                <span className="underline">
                  {provider.error ? "Unavailable" : `${Number(provider.balance).toLocaleString()} SMS Units`}
                </span>
              </div>
              <div className="text-xs opacity-60">
                Status: {provider.apiStatus === "connected" ? "🟢 Connected" : provider.apiStatus === "error" ? "🔴 Error" : "⚠️ Unconfigured"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Credit Information Block */}
      {provider.credits && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-blue-100 text-blue-700 rounded-lg">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-blue-900">Detailed Credit Information</h3>
              <p className="text-sm text-blue-700">Real-time credit breakdown from Arkesel platform</p>
            </div>
            {provider.lastRefreshed && (
              <div className="ml-auto text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                Last updated: {new Date(provider.lastRefreshed).toLocaleTimeString()}
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Credits */}
            <div className="bg-white rounded-xl p-4 border border-blue-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-blue-700">Total Credits</span>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                  {provider.credits.currency}
                </span>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-blue-900">
                  {provider.credits.totalCredits.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Available Credits */}
            <div className="bg-white rounded-xl p-4 border border-green-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-green-700">Available Credits</span>
                <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full font-medium">
                  Ready to use
                </span>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-green-900">
                  {provider.credits.availableCredits.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Reserved Credits */}
            <div className="bg-white rounded-xl p-4 border border-amber-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-amber-700">Reserved Credits</span>
                <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full font-medium">
                  On hold
                </span>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-amber-900">
                  {provider.credits.reservedCredits.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {provider.balanceBreakdown && (
            <div className="mt-6 pt-4 border-t border-blue-200">
              <h4 className="text-sm font-semibold text-blue-800 mb-3">Service Balance Breakdown</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white/70 rounded-lg p-3 text-center">
                  <span className="text-xs text-blue-600 font-medium">SMS Balance</span>
                  <div className="text-lg font-bold text-blue-800 mt-1">
                    {provider.balanceBreakdown.smsBalance.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white/70 rounded-lg p-3 text-center">
                  <span className="text-xs text-purple-600 font-medium">Voice Balance</span>
                  <div className="text-lg font-bold text-purple-800 mt-1">
                    {provider.balanceBreakdown.voiceBalance.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white/70 rounded-lg p-3 text-center">
                  <span className="text-xs text-pink-600 font-medium">USSD Balance</span>
                  <div className="text-lg font-bold text-pink-800 mt-1">
                    {provider.balanceBreakdown.ussdBalance.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dashboard Analytics Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total SMS Sent */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-300" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">Total SMS Broadcasts</span>
            <div className="p-2.5 bg-sky-100 rounded-xl text-sky-700">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold tracking-tight">
              {analytics.totalSmsSent.toLocaleString()}
            </h3>
            <p className="text-xs text-slate-400 mt-1">Accumulated across all school accounts</p>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-300" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">Total Retail Billing</span>
            <div className="p-2.5 bg-indigo-100 rounded-xl text-indigo-700">
              <BadgeDollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold tracking-tight text-indigo-900">
              GH₵ {analytics.totalRevenue.toFixed(2)}
            </h3>
            <p className="text-xs text-slate-400 mt-1">Gross paid by school administrators</p>
          </div>
        </div>

        {/* Wholesale Cost */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-300" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">Wholesale Gateway Cost</span>
            <div className="p-2.5 bg-amber-100 rounded-xl text-amber-700">
              <Coins className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold tracking-tight text-amber-800">
              GH₵ {analytics.totalWholesaleCost.toFixed(2)}
            </h3>
            <p className="text-xs text-slate-400 mt-1">Paid to gateway provider service</p>
          </div>
        </div>

        {/* Net Profit Margin */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-300" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">Net Platform Margin</span>
            <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-700">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold tracking-tight text-emerald-800">
              GH₵ {analytics.totalProfitMargin.toFixed(2)}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">
                +{((analytics.totalRevenue > 0 ? (analytics.totalProfitMargin / analytics.totalRevenue) * 100 : 0)).toFixed(0)}% margin
              </span>
              <span className="text-[10px] text-slate-400">profit ratio</span>
            </div>
          </div>
        </div>

      </div>

      {/* Pricing Configurations & Calculator Block */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Slider Controls */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <div className="p-2 bg-blue-50 text-[#0B4A82] rounded-lg">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Dynamic Rate Structures</h2>
              <p className="text-slate-400 text-xs">Adjust retail and wholesale price parameters</p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            
            {/* Wholesale Price Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-600 flex items-center gap-1">
                  Wholesale Gateway Rate (Cost)
                  <span className="text-xs text-slate-400 font-normal">(GH₵ / SMS)</span>
                </label>
                <span className="font-bold text-slate-800 bg-slate-50 border px-3 py-1 rounded-lg text-sm">
                  GH₵ {Number(wholesaleRate).toFixed(4)}
                </span>
              </div>
              <input
                type="range"
                min="0.005"
                max="0.10"
                step="0.001"
                value={wholesaleRate}
                onChange={(e) => setWholesaleRate(Number(e.target.value))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#0B4A82]"
              />
              <p className="text-[11px] text-slate-400">
                Amount paid per SMS block to the upstream provider (Arkesel default is GH₵ 0.02)
              </p>
            </div>

            {/* Retail Price Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-600 flex items-center gap-1">
                  Retail Customer Rate (Markup)
                  <span className="text-xs text-slate-400 font-normal">(GH₵ / SMS)</span>
                </label>
                <span className="font-bold text-[#0B4A82] bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg text-sm">
                  GH₵ {Number(retailRate).toFixed(4)}
                </span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.25"
                step="0.005"
                value={retailRate}
                onChange={(e) => setRetailRate(Number(e.target.value))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#0B4A82]"
              />
              <p className="text-[11px] text-slate-400">
                Amount charged to school admins for each SMS alert (Default is GH₵ 0.05)
              </p>
            </div>

            {/* Provider Sender ID & Upstream config */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Default Sender ID</label>
                <input
                  type="text"
                  maxLength={11}
                  value={senderId}
                  onChange={(e) => setSenderId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  placeholder="SMGH"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0B4A82] font-semibold"
                />
                <p className="text-[10px] text-slate-400">Max 11 alphanumeric characters.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Last Pricing Sync</label>
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 text-slate-500 rounded-xl text-sm font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {data?.config?.updatedAt 
                    ? new Date(data.config.updatedAt).toLocaleDateString() 
                    : "No configuration changes logged yet"}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-[#0B4A82] hover:bg-[#07325c] text-white py-3 rounded-xl font-semibold transition-all hover:shadow-lg active:scale-[0.99] disabled:opacity-50 text-sm"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving Rates Configuration...
                </>
              ) : (
                "Save Configuration Settings"
              )}
            </button>

          </form>
        </div>

        {/* Right Side: Interactive Margin Calculator */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl shadow-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
              <div className="p-2 bg-white/10 text-sky-400 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-white">Profit Margin Calculator</h2>
                <p className="text-slate-300 text-xs">Simulated returns based on slider values</p>
              </div>
            </div>

            {/* Calculations metrics summary */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
                <span className="text-xs text-slate-300 font-medium block">Revenue Margin / SMS</span>
                <span className="text-lg font-bold text-sky-400 mt-1 block">
                  GH₵ {calculations.margin.toFixed(4)}
                </span>
              </div>
              <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
                <span className="text-xs text-slate-300 font-medium block">Net Markup Profit %</span>
                <span className="text-lg font-bold text-emerald-400 mt-1 block">
                  {calculations.pct.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Simulated Tier Earnings */}
            <div className="space-y-4 mt-6">
              <h3 className="text-xs uppercase tracking-wider font-bold text-slate-300">
                Volume Projections
              </h3>
              
              {/* 10,000 SMS tier */}
              <div className="flex items-center justify-between p-2.5 bg-white/5 border border-white/5 hover:border-white/10 rounded-xl transition-all">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-white/10 text-slate-300 font-bold rounded">10,000</span>
                  <span className="text-xs text-slate-200">Alerts Sent</span>
                </div>
                <span className="font-bold text-sm text-sky-300">GH₵ {calculations.proj10k.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              {/* 50,000 SMS tier */}
              <div className="flex items-center justify-between p-2.5 bg-white/5 border border-white/5 hover:border-white/10 rounded-xl transition-all">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-white/10 text-slate-300 font-bold rounded">50,000</span>
                  <span className="text-xs text-slate-200">Alerts Sent</span>
                </div>
                <span className="font-bold text-sm text-sky-300">GH₵ {calculations.proj50k.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              {/* 100,000 SMS tier */}
              <div className="flex items-center justify-between p-2.5 bg-white/5 border border-white/5 hover:border-white/10 rounded-xl transition-all">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-white/10 text-slate-300 font-bold rounded">100,000</span>
                  <span className="text-xs text-slate-200">Alerts Sent</span>
                </div>
                <span className="font-bold text-sm text-sky-300">GH₵ {calculations.proj100k.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10 text-xs text-slate-400 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 shrink-0 text-slate-300" />
            <span>Calculations assume all payments successfully settle via Paystack billing callbacks.</span>
          </div>
        </div>

      </div>

      {/* Bottom Layout: Leaderboard & Transaction History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Leaderboard Table (Leaderboard usage) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-lg">School Consumption</h2>
                <p className="text-slate-400 text-xs">Top schools by SMS usage metrics</p>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter schools..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-1.5 w-full sm:w-44 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B4A82]"
                />
              </div>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400 font-semibold border-b border-slate-100">
                    <th className="pb-3 text-xs uppercase">School</th>
                    <th className="pb-3 text-xs uppercase text-center">SMS Sent</th>
                    <th className="pb-3 text-xs uppercase text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredSchools.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400 text-xs">
                        No school consumption logs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    filteredSchools.slice(0, 8).map((school, idx) => (
                      <tr key={school.schoolId} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                              idx === 0 
                                ? "bg-amber-100 text-amber-700" 
                                : idx === 1 
                                  ? "bg-slate-100 text-slate-700" 
                                  : idx === 2 
                                    ? "bg-orange-100 text-orange-700" 
                                    : "bg-slate-50 text-slate-500"
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-slate-700 text-xs sm:text-sm truncate max-w-[140px] block" title={school.schoolName}>
                              {school.schoolName}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-center font-semibold text-xs text-slate-600">
                          {school.totalSms.toLocaleString()}
                        </td>
                        <td className="py-3 text-right font-bold text-xs text-[#0B4A82]">
                          GH₵ {school.totalCost.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {filteredSchools.length > 8 && (
            <p className="text-[10px] text-slate-400 text-center mt-3 pt-3 border-t">
              Showing top 8 school accounts by total SMS units dispatched.
            </p>
          )}
        </div>

        {/* Transaction History Logs */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-lg">Billing Recharge Logs</h2>
                <p className="text-slate-400 text-xs">Wallet top-up records from schools</p>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search reference, school..."
                  value={transactionSearch}
                  onChange={(e) => setTransactionSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 w-full sm:w-56 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B4A82]"
                />
              </div>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="text-slate-400 font-semibold border-b border-slate-100">
                    <th className="pb-3 text-xs uppercase">Date</th>
                    <th className="pb-3 text-xs uppercase">School / Admin</th>
                    <th className="pb-3 text-xs uppercase text-center">Reference</th>
                    <th className="pb-3 text-xs uppercase text-center">Status</th>
                    <th className="pb-3 text-xs uppercase text-right">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 text-xs">
                        No SMS top-up payments logged.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.slice(0, 7).map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 text-slate-500 font-medium">
                          {new Date(tx.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800 text-xs truncate max-w-[120px] sm:max-w-[160px]" title={tx.schoolName}>
                              {tx.schoolName}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[120px] sm:max-w-[160px]">
                              {tx.adminEmail}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <button
                            onClick={() => handleCopyReference(tx.reference)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 border hover:bg-slate-100 text-slate-600 rounded text-[10px] font-bold"
                          >
                            {tx.reference.substring(0, 8)}...
                            <Copy className="w-2.5 h-2.5" />
                          </button>
                        </td>
                        <td className="py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            String(tx.status).toLowerCase() === "success" || String(tx.status).toLowerCase() === "paid"
                              ? "bg-emerald-100 text-emerald-800"
                              : String(tx.status).toLowerCase() === "pending"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-red-100 text-red-800"
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3 text-right font-extrabold text-slate-900">
                          GH₵ {(tx.amount / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {filteredTransactions.length > 7 && (
            <p className="text-[10px] text-slate-400 text-center mt-3 pt-3 border-t">
              Showing latest 7 wallet top-up transactions.
            </p>
          )}
        </div>

      </div>

    </div>
  );
};

export default SmsManager;
