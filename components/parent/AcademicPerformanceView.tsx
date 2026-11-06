import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../../services/mockDb";
import {
  Assessment,
  SchoolConfig,
  Student,
} from "../../types";
import {
  calculateGrade,
  calculateTotalScore,
  getGradeColor,
} from "../../constants";
import { useAuth } from "../../context/AuthContext";
import { useSchool } from "../../context/SchoolContext";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SELECTED_STUDENT_STORAGE_KEY = "parentDashboard_selectedStudentId";

type TermType = 1 | 2 | 3;

interface TermPoint {
  term: number;
  academicYear: string;
  label: string;
  average: number;
  grade: string;
  subjectCount: number;
}

interface SubjectResult {
  subject: string;
  score: number;
  grade: string;
  color: string;
}

interface ComputedStats {
  terms: TermPoint[];
  currentTermPoint: TermPoint | null;
  currentAverage: number;
  currentGrade: ComputedGrade;
  subjects: SubjectResult[];
  subjectCount: number;
  highestGrade: string;
  highestSubject: string | null;
  insights: Array<{ label: string; value: string; icon: React.ReactNode; type: "positive" | "neutral" | "caution" }>;
  hasData: boolean;
}

interface ComputedGrade {
  total: number;
  grade: string;
  remark: string;
}

const EMPTY_GRADE: ComputedGrade = { total: 0, grade: "N/A", remark: "No results" };

function bestScoreForSubject(assessments: Assessment[]): number {
  return assessments.reduce(
    (best, a) => {
      const score = calculateTotalScore(a);
      return score > best ? score : best;
    },
    0,
  );
}

