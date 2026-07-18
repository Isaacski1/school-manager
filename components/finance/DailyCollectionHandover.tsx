import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchool } from "../../context/SchoolContext";
import { useSchoolClasses } from "../../hooks/useSchoolClasses";
import { db } from "../../services/mockDb";
import { showToast } from "../../services/toast";
import { DailyCollectionBatch } from "../../types";

const money = (value?: number | null) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(Number(value) || 0);

const DailyCollectionHandover: React.FC = () => {
  const { school } = useSchool();
  const { user } = useAuth();
  const { getClassName } = useSchoolClasses();
  const schoolId = school?.id || user?.schoolId || "";
  const [batches, setBatches] = useState<DailyCollectionBatch[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [history, setHistory] = useState(false);
  const [review, setReview] = useState({ cash: "", momo: "", bank: "", reference: "", note: "" });

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const rows = await db.getDailyCollectionBatches({ schoolId });
      setBatches(rows.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)));
    } catch (error) {
      console.error("Failed to load collection handovers", error);
      showToast("Could not load teacher collection submissions.", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => batches.filter((batch) => history
    ? ["confirmed", "confirmed_with_difference", "rejected"].includes(batch.status)
    : ["submitted", "returned"].includes(batch.status)), [batches, history]);
  const selected = visible.find((batch) => batch.id === selectedId) || null;

  useEffect(() => {
    if (!selected && visible.length) setSelectedId(visible[0].id);
  }, [selected, visible]);

  useEffect(() => {
    if (!selected) return;
    setReview({
      cash: String(selected.receivedCash ?? selected.reportedCash),
      momo: String(selected.verifiedMomo ?? selected.reportedMomo),
      bank: String(selected.verifiedBank ?? selected.reportedBank),
      reference: selected.handoverReference || "",
      note: selected.reviewNote || "",
    });
  }, [selected?.id]);

  const receivedTotal = (Number(review.cash) || 0) + (Number(review.momo) || 0) + (Number(review.bank) || 0);
  const difference = selected ? receivedTotal - selected.reportedAmount : 0;

  const confirm = async () => {
    if (!selected || !user?.id) return;
    setProcessing(true);
    try {
      const now = Date.now();
      await db.saveDailyCollectionBatch({
        ...selected,
        receivedCash: Number(review.cash) || 0,
        verifiedMomo: Number(review.momo) || 0,
        verifiedBank: Number(review.bank) || 0,
        receivedAmount: receivedTotal,
        difference,
        handoverReference: review.reference.trim() || null,
        reviewNote: review.note.trim() || null,
        status: Math.abs(difference) < 0.005 ? "confirmed" : "confirmed_with_difference",
        reviewedAt: now,
        reviewedBy: user.id,
        reviewedByName: user.fullName || user.email || "Head teacher",
        updatedAt: now,
      });
      showToast(Math.abs(difference) < 0.005 ? "Handover confirmed and signed." : "Handover confirmed with a recorded difference.", { type: "success" });
      setSelectedId("");
      await load();
    } catch (error) {
      console.error("Failed to confirm handover", error);
      showToast("Could not confirm this handover.", { type: "error" });
    } finally {
      setProcessing(false);
    }
  };

  const returnBatch = async () => {
    if (!selected || !user?.id || !review.note.trim()) {
      showToast("Enter a reason before returning the register.", { type: "error" });
      return;
    }
    setProcessing(true);
    try {
      const now = Date.now();
      await db.saveDailyCollectionBatch({
        ...selected,
        status: "returned",
        returnReason: review.note.trim(),
        returnedAt: now,
        reviewedBy: user.id,
        reviewedByName: user.fullName || user.email || "Head teacher",
        updatedAt: now,
      });
      showToast("Register returned to the teacher for correction.", { type: "success" });
      setSelectedId("");
      await load();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <section className="rounded-[30px] border border-indigo-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Management control</p><h2 className="mt-1 text-2xl font-semibold text-slate-900">Teacher Cash Handover</h2><p className="mt-1 text-sm text-slate-500">Receive, reconcile and sign daily teacher submissions.</p></div>
        <div className="flex gap-2"><button onClick={() => { setHistory(false); setSelectedId(''); }} className={`rounded-xl px-3 py-2 text-sm font-semibold ${!history ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Pending ({batches.filter((item) => item.status === 'submitted').length})</button><button onClick={() => { setHistory(true); setSelectedId(''); }} className={`rounded-xl px-3 py-2 text-sm font-semibold ${history ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>History</button><button onClick={load} className="rounded-xl border border-slate-200 p-2 text-slate-500"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button></div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-2">
          {!visible.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{loading ? 'Loading handovers…' : history ? 'No confirmed handovers yet.' : 'No teacher submissions are awaiting review.'}</div>}
          {visible.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-2xl border p-4 text-left ${selectedId === item.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><div className="flex justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.teacherName}</p><p className="mt-1 text-xs text-slate-500">{getClassName(item.classId)} · {item.feeName} · {item.date}</p></div><p className="font-bold text-slate-900">{money(item.reportedAmount)}</p></div><span className="mt-3 inline-block rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase text-indigo-600">{item.status.replaceAll('_', ' ')}</span></button>)}
        </div>
        {selected ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-600 p-2.5 text-white"><ClipboardCheck size={20} /></div><div><h3 className="font-semibold text-slate-900">{selected.teacherName} — {selected.feeName}</h3><p className="text-xs text-slate-500">Submitted {selected.submittedAt ? new Date(Number(selected.submittedAt)).toLocaleString() : 'as draft'}</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Expected', selected.expectedAmount], ['Reported', selected.reportedAmount], ['Cash', selected.reportedCash], ['MoMo/Bank', selected.reportedMomo + selected.reportedBank]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white p-3"><p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-900">{money(Number(value))}</p></div>)}</div>
          {!history && selected.status === 'submitted' && <><div className="mt-5 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-600">Cash received<input type="number" value={review.cash} onChange={(e) => setReview({...review, cash:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">MoMo verified<input type="number" value={review.momo} onChange={(e) => setReview({...review, momo:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-600">Bank verified<input type="number" value={review.bank} onChange={(e) => setReview({...review, bank:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label></div><div className={`mt-3 rounded-xl p-3 text-sm font-semibold ${Math.abs(difference) < .005 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>Received: {money(receivedTotal)} · Difference: {money(difference)}</div><input value={review.reference} onChange={(e) => setReview({...review, reference:e.target.value})} placeholder="Handover receipt/reference (optional)" className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /><textarea value={review.note} onChange={(e) => setReview({...review, note:e.target.value})} placeholder="Confirmation note or required return reason" className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /><div className="mt-4 flex flex-wrap justify-end gap-2"><button disabled={processing} onClick={returnBatch} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-700"><RotateCcw size={16} /> Return for correction</button><button disabled={processing} onClick={confirm} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{processing ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Confirm & sign</button></div></>}
          {history && <div className="mt-5 rounded-xl bg-white p-4 text-sm text-slate-600"><div className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={18} /> {selected.status.replaceAll('_', ' ')}</div><p className="mt-2">Received: {money(selected.receivedAmount)} · Difference: {money(selected.difference)}</p><p className="mt-1">Confirmed by {selected.reviewedByName || 'Management'}{selected.reviewedAt ? ` on ${new Date(Number(selected.reviewedAt)).toLocaleString()}` : ''}</p>{selected.reviewNote && <p className="mt-2 rounded-lg bg-slate-50 p-2">{selected.reviewNote}</p>}</div>}
        </div> : <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500">Select a handover to review it.</div>}
      </div>
    </section>
  );
};

export default DailyCollectionHandover;
