import React from 'react';
import html2pdf from 'html2pdf.js';
import { calculateGrade, getGradeColor } from '../constants';

interface ReportCardLayoutProps {
    data: any;
}

const ReportCardLayout: React.FC<ReportCardLayoutProps> = ({ data }) => {
    if (!data) {
        return null;
    }
    const { schoolInfo, studentInfo, attendance, performance, summary, skills, remarks, promotion, termDates } = data;

    return (
        <>
        <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-100" id="report-card" style={{ pageBreakInside: 'avoid' }}>
            {/* Header */}
            <div className="flex justify-between items-center border-b-4 border-red-800 pb-1 mb-1">
                <div className="flex items-center">
                    <img src={schoolInfo.logo} alt="School Logo" className="h-16 w-16 mr-4 object-contain"/>
                    <div>
                        <h1 className="text-2xl font-bold text-red-900">{schoolInfo.name}</h1>
                        <p className="text-slate-600">{schoolInfo.address}</p>
                        <p className="text-slate-600">{schoolInfo.phone} | {schoolInfo.email}</p>
                    </div>
                </div>
                <div className="text-right">
                    <h2 className="text-2xl font-bold text-red-800">Terminal Report Card</h2>
                    <p className="font-semibold text-slate-700">{schoolInfo.academicYear}</p>
                    <p className="font-semibold text-slate-700">{schoolInfo.term}</p>
                </div>
            </div>

            {/* Student Info */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-slate-50 p-2 rounded-lg mb-2">
                <div className="flex justify-between border-b py-1">
                    <span className="font-semibold text-slate-700">Student Name:</span>
                    <span className="text-slate-800">{studentInfo.name}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                    <span className="font-semibold text-slate-700">Class:</span>
                    <span className="text-slate-800">{studentInfo.class}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                    <span className="font-semibold text-slate-700">Gender:</span>
                    <span className="text-slate-800">{studentInfo.gender}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                    <span className="font-semibold text-slate-700">Class Teacher:</span>
                    <span className="text-slate-800">{studentInfo.classTeacher}</span>
                </div>
            </div>

            {/* Attendance */}
            <div className="mb-2">
                <h3 className="text-lg font-bold text-red-900 mb-2 border-l-4 border-red-800 pl-3">Attendance Record</h3>
                <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-blue-50 p-3 rounded-lg"><span className="block font-bold text-blue-800 text-xl">{attendance.totalDays}</span><span className="text-sm text-blue-700">School Days</span></div>
                    <div className="bg-green-50 p-3 rounded-lg"><span className="block font-bold text-green-800 text-xl">{attendance.presentDays}</span><span className="text-sm text-green-700">Present</span></div>
                    <div className="bg-red-50 p-3 rounded-lg"><span className="block font-bold text-red-800 text-xl">{attendance.absentDays}</span><span className="text-sm text-red-700">Absent</span></div>
                    <div className="bg-purple-50 p-3 rounded-lg"><span className="block font-bold text-purple-800 text-xl">{attendance.attendancePercentage}%</span><span className="text-sm text-purple-700">Attendance</span></div>
                </div>
            </div>

            {/* Academic Performance */}
            <div className="mb-2">
                <h3 className="text-lg font-bold text-red-900 mb-2 border-l-4 border-red-800 pl-3">Academic Performance</h3>
                <table className="w-full text-left border-collapse" style={{fontSize: '10px'}}>
                    <thead className="bg-red-800 text-white">
                        <tr>
                            <th className="p-2 border">Subject</th>
                            <th className="p-2 border text-center">Class Test</th>
                            <th className="p-2 border text-center">Homework</th>
                            <th className="p-2 border text-center">Project</th>
                            <th className="p-2 border text-center">Exam</th>
                            <th className="p-2 border text-center">Total</th>
                            <th className="p-2 border text-center">Grade</th>
                            <th className="p-2 border">Remark</th>
                        </tr>
                    </thead>
                    <tbody>
                        {performance.map((p: any, i: number) => {
                            const grade = calculateGrade(p.total);
                            return (
                                <tr key={i} className="hover:bg-slate-50">
                                    <td className="p-2 border font-semibold">{p.subject}</td>
                                    <td className="p-2 border text-center">{p.testScore}</td>
                                    <td className="p-2 border text-center">{p.homeworkScore}</td>
                                    <td className="p-2 border text-center">{p.projectScore}</td>
                                    <td className="p-2 border text-center">{p.examScore}</td>
                                    <td className="p-2 border text-center font-bold">{p.total}</td>
                                    <td className={`p-2 border text-center font-bold ${getGradeColor(grade.grade).split(' ')[0]}`}>{grade.grade}</td>
                                    <td className="p-2 border">{grade.remark}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Summary & Skills */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
                <div>
                    <h3 className="text-lg font-bold text-red-900 mb-2 border-l-4 border-red-800 pl-3">Performance Summary</h3>
                    <div className="bg-slate-50 p-4 rounded-lg">
                        <div className="flex justify-between py-1 border-b"><span className="font-semibold">Total Score:</span><span>{summary.totalScore}</span></div>
                        <div className="flex justify-between py-1 border-b"><span className="font-semibold">Average Score:</span><span>{summary.averageScore}</span></div>
                        <div className="flex justify-between py-1 border-b"><span className="font-semibold">Overall Grade:</span><span className="font-bold">{summary.overallGrade}</span></div>
                        <div className="flex justify-between py-1"><span className="font-semibold">Position:</span><span>{summary.classPosition} of {summary.totalStudents}</span></div>
                    </div>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-red-900 mb-2 border-l-4 border-red-800 pl-3">Skills & Behaviour</h3>
                    <div className="bg-slate-50 p-4 rounded-lg">
                         {Object.entries(skills).map(([skill, rating]) => (
                            <div key={skill} className="flex justify-between py-1 border-b">
                                <span className="font-semibold capitalize">{skill.replace(/([A-Z])/g, ' $1')}:</span>
                                <span>{rating as string}</span>
                            </div>
                         ))}
                    </div>
                </div>
            </div>

            {/* Remarks */}
            <div className="mb-4">
                 <h3 className="text-lg font-bold text-red-900 mb-2 border-l-4 border-red-800 pl-3">Remarks</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-slate-50 p-4 rounded-lg">
                        <h4 className="font-bold mb-1">Class Teacher's Remark:</h4>
                        <p className="text-sm italic">"{remarks.teacher}"</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg">
                        <h4 className="font-bold mb-1">Head Teacher's Remark:</h4>
                        <p className="text-sm italic">"{remarks.headTeacher}"</p>
                    </div>
                 </div>
            </div>

             {/* Promotion & Dates */}
             <div className="grid grid-cols-2 gap-8 mb-4 text-sm">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-center">
                    <span className="font-bold">Promotion Status:</span> {promotion.status}
                </div>
                <div className="bg-green-50 text-green-800 p-4 rounded-lg text-center">
                    <span className="font-bold">Next Term Begins:</span> {termDates.reopeningDate}
                </div>
             </div>

            {/* Signatures */}
            <div className="flex justify-between items-center mt-8 pt-4 border-t">
                <div className="text-center">
                    <p className="border-t-2 border-dotted border-slate-400 w-48 pt-1 text-sm font-semibold">Class Teacher</p>
                </div>
                <div className="text-center">
                     <div className="w-24 h-24 border-2 border-dashed border-slate-300 flex items-center justify-center">
                         <p className="text-slate-400 text-xs">School Stamp</p>
                     </div>
                </div>
                <div className="text-center">
                    <p className="border-t-2 border-dotted border-slate-400 w-48 pt-1 text-sm font-semibold">Head Teacher</p>
                </div>
            </div>

        </div>
        <div className="flex justify-end mt-8">
         <button
                onClick={() => {
        const element = document.getElementById('report-card');
        if (element) {
            const opt = {
                margin: 0.5,
                filename: `${data.studentInfo.name}_Report_Card.pdf`,
                image: { type: 'jpeg' as const, quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'in', format: 'a4' as const, orientation: 'portrait' as const, compress: true },
                css: '.no-pdf { display: none; }'
            };
            html2pdf().set(opt).from(element).save();
        }
    }}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
                Download PDF
            </button>
            </div>
        </>
    );
};

export default ReportCardLayout;
