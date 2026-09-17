import admin from "firebase-admin";

const MAX_RESULT_SIZE = 100;
const MAX_DATE_RANGE_DAYS = 365;

const clampPageSize = (value) =>
  Number.isFinite(value) && value > 0 ? Math.min(value, MAX_RESULT_SIZE) : MAX_RESULT_SIZE;

const normalizeTerm = (value) => {
  const term = String(value || "")
    .trim()
    .toLowerCase();
  if (!["1", "2", "3"].includes(term)) return null;
  return term;
};

const normalizeAcademicYear = (value) => {
  const year = String(value || "").trim();
  if (!/^\d{4}-\d{4}$/.test(year)) return null;
  return year;
};

const normalizeDate = (value) => {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date;
};

const todayInAccra = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

const filterSensitiveStudentFields = (student) => {
  if (!student || typeof student !== "object") return student;
  const { fatherPhone, motherPhone, guardianPhone, fatherWhatsApp, motherWhatsApp, guardianWhatsApp, fatherEmail, motherEmail, guardianEmail, residentialAddress, digitalAddress, chronicDisease, ...safe } = student;
  return safe;
};

const filterSensitiveUserFields = (user) => {
  if (!user || typeof user !== "object") return user;
  const { tokenVersion, tokensRevokedAt, forcedLogoutAt, forcedLogoutBy, disabledReason, passwordHash, ...safe } = user;
  return safe;
};

export const searchStudents = async ({ schoolId, query, classId, limit = 20 }) => {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (normalizedQuery.length < 2) {
    return { error: "Query must be at least 2 characters", students: [] };
  }

  let students = [];
  const baseQuery = admin.firestore().collection("students").where("schoolId", "==", schoolId);
  
  if (classId) {
    const classSnap = await baseQuery.where("classId", "==", classId).limit(clampPageSize(limit)).get();
    students = classSnap.docs.map((doc) => filterSensitiveStudentFields({ id: doc.id, ...doc.data() }));
  } else {
    const snap = await baseQuery.limit(clampPageSize(limit)).get();
    students = snap.docs.map((doc) => filterSensitiveStudentFields({ id: doc.id, ...doc.data() }));
  }

  const filtered = students.filter((s) => {
    const name = String(s.name || "").toLowerCase();
    return name.includes(normalizedQuery);
  });

  return {
    students: filtered.slice(0, clampPageSize(limit)),
    totalMatches: filtered.length,
  };
};

export const getStudentProfile = async ({ schoolId, studentId }) => {
  const doc = await admin.firestore().collection("students").doc(studentId).get();
  if (!doc.exists) {
    return { error: "Student not found", student: null };
  }
  const data = doc.data();
  if (data.schoolId !== schoolId) {
    return { error: "Student not found", student: null };
  }
  return { student: filterSensitiveStudentFields({ id: doc.id, ...data }) };
};

export const getStudentAttendance = async ({ schoolId, studentId, classId, startDate, endDate, limit = 100 }) => {
  if (!studentId) {
    return { error: "studentId is required", attendance: [] };
  }

  if (!startDate || !endDate) {
    return { error: "startDate and endDate are required", attendance: [] };
  }

  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!start || !end) {
    return { error: "Invalid date format. Use YYYY-MM-DD.", attendance: [] };
  }

  const studentSnap = await admin.firestore().collection("students").doc(studentId).get();
  if (!studentSnap.exists) {
    return { error: "Student not found", attendance: [] };
  }
  const studentData = studentSnap.data();
  if (studentData.schoolId !== schoolId) {
    return { error: "Student not found", attendance: [] };
  }

  const targetClassId = classId || studentData.classId;
  if (!targetClassId) {
    return { error: "Student has no class assignment", attendance: [] };
  }

  const snap = await admin.firestore().collection("attendance")
    .where("schoolId", "==", schoolId)
    .where("classId", "==", targetClassId)
    .where("date", ">=", start)
    .where("date", "<=", end)
    .orderBy("date", "desc")
    .limit(clampPageSize(limit))
    .get();

  const records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  
  const presentDates = [];
  const absentDates = [];
  const holidayDates = [];
  const missingDates = [];

  const dateMap = new Map(records.map((r) => [r.date, r]));
  
  let currentDate = start;
  while (currentDate <= end) {
    const record = dateMap.get(currentDate);
    if (!record) {
      missingDates.push(currentDate);
    } else if (record.isHoliday) {
      holidayDates.push(currentDate);
    } else {
      const presentIds = Array.isArray(record.presentStudentIds) ? record.presentStudentIds : [];
      if (presentIds.includes(studentId)) {
        presentDates.push(currentDate);
      } else {
        absentDates.push(currentDate);
      }
    }
    currentDate = new Date(currentDate);
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate = currentDate.toISOString().split("T")[0];
  }

  const totalValidDays = presentDates.length + absentDates.length;
  const attendancePercentage = totalValidDays > 0 ? Math.round((presentDates.length / totalValidDays) * 100) : null;

  return {
    studentId,
    studentName: studentData.name,
    classId: targetClassId,
    dateRange: { start, end },
    summary: {
      present: presentDates.length,
      absent: absentDates.length,
      holidays: holidayDates.length,
      missingRegisters: missingDates.length,
      totalValidDays,
      attendancePercentage,
    },
    details: {
      presentDates,
      absentDates,
      holidayDates,
      missingDates: missingDates.slice(0, 10),
    },
  };
};

