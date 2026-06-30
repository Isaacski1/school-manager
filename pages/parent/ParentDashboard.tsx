import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSchool } from "../../context/SchoolContext";
import { collection, query, where, getDocs, updateDoc, doc, setDoc } from "firebase/firestore";
import { firestore, auth } from "../../services/firebase";
import { db } from "../../services/mockDb";
import { getParentDashboardNotices, markParentDashboardNoticeRead } from "../../services/backendApi";
import { ParentNotice, Student } from "../../types";
import { CLASSES_LIST } from "../../constants";
import { User as UserIcon, MessageSquare, Clock, CheckCircle2, Loader2 } from "lucide-react";
import Layout from "../../components/Layout";
import UserAvatar from "../../components/UserAvatar";
import AttendanceView from "../../components/parent/AttendanceView";
import FeesView from "../../components/parent/FeesView";
import ReportCardView from "../../components/parent/ReportCardView";
import RemarksView from "../../components/parent/RemarksView";
import DashboardOverview from "../../components/parent/DashboardOverview";

type ViewType = "attendance" | "fees" | "report" | "remarks" | null;

export default function ParentDashboard() {
  const { user, isAuthenticated } = useAuth();
  const { school, refreshSchool } = useSchool();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeView = (searchParams.get("view") as ViewType) || null;

  const [students, setStudents] = useState<Student[]>([]);
  const [parentNotices, setParentNotices] = useState<ParentNotice[]>([]);
  const [loadingParentNotices, setLoadingParentNotices] = useState(false);
  const [markingNoticeId, setMarkingNoticeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(() => {
    return sessionStorage.getItem("parentDashboard_selectedStudentId") || null;
  });

  const getPhoneVariants = (phone: string) => {
    const trimmed = String(phone || "").trim();
    const digits = trimmed.replace(/\D/g, "");
    const variants = new Set<string>([trimmed, digits]);

    if (digits.startsWith("233") && digits.length === 12) {
      variants.add(`+${digits}`);
      variants.add(`0${digits.slice(3)}`);
      variants.add(digits.slice(3));
    } else if (digits.startsWith("0") && digits.length === 10) {
      variants.add(`233${digits.slice(1)}`);
      variants.add(`+233${digits.slice(1)}`);
      variants.add(digits.slice(1));
    } else if (digits.length === 9) {
      variants.add(`233${digits}`);
      variants.add(`+233${digits}`);
      variants.add(`0${digits}`);
    }

    return Array.from(variants).filter(Boolean);
  };

  const normalizeDigits = (value: string) => String(value || "").replace(/\D/g, "");

  const phoneMatches = (left?: string, right?: string) => {
    const leftDigits = normalizeDigits(left || "");
    const rightDigits = normalizeDigits(right || "");
    return Boolean(
      leftDigits &&
        rightDigits &&
        (leftDigits === rightDigits ||
          leftDigits.endsWith(rightDigits) ||
          rightDigits.endsWith(leftDigits)),
    );
  };

  const getLoggedInParentContact = (student?: Student | null) => {
    const claimedRole = (user as any)?.parentContactRole as
      | "father"
      | "mother"
      | "guardian"
      | undefined;
    const claimedName = String((user as any)?.parentContactName || "").trim();
    if (claimedRole && claimedName) {
      return {
        role: claimedRole,
        label:
          claimedRole === "father"
            ? "Father"
            : claimedRole === "mother"
              ? "Mother"
              : "Guardian",
        name: claimedName,
      };
    }

    const loginPhone = user?.phoneNumber || user?.id || "";
    if (student && phoneMatches(loginPhone, student.fatherPhone)) {
      return { role: "father", label: "Father", name: student.fatherName || "Father" };
    }
    if (student && phoneMatches(loginPhone, student.motherPhone)) {
      return { role: "mother", label: "Mother", name: student.motherName || "Mother" };
    }
    if (student && phoneMatches(loginPhone, student.guardianPhone)) {
      return { role: "guardian", label: "Guardian", name: student.guardianName || "Guardian" };
    }

    return {
      role: "guardian",
      label: "Parent / Guardian",
      name:
        user?.fullName && user.fullName !== "Parent / Guardian"
          ? user.fullName
          : "Parent / Guardian",
    };
  };

  useEffect(() => {
    async function fetchLinkedStudents() {
      if (!isAuthenticated || !user) {
        setLoading(false);
        return;
      }

      const phoneToMatch = user.phoneNumber || (user as any).id;
      if (!phoneToMatch) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log(`[ParentDashboard] Discovering students for phone: "${phoneToMatch}"`);
        
        const studentsRef = collection(firestore, "students");
        let fetchedStudents: Student[] = [];
        const seenIds = new Set<string>();

        // 1. DISCOVERY VIA PHONE NUMBER
        const phoneVariants = getPhoneVariants(phoneToMatch);
        const contactFields = ["fatherPhone", "motherPhone", "guardianPhone"];
        const queries = contactFields.flatMap((field) =>
          phoneVariants.map((variant) =>
            getDocs(query(studentsRef, where(field, "==", variant))),
          ),
        );

        const snapshots = await Promise.all(queries);
        snapshots.forEach(snapshot => {
          snapshot.forEach(docSnap => {
            if (!seenIds.has(docSnap.id)) {
              seenIds.add(docSnap.id);
              const data = docSnap.data() as Student;
              fetchedStudents.push({ ...data, id: docSnap.id });
            }
          });
        });

        // 2. DISCOVERY VIA TOKEN CLAIMS (Fallback)
        const idTokenResult = await auth.currentUser?.getIdTokenResult(true);
        const claimIds = (idTokenResult?.claims?.studentIds as string[]) || [];
        
        for (const id of claimIds) {
          if (!seenIds.has(id)) {
            const s = await db.getStudent(id);
            if (s) {
              seenIds.add(id);
              fetchedStudents.push(s);
            }
          }
        }

        // 3. PROCESS RESULTS
        if (fetchedStudents.length > 0) {
          setStudents(fetchedStudents);
          
          // Selection and Branding Sync
          let targetStudentId = selectedStudentId;
          const sessionSelectedId = sessionStorage.getItem("parentDashboard_selectedStudentId");
          if (!targetStudentId && sessionSelectedId) {
            targetStudentId = sessionSelectedId;
          }

          const initialStudent = fetchedStudents.find(s => s.id === targetStudentId) || fetchedStudents[0];
          if (!selectedStudentId || selectedStudentId !== initialStudent.id) {
            setSelectedStudentId(initialStudent.id);
            sessionStorage.setItem("parentDashboard_selectedStudentId", initialStudent.id);
          }

          if (initialStudent.schoolId) {
            // Update local storage for splash screen/branding
            const currentActiveId = localStorage.getItem("activeSchoolId");
            if (currentActiveId !== initialStudent.schoolId) {
              localStorage.setItem("activeSchoolId", initialStudent.schoolId);
              refreshSchool();
            }
            
            // Persist to user profile if needed
            if (user.schoolId !== initialStudent.schoolId) {
              setDoc(doc(firestore, "users", user.id), {
                schoolId: initialStudent.schoolId
              }, { merge: true }).catch(err => console.warn("Profile sync skipped:", err.message));
            }
          }
        } else {
          setStudents([]);
        }
      } catch (error) {
        console.error("[ParentDashboard] Fetch failed:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchLinkedStudents();
  }, [user?.phoneNumber, user?.id, isAuthenticated]); // Removed refreshSchool to prevent potential context-driven loops

  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    sessionStorage.setItem("parentDashboard_selectedStudentId", studentId);
    
    const student = students.find(s => s.id === studentId);
    if (student && student.schoolId) {
      const currentActiveId = localStorage.getItem("activeSchoolId");
      
      if (currentActiveId !== student.schoolId) {
        // 1. Update local storage for immediate UI refresh
        localStorage.setItem("activeSchoolId", student.schoolId);
        
        // 2. Refresh branding
        refreshSchool();
      }
      
      // 3. PERSIST: Sync the profile in background so the next login is also correct
      if (user?.id && user.schoolId !== student.schoolId) {
        updateDoc(doc(firestore, "users", user.id), {
          schoolId: student.schoolId
        }).catch(err => console.warn("Background profile sync skipped:", err.message));
      }
    }
  };

  const selectedStudent = students.find(s => s.id === selectedStudentId) || students[0];
  const loggedInParentContact = getLoggedInParentContact(selectedStudent);

  useEffect(() => {
    const fetchParentNotices = async () => {
      if (!selectedStudent?.schoolId || !selectedStudent?.id) {
        setParentNotices([]);
        return;
      }

      try {
        setLoadingParentNotices(true);
        const className =
          CLASSES_LIST.find((classItem) => classItem.id === selectedStudent.classId)
            ?.name || selectedStudent.classId;
        const response = await getParentDashboardNotices({
          schoolId: selectedStudent.schoolId,
          studentId: selectedStudent.id,
          classId: selectedStudent.classId || "",
          className: className || "",
        });
        setParentNotices((response.notices || []).slice(0, 8) as ParentNotice[]);
      } catch (error) {
        console.error("Failed to load parent dashboard notices:", error);
        setParentNotices([]);
      } finally {
        setLoadingParentNotices(false);
      }
    };

    fetchParentNotices();
  }, [selectedStudent?.id, selectedStudent?.schoolId, selectedStudent?.classId]);

  const handleMarkNoticeRead = async (notice: ParentNotice) => {
    if (!selectedStudent?.schoolId || !selectedStudent?.id) return;

    setMarkingNoticeId(notice.id);
    try {
      await markParentDashboardNoticeRead({
        noticeId: notice.id,
        schoolId: selectedStudent.schoolId,
        studentId: selectedStudent.id,
        parentName: loggedInParentContact.name,
      });
      setParentNotices((current) => current.filter((item) => item.id !== notice.id));
    } catch (error) {
      console.error("Failed to mark parent dashboard notice as read:", error);
    } finally {
      setMarkingNoticeId(null);
    }
  };

  if (loading) {
    return (
      <Layout title="Parent Dashboard">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800"></div>
        </div>
      </Layout>
    );
  }

  // Group students by school for better organization
  const currentSchoolStudents = students.filter(s => s.schoolId === school?.id);
  const otherSchoolStudents = students.filter(s => s.schoolId !== school?.id);

  return (
    <Layout title="Parent Dashboard">
      <div className="max-w-7xl mx-auto pb-10 px-3 sm:px-4">
        
        {students.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 text-center max-w-3xl mx-auto mt-10">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserIcon size={32} />
            </div>
            <h3 className="font-semibold text-slate-800 mb-2">No Students Linked</h3>
            <p className="text-slate-500 text-sm">
              We couldn't find any students linked to your account. Please contact the school administration to link your phone number to your ward.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl px-5 py-4 sm:px-6 sm:py-5 flex items-center justify-between shadow-md">
              <div>
                <p className="text-slate-400 text-xs sm:text-sm mb-0.5">Welcome back,</p>
                <h1 className="text-white text-lg sm:text-xl font-bold leading-tight">
                  {loggedInParentContact.name}
                </h1>
                <p className="text-slate-400 text-xs mt-1">
                  {loggedInParentContact.label} dashboard ·{" "}
                  {students.length === 1
                    ? `You have 1 child enrolled.`
                    : `You have ${students.length} children enrolled.`}
                </p>
              </div>
              <div className="shrink-0">
                <UserAvatar user={user} size="lg" className="ring-4 ring-white/10" />
              </div>
            </div>

            {/* My Children Section */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-slate-400" />
              <h2 className="font-semibold text-slate-800">My Children</h2>
            </div>
            <span className="parent-children-count rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
              {students.length} {students.length === 1 ? 'Child' : 'Children'}
            </span>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* CURRENT SCHOOL STUDENTS */}
              {currentSchoolStudents.map((student) => (
                <button
                  key={student.id}
                  onClick={() => handleStudentSelect(student.id)}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    selectedStudentId === student.id
                      ? "border-slate-800 bg-slate-50 ring-4 ring-slate-800/5"
                      : "border-slate-100 hover:border-slate-200"
                  }`}
                >
                  <UserAvatar 
                    user={student} 
                    size="md" 
                    className={selectedStudentId === student.id ? "ring-2 ring-slate-800" : ""} 
                  />
                  <div>
                    <div className="font-semibold text-slate-900">{student.name}</div>
                    <div className="text-sm text-slate-500">{CLASSES_LIST.find(c => c.id === student.classId)?.name || student.classId}</div>
                  </div>
                </button>
              ))}

              {/* OTHER SCHOOL STUDENTS */}
              {otherSchoolStudents.map((student) => (
                <button
                  key={student.id}
                  onClick={() => handleStudentSelect(student.id)}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 border-dashed transition-all text-left ${
                    selectedStudentId === student.id
                      ? "border-blue-600 bg-blue-50 ring-4 ring-blue-600/5"
                      : "border-slate-200 hover:border-blue-200 bg-slate-50/50"
                  }`}
                >
                  <UserAvatar 
                    user={student} 
                    size="md" 
                    className={selectedStudentId === student.id ? "ring-2 ring-blue-600" : "opacity-70"} 
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{student.name}</div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-blue-600 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Switch School
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

            {/* Main Content + Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Main Content Area */}
              <div className="lg:col-span-3">
                {!activeView && selectedStudent && (
                  <DashboardOverview key={selectedStudent.id} student={selectedStudent} />
                )}
                {activeView === "attendance" && selectedStudent && (
                  <AttendanceView key={selectedStudent.id} student={selectedStudent} />
                )}
                {activeView === "fees" && selectedStudent && (
                  <FeesView key={selectedStudent.id} student={selectedStudent} />
                )}
                {activeView === "report" && selectedStudent && (
                  <ReportCardView key={selectedStudent.id} student={selectedStudent} />
                )}
                {activeView === "remarks" && selectedStudent && (
                  <RemarksView key={selectedStudent.id} student={selectedStudent} />
                )}
              </div>

              {/* Parent Notices Sidebar */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm lg:sticky lg:top-20">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                    <MessageSquare size={16} className="text-emerald-500" /> Reminder Notices
                  </h3>
                  {loadingParentNotices ? (
                    <div className="flex items-center justify-center py-8 text-slate-400">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
                    </div>
                  ) : parentNotices.length === 0 ? (
                    <div className="text-center py-4 text-slate-500 text-sm">
                      No reminder notices at this time.
                    </div>
                  ) : (
                    <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                      {parentNotices.map((notice) => (
                        <div
                          key={notice.id}
                          className={`rounded-xl border p-3 ${
                            notice.type === "urgent"
                              ? "border-rose-100 bg-rose-50"
                              : "border-emerald-100 bg-emerald-50"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                notice.type === "urgent"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {notice.type === "urgent" ? "Urgent" : "Notice"}
                            </span>
                            <span className="text-[10px] font-medium text-slate-400">
                              {notice.date}
                            </span>
                          </div>
                          <p className="whitespace-pre-line text-sm leading-5 text-slate-700">
                            {notice.message}
                          </p>
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleMarkNoticeRead(notice)}
                              disabled={markingNoticeId === notice.id}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
                                notice.type === "urgent"
                                  ? "border-rose-200 bg-white text-rose-600 hover:bg-rose-100"
                                  : "border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-100"
                              } disabled:cursor-not-allowed disabled:opacity-60`}
                              title="Mark as read"
                              aria-label="Mark notice as read"
                            >
                              {markingNoticeId === notice.id ? (
                                <Loader2 size={15} className="animate-spin" />
                              ) : (
                                <CheckCircle2 size={16} />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
