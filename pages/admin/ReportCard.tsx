import React, { useState, useEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import Layout from "../../components/Layout";
import { db } from "../../services/mockDb";
import { Student, SchoolConfig, AdminRemark } from "../../types";
import { CLASSES_LIST, calculateGrade } from "../../constants";
import ReportCardLayout from "../../components/ReportCardLayout";
import { Save, Edit2, X, MessageSquare } from "lucide-react";
import { showToast } from "../../services/toast";
import { useSchool } from "../../context/SchoolContext";
import { useAuth } from "../../context/AuthContext";
import { logActivity } from "../../services/activityLog";
import {
  collectHolidayDateKeys,
  getExpectedSchoolDayKeys,
} from "../../services/schoolCalendar";
import JSZip from "jszip";

// No global placeholder logo for report cards (use school-specific logo only)
const DEFAULT_SCHOOL_LOGO = "";

// More reliable: convert an image URL to base64 using Canvas
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
const REPORT_CARD_PDF_WIDTH_PX = 794;
const REPORT_CARD_PDF_HEIGHT_PX = 1123;
const BULK_EXPORT_SCALE = 1.35;
const BULK_EXPORT_QUALITY = 0.72;

const normalizeSubjectName = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .toLowerCase();

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

const generateSinglePagePdfBlob = async (
  reportCardElement: HTMLElement,
): Promise<Blob> => {
  const canvas = await html2canvas(reportCardElement, {
    scale: BULK_EXPORT_SCALE,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: reportCardElement.scrollWidth,
    windowHeight: reportCardElement.scrollHeight,
  });

  const imgData = canvas.toDataURL("image/jpeg", BULK_EXPORT_QUALITY);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [REPORT_CARD_PDF_WIDTH_PX, REPORT_CARD_PDF_HEIGHT_PX],
    compress: true,
  });

  const scale = Math.min(
    REPORT_CARD_PDF_WIDTH_PX / canvas.width,
    REPORT_CARD_PDF_HEIGHT_PX / canvas.height,
  );
  const imgWidth = canvas.width * scale;
  const imgHeight = canvas.height * scale;
  const xOffset = Math.max(0, (REPORT_CARD_PDF_WIDTH_PX - imgWidth) / 2);

  pdf.addImage(
    imgData,
    "JPEG",
    xOffset,
    0,
    imgWidth,
    imgHeight,
    undefined,
    "MEDIUM",
  );

  return pdf.output("blob");
};