function groupAssessmentsByTerm(assessments: Assessment[]): TermPoint[] {
  const grouped: Record<string, Assessment[]> = {};
  assessments.forEach((a) => {
    const key = `${String(a.term)}-${String(a.academicYear)}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });

  return Object.entries(grouped).map(([key, assessments]) => {
    const [termStr, academicYear] = key.split("-");
    const termNum = parseInt(termStr, 10) as TermType;
    const bySubject: Record<string, Assessment[]> = {};
    assessments.forEach((a) => {
      if (!bySubject[a.subject]) bySubject[a.subject] = [];
      bySubject[a.subject].push(a);
    });
    const subjectScores = Object.values(bySubject).map(bestScoreForSubject);
    const average =
      subjectScores.length > 0
        ? subjectScores.reduce((sum, s) => sum + s, 0) / subjectScores.length
        : 0;
    const gradeInfo = calculateGrade(average);
    return {
      term: termNum,
      academicYear,
      label: `Term ${termNum}`,
      average: Math.round(average * 10) / 10,
      grade: gradeInfo.grade,
      subjectCount: subjectScores.length,
    };
  });
}

function sortTerms(terms: TermPoint[]): TermPoint[] {
  return [...terms].sort((a, b) => {
    if (a.academicYear !== b.academicYear) {
      return a.academicYear.localeCompare(b.academicYear);
    }
    return a.term - b.term;
  });
}

function getSubjectColor(subject: string): string {
  const colors: Record<string, string> = {
    "Creative Art": "#3b82f6",
    "Creative Arts": "#3b82f6",
    "Creative Arts & Design": "#3b82f6",
    "Literacy & Language": "#10b981",
    Literacy: "#10b981",
    Language: "#10b981",
    Numeracy: "#f59e0b",
    Mathematics: "#f59e0b",
    OWOP: "#a855f7",
    "Our World Our People (OWOP)": "#a855f7",
    "Physical Education": "#14b8a6",
    "Physical Development": "#14b8a6",
    "English Language": "#3b82f6",
    "Integrated Science": "#ef4444",
    Science: "#ef4444",
    "Social Studies": "#8b5cf6",
    ICT: "#06b6d4",
    "Religious & Moral Education (RME)": "#f97316",
    "Ghanaian Language": "#ec4899",
    French: "#84cc16",
    "Career Technology": "#6366f1",
    "Computing / Coding": "#0ea5e9",
    "Environmental Studies": "#84cc16",
    "Social & Emotional Development": "#a855f7",
    "Rhymes, Songs & Storytelling": "#f43f5e",
  };
  return colors[subject] || "#6366f1";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

const CustomTooltip = ({ active, payload }: { active: boolean; payload: any[] }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as TermPoint;
  return (
    <div className="min-w-[140px] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-sm text-slate-900">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
        {point.label} &middot; {point.academicYear}
      </p>
      <div className="text-lg font-bold text-[#0B4A82]">{formatPercent(point.average)}</div>
      <p className="text-xs text-slate-500 mt-1">
        {point.subjectCount} subject{point.subjectCount !== 1 ? "s" : ""}
      </p>
    </div>
  );
};

const AcademicPerformanceView: React.FC = () => {
  const { user } = useAuth();
  const { school, schoolConfig } = useSchool();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [config, setConfig] = useState<SchoolConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);

  const academicYearParam = searchParams.get("academicYear") || undefined;

  const resolveSelectedChild = useCallback((): string | null => {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem(SELECTED_STUDENT_STORAGE_KEY) || null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const currentFetch = ++fetchRef.current;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const storedId = resolveSelectedChild();
        if (!storedId) {
          setSelectedStudentId(null);
          setSelectedStudent(null);
          setStudents([]);
          setAssessments([]);
          setConfig(null);
          setLoading(false);
          return;
        }

        setSelectedStudentId(storedId);

        const [student, cfg] = await Promise.all([
          db.getStudent(storedId),
          school?.id ? db.getSchoolConfig(school.id) : null,
        ]);

        if (cancelled || currentFetch !== fetchRef.current) return;

        if (!student) {
          setError("Student record could not be found.");
          setSelectedStudent(null);
          setAssessments([]);
          setConfig(cfg ?? null);
          setLoading(false);
          return;
        }

        setSelectedStudent(student);
        setConfig(cfg ?? null);

        const scopedSchoolId = student.schoolId || school?.id;
        let fetched: Assessment[] = [];
        if (scopedSchoolId) {
          fetched = await db.getStudentAssessmentsByStudent(scopedSchoolId, storedId);
        }

        if (cancelled || currentFetch !== fetchRef.current) return;

        setAssessments(fetched);
      } catch (err: any) {
        if (cancelled || currentFetch !== fetchRef.current) return;
        console.error("[AcademicPerformance] Load error:", err);
        setError(
          err?.message ||
            "Failed to load academic performance. Please try again.",
        );
      } finally {
        if (!cancelled && currentFetch === fetchRef.current) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [resolveSelectedChild, school?.id, schoolConfig]);

  // Re-resolve when the shared sessionStorage selection changes (e.g. another tab switches children)
  useEffect(() => {
    const handleStorage = () => {
      const id = resolveSelectedChild();
      setSelectedStudentId(id);
    };
    window.addEventListener("storage", handleStorage);
    // Periodic light re-check keeps the page in sync with ParentDashboard tab switches
    const timer = setInterval(() => {
      const id = resolveSelectedChild();
      setSelectedStudentId((prev) => {
        if (prev !== id) {
          // Trigger a full reload by clearing cached student so the load effect re-runs
          setSelectedStudent(null);
          setAssessments([]);
          setConfig(null);
        }
        return id;
      });
    }, 2000);
    return () => {
      window.removeEventListener("storage", handleStorage);
      clearInterval(timer);
    };
  }, [resolveSelectedChild]);

  const stats = useMemo<ComputedStats>(() => {
    if (!selectedStudent || assessments.length === 0) {
      return {
        terms: [],
        currentTermPoint: null,
        currentAverage: 0,
        currentGrade: EMPTY_GRADE,
        subjects: [],
        subjectCount: 0,
        highestGrade: "N/A",
        highestSubject: null,
        insights: [],
        hasData: false,
      };
    }

    const terms = sortTerms(groupAssessmentsByTerm(assessments));
    const currentTermPoint = terms.length > 0 ? terms[terms.length - 1] : null;
    const currentAverage = currentTermPoint ? currentTermPoint.average : 0;
    const currentGrade = currentTermPoint
      ? calculateGrade(currentTermPoint.average, config?.gradingScale)
      : EMPTY_GRADE;

    // Subject results for the current term
    const subjects: SubjectResult[] = [];
    if (currentTermPoint) {
      const termAssessments = assessments.filter(
        (a) =>
          String(a.term) === String(currentTermPoint.term) &&
          String(a.academicYear) === String(currentTermPoint.academicYear),
      );
      const bySubject: Record<string, Assessment[]> = {};
      termAssessments.forEach((a) => {
        if (!bySubject[a.subject]) bySubject[a.subject] = [];
        bySubject[a.subject].push(a);
      });
      Object.entries(bySubject).forEach(([subject, list]) => {
        const score = bestScoreForSubject(list);
        subjects.push({
          subject,
          score,
          grade: calculateGrade(score, config?.gradingScale).grade,
          color: getSubjectColor(subject),
        });
      });
      subjects.sort((a, b) => b.score - a.score);
    }

    const subjectCount = subjects.length;

    // Highest grade + subject
    let highestGrade = "N/A";
    let highestSubject: string | null = null;
    let bestScore = -1;
    subjects.forEach((s) => {
      const gradeOrder: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
      const order = gradeOrder[s.grade] ?? 0;
      if (order > 0 && s.score >= bestScore) {
        bestScore = s.score;
        highestGrade = s.grade;
        highestSubject = s.subject;
      }
    });

    // Insights
    const insights: ComputedStats["insights"] = [];

    if (terms.length >= 2) {
      const latest = terms[terms.length - 1];
      const previous = terms[terms.length - 2];
      const diff = latest.average - previous.average;
      if (diff > 0.5) {
        insights.push({
          label: "Performance is improving",
          value: `+${formatPercent(diff)} vs ${previous.label}`,
          icon: <TrendingUp size={18} className="text-emerald-600" />,
          type: "positive",
        });
      } else if (diff < -0.5) {
        insights.push({
          label: "Performance has declined",
          value: `${formatPercent(diff)} vs ${previous.label}`,
          icon: <TrendingDown size={18} className="text-rose-600" />,
          type: "caution",
        });
      } else {
        insights.push({
          label: "Performance is consistent",
          value: `${formatPercent(latest.average)} average`,
          icon: <Activity size={18} className="text-slate-500" />,
          type: "neutral",
        });
      }
    }

    if (subjects.length > 0) {
      const top = subjects[0];
      insights.push({
        label: `Strong performance in ${top.subject}`,
        value: formatPercent(top.score),
        icon: <CheckCircle2 size={18} className="text-emerald-600" />,
        type: "positive",
      });

      const bottom = subjects[subjects.length - 1];
      const passMark = config?.passMark ?? 50;
      if (bottom !== top && bottom.score < passMark) {
        insights.push({
          label: `${bottom.subject} requires additional attention`,
          value: formatPercent(bottom.score),
          icon: <ArrowUpRight size={18} className="text-amber-600" />,
          type: "caution",
        });
      }
    }

    if (insights.length === 0) {
      insights.push({
        label: "No comparable terms available",
        value: "More published results needed",
        icon: <Activity size={18} className="text-slate-400" />,
        type: "neutral",
      });
    }

    return {
      terms,
      currentTermPoint,
      currentAverage,
      currentGrade,
      subjects,
      subjectCount,
      highestGrade,
      highestSubject,
      insights,
      hasData: true,
    };
  }, [selectedStudent, assessments, config]);

  // Handle child switching triggered from sessionStorage by re-loading
  useEffect(() => {
    // Intentionally empty: the load effect above re-runs when deps change.
    // This effect exists to satisfy exhaustive-deps patterns cleanly.
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#0B4A82] animate-spin" />
          <p className="text-slate-500 text-sm">Loading academic performance...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
          <ArrowUpRight size={24} />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">Unable to load results</h3>
        <p className="text-slate-500 text-sm max-w-xs mb-4">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            window.location.reload();
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0B4A82] px-4 py-2 text-sm font-medium text-white hover:bg-[#083a68] transition-colors"
        >
          <ArrowUpRight size={16} /> Try again
        </button>
      </div>
    );
  }

  if (!selectedStudent || !stats.hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
          <BarChart3 size={24} />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">
          {selectedStudent ? `No academic results for ${selectedStudent.name}` : "No student selected"}
        </h3>
        <p className="text-slate-500 text-sm max-w-xs mb-4">
          There are no published assessment results available to display a performance trend.
          Please contact the school once results have been recorded.
        </p>
        {!selectedStudent && (
          <button
            onClick={() => navigate("/parent")}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0B4A82] px-4 py-2 text-sm font-medium text-white hover:bg-[#083a68] transition-colors"
          >
            <ArrowUpRight size={16} /> Return to dashboard
          </button>
        )}
      </div>
    );
  }

  const { terms, currentTermPoint, currentAverage, currentGrade, subjects, subjectCount, highestGrade, highestSubject, insights } = stats;

  return (
    <div className="space-y-6">
      {/* SECTION A — PAGE HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0B4A82]/10 flex items-center justify-center text-[#0B4A82]">
            <BarChart3 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Academic Performance Trend
            </h1>
            <p className="text-sm text-slate-500">
              Your child's academic progress across terms
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto lg:ml-0">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider sr-only">
            Academic year
          </label>
          <select
            defaultValue={academicYearParam || config?.academicYear || ""}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B4A82]/50"
            onChange={(e) => {
              const year = e.target.value;
              const params = new URLSearchParams(location.search);
              if (year) params.set("academicYear", year);
              else params.delete("academicYear");
              navigate(`${location.pathname}?${params.toString()}`);
            }}
          >
            <option value="">All years</option>
            {[...new Set(terms.map((t) => t.academicYear))].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SECTION B — LINE CHART */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">
            Overall average by term
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Academic year {config?.academicYear || "—"}
          </p>
        </div>
        <div className="px-6 py-6">
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={terms}>
                <defs>
                  <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0B4A82" stopOpacity="0.35" />
                    <stop offset="95%" stopColor="#0B4A82" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  stroke="#cbd5e1"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  tickMargin={12}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="#cbd5e1"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={(v: number) => `${v}%`}
                  tickMargin={8}
                />
                <Tooltip content={({ active, payload }: any) => <CustomTooltip active={active} payload={payload} />} />
                <Line
                  type={terms.length < 2 ? "linear" : "monotone"}
                  dataKey="average"
                  stroke="#0B4A82"
                  strokeWidth={3}
                  dot={{ fill: "#fff", stroke: "#0B4A82", strokeWidth: 2, r: 6 }}
                  activeDot={{ r: 8, fill: "#fff", stroke: "#0B4A82", strokeWidth: 3 }}
                  isAnimationActive={false}
                />
                {terms.length === 1 && (
                  <LabelList
                    data={terms as unknown as Record<string, any>[]}
                    dataKey="average"
                    formatter={(value: number) => formatPercent(value)}
                    position="top"
                    fill="#0B4A82"
                    fontSize={12}
                    fontWeight={700}
                    offset={10}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {terms.length === 1 && (
            <div className="px-6 py-4 text-center text-sm text-slate-500">
              Your child&apos;s academic performance trend will become
              available as more term results are published.
            </div>
          )}
          <div className="flex flex-wrap justify-between items-center gap-3 mt-6 pt-4 border-t border-slate-100">
            {terms.map((term) => (
              <div key={`${term.academicYear}-${term.term}`} className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    term === terms[terms.length - 1] ? "bg-[#0B4A82]" : "bg-slate-300"
                  }`}
                />
                <span className="text-xs font-medium text-slate-600">{term.label}</span>
                <span className="text-xs font-bold text-slate-900">
                  {formatPercent(term.average)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION C — SUBJECT PERFORMANCE DONUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">
                Subject performance
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentTermPoint ? `${currentTermPoint.label} &middot; ${currentTermPoint.academicYear}` : "—"}
              </p>
            </div>
            <div className="flex-1 flex items-center justify-center relative">
              <div className="relative w-full max-w-xs h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={subjects}
                      dataKey="score"
                      nameKey="subject"
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      fill="#8884d8"
                      labelLine={false}
                      label={({ percent, name, value }: any) => {
                        if (percent < 0.05) return null;
                        return (
                          <text
                            x={0}
                            y={0}
                            textAnchor="middle"
                            alignmentBaseline="middle"
                            fill="#64748b"
                            fontSize={11}
                            fontWeight={600}
                          >
                            {`${Math.round(value)}%`}
                          </text>
                        );
                      }}
                      isAnimationActive={false}
                    >
                      {subjects.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-3xl font-bold text-slate-900">{formatPercent(currentAverage)}</div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Overall average</div>
                </div>
              </div>
            </div>
            {subjects.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <BarChart3 size={40} className="text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">No subject results available</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          {subjects.map((entry, index) => (
            <div key={entry.subject} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${entry.color}10 text-slate-900`}
                  style={{ backgroundColor: `${entry.color}15` }}
                >
                  {entry.subject.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{entry.subject}</div>
                  <div className="text-xs text-slate-500">{calculateGrade(entry.score, config?.gradingScale).remark}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-slate-900">{formatPercent(entry.score)}</div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${getGradeColor(entry.grade)}`}
                >
                  {entry.grade}
                </span>
              </div>
            </div>
          ))}
          {subjects.length === 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center">
              <p className="text-sm text-slate-500">No subject results to display.</p>
            </div>
          )}
        </div>
      </div>

      {/* SECTION D — OVERALL GRADE CARD */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">
            Overall grade
          </h2>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${getGradeColor(currentGrade.grade)}`}
          >
            {currentGrade.grade} &middot; {currentGrade.remark}
          </span>
        </div>
        <div className="px-6 py-6">
          <div className="flex items-center gap-6">
            <div className="text-center flex-1">
              <div className="text-5xl font-extrabold text-[#0B4A82]">{currentGrade.grade}</div>
              <div className="mt-1 text-sm font-semibold text-slate-700">
                {currentGrade.remark}
              </div>
            </div>
            <div className="flex-1 border-l border-slate-100 pl-6">
              <div className="text-sm text-slate-500">Current average</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{formatPercent(currentAverage)}</div>
            </div>
            <div className="flex-1 border-l border-slate-100 pl-6">
              <div className="text-sm text-slate-500">Subjects with results</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{subjectCount}</div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-50 bg-slate-25 rounded-xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
              <ArrowUpRight size={16} />
            </div>
            <div className="text-sm text-slate-700">
              <p className="font-semibold">Keep building on {currentGrade.remark.toLowerCase()} performance.</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Review subject details above to identify focus areas.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION E — KEY INSIGHTS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {insights.map((insight, index) => (
          <div
            key={index}
            className={`rounded-xl border p-4 shadow-sm ${
              insight.type === "positive"
                ? "border-emerald-100 bg-emerald-50"
                : insight.type === "caution"
                  ? "border-amber-100 bg-amber-50"
                  : "border-slate-100 bg-slate-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5">
                {insight.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">{insight.label}</div>
                <div className="mt-0.5 text-xs font-bold text-slate-600">{insight.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SECTION F — PERFORMANCE SUMMARY */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">
            Performance summary
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t border-slate-100 divide-y border-slate-100 md:divide-y-0 md:divide-x">
          {[
            {
              label: "Current Average",
              value: formatPercent(currentAverage),
              sub: `vs previous terms`,
              icon: <TrendingUp size={18} className="text-emerald-600" />,
            },
            {
              label: "Subjects",
              value: String(subjectCount),
              sub: "with valid results",
              icon: <BarChart3 size={18} className="text-slate-600" />,
            },
            {
              label: "Highest Grade",
              value: highestGrade,
              sub: highestSubject ? `(${highestSubject})` : "—",
              icon: <CheckCircle2 size={18} className="text-[#0B4A82]" />,
            },
          ].map((metric, index) => (
            <div
              key={metric.label}
              className={`p-5 flex flex-col gap-1 ${
                index < 2 ? "border-r border-slate-100" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                {metric.icon}
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {metric.label}
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{metric.value}</div>
              <div className="text-xs text-slate-500">{metric.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AcademicPerformanceView;
