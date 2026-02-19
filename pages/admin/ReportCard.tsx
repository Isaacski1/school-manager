import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { db } from "../../services/mockDb";
import { Student, SchoolConfig, AdminRemark } from "../../types";
import { CLASSES_LIST } from "../../constants";
import ReportCardLayout from "../../components/ReportCardLayout";
import { Save, Edit2, X, MessageSquare } from "lucide-react";
import { showToast } from "../../services/toast";
import { useSchool } from "../../context/SchoolContext";

// No global placeholder logo for report cards (use school-specific logo only)
const DEFAULT_SCHOOL_LOGO = "";

// ✅ More reliable: convert an image URL to base64 using Canvas
const urlToBase64 = (url: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // IMPORTANT

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas context not available"));

        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error("Failed to load image for base64"));
    img.src = url;
  });

// Helper function to robustly parse term number
const parseTermNumber = (termString: string): 1 | 2 | 3 => {
  let term = parseInt(termString);
  if (!isNaN(term) && term >= 1 && term <= 3) return term as 1 | 2 | 3;

  const parts = termString.split(" ");
  if (parts.length > 1) {
    term = parseInt(parts[1]);
    if (!isNaN(term) && term >= 1 && term <= 3) return term as 1 | 2 | 3;
  }

  return 1;
};

const PASS_THRESHOLD = 500;

