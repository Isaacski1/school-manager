import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSchool } from "../../context/SchoolContext";
import { collection, query, where, getDocs } from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { Student } from "../../types";
import { LogOut, User as UserIcon, Calendar, FileText, CreditCard, MessageSquare, BookOpen, Clock, Activity } from "lucide-react";
import Layout from "../../components/Layout";
import AttendanceView from "../../components/parent/AttendanceView";
import FeesView from "../../components/parent/FeesView";
import ReportCardView from "../../components/parent/ReportCardView";
import RemarksView from "../../components/parent/RemarksView";
import DashboardOverview from "../../components/parent/DashboardOverview";

type ViewType = "attendance" | "fees" | "report" | "remarks" | null;

export default function ParentDashboard() {
  const { user } = useAuth();
  const { school } = useSchool();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const activeView = (searchParams.get("view") as ViewType) || null;

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLinkedStudents() {
      const phoneToMatch = user?.phoneNumber || user?.id;
      if (!phoneToMatch) {
        setLoading(false);
        return;
      }
      
      try {
        console.log(`[ParentDashboard] Fetching students for phone: "${phoneToMatch}"`);
        const studentsRef = collection(firestore, "students");
        
        // Try with original phone number (with +)
        const q = query(studentsRef, where("guardianPhone", "==", phoneToMatch));
        const snapshot = await getDocs(q);
        console.log(`[ParentDashboard] Found ${snapshot.size} matches for "${phoneToMatch}"`);
        
        let fetchedStudents: Student[] = [];
        snapshot.forEach((doc) => {
          fetchedStudents.push({ id: doc.id, ...doc.data() } as Student);
        });

        // If no matches, try without the '+' prefix as a fallback
        if (fetchedStudents.length === 0 && phoneToMatch.startsWith("+")) {
          const phoneNoPlus = phoneToMatch.substring(1);
          console.log(`[ParentDashboard] No matches found. Trying fallback without '+': "${phoneNoPlus}"`);
          const q2 = query(studentsRef, where("guardianPhone", "==", phoneNoPlus));
          const snapshot2 = await getDocs(q2);
          console.log(`[ParentDashboard] Found ${snapshot2.size} matches for "${phoneNoPlus}"`);
          snapshot2.forEach((doc) => {
            fetchedStudents.push({ id: doc.id, ...doc.data() } as Student);
          });
        }
        
        // If still no matches, try local format (stripping 233 and adding 0)
        if (fetchedStudents.length === 0 && phoneToMatch.startsWith("+233")) {
          const localPhone = "0" + phoneToMatch.substring(4);
          console.log(`[ParentDashboard] No matches found. Trying fallback with local '0': "${localPhone}"`);
          const q3 = query(studentsRef, where("guardianPhone", "==", localPhone));
          const snapshot3 = await getDocs(q3);
          console.log(`[ParentDashboard] Found ${snapshot3.size} matches for "${localPhone}"`);
          snapshot3.forEach((doc) => {
            fetchedStudents.push({ id: doc.id, ...doc.data() } as Student);
          });
        }
        
        setStudents(fetchedStudents);
        if (fetchedStudents.length > 0 && !selectedStudentId) {
          setSelectedStudentId(fetchedStudents[0].id);
        }
      } catch (error) {
        console.error("Error fetching linked students:", error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchLinkedStudents();
  }, [user, selectedStudentId]);

  const selectedStudent = students.find(s => s.id === selectedStudentId) || students[0];

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
      <div className="max-w-7xl mx-auto pb-10">
        
        {students.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-3xl mx-auto mt-10">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserIcon size={32} />
            </div>
            <h3 className="font-semibold text-slate-800 mb-2">No Students Linked</h3>
            <p className="text-slate-500 text-sm">
              We couldn't find any students linked to your account. Please contact the school administration to link your phone number to your ward.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Main Content Area (Left side - 3 columns) */}
            <div className="lg:col-span-3 flex flex-col h-[calc(100vh-120px)]">
              {!activeView && selectedStudent && (
                <DashboardOverview student={selectedStudent} />
              )}

              {/* Inline Views */}
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

            {/* Right Panel - My Kids (1 column) */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm sticky top-20">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <UserIcon size={18} className="text-blue-500" /> My Kids
                </h3>
                
                <div className="space-y-3">
                  {students.map((student) => (
                    <div 
                      key={student.id}
                      onClick={() => setSelectedStudentId(student.id)}
                      className={`p-3 rounded-xl cursor-pointer transition-all border ${
                        selectedStudentId === student.id 
                          ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400' 
                          : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white rounded-full border border-slate-200 flex items-center justify-center shadow-sm shrink-0">
                          <UserIcon className="text-slate-400" size={20} />
                        </div>
                        <div className="overflow-hidden">
                          <h4 className="font-bold text-slate-800 truncate text-sm">{student.name}</h4>
                          <p className="text-xs text-slate-500 truncate">Class {student.classId}</p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">ID: {student.id.substring(0, 8)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Clock size={18} className="text-orange-500" /> Upcoming Events
                  </h3>
                  <div className="space-y-3">
                    <div className="text-center py-4 text-slate-500 text-sm">
                      No upcoming events scheduled at this time.
                    </div>
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
