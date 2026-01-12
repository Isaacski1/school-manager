import schoolLogo from '../../logo/school_logo.jpg';
import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { db } from '../../services/mockDb';
import { Student, ClassRoom, Assessment, StudentRemark, SchoolConfig, AdminRemark } from '../../types';
import { CLASSES_LIST, ACADEMIC_YEAR, CURRENT_TERM } from '../../constants';
import ReportCardLayout from '../../components/ReportCardLayout';
import { Save, Edit2, X, MessageSquare } from 'lucide-react';
import { showToast } from '../../services/toast';

// Helper function to robustly parse term number
const parseTermNumber = (termString: string): 1 | 2 | 3 => {
    // Try to parse directly if it's just a number string
    let term = parseInt(termString);
    if (!isNaN(term) && term >= 1 && term <= 3) {
        return term as 1 | 2 | 3;
    }

    // Try to parse from "Term X" format
    const parts = termString.split(' ');
    if (parts.length > 1) {
        term = parseInt(parts[1]);
        if (!isNaN(term) && term >= 1 && term <= 3) {
            return term as 1 | 2 | 3;
        }
    }
    
    // Default to 1 if parsing fails or is out of range
    return 1;
};

const ReportCard = () => {
    const [selectedClass, setSelectedClass] = useState(CLASSES_LIST[0].id);
    const [students, setStudents] = useState<Student[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<string>('');
    const [reportCardData, setReportCardData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
    
    // Admin remarks state
    const [adminRemark, setAdminRemark] = useState('');
    const [editingAdminRemark, setEditingAdminRemark] = useState(false);
    const [savingRemark, setSavingRemark] = useState(false);

    const handleClassChange = async (classId: string) => {
        setSelectedClass(classId);
        const studentList = await db.getStudents(classId);
        setStudents(studentList);
        setSelectedStudent('');
        setReportCardData(null);
    };

    const generateReport = async () => {
        if (!selectedStudent) return;
        setLoading(true);
        try {
            // 1. Fetch all necessary data
            const studentsInClass = await db.getStudents(selectedClass);
            const student = studentsInClass.find(s => s.id === selectedStudent);
            const schoolConfig = await db.getSchoolConfig();
            
            const termNumber = parseTermNumber(schoolConfig.currentTerm);
            if (termNumber === 1 && schoolConfig.currentTerm !== 'Term 1' && schoolConfig.currentTerm !== '1') {
                 console.warn(`Invalid term format in school config: "${schoolConfig.currentTerm}". Defaulting to Term 1.`);
                 showToast(`Invalid term format in settings ("${schoolConfig.currentTerm}"). Defaulting to Term 1 for report generation.`, { type: 'info' });
            }
            const academicYear = schoolConfig.academicYear;
            const adminRemarkId = `${selectedStudent}_term${termNumber}_${academicYear}`;

            const assessments = await db.getAllAssessments().then(all => all.filter(a => a.studentId === selectedStudent));
            // Filter assessments for the current term
            const termAssessments = assessments.filter(a => a.term === termNumber);
            const remarks = await db.getStudentRemarks(selectedClass).then(all => all.find(r => r.studentId === selectedStudent));
            const adminRemarkData = await db.getAdminRemark(adminRemarkId);
            const attendance = await db.getClassAttendance(selectedClass);
            const skills = await db.getStudentSkills(selectedClass).then(all => all.find(s => s.studentId === selectedStudent));
            const users = await db.getUsers();

            // 2. Process Data
            // Calculate total school days from reopen to vacation (excluding weekends)
            let totalSchoolDays = 0;
            if (schoolConfig.schoolReopenDate && schoolConfig.vacationDate) {
                const reopen = new Date(schoolConfig.schoolReopenDate);
                const vacation = new Date(schoolConfig.vacationDate);
                
                // Validate dates to prevent infinite loops or incorrect calculations
                if (isNaN(reopen.getTime()) || isNaN(vacation.getTime())) {
                    console.warn('Invalid school reopen or vacation date in config. Falling back to attendance count.');
                    showToast('Invalid school dates in settings. Using attendance records count for total days.', { type: 'info' });
                    totalSchoolDays = attendance.length;
                } else if (reopen > vacation) {
                    console.warn('School reopen date is after vacation date. Falling back to attendance count.');
                    showToast('Reopen date is after vacation date in settings. Using attendance records count for total days.', { type: 'info' });
                    totalSchoolDays = attendance.length;
                } else {
                    const current = new Date(reopen);
                    while (current <= vacation) {
                        const day = current.getDay();
                        if (day !== 0 && day !== 6) { // Not Sunday (0) or Saturday (6)
                            totalSchoolDays++;
                        }
                        current.setDate(current.getDate() + 1);
                    }
                }
            } else {
                // Fallback: count existing attendance records
                totalSchoolDays = attendance.length;
            }
            
            const presentDays = attendance.filter(a => a.presentStudentIds.includes(selectedStudent)).length;
            const absentDays = totalSchoolDays - presentDays;
            const attendancePercentage = totalSchoolDays > 0 ? Math.round((presentDays / totalSchoolDays) * 100) : 0;

            const classTeacher = users.find(u => u.assignedClassIds?.includes(selectedClass));

            const calculateOverallGrade = (avg: number) => {
                if (avg >= 80) return 'A';
                if (avg >= 70) return 'B';
                if (avg >= 60) return 'C';
                if (avg >= 45) return 'D';
                return 'F';
            }

            const allStudentsAssessmentsForClass = await db.getAllAssessments().then(all => all.filter(a => a.classId === selectedClass && a.term === termNumber));

            const allStudentsTotalScores = students.map(s => {
                const studentAssessments = allStudentsAssessmentsForClass.filter(a => a.studentId === s.id);
                const totalScore = studentAssessments.reduce((acc, a) => acc + (a.total || 0), 0);
                return { studentId: s.id, totalScore };
            });

            allStudentsTotalScores.sort((a, b) => b.totalScore - a.totalScore);
            const rank = allStudentsTotalScores.findIndex(s => s.studentId === selectedStudent) + 1;

            // Set admin remark state
            setAdminRemark(adminRemarkData?.remark || '');


            // 3. Construct Report Card Data
            const data = {
                schoolInfo: {
                    name: schoolConfig.schoolName || 'Noble Care Academy',
                    logo: schoolLogo,
                    address: schoolConfig.address || 'Agona Swedru, Asafo road - Two brothers',
                    phone: schoolConfig.phone || '0248889590',
                    email: schoolConfig.email || 'info@noblecare.edu.gh',
                    academicYear: schoolConfig.academicYear || '',
                    term: schoolConfig.currentTerm || '',
                },
                studentInfo: {
                    name: student?.name || '',
                    gender: student?.gender || '',
                    dob: student?.dob || '',
                    class: CLASSES_LIST.find(c => c.id === student?.classId)?.name || '',
                    classTeacher: classTeacher?.name || 'N/A',
                },
                attendance: {
                    totalDays: totalSchoolDays || 0,
                    presentDays: presentDays || 0,
                    absentDays: absentDays || 0,
                    attendancePercentage: attendancePercentage || 0,
                },
                performance: termAssessments || [],
                summary: {
                    totalScore: termAssessments.reduce((acc, a) => acc + (a.total || 0), 0) || 0,
                    averageScore: termAssessments.length > 0 ? (termAssessments.reduce((acc, a) => acc + (a.total || 0), 0) / termAssessments.length).toFixed(1) : '0.0',
                    overallGrade: calculateOverallGrade(termAssessments.length > 0 ? (termAssessments.reduce((acc, a) => acc + (a.total || 0), 0) / termAssessments.length) : 0) || 'N/A',
                    classPosition: `${rank}${['st', 'nd', 'rd'][rank - 1] || 'th'}`,
                    totalStudents: students.length || 0,
                },
                skills: {
                    punctuality: skills?.punctuality || 'N/A',
                    neatness: skills?.neatness || 'N/A',
                    conduct: skills?.conduct || 'N/A',
                    attitudeToWork: skills?.attitudeToWork || 'N/A',
                    classParticipation: skills?.classParticipation || 'N/A',
                    homeworkCompletion: skills?.homeworkCompletion || 'N/A',
                },
                remarks: {
                    teacher: remarks?.remark || 'N/A',
                    headTeacher: adminRemarkData?.remark || schoolConfig.headTeacherRemark || 'An outstanding performance. The school is proud of you.',
                    adminRemark: adminRemarkData?.remark || '',
                    adminRemarkDate: adminRemarkData?.dateCreated || '',
                },
                promotion: {
                    status: termNumber === 3 ? 'Promoted' : 'N/A'
                },
                termDates: {
                    endDate: schoolConfig.termEndDate || '',
                    reopeningDate: schoolConfig.nextTermBegins || '',
                    vacationDate: schoolConfig.vacationDate || '',
                },
                allStudentsAssessments: allStudentsAssessmentsForClass,
            };

            setReportCardData(data);
            showToast('Report card generated successfully!', { type: 'success' });
        } catch (error: any) {
            console.error('Error generating report card:', error);
            showToast(`Failed to generate report card: ${error.message || 'An unknown error occurred.'}`, { type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAdminRemark = async () => {
        if (!selectedStudent || !adminRemark.trim()) return;
        setSavingRemark(true);
        try {
            const schoolConfig = await db.getSchoolConfig();
            const termNumber = parseTermNumber(schoolConfig.currentTerm);
            if (termNumber === 1 && schoolConfig.currentTerm !== 'Term 1' && schoolConfig.currentTerm !== '1') {
                console.warn(`Invalid term format in school config for saving remark: "${schoolConfig.currentTerm}". Defaulting to Term 1.`);
            }
            const remarkData: AdminRemark = {
                id: `${selectedStudent}_term${termNumber}_${schoolConfig.academicYear}`,
                studentId: selectedStudent,
                classId: selectedClass,
                term: termNumber as 1 | 2 | 3,
                academicYear: schoolConfig.academicYear,
                remark: adminRemark,
                adminId: 'admin', // TODO: get from auth context
                dateCreated: new Date().toISOString().split('T')[0],
            };
            await db.saveAdminRemark(remarkData);
            setEditingAdminRemark(false);
            // Refresh report data
            generateReport();
        } catch (error) {
            console.error('Error saving admin remark:', error);
        } finally {
            setSavingRemark(false);
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                await handleClassChange(selectedClass);
            } catch (error) {
                console.error('Error in useEffect:', error);
            }
        };
        load();
    }, []);


    return (
        <Layout title="Generate Report Card">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="text-xl font-semibold text-slate-800 mb-4">Select Student</h3>
                <div className="flex gap-4 mb-4">
                    <select
                        className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white text-black"
                        value={selectedClass}
                        onChange={e => handleClassChange(e.target.value)}
                    >
                        {CLASSES_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select
                        className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white text-black flex-grow"
                        value={selectedStudent}
                        onChange={e => setSelectedStudent(e.target.value)}
                        disabled={!students.length}
                    >
                        <option value="">-- Select a student --</option>
                        {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <button
                    onClick={generateReport}
                    disabled={!selectedStudent || loading}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                    {loading ? 'Generating...' : 'Generate Report'}
                </button>
            </div>

            {reportCardData && (
                <div className="mt-8">
                    {/* Admin Remark Edit Section */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5" />
                                Admin/Head Teacher Remark
                            </h3>
                            {!editingAdminRemark ? (
                                <button
                                    onClick={() => setEditingAdminRemark(true)}
                                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
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
                                        {savingRemark ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            )}
                        </div>
                        {editingAdminRemark ? (
                            <textarea
                                value={adminRemark}
                                onChange={(e) => setAdminRemark(e.target.value)}
                                className="w-full border border-blue-300 rounded-lg p-3 text-black bg-white"
                                rows={3}
                                placeholder="Enter admin/head teacher remark..."
                            />
                        ) : (
                            <p className="text-blue-800 italic">
                                {adminRemark || 'No remark added yet'}
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
