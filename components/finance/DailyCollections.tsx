import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Bus,
  CalendarDays,
  CheckCircle2,
  Plus,
  RefreshCw,
  Save,
  Utensils,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSchool } from "../../context/SchoolContext";
import { useSchoolClasses } from "../../hooks/useSchoolClasses";
import { db } from "../../services/mockDb";
import { showToast } from "../../services/toast";
import {
  DailyBillingMode,
  DailyCollectionRecord,
  DailyCollectionStatus,
  DailyCollectionBatch,
  DailyFeeDefinition,
  PaymentMethod,
  Student,
} from "../../types";

type DraftRow = {
  amountPaid: string;
  status: DailyCollectionStatus;
  paymentMethod: PaymentMethod;
  note: string;
};

const todayKey = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const money = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(value || 0);

const statusOptions: { value: DailyCollectionStatus; label: string }[] = [
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "unpaid", label: "Unpaid" },
  { value: "absent", label: "Absent" },
  { value: "exempt", label: "Exempt" },
];

const DailyCollections: React.FC<{ teacherMode?: boolean }> = ({ teacherMode = false }) => {
  const { school } = useSchool();
  const { user } = useAuth();
  const { classes: schoolClasses, getClassName } = useSchoolClasses();
  const classes = useMemo(
    () => teacherMode
      ? schoolClasses.filter((item) => (user?.assignedClassIds || []).includes(item.id))
      : schoolClasses,
    [schoolClasses, teacherMode, user?.assignedClassIds],
  );
  const schoolId = school?.id || user?.schoolId || "";
  const [date, setDate] = useState(todayKey);
  const [classId, setClassId] = useState("");
  const [feeId, setFeeId] = useState("");
  const [fees, setFees] = useState<DailyFeeDefinition[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [saved, setSaved] = useState<DailyCollectionRecord[]>([]);
  const [batch, setBatch] = useState<DailyCollectionBatch | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingFee, setSavingFee] = useState(false);
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [feeForm, setFeeForm] = useState({
    name: "Feeding",
    amount: "",
    classId: "all",
    billingMode: "pay_as_you_go" as DailyBillingMode,
  });

  const applicableFees = useMemo(
    () => fees.filter((fee) => fee.active && (!fee.classId || fee.classId === classId)),
    [fees, classId],
  );
  const selectedFee = applicableFees.find((fee) => fee.id === feeId);
  const registerLocked = Boolean(batch && ["submitted", "confirmed", "confirmed_with_difference", "rejected"].includes(batch.status));
  const batchId = selectedFee && classId
    ? `${date}_${classId}_${selectedFee.id}_${user?.id || "collector"}`.replace(/[^a-zA-Z0-9_-]/g, "_")
    : "";

  const loadFees = useCallback(async () => {
    if (!schoolId) return;
    const rows = await db.getDailyFees(schoolId);
    setFees(rows.sort((a, b) => a.name.localeCompare(b.name)));
  }, [schoolId]);

  useEffect(() => {
    loadFees().catch(() => showToast("Could not load daily fee types.", { type: "error" }));
  }, [loadFees]);

  useEffect(() => {
    if (!classId || !applicableFees.some((fee) => fee.id === feeId)) {
      setFeeId(applicableFees[0]?.id || "");
    }
  }, [classId, feeId, applicableFees]);

  const loadRegister = useCallback(async () => {
    if (!schoolId || !classId || !feeId) {
      setStudents([]);
      setSaved([]);
      setDrafts({});
      return;
    }
    setLoading(true);
    try {
      const [studentRows, collectionRows, batchRows] = await Promise.all([
        db.getStudents(schoolId, classId),
        db.getDailyCollections({ schoolId, date, classId }),
        db.getDailyCollectionBatches({ schoolId, date, classId, ...(teacherMode && user?.id ? { teacherId: user.id } : {}) }),
      ]);
      const feeRows = collectionRows.filter((row) => row.feeId === feeId);
      const byStudent = new Map(feeRows.map((row) => [row.studentId, row]));
      const nextDrafts: Record<string, DraftRow> = {};
      studentRows.forEach((student) => {
        const existing = byStudent.get(student.id);
        nextDrafts[student.id] = {
          amountPaid: existing ? String(existing.amountPaid) : "",
          status: existing?.status || "unpaid",
          paymentMethod: existing?.paymentMethod || "Cash",
          note: existing?.note || "",
        };
      });
      setStudents([...studentRows].sort((a, b) => a.name.localeCompare(b.name)));
      setSaved(feeRows);
      setBatch(batchRows.find((item) => item.feeId === feeId && (!teacherMode || item.teacherId === user?.id)) || null);
      setDrafts(nextDrafts);
    } catch (error) {
      console.error("Failed to load daily collection register", error);
      showToast("Could not load the daily collection register.", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [schoolId, classId, feeId, date, teacherMode, user?.id]);

  useEffect(() => {
    loadRegister();
  }, [loadRegister]);

  const updateDraft = (studentId: string, patch: Partial<DraftRow>) => {
    setDrafts((current) => ({
      ...current,
      [studentId]: { ...current[studentId], ...patch },
    }));
  };

  const applyStatus = (studentId: string, status: DailyCollectionStatus) => {
    const amountPaid = status === "paid" ? String(selectedFee?.amount || 0) :
      status === "absent" || status === "exempt" || status === "unpaid" ? "" : drafts[studentId]?.amountPaid || "";
    updateDraft(studentId, { status, amountPaid });
  };

  const markAllPaid = () => {
    if (!selectedFee) return;
    setDrafts((current) => Object.fromEntries(students.map((student) => [student.id, {
      ...(current[student.id] || { paymentMethod: "Cash", note: "" }),
      status: "paid",
      amountPaid: String(selectedFee.amount),
    }])));
  };

  const saveRegister = async (submit = false) => {
    if (!selectedFee || !user?.id || !schoolId) return;
    if (registerLocked) {
      showToast("This register is locked while awaiting management review.", { type: "error" });
      return;
    }
    const now = Date.now();
    const records: DailyCollectionRecord[] = students.map((student) => {
      const draft = drafts[student.id];
      const amountPaid = Math.max(0, Number(draft?.amountPaid) || 0);
      let status = draft?.status || "unpaid";
      if (!["absent", "exempt"].includes(status)) {
        status = amountPaid >= selectedFee.amount ? "paid" : amountPaid > 0 ? "partial" : "unpaid";
      }
      return {
        id: `${date}_${classId}_${selectedFee.id}_${student.id}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
        schoolId,
        date,
        classId,
        studentId: student.id,
        feeId: selectedFee.id,
        feeName: selectedFee.name,
        expectedAmount: selectedFee.amount,
        amountPaid,
        status,
        paymentMethod: draft?.paymentMethod || "Cash",
        billingMode: selectedFee.billingMode,
        note: draft?.note?.trim() || null,
        createdAt: saved.find((row) => row.studentId === student.id)?.createdAt || now,
        updatedAt: now,
        recordedBy: user.id,
        batchId,
      };
    });
    setSaving(true);
    try {
      await db.saveDailyCollections(records);
      const reportedCash = records.filter((row) => row.paymentMethod === "Cash").reduce((sum, row) => sum + row.amountPaid, 0);
      const reportedMomo = records.filter((row) => row.paymentMethod === "MoMo").reduce((sum, row) => sum + row.amountPaid, 0);
      const reportedBank = records.filter((row) => row.paymentMethod === "Bank").reduce((sum, row) => sum + row.amountPaid, 0);
      const nextBatch: DailyCollectionBatch = {
        id: batchId,
        schoolId,
        date,
        classId,
        feeId: selectedFee.id,
        feeName: selectedFee.name,
        teacherId: user.id,
        teacherName: user.fullName || user.email || "Collector",
        expectedAmount: records.filter((row) => !["absent", "exempt"].includes(row.status)).reduce((sum, row) => sum + row.expectedAmount, 0),
        reportedAmount: records.reduce((sum, row) => sum + row.amountPaid, 0),
        reportedCash,
        reportedMomo,
        reportedBank,
        studentCount: records.length,
        paidCount: records.filter((row) => row.status === "paid").length,
        status: submit ? "submitted" : batch?.status === "returned" ? "returned" : "draft",
        submittedAt: submit ? now : batch?.submittedAt || null,
        createdAt: batch?.createdAt || now,
        updatedAt: now,
      };
      await db.saveDailyCollectionBatch(nextBatch);
      showToast(submit ? "Register submitted to the head teacher." : `Daily register saved for ${students.length} students.`, { type: "success" });
      await loadRegister();
    } catch (error) {
      console.error("Failed to save daily collections", error);
      showToast("Failed to save the daily register.", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const saveFee = async () => {
    const amount = Number(feeForm.amount);
    if (!schoolId || !user?.id || !feeForm.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a fee name and valid daily amount.", { type: "error" });
      return;
    }
    const fee: DailyFeeDefinition = {
      id: `${schoolId}_${feeForm.name}_${feeForm.classId}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
      schoolId,
      name: feeForm.name.trim(),
      amount,
      classId: feeForm.classId === "all" ? null : feeForm.classId,
      billingMode: feeForm.billingMode,
      active: true,
      createdAt: Date.now(),
      createdBy: user.id,
    };
    setSavingFee(true);
    try {
      await db.saveDailyFee(fee);
      await loadFees();
      setFeeId(fee.id);
      setShowFeeForm(false);
      setFeeForm({ name: "Feeding", amount: "", classId: "all", billingMode: "pay_as_you_go" });
      showToast("Daily fee type created.", { type: "success" });
    } catch (error) {
      console.error("Failed to save daily fee", error);
      showToast("Could not create the daily fee type.", { type: "error" });
    } finally {
      setSavingFee(false);
    }
  };

  const totals = useMemo(() => {
    const rows = students.map((student) => drafts[student.id]).filter(Boolean);
    const collected = rows.reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0);
    const chargeable = rows.filter((row) => !["absent", "exempt"].includes(row.status)).length;
    const expected = chargeable * (selectedFee?.amount || 0);
    return {
      expected,
      collected,
      outstanding: Math.max(0, expected - collected),
      paid: rows.filter((row) => row.status === "paid").length,
      cash: rows.filter((row) => row.paymentMethod === "Cash").reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0),
      momo: rows.filter((row) => row.paymentMethod === "MoMo").reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0),
      bank: rows.filter((row) => row.paymentMethod === "Bank").reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0),
    };
  }, [students, drafts, selectedFee]);

  return (
    <section id="daily-collections" className="rounded-[30px] border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Daily operations</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Daily Collections</h2>
          <p className="mt-1 text-sm text-slate-500">Collect feeding, bus and other daily fees class by class.</p>
        </div>
        {!teacherMode && <button onClick={() => setShowFeeForm((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          <Plus size={17} /> Add daily fee
        </button>}
      </div>

      <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950">
        <p className="font-semibold">How daily collections work</p>
        {teacherMode ? (
          <ol className="mt-2 grid gap-2 text-xs leading-5 text-blue-900 sm:grid-cols-2 lg:grid-cols-4">
            <li><strong>1. Select:</strong> Choose the date, your assigned class and the daily fee.</li>
            <li><strong>2. Record:</strong> Mark each pupil paid, partial, unpaid, absent or exempt and enter the payment method.</li>
            <li><strong>3. Check:</strong> Confirm the cash, MoMo and bank totals shown above the register.</li>
            <li><strong>4. Submit:</strong> Submit to the head teacher, then hand over the reported cash for confirmation.</li>
          </ol>
        ) : (
          <ol className="mt-2 grid gap-2 text-xs leading-5 text-blue-900 sm:grid-cols-2 lg:grid-cols-4">
            <li><strong>1. Set up:</strong> Create Feeding, Transport, Extra Classes or another daily fee and assign its classes.</li>
            <li><strong>2. Teachers collect:</strong> Teachers record pupil payments and submit their completed class registers.</li>
            <li><strong>3. Management verifies:</strong> Open Teacher Cash Handover, review the pupil list and count the money received.</li>
            <li><strong>4. Confirm:</strong> Verify Cash, MoMo and Bank, record any difference, then confirm or return the register.</li>
          </ol>
        )}
        <p className="mt-3 border-t border-blue-100 pt-2 text-xs text-blue-700">
          Paid and partial describe what the pupil paid. The handover difference describes whether the teacher submitted all money collected; these are separate checks.
        </p>
      </div>

      {showFeeForm && (
        <div className="mt-5 grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 md:grid-cols-5">
          <input value={feeForm.name} onChange={(e) => setFeeForm({ ...feeForm, name: e.target.value })} placeholder="Fee name" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <input type="number" min="0" step="0.01" value={feeForm.amount} onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })} placeholder="Daily amount" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
          <select value={feeForm.classId} onChange={(e) => setFeeForm({ ...feeForm, classId: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            <option value="all">All classes</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={feeForm.billingMode} onChange={(e) => setFeeForm({ ...feeForm, billingMode: e.target.value as DailyBillingMode })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            <option value="pay_as_you_go">No debt on missed day</option><option value="daily_debt">Unpaid becomes debt</option>
          </select>
          <button
            onClick={saveFee}
            disabled={savingFee}
            aria-busy={savingFee}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
          >
            {savingFee ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save size={16} />
                Save fee type
              </>
            )}
          </button>
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <label className="relative"><CalendarDays className="absolute left-3 top-3 text-slate-400" size={18} /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm" /></label>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={feeId} onChange={(e) => setFeeId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Select daily fee</option>{applicableFees.map((fee) => <option key={fee.id} value={fee.id}>{fee.name} — {money(fee.amount)}</option>)}</select>
      </div>

      {selectedFee && classId && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[['Expected', totals.expected], ['Collected', totals.collected], ['Outstanding', totals.outstanding], ['Cash', totals.cash], ['MoMo', totals.momo], ['Bank', totals.bank]].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-base font-bold text-slate-900">{money(Number(value))}</p></div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500"><strong className="text-slate-800">{getClassName(classId)}</strong> · {students.length} pupils · {totals.paid} fully paid</p>
            <div className="flex gap-2"><button onClick={markAllPaid} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} /> Mark all paid</button><button onClick={loadRegister} className="rounded-xl border border-slate-200 p-2 text-slate-500"><RefreshCw size={18} /></button></div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Method</th><th className="px-3 py-3">Note</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Loading register…</td></tr> : students.map((student) => { const row = drafts[student.id]; return <tr key={student.id}><td className="px-4 py-3 font-semibold text-slate-800">{student.name}</td><td className="px-3 py-2"><select value={row?.status || 'unpaid'} onChange={(e) => applyStatus(student.id, e.target.value as DailyCollectionStatus)} className="rounded-lg border border-slate-200 px-2 py-2">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td><td className="px-3 py-2"><input type="number" min="0" step="0.01" value={row?.amountPaid || ''} disabled={['absent','exempt'].includes(row?.status)} onChange={(e) => updateDraft(student.id, { amountPaid: e.target.value, status: Number(e.target.value) >= selectedFee.amount ? 'paid' : Number(e.target.value) > 0 ? 'partial' : 'unpaid' })} className="w-28 rounded-lg border border-slate-200 px-3 py-2 disabled:bg-slate-100" placeholder="0.00" /></td><td className="px-3 py-2"><select value={row?.paymentMethod || 'Cash'} onChange={(e) => updateDraft(student.id, { paymentMethod: e.target.value as PaymentMethod })} className="rounded-lg border border-slate-200 px-2 py-2"><option>Cash</option><option>MoMo</option><option>Bank</option></select></td><td className="px-3 py-2"><input value={row?.note || ''} onChange={(e) => updateDraft(student.id, { note: e.target.value })} placeholder="Optional note" className="w-full rounded-lg border border-slate-200 px-3 py-2" /></td></tr>; })}</tbody>
            </table>
          </div>
          {batch && <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${batch.status === 'returned' ? 'bg-amber-50 text-amber-700' : registerLocked ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>Status: {batch.status.replaceAll('_', ' ')}{batch.returnReason ? ` — ${batch.returnReason}` : ''}</div>}
          <div className="mt-4 flex min-w-0 flex-col gap-4 rounded-2xl bg-slate-900 p-3 text-white sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 shrink-0">{selectedFee.name.toLowerCase().includes('bus') ? <Bus size={20} /> : selectedFee.name.toLowerCase().includes('feed') ? <Utensils size={20} /> : <Banknote size={20} />}</span>
              <div className="min-w-0"><p className="break-words text-sm font-semibold sm:text-base">{selectedFee.name} register</p><p className="mt-1 text-xs leading-5 text-slate-300">{registerLocked ? 'Locked while management reviews this handover.' : selectedFee.billingMode === 'daily_debt' ? 'Unpaid pupils will remain outstanding.' : 'Missed payments do not automatically become debt.'}</p></div>
            </div>
            <div className={`grid w-full min-w-0 gap-2 sm:flex sm:w-auto sm:shrink-0 ${teacherMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <button disabled={saving || !students.length || registerLocked} onClick={() => saveRegister(false)} className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-white/20 px-2 py-2.5 text-xs font-semibold leading-4 text-white disabled:opacity-50 sm:px-4 sm:text-sm">{saving ? <RefreshCw size={16} className="shrink-0 animate-spin" /> : <Save size={16} className="shrink-0" />} <span className="whitespace-nowrap">Save draft</span></button>
              {teacherMode && <button disabled={saving || !students.length || registerLocked} onClick={() => saveRegister(true)} className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-xl bg-emerald-500 px-2 py-2.5 text-xs font-semibold leading-4 text-white disabled:opacity-50 sm:px-5 sm:text-sm"><span className="whitespace-nowrap sm:hidden">Submit register</span><span className="hidden whitespace-nowrap sm:inline">Submit to head teacher</span></button>}
            </div>
          </div>
        </>
      )}
      {!fees.length && !showFeeForm && <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Create the school’s first daily fee type to begin collecting.</div>}
    </section>
  );
};

export default DailyCollections;
