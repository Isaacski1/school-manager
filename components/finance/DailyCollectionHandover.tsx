import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchool } from "../../context/SchoolContext";
import { useSchoolClasses } from "../../hooks/useSchoolClasses";
import { db } from "../../services/mockDb";
import { showToast } from "../../services/toast";
import { DailyCollectionBatch, DailyCollectionRecord, DailyCollectionStatus, Student } from "../../types";

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
  const [collectionRows, setCollectionRows] = useState<DailyCollectionRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentFilter, setStudentFilter] = useState<"all" | DailyCollectionStatus>("all");
  const [loadingStudents, setLoadingStudents] = useState(false);
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

  useEffect(() => {
    if (!selected || !schoolId) {
      setCollectionRows([]);
      setStudents([]);
      return;
    }
    let cancelled = false;
    setLoadingStudents(true);
    Promise.all([
      db.getDailyCollections({ schoolId, date: selected.date, classId: selected.classId }),
      db.getStudents(schoolId, selected.classId),
    ]).then(([records, studentRows]) => {
      if (cancelled) return;
      setCollectionRows(records.filter((record) => record.batchId === selected.id));
      setStudents(studentRows);
      setStudentFilter("all");
    }).catch((error) => {
      console.error("Failed to load handover student details", error);
      if (!cancelled) showToast("Could not load the students in this handover.", { type: "error" });
    }).finally(() => {
      if (!cancelled) setLoadingStudents(false);
    });
    return () => { cancelled = true; };
  }, [selected?.id, schoolId]);

  const studentNameMap = useMemo(
    () => new Map(students.map((student) => [student.id, student.name])),
    [students],
  );
  const filteredCollectionRows = useMemo(
    () => collectionRows
      .filter((record) => studentFilter === "all" || record.status === studentFilter)
      .sort((a, b) => (studentNameMap.get(a.studentId) || a.studentId).localeCompare(studentNameMap.get(b.studentId) || b.studentId)),
    [collectionRows, studentFilter, studentNameMap],
  );
  const statusCounts = useMemo(() => ({
    paid: collectionRows.filter((row) => row.status === "paid").length,
    partial: collectionRows.filter((row) => row.status === "partial").length,
    unpaid: collectionRows.filter((row) => row.status === "unpaid").length,
    absent: collectionRows.filter((row) => row.status === "absent").length,
    exempt: collectionRows.filter((row) => row.status === "exempt").length,
  }), [collectionRows]);

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
    <section className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-indigo-100 bg-white p-3 shadow-sm sm:rounded-[30px] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Management control</p><h2 className="mt-1 text-2xl font-semibold text-slate-900">Teacher Cash Handover</h2><p className="mt-1 text-sm text-slate-500">Receive, reconcile and sign daily teacher submissions.</p></div>
        <div className="flex w-full gap-2 sm:w-auto"><button onClick={() => { setHistory(false); setSelectedId(''); }} className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-xs font-semibold sm:flex-none sm:text-sm ${!history ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Pending ({batches.filter((item) => item.status === 'submitted').length})</button><button onClick={() => { setHistory(true); setSelectedId(''); }} className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-xs font-semibold sm:flex-none sm:text-sm ${history ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>History</button><button onClick={load} className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-500"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button></div>
      </div>
      <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
        <p className="text-sm font-semibold text-indigo-950">What management should do</p>
        <ol className="mt-2 grid gap-2 text-xs leading-5 text-indigo-900 sm:grid-cols-2 lg:grid-cols-4">
          <li><strong>1. Select a submission</strong> and review the paid, partial and unpaid pupil entries.</li>
          <li><strong>2. Count the cash</strong> physically handed over by the teacher.</li>
          <li><strong>3. Verify MoMo and Bank</strong> against the school account or transaction messages.</li>
          <li><strong>4. Confirm & sign</strong> when correct, or enter a reason and return it for correction.</li>
        </ol>
      </div>
      <div className="mt-5 grid min-w-0 max-w-full gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 max-w-full space-y-2">
          {!visible.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{loading ? 'Loading handovers…' : history ? 'No confirmed handovers yet.' : 'No teacher submissions are awaiting review.'}</div>}
          {visible.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`block w-full min-w-0 max-w-full overflow-hidden rounded-2xl border p-3 text-left sm:p-4 ${selectedId === item.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{item.teacherName}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500">{getClassName(item.classId)} · {item.feeName} · {item.date}</p></div><p className="shrink-0 text-sm font-bold text-slate-900 sm:text-base">{money(item.reportedAmount)}</p></div><span className="mt-3 inline-block max-w-full rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase text-indigo-600 sm:text-[11px]">{item.status.replaceAll('_', ' ')}</span></button>)}
        </div>
        {selected ? <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-5">
          <div className="flex min-w-0 items-start gap-3"><div className="shrink-0 rounded-xl bg-indigo-600 p-2.5 text-white"><ClipboardCheck size={20} /></div><div className="min-w-0"><h3 className="break-words font-semibold leading-5 text-slate-900">{selected.teacherName} — {selected.feeName}</h3><p className="mt-1 break-words text-xs text-slate-500">Submitted {selected.submittedAt ? new Date(Number(selected.submittedAt)).toLocaleString() : 'as draft'}</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Expected', selected.expectedAmount], ['Reported', selected.reportedAmount], ['Cash', selected.reportedCash], ['MoMo/Bank', selected.reportedMomo + selected.reportedBank]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white p-3"><p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-900">{money(Number(value))}</p></div>)}</div>
          <div className="mt-5 min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h4 className="font-semibold text-slate-900">Student payment breakdown</h4><p className="mt-1 text-xs text-slate-500">Verify the reported total against each pupil’s entry.</p></div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ["all", `All ${collectionRows.length}`],
                  ["paid", `Paid ${statusCounts.paid}`],
                  ["partial", `Partial ${statusCounts.partial}`],
                  ["unpaid", `Unpaid ${statusCounts.unpaid}`],
                  ["absent", `Absent ${statusCounts.absent}`],
                  ["exempt", `Exempt ${statusCounts.exempt}`],
                ] as const).map(([value, label]) => <button key={value} onClick={() => setStudentFilter(value)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${studentFilter === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}
              </div>
            </div>
            <div className="mt-3 max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5">Student</th><th className="px-3 py-2.5 text-right">Expected</th><th className="px-3 py-2.5 text-right">Paid</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Method</th><th className="px-3 py-2.5">Note</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingStudents ? <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Loading student payments…</td></tr> : filteredCollectionRows.length ? filteredCollectionRows.map((record) => <tr key={record.id}><td className="px-3 py-2.5 font-semibold text-slate-800">{studentNameMap.get(record.studentId) || record.studentId}</td><td className="px-3 py-2.5 text-right text-slate-600">{money(record.expectedAmount)}</td><td className="px-3 py-2.5 text-right font-semibold text-slate-900">{money(record.amountPaid)}</td><td className="px-3 py-2.5"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${record.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : record.status === 'partial' ? 'bg-amber-50 text-amber-700' : record.status === 'unpaid' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{record.status}</span></td><td className="px-3 py-2.5 text-slate-600">{record.amountPaid > 0 ? record.paymentMethod : '—'}</td><td className="max-w-48 truncate px-3 py-2.5 text-slate-500" title={record.note || ''}>{record.note || '—'}</td></tr>) : <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No students match this filter.</td></tr>}
                </tbody>
                {collectionRows.length > 0 && <tfoot className="bg-slate-50 font-semibold text-slate-800"><tr><td className="px-3 py-2.5">{filteredCollectionRows.length} students</td><td className="px-3 py-2.5 text-right">{money(filteredCollectionRows.reduce((sum, row) => sum + row.expectedAmount, 0))}</td><td className="px-3 py-2.5 text-right">{money(filteredCollectionRows.reduce((sum, row) => sum + row.amountPaid, 0))}</td><td colSpan={3}></td></tr></tfoot>}
              </table>
            </div>
          </div>
          {!history && selected.status === 'submitted' && <><div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Before confirming:</strong> Count the physical cash and enter what you actually received—not just the expected pupil total. Verify MoMo and Bank separately. A zero difference means the teacher handed over all money they recorded; pupils may still have unpaid balances.</div><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-3"><label className="min-w-0 text-xs font-semibold text-slate-600">Cash received<span className="mt-0.5 block font-normal text-slate-400">Physical cash counted</span><input type="number" value={review.cash} onChange={(e) => setReview({...review, cash:e.target.value})} className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label><label className="min-w-0 text-xs font-semibold text-slate-600">MoMo verified<span className="mt-0.5 block font-normal text-slate-400">Confirmed in MoMo account</span><input type="number" value={review.momo} onChange={(e) => setReview({...review, momo:e.target.value})} className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label><label className="min-w-0 text-xs font-semibold text-slate-600">Bank verified<span className="mt-0.5 block font-normal text-slate-400">Confirmed in bank account</span><input type="number" value={review.bank} onChange={(e) => setReview({...review, bank:e.target.value})} className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label></div><div className={`mt-3 break-words rounded-xl p-3 text-sm font-semibold ${Math.abs(difference) < .005 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>Received: {money(receivedTotal)} · Difference: {money(difference)}<span className="mt-1 block text-xs font-normal">Difference = money verified by management minus money reported by the teacher.</span></div><input value={review.reference} onChange={(e) => setReview({...review, reference:e.target.value})} placeholder="Receipt, cashbook, MoMo or bank reference (optional)" className="mt-3 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /><textarea value={review.note} onChange={(e) => setReview({...review, note:e.target.value})} placeholder="Write a confirmation note, or explain why the register is being returned" className="mt-3 min-h-20 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /><div className="mt-4 grid gap-2 sm:flex sm:justify-end"><button disabled={processing} onClick={returnBatch} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 px-3 py-2.5 text-xs font-semibold text-amber-700 sm:w-auto sm:px-4 sm:text-sm"><RotateCcw size={16} /> Return for correction</button><button disabled={processing} onClick={confirm} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-60 sm:w-auto sm:px-5 sm:text-sm">{processing ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Confirm & sign</button></div></>}
          {history && <div className="mt-5 rounded-xl bg-white p-4 text-sm text-slate-600"><div className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={18} /> {selected.status.replaceAll('_', ' ')}</div><p className="mt-2">Received: {money(selected.receivedAmount)} · Difference: {money(selected.difference)}</p><p className="mt-1">Confirmed by {selected.reviewedByName || 'Management'}{selected.reviewedAt ? ` on ${new Date(Number(selected.reviewedAt)).toLocaleString()}` : ''}</p>{selected.reviewNote && <p className="mt-2 rounded-lg bg-slate-50 p-2">{selected.reviewNote}</p>}</div>}
        </div> : <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500">Select a handover to review it.</div>}
      </div>
    </section>
  );
};

export default DailyCollectionHandover;