export const getStudentAssessmentResults = async ({ schoolId, studentId, classId, term, academicYear, limit = 100 }) => {
  const normalizedTerm = normalizeTerm(term);
  const normalizedYear = normalizeAcademicYear(academicYear);
  
  if (!normalizedTerm || !normalizedYear) {
    return { error: "term and academicYear are required (format: YYYY-YYYY)", assessments: [] };
  }

  let snap;
  if (studentId) {
    snap = await admin.firestore().collection("assessments")
      .where("schoolId", "==", schoolId)
      .where("studentId", "==", studentId)
      .where("term", "==", normalizedTerm)
      .where("academicYear", "==", normalizedYear)
      .orderBy("subject")
      .limit(clampPageSize(limit))
      .get();
  } else if (classId) {
    snap = await admin.firestore().collection("assessments")
      .where("schoolId", "==", schoolId)
      .where("classId", "==", classId)
      .where("term", "==", normalizedTerm)
      .where("academicYear", "==", normalizedYear)
      .orderBy("subject")
      .limit(clampPageSize(limit))
      .get();
  } else {
    return { error: "studentId or classId is required", assessments: [] };
  }

  return {
    assessments: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    totalRecords: snap.size,
  };
};

export const getStudentFeeBalance = async ({ schoolId, studentId, academicYear, term, limit = 50 }) => {
  const normalizedYear = normalizeAcademicYear(academicYear);
  const normalizedTerm = normalizeTerm(term);
  
  if (!normalizedYear || !normalizedTerm) {
    return { error: "academicYear and term are required", balance: null };
  }

  const [ledgerSnap, paymentsSnap, v2LedgerSnap, v2PaymentsSnap] = await Promise.all([
    admin.firestore().collection("student_ledgers")
      .where("schoolId", "==", schoolId)
      .where("studentId", "==", studentId)
      .where("academicYear", "==", normalizedYear)
      .where("term", "==", normalizedTerm)
      .limit(1)
      .get(),
    admin.firestore().collection("payments")
      .where("schoolId", "==", schoolId)
      .where("studentId", "==", studentId)
      .where("academicYear", "==", normalizedYear)
      .where("term", "==", normalizedTerm)
      .orderBy("createdAt", "desc")
      .limit(clampPageSize(limit))
      .get(),
    admin.firestore().collection("schools").doc(schoolId).collection("feeLedgers")
      .where("studentId", "==", studentId)
      .where("academicYear", "==", normalizedYear)
      .where("term", "==", normalizedTerm)
      .limit(1)
      .get(),
    admin.firestore().collection("schools").doc(schoolId).collection("payments")
      .where("studentId", "==", studentId)
      .where("academicYear", "==", normalizedYear)
      .where("term", "==", normalizedTerm)
      .orderBy("createdAt", "desc")
      .limit(clampPageSize(limit))
      .get(),
  ]);

  const ledgers = [];
  if (!ledgerSnap.empty) {
    ledgers.push({ ...ledgerSnap.docs[0].data(), _source: "root" });
  }
  if (!v2LedgerSnap.empty) {
    ledgers.push({ ...v2LedgerSnap.docs[0].data(), _source: "v2" });
  }

  if (ledgers.length === 0) {
    return { balance: null, message: "No fee ledger found for this student in the specified term" };
  }

  const ledger = ledgers[0];
  const fees = Array.isArray(ledger.fees) ? ledger.fees : [];
  
  const totalDue = fees.reduce((sum, fee) => sum + Number(fee?.amount || 0), 0);
  const openingPaid = fees.reduce((sum, fee) => sum + Number(fee?.openingPaidAmount || 0), 0);

  const payments = [...paymentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), ...v2PaymentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))];
  const recordedPaid = payments
    .filter((p) => String(p.studentId || "") === String(studentId))
    .reduce((sum, p) => sum + Number(p.amountPaid || 0), 0);

  const totalPaid = openingPaid + recordedPaid;
  const currentBalance = Math.max(0, totalDue - totalPaid);

  return {
    balance: {
      totalDue,
      openingPaid,
      recordedPaid,
      totalPaid,
      currentBalance,
      currency: "GHS",
      fees: fees.map((f) => ({
        feeName: f.feeName,
        amount: Number(f.amount || 0),
        openingPaidAmount: Number(f.openingPaidAmount || 0),
      })),
    },
    payments: payments.slice(0, 10).map((p) => ({
      id: p.id,
      amountPaid: Number(p.amountPaid || 0),
      paymentMethod: p.paymentMethod,
      createdAt: p.createdAt,
    })),
  };
};

export const getDailyAttendanceSummary = async ({ schoolId, classId, date, limit = 50 }) => {
  const targetDate = date ? normalizeDate(date) : todayInAccra();
  if (!targetDate) {
    return { error: "Invalid date format. Use YYYY-MM-DD.", summary: [] };
  }

  let attendance = [];
  const baseQuery = admin.firestore().collection("attendance").where("schoolId", "==", schoolId);
  
  if (classId) {
    const snap = await baseQuery.where("classId", "==", classId).where("date", "==", targetDate).get();
    attendance = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } else {
    const snap = await baseQuery.where("date", "==", targetDate).orderBy("classId").limit(clampPageSize(limit)).get();
    attendance = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  const summary = attendance.map((record) => {
    const presentCount = Array.isArray(record.presentStudentIds) ? record.presentStudentIds.length : 0;
    return {
      classId: record.classId,
      date: record.date,
      presentCount,
      isHoliday: record.isHoliday || false,
      holidayReason: record.holidayReason || null,
    };
  });

  return {
    summary,
    date: targetDate,
    totalClasses: summary.length,
  };
};
