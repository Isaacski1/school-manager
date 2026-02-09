import { firestore } from "./firebase";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  User,
  UserRole,
  Student,
  AttendanceRecord,
  TeacherAttendanceRecord,
  Assessment,
  Notice,
  ClassTimetable,
  SystemNotification,
  MonthlyTeacherAttendance,
  TeacherAttendanceAnalytics,
  StudentRemark,
  StudentSkills,
  ClassSubjectConfig,
  ClassRoom,
  SchoolConfig,
  AdminRemark,
  Backup,
} from "../types";
import {
  CURRENT_TERM,
  ACADEMIC_YEAR,
  CLASSES_LIST,
  nurserySubjects,
  kgSubjects,
  primarySubjects,
  jhsSubjects,
} from "../constants";

class FirestoreService {
  // Helper to get array from collection
  private async getCollection<T>(collectionName: string): Promise<T[]> {
    const querySnapshot = await getDocs(collection(firestore, collectionName));
    return querySnapshot.docs.map((doc) => doc.data() as T);
  }

  private requireSchoolId(schoolId?: string, method = "operation"): string {
    if (!schoolId) {
      throw new Error(`schoolId is required for ${method}`);
    }
    return schoolId;
  }

  private async getCollectionBySchoolId<T>(
    collectionName: string,
    schoolId?: string,
  ): Promise<T[]> {
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      `getCollectionBySchoolId(${collectionName})`,
    );
    const q = query(
      collection(firestore, collectionName),
      where("schoolId", "==", scopedSchoolId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((doc) => doc.data() as T);
  }

  // --- Config ---
  async getSchoolConfig(schoolId?: string): Promise<SchoolConfig> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getSchoolConfig");
    const docRef = doc(firestore, "settings", scopedSchoolId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data() as SchoolConfig;
      const config = { ...data, schoolId: scopedSchoolId };

      if (config.nextTermBegins && !config.termTransitionProcessed) {
        const nextTermDate = new Date(config.nextTermBegins + "T00:00:00");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (!Number.isNaN(nextTermDate.getTime()) && today >= nextTermDate) {
          const resetConfig = {
            ...config,
            schoolReopenDate:
              config.nextTermBegins || config.schoolReopenDate || "",
          };
          await this.resetForNewTerm(resetConfig);
          const refreshed = await getDoc(docRef);
          if (refreshed.exists()) {
            return {
              ...(refreshed.data() as SchoolConfig),
              schoolId: scopedSchoolId,
            };
          }
        }
      }

      return config;
    }

    // Default config FOR THIS SCHOOL ONLY
    return {
      schoolId: scopedSchoolId,
      schoolName: "New School",
      academicYear: ACADEMIC_YEAR,
      currentTerm: `Term ${CURRENT_TERM}`,
      headTeacherRemark: "Keep it up.",
      termEndDate: "",
      schoolReopenDate: "",
      vacationDate: "",
      nextTermBegins: "",
      termTransitionProcessed: false,
      holidayDates: [],
    };
  }

  async updateSchoolConfig(config: SchoolConfig): Promise<void> {
    const docId = this.requireSchoolId(config.schoolId, "updateSchoolConfig");
    await setDoc(doc(firestore, "settings", docId), config);
  }

