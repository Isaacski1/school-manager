import { auth, firestore } from "./firebase";
import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  QueryConstraint,
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
  PlatformBroadcast,
  FeeDefinition,
  FeeTerm,
  StudentFeeLedger,
  StudentFeePayment,
  PaymentMethod,
  FinanceSettings,
  School,
  BackupType,
  RecoveryCollectionName,
  RecoveryCollectionScope,
} from "../types";
import { FeatureKey, hasFeature, resolveFeaturePlan } from "./featureAccess";
import { logActivity } from "./activityLog";
import {
  CURRENT_TERM,
  ACADEMIC_YEAR,
  CLASSES_LIST,
  crecheSubjects,
  nurserySubjects,
  kgSubjects,
  primarySubjects,
  jhsSubjects,
} from "../constants";

type SchoolScopedPage<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

class FirestoreService {
  private actorRoleCache: { uid: string; role: UserRole | null } | null = null;

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

  private async getCurrentActorRole(): Promise<UserRole | null> {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    if (this.actorRoleCache?.uid === uid) {
      return this.actorRoleCache.role;
    }

    try {
      const userSnap = await getDoc(doc(firestore, "users", uid));
      const role = userSnap.exists()
        ? (((userSnap.data() as User).role as UserRole | undefined) ?? null)
        : null;
      this.actorRoleCache = { uid, role };
      return role;
    } catch (error) {
      console.warn("Failed to resolve actor role for feature access", error);
      return null;
    }
  }

  private async isSuperAdminActor(): Promise<boolean> {
    return (await this.getCurrentActorRole()) === UserRole.SUPER_ADMIN;
  }

