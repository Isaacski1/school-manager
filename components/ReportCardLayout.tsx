import React, { useState, useEffect } from "react";
// @ts-ignore - html2pdf.js doesn't have proper types
import html2pdf from "html2pdf.js";
import { calculateGrade, getGradeColor } from "../constants";
import { Save, GraduationCap, BarChart2, Star, MessageSquare } from "lucide-react";

const SectionHeader = ({ icon: Icon, title }: { icon: any; title: string }) => (
  <div className="flex items-center gap-2 mb-2">
    <Icon className="text-[#1160A8]" size={18} />
    <h3 className="text-[13px] font-bold text-[#1160A8] uppercase tracking-wide whitespace-nowrap">
      {title}
    </h3>
    <div className="flex-grow border-b-2 border-[#1160A8] opacity-80 ml-1 mt-0.5"></div>
  </div>
);

interface ReportCardLayoutProps {
  data: any;
}

const ReportCardLayout: React.FC<ReportCardLayoutProps> = ({ data }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const convertLogoToDataUrl = async () => {
      const src = data?.schoolInfo?.logoUrl;
      if (!src) {
        setLogoDataUrl(null); // IMPORTANT: null, not ""
        return;
      }

      if (src.startsWith("data:")) {
        setLogoDataUrl(src);
        return;
      }

      try {
        // Use a proxy or server-side fetch if CORS is an issue
        const response = await fetch(src);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          setLogoDataUrl(reader.result as string);
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error("Failed to fetch or convert logo:", error);
        // Fallback to the original URL if conversion fails
        setLogoDataUrl(src);
      }
    };

    if (data?.schoolInfo?.logoUrl) {
      convertLogoToDataUrl();
    }
  }, [data?.schoolInfo?.logoUrl]);

  if (!data) {
    return null;
  }

  const {
    schoolInfo,
    studentInfo,
    attendance,
    performance,
    summary,
    skills,
    remarks,
    promotion,
    termDates,
  } = data;

  // Defensive check for required data
  if (!schoolInfo || !studentInfo || !attendance || !performance) {
    console.warn("Missing required report card data:", {
      schoolInfo,
      studentInfo,
      attendance,
      performance,
    });
    return (
      <div className="p-8 text-center text-red-600">
        <p>Error: Unable to generate report card. Missing required data.</p>
      </div>
    );
  }

  const waitForImages = async (container: HTMLElement) => {
    const images = Array.from(
      container.querySelectorAll("img"),
    ) as HTMLImageElement[];

    await Promise.all(
      images.map((img) => {
        img.setAttribute("crossorigin", "anonymous");
        img.setAttribute("referrerpolicy", "no-referrer");

        if (img.complete && img.naturalWidth > 0) return Promise.resolve();

        return new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        });
      }),
    );
  };

  // Convert any image URL to base64 (for PDF)
  const toDataURL = async (url: string): Promise<string> => {
    const busted = url.includes("?")
      ? `${url}&cb=${Date.now()}`
      : `${url}?cb=${Date.now()}`;
    const res = await fetch(busted);
    const blob = await res.blob();

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleDownload = async () => {
    const element = document.getElementById("report-card");
    if (!element) return;

    setIsGenerating(true);

    const logoImg = element.querySelector(
      "img[data-report-logo='true']",
    ) as HTMLImageElement | null;

    const originalLogoSrc = logoImg?.src;
    const originalStyle = {
      width: element.style.width,
    };

    try {
      const A4_WIDTH_PX = 794;
      element.style.width = `${A4_WIDTH_PX}px`;

      // ✅ Ensure logo is base64 before export (best way to always show in PDF)
      if (logoImg?.src && !logoImg.src.startsWith("data:image")) {
        try {
          const dataUrl = await toDataURL(logoImg.src);
          logoImg.src = dataUrl;
        } catch (e) {
          console.warn("Logo base64 conversion failed. Using normal URL.", e);
        }
      }

      await waitForImages(element);

      const opt: any = {
        margin: [0, 0, 0, 0],
        filename: `${data.studentInfo.name}_Report_Card.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait",
          compress: true,
        },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      };

      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error("PDF generation failed:", error);
    } finally {
      // restore original src
      if (logoImg && originalLogoSrc) logoImg.src = originalLogoSrc;
      element.style.width = originalStyle.width;
      
      setIsGenerating(false);
    }
  };

  return (
    <>
      <div
        id="report-card"
        className="bg-white px-[15px] py-[10px] rounded-lg shadow-lg border border-slate-200 text-[12px] leading-snug"
        style={{
          boxSizing: "border-box",
          pageBreakInside: "avoid",
          position: "relative",
          height: "1123px",
          overflow: "hidden",
        }}
      >
        {/* Watermark Overlay */}
        {schoolInfo.logoUrl && (
          <img
            src={schoolInfo.logoUrl}
            alt="Watermark"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "500px",
              height: "500px",
              objectFit: "contain",
              opacity: 0.05,
              pointerEvents: "none",
              zIndex: 0,
            }}
            crossOrigin="anonymous"
          />
        )}
        <div id="report-card-inner" className="w-full flex flex-col h-full">
          {/* Header */}
        <div
          className="flex justify-between items-center pb-2 mb-3"
          style={{ borderBottom: "2px solid #1160A8" }}
        >
          <div className="flex items-center">
            {schoolInfo.logoUrl ? (
              <img
                data-report-logo="true"
                src={schoolInfo.logoUrl}
                alt="School Logo"
                className="h-14 w-14 object-contain"
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  // Hide if hotlink blocked
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  console.warn("Logo failed to load:", schoolInfo.logoUrl);
                }}
              />
            ) : null}

            <div>
              <h1 className="text-lg font-bold text-primary-900">
                {schoolInfo.name}
              </h1>
              <p className="text-xs text-slate-600">
                {schoolInfo.address} | {schoolInfo.phone}
              </p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold text-primary-800">
              Terminal Report Card
            </h2>
            <p className="text-xs font-semibold text-slate-700">
              {schoolInfo.academicYear} | {schoolInfo.term}
            </p>
          </div>
        </div>
        {/* Student Info */}
        <div className="flex justify-between items-center pb-2 mb-3 text-[12px] font-medium">
          <div className="flex gap-1">
            <span className="font-bold text-slate-900">Name:</span> <span className="text-slate-700">{studentInfo.name}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-bold text-slate-900">Class:</span> <span className="text-slate-700">{studentInfo.class}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-bold text-slate-900">Gender:</span> <span className="text-slate-700">{studentInfo.gender}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-bold text-slate-900">Teacher:</span> <span className="text-slate-700">{studentInfo.classTeacher || "N/A"}</span>
          </div>
        </div>

        {/* Attendance */}
        <div className="mb-3">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="bg-red-50 p-2 rounded-md">
              <span className="block font-bold text-red-700 text-3xl leading-tight mb-0.5">
                {attendance.totalDays}
              </span>
              <span className="text-[12px] font-medium text-red-700">School Days</span>
            </div>
            <div className="bg-green-50 p-2 rounded-md">
              <span className="block font-bold text-green-700 text-3xl leading-tight mb-0.5">
                {attendance.presentDays}
              </span>
              <span className="text-[12px] font-medium text-green-700">Present</span>
            </div>
            <div className="bg-red-50 p-2 rounded-md">
              <span className="block font-bold text-red-700 text-3xl leading-tight mb-0.5">
                {attendance.absentDays}
              </span>
              <span className="text-[12px] font-medium text-red-700">Absent</span>
            </div>
            <div className="bg-purple-50 p-2 rounded-md">
              <span className="block font-bold text-purple-800 text-3xl leading-tight mb-0.5">
                {attendance.attendancePercentage}%
              </span>
              <span className="text-[12px] font-medium text-purple-800">Attendance</span>
            </div>
          </div>
        </div>

        {/* Academic Performance */}
        <div className="mb-2">
          <SectionHeader icon={GraduationCap} title="Academic Performance" />
          <div className="overflow-x-auto rounded-t-md overflow-hidden">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead
                className="text-white"
                style={{ backgroundColor: "#1160A8" }}
              >
                <tr>
                  <th className="px-2 py-1.5 border-r border-white/20 align-middle text-center">
                    Subject
                  </th>
                  <th className="px-2 py-1.5 border-r border-white/20 align-middle text-center w-10">
                    C.Test
                  </th>
                  <th className="px-2 py-1.5 border-r border-white/20 align-middle text-center w-10">
                    HW
                  </th>
                  <th className="px-2 py-1.5 border-r border-white/20 align-middle text-center w-10">
                    Proj
                  </th>
                  <th className="px-2 py-1.5 border-r border-white/20 align-middle text-center w-10">
                    Exam
                  </th>
                  <th className="px-2 py-1.5 border-r border-white/20 align-middle text-center w-10">
                    Total
                  </th>
                  <th className="px-2 py-1.5 border-r border-white/20 align-middle text-center w-10">
                    Pos
                  </th>
                  <th className="px-2 py-1.5 border-r border-white/20 align-middle text-center w-10">
                    Grade
                  </th>
                  <th className="px-2 py-1.5 align-middle text-center">
                    Remark
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.allStudentsAssessments &&
                  performance.map((p: any, i: number) => {
                    const toScore = (value: any) => {
                      if (typeof value === "number") return value;
                      const parsed = Number(value);
                      return Number.isFinite(parsed) ? parsed : 0;
                    };
                    const currentScore =
                      toScore(p.total) ||
                      toScore(p.testScore) +
                        toScore(p.homeworkScore) +
                        toScore(p.projectScore) +
                        toScore(p.examScore);
                    const normalizedCurrentScore = Number.isFinite(currentScore)
                      ? currentScore
                      : 0;
                    const grade = calculateGrade(
                      currentScore,
                      data?.gradingScale,
                    );
                    let position = 0;
                    let positionLabel = "-";
                    if (true) {
                      const subjectScores = data.allStudentsAssessments
                        .filter((a: any) => a.subject === p.subject)
                        .map((a: any) => toScore(a.total))
                        .filter((score: number) => Number.isFinite(score));
                      subjectScores.sort((a: number, b: number) => b - a);
                      const scorePositions = new Map<number, number>();
                      let lastScore: number | null = null;
                      let lastPosition = 0;
                      subjectScores.forEach((score, index) => {
                        if (lastScore === null || score !== lastScore) {
                          lastPosition = index + 1;
                          lastScore = score;
                        }
                        if (!scorePositions.has(score)) {
                          scorePositions.set(score, lastPosition);
                        }
                      });
                      position =
                        scorePositions.get(normalizedCurrentScore) || 0;
                      position =
                        subjectScores.filter((score) => score > currentScore)
                          .length + 1;
                    }
                    const positionSuffix =
                      ["st", "nd", "rd"][position - 1] || "th";
                    if (position) {
                      positionLabel = `${position}${positionSuffix}`;
                    }

                    return (
                      <tr key={i} className="bg-white hover:bg-slate-50">
                        <td className="px-2 py-1 border-b border-slate-200 font-medium">
                          {p.subject}
                        </td>
                        <td className="px-2 py-1 border-b border-slate-200 text-center">
                          {p.testScore}
                        </td>
                        <td className="px-2 py-1 border-b border-slate-200 text-center">
                          {p.homeworkScore}
                        </td>
                        <td className="px-2 py-1 border-b border-slate-200 text-center">
                          {p.projectScore}
                        </td>
                        <td className="px-2 py-1 border-b border-slate-200 text-center">
                          {p.examScore}
                        </td>
                        <td className="px-2 py-1 border-b border-slate-200 text-center font-bold">
                          {p.total}
                        </td>
                        <td className="px-2 py-1 border-b border-slate-200 text-center">
                          {positionLabel}
                        </td>
                        <td
                          className={`px-2 py-1 border-b border-slate-200 text-center font-bold ${getGradeColor(grade.grade).split(" ")[0]}`}
                        >
                          {grade.grade}
                        </td>
                        <td className="px-2 py-1 border-b border-slate-200">{grade.remark}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary & Skills - Side by Side */}
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <div
              className="bg-white p-2.5 rounded-md text-[11px] space-y-0.5"
              style={{ border: "1px solid #1160A8" }}
            >
              <SectionHeader icon={BarChart2} title="Performance Summary" />
              <div className="mt-2">
                <div
                  className="flex justify-between py-0.5"
                  style={{ borderBottom: "1px solid #E2E8F0" }}
                >
                  <span className="font-semibold text-slate-800">Total Score:</span>
                  <span>{summary.totalScore}</span>
                </div>
                <div
                  className="flex justify-between py-0.5"
                  style={{ borderBottom: "1px solid #E2E8F0" }}
                >
                  <span className="font-semibold text-slate-800">Average:</span>
                  <span>{summary.averageScore}</span>
                </div>
                <div
                  className="flex justify-between py-0.5"
                  style={{ borderBottom: "1px solid #E2E8F0" }}
                >
                  <span className="font-semibold text-slate-800">Grade:</span>
                  <span className="font-bold">{summary.overallGrade}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-semibold text-slate-800">Position:</span>
                  <span>
                    {summary.classPosition} of {summary.totalStudents}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div>
            <div
              className="bg-white p-2.5 rounded-md text-[11px] space-y-0.5"
              style={{ border: "1px solid #1160A8" }}
            >
              <SectionHeader icon={Star} title="Skills & Behaviour" />
              <div className="mt-2">
                {skills &&
                  Object.entries(skills).map(([skill, rating]) => (
                    <div
                      key={skill}
                      className="flex justify-between py-0.5 last:border-0"
                      style={{ borderBottom: "1px solid #E2E8F0" }}
                    >
                      <span className="font-semibold text-slate-800 capitalize">
                        {skill.replace(/([A-Z])/g, " $1")}:
                      </span>
                      <span>{rating as string}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>{" "}
        </div>

        {/* Remarks */}
        <div className="mb-2">
          <SectionHeader icon={MessageSquare} title="Remarks" />
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white px-2 py-1 text-[11px]">
              <h4 className="font-bold mb-0.5 text-slate-900">Class Teacher:</h4>
              <p className="italic text-slate-700">"{remarks.teacher}"</p>
            </div>
            <div className="bg-white px-2 py-1 text-[11px]">
              <h4 className="font-bold mb-0.5 text-slate-900">Head Teacher:</h4>
              <p className="italic text-slate-700">"{remarks.headTeacher}"</p>
            </div>
          </div>
        </div>

        {/* Promotion & Dates */}
        <div className="grid grid-cols-3 gap-2 mb-2 text-[12px]">
          {promotion?.isPromotionalTerm !== false && (
            <div className="bg-red-50 text-red-800 p-2 rounded-md text-center">
              <span className="font-bold">Promotion:</span> {promotion.status}
            </div>
          )}
          <div className="bg-green-50 text-green-800 p-2 rounded-md text-center">
            <span className="font-bold">Next Term:</span>{" "}
            {termDates.reopeningDate}
          </div>
          <div className="bg-blue-50 text-[#1160A8] p-2 rounded-md text-center">
            <span className="font-bold">Term Ends in:</span>{" "}
            <span>{termDates.vacationDate}</span>
          </div>
        </div>

        {/* Signatures */}
        <div className="flex justify-between items-center pt-2 mt-auto border-t border-slate-300">
          <div className="text-center">
            <p className="border-t border-dotted border-slate-400 w-36 pt-1 text-[12px] font-semibold">
              Class Teacher
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 border border-dashed border-slate-300 flex items-center justify-center">
              <p className="text-slate-400 text-[10px]">Stamp</p>
            </div>
          </div>
          <div className="text-center">
            <p className="border-t border-dotted border-slate-400 w-36 pt-1 text-[12px] font-semibold">
              Head Teacher
            </p>
          </div>
        </div>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button
          onClick={handleDownload}
          disabled={isGenerating}
          className={`px-6 py-2 text-white rounded-lg flex items-center gap-2 transition-colors ${isGenerating ? "bg-[#5C93C4] cursor-not-allowed" : "bg-[#1160A8] hover:bg-[#0B4A82]"}`}
        >
          {isGenerating ? (
            <>
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Generating PDF...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Download PDF
            </>
          )}
        </button>
      </div>
    </>
  );
};

export default ReportCardLayout;