const ReportCard = () => {
  const { school } = useSchool();
  const schoolId = school?.id || null;

  const [selectedClass, setSelectedClass] = useState(CLASSES_LIST[0].id);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [reportCardData, setReportCardData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Admin remarks state
  const [adminRemark, setAdminRemark] = useState("");
  const [editingAdminRemark, setEditingAdminRemark] = useState(false);
  const [savingRemark, setSavingRemark] = useState(false);

  const handleClassChange = async (classId: string) => {
    if (!schoolId) {
      setStudents([]);
      setSelectedStudent("");
      setReportCardData(null);
      return;
    }
    setSelectedClass(classId);
    const studentList = await db.getStudents(schoolId, classId);
    setStudents(studentList);
    setSelectedStudent("");
    setReportCardData(null);
  };

  const generateReport = async () => {
    if (!selectedStudent || !schoolId) return;

    setLoading(true);

    try {
      const studentsInClass = await db.getStudents(schoolId, selectedClass);
      const student = studentsInClass.find((s) => s.id === selectedStudent);

      const schoolConfig: SchoolConfig = await db.getSchoolConfig(schoolId);

      // ✅ SUPER ADMIN logo first (from settings)
      const configLogo =
        (schoolConfig as any)?.logoUrl?.trim?.() ||
        (schoolConfig as any)?.logo?.trim?.() ||
        (schoolConfig as any)?.schoolLogo?.trim?.() ||
        "";

      // fallback: sidebar logo
      const sidebarLogo =
        (school as any)?.logoUrl?.trim?.() ||
        (school as any)?.logo?.trim?.() ||
        "";

      // ✅ final (prefer config)
      const finalLogo = configLogo || sidebarLogo || "";

      // Convert to base64 for PDF (only if remote URL)
      let printableLogo = finalLogo;

      if (finalLogo && finalLogo.startsWith("http")) {
        try {
          printableLogo = await urlToBase64(finalLogo);
        } catch (e) {
          console.warn("Base64 conversion failed, using original URL:", e);
          printableLogo = finalLogo;
        }
      }

      const termNumber = parseTermNumber(schoolConfig.currentTerm);

      const academicYear = schoolConfig.academicYear;
      const adminRemarkId = `${selectedStudent}_term${termNumber}_${academicYear}`;

      const assessments = await db
        .getAllAssessments(schoolId)
        .then((all) => all.filter((a) => a.studentId === selectedStudent));

      const termAssessmentsRaw = assessments.filter(
        (a) =>
          a.term === termNumber &&
          String(a.academicYear || "") === String(schoolConfig.academicYear),
      );
      const termAssessments = Object.values(
        termAssessmentsRaw.reduce(
          (acc, assessment) => {
            const subjectKey = assessment.subject;
            if (!subjectKey) return acc;
            const current = acc[subjectKey];
            const currentTotal = current?.total ?? 0;
            const nextTotal = assessment.total ?? 0;
            if (!current || nextTotal >= currentTotal) {
              acc[subjectKey] = assessment;
            }
            return acc;
          },
          {} as Record<string, any>,
        ),
      );

      const remarks = await db
        .getStudentRemarks(schoolId, selectedClass)
        .then((all) => all.find((r) => r.studentId === selectedStudent));

      const adminRemarkData = await db.getAdminRemark(schoolId, adminRemarkId);

      const attendance = await db.getClassAttendance(schoolId, selectedClass);
      const holidayDates = new Set([
        ...attendance.filter((r) => r.isHoliday).map((r) => r.date),
        ...(schoolConfig.holidayDates || []).map((h) => h.date),
      ]);
      const nonHolidayAttendance = attendance.filter((r) => !r.isHoliday);

      const skills = await db
        .getStudentSkills(schoolId, selectedClass)
        .then((all) => all.find((s) => s.studentId === selectedStudent));

      const users = await db.getUsers(schoolId);

      // total school days (match AttendanceStats: weekdays only, from reopen to today or vacation)
      let totalSchoolDays = 0;
      if (schoolConfig.schoolReopenDate) {
        const reopen = new Date(`${schoolConfig.schoolReopenDate}T00:00:00`);
        const vacation = schoolConfig.vacationDate
          ? new Date(`${schoolConfig.vacationDate}T00:00:00`)
          : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = vacation && vacation < today ? vacation : today;

        if (Number.isNaN(reopen.getTime())) {
          totalSchoolDays = nonHolidayAttendance.length;
        } else {
          const current = new Date(reopen);
          while (current <= endDate) {
            const day = current.getDay();
            const isWeekend = day === 0 || day === 6;
            if (!isWeekend) {
              const dateKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
              if (!holidayDates.has(dateKey)) {
                totalSchoolDays++;
              }
            }
            current.setDate(current.getDate() + 1);
          }
        }
      } else {
        totalSchoolDays = nonHolidayAttendance.length;
      }

      const presentDays = nonHolidayAttendance.filter((a) =>
        a.presentStudentIds.includes(selectedStudent),
      ).length;

      const absentDays = totalSchoolDays - presentDays;

      const attendancePercentage =
        totalSchoolDays > 0
          ? Math.round((presentDays / totalSchoolDays) * 100)
          : 0;

      const classTeacher = users.find((u) =>
        u.assignedClassIds?.includes(selectedClass),
      );

      const calculateOverallGrade = (avg: number) => {
        if (avg >= 80) return "A";
        if (avg >= 70) return "B";
        if (avg >= 60) return "C";
        if (avg >= 45) return "D";
        return "F";
      };

      const allStudentsAssessmentsForClassRaw = await db
        .getAllAssessments(schoolId)
        .then((all) =>
          all.filter(
            (a) =>
              a.classId === selectedClass &&
              a.term === termNumber &&
              String(a.academicYear || "") ===
                String(schoolConfig.academicYear),
          ),
        );

      const allStudentsAssessmentsForClass = Object.values(
        allStudentsAssessmentsForClassRaw.reduce(
          (acc, assessment) => {
            const subjectKey = assessment.subject || "";
            if (!subjectKey) return acc;
            const computedTotal =
              Number(assessment.testScore || 0) +
              Number(assessment.homeworkScore || 0) +
              Number(assessment.projectScore || 0) +
              Number(assessment.examScore || 0);
            const rawTotal = (assessment as any).total;
            const normalizedTotal =
              typeof rawTotal === "number"
                ? rawTotal
                : Number(rawTotal ?? computedTotal) || computedTotal;
            const key = `${assessment.studentId}_${subjectKey}`;
            const current = acc[key] as any;
            if (!current || normalizedTotal >= (current.total || 0)) {
              acc[key] = { ...assessment, total: normalizedTotal };
            }
            return acc;
          },
          {} as Record<string, any>,
        ),
      );

      const allStudentsTotalScores = students.map((s) => {
        const studentAssessments = allStudentsAssessmentsForClass.filter(
          (a) => a.studentId === s.id,
        );
        const totalScore = studentAssessments.reduce((acc, a) => {
          const rawTotal = (a as any).total;
          const computedTotal =
            Number(a.testScore || 0) +
            Number(a.homeworkScore || 0) +
            Number(a.projectScore || 0) +
            Number(a.examScore || 0);
          const normalized =
            typeof rawTotal === "number"
              ? rawTotal
              : Number(rawTotal ?? computedTotal) || computedTotal;
          return acc + normalized;
        }, 0);
        return { studentId: s.id, totalScore };
      });

      allStudentsTotalScores.sort((a, b) => {
        if (b.totalScore !== a.totalScore) {
          return b.totalScore - a.totalScore;
        }
        return a.studentId.localeCompare(b.studentId);
      });

      const rank =
        allStudentsTotalScores.findIndex(
          (s) => s.studentId === selectedStudent,
        ) + 1;

      setAdminRemark(adminRemarkData?.remark || "");

      const totalScoreForPromotion = termAssessments.reduce(
        (acc, a) => acc + (a.total || 0),
        0,
      );

      const currentClassIndex = CLASSES_LIST.findIndex(
        (c) => c.id === student?.classId,
      );
      const nextClassName =
        currentClassIndex >= 0 && currentClassIndex < CLASSES_LIST.length - 1
          ? CLASSES_LIST[currentClassIndex + 1].name
          : "";

      const isPromotionalTerm = schoolConfig.isPromotionalTerm ?? true;
      const promotionStatus = isPromotionalTerm
        ? totalScoreForPromotion >= PASS_THRESHOLD
          ? nextClassName
            ? `Promoted to ${nextClassName}`
            : "Promoted"
          : "Fail"
        : "N/A";

      const data = {
        schoolInfo: {
          name: school?.name || schoolConfig.schoolName || "School Manager GH",
          logoUrl: finalLogo, // ✅ PDF-safe logo
          address: school?.address || schoolConfig.address || "",
          phone: school?.phone || schoolConfig.phone || "",
          email: schoolConfig.email || "",
          academicYear: schoolConfig.academicYear || "",
          term: schoolConfig.currentTerm || "",
        },
        studentInfo: {
          name: student?.name || "",
          gender: student?.gender || "",
          dob: student?.dob || "",
          class:
            CLASSES_LIST.find((c) => c.id === student?.classId)?.name || "",
          classTeacher: classTeacher?.fullName || "N/A",
        },
        attendance: {
          totalDays: totalSchoolDays || 0,
          presentDays: presentDays || 0,
          absentDays: absentDays || 0,
          attendancePercentage: attendancePercentage || 0,
        },
        performance: termAssessments || [],
        positionRule: schoolConfig.positionRule || "subject",
        gradingScale: schoolConfig.gradingScale,
        summary: {
          totalScore: totalScoreForPromotion || 0,
          averageScore:
            termAssessments.length > 0
              ? (
                  termAssessments.reduce((acc, a) => acc + (a.total || 0), 0) /
                  termAssessments.length
                ).toFixed(1)
              : "0.0",
          overallGrade:
            calculateOverallGrade(
              termAssessments.length > 0
                ? termAssessments.reduce((acc, a) => acc + (a.total || 0), 0) /
                    termAssessments.length
                : 0,
            ) || "N/A",
          classPosition: `${rank}${["st", "nd", "rd"][rank - 1] || "th"}`,
          totalStudents: students.length || 0,
        },
        skills: {
          punctuality: skills?.punctuality || "N/A",
          neatness: skills?.neatness || "N/A",
          conduct: skills?.conduct || "N/A",
          attitudeToWork: skills?.attitudeToWork || "N/A",
          classParticipation: skills?.classParticipation || "N/A",
          homeworkCompletion: skills?.homeworkCompletion || "N/A",
        },
        remarks: {
          teacher: remarks?.remark || "N/A",
          headTeacher:
            adminRemarkData?.remark ||
            schoolConfig.headTeacherRemark ||
            "An outstanding performance. The school is proud of you.",
          adminRemark: adminRemarkData?.remark || "",
          adminRemarkDate: adminRemarkData?.dateCreated || "",
        },
        promotion: {
          status: promotionStatus,
          isPromotionalTerm,
        },
        termDates: {
          endDate: schoolConfig.termEndDate || "",
          reopeningDate: schoolConfig.nextTermBegins || "",
          vacationDate: schoolConfig.vacationDate || "",
        },
        allStudentsAssessments: allStudentsAssessmentsForClass,
      };

      setReportCardData(data);
      showToast("Report card generated successfully!", { type: "success" });
    } catch (error: any) {
      console.error("Error generating report card:", error);
      showToast(
        `Failed to generate report card: ${error.message || "An unknown error occurred."}`,
        { type: "error" },
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAdminRemark = async () => {
    if (!selectedStudent || !adminRemark.trim() || !schoolId) return;

    setSavingRemark(true);
    try {
      const schoolConfig = await db.getSchoolConfig(schoolId);
      const termNumber = parseTermNumber(schoolConfig.currentTerm);

      const remarkData: AdminRemark = {
        id: `${selectedStudent}_term${termNumber}_${schoolConfig.academicYear}`,
        studentId: selectedStudent,
        classId: selectedClass,
        term: termNumber as 1 | 2 | 3,
        academicYear: schoolConfig.academicYear,
        schoolId,
        remark: adminRemark,
        adminId: "admin",
        dateCreated: new Date().toISOString().split("T")[0],
      };

      await db.saveAdminRemark(remarkData);
      setEditingAdminRemark(false);
      generateReport();
    } catch (error) {
      console.error("Error saving admin remark:", error);
    } finally {
      setSavingRemark(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await handleClassChange(selectedClass);
      } catch (error) {
        console.error("Error in useEffect:", error);
      }
    };
    load();
  }, [schoolId]);

  return (
    <Layout title="Generate Report Card">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-xl font-semibold text-slate-800 mb-4">
          Select Student
        </h3>

        <div className="flex gap-4 mb-4">
          <select
            className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white text-black"
            value={selectedClass}
            onChange={(e) => handleClassChange(e.target.value)}
          >
            {CLASSES_LIST.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white text-black flex-grow"
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
            disabled={!students.length}
          >
            <option value="">-- Select a student --</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={generateReport}
          disabled={!selectedStudent || loading}
          className="px-6 py-2 bg-[#1160A8] text-white rounded-lg hover:bg-[#0B4A82] disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate Report"}
        </button>
      </div>

      {reportCardData && (
        <div className="mt-8">
          <div className="bg-[#E6F0FA] border border-[#E6F0FA] rounded-xl p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold text-[#0B4A82] flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Admin/Head Teacher Remark
              </h3>

              {!editingAdminRemark ? (
                <button
                  onClick={() => setEditingAdminRemark(true)}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-[#1160A8] text-white rounded hover:bg-[#0B4A82]"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Remark
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingAdminRemark(false)}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAdminRemark}
                    disabled={savingRemark}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {savingRemark ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </div>

            {editingAdminRemark ? (
              <textarea
                value={adminRemark}
                onChange={(e) => setAdminRemark(e.target.value)}
                className="w-full border border-[#E6F0FA] rounded-lg p-3 text-black bg-white"
                rows={3}
                placeholder="Enter admin/head teacher remark..."
              />
            ) : (
              <p className="text-[#0B4A82] italic">
                {adminRemark || "No remark added yet"}
              </p>
            )}
          </div>

          <ReportCardLayout data={reportCardData} />
        </div>
      )}
    </Layout>
  );
};

export default ReportCard;