  private async requireFeature(
    schoolId?: string,
    feature?: FeatureKey,
  ): Promise<void> {
    if (!feature) return;
    if (await this.isSuperAdminActor()) return;
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      `requireFeature(${feature})`,
    );
    const schoolSnap = await getDoc(doc(firestore, "schools", scopedSchoolId));
    const school = schoolSnap.exists()
      ? ({ id: schoolSnap.id, ...(schoolSnap.data() as any) } as School)
      : null;
    const plan = resolveFeaturePlan(school);
    if (!hasFeature(plan, feature)) {
      throw new Error("FEATURE_ACCESS_DENIED");
    }
  }

  private async requireFeatures(
    schoolId?: string,
    features: FeatureKey[] = [],
  ): Promise<void> {
    if (!features.length) return;
    if (await this.isSuperAdminActor()) return;
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      `requireFeatures(${features.join(",")})`,
    );
    const schoolSnap = await getDoc(doc(firestore, "schools", scopedSchoolId));
    const school = schoolSnap.exists()
      ? ({ id: schoolSnap.id, ...(schoolSnap.data() as any) } as School)
      : null;
    const plan = resolveFeaturePlan(school);
    const missing = features.filter((feature) => !hasFeature(plan, feature));
    if (missing.length > 0) {
      throw new Error("FEATURE_ACCESS_DENIED");
    }
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

  private resolvePageSize(
    pageSize?: number,
    fallback = 100,
    max = 300,
  ): number {
    const parsed = Number(pageSize);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(max, Math.floor(parsed)));
  }

  private async getCollectionBySchoolIdPage<T>(
    collectionName: string,
    schoolId: string,
    options: {
      pageSize?: number;
      cursorId?: string | null;
      constraints?: QueryConstraint[];
      mapDoc?: (docSnap: any) => T;
    } = {},
  ): Promise<SchoolScopedPage<T>> {
    const pageSize = this.resolvePageSize(options.pageSize, 100, 300);
    const cursorId = String(options.cursorId || "").trim();
    const constraints: QueryConstraint[] = [
      where("schoolId", "==", schoolId),
      ...(options.constraints || []),
      orderBy(documentId()),
      limit(pageSize + 1),
    ];
    if (cursorId) {
      constraints.push(startAfter(cursorId));
    }

    const snap = await getDocs(
      query(collection(firestore, collectionName), ...constraints),
    );
    const docs = snap.docs;
    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
    const mapDoc =
      options.mapDoc ||
      ((docSnap: any) => ({ id: docSnap.id, ...(docSnap.data() as any) }) as T);

    return {
      items: pageDocs.map((docSnap) => mapDoc(docSnap)),
      nextCursor: hasMore
        ? (pageDocs[pageDocs.length - 1]?.id as string | undefined) || null
        : null,
      hasMore,
    };
  }

  private async getCollectionBySchoolIdWithDocId<T>(
    collectionName: string,
    schoolId: string,
  ): Promise<T[]> {
    const q = query(
      collection(firestore, collectionName),
      where("schoolId", "==", schoolId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => {
      const data = docSnap.data() as any;
      return {
        ...(data as T),
        id: (data?.id as string | undefined) || docSnap.id,
      } as T;
    });
  }

  private async getCollectionAtPathWithDocId<T>(
    collectionPath: string[],
  ): Promise<T[]> {
    const snap = await getDocs(collection(firestore, collectionPath.join("/")));
    return snap.docs.map((docSnap) => {
      const data = docSnap.data() as any;
      return {
        ...(data as T),
        id: (data?.id as string | undefined) || docSnap.id,
      } as T;
    });
  }

  private dedupeRowsByKey<T>(
    rows: T[] = [],
    resolveKey: (row: T, index: number) => string,
  ): T[] {
    const deduped = new Map<string, T>();
    rows.filter(Boolean).forEach((row, index) => {
      const key = String(resolveKey(row, index) || "").trim();
      if (!key) return;
      const rowData = row as any;
      deduped.set(key, rowData?.id ? row : ({ ...rowData, id: key } as T));
    });
    return Array.from(deduped.values());
  }

  private async getSchoolFinanceSnapshot(schoolId: string): Promise<{
    fees: FeeDefinition[];
    studentLedgers: StudentFeeLedger[];
    financePayments: StudentFeePayment[];
    billingPayments: Array<Record<string, unknown>>;
    financeSettings: FinanceSettings | null;
  }> {
    const [
      legacyFees,
      v2Fees,
      legacyLedgers,
      v2Ledgers,
      legacyPayments,
      v2Payments,
      financeSettingsSnap,
    ] = await Promise.all([
      this.getCollectionBySchoolIdWithDocId<FeeDefinition>(
        "fees",
        schoolId,
      ).catch(() => []),
      this.getCollectionAtPathWithDocId<FeeDefinition>([
        "schools",
        schoolId,
        "fees",
      ]).catch(() => []),
      this.getCollectionBySchoolIdWithDocId<StudentFeeLedger>(
        "student_ledgers",
        schoolId,
      ).catch(() => []),
      this.getCollectionAtPathWithDocId<StudentFeeLedger>([
        "schools",
        schoolId,
        "feeLedgers",
      ]).catch(() => []),
      this.getCollectionBySchoolIdWithDocId<Record<string, unknown>>(
        "payments",
        schoolId,
      ).catch(() => []),
      this.getCollectionAtPathWithDocId<Record<string, unknown>>([
        "schools",
        schoolId,
        "payments",
      ]).catch(() => []),
      getDoc(
        doc(firestore, "schools", schoolId, "financeSettings", "main"),
      ).catch(() => null),
    ]);

    const fees = this.dedupeRowsByKey<FeeDefinition>(
      [...legacyFees, ...v2Fees],
      (row, index) => String(row.id || `fee_${index}`),
    );
    const studentLedgers = this.dedupeRowsByKey<StudentFeeLedger>(
      [...legacyLedgers, ...v2Ledgers],
      (row, index) => String(row.id || `ledger_${index}`),
    );

    const allPayments = this.dedupeRowsByKey<Record<string, unknown>>(
      [...legacyPayments, ...v2Payments],
      (row, index) =>
        String(
          row.id ||
            row.reference ||
            row.receiptNumber ||
            row.transactionId ||
            `payment_${index}`,
        ),
    );

    const financePayments = allPayments.filter((row) =>
      Boolean((row as any)?.studentId),
    ) as unknown as StudentFeePayment[];
    const billingPayments = allPayments.filter(
      (row) => !(row as any)?.studentId,
    );

    const financeSettings =
      financeSettingsSnap &&
      "exists" in financeSettingsSnap &&
      financeSettingsSnap.exists()
        ? ({
            schoolId,
            ...(financeSettingsSnap.data() as FinanceSettings),
          } as FinanceSettings)
        : null;

    return {
      fees,
      studentLedgers,
      financePayments,
      billingPayments,
      financeSettings,
    };
  }

  private async getSchoolActivityLogs(schoolId: string): Promise<any[]> {
    const snap = await getDocs(
      collection(doc(firestore, "schools", schoolId), "activityLogs"),
    );
    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Record<string, unknown>),
    }));
  }

  private async getSchoolProfileSnapshot(
    schoolId: string,
  ): Promise<Partial<School> | null> {
    const snap = await getDoc(doc(firestore, "schools", schoolId));
    if (!snap.exists()) {
      return null;
    }

    const school = snap.data() as Partial<School>;
    return this.stripUndefinedDeep<Partial<School>>({
      id: schoolId,
      name: school.name || "",
      code: school.code || "",
      logoUrl: school.logoUrl || "",
      phone: school.phone || "",
      address: school.address || "",
      status: school.status,
      plan: school.plan,
      planEndsAt: school.planEndsAt,
      featurePlan: school.featurePlan,
      subscription: school.subscription,
      billing: school.billing,
      limits: school.limits,
      studentsCount: school.studentsCount,
      notes: school.notes,
    });
  }

  private stripUndefinedDeep<T>(value: T): T {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.stripUndefinedDeep(item))
        .filter((item) => item !== undefined) as T;
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return value;
    }

    const cleaned = Object.entries(value as Record<string, unknown>).reduce(
      (acc, [key, entryValue]) => {
        if (entryValue === undefined) {
          return acc;
        }
        acc[key] = this.stripUndefinedDeep(entryValue);
        return acc;
      },
      {} as Record<string, unknown>,
    );

    return cleaned as T;
  }

  private async commitChunkedOperations(
    operations: Array<(batch: ReturnType<typeof writeBatch>) => void>,
    chunkSize = 350,
  ): Promise<void> {
    if (!operations.length) return;

    for (let index = 0; index < operations.length; index += chunkSize) {
      const batch = writeBatch(firestore);
      operations.slice(index, index + chunkSize).forEach((operation) => {
        operation(batch);
      });
      await batch.commit();
    }
  }

  private async replaceSchoolScopedCollection<T extends { schoolId?: string }>(
    collectionName: string,
    schoolId: string,
    rows: T[] = [],
    resolveId: (row: T) => string,
  ): Promise<void> {
    const scopedRows = rows.filter(Boolean);
    const existing = await getDocs(
      query(
        collection(firestore, collectionName),
        where("schoolId", "==", schoolId),
      ),
    );
    const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> =
      [];

    existing.docs.forEach((docSnap) => {
      operations.push((batch) => batch.delete(docSnap.ref));
    });

    scopedRows.forEach((row) => {
      const normalizedRow = { ...row, schoolId } as T;
      operations.push((batch) =>
        batch.set(
          doc(firestore, collectionName, resolveId(normalizedRow)),
          normalizedRow,
        ),
      );
    });

    await this.commitChunkedOperations(operations);
  }

  private async replaceCollectionAtPath<T>(
    collectionPath: string[],
    rows: T[] = [],
    resolveId: (row: T) => string,
  ): Promise<void> {
    const collectionRef = collection(firestore, collectionPath.join("/"));
    const existing = await getDocs(collectionRef);
    const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> =
      [];

    existing.docs.forEach((docSnap) => {
      operations.push((batch) => batch.delete(docSnap.ref));
    });

    rows.filter(Boolean).forEach((row) => {
      operations.push((batch) =>
        batch.set(doc(collectionRef, resolveId(row)), row as any),
      );
    });

    await this.commitChunkedOperations(operations);
  }

  private async replaceSchoolActivityLogs(
    schoolId: string,
    rows: any[] = [],
  ): Promise<void> {
    await this.replaceCollectionAtPath(
      ["schools", schoolId, "activityLogs"],
      rows.filter(Boolean).map((row, index) => ({
        ...row,
        id:
          row?.id ||
          `${row?.actionType || row?.eventType || "activity"}_${row?.entityId || "entry"}_${index}`,
        schoolId,
      })),
      (row: any) => row.id,
    );
  }

  private async restoreSchoolProfileSnapshot(
    schoolId: string,
    schoolProfile?: Partial<School> | null,
    schoolSettings?: SchoolConfig | null,
  ): Promise<void> {
    const profileUpdate = this.stripUndefinedDeep({
      name: schoolProfile?.name || schoolSettings?.schoolName,
      code: schoolProfile?.code,
      logoUrl: schoolProfile?.logoUrl || schoolSettings?.logoUrl,
      phone: schoolProfile?.phone || schoolSettings?.phone,
      address: schoolProfile?.address || schoolSettings?.address,
      status: schoolProfile?.status,
      plan: schoolProfile?.plan,
      planEndsAt: schoolProfile?.planEndsAt,
      featurePlan: schoolProfile?.featurePlan,
      subscription: schoolProfile?.subscription,
      billing: schoolProfile?.billing,
      limits: schoolProfile?.limits,
      studentsCount: schoolProfile?.studentsCount,
      notes: schoolProfile?.notes,
    });

    if (!Object.keys(profileUpdate).length) {
      return;
    }

    await setDoc(doc(firestore, "schools", schoolId), profileUpdate, {
      merge: true,
    });
  }

  private generateBackupId(prefix = "backup"): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private isFullBackupType(backupType?: BackupType | null): boolean {
    return (
      !backupType ||
      backupType === "manual" ||
      backupType === "term-reset" ||
      backupType === "safety-restore"
    );
  }

  private async getRecordsByIds<T>(
    collectionName: string,
    ids: string[] = [],
  ): Promise<T[]> {
    if (!ids.length) return [];
    const records = await Promise.all(
      ids.map(async (id) => {
        const snap = await getDoc(doc(firestore, collectionName, id));
        return snap.exists() ? (snap.data() as T) : null;
      }),
    );
    return records.filter(Boolean) as T[];
  }

  private async upsertSchoolScopedCollection<T extends { schoolId?: string }>(
    collectionName: string,
    schoolId: string,
    rows: T[] = [],
    resolveId: (row: T) => string,
  ): Promise<void> {
    const operations = rows
      .filter(Boolean)
      .map(
        (row) => (batch: ReturnType<typeof writeBatch>) =>
          batch.set(doc(firestore, collectionName, resolveId(row)), {
            ...row,
            schoolId,
          } as T),
      );
    await this.commitChunkedOperations(operations);
  }

  private async upsertCollectionAtPath<T>(
    collectionPath: string[],
    rows: T[] = [],
    resolveId: (row: T) => string,
  ): Promise<void> {
    const collectionRef = collection(firestore, collectionPath.join("/"));
    const operations = rows
      .filter(Boolean)
      .map(
        (row) => (batch: ReturnType<typeof writeBatch>) =>
          batch.set(doc(collectionRef, resolveId(row)), row as any),
      );
    await this.commitChunkedOperations(operations);
  }

  private async getSchoolRecoveryContext(schoolId: string): Promise<{
    schoolName: string;
    term: string;
    academicYear: string;
  }> {
    try {
      const config = await this.getSchoolConfig(schoolId);
      return {
        schoolName: config.schoolName || "",
        term: config.currentTerm || "Recovery Snapshot",
        academicYear: config.academicYear || "Unknown",
      };
    } catch {
      return {
        schoolName: "",
        term: "Recovery Snapshot",
        academicYear: "Unknown",
      };
    }
  }

  private async createSnapshotRecord(params: {
    schoolId: string;
    backupType: BackupType;
    title?: string;
    description?: string;
    sourceAction?: string;
    sourceModule?: string;
    entityType?: string;
    entityId?: string;
    entityLabel?: string;
    recordCount?: number;
    collections?: RecoveryCollectionScope[];
    data?: Backup["data"];
    dedupeKey?: string;
    expiresAt?: number | null;
    term?: string;
    academicYear?: string;
    schoolName?: string;
  }): Promise<Backup> {
    const context =
      params.term && params.academicYear && params.schoolName !== undefined
        ? {
            term: params.term,
            academicYear: params.academicYear,
            schoolName: params.schoolName,
          }
        : await this.getSchoolRecoveryContext(params.schoolId);

    const backup = this.stripUndefinedDeep<Backup>({
      id: this.generateBackupId("backup"),
      schoolId: params.schoolId,
      schoolName: params.schoolName ?? context.schoolName,
      timestamp: Date.now(),
      term: params.term ?? context.term,
      academicYear: params.academicYear ?? context.academicYear,
      backupType: params.backupType,
      dedupeKey: params.dedupeKey,
      recoveryMeta: this.isFullBackupType(params.backupType)
        ? undefined
        : {
            title: params.title || "Recovery snapshot",
            description: params.description,
            sourceAction: params.sourceAction,
            sourceModule: params.sourceModule,
            entityType: params.entityType,
            entityId: params.entityId,
            entityLabel: params.entityLabel,
            recordCount: params.recordCount,
            collections: params.collections,
            expiresAt: params.expiresAt ?? null,
          },
      data: params.data,
    });

    await setDoc(doc(firestore, "backups", backup.id), backup);
    return backup;
  }

  private async createRecoveryPoint(params: {
    schoolId: string;
    title: string;
    description?: string;
    sourceAction?: string;
    sourceModule?: string;
    entityType?: string;
    entityId?: string;
    entityLabel?: string;
    recordCount?: number;
    collections: RecoveryCollectionScope[];
    data: Backup["data"];
    term?: string;
    academicYear?: string;
    schoolName?: string;
  }): Promise<Backup> {
    return this.createSnapshotRecord({
      ...params,
      backupType: "recovery-point",
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
  }

  private async createRecycleBinEntry(params: {
    schoolId: string;
    title: string;
    description?: string;
    sourceAction?: string;
    sourceModule?: string;
    entityType?: string;
    entityId?: string;
    entityLabel?: string;
    recordCount?: number;
    collections: RecoveryCollectionScope[];
    data: Backup["data"];
    term?: string;
    academicYear?: string;
    schoolName?: string;
  }): Promise<Backup> {
    return this.createSnapshotRecord({
      ...params,
      backupType: "recycle-bin",
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
  }

  private async buildCurrentSnapshotForScopes(
    schoolId: string,
    scopes: RecoveryCollectionScope[] = [],
  ): Promise<NonNullable<Backup["data"]>> {
    const snapshot: NonNullable<Backup["data"]> = {};

    for (const scope of scopes) {
      switch (scope.collection) {
        case "settings":
          snapshot.schoolSettings = await this.getSchoolConfig(schoolId);
          break;
        case "students":
          snapshot.students = await this.getRecordsByIds<Student>(
            "students",
            scope.recordIds,
          );
          break;
        case "teacher_attendance":
          snapshot.teacherAttendanceRecords =
            await this.getRecordsByIds<TeacherAttendanceRecord>(
              "teacher_attendance",
              scope.recordIds,
            );
          break;
        case "users":
          snapshot.users = await this.getRecordsByIds<User>(
            "users",
            scope.recordIds,
          );
          break;
        case "class_subjects":
          snapshot.classSubjects =
            await this.getRecordsByIds<ClassSubjectConfig>(
              "class_subjects",
              scope.recordIds,
            );
          break;
        case "notices":
          snapshot.notices = await this.getRecordsByIds<Notice>(
            "notices",
            scope.recordIds,
          );
          break;
        case "admin_notifications":
          snapshot.adminNotifications =
            await this.getRecordsByIds<SystemNotification>(
              "admin_notifications",
              scope.recordIds,
            );
          break;
        default:
          break;
      }
    }

    return snapshot;
  }

  private async restoreSnapshotScopes(
    schoolId: string,
    snapshot: Backup,
  ): Promise<void> {
    const scopes = snapshot.recoveryMeta?.collections || [];
    const data = snapshot.data || {};

    for (const scope of scopes) {
      switch (scope.collection) {
        case "settings": {
          const settings = data.schoolSettings || data.schoolConfig;
          if (settings) {
            await setDoc(
              doc(firestore, "settings", schoolId),
              { ...settings, schoolId },
              { merge: false },
            );
          }
          break;
        }
        case "students":
          await this.upsertSchoolScopedCollection(
            "students",
            schoolId,
            data.students || [],
            (row) => row.id,
          );
          break;
        case "teacher_attendance":
          await this.upsertSchoolScopedCollection(
            "teacher_attendance",
            schoolId,
            data.teacherAttendanceRecords || [],
            (row) => row.id,
          );
          break;
        case "users":
          await this.upsertSchoolScopedCollection(
            "users",
            schoolId,
            data.users || [],
            (row) => row.id,
          );
          break;
        case "class_subjects":
          await this.upsertSchoolScopedCollection(
            "class_subjects",
            schoolId,
            data.classSubjects || [],
            (row) => `${schoolId}_${row.classId}`,
          );
          break;
        case "notices":
          await this.upsertSchoolScopedCollection(
            "notices",
            schoolId,
            data.notices || [],
            (row) => row.id,
          );
          break;
        case "admin_notifications":
          await this.upsertSchoolScopedCollection(
            "admin_notifications",
            schoolId,
            data.adminNotifications || [],
            (row) => row.id,
          );
          break;
        case "fees": {
          const rows = data.fees || [];
          const useV2 = await this.useFinanceV2(schoolId);
          const feePath = useV2 ? ["schools", schoolId, "fees"] : ["fees"];
          await this.upsertCollectionAtPath(
            feePath,
            rows.map((row) => ({ ...row, schoolId })),
            (row) => row.id,
          );
          break;
        }
        case "student_ledgers": {
          const rows = data.studentLedgers || [];
          const useV2 = await this.useFinanceV2(schoolId);
          const ledgerPath = useV2
            ? ["schools", schoolId, "feeLedgers"]
            : ["student_ledgers"];
          await this.upsertCollectionAtPath(
            ledgerPath,
            rows.map((row) => ({ ...row, schoolId })),
            (row) => row.id,
          );
          break;
        }
        case "payments": {
          const rows = data.payments || [];
          const useV2 = await this.useFinanceV2(schoolId);
          const paymentPath = useV2
            ? ["schools", schoolId, "payments"]
            : ["payments"];
          await this.upsertCollectionAtPath(
            paymentPath,
            rows.map((row) => ({ ...row, schoolId })),
            (row) => row.id,
          );
          break;
        }
        case "finance_settings":
          if (data.financeSettings) {
            await setDoc(
              doc(firestore, "schools", schoolId, "financeSettings", "main"),
              { ...data.financeSettings, schoolId },
              { merge: true },
            );
          }
          break;
        default:
          break;
      }
    }
  }

  private shouldRunAutomaticTermTransition(config: SchoolConfig): boolean {
    if (
      !config.vacationDate ||
      !config.nextTermBegins ||
      config.termTransitionProcessed
    ) {
      return false;
    }

    const vacationDate = new Date(`${config.vacationDate}T00:00:00`);
    const nextTermDate = new Date(`${config.nextTermBegins}T00:00:00`);
    if (
      Number.isNaN(vacationDate.getTime()) ||
      Number.isNaN(nextTermDate.getTime())
    ) {
      return false;
    }

    vacationDate.setHours(0, 0, 0, 0);
    nextTermDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return today >= vacationDate && today >= nextTermDate;
  }

  async getFinanceSettings(schoolId?: string): Promise<FinanceSettings> {
    await this.requireFeature(schoolId, "fees_payments");
    const scopedSchoolId = this.requireSchoolId(schoolId, "getFinanceSettings");
    const docRef = doc(
      firestore,
      "schools",
      scopedSchoolId,
      "financeSettings",
      "main",
    );
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as FinanceSettings;
    }
    return { schoolId: scopedSchoolId, financeVersion: "v1" };
  }

  private async useFinanceV2(schoolId?: string): Promise<boolean> {
    const settings = await this.getFinanceSettings(schoolId);
    return settings.financeVersion === "v2";
  }

  // --- Config ---
  async getSchoolConfig(schoolId?: string): Promise<SchoolConfig> {
    await this.requireFeatures(schoolId, ["academic_year", "admin_dashboard"]);
    const scopedSchoolId = this.requireSchoolId(schoolId, "getSchoolConfig");
    const docRef = doc(firestore, "settings", scopedSchoolId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data() as SchoolConfig;
      const config = { ...data, schoolId: scopedSchoolId };
      const actorRole = await this.getCurrentActorRole();

      if (
        actorRole !== UserRole.TEACHER &&
        this.shouldRunAutomaticTermTransition(config)
      ) {
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
      gradingScale: {
        A: 80,
        B: 70,
        C: 60,
        D: 45,
      },
      positionRule: "total",
    };
  }

  async updateSchoolConfig(config: SchoolConfig): Promise<void> {
    await this.requireFeature(config.schoolId, "academic_year");
    const docId = this.requireSchoolId(config.schoolId, "updateSchoolConfig");
    await setDoc(doc(firestore, "settings", docId), config);
  }

  async saveFinanceSettings(settings: FinanceSettings): Promise<void> {
    await this.requireFeature(settings.schoolId, "fees_payments");
    const scopedSchoolId = this.requireSchoolId(
      settings.schoolId,
      "saveFinanceSettings",
    );
    await setDoc(
      doc(firestore, "schools", scopedSchoolId, "financeSettings", "main"),
      settings,
      { merge: true },
    );
  }

  // --- Users ---
  async getUsers(schoolId?: string): Promise<User[]> {
    await this.requireFeature(schoolId, "teacher_management");
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

  async getAllUsers(): Promise<User[]> {
    const querySnapshot = await getDocs(collection(firestore, "users"));
    return querySnapshot.docs.map(
      (docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as User,
    );
  }

  async updateUserStatus(payload: {
    userId: string;
    isActive: boolean;
    disabledAt?: number | null;
    disabledBy?: string | null;
    disabledReason?: string | null;
  }): Promise<void> {
    const { userId, isActive, disabledAt, disabledBy, disabledReason } =
      payload;
    await updateDoc(doc(firestore, "users", userId), {
      isActive,
      status: isActive ? "active" : "inactive",
      disabledAt: isActive ? null : disabledAt || Date.now(),
      disabledBy: isActive ? null : disabledBy || null,
      disabledReason: isActive ? null : disabledReason || null,
    });
  }

  async updateUserRole(payload: {
    userId: string;
    role: UserRole;
    schoolId?: string | null;
    roleUpdatedAt?: number | null;
    roleUpdatedBy?: string | null;
  }): Promise<void> {
    const { userId, role, schoolId, roleUpdatedAt, roleUpdatedBy } = payload;
    await updateDoc(doc(firestore, "users", userId), {
      role,
      ...(schoolId !== undefined ? { schoolId } : {}),
      roleUpdatedAt: roleUpdatedAt || Date.now(),
      roleUpdatedBy: roleUpdatedBy || null,
    });
  }

  async forceLogoutUser(payload: {
    userId: string;
    tokenVersion?: number;
    forcedLogoutAt?: number | null;
    forcedLogoutBy?: string | null;
  }): Promise<void> {
    const { userId, tokenVersion, forcedLogoutAt, forcedLogoutBy } = payload;
    await updateDoc(doc(firestore, "users", userId), {
      tokenVersion: (tokenVersion ?? 0) + 1,
      forcedLogoutAt: forcedLogoutAt || Date.now(),
      forcedLogoutBy: forcedLogoutBy || null,
    });
  }

  async addUser(user: User): Promise<void> {
    await this.requireFeature(user.schoolId || undefined, "teacher_management");
    await setDoc(doc(firestore, "users", user.id), user);
  }

  async deleteUser(id: string): Promise<void> {
    const existing = await getDoc(doc(firestore, "users", id));
    if (existing.exists()) {
      const data = existing.data() as User;
      await this.requireFeature(
        data.schoolId || undefined,
        "teacher_management",
      );
      if (data.schoolId) {
        let relatedAttendance: TeacherAttendanceRecord[] = [];
        try {
          const teacherAttendanceRecords =
            await this.getAllTeacherAttendanceRecords(data.schoolId);
          relatedAttendance = teacherAttendanceRecords.filter(
            (record) => record.teacherId === id,
          );
        } catch (attendanceError) {
          console.warn(
            "Skipping teacher attendance snapshot for recycle bin entry",
            attendanceError,
          );
        }
        await this.createRecycleBinEntry({
          schoolId: data.schoolId,
          title: `Deleted teacher: ${data.fullName || data.email || id}`,
          description:
            "Restores the deleted teacher profile and linked attendance records.",
          sourceAction: "teacher_deleted",
          sourceModule: "Teachers",
          entityType: "teacher",
          entityId: id,
          entityLabel: data.fullName || data.email || id,
          recordCount: 1 + relatedAttendance.length,
          collections: [
            {
              collection: "users",
              restoreMode: "merge",
              recordIds: [id],
              label: "Teacher profile",
            },
            {
              collection: "teacher_attendance",
              restoreMode: "merge",
              recordIds: relatedAttendance.map((record) => record.id),
              label: "Teacher attendance",
            },
          ],
          data: {
            users: [data],
            teacherAttendanceRecords: relatedAttendance,
          },
        });
      }
    }
    await deleteDoc(doc(firestore, "users", id));
  }

  async updateUserAssignedClasses(
    id: string,
    assignedClassIds: string[],
  ): Promise<void> {
    const existing = await getDoc(doc(firestore, "users", id));
    if (existing.exists()) {
      const data = existing.data() as User;
      await this.requireFeature(
        data.schoolId || undefined,
        "teacher_management",
      );
    }
    await updateDoc(doc(firestore, "users", id), {
      assignedClassIds,
    });
  }

  // --- Students ---
  async getStudentsPage(params: {
    schoolId?: string;
    classId?: string;
    pageSize?: number;
    cursorId?: string | null;
  }): Promise<SchoolScopedPage<Student>> {
    await this.requireFeature(params.schoolId, "student_management");
    const scopedSchoolId = this.requireSchoolId(
      params.schoolId,
      "getStudentsPage",
    );

    const constraints: QueryConstraint[] = [];
    if (params.classId) {
      constraints.push(where("classId", "==", params.classId));
    }

    return this.getCollectionBySchoolIdPage<Student>(
      "students",
      scopedSchoolId,
      {
        pageSize: params.pageSize,
        cursorId: params.cursorId,
        constraints,
        mapDoc: (docSnap) => {
          const data = docSnap.data() as Student;
          return {
            ...data,
            id: data.id || docSnap.id,
          };
        },
      },
    );
  }

  async getStudents(schoolId?: string, classId?: string): Promise<Student[]> {
    await this.requireFeature(schoolId, "student_management");
    const scopedSchoolId = this.requireSchoolId(schoolId, "getStudents");
    const studentsRef = collection(firestore, "students");
    const conditions: any[] = [where("schoolId", "==", scopedSchoolId)];
    if (classId) conditions.push(where("classId", "==", classId));
    const q = query(studentsRef, ...conditions);
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Student);
  }

  async addStudent(student: Student): Promise<void> {
    await this.requireFeature(student.schoolId, "student_management");
    this.requireSchoolId(student.schoolId, "addStudent");
    await setDoc(doc(firestore, "students", student.id), {
      ...student,
      createdAt: student.createdAt ?? Date.now(),
    });
  }

  async updateStudent(student: Student): Promise<void> {
    await this.requireFeature(student.schoolId, "student_management");
    this.requireSchoolId(student.schoolId, "updateStudent");
    await updateDoc(doc(firestore, "students", student.id), {
      ...student,
      ...(student.schoolId ? { schoolId: student.schoolId } : {}),
    });
  }

  async updateStudentsClassBulk(
    schoolId: string | undefined,
    updates: { id: string; classId: string }[],
  ): Promise<void> {
    await this.requireFeature(schoolId, "student_management");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "updateStudentsClassBulk",
    );
    if (!updates.length) return;
    const studentIds = updates.map((update) => update.id);
    const currentStudents = await this.getRecordsByIds<Student>(
      "students",
      studentIds,
    );

    if (currentStudents.length > 0) {
      await this.createRecoveryPoint({
        schoolId: scopedSchoolId,
        title: `Before bulk class update (${currentStudents.length} students)`,
        description:
          "Restores student class assignments before a bulk class change.",
        sourceAction: "students_class_bulk_update",
        sourceModule: "Students",
        entityType: "students",
        recordCount: currentStudents.length,
        collections: [
          {
            collection: "students",
            restoreMode: "merge",
            recordIds: currentStudents.map((student) => student.id),
            label: "Students",
          },
        ],
        data: {
          students: currentStudents,
        },
      });
    }

    const batch = writeBatch(firestore);
    updates.forEach((update) => {
      const studentRef = doc(firestore, "students", update.id);
      batch.update(studentRef, {
        classId: update.classId,
        schoolId: scopedSchoolId,
      });
    });
    await batch.commit();
  }

  async deleteStudent(id: string): Promise<void> {
    const existing = await getDoc(doc(firestore, "students", id));
    if (existing.exists()) {
      const data = existing.data() as Student;
      await this.requireFeature(
        data.schoolId || undefined,
        "student_management",
      );
      if (data.schoolId) {
        await this.createRecycleBinEntry({
          schoolId: data.schoolId,
          title: `Deleted student: ${data.name}`,
          description: "Restores a deleted student record.",
          sourceAction: "student_deleted",
          sourceModule: "Students",
          entityType: "student",
          entityId: id,
          entityLabel: data.name,
          recordCount: 1,
          collections: [
            {
              collection: "students",
              restoreMode: "merge",
              recordIds: [id],
              label: "Student",
            },
          ],
          data: {
            students: [data],
          },
        });
      }
    }
    await deleteDoc(doc(firestore, "students", id));
  }

  // --- Subjects ---
  async getSubjects(schoolId?: string, classId?: string): Promise<string[]> {
    await this.requireFeature(schoolId, "class_subject_management");
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
    const selectedClass = CLASSES_LIST.find((cls) => cls.id === classId);
    switch (selectedClass?.level) {
      case "CRECHE":
        return crecheSubjects;
      case "NURSERY":
        return nurserySubjects;
      case "KG":
        return kgSubjects;
      case "PRIMARY":
        return primarySubjects;
      case "JHS":
        return jhsSubjects;
      default:
        return [];
    }
  }

  async addSubject(
    classId: string,
    name: string,
    schoolId: string,
  ): Promise<void> {
    await this.requireFeature(schoolId, "class_subject_management");
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
    await this.requireFeature(schoolId, "class_subject_management");
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
    await this.requireFeature(schoolId, "class_subject_management");
    const scopedSchoolId = this.requireSchoolId(schoolId, "deleteSubject");
    const current = await this.getSubjects(scopedSchoolId, classId);
    if (current.includes(name)) {
      await this.createRecoveryPoint({
        schoolId: scopedSchoolId,
        title: `Before removing subject: ${name}`,
        description:
          "Restores the subject list for this class before a subject was removed.",
        sourceAction: "subject_deleted",
        sourceModule: "System Settings",
        entityType: "subject",
        entityId: `${classId}:${name}`,
        entityLabel: name,
        recordCount: 1,
        collections: [
          {
            collection: "class_subjects",
            restoreMode: "merge",
            recordIds: [`${scopedSchoolId}_${classId}`],
            label: "Class subjects",
          },
        ],
        data: {
          classSubjects: [
            {
              schoolId: scopedSchoolId,
              classId,
              subjects: current,
            },
          ],
        },
      });
    }
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
    await this.requireFeature(schoolId, "class_subject_management");
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
    await this.requireFeature(schoolId, "class_subject_management");
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
    await this.requireFeature(schoolId, "attendance");
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
    await this.requireFeature(schoolId, "attendance");
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

  async getClassAttendanceByDateRange(
    schoolId?: string,
    classId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<AttendanceRecord[]> {
    await this.requireFeature(schoolId, "attendance");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getClassAttendanceByDateRange",
    );
    if (!classId || !startDate || !endDate) return [];

    try {
      const rangedQuery = query(
        collection(firestore, "attendance"),
        where("schoolId", "==", scopedSchoolId),
        where("classId", "==", classId),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
      );
      const rangedSnap = await getDocs(rangedQuery);
      return rangedSnap.docs.map((d) => d.data() as AttendanceRecord);
    } catch (error) {
      // Fallback for environments missing composite indexes.
      const fallback = await this.getClassAttendance(scopedSchoolId, classId);
      return fallback.filter(
        (record) => record.date >= startDate && record.date <= endDate,
      );
    }
  }

  async getAttendanceByDate(
    schoolId?: string,
    date?: string,
  ): Promise<AttendanceRecord[]> {
    await this.requireFeature(schoolId, "attendance");
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

  async getAttendanceByDateRange(
    schoolId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<AttendanceRecord[]> {
    await this.requireFeature(schoolId, "attendance");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getAttendanceByDateRange",
    );
    if (!startDate || !endDate) return [];

    try {
      const rangedQuery = query(
        collection(firestore, "attendance"),
        where("schoolId", "==", scopedSchoolId),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
      );
      const rangedSnap = await getDocs(rangedQuery);
      return rangedSnap.docs.map(
        (docSnap) => docSnap.data() as AttendanceRecord,
      );
    } catch (error) {
      const fallbackQuery = query(
        collection(firestore, "attendance"),
        where("schoolId", "==", scopedSchoolId),
      );
      const fallbackSnap = await getDocs(fallbackQuery);
      return fallbackSnap.docs
        .map((docSnap) => docSnap.data() as AttendanceRecord)
        .filter((record) => record.date >= startDate && record.date <= endDate);
    }
  }

  async saveAttendance(record: AttendanceRecord): Promise<void> {
    await this.requireFeature(record.schoolId, "attendance");
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
    await this.requireFeature(schoolId, "basic_exam_reports");
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

  async getAssessmentsPage(params: {
    schoolId?: string;
    classId?: string;
    studentId?: string;
    subject?: string;
    term?: number;
    pageSize?: number;
    cursorId?: string | null;
  }): Promise<SchoolScopedPage<Assessment>> {
    await this.requireFeature(params.schoolId, "basic_exam_reports");
    const scopedSchoolId = this.requireSchoolId(
      params.schoolId,
      "getAssessmentsPage",
    );

    const constraints: QueryConstraint[] = [];
    if (params.classId) {
      constraints.push(where("classId", "==", params.classId));
    }
    if (params.studentId) {
      constraints.push(where("studentId", "==", params.studentId));
    }
    if (params.subject) {
      constraints.push(where("subject", "==", params.subject));
    }
    if (typeof params.term === "number") {
      constraints.push(where("term", "==", params.term));
    }

    return this.getCollectionBySchoolIdPage<Assessment>(
      "assessments",
      scopedSchoolId,
      {
        pageSize: params.pageSize,
        cursorId: params.cursorId,
        constraints,
        mapDoc: (docSnap) => {
          const data = docSnap.data() as Assessment;
          return {
            ...data,
            id: data.id || docSnap.id,
          };
        },
      },
    );
  }

  async getAllAssessments(schoolId?: string): Promise<Assessment[]> {
    await this.requireFeature(schoolId, "basic_exam_reports");
    return this.getCollectionBySchoolId<Assessment>("assessments", schoolId);
  }

  async getStudentAssessmentsByStudent(
    schoolId?: string,
    studentId?: string,
  ): Promise<Assessment[]> {
    await this.requireFeature(schoolId, "basic_exam_reports");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getStudentAssessmentsByStudent",
    );
    if (!studentId) return [];
    const q = query(
      collection(firestore, "assessments"),
      where("schoolId", "==", scopedSchoolId),
      where("studentId", "==", studentId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Assessment);
  }

  async saveAssessment(assessment: Assessment): Promise<void> {
    await this.requireFeature(assessment.schoolId, "basic_exam_reports");
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
    await this.requireFeature(schoolId, "basic_exam_reports");
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
    await this.requireFeature(schoolId, "admin_dashboard");
    const scopedSchoolId = this.requireSchoolId(schoolId, "getNotices");
    const q = query(
      collection(firestore, "notices"),
      where("schoolId", "==", scopedSchoolId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Notice);
  }

  async addNotice(notice: Notice): Promise<void> {
    await this.requireFeature(notice.schoolId, "admin_dashboard");
    this.requireSchoolId(notice.schoolId, "addNotice");
    await setDoc(doc(firestore, "notices", notice.id), notice);
  }

  async deleteNotice(id: string): Promise<void> {
    const existing = await getDoc(doc(firestore, "notices", id));
    if (existing.exists()) {
      const data = existing.data() as Notice;
      await this.requireFeature(data.schoolId || undefined, "admin_dashboard");
      if (data.schoolId) {
        await this.createRecycleBinEntry({
          schoolId: data.schoolId,
          title: `Deleted notice: ${data.date}`,
          description: "Restores a deleted school notice.",
          sourceAction: "notice_deleted",
          sourceModule: "System Settings",
          entityType: "notice",
          entityId: id,
          entityLabel: data.message,
          recordCount: 1,
          collections: [
            {
              collection: "notices",
              restoreMode: "merge",
              recordIds: [id],
              label: "Notice",
            },
          ],
          data: {
            notices: [data],
          },
        });
      }
    }
    await deleteDoc(doc(firestore, "notices", id));
  }

  // --- Platform Broadcasts ---
  async getPlatformBroadcasts(schoolId?: string): Promise<PlatformBroadcast[]> {
    await this.requireFeature(schoolId, "admin_dashboard");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getPlatformBroadcasts",
    );
    const q = query(
      collection(firestore, "platformBroadcasts"),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    const now = Date.now();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as PlatformBroadcast) }))
      .filter((b) => {
        const publishAt = b.publishAt
          ? b.publishAt instanceof Date
            ? b.publishAt.getTime()
            : typeof (b.publishAt as any)?.toDate === "function"
              ? (b.publishAt as any).toDate().getTime()
              : new Date(b.publishAt as any).getTime()
          : null;
        const expiresAt = b.expiresAt
          ? b.expiresAt instanceof Date
            ? b.expiresAt.getTime()
            : typeof (b.expiresAt as any)?.toDate === "function"
              ? (b.expiresAt as any).toDate().getTime()
              : new Date(b.expiresAt as any).getTime()
          : null;
        const matchesTarget =
          b.targetType === "ALL" ||
          (b.targetType === "SCHOOLS" &&
            (b.targetSchoolIds || []).includes(scopedSchoolId));
        const isPublished =
          b.status === "PUBLISHED" || b.status === "SCHEDULED";
        const isLive = !publishAt || publishAt <= now;
        const isActive = !expiresAt || expiresAt > now;
        return matchesTarget && isPublished && isLive && isActive;
      });
  }

  // --- Student Remarks ---
  async getStudentRemarks(
    schoolId?: string,
    classId?: string,
  ): Promise<StudentRemark[]> {
    await this.requireFeature(schoolId, "basic_exam_reports");
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

  async getStudentRemarksByStudent(
    schoolId?: string,
    studentId?: string,
  ): Promise<StudentRemark[]> {
    await this.requireFeature(schoolId, "basic_exam_reports");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getStudentRemarksByStudent",
    );
    if (!studentId) return [];
    const q = query(
      collection(firestore, "student_remarks"),
      where("schoolId", "==", scopedSchoolId),
      where("studentId", "==", studentId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as StudentRemark);
  }

  async saveStudentRemark(remark: StudentRemark): Promise<void> {
    await this.requireFeature(remark.schoolId, "basic_exam_reports");
    this.requireSchoolId(remark.schoolId, "saveStudentRemark");
    await setDoc(doc(firestore, "student_remarks", remark.id), remark);
  }

  // --- Student Skills ---
  async getStudentSkills(
    schoolId?: string,
    classId?: string,
  ): Promise<StudentSkills[]> {
    await this.requireFeature(schoolId, "basic_exam_reports");
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

  async getStudentSkillsByStudent(
    schoolId?: string,
    studentId?: string,
  ): Promise<StudentSkills[]> {
    await this.requireFeature(schoolId, "basic_exam_reports");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getStudentSkillsByStudent",
    );
    if (!studentId) return [];
    const q = query(
      collection(firestore, "student_skills"),
      where("schoolId", "==", scopedSchoolId),
      where("studentId", "==", studentId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as StudentSkills);
  }

  async saveStudentSkills(skills: StudentSkills): Promise<void> {
    await this.requireFeature(skills.schoolId, "basic_exam_reports");
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
    const baseRef = collection(firestore, "admin_notifications");
    const q = schoolId
      ? query(baseRef, where("schoolId", "==", schoolId), limit(20))
      : query(baseRef, limit(50));
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
    await this.requireFeature(schoolId, "timetable");
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
    await this.requireFeature(timetable.schoolId, "timetable");
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
    await this.requireFeature(schoolId, "basic_exam_reports");
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
    await this.requireFeature(schoolId, "basic_analytics");
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
    await this.requireFeature(schoolId, "basic_analytics");
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
    await this.requireFeature(schoolId, "teacher_attendance");
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
    if (snap.empty) return undefined;
    const records = snap.docs.map((docSnap) => {
      const data = docSnap.data() as TeacherAttendanceRecord;
      return { ...data, id: data.id || docSnap.id };
    });
    if (records.length === 1) return records[0];

    const approvalRank = (status?: string) => {
      switch (status) {
        case "approved":
          return 0;
        case "rejected":
          return 1;
        case "pending":
          return 2;
        default:
          return 3;
      }
    };

    records.sort((a, b) => {
      const rankDiff =
        approvalRank(a.approvalStatus) - approvalRank(b.approvalStatus);
      if (rankDiff !== 0) return rankDiff;
      const aTime =
        (a as any).approvedAt ||
        (a as any).rejectedAt ||
        (a as any).createdAt ||
        0;
      const bTime =
        (b as any).approvedAt ||
        (b as any).rejectedAt ||
        (b as any).createdAt ||
        0;
      return bTime - aTime;
    });

    return records[0];
  }

  async getTeacherAttendanceByDateRange(
    schoolId?: string,
    teacherId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<TeacherAttendanceRecord[]> {
    await this.requireFeature(schoolId, "teacher_attendance");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "getTeacherAttendanceByDateRange",
    );
    if (!teacherId || !startDate || !endDate) return [];

    try {
      const rangedQuery = query(
        collection(firestore, "teacher_attendance"),
        where("schoolId", "==", scopedSchoolId),
        where("teacherId", "==", teacherId),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
      );
      const rangedSnap = await getDocs(rangedQuery);
      return rangedSnap.docs.map((docSnap) => {
        const data = docSnap.data() as TeacherAttendanceRecord;
        return { ...data, id: data.id || docSnap.id };
      });
    } catch (error) {
      // Fallback for environments missing composite indexes.
      const fallbackQuery = query(
        collection(firestore, "teacher_attendance"),
        where("schoolId", "==", scopedSchoolId),
        where("teacherId", "==", teacherId),
      );
      const fallbackSnap = await getDocs(fallbackQuery);
      return fallbackSnap.docs
        .map((docSnap) => {
          const data = docSnap.data() as TeacherAttendanceRecord;
          return { ...data, id: data.id || docSnap.id };
        })
        .filter((record) => record.date >= startDate && record.date <= endDate);
    }
  }

  async getTeacherAttendancePendingByDate(
    schoolId?: string,
    date?: string,
  ): Promise<TeacherAttendanceRecord[]> {
    await this.requireFeature(schoolId, "teacher_attendance");
    if (!date) return [];
    const records = await this.getAllTeacherAttendance(schoolId, date);
    return records.filter((record) => record.approvalStatus === "pending");
  }

  async getAllPendingTeacherAttendance(
    schoolId?: string,
  ): Promise<TeacherAttendanceRecord[]> {
    await this.requireFeature(schoolId, "teacher_attendance");
    const records = await this.getAllTeacherAttendanceRecords(schoolId);
    return records.filter((record) => record.approvalStatus === "pending");
  }

  async getAllTeacherAttendance(
    schoolId?: string,
    date?: string,
  ): Promise<TeacherAttendanceRecord[]> {
    await this.requireFeature(schoolId, "teacher_attendance");
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

  async getAllApprovedTeacherAttendance(
    schoolId?: string,
    date?: string,
  ): Promise<TeacherAttendanceRecord[]> {
    await this.requireFeature(schoolId, "teacher_attendance");
    if (!date) return [];
    const records = await this.getAllTeacherAttendance(schoolId, date);
    return records.filter((record) => record.approvalStatus === "approved");
  }

  async saveTeacherAttendance(record: TeacherAttendanceRecord): Promise<void> {
    await this.requireFeature(record.schoolId, "teacher_attendance");
    const scopedSchoolId = this.requireSchoolId(
      record.schoolId,
      "saveTeacherAttendance",
    );
    const id = `${scopedSchoolId}_${record.teacherId}_${record.date}`;
    await setDoc(doc(firestore, "teacher_attendance", id), {
      approvalStatus: record.approvalStatus || "approved",
      ...record,
      id,
    });
  }

  async approveTeacherAttendance(
    schoolId: string,
    recordId: string,
    adminId: string,
    options?: { teacherId?: string; date?: string },
  ): Promise<void> {
    await this.requireFeature(schoolId, "teacher_attendance");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "approveTeacherAttendance",
    );
    const updatePayload = {
      schoolId: scopedSchoolId,
      approvalStatus: "approved" as const,
      approvedBy: adminId,
      approvedAt: Date.now(),
      rejectedBy: null,
      rejectedAt: null,
    };

    if (options?.teacherId && options?.date) {
      const q = query(
        collection(firestore, "teacher_attendance"),
        where("schoolId", "==", scopedSchoolId),
        where("teacherId", "==", options.teacherId),
        where("date", "==", options.date),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        await Promise.all(
          snap.docs.map((docSnap) => updateDoc(docSnap.ref, updatePayload)),
        );
        return;
      }
    }

    await updateDoc(
      doc(firestore, "teacher_attendance", recordId),
      updatePayload,
    );
  }

  async approveTeacherAttendanceBulk(
    schoolId: string,
    records: Array<{ recordId?: string; teacherId?: string; date?: string }>,
    adminId: string,
  ): Promise<void> {
    await this.requireFeature(schoolId, "teacher_attendance");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "approveTeacherAttendanceBulk",
    );
    if (!records.length) return;

    const updatePayload = {
      schoolId: scopedSchoolId,
      approvalStatus: "approved" as const,
      approvedBy: adminId,
      approvedAt: Date.now(),
      rejectedBy: null,
      rejectedAt: null,
    };

    const batch = writeBatch(firestore);
    let hasUpdates = false;
    const processedKeys = new Set<string>();

    for (const record of records) {
      const dedupeKey =
        record.teacherId && record.date
          ? `${record.teacherId}_${record.date}`
          : record.recordId || "";
      if (!dedupeKey || processedKeys.has(dedupeKey)) continue;
      processedKeys.add(dedupeKey);

      if (record.teacherId && record.date) {
        const q = query(
          collection(firestore, "teacher_attendance"),
          where("schoolId", "==", scopedSchoolId),
          where("teacherId", "==", record.teacherId),
          where("date", "==", record.date),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          snap.docs.forEach((docSnap) => {
            batch.update(docSnap.ref, updatePayload);
            hasUpdates = true;
          });
          continue;
        }
      }

      if (record.recordId) {
        batch.update(
          doc(firestore, "teacher_attendance", record.recordId),
          updatePayload,
        );
        hasUpdates = true;
      }
    }

    if (!hasUpdates) return;
    await batch.commit();
  }

  async rejectTeacherAttendance(
    schoolId: string,
    recordId: string,
    adminId: string,
    options?: { teacherId?: string; date?: string },
  ): Promise<void> {
    await this.requireFeature(schoolId, "teacher_attendance");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "rejectTeacherAttendance",
    );
    const updatePayload = {
      schoolId: scopedSchoolId,
      approvalStatus: "rejected" as const,
      status: "absent" as const,
      rejectedBy: adminId,
      rejectedAt: Date.now(),
    };

    if (options?.teacherId && options?.date) {
      const q = query(
        collection(firestore, "teacher_attendance"),
        where("schoolId", "==", scopedSchoolId),
        where("teacherId", "==", options.teacherId),
        where("date", "==", options.date),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        await Promise.all(
          snap.docs.map((docSnap) => updateDoc(docSnap.ref, updatePayload)),
        );
        return;
      }
    }

    await updateDoc(
      doc(firestore, "teacher_attendance", recordId),
      updatePayload,
    );
  }

  async getAllTeacherAttendanceRecords(
    schoolId?: string,
  ): Promise<TeacherAttendanceRecord[]> {
    await this.requireFeature(schoolId, "teacher_attendance");
    return this.getCollectionBySchoolId<TeacherAttendanceRecord>(
      "teacher_attendance",
      schoolId,
    );
  }

  async resetAllTeacherAttendance(schoolId?: string): Promise<void> {
    await this.requireFeature(schoolId, "teacher_attendance");
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
    await this.requireFeature(schoolId, "basic_exam_reports");
    const scopedSchoolId = this.requireSchoolId(schoolId, "getAdminRemark");
    if (!remarkId) return undefined;
    const docRef = doc(firestore, "admin_remarks", remarkId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return undefined;
    const data = snap.data() as AdminRemark;
    return data.schoolId === scopedSchoolId ? data : undefined;
  }

  async saveAdminRemark(remark: AdminRemark): Promise<void> {
    await this.requireFeature(remark.schoolId, "basic_exam_reports");
    this.requireSchoolId(remark.schoolId, "saveAdminRemark");
    await setDoc(doc(firestore, "admin_remarks", remark.id), remark);
  }

  /**
   * Create a full-school snapshot for the current term context.
   */
  async createTermBackup(
    currentConfig: SchoolConfig,
    currentTerm: string,
    academicYear: string,
    options?: {
      dedupeKey?: string;
      backupType?: "term-reset" | "manual" | "safety-restore";
      allowExisting?: boolean;
    },
  ): Promise<void> {
    await this.requireFeature(currentConfig.schoolId, "backups");
    console.log(`Creating backup for ${currentTerm}, ${academicYear}...`);

    try {
      const schoolId = this.requireSchoolId(
        currentConfig.schoolId,
        "createTermBackup",
      );
      const backupType = options?.backupType || "term-reset";
      const dedupeKey =
        options?.dedupeKey ||
        `${backupType}_${schoolId}_${currentTerm}_${academicYear}`;
      if (backupType === "term-reset" && !options?.allowExisting) {
        try {
          const existingSnap = await getDocs(
            query(
              collection(firestore, "backups"),
              where("schoolId", "==", schoolId),
              where("term", "==", currentTerm),
              where("academicYear", "==", academicYear),
              where("backupType", "==", "term-reset"),
              limit(1),
            ),
          );
          if (!existingSnap.empty) {
            console.log(
              `Backup already exists for ${currentTerm}, ${academicYear}. Skipping.`,
            );
            return;
          }
        } catch (existingBackupError) {
          console.warn(
            "Skipping backup dedupe preflight and continuing with create",
            existingBackupError,
          );
        }
      }

      let fees: FeeDefinition[] = [];
      let studentLedgers: StudentFeeLedger[] = [];
      let financeSettings: FinanceSettings | null = null;
      let financePayments: StudentFeePayment[] = [];
      let billingPayments: Array<Record<string, unknown>> = [];
      let activityLogs: any[] = [];
      let schoolProfile: Partial<School> | null = null;

      try {
        const financeSnapshot = await this.getSchoolFinanceSnapshot(schoolId);
        fees = financeSnapshot.fees;
        studentLedgers = financeSnapshot.studentLedgers;
        financePayments = financeSnapshot.financePayments;
        billingPayments = financeSnapshot.billingPayments;
        financeSettings = financeSnapshot.financeSettings;
      } catch (financeError) {
        console.warn("Skipping finance backup payload", financeError);
      }

      try {
        const [legacyActivityLogs, schoolActivityLogs] = await Promise.all([
          this.getCollectionBySchoolId<any>("activity_logs", schoolId).catch(
            () => [],
          ),
          this.getSchoolActivityLogs(schoolId).catch(() => []),
        ]);
        const mergedActivityLogs = [
          ...legacyActivityLogs,
          ...schoolActivityLogs,
        ];
        const dedupedActivityLogs = new Map<string, any>();
        mergedActivityLogs.forEach((entry, index) => {
          const key =
            entry?.id ||
            `${entry?.actionType || entry?.eventType || "activity"}_${entry?.entityId || "entry"}_${entry?.timestamp || index}`;
          dedupedActivityLogs.set(
            key,
            entry?.id ? entry : { ...entry, id: key },
          );
        });
        activityLogs = Array.from(dedupedActivityLogs.values());
      } catch (activityLogError) {
        console.warn("Skipping activity log backup payload", activityLogError);
      }

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

      const settingsSnap = await getDoc(doc(firestore, "settings", schoolId));
      const schoolSettings = settingsSnap.exists()
        ? (settingsSnap.data() as SchoolConfig)
        : undefined;
      schoolProfile = await this.getSchoolProfileSnapshot(schoolId);

      const backup = this.stripUndefinedDeep<Backup>({
        id: this.generateBackupId("backup"),
        schoolId,
        schoolName:
          currentConfig.schoolName || schoolSettings?.schoolName || "",
        timestamp: Date.now(),
        term: currentTerm,
        academicYear: academicYear,
        backupType,
        dedupeKey,
        data: {
          schoolConfig: currentConfig,
          schoolSettings,
          schoolProfile,
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
          payments: financePayments,
          billingPayments,
          fees,
          studentLedgers,
          financeSettings,
        },
      });

      await setDoc(doc(firestore, "backups", backup.id), backup);
      console.log(`Backup created successfully: ${backup.id}`);

      await logActivity({
        schoolId,
        actorUid: auth.currentUser?.uid || null,
        actorRole: (await this.getCurrentActorRole()) || UserRole.SCHOOL_ADMIN,
        eventType: "backup_created",
        entityId: backup.id,
        meta: {
          term: currentTerm,
          academicYear,
          backupType,
        },
      });
    } catch (error) {
      console.error("Error creating backup:", error);
      throw error;
    }
  }

  async createSystemBackup(currentConfig: SchoolConfig): Promise<void> {
    const schoolId = this.requireSchoolId(
      currentConfig.schoolId,
      "createSystemBackup",
    );
    await this.createTermBackup(
      currentConfig,
      currentConfig.currentTerm,
      currentConfig.academicYear,
      {
        backupType: "manual",
        allowExisting: true,
        dedupeKey: `manual_${schoolId}_${Date.now()}`,
      },
    );
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
      {
        dedupeKey: `${currentConfig.schoolId}_${currentConfig.currentTerm}_${currentConfig.academicYear}`,
      },
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

    // Preserve assessments/remarks/skills/admin remarks for promotion.
    console.log(
      "Preserved assessments and report data for promotion. Skipping assessment reset.",
    );

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
        (r) => r.teacherId === teacher.id && r.approvalStatus !== "pending",
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
        if (
          record.status === "present" &&
          record.approvalStatus === "approved"
        ) {
          monthlyData[monthKey].present += 1;
        }
      });

      const monthlyBreakdown: MonthlyTeacherAttendance[] = Object.entries(
        monthlyData,
      )
        .map(([month, data]) => {
          const [year, monthNum] = month.split("-");
          const attendanceRate =
            data.total > 0
              ? Math.min(Math.round((data.present / data.total) * 100), 100)
              : 0;

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
        totalDays > 0
          ? Math.min(Math.round((totalPresent / totalDays) * 100), 100)
          : 0;

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
  private async listBackupRecordsForSchool(
    schoolId: string,
  ): Promise<Partial<Backup>[]> {
    const snap = await getDocs(
      query(
        collection(firestore, "backups"),
        where("schoolId", "==", schoolId),
      ),
    );
    return snap.docs
      .map((docSnap) => docSnap.data() as Partial<Backup>)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  private filterBackupRows(
    rows: Partial<Backup>[],
    filters: {
      term?: string;
      academicYear?: string;
      date?: string;
      backupTypes?: BackupType[];
    } = {},
  ): Partial<Backup>[] {
    return rows.filter((row) => {
      if (filters.term && row.term !== filters.term) return false;
      if (filters.academicYear && row.academicYear !== filters.academicYear) {
        return false;
      }
      if (
        filters.backupTypes?.length &&
        !filters.backupTypes.includes(
          (row.backupType || "manual") as BackupType,
        )
      ) {
        return false;
      }
      if (filters.date) {
        const start = new Date(filters.date).getTime();
        const end = start + 24 * 60 * 60 * 1000 - 1;
        if ((row.timestamp || 0) < start || (row.timestamp || 0) > end) {
          return false;
        }
      }
      return true;
    });
  }

  async getBackups(filters?: {
    schoolId?: string;
    term?: string;
    academicYear?: string;
    date?: string;
  }): Promise<Partial<Backup>[]> {
    await this.requireFeature(filters?.schoolId, "backups");
    const scopedSchoolId = this.requireSchoolId(
      filters?.schoolId,
      "getBackups",
    );
    const rows = await this.listBackupRecordsForSchool(scopedSchoolId);
    return this.filterBackupRows(rows, {
      term: filters?.term,
      academicYear: filters?.academicYear,
      date: filters?.date,
      backupTypes: ["term-reset", "manual", "safety-restore"],
    });
  }

  async getRecoveryRecords(filters?: {
    schoolId?: string;
    date?: string;
    backupType?: "recovery-point" | "recycle-bin";
  }): Promise<Partial<Backup>[]> {
    await this.requireFeature(filters?.schoolId, "backups");
    const scopedSchoolId = this.requireSchoolId(
      filters?.schoolId,
      "getRecoveryRecords",
    );
    const rows = await this.listBackupRecordsForSchool(scopedSchoolId);
    return this.filterBackupRows(rows, {
      date: filters?.date,
      backupTypes: filters?.backupType
        ? [filters.backupType]
        : ["recovery-point", "recycle-bin"],
    });
  }

  async getBackupDetails(
    schoolId?: string,
    id?: string,
  ): Promise<Backup | undefined> {
    await this.requireFeature(schoolId, "backups");
    const scopedSchoolId = this.requireSchoolId(schoolId, "getBackupDetails");
    if (!id) return undefined;
    const snap = await getDoc(doc(firestore, "backups", id));
    if (!snap.exists()) return undefined;
    const data = snap.data() as Backup;
    return data.schoolId === scopedSchoolId ? data : undefined;
  }

  async restoreBackup(schoolId?: string, id?: string): Promise<void> {
    await this.requireFeature(schoolId, "backups");
    const scopedSchoolId = this.requireSchoolId(schoolId, "restoreBackup");
    if (!id) {
      throw new Error("BACKUP_ID_REQUIRED");
    }

    const backup = await this.getBackupDetails(scopedSchoolId, id);
    if (!backup?.data) {
      throw new Error("BACKUP_NOT_FOUND");
    }

    const currentConfig = await this.getSchoolConfig(scopedSchoolId);
    await this.createTermBackup(
      currentConfig,
      currentConfig.currentTerm,
      currentConfig.academicYear,
      {
        backupType: "safety-restore",
        allowExisting: true,
        dedupeKey: `manual_restore_${scopedSchoolId}_${Date.now()}`,
      },
    );

    const restoredSettings = {
      ...(backup.data.schoolSettings ||
        backup.data.schoolConfig ||
        currentConfig),
      schoolId: scopedSchoolId,
    } as SchoolConfig;

    await setDoc(doc(firestore, "settings", scopedSchoolId), restoredSettings, {
      merge: false,
    });
    await this.restoreSchoolProfileSnapshot(
      scopedSchoolId,
      backup.data.schoolProfile,
      restoredSettings,
    );

    await this.replaceSchoolScopedCollection(
      "students",
      scopedSchoolId,
      backup.data.students || [],
      (row) => row.id,
    );
    await this.replaceSchoolScopedCollection(
      "attendance",
      scopedSchoolId,
      backup.data.attendanceRecords || [],
      (row) => row.id,
    );
    await this.replaceSchoolScopedCollection(
      "teacher_attendance",
      scopedSchoolId,
      backup.data.teacherAttendanceRecords || [],
      (row) => row.id,
    );
    await this.replaceSchoolScopedCollection(
      "assessments",
      scopedSchoolId,
      backup.data.assessments || [],
      (row) => row.id,
    );
    await this.replaceSchoolScopedCollection(
      "student_remarks",
      scopedSchoolId,
      backup.data.studentRemarks || [],
      (row) => row.id,
    );
    await this.replaceSchoolScopedCollection(
      "student_skills",
      scopedSchoolId,
      backup.data.studentSkills || [],
      (row) => row.id,
    );
    await this.replaceSchoolScopedCollection(
      "admin_remarks",
      scopedSchoolId,
      backup.data.adminRemarks || [],
      (row) => row.id,
    );
    await this.replaceSchoolScopedCollection(
      "notices",
      scopedSchoolId,
      backup.data.notices || [],
      (row) => row.id,
    );
    await this.replaceSchoolScopedCollection(
      "admin_notifications",
      scopedSchoolId,
      backup.data.adminNotifications || [],
      (row) => row.id,
    );
    await this.replaceSchoolScopedCollection(
      "timetables",
      scopedSchoolId,
      backup.data.timetables || [],
      (row) => `${scopedSchoolId}_${row.classId}`,
    );
    await this.replaceSchoolScopedCollection(
      "class_subjects",
      scopedSchoolId,
      backup.data.classSubjects || [],
      (row) => `${scopedSchoolId}_${row.classId}`,
    );

    const useFinanceV2 = await this.useFinanceV2(scopedSchoolId);
    const financePayments = (backup.data.payments || []).filter(
      (payment: any) => payment?.studentId,
    );
    if (Array.isArray(backup.data.payments)) {
      if (useFinanceV2) {
        await this.replaceCollectionAtPath(
          ["schools", scopedSchoolId, "payments"],
          financePayments.map((payment: any) => ({
            ...payment,
            schoolId: scopedSchoolId,
          })),
          (row: any) => row.id || row.reference,
        );
      } else {
        const paymentSnap = await getDocs(
          query(
            collection(firestore, "payments"),
            where("schoolId", "==", scopedSchoolId),
          ),
        );
        const operations: Array<
          (batch: ReturnType<typeof writeBatch>) => void
        > = [];

        paymentSnap.docs.forEach((docSnap) => {
          if (docSnap.data()?.studentId) {
            operations.push((batch) => batch.delete(docSnap.ref));
          }
        });

        financePayments.forEach((payment: any) => {
          const normalizedPayment = {
            ...payment,
            schoolId: scopedSchoolId,
          };
          operations.push((batch) =>
            batch.set(
              doc(
                firestore,
                "payments",
                normalizedPayment.id || normalizedPayment.reference,
              ),
              normalizedPayment,
            ),
          );
        });

        await this.commitChunkedOperations(operations);
      }
    }

    if (Array.isArray(backup.data.billingPayments)) {
      const billingPaymentSnap = await getDocs(
        query(
          collection(firestore, "payments"),
          where("schoolId", "==", scopedSchoolId),
        ),
      );
      const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> =
        [];

      billingPaymentSnap.docs.forEach((docSnap) => {
        if (!docSnap.data()?.studentId) {
          operations.push((batch) => batch.delete(docSnap.ref));
        }
      });

      backup.data.billingPayments
        .filter((payment: any) => payment && !payment?.studentId)
        .forEach((payment: any, index: number) => {
          const paymentId =
            payment.id ||
            payment.reference ||
            payment.transactionId ||
            `billing_${backup.id}_${index}`;
          operations.push((batch) =>
            batch.set(doc(firestore, "payments", paymentId), {
              ...payment,
              id: paymentId,
              schoolId: scopedSchoolId,
            }),
          );
        });

      await this.commitChunkedOperations(operations);
    }

    if (backup.data.financeSettings) {
      await setDoc(
        doc(firestore, "schools", scopedSchoolId, "financeSettings", "main"),
        {
          ...backup.data.financeSettings,
          schoolId: scopedSchoolId,
        },
        { merge: true },
      );
    }

    if (backup.data.fees) {
      const feePath = useFinanceV2
        ? ["schools", scopedSchoolId, "fees"]
        : ["fees"];
      await this.replaceCollectionAtPath(
        feePath,
        backup.data.fees.map((fee) => ({
          ...fee,
          schoolId: scopedSchoolId,
        })),
        (row) => row.id,
      );
    }

    if (backup.data.studentLedgers) {
      const ledgerPath = useFinanceV2
        ? ["schools", scopedSchoolId, "feeLedgers"]
        : ["student_ledgers"];
      await this.replaceCollectionAtPath(
        ledgerPath,
        backup.data.studentLedgers.map((ledger) => ({
          ...ledger,
          schoolId: scopedSchoolId,
        })),
        (row) => row.id,
      );
    }

    if (Array.isArray(backup.data.activityLogs)) {
      await this.replaceSchoolActivityLogs(
        scopedSchoolId,
        backup.data.activityLogs,
      );
    }

    await logActivity({
      schoolId: scopedSchoolId,
      actorUid: auth.currentUser?.uid || null,
      actorRole: (await this.getCurrentActorRole()) || UserRole.SCHOOL_ADMIN,
      eventType: "backup_restored",
      entityId: id,
      meta: {
        term: backup.term,
        academicYear: backup.academicYear,
        backupType: backup.backupType || "manual",
        module: "Backups",
      },
    });
  }

  async restoreRecoveryRecord(schoolId?: string, id?: string): Promise<void> {
    await this.requireFeature(schoolId, "backups");
    const scopedSchoolId = this.requireSchoolId(
      schoolId,
      "restoreRecoveryRecord",
    );
    if (!id) {
      throw new Error("BACKUP_ID_REQUIRED");
    }

    const snapshot = await this.getBackupDetails(scopedSchoolId, id);
    if (!snapshot) {
      throw new Error("BACKUP_NOT_FOUND");
    }
    if (
      snapshot.backupType !== "recovery-point" &&
      snapshot.backupType !== "recycle-bin"
    ) {
      throw new Error("RECOVERY_RECORD_REQUIRED");
    }

    const scopes = snapshot.recoveryMeta?.collections || [];
    if (!scopes.length) {
      throw new Error("RECOVERY_SCOPE_MISSING");
    }

    const currentSnapshot = await this.buildCurrentSnapshotForScopes(
      scopedSchoolId,
      scopes,
    );

    if (Object.keys(currentSnapshot).length > 0) {
      await this.createRecoveryPoint({
        schoolId: scopedSchoolId,
        title: `Safety snapshot before restoring ${snapshot.recoveryMeta?.title || "recovery record"}`,
        description:
          "Automatically captured before replaying a recovery record.",
        sourceAction: "restore_recovery_record",
        sourceModule: "Recovery Center",
        entityType: snapshot.recoveryMeta?.entityType,
        entityId: snapshot.recoveryMeta?.entityId,
        entityLabel: snapshot.recoveryMeta?.entityLabel,
        recordCount:
          snapshot.recoveryMeta?.recordCount ||
          scopes.reduce(
            (count, scope) => count + (scope.recordIds?.length || 0),
            0,
          ),
        collections: scopes,
        data: currentSnapshot,
      });
    }

    await this.restoreSnapshotScopes(scopedSchoolId, snapshot);

    await logActivity({
      schoolId: scopedSchoolId,
      actorUid: auth.currentUser?.uid || null,
      actorRole: (await this.getCurrentActorRole()) || UserRole.SCHOOL_ADMIN,
      eventType:
        snapshot.backupType === "recycle-bin"
          ? "recycle_bin_restored"
          : "recovery_point_restored",
      entityId: id,
      meta: {
        status: "success",
        module: "Recovery Center",
        title: snapshot.recoveryMeta?.title || "",
        entityType: snapshot.recoveryMeta?.entityType || "",
        entityLabel: snapshot.recoveryMeta?.entityLabel || "",
      },
    });

    if (snapshot.backupType === "recycle-bin") {
      await deleteDoc(doc(firestore, "backups", id));
    } else {
      await updateDoc(doc(firestore, "backups", id), {
        recoveryMeta: {
          ...(snapshot.recoveryMeta || { title: "Recovery snapshot" }),
          restoredAt: Date.now(),
          restoredBy: auth.currentUser?.uid || null,
        },
      });
    }
  }

  async deleteBackup(schoolId?: string, id?: string): Promise<void> {
    await this.requireFeature(schoolId, "backups");
    const scopedSchoolId = this.requireSchoolId(schoolId, "deleteBackup");
    if (!id) return;
    const existing = await this.getBackupDetails(scopedSchoolId, id);
    if (!existing) return;
    await deleteDoc(doc(firestore, "backups", id));
  }

  async deleteAllBackups(schoolId?: string): Promise<void> {
    await this.requireFeature(schoolId, "backups");
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

  // --- Fees & Payments ---
  async getFees(filters: {
    schoolId?: string;
    academicYear?: string;
    term?: FeeTerm;
    classId?: string | null;
  }): Promise<FeeDefinition[]> {
    await this.requireFeature(filters.schoolId, "fees_payments");
    const scopedSchoolId = this.requireSchoolId(filters.schoolId, "getFees");
    const conditions: any[] = [where("schoolId", "==", scopedSchoolId)];
    if (filters.academicYear)
      conditions.push(where("academicYear", "==", filters.academicYear));
    if (filters.term) conditions.push(where("term", "==", filters.term));
    if (filters.classId)
      conditions.push(where("classId", "==", filters.classId));
    const useV2 = await this.useFinanceV2(scopedSchoolId);
    const feesCollection = useV2
      ? collection(firestore, "schools", scopedSchoolId, "fees")
      : collection(firestore, "fees");
    const q = query(feesCollection, ...conditions);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as FeeDefinition) }));
  }

  async saveFee(fee: FeeDefinition): Promise<void> {
    await this.requireFeature(fee.schoolId, "fees_payments");
    this.requireSchoolId(fee.schoolId, "saveFee");
    const useV2 = await this.useFinanceV2(fee.schoolId);
    const docRef = useV2
      ? doc(firestore, "schools", fee.schoolId, "fees", fee.id)
      : doc(firestore, "fees", fee.id);
    await setDoc(docRef, fee);
  }

  async deleteFee(feeId: string, schoolId?: string): Promise<void> {
    await this.requireFeature(schoolId, "fees_payments");
    await deleteDoc(doc(firestore, "fees", feeId));
    if (schoolId && (await this.useFinanceV2(schoolId))) {
      await deleteDoc(doc(firestore, "schools", schoolId, "fees", feeId));
    }
  }

  async getStudentLedgers(filters: {
    schoolId?: string;
    academicYear?: string;
    term?: FeeTerm;
    classId?: string;
  }): Promise<StudentFeeLedger[]> {
    await this.requireFeature(filters.schoolId, "fees_payments");
    const scopedSchoolId = this.requireSchoolId(
      filters.schoolId,
      "getStudentLedgers",
    );
    const conditions: any[] = [where("schoolId", "==", scopedSchoolId)];
    if (filters.academicYear)
      conditions.push(where("academicYear", "==", filters.academicYear));
    if (filters.term) conditions.push(where("term", "==", filters.term));
    if (filters.classId)
      conditions.push(where("classId", "==", filters.classId));
    const useV2 = await this.useFinanceV2(scopedSchoolId);
    const ledgerCollection = useV2
      ? collection(firestore, "schools", scopedSchoolId, "feeLedgers")
      : collection(firestore, "student_ledgers");
    const q = query(ledgerCollection, ...conditions);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as StudentFeeLedger),
    }));
  }

  async upsertStudentLedger(ledger: StudentFeeLedger): Promise<void> {
    await this.requireFeature(ledger.schoolId, "fees_payments");
    this.requireSchoolId(ledger.schoolId, "upsertStudentLedger");
    const useV2 = await this.useFinanceV2(ledger.schoolId);
    const docRef = useV2
      ? doc(firestore, "schools", ledger.schoolId, "feeLedgers", ledger.id)
      : doc(firestore, "student_ledgers", ledger.id);
    await setDoc(docRef, ledger, {
      merge: true,
    });
  }

  async getPayments(filters: {
    schoolId?: string;
    academicYear?: string;
    term?: FeeTerm;
    classId?: string;
    studentId?: string;
  }): Promise<StudentFeePayment[]> {
    await this.requireFeature(filters.schoolId, "fees_payments");
    const scopedSchoolId = this.requireSchoolId(
      filters.schoolId,
      "getPayments",
    );
    const conditions: any[] = [where("schoolId", "==", scopedSchoolId)];
    if (filters.academicYear)
      conditions.push(where("academicYear", "==", filters.academicYear));
    if (filters.term) conditions.push(where("term", "==", filters.term));
    if (filters.classId)
      conditions.push(where("classId", "==", filters.classId));
    if (filters.studentId)
      conditions.push(where("studentId", "==", filters.studentId));
    const useV2 = await this.useFinanceV2(scopedSchoolId);
    const paymentsCollection = useV2
      ? collection(firestore, "schools", scopedSchoolId, "payments")
      : collection(firestore, "payments");
    const q = query(paymentsCollection, ...conditions);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as StudentFeePayment),
    }));
  }

  async recordStudentPayment(payment: StudentFeePayment): Promise<void> {
    await this.requireFeature(payment.schoolId, "fees_payments");
    this.requireSchoolId(payment.schoolId, "recordStudentPayment");
    const useV2 = await this.useFinanceV2(payment.schoolId);
    const docRef = useV2
      ? doc(firestore, "schools", payment.schoolId, "payments", payment.id)
      : doc(firestore, "payments", payment.id);
    await setDoc(docRef, payment);
  }

  async updateStudentPayment(
    paymentId: string,
    updates: Partial<StudentFeePayment>,
    schoolId?: string,
  ): Promise<void> {
    await this.requireFeature(schoolId, "fees_payments");
    if (!paymentId) return;
    await updateDoc(doc(firestore, "payments", paymentId), updates);
    if (schoolId && (await this.useFinanceV2(schoolId))) {
      await updateDoc(
        doc(firestore, "schools", schoolId, "payments", paymentId),
        updates,
      );
    }
  }

  async computeLedgerTotals(
    ledger: StudentFeeLedger,
    payments: StudentFeePayment[],
  ): Promise<{
    totalDue: number;
    totalPaid: number;
    balance: number;
    status: "Unpaid" | "Part-paid" | "Paid";
  }> {
    const totalDue = ledger.fees.reduce((sum, fee) => sum + fee.amount, 0);
    const openingPaid = ledger.openingPaidAmount || 0;
    const totalPaid = payments
      .filter(
        (payment) =>
          payment.studentId === ledger.studentId &&
          payment.academicYear === ledger.academicYear &&
          payment.term === ledger.term,
      )
      .reduce((sum, payment) => sum + payment.amountPaid, 0);
    const totalPaidIncludingOpening = openingPaid + totalPaid;
    const balance = Math.max(0, totalDue - totalPaidIncludingOpening);
    const status =
      totalPaidIncludingOpening <= 0
        ? "Unpaid"
        : balance > 0
          ? "Part-paid"
          : "Paid";
    return { totalDue, totalPaid: totalPaidIncludingOpening, balance, status };
  }
}

export const db = new FirestoreService();