  // --- Users ---
  async getUsers(schoolId?: string): Promise<User[]> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getUsers");
    const q = query(
      collection(firestore, "users"),
      where("schoolId", "==", scopedSchoolId),
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(
      (docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as User,
    );
  }

  async addUser(user: User): Promise<void> {
    await setDoc(doc(firestore, "users", user.id), user);
  }

  async deleteUser(id: string): Promise<void> {
    await deleteDoc(doc(firestore, "users", id));
  }

  async updateUserAssignedClasses(
    id: string,
    assignedClassIds: string[],
  ): Promise<void> {
    await updateDoc(doc(firestore, "users", id), {
      assignedClassIds,
    });
  }

  // --- Students ---
  async getStudents(schoolId?: string, classId?: string): Promise<Student[]> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getStudents");
    const studentsRef = collection(firestore, "students");
    const conditions: any[] = [where("schoolId", "==", scopedSchoolId)];
    if (classId) conditions.push(where("classId", "==", classId));
    const q = query(studentsRef, ...conditions);
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Student);
  }

  async addStudent(student: Student): Promise<void> {
    this.requireSchoolId(student.schoolId, "addStudent");
    await setDoc(doc(firestore, "students", student.id), student);
  }

  async updateStudent(student: Student): Promise<void> {
    this.requireSchoolId(student.schoolId, "updateStudent");
    await updateDoc(doc(firestore, "students", student.id), {
      ...student,
      ...(student.schoolId ? { schoolId: student.schoolId } : {}),
    });
  }

  async deleteStudent(id: string): Promise<void> {
    await deleteDoc(doc(firestore, "students", id));
  }

  // --- Subjects ---
  async getSubjects(schoolId?: string, classId?: string): Promise<string[]> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getSubjects");
    if (!classId) return [];
    const q = query(
      collection(firestore, "class_subjects"),
      where("schoolId", "==", scopedSchoolId),
      where("classId", "==", classId),
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return (snap.docs[0].data() as ClassSubjectConfig).subjects;
    }
    return [];
  }

  async addSubject(
    classId: string,
    name: string,
    schoolId: string,
  ): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "addSubject");
    const current = await this.getSubjects(scopedSchoolId, classId);
    if (!current.includes(name)) {
      await setDoc(
        doc(firestore, "class_subjects", `${scopedSchoolId}_${classId}`),
        {
          schoolId: scopedSchoolId,
          classId,
          subjects: [...current, name],
        },
      );
    }
  }

  async updateSubject(
    classId: string,
    oldName: string,
    newName: string,
    schoolId: string,
  ): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "updateSubject");
    const current = await this.getSubjects(scopedSchoolId, classId);
    const idx = current.indexOf(oldName);
    if (idx !== -1) {
      current[idx] = newName;
      await setDoc(
        doc(firestore, "class_subjects", `${scopedSchoolId}_${classId}`),
        {
          schoolId: scopedSchoolId,
          classId,
          subjects: current,
        },
      );
    }
  }

  async deleteSubject(
    classId: string,
    name: string,
    schoolId: string,
  ): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "deleteSubject");
    const current = await this.getSubjects(scopedSchoolId, classId);
    const updated = current.filter((s) => s !== name);
    await setDoc(
      doc(firestore, "class_subjects", `${scopedSchoolId}_${classId}`),
      {
        schoolId: scopedSchoolId,
        classId,
        subjects: updated,
      },
    );
  }

  async seedClassSubjects(
    classId: string,
    subjects: string[],
    schoolId: string,
  ): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "seedClassSubjects");
    await setDoc(
      doc(firestore, "class_subjects", `${scopedSchoolId}_${classId}`),
      {
        schoolId: scopedSchoolId,
        classId,
        subjects,
      },
    );
  }

  async resetAllClassSubjects(schoolId?: string): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "resetAllClassSubjects",
    );
    const q = query(
      collection(firestore, "class_subjects"),
      where("schoolId", "==", scopedSchoolId),
    );
    const snap = await getDocs(q);
    const deletions = snap.docs.map((d) =>
      deleteDoc(doc(firestore, "class_subjects", d.id)),
    );
    await Promise.all(deletions);
  }

  // --- Attendance ---
  async getAttendance(
    schoolId?: string,
    classId?: string,
    date?: string,
  ): Promise<AttendanceRecord | undefined> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getAttendance");
    if (!classId || !date) return undefined;
    const q = query(
      collection(firestore, "attendance"),
      where("schoolId", "==", scopedSchoolId),
      where("classId", "==", classId),
      where("date", "==", date),
    );
    const snap = await getDocs(q);
    return snap.empty ? undefined : (snap.docs[0].data() as AttendanceRecord);
  }

  async getClassAttendance(
    schoolId?: string,
    classId?: string,
  ): Promise<AttendanceRecord[]> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getClassAttendance");
    if (!classId) return [];
    const q = query(
      collection(firestore, "attendance"),
      where("schoolId", "==", scopedSchoolId),
      where("classId", "==", classId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AttendanceRecord);
  }

  async getAttendanceByDate(
    schoolId?: string,
    date?: string,
  ): Promise<AttendanceRecord[]> {
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getAttendanceByDate",
    );
    if (!date) return [];
    const q = query(
      collection(firestore, "attendance"),
      where("schoolId", "==", scopedSchoolId),
      where("date", "==", date),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AttendanceRecord);
  }

  async saveAttendance(record: AttendanceRecord): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(
      record.schoolId,
      "saveAttendance",
    );
    const id = `${scopedSchoolId}_${record.classId}_${record.date}`;
    await setDoc(doc(firestore, "attendance", id), { ...record, id });
  }

  // --- Assessments ---
  async getAssessments(
    schoolId?: string,
    classId?: string,
    subject?: string,
  ): Promise<Assessment[]> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getAssessments");
    if (!classId || !subject) return [];
    const q = query(
      collection(firestore, "assessments"),
      where("schoolId", "==", scopedSchoolId),
      where("classId", "==", classId),
      where("subject", "==", subject),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Assessment);
  }

  async getAllAssessments(schoolId?: string): Promise<Assessment[]> {
    return this.getCollectionBySchoolId<Assessment>("assessments", schoolId);
  }

  async saveAssessment(assessment: Assessment): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(
      assessment.schoolId,
      "saveAssessment",
    );
    const id =
      assessment.id ||
      `${scopedSchoolId}_${assessment.studentId}_${assessment.subject}_${assessment.term}_${assessment.academicYear}`;
    await setDoc(doc(firestore, "assessments", id), { ...assessment, id });
  }

  async resetAssessmentsForClass(
    schoolId?: string,
    classId?: string,
    seedDefaults = false,
    newTerm?: number,
  ): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "resetAssessmentsForClass",
    );
    if (!classId) return;
    const q = query(
      collection(firestore, "assessments"),
      where("schoolId", "==", scopedSchoolId),
      where("classId", "==", classId),
    );
    const snap = await getDocs(q);
    const deletions = snap.docs.map((d) =>
      deleteDoc(doc(firestore, "assessments", d.id)),
    );
    await Promise.all(deletions);

    if (seedDefaults) {
      const students = await this.getStudents(scopedSchoolId, classId);
      const subjects = await this.getSubjects(scopedSchoolId, classId);
      const ops: Promise<void>[] = [];

      // Determine the new term number (default to CURRENT_TERM if not provided)
      const termNum = newTerm || CURRENT_TERM;

      for (const student of students) {
        for (const subject of subjects) {
          const id = `${student.id}_${subject}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const assessment: Assessment = {
            id,
            schoolId: scopedSchoolId,
            studentId: student.id,
            classId,
            term: termNum as 1 | 2 | 3,
            academicYear: ACADEMIC_YEAR,
            subject,
            testScore: 0,
            homeworkScore: 0,
            projectScore: 0,
            examScore: 0,
            total: 0,
          };
          ops.push(setDoc(doc(firestore, "assessments", id), assessment));
        }
      }
      await Promise.all(ops);
    }
  }

  // --- Notices ---
  async getNotices(schoolId?: string): Promise<Notice[]> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getNotices");
    const q = query(
      collection(firestore, "notices"),
      where("schoolId", "==", scopedSchoolId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Notice);
  }

  async addNotice(notice: Notice): Promise<void> {
    this.requireSchoolId(notice.schoolId, "addNotice");
    await setDoc(doc(firestore, "notices", notice.id), notice);
  }

  async deleteNotice(id: string): Promise<void> {
    await deleteDoc(doc(firestore, "notices", id));
  }

  // --- Student Remarks ---
  async getStudentRemarks(
    schoolId?: string,
    classId?: string,
  ): Promise<StudentRemark[]> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getStudentRemarks");
    if (!classId) return [];
    const q = query(
      collection(firestore, "student_remarks"),
      where("schoolId", "==", scopedSchoolId),
      where("classId", "==", classId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as StudentRemark);
  }

  async saveStudentRemark(remark: StudentRemark): Promise<void> {
    this.requireSchoolId(remark.schoolId, "saveStudentRemark");
    await setDoc(doc(firestore, "student_remarks", remark.id), remark);
  }

  // --- Student Skills ---
  async getStudentSkills(
    schoolId?: string,
    classId?: string,
  ): Promise<StudentSkills[]> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getStudentSkills");
    if (!classId) return [];
    const q = query(
      collection(firestore, "student_skills"),
      where("schoolId", "==", scopedSchoolId),
      where("classId", "==", classId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as StudentSkills);
  }

  async saveStudentSkills(skills: StudentSkills): Promise<void> {
    this.requireSchoolId(skills.schoolId, "saveStudentSkills");
    await setDoc(doc(firestore, "student_skills", skills.id), skills);
  }

  // --- Notifications (Admin Activity Log) ---
  async addSystemNotification(
    message: string,
    type: "attendance" | "assessment" | "system",
    schoolId?: string,
  ): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "addSystemNotification",
    );
    const id = `${scopedSchoolId}_${Date.now()}`;
    const notification: SystemNotification = {
      id,
      schoolId: scopedSchoolId,
      message,
      createdAt: Date.now(),
      isRead: false,
      type,
    };
    await setDoc(doc(firestore, "admin_notifications", id), notification);
  }

  async getSystemNotifications(
    schoolId?: string,
  ): Promise<SystemNotification[]> {
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getSystemNotifications",
    );
    const q = query(
      collection(firestore, "admin_notifications"),
      where("schoolId", "==", scopedSchoolId),
      limit(20),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as SystemNotification)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await updateDoc(doc(firestore, "admin_notifications", id), {
      isRead: true,
    });
  }

  async deleteSystemNotification(id: string): Promise<void> {
    await deleteDoc(doc(firestore, "admin_notifications", id));
  }

  // --- Timetables ---
  async getTimetable(
    schoolId?: string,
    classId?: string,
  ): Promise<ClassTimetable | undefined> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getTimetable");
    if (!classId) return undefined;
    const q = query(
      collection(firestore, "timetables"),
      where("schoolId", "==", scopedSchoolId),
      where("classId", "==", classId),
      limit(1),
    );
    const snap = await getDocs(q);
    return snap.empty ? undefined : (snap.docs[0].data() as ClassTimetable);
  }

  async saveTimetable(timetable: ClassTimetable): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(
      timetable.schoolId,
      "saveTimetable",
    );
    await setDoc(
      doc(firestore, "timetables", `${scopedSchoolId}_${timetable.classId}`),
      { ...timetable, schoolId: scopedSchoolId },
    );
  }

  // --- Dashboard/Aggregates ---
  async getStudentPerformance(
    schoolId: string,
    studentId: string,
    classId: string,
  ) {
    const attendanceRecords = await this.getClassAttendance(schoolId, classId);
    const holidayDates = new Set(
      attendanceRecords.filter((r) => r.isHoliday).map((r) => r.date),
    );
    const schoolConfig = await this.getSchoolConfig(schoolId);
    const configHolidayDates = new Set(
      (schoolConfig.holidayDates || []).map((h) => h.date),
    );

    let totalDays = 0;
    let schoolDates: string[] = [];
    if (schoolConfig.schoolReopenDate) {
      const reopen = new Date(`${schoolConfig.schoolReopenDate}T00:00:00`);
      const vacation = schoolConfig.vacationDate
        ? new Date(`${schoolConfig.vacationDate}T00:00:00`)
        : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = vacation && vacation < today ? vacation : today;

      if (!Number.isNaN(reopen.getTime())) {
        const current = new Date(reopen);
        while (current <= endDate) {
          const day = current.getDay();
          const isWeekend = day === 0 || day === 6;
          if (!isWeekend) {
            const dateKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
            if (
              !holidayDates.has(dateKey) &&
              !configHolidayDates.has(dateKey)
            ) {
              totalDays++;
              schoolDates.push(dateKey);
            }
          }
          current.setDate(current.getDate() + 1);
        }
      }
    }

    if (!totalDays) {
      const nonHoliday = attendanceRecords.filter(
        (r) => !r.isHoliday && !configHolidayDates.has(r.date),
      );
      totalDays = nonHoliday.length;
      schoolDates = nonHoliday.map((r) => r.date).sort();
    }
    const presentDays = attendanceRecords.filter(
      (r) =>
        !r.isHoliday &&
        !configHolidayDates.has(r.date) &&
        r.presentStudentIds.includes(studentId),
    ).length;
    const attendancePercentage =
      totalDays === 0 ? 0 : Math.round((presentDays / totalDays) * 100);

    if (!schoolDates.length) {
      schoolDates = attendanceRecords
        .filter((r) => !r.isHoliday && !configHolidayDates.has(r.date))
        .map((r) => r.date)
        .sort();
    }
    const presentDates = attendanceRecords
      .filter(
        (r) =>
          !r.isHoliday &&
          !configHolidayDates.has(r.date) &&
          r.presentStudentIds.includes(studentId),
      )
      .map((r) => r.date)
      .sort();

    const q = query(
      collection(firestore, "assessments"),
      where("schoolId", "==", schoolId),
      where("studentId", "==", studentId),
    );
    const snap = await getDocs(q);
    const allAssessments = snap.docs
      .map((d) => d.data() as Assessment)
      .filter((a) => true);

    const subjects = await this.getSubjects(schoolId, classId);

    const grades = subjects.map((subject) => {
      const found = allAssessments.find((a) => a.subject === subject);
      if (found) return found;
      return { subject, total: 0 } as Partial<Assessment>;
    });

    return {
      attendance: {
        total: totalDays,
        present: presentDays,
        percentage: attendancePercentage,
        schoolDates,
        presentDates,
      },
      grades,
    };
  }

  async getDashboardStats(schoolId?: string) {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getDashboardStats");
    const [studentsSnap, usersSnap, attendanceSnap] = await Promise.all([
      getDocs(
        query(
          collection(firestore, "students"),
          where("schoolId", "==", scopedSchoolId),
        ),
      ),
      getDocs(
        query(
          collection(firestore, "users"),
          where("schoolId", "==", scopedSchoolId),
        ),
      ),
      getDocs(
        query(
          collection(firestore, "attendance"),
          where("schoolId", "==", scopedSchoolId),
        ),
      ),
    ]);

    const students = studentsSnap.docs.map((d) => d.data() as Student);
    const users = usersSnap.docs.map((d) => d.data() as User);
    const config = await this.getSchoolConfig(scopedSchoolId);
    const configHolidaySet = new Set(
      (config.holidayDates || []).map((h) => h.date),
    );
    const attendance = attendanceSnap.docs
      .map((d) => d.data() as AttendanceRecord)
      .filter(
        (record) => !record.isHoliday && !configHolidaySet.has(record.date),
      );

    const male = students.filter((s) => s.gender === "Male").length;
    const female = students.filter((s) => s.gender === "Female").length;

    const classAttendance = CLASSES_LIST.map((cls) => {
      const records = attendance.filter((r) => r.classId === cls.id);
      const studentsInClass = students.filter((s) => s.classId === cls.id);

      if (records.length > 0 && studentsInClass.length > 0) {
        const totalPossible = records.length * studentsInClass.length;
        const totalPresent = records.reduce(
          (sum, r) => sum + r.presentStudentIds.length,
          0,
        );
        const pct = Math.round((totalPresent / totalPossible) * 100);
        return { className: cls.name, percentage: pct, id: cls.id };
      }

      return { className: cls.name, percentage: 0, id: cls.id };
    });

    return {
      studentsCount: students.length,
      teachersCount: users.filter((u) => u.role === UserRole.TEACHER).length,
      gender: { male, female },
      classAttendance,
    };
  }

  async getDashboardSummary(schoolId?: string) {
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getDashboardSummary",
    );
    const [studentsCountSnap, teachersCountSnap] = await Promise.all([
      getCountFromServer(
        query(
          collection(firestore, "students"),
          where("schoolId", "==", scopedSchoolId),
        ),
      ),
      getCountFromServer(
        query(
          collection(firestore, "users"),
          where("schoolId", "==", scopedSchoolId),
          where("role", "==", UserRole.TEACHER),
        ),
      ),
    ]);

    return {
      studentsCount: studentsCountSnap.data().count,
      teachersCount: teachersCountSnap.data().count,
    };
  }

  // --- Teacher Attendance ---
  async getTeacherAttendance(
    schoolId?: string,
    teacherId?: string,
    date?: string,
  ): Promise<TeacherAttendanceRecord | undefined> {
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getTeacherAttendance",
    );
    if (!teacherId || !date) return undefined;
    const q = query(
      collection(firestore, "teacher_attendance"),
      where("schoolId", "==", scopedSchoolId),
      where("teacherId", "==", teacherId),
      where("date", "==", date),
    );
    const snap = await getDocs(q);
    return snap.empty
      ? undefined
      : (snap.docs[0].data() as TeacherAttendanceRecord);
  }

  async getAllTeacherAttendance(
    schoolId?: string,
    date?: string,
  ): Promise<TeacherAttendanceRecord[]> {
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getAllTeacherAttendance",
    );
    if (!date) return [];
    const q = query(
      collection(firestore, "teacher_attendance"),
      where("schoolId", "==", scopedSchoolId),
      where("date", "==", date),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as TeacherAttendanceRecord);
  }

  async saveTeacherAttendance(record: TeacherAttendanceRecord): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(
      record.schoolId,
      "saveTeacherAttendance",
    );
    const id = `${scopedSchoolId}_${record.teacherId}_${record.date}`;
    await setDoc(doc(firestore, "teacher_attendance", id), {
      ...record,
      id,
    });
  }

  async getAllTeacherAttendanceRecords(
    schoolId?: string,
  ): Promise<TeacherAttendanceRecord[]> {
    return this.getCollectionBySchoolId<TeacherAttendanceRecord>(
      "teacher_attendance",
      schoolId,
    );
  }

  async resetAllTeacherAttendance(schoolId?: string): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "resetAllTeacherAttendance",
    );
    const q = query(
      collection(firestore, "teacher_attendance"),
      where("schoolId", "==", scopedSchoolId),
    );
    const snap = await getDocs(q);
    const deletions = snap.docs.map((d) =>
      deleteDoc(doc(firestore, "teacher_attendance", d.id)),
    );
    await Promise.all(deletions);
  }

  // --- Admin Remarks ---
  async getAdminRemark(
    schoolId?: string,
    remarkId?: string,
  ): Promise<AdminRemark | undefined> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getAdminRemark");
    if (!remarkId) return undefined;
    const docRef = doc(firestore, "admin_remarks", remarkId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return undefined;
    const data = snap.data() as AdminRemark;
    return data.schoolId === scopedSchoolId ? data : undefined;
  }

  async saveAdminRemark(remark: AdminRemark): Promise<void> {
    this.requireSchoolId(remark.schoolId, "saveAdminRemark");
    await setDoc(doc(firestore, "admin_remarks", remark.id), remark);
  }

  /**
   * Create a complete backup of the current term's data before resetting.
   */
  async createTermBackup(
    currentConfig: SchoolConfig,
    currentTerm: string,
    academicYear: string,
  ): Promise<void> {
    console.log(`Creating backup for ${currentTerm}, ${academicYear}...`);

    try {
      const schoolId = this.requireSchoolId(
        currentConfig.schoolId,
        "createTermBackup",
      );
      const [
        students,
        users,
        attendanceRecords,
        teacherAttendanceRecords,
        assessments,
        studentRemarks,
        adminRemarks,
        studentSkills,
        timetables,
        notices,
        adminNotifications,
        activityLogs,
      ] = await Promise.all([
        this.getCollectionBySchoolId<Student>("students", schoolId),
        this.getCollectionBySchoolId<User>("users", schoolId),
        this.getCollectionBySchoolId<AttendanceRecord>("attendance", schoolId),
        this.getCollectionBySchoolId<TeacherAttendanceRecord>(
          "teacher_attendance",
          schoolId,
        ),
        this.getCollectionBySchoolId<Assessment>("assessments", schoolId),
        this.getCollectionBySchoolId<StudentRemark>(
          "student_remarks",
          schoolId,
        ),
        this.getCollectionBySchoolId<AdminRemark>("admin_remarks", schoolId),
        this.getCollectionBySchoolId<StudentSkills>("student_skills", schoolId),
        this.getCollectionBySchoolId<ClassTimetable>("timetables", schoolId),
        this.getCollectionBySchoolId<Notice>("notices", schoolId),
        this.getCollectionBySchoolId<SystemNotification>(
          "admin_notifications",
          schoolId,
        ),
        this.getCollectionBySchoolId<any>("activity_logs", schoolId),
      ]);

      const classSubjectsSnap = await getDocs(
        query(
          collection(firestore, "class_subjects"),
          where("schoolId", "==", schoolId),
        ),
      );
      const classSubjects: ClassSubjectConfig[] = classSubjectsSnap.docs.map(
        (d) => d.data() as ClassSubjectConfig,
      );

      const backup: Backup = {
        id: `backup_${Date.now()}`,
        schoolId,
        timestamp: Date.now(),
        term: currentTerm,
        academicYear: academicYear,
        data: {
          schoolConfig: currentConfig,
          students,
          attendanceRecords,
          teacherAttendanceRecords,
          assessments,
          studentRemarks,
          adminRemarks,
          studentSkills,
          timetables,
          users,
          classSubjects,
          notices,
          adminNotifications,
          activityLogs,
        },
      };

      await setDoc(doc(firestore, "backups", backup.id), backup);
      console.log(`Backup created successfully: ${backup.id}`);
    } catch (error) {
      console.error("Error creating backup:", error);
      throw error;
    }
  }

  /**
   * Reset the system for a new term.
   */
  async resetForNewTerm(currentConfig: SchoolConfig): Promise<void> {
    console.log(
      "Initiating term transition for:",
      currentConfig.currentTerm,
      currentConfig.academicYear,
    );

    await this.createTermBackup(
      currentConfig,
      currentConfig.currentTerm,
      currentConfig.academicYear,
    );

    const classIds = CLASSES_LIST.map((c) => c.id);

    const schoolId = this.requireSchoolId(
      currentConfig.schoolId,
      "resetForNewTerm",
    );

    const resetPromises = [
      (async () => {
        const q = query(
          collection(firestore, "attendance"),
          where("schoolId", "==", schoolId),
        );
        const snap = await getDocs(q);
        const deletions = snap.docs.map((d) =>
          deleteDoc(doc(firestore, "attendance", d.id)),
        );
        await Promise.all(deletions);
        console.log("Cleared student attendance records.");
      })(),

      this.resetAllTeacherAttendance(schoolId),

      (async () => {
        const q = query(
          collection(firestore, "student_remarks"),
          where("schoolId", "==", schoolId),
        );
        const snap = await getDocs(q);
        const deletions = snap.docs.map((d) =>
          deleteDoc(doc(firestore, "student_remarks", d.id)),
        );
        await Promise.all(deletions);
        console.log("Cleared student remarks.");
      })(),

      (async () => {
        const q = query(
          collection(firestore, "student_skills"),
          where("schoolId", "==", schoolId),
        );
        const snap = await getDocs(q);
        const deletions = snap.docs.map((d) =>
          deleteDoc(doc(firestore, "student_skills", d.id)),
        );
        await Promise.all(deletions);
        console.log("Cleared student skills.");
      })(),

      (async () => {
        const q = query(
          collection(firestore, "admin_remarks"),
          where("schoolId", "==", schoolId),
        );
        const snap = await getDocs(q);
        const deletions = snap.docs.map((d) =>
          deleteDoc(doc(firestore, "admin_remarks", d.id)),
        );
        await Promise.all(deletions);
        console.log("Cleared admin remarks.");
      })(),

      (async () => {
        const q = query(
          collection(firestore, "admin_notifications"),
          where("schoolId", "==", schoolId),
        );
        const snap = await getDocs(q);
        const deletions = snap.docs.map((d) =>
          deleteDoc(doc(firestore, "admin_notifications", d.id)),
        );
        await Promise.all(deletions);
        console.log("Cleared system notifications.");
      })(),

      (async () => {
        const q = query(
          collection(firestore, "notices"),
          where("schoolId", "==", schoolId),
        );
        const snap = await getDocs(q);
        const deletions = snap.docs.map((d) =>
          deleteDoc(doc(firestore, "notices", d.id)),
        );
        await Promise.all(deletions);
        console.log("Cleared notices.");
      })(),
    ];
    await Promise.all(resetPromises);

    // Calculate the new term number FIRST before resetting assessments
    let newTerm = 1;
    let newAcademicYear = currentConfig.academicYear;
    const currentTermNumber = parseInt(currentConfig.currentTerm.split(" ")[1]);

    if (currentTermNumber === 3) {
      newTerm = 1;
      const years = currentConfig.academicYear.split("-").map(Number);
      newAcademicYear = `${years[0] + 1}-${years[1] + 1}`;
    } else {
      newTerm = currentTermNumber + 1;
    }

    // Reset and seed assessments with the NEW term number (only once, with correct term)
    for (const classId of classIds) {
      await this.resetAssessmentsForClass(
        currentConfig.schoolId,
        classId,
        true,
        newTerm,
      );
      console.log(
        `Reset and re-seeded assessments for class: ${classId} with term ${newTerm}`,
      );
    }

    const updatedConfig: SchoolConfig = {
      ...currentConfig,
      currentTerm: `Term ${newTerm}`,
      academicYear: newAcademicYear,
      termTransitionProcessed: true,
      schoolReopenDate: currentConfig.schoolReopenDate || "",
      vacationDate: "",
      nextTermBegins: "",
    };
    await this.updateSchoolConfig(updatedConfig);

    console.log(
      "SchoolConfig updated for new term:",
      `Term ${newTerm}`,
      newAcademicYear,
    );
  }

  // --- Teacher Attendance Analytics ---
  async getTeacherAttendanceAnalytics(
    schoolId?: string,
    termStartDate?: string,
    vacationDate?: string,
  ): Promise<TeacherAttendanceAnalytics[]> {
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getTeacherAttendanceAnalytics",
    );
    const config = await this.getSchoolConfig(scopedSchoolId);

    // If no explicit start date is provided and the school hasn't reopened, return empty.
    if (!termStartDate && !config.schoolReopenDate) {
      return [];
    }

    const teachers = await this.getUsers(scopedSchoolId);
    const teacherUsers = teachers.filter((t) => t.role === UserRole.TEACHER);
    const allRecords =
      await this.getAllTeacherAttendanceRecords(scopedSchoolId);

    // Use config.academicYear for fallback if schoolReopenDate is not set
    const fallbackAcademicYear = config.academicYear || ACADEMIC_YEAR; // Use config.academicYear if present, else fallback to constant
    const defaultStartDate = `${fallbackAcademicYear.split("-")[0]}-09-01`;

    const startDate =
      termStartDate || config.schoolReopenDate || defaultStartDate;
    const endDate = vacationDate || new Date().toISOString().split("T")[0];

    const analytics: TeacherAttendanceAnalytics[] = [];

    for (const teacher of teacherUsers) {
      const teacherRecords = allRecords.filter(
        (r) => r.teacherId === teacher.id,
      );

      const recordsInRange = teacherRecords.filter((r) => {
        return r.date >= startDate && r.date <= endDate && !r.isHoliday;
      });

      const monthlyData: Record<string, { total: number; present: number }> =
        {};

      recordsInRange.forEach((record) => {
        const date = new Date(record.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { total: 0, present: 0 };
        }

        monthlyData[monthKey].total += 1;
        if (record.status === "present") {
          monthlyData[monthKey].present += 1;
        }
      });

      const monthlyBreakdown: MonthlyTeacherAttendance[] = Object.entries(
        monthlyData,
      )
        .map(([month, data]) => {
          const [year, monthNum] = month.split("-");
          const attendanceRate =
            data.total > 0 ? Math.round((data.present / data.total) * 100) : 0;

          return {
            teacherId: teacher.id,
            teacherName: teacher.fullName,
            month,
            year: parseInt(year),
            totalWorkingDays: data.total,
            presentDays: data.present,
            absentDays: data.total - data.present,
            attendanceRate,
            trend: "stable" as const,
          };
        })
        .sort((a, b) => a.month.localeCompare(b.month));

      for (let i = 0; i < monthlyBreakdown.length; i++) {
        if (i > 0) {
          const current = monthlyBreakdown[i].attendanceRate;
          const previous = monthlyBreakdown[i - 1].attendanceRate;
          if (current > previous + 5) {
            monthlyBreakdown[i].trend = "improving";
          } else if (current < previous - 5) {
            monthlyBreakdown[i].trend = "declining";
          } else {
            monthlyBreakdown[i].trend = "stable";
          }
        }
      }

      const totalDays = monthlyBreakdown.reduce(
        (sum, month) => sum + month.totalWorkingDays,
        0,
      );
      const totalPresent = monthlyBreakdown.reduce(
        (sum, month) => sum + month.presentDays,
        0,
      );
      const overallAttendance =
        totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0;

      analytics.push({
        teacherId: teacher.id,
        teacherName: teacher.fullName,
        overallAttendance,
        monthlyBreakdown,
        termStartDate: startDate,
        vacationDate:
          endDate !== new Date().toISOString().split("T")[0]
            ? endDate
            : undefined,
      });
    }

    return analytics;
  }
  // --- Backups ---
  async getBackups(filters?: {
    schoolId?: string;
    term?: string;
    academicYear?: string;
    date?: string;
  }): Promise<Partial<Backup>[]> {
    const scopedSchoolId = this.requireSchoolId(
      filters?.schoolId,
      "getBackups",
    );
    let q: any = query(
      collection(firestore, "backups"),
      where("schoolId", "==", scopedSchoolId),
    );
    const conditions: any[] = [];
    if (filters?.term) conditions.push(where("term", "==", filters.term));
    if (filters?.academicYear)
      conditions.push(where("academicYear", "==", filters.academicYear));
    if (filters?.date) {
      const start = new Date(filters.date).getTime();
      const end = start + 24 * 60 * 60 * 1000 - 1;
      conditions.push(
        where("timestamp", ">=", start),
        where("timestamp", "<=", end),
      );
    }
    if (conditions.length > 0) q = query(q, ...conditions);
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Partial<Backup>);
  }

  async getBackupDetails(
    schoolId?: string,
    id?: string,
  ): Promise<Backup | undefined> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "getBackupDetails");
    if (!id) return undefined;
    const snap = await getDoc(doc(firestore, "backups", id));
    if (!snap.exists()) return undefined;
    const data = snap.data() as Backup;
    return data.schoolId === scopedSchoolId ? data : undefined;
  }

  async deleteBackup(schoolId?: string, id?: string): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "deleteBackup");
    if (!id) return;
    const existing = await this.getBackupDetails(scopedSchoolId, id);
    if (!existing) return;
    await deleteDoc(doc(firestore, "backups", id));
  }

  async deleteAllBackups(schoolId?: string): Promise<void> {
    const scopedSchoolId = this.requireSchoolId(schoolId, "deleteAllBackups");
    const q = query(
      collection(firestore, "backups"),
      where("schoolId", "==", scopedSchoolId),
    );
    const snap = await getDocs(q);
    const deletions = snap.docs.map((d) =>
      deleteDoc(doc(firestore, "backups", d.id)),
    );
    await Promise.all(deletions);
  }
}

export const db = new FirestoreService();
