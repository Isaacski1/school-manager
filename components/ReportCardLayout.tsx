import React, { useState, useEffect } from "react";
// @ts-ignore - html2pdf.js doesn't have proper types
import html2pdf from "html2pdf.js";
import { calculateGrade, getGradeColor } from "../constants";
import { Save } from "lucide-react";

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
      transform: element.style.transform,
      transformOrigin: element.style.transformOrigin,
      width: element.style.width,
    };

    try {
      const A4_WIDTH_PX = 794; // 8.27in * 96dpi
      const A4_HEIGHT_PX = 1123; // 11.69in * 96dpi
      element.style.width = `${A4_WIDTH_PX}px`;
      const measuredHeight = element.scrollHeight || element.offsetHeight;
      const scaleFactor = Math.min(1, A4_HEIGHT_PX / measuredHeight);
      element.style.transform = `scale(${scaleFactor})`;
      element.style.transformOrigin = "top left";

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
        margin: 0,
        filename: `${data.studentInfo.name}_Report_Card.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2.2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
        },
        jsPDF: {
          unit: "px",
          format: [794, 1123],
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
      element.style.transform = originalStyle.transform;
      element.style.transformOrigin = originalStyle.transformOrigin;
      element.style.width = originalStyle.width;
      setIsGenerating(false);
    }
  };

  return (
    <>
      <div
        id="report-card"
        className="bg-white p-4 rounded-lg shadow-lg border border-slate-200 text-[12.5px] leading-relaxed"
        style={{
          minHeight: "10.7in",
          boxSizing: "border-box",
          pageBreakInside: "avoid",
        }}
      >
        {/* Header */}
        <div
          className="flex justify-between items-center pb-2 mb-2"
          style={{ borderBottom: "2px solid #0B4A82" }}
        >
          <div className="flex items-center">
            {schoolInfo.logoUrl ? (
              <img
                data-report-logo="true"
                src={schoolInfo.logoUrl}
                alt="School Logo"
                className="h-12 w-12 object-contain"
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
        <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2 rounded mb-2 text-xs">
          <div>
            <span className="font-semibold">Name:</span> {studentInfo.name}
          </div>
          <div>
            <span className="font-semibold">Class:</span> {studentInfo.class}
          </div>
          <div>
            <span className="font-semibold">Gender:</span> {studentInfo.gender}
          </div>
          <div>
            <span className="font-semibold">Teacher:</span>{" "}
            {studentInfo.classTeacher}
          </div>
        </div>

        {/* Attendance */}
        <div className="mb-2">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-red-50 p-1.5 rounded">
              <span className="block font-bold text-red-800 text-lg">
                {attendance.totalDays}
              </span>
              <span className="text-xs text-red-700">School Days</span>
            </div>
            <div className="bg-green-50 p-1.5 rounded">
              <span className="block font-bold text-green-800 text-lg">
                {attendance.presentDays}
              </span>
              <span className="text-xs text-green-700">Present</span>
            </div>
            <div className="bg-red-50 p-1.5 rounded">
              <span className="block font-bold text-red-800 text-lg">
                {attendance.absentDays}
              </span>
              <span className="text-xs text-red-700">Absent</span>
            </div>
            <div className="bg-purple-50 p-1.5 rounded">
              <span className="block font-bold text-purple-800 text-lg">
                {attendance.attendancePercentage}%
              </span>
              <span className="text-xs text-purple-700">Attendance</span>
            </div>
          </div>
        </div>

        {/* Academic Performance */}
        <div className="mb-2">
          <h3
            className="text-sm font-bold text-primary-900 mb-2 px-3 pb-2 bg-slate-50"
            style={{
              borderLeft: "2px solid #1160A8",
              borderRight: "2px solid #1160A8",
              borderBottom: "1px solid #1160A8",
            }}
          >
            Academic Performance
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead
                className="text-white"
                style={{ backgroundColor: "#1160A8" }}
              >
                <tr>
                  <th className="px-2 pt-0 pb-3 border-b border-white align-middle leading-relaxed">
                    Subject
                  </th>
                  <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-12">
                    C.Test
                  </th>
                  <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-12">
                    HW
                  </th>
                  <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-12">
                    Proj
                  </th>
                  <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-12">
                    Exam
                  </th>
                  <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-12">
                    Total
                  </th>
                  <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-10">
                    Pos
                  </th>
                  <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-10">
                    Grade
                  </th>
                  <th className="px-2 pt-0 pb-3 border-b border-white align-middle">
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
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-1.5 border font-medium">
                          {p.subject}
                        </td>
                        <td className="px-2 py-2 border text-center leading-relaxed">
                          {p.testScore}
                        </td>
                        <td className="p-1.5 border text-center">
                          {p.homeworkScore}
                        </td>
                        <td className="p-1.5 border text-center">
                          {p.projectScore}
                        </td>
                        <td className="p-1.5 border text-center">
                          {p.examScore}
                        </td>
                        <td className="p-1.5 border text-center font-bold">
                          {p.total}
                        </td>
                        <td className="p-1.5 border text-center">
                          {positionLabel}
                        </td>
                        <td
                          className={`p-1.5 border text-center font-bold ${getGradeColor(grade.grade).split(" ")[0]}`}
                        >
                          {grade.grade}
                        </td>
                        <td className="p-1.5 border">{grade.remark}</td>
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
            <h3
              className="text-sm font-bold text-primary-900 mb-1 pl-2"
              style={{ borderLeft: "3px solid #1160A8" }}
            >
              Performance Summary
            </h3>
            <div
              className="bg-slate-50 p-3 rounded text-xs space-y-1"
              style={{ border: "1px solid #1160A8" }}
            >
              <div
                className="flex justify-between py-0.5"
                style={{ borderBottom: "1px solid #C7D7EA" }}
              >
                <span className="font-semibold">Total Score:</span>
                <span>{summary.totalScore}</span>
              </div>
              <div
                className="flex justify-between py-0.5"
                style={{ borderBottom: "1px solid #C7D7EA" }}
              >
                <span className="font-semibold">Average:</span>
                <span>{summary.averageScore}</span>
              </div>
              <div
                className="flex justify-between py-0.5"
                style={{ borderBottom: "1px solid #C7D7EA" }}
              >
                <span className="font-semibold">Grade:</span>
                <span className="font-bold">{summary.overallGrade}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-semibold">Position:</span>
                <span>
                  {summary.classPosition} of {summary.totalStudents}
                </span>
              </div>
            </div>
          </div>
          <div>
            <h3
              className="text-sm font-bold text-primary-900 mb-1 pl-2"
              style={{ borderLeft: "3px solid #1160A8" }}
            >
              Skills & Behaviour
            </h3>
            <div
              className="bg-slate-50 p-3 rounded text-xs space-y-1"
              style={{ border: "1px solid #1160A8" }}
            >
              {skills &&
                Object.entries(skills).map(([skill, rating]) => (
                  <div
                    key={skill}
                    className="flex justify-between py-0.5 last:border-0"
                    style={{ borderBottom: "1px solid #C7D7EA" }}
                  >
                    <span className="font-semibold capitalize">
                      {skill.replace(/([A-Z])/g, " $1")}:
                    </span>
                    <span>{rating as string}</span>
                  </div>
                ))}
            </div>
          </div>{" "}
        </div>

        {/* Remarks */}
        <div className="mb-2">
          <h3
            className="text-sm font-bold text-primary-900 mb-1 pl-2"
            style={{ borderLeft: "3px solid #1160A8" }}
          >
            Remarks
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded text-xs min-h-[70px]">
              <h4 className="font-bold mb-0.5">Class Teacher:</h4>
              <p className="italic">"{remarks.teacher}"</p>
            </div>
            <div className="bg-slate-50 p-2 rounded text-xs">
              <h4 className="font-bold mb-0.5">Head Teacher:</h4>
              <p className="italic">"{remarks.headTeacher}"</p>
            </div>
          </div>
        </div>

        {/* Promotion & Dates */}
        <div className="grid grid-cols-3 gap-3 mb-2 text-xs">
          {promotion?.isPromotionalTerm !== false && (
            <div className="bg-red-50 text-red-800 p-2 rounded text-center">
              <span className="font-bold">Promotion:</span> {promotion.status}
            </div>
          )}
          <div className="bg-green-50 text-green-800 p-2 rounded text-center">
            <span className="font-bold">Next Term:</span>{" "}
            {termDates.reopeningDate}
          </div>
          <div className="bg-slate-100 text-slate-700 p-2 rounded text-center">
            <span className="font-bold">Term Ends in:</span>{" "}
            {termDates.vacationDate}
          </div>
        </div>

        {/* Signatures */}
        <div className="flex justify-between items-center pt-2 border-t">
          <div className="text-center">
            <p className="border-t border-dotted border-slate-400 w-32 pt-1 text-xs font-semibold">
              Class Teacher
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 border border-dashed border-slate-300 flex items-center justify-center">
              <p className="text-slate-400 text-[10px]">Stamp</p>
            </div>
          </div>
          <div className="text-center">
            <p className="border-t border-dotted border-slate-400 w-32 pt-1 text-xs font-semibold">
              Head Teacher
            </p>
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
