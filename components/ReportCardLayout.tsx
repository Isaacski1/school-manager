import React, { useState } from 'react';
// @ts-ignore - html2pdf.js doesn't have proper types
import html2pdf from 'html2pdf.js';
import { calculateGrade, getGradeColor } from '../constants';

interface ReportCardLayoutProps {
    data: any;
}

const ReportCardLayout: React.FC<ReportCardLayoutProps> = ({ data }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    if (!data) {
        return null;
    }
    const { schoolInfo, studentInfo, attendance, performance, summary, skills, remarks, promotion, termDates } = data;

    const handleDownload = () => {
        const element = document.getElementById('report-card');
        if (!element) {
            return;
        }
        
        setIsGenerating(true);
        
        try {
            const opt = {
                margin: [0.15, 0.25, 0.15, 0.25],
                filename: `${data.studentInfo.name}_Report_Card.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
  scale: 2.2,
  useCORS: true,
  allowTaint: false,
  backgroundColor: '#ffffff'
},
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait', compress: true },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };
            
            // @ts-ignore - html2pdf.js types
            html2pdf().set(opt).from(element).save().then(() => {
                setIsGenerating(false);
            }).catch((error: Error) => {
                console.error('PDF generation failed:', error);
                setIsGenerating(false);
            });
        } catch (error) {
            console.error('PDF generation failed:', error);
            setIsGenerating(false);
        }
    };

    return (
        <>
        <div
  id="report-card"
  className="bg-white p-4 rounded-lg shadow-lg border border-slate-200 text-[12.5px] leading-relaxed"
  style={{
    minHeight: '10.7in',
    boxSizing: 'border-box',
    pageBreakInside: 'avoid'
  }}
>
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-red-800 pb-2 mb-2">
                <div className="flex items-center">
                    <img src={schoolInfo.logo} alt="School Logo" className="h-12 w-12 mr-3 object-contain"/>
                    <div>
                        <h1 className="text-lg font-bold text-red-900">{schoolInfo.name}</h1>
                        <p className="text-xs text-slate-600">{schoolInfo.address} | {schoolInfo.phone}</p>
                    </div>
                </div>
                <div className="text-right">
                    <h2 className="text-lg font-bold text-red-800">Terminal Report Card</h2>
                    <p className="text-xs font-semibold text-slate-700">{schoolInfo.academicYear} | {schoolInfo.term}</p>
                </div>
            </div>

            {/* Student Info */}
            <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2 rounded mb-2 text-xs">
                <div><span className="font-semibold">Name:</span> {studentInfo.name}</div>
                <div><span className="font-semibold">Class:</span> {studentInfo.class}</div>
                <div><span className="font-semibold">Gender:</span> {studentInfo.gender}</div>
                <div><span className="font-semibold">Teacher:</span> {studentInfo.classTeacher}</div>
            </div>

            {/* Attendance */}
            <div className="mb-2">
                <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-blue-50 p-1.5 rounded"><span className="block font-bold text-blue-800 text-lg">{attendance.totalDays}</span><span className="text-xs text-blue-700">School Days</span></div>
                    <div className="bg-green-50 p-1.5 rounded"><span className="block font-bold text-green-800 text-lg">{attendance.presentDays}</span><span className="text-xs text-green-700">Present</span></div>
                    <div className="bg-red-50 p-1.5 rounded"><span className="block font-bold text-red-800 text-lg">{attendance.absentDays}</span><span className="text-xs text-red-700">Absent</span></div>
                    <div className="bg-purple-50 p-1.5 rounded"><span className="block font-bold text-purple-800 text-lg">{attendance.attendancePercentage}%</span><span className="text-xs text-purple-700">Attendance</span></div>
                </div>
            </div>

                        {/* Academic Performance */}
                        <div className="mb-2">
                            <h3
  className="text-sm font-bold text-red-900 mb-2 px-3 pb-2 bg-slate-50"
  style={{
    borderLeft: '1.5px solid #c4c4c4',
    borderRight: '1.5px solid #c4c4c4'
  }}
>
  Academic Performance
</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead className="bg-red-800 text-white">
                                        <tr>
                                           <th className="px-2 pt-0 pb-3 border-b border-white align-middle leading-relaxed">Subject</th>
                                            <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-12">C.Test</th>
                                            <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-12">HW</th>
                                            <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-12">Proj</th>
                                            <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-12">Exam</th>
                                            <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-12">Total</th>
                                            <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-10">Pos</th>
                                            <th className="px-2 pt-0 pb-3 border-b border-white align-middle text-center w-10">Grade</th>
                                            <th className="px-2 pt-0 pb-3 border-b border-white align-middle">Remark</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.allStudentsAssessments && performance.map((p: any, i: number) => {
                                            const grade = calculateGrade(p.total);
                                            const subjectScores = data.allStudentsAssessments
                                                .filter((a: any) => a.subject === p.subject)
                                                .map((a: any) => a.total);
                                            subjectScores.sort((a: number, b: number) => b - a);
                                            const position = subjectScores.indexOf(p.total) + 1;
                                            const positionSuffix = ['st', 'nd', 'rd'][position - 1] || 'th';

                                            return (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="p-1.5 border font-medium">{p.subject}</td>
                                                    <td className="px-2 py-2 border text-center leading-relaxed">{p.testScore}</td>
                                                    <td className="p-1.5 border text-center">{p.homeworkScore}</td>
                                                    <td className="p-1.5 border text-center">{p.projectScore}</td>
                                                    <td className="p-1.5 border text-center">{p.examScore}</td>
                                                    <td className="p-1.5 border text-center font-bold">{p.total}</td>
                                                    <td className="p-1.5 border text-center">{`${position}${positionSuffix}`}</td>
                                                    <td className={`p-1.5 border text-center font-bold ${getGradeColor(grade.grade).split(' ')[0]}`}>{grade.grade}</td>
                                                    <td className="p-1.5 border">{grade.remark}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

            {/* Summary & Skills - Side by Side */}
            <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                    <h3 className="text-sm font-bold text-red-900 mb-1 border-l-3 border-red-800 pl-2">Performance Summary</h3>
                    <div className="bg-slate-50 p-3 rounded text-xs space-y-1">
                        <div className="flex justify-between py-0.5 border-b"><span className="font-semibold">Total Score:</span><span>{summary.totalScore}</span></div>
                        <div className="flex justify-between py-0.5 border-b"><span className="font-semibold">Average:</span><span>{summary.averageScore}</span></div>
                        <div className="flex justify-between py-0.5 border-b"><span className="font-semibold">Grade:</span><span className="font-bold">{summary.overallGrade}</span></div>
                        <div className="flex justify-between py-0.5"><span className="font-semibold">Position:</span><span>{summary.classPosition} of {summary.totalStudents}</span></div>
                    </div>
                </div>
                                 <div>
                                    <h3 className="text-sm font-bold text-red-900 mb-1 border-l-3 border-red-800 pl-2">Skills & Behaviour</h3>
                                    <div className="bg-slate-50 p-3 rounded text-xs space-y-1">
                                         {skills && Object.entries(skills).map(([skill, rating]) => (
                                            <div key={skill} className="flex justify-between py-0.5 border-b last:border-0">
                                                <span className="font-semibold capitalize">{skill.replace(/([A-Z])/g, ' $1')}:</span>
                                                <span>{rating as string}</span>
                                            </div>
                                         ))}
                                    </div>
                                </div>            </div>

            {/* Remarks */}
            <div className="mb-2">
                 <h3 className="text-sm font-bold text-red-900 mb-1 border-l-3 border-red-800 pl-2">Remarks</h3>
                 <div className="grid grid-cols-2 gap-3">
                     <div className="bg-slate-50 p-3 rounded text-xs min-h-[70px]">
                         <h4 className="font-bold mb-0.5">Class Teacher:</h4>
                         <p className="italic">"{remarks.teacher}"</p>
                     </div>
                     <div className="bg-slate-50 p-2 rounded text-xs">
                         <h4 className="font-bold mb-0.5">Head Teacher:</h4>
                         <p className="italic">"{remarks.headTeacher}"</p>
                     </div>
                 </div>
            </div>

             {/* Promotion & Dates */}
             <div className="grid grid-cols-3 gap-3 mb-2 text-xs">
                <div className="bg-blue-50 text-blue-800 p-2 rounded text-center">
                    <span className="font-bold">Promotion:</span> {promotion.status}
                </div>
                <div className="bg-green-50 text-green-800 p-2 rounded text-center">
                    <span className="font-bold">Next Term:</span> {termDates.reopeningDate}
                </div>
                <div className="bg-slate-100 text-slate-700 p-2 rounded text-center">
                    <span className="font-bold">Term Ends in:</span> {termDates.vacationDate}
                </div>
             </div>

            {/* Signatures */}
            <div className="flex justify-between items-center pt-2 border-t">
                <div className="text-center">
                    <p className="border-t border-dotted border-slate-400 w-32 pt-1 text-xs font-semibold">Class Teacher</p>
                </div>
                <div className="text-center">
                     <div className="w-16 h-16 border border-dashed border-slate-300 flex items-center justify-center">
                         <p className="text-slate-400 text-[10px]">Stamp</p>
                     </div>
                </div>
                <div className="text-center">
                    <p className="border-t border-dotted border-slate-400 w-32 pt-1 text-xs font-semibold">Head Teacher</p>
                </div>
            </div>

        </div>
        <div className="flex justify-end mt-4">
          <button
                onClick={handleDownload}
                disabled={isGenerating}
                className={`px-6 py-2 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 ${isGenerating ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600'}`}
            >
                {isGenerating ? (
                    <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating PDF...
                    </>
                ) : (
                    'Download PDF'
                )}
            </button>
            </div>
        </>
    );
};

export default ReportCardLayout;