const ReportCard = () => {
  const { school } = useSchool();
  const { user } = useAuth();
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

  // Bulk download state
  const [bulkDownloading, setBulkDownloading] = useState(false);

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

      // SUPER ADMIN logo first (from settings)
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

      // final (prefer config)
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
      const currentClassSubjects = await db.getSubjects(
        schoolId,
        selectedClass,
      );
      const normalizedCurrentSubjects = new Set(
        currentClassSubjects.map((subject) => normalizeSubjectName(subject)),
      );
      const shouldFilterToCurrentSubjects = normalizedCurrentSubjects.size > 0;

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
            const normalizedSubjectKey = normalizeSubjectName(subjectKey);
            if (
              shouldFilterToCurrentSubjects &&
              !normalizedCurrentSubjects.has(normalizedSubjectKey)
            ) {
              return acc;
            }
            const current = acc[normalizedSubjectKey];
            const currentTotal = current?.total ?? 0;
            const nextTotal = assessment.total ?? 0;
            if (!current || nextTotal >= currentTotal) {
              acc[normalizedSubjectKey] = assessment;
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

      let attendance: any[] = [];
      let holidayKeys = collectHolidayDateKeys(schoolConfig.holidayDates || []);
      let nonHolidayAttendance: any[] = [];
      try {
        attendance = await db.getClassAttendance(schoolId, selectedClass);
        holidayKeys = collectHolidayDateKeys([
          ...attendance.filter((r) => r.isHoliday).map((r) => r.date),
          ...(schoolConfig.holidayDates || []),
        ]);
        nonHolidayAttendance = attendance.filter((r) => !r.isHoliday);
      } catch (err) {
        console.warn(
          "Attendance data not available (missing attendance feature), using calendar defaults:",
          err,
        );
      }

      let skills: any = undefined;
      try {
        skills = await db
          .getStudentSkills(schoolId, selectedClass)
          .then((all) => all.find((s) => s.studentId === selectedStudent));
      } catch (err) {
        console.warn(
          "Student skills not available (missing basic_exam_reports), continuing without skills:",
          err,
        );
      }

      let classTeacher;
      try {
        const users = await db.getUsers(schoolId);
        classTeacher = users.find((u) =>
          u.assignedClassIds?.includes(selectedClass),
        );
      } catch (err) {
        console.warn(
          "Teacher data not available (missing teacher_management), continuing without teacher info:",
          err,
        );
        classTeacher = undefined;
      }

      // total school days (weekdays only, from restart to vacation/today), minus holidays.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const vacationDate = schoolConfig.vacationDate
        ? new Date(`${schoolConfig.vacationDate}T00:00:00`)
        : null;
      const endDate =
        vacationDate && vacationDate < today ? vacationDate : today;

      const expectedSchoolDays = getExpectedSchoolDayKeys({
        reopenDate: schoolConfig.schoolReopenDate,
        endDate,
        holidayDates: Array.from(holidayKeys),
        vacationDate: schoolConfig.vacationDate,
        nextTermBegins: schoolConfig.nextTermBegins,
      });

      const expectedSchoolDaySet = new Set(expectedSchoolDays);
      const totalSchoolDays = expectedSchoolDays.length;

      const studentPresentDates = new Set<string>();
      for (const record of nonHolidayAttendance) {
        if (!expectedSchoolDaySet.has(record.date)) continue;
        if (record.presentStudentIds.includes(selectedStudent)) {
          studentPresentDates.add(record.date);
        }
      }
      const presentDays = studentPresentDates.size;

      const absentDays = Math.max(0, totalSchoolDays - presentDays);

      const attendancePercentage =
        totalSchoolDays > 0
          ? Math.round((presentDays / totalSchoolDays) * 100)
          : 0;

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
            const normalizedSubjectKey = normalizeSubjectName(subjectKey);
            if (
              shouldFilterToCurrentSubjects &&
              !normalizedCurrentSubjects.has(normalizedSubjectKey)
            ) {
              return acc;
            }
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
            const key = `${assessment.studentId}_${normalizedSubjectKey}`;
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
          logoUrl: finalLogo, // PDF-safe logo
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

  const handleBulkDownload = async () => {
    if (!schoolId || !selectedClass) return;

    console.log("Starting bulk download for class:", selectedClass);
    setBulkDownloading(true);
    try {
      const studentsInClass = await db.getStudents(schoolId, selectedClass);
      console.log("Found students:", studentsInClass.length);
      if (studentsInClass.length === 0) {
        showToast("No students found in this class.", { type: "error" });
        return;
      }

      const schoolConfig: SchoolConfig = await db.getSchoolConfig(schoolId);
      const termNumber = parseTermNumber(schoolConfig.currentTerm);
      const currentClassSubjects = await db.getSubjects(
        schoolId,
        selectedClass,
      );
      const normalizedCurrentSubjects = new Set(
        currentClassSubjects.map((subject) => normalizeSubjectName(subject)),
      );
      const shouldFilterToCurrentSubjects = normalizedCurrentSubjects.size > 0;

      // SUPER ADMIN logo first (from settings)
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

      // final (prefer config)
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

      const academicYear = schoolConfig.academicYear;
      let classTeacher: any = undefined;
      try {
        const users = await db.getUsers(schoolId);
        classTeacher = users.find((u) =>
          u.assignedClassIds?.includes(selectedClass),
        );
      } catch (err) {
        console.warn(
          "Teacher data not available (missing teacher_management), continuing without teacher info:",
          err,
        );
      }

      let allRemarks: any[] = [];
      try {
        allRemarks = await db.getStudentRemarks(schoolId, selectedClass);
      } catch (err) {
        console.warn(
          "Student remarks not available (missing basic_exam_reports), continuing without remarks:",
          err,
        );
      }

      let allSkills: any[] = [];
      try {
        allSkills = await db.getStudentSkills(schoolId, selectedClass);
      } catch (err) {
        console.warn(
          "Student skills not available (missing basic_exam_reports), continuing without skills:",
          err,
        );
      }

      // Fetch all assessments for the class and term
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
            const normalizedSubjectKey = normalizeSubjectName(subjectKey);
            if (
              shouldFilterToCurrentSubjects &&
              !normalizedCurrentSubjects.has(normalizedSubjectKey)
            ) {
              return acc;
            }
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
            const key = `${assessment.studentId}_${normalizedSubjectKey}`;
            if (!acc[key]) {
              acc[key] = {
                studentId: assessment.studentId,
                subject: normalizedSubjectKey,
                testScore: Number(assessment.testScore || 0),
                homeworkScore: Number(assessment.homeworkScore || 0),
                projectScore: Number(assessment.projectScore || 0),
                examScore: Number(assessment.examScore || 0),
                total: normalizedTotal,
                grade: calculateGrade(normalizedTotal).grade,
                position: 0, // Will be calculated later
              };
            }
            return acc;
          },
          {} as Record<string, any>,
        ),
      );

      // Calculate positions
      const subjectGroups = allStudentsAssessmentsForClass.reduce(
        (acc, assessment) => {
          if (!acc[assessment.subject]) acc[assessment.subject] = [];
          acc[assessment.subject].push(assessment);
          return acc;
        },
        {} as Record<string, any[]>,
      );

      Object.values(subjectGroups).forEach((assessments: any[]) => {
        (assessments as any[]).sort((a, b) => b.total - a.total);
        (assessments as any[]).forEach((assessment, index) => {
          assessment.position = index + 1;
        });
      });

      // Create ZIP file
      const zip = new JSZip();

      // Generate individual PDFs for each student
      for (let i = 0; i < studentsInClass.length; i++) {
        const student = studentsInClass[i];
        console.log(
          `Generating PDF ${i + 1}/${studentsInClass.length} for student: ${student.name}`,
        );

        const studentAssessments = allStudentsAssessmentsForClass.filter(
          (a) => a.studentId === student.id,
        );

        const totalScoreForStudent = studentAssessments.reduce(
          (sum, a) => sum + (a.total || 0),
          0,
        );
        const averageScore =
          studentAssessments.length > 0
            ? (totalScoreForStudent / studentAssessments.length).toFixed(1)
            : "0.0";

        const studentRemark = allRemarks.find(
          (r) => r.studentId === student.id && Number(r.term) === termNumber,
        );

        const adminRemarkId = `${student.id}_term${termNumber}_${academicYear}`;
        let adminRemarkData: any = undefined;
        try {
          adminRemarkData = await db.getAdminRemark(schoolId, adminRemarkId);
        } catch (err) {
          console.warn(
            "Admin remark not available (missing basic_exam_reports), continuing without admin remark:",
            err,
          );
          adminRemarkData = undefined;
        }

        const skills = allSkills.find((s) => s.studentId === student.id);

        // Calculate attendance
        let attendance: any[] = [];
        let holidayKeys = new Set<string>();
        let nonHolidayAttendance: any[] = [];

        try {
          attendance = await db.getClassAttendance(schoolId, selectedClass);
          holidayKeys = collectHolidayDateKeys([
            ...attendance.filter((r) => r.isHoliday).map((r) => r.date),
            ...(schoolConfig.holidayDates || []),
          ]);
          nonHolidayAttendance = attendance.filter((r) => !r.isHoliday);
        } catch (error) {
          console.warn(
            "Attendance feature not available, using default values:",
            error,
          );
          // Use config holidays only
          holidayKeys = collectHolidayDateKeys(schoolConfig.holidayDates || []);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const vacationDate = schoolConfig.vacationDate
          ? new Date(`${schoolConfig.vacationDate}T00:00:00`)
          : null;
        const endDate =
          vacationDate && vacationDate < today ? vacationDate : today;

        const expectedSchoolDays = getExpectedSchoolDayKeys({
          reopenDate: schoolConfig.schoolReopenDate,
          endDate,
          holidayDates: Array.from(holidayKeys),
          vacationDate: schoolConfig.vacationDate,
          nextTermBegins: schoolConfig.nextTermBegins,
        });

        const expectedSchoolDaySet = new Set(expectedSchoolDays);
        const totalSchoolDays = expectedSchoolDays.length;

        const studentPresentDates = new Set<string>();
        if (nonHolidayAttendance.length > 0) {
          for (const record of nonHolidayAttendance) {
            if (!expectedSchoolDaySet.has(record.date)) continue;
            if (record.presentStudentIds.includes(student.id)) {
              studentPresentDates.add(record.date);
            }
          }
        }
        const presentDays = studentPresentDates.size;
        const absentDays = Math.max(0, totalSchoolDays - presentDays);
        const attendancePercentage =
          totalSchoolDays > 0
            ? Math.round((presentDays / totalSchoolDays) * 100)
            : 0;

        // Calculate rank and promotion status
        const allStudentsTotalScores = studentsInClass.map((s) => {
          const assessments = allStudentsAssessmentsForClass.filter(
            (a) => a.studentId === s.id,
          );
          const totalScore = assessments.reduce(
            (acc, a) => acc + (a.total || 0),
            0,
          );
          return { studentId: s.id, totalScore };
        });

        allStudentsTotalScores.sort((a, b) => {
          if (b.totalScore !== a.totalScore) {
            return b.totalScore - a.totalScore;
          }
          return a.studentId.localeCompare(b.studentId);
        });

        const rank =
          allStudentsTotalScores.findIndex((s) => s.studentId === student.id) +
          1;

        const currentClassIndex = CLASSES_LIST.findIndex(
          (c) => c.id === student?.classId,
        );
        const nextClassName =
          currentClassIndex >= 0 && currentClassIndex < CLASSES_LIST.length - 1
            ? CLASSES_LIST[currentClassIndex + 1].name
            : "";

        const isPromotionalTerm = schoolConfig.isPromotionalTerm ?? true;
        const promotionStatus = isPromotionalTerm
          ? totalScoreForStudent >= PASS_THRESHOLD
            ? nextClassName
              ? `Promoted to ${nextClassName}`
              : "Promoted"
            : "Fail"
          : "N/A";

        // Build data in the correct format for ReportCardLayout
        const data = {
          schoolInfo: {
            name:
              school?.name || schoolConfig.schoolName || "School Manager GH",
            logoUrl: printableLogo,
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
          performance: studentAssessments || [],
          positionRule: schoolConfig.positionRule || "subject",
          gradingScale: schoolConfig.gradingScale,
          summary: {
            totalScore: totalScoreForStudent || 0,
            averageScore: averageScore,
            overallGrade: calculateGrade(Number(averageScore)).grade,
            classPosition: `${rank}${["st", "nd", "rd"][rank - 1] || "th"}`,
            totalStudents: studentsInClass.length || 0,
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
            teacher: studentRemark?.remark || "N/A",
            classTeacher: studentRemark?.remark || "N/A",
            headTeacher:
              adminRemarkData?.remark ||
              schoolConfig.headTeacherRemark ||
              "An outstanding performance. The school is proud of you.",
          },
          promotion: {
            status: promotionStatus,
          },
          termDates: {
            endDate: schoolConfig.termEndDate || "",
            reopeningDate: schoolConfig.nextTermBegins || "",
            vacationDate: schoolConfig.vacationDate || "",
          },
          allStudentsAssessments: allStudentsAssessmentsForClass,
        };

        // Create a temporary container for this student's report card
        const studentContainer = document.createElement("div");
        studentContainer.style.position = "fixed";
        studentContainer.style.left = "0";
        studentContainer.style.top = "0";
        studentContainer.style.width = `${REPORT_CARD_PDF_WIDTH_PX}px`;
        studentContainer.style.minHeight = `${REPORT_CARD_PDF_HEIGHT_PX}px`;
        studentContainer.style.background = "white";
        studentContainer.style.padding = "0";
        studentContainer.style.boxSizing = "border-box";
        studentContainer.style.visibility = "visible";
        studentContainer.style.pointerEvents = "none";
        studentContainer.style.zIndex = "2147483647";
        studentContainer.style.overflow = "hidden";
        document.body.appendChild(studentContainer);

        // Render the report card
        const root = createRoot(studentContainer);

        // Add error boundary by wrapping in try-catch during render
        try {
          console.log(`Rendering PDF data for student: ${student.name}`, {
            hasSchoolInfo: !!data.schoolInfo,
            hasStudentInfo: !!data.studentInfo,
            hasAttendance: !!data.attendance,
            hasPerformance: !!data.performance,
          });

          flushSync(() => {
            root.render(React.createElement(ReportCardLayout, { data }));
          });
          await waitForNextPaint();

          // Wait for rendering with increased timeout and check for content
          let attempts = 0;
          const maxAttempts = 10;
          while (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (
              studentContainer.children.length > 0 &&
              studentContainer.textContent?.trim()
            ) {
              console.log(
                `Container has content after ${attempts + 1} seconds for ${student.name}`,
              );
              break;
            }
            attempts++;
          }

          if (attempts >= maxAttempts) {
            console.warn(
              `Container still empty after ${maxAttempts} seconds for ${student.name}`,
            );
            console.log(
              `Container HTML:`,
              studentContainer.innerHTML.substring(0, 500),
            );
          }

          const reportCardElement = studentContainer.querySelector(
            "#report-card",
          ) as HTMLElement | null;

          if (!reportCardElement) {
            throw new Error(
              `Bulk export could not find #report-card for ${student.name}`,
            );
          }

          reportCardElement.style.width = `${REPORT_CARD_PDF_WIDTH_PX}px`;
          reportCardElement.style.minHeight = `${REPORT_CARD_PDF_HEIGHT_PX}px`;
          reportCardElement.style.margin = "0";
          reportCardElement.style.borderRadius = "0";
          reportCardElement.style.boxShadow = "none";

          // Wait for images to load
          try {
            await waitForImages(reportCardElement);
            console.log(`Images loaded for ${student.name}`);
          } catch (imgError) {
            console.warn(
              `Error waiting for images for ${student.name}:`,
              imgError,
            );
          }
        } catch (renderError) {
          console.error(
            `Error rendering PDF for student ${student.name}:`,
            renderError,
          );
          root.unmount();
          document.body.removeChild(studentContainer);
          // Continue with next student even if this one fails
          continue;
        }

        // Generate PDF for this student
        try {
          const reportCardElement = studentContainer.querySelector(
            "#report-card",
          ) as HTMLElement | null;

          if (!reportCardElement) {
            throw new Error(
              `Bulk export could not find rendered report card for ${student.name}`,
            );
          }

          console.log(
            `Starting PDF generation for ${student.name}, container children: ${studentContainer.children.length}, text length: ${studentContainer.textContent?.length || 0}`,
          );

          let pdfBlob = await generateSinglePagePdfBlob(reportCardElement);

          console.log(
            `PDF generated successfully for ${student.name}`,
            `(${(pdfBlob.size / 1024 / 1024).toFixed(2)} MB)`,
            `Blob type: ${pdfBlob.type}`,
          );

          if (pdfBlob.size < 1024) {
            console.warn(
              `PDF blob for ${student.name} is very small (${pdfBlob.size} bytes) - retrying export`,
            );
            pdfBlob = await generateSinglePagePdfBlob(reportCardElement);
          }

          // Add PDF to ZIP
          const sanitizedName = student.name
            .replace(/[^a-z0-9]/gi, "_")
            .toLowerCase();
          zip.file(`${sanitizedName}_${i + 1}.pdf`, pdfBlob);
        } catch (pdfError) {
          console.error(
            `Failed to generate PDF for student ${student.name}:`,
            pdfError,
          );
          // Continue with next student even if PDF generation fails
        } finally {
          // Clean up
          try {
            root.unmount();
          } catch (e) {
            console.warn("Error unmounting root:", e);
          }
          try {
            document.body.removeChild(studentContainer);
          } catch (e) {
            console.warn("Error removing container:", e);
          }
        }
      }

      // Generate ZIP file
      console.log("Creating ZIP file...");
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Create download link
      const zipUrl = URL.createObjectURL(zipBlob);
      const zipLink = document.createElement("a");
      zipLink.href = zipUrl;
      zipLink.download = `${selectedClass}_ReportCards_${schoolConfig.academicYear}_Term${termNumber}.zip`;
      document.body.appendChild(zipLink);
      zipLink.click();
      document.body.removeChild(zipLink);
      URL.revokeObjectURL(zipUrl);

      console.log("ZIP file downloaded successfully");
      showToast(
        `Downloaded ${studentsInClass.length} report cards as ZIP file successfully!`,
        {
          type: "success",
        },
      );
    } catch (error: any) {
      console.error("Error generating bulk report cards:", error);
      showToast(
        `Failed to generate report cards: ${error.message || "An unknown error occurred."}`,
        { type: "error" },
      );
    } finally {
      setBulkDownloading(false);
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
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "admin_remark_saved",
        entityId: remarkData.id,
        meta: {
          status: "success",
          module: "Report Card",
          studentId: selectedStudent,
          classId: selectedClass,
          actorName: user?.fullName || "",
        },
      });
      generateReport();
    } catch (error) {
      console.error("Error saving admin remark:", error);
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "admin_remark_save_failed",
        entityId: selectedStudent,
        meta: {
          status: "failed",
          module: "Report Card",
          studentId: selectedStudent,
          classId: selectedClass,
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
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

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={generateReport}
            disabled={!selectedStudent || loading}
            className="px-6 py-2 bg-[#1160A8] text-white rounded-lg hover:bg-[#0B4A82] disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate Report"}
          </button>

          <button
            onClick={handleBulkDownload}
            disabled={!selectedClass || bulkDownloading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {bulkDownloading ? "Downloading..." : "Download All Report Cards"}
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          To download all student report cards at once, select the class and
          click <span className="font-semibold">Download All Report Cards</span>.
          The system will generate one PDF per student and save them together in
          a ZIP file.
        </div>
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
