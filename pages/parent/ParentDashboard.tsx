import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSchool } from "../../context/SchoolContext";
import { collection, query, where, getDocs, updateDoc, doc, setDoc } from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { Student } from "../../types";
import { CLASSES_LIST } from "../../constants";
import { LogOut, User as UserIcon, Calendar, FileText, CreditCard, MessageSquare, BookOpen, Clock, Activity } from "lucide-react";
import Layout from "../../components/Layout";
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
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLinkedStudents() {
      const phoneToMatch = user?.phoneNumber || user?.id;
      if (!phoneToMatch || !isAuthenticated) {
        setLoading(false);
        return;
      }
      
      try {
        console.log(`[ParentDashboard] Fetching students for phone: "${phoneToMatch}"`);
        const studentsRef = collection(firestore, "students");
        
        const queries = [
          getDocs(query(studentsRef, where("guardianPhone", "==", phoneToMatch)))
        ];
        
        if (phoneToMatch.startsWith("+")) {
          const phoneNoPlus = phoneToMatch.substring(1);
          queries.push(getDocs(query(studentsRef, where("guardianPhone", "==", phoneNoPlus))));
        }
        
        if (phoneToMatch.startsWith("+233")) {
          const localPhone = "0" + phoneToMatch.substring(4);
          queries.push(getDocs(query(studentsRef, where("guardianPhone", "==", localPhone))));
        }
        
        const snapshots = await Promise.all(queries);
        
        let fetchedStudents: Student[] = [];
        const seenIds = new Set();
        
        snapshots.forEach(snapshot => {
          snapshot.forEach((doc) => {
            if (!seenIds.has(doc.id)) {
              seenIds.add(doc.id);
              fetchedStudents.push({ id: doc.id, ...doc.data() } as Student);
            }
          });
        });
        
        if (fetchedStudents.length > 0 && !selectedStudentId) {
          const firstStudent = fetchedStudents[0];
          setSelectedStudentId(firstStudent.id);
          
          // 1. Sync local storage for immediate branding refresh
          const currentActiveId = localStorage.getItem("activeSchoolId");
          if (firstStudent.schoolId && currentActiveId !== firstStudent.schoolId) {
            localStorage.setItem("activeSchoolId", firstStudent.schoolId);
            refreshSchool();
          }
          
          // 2. Sync Firestore profile in background (using setDoc with merge for resilience)
          if (firstStudent.schoolId && user?.id && user.schoolId !== firstStudent.schoolId) {
            setDoc(doc(firestore, "users", user.id), {
              schoolId: firstStudent.schoolId,
              role: 'parent' // Ensure role is set
            }, { merge: true }).catch(err => {
              console.warn("Could not persist school ID to profile (likely permission related):", err.message);
            });
          }
        }
        
        // Only update if data actually changed to prevent re-render loops
        setStudents(prev => {
          if (JSON.stringify(prev) === JSON.stringify(fetchedStudents)) return prev;
          return fetchedStudents;
        });
      } catch (error) {
        console.error("Error fetching linked students:", error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchLinkedStudents();
  }, [user?.phoneNumber, user?.id, isAuthenticated]); // Removed refreshSchool to prevent potential context-driven loops

  // Handle student change manually to refresh branding
  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    const student = students.find(s => s.id === studentId);
    if (student && student.schoolId) {
      // 1. Update local storage for immediate UI refresh
      const currentActiveId = localStorage.getItem("activeSchoolId");
      if (currentActiveId !== student.schoolId) {
        localStorage.setItem("activeSchoolId", student.schoolId);
        refreshSchool();
      }
      
      // 2. Update Firestore profile
      if (user?.id && user.schoolId !== student.schoolId) {
        updateDoc(doc(firestore, "users", user.id), {
          schoolId: student.schoolId
        }).catch(err => {
          console.warn("Could not persist school ID on selection:", err.message);
        });
      }
    }
  };

  const selectedStudent = students.length > 0 
    ? (students.find(s => s.id === selectedStudentId) || students[0]) 
    : null;

  if (loading) {
    return (
      <Layout title="Parent Dashboard">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800"></div>
        </div>
      </Layout>
    );
  }

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
                  {(students[0] as any)?.guardianName?.trim()
                    ? (students[0] as any).guardianName
                    : user?.fullName && user.fullName !== "Parent / Guardian"
                      ? user.fullName
                      : "Parent / Guardian"}
                </h1>
                <p className="text-slate-400 text-xs mt-1">
                  {students.length === 1
                    ? `You have 1 child enrolled.`
                    : `You have ${students.length} children enrolled.`}
                </p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <UserIcon size={22} className="text-white" />
              </div>
            </div>

            {/* My Child Selector — horizontal scrollable chips on mobile */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                <UserIcon size={16} className="text-blue-500" /> My Child
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                {students.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => handleStudentSelect(student.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all shrink-0 text-left ${
                      selectedStudentId === student.id
                        ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-9 h-9 bg-white rounded-full border border-slate-200 flex items-center justify-center shadow-sm shrink-0">
                      <UserIcon className="text-slate-400" size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm whitespace-nowrap">{student.name}</p>
                      <p className="text-xs text-slate-500 whitespace-nowrap">{CLASSES_LIST.find(c => c.id === student.classId)?.name || student.classId}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Main Content + Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Main Content Area */}
              <div className="lg:col-span-3">
                {!activeView && selectedStudent && (
                  <DashboardOverview student={selectedStudent} />
                )}
                {activeView === "attendance" && selectedStudent && (
                  <AttendanceView student={selectedStudent} />
                )}
                {activeView === "fees" && selectedStudent && (
                  <FeesView student={selectedStudent} />
                )}
                {activeView === "report" && selectedStudent && (
                  <ReportCardView student={selectedStudent} />
                )}
                {activeView === "remarks" && selectedStudent && (
                  <RemarksView student={selectedStudent} />
                )}
              </div>

              {/* Upcoming Events Sidebar */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm lg:sticky lg:top-20">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                    <Clock size={16} className="text-orange-500" /> Upcoming Events
                  </h3>
                  <div className="text-center py-4 text-slate-500 text-sm">
                    No upcoming events scheduled at this time.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

