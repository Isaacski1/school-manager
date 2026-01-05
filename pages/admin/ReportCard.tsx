import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { db } from '../../services/mockDb';
import { Student, ClassRoom, Assessment, StudentRemark } from '../../types';
import { CLASSES_LIST } from '../../constants';
import ReportCardLayout from '../../components/ReportCardLayout';

const ReportCard = () => {
    const [selectedClass, setSelectedClass] = useState(CLASSES_LIST[0].id);
    const [students, setStudents] = useState<Student[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<string>('');
    const [reportCardData, setReportCardData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

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

        // 1. Fetch all necessary data
        const student = await db.getStudents().then(all => all.find(s => s.id === selectedStudent));
        const schoolConfig = await db.getSchoolConfig();
        const assessments = await db.getAllAssessments().then(all => all.filter(a => a.studentId === selectedStudent));
        const remarks = await db.getStudentRemarks(selectedClass).then(all => all.find(r => r.studentId === selectedStudent));
        const attendance = await db.getClassAttendance(selectedClass);
        const skills = await db.getStudentSkills(selectedClass).then(all => all.find(s => s.studentId === selectedStudent));
        const users = await db.getUsers();

        // 2. Process Data
        const termNumber = parseInt(schoolConfig.currentTerm.split(' ')[1]);
        const termAssessments = assessments.filter(a => a.term === termNumber);
        
        const totalDays = attendance.length;
        const presentDays = attendance.filter(a => a.presentStudentIds.includes(selectedStudent)).length;
        const absentDays = totalDays - presentDays;
        const attendancePercentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

        const classTeacher = users.find(u => u.assignedClassIds?.includes(selectedClass));

        const calculateOverallGrade = (avg: number) => {
            if (avg >= 80) return 'A';
            if (avg >= 70) return 'B';
            if (avg >= 60) return 'C';
            if (avg >= 45) return 'D';
            return 'F';
        }

        const allStudentsAssessments = await Promise.all(students.map(async (s) => {
            const studentAssessments = await db.getAllAssessments().then(all => all.filter(a => a.studentId === s.id && a.term === termNumber));
            const totalScore = studentAssessments.reduce((acc, a) => acc + (a.total || 0), 0);
            return { studentId: s.id, totalScore };
        }));

        allStudentsAssessments.sort((a, b) => b.totalScore - a.totalScore);
        const rank = allStudentsAssessments.findIndex(s => s.studentId === selectedStudent) + 1;

        // 3. Construct Report Card Data
        const data = {
            schoolInfo: {
                name: schoolConfig.schoolName || 'Noble Care Academy',
                logo: 'https://scontent.facc5-1.fna.fbcdn.net/v/t39.30808-6/277561581_380661664069143_4955839060397865014_n.jpg?_nc_cat=102&ccb=1-7&_nc_sid=6ee11a&_nc_eui2=AeFJNGCSI96CBW1S8R2sOotMrM2NNo5aPtOszY02jlo-04y0fL8D99GjvJaBXuzqH8OYrZRdn_DgSU4Kgwvj36D2&_nc_ohc=GeYOZj7SI8AQ7kNvwFo1QMy&_nc_oc=AdnCfyquuglPpsQYtG1zbC9KAOmrLOH7MKUJTuoVKPm7FdxXjqnrHmzUSj4b3hioGUo&_nc_zt=23&_nc_ht=scontent.facc5-1.fna&_nc_gid=DdsLMQJFSMTnkkiquIQTNQ&oh=00_Afo5zCyNS0kVyQ6p_ArT53WNpaTgIKDpPQScqRwUn3HyKA&oe=695CE41D',
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
                totalDays: totalDays || 0,
                presentDays: presentDays || 0,
                absentDays: absentDays || 0,
                attendancePercentage: attendancePercentage || 0,
            },
            performance: termAssessments || [],
            summary: {
                totalScore: termAssessments.reduce((acc, a) => acc + (a.total || 0), 0) || 0,
                averageScore: termAssessments.length > 0 ? (termAssessments.reduce((acc, a) => acc + (a.total || 0), 0) / termAssessments.length).toFixed(1) : 0,
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
                headTeacher: schoolConfig.headTeacherRemark || 'An outstanding performance. The school is proud of you.',
            },
            promotion: {
                status: termNumber === 3 ? 'Promoted' : 'N/A'
            },
            termDates: {
                endDate: schoolConfig.termEndDate || '',
                reopeningDate: schoolConfig.nextTermBegins || '',
            },
        };

        setReportCardData(data);
        setLoading(false);
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
                    <ReportCardLayout data={reportCardData} />
                </div>
            )}
        </Layout>
    );
};

export default ReportCard;
