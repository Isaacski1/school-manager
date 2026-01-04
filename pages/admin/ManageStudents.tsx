import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { showToast } from '../../services/toast';
import { db } from '../../services/mockDb';
import { Student } from '../../types';
import { CLASSES_LIST, calculateGrade, getGradeColor } from '../../constants';
import { Plus, Trash2, Edit, Eye, X, BookOpen, Calendar, User as UserIcon, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const ManageStudents = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [filterClass, setFilterClass] = useState('all');
  
  // Edit/Add State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Student>>({
    gender: 'Male',
    classId: 'c_p1',
    dob: ''
  });

  // Performance Data (Shared for both View Modal and Edit Modal)
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [performanceData, setPerformanceData] = useState<any>(null);

  // Delete Confirmation State
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Save button loading state
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = async () => {
    const data = await db.getStudents();
    setStudents(data);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Logic for Performance View ---
  const handleViewPerformance = async (student: Student) => {
    setPerformanceData(null); // Reset prev data
    setViewStudent(student);
    const data = await db.getStudentPerformance(student.id, student.classId);
    setPerformanceData(data);
  };

  const closeViewModal = () => {
    setViewStudent(null);
    setPerformanceData(null);
  };
  // ----------------------------------

  const filteredStudents = students
    .filter(s => filterClass === 'all' ? true : s.classId === filterClass)
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleOpenAdd = () => {
    setPerformanceData(null);
    const selectedClass = filterClass !== 'all' ? filterClass : 'c_p1';
    setFormData({ gender: 'Male', classId: selectedClass, dob: '' });
    setEditingId(null);
    setShowModal(true);
  };

  const handleEdit = async (student: Student) => {
    setFormData(student);
    setEditingId(student.id);
    setShowModal(true);
    
    // Also fetch performance data to show in the edit modal
    setPerformanceData(null);
    const data = await db.getStudentPerformance(student.id, student.classId);
    setPerformanceData(data);
  };

  const handleClose = () => {
    setShowModal(false);
    setFormData({ gender: 'Male', classId: 'c_p1', dob: '' });
    setEditingId(null);
    setPerformanceData(null);
  };

  const promptDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteId(id);
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    
    const idToDelete = deleteId;
    // Close modal immediately
    setDeleteId(null);

    // Optimistic update: remove from UI immediately
    const previousStudents = [...students];
    setStudents(prev => prev.filter(s => s.id !== idToDelete));

    try {
        await db.deleteStudent(idToDelete);
    } catch (error) {
        console.error("Delete failed", error);
        // Revert state if DB fails
        setStudents(previousStudents);
        showToast("Failed to delete student. Please try again.", { type: 'error' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.classId) return;

    setIsSaving(true);
    try {
      if (editingId) {
        const updatedStudent: Student = {
          ...formData as Student,
          id: editingId
        };
        await db.updateStudent(updatedStudent);
        showToast('Student updated successfully.', { type: 'success' });
      } else {
        const newStudent: Student = {
          id: Math.random().toString(36).substr(2, 9),
          name: formData.name,
          gender: formData.gender as 'Male' | 'Female',
          dob: formData.dob || '2015-01-01',
          classId: formData.classId,
          guardianName: formData.guardianName || '',
          guardianPhone: formData.guardianPhone || '',
        };
        await db.addStudent(newStudent);
        showToast('Student added successfully.', { type: 'success' });
      }

      await fetchData();
      handleClose();
    } catch (error) {
      console.error('Save failed', error);
      showToast('Failed to save student. Please try again.', { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Calendar Rendering Helpers ---
  const renderCalendar = () => {
      if (!performanceData || !performanceData.attendance || !performanceData.attendance.schoolDates) return null;

      const { schoolDates, presentDates } = performanceData.attendance;
      if (schoolDates.length === 0) return <div className="text-center text-slate-400 py-4 italic">No attendance records found for this term.</div>;

      // Normalize date strings (YYYY-MM-DD)
      const normalize = (d: string | Date) => {
        const date = typeof d === 'string' ? new Date(d) : d;
        return date.toISOString().split('T')[0];
      };

      const schoolSet = new Set(schoolDates.map((s: string) => normalize(s)));
      const presentSet = new Set(presentDates.map((s: string) => normalize(s)));

      // Group by month-year using numeric keys for correct ordering
      const months: Record<string, { label: string, year: number, month: number }> = {};
      schoolDates.forEach((s: string) => {
        const d = new Date(s);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!months[key]) months[key] = { label: d.toLocaleString('default', { month: 'long', year: 'numeric' }), year: d.getFullYear(), month: d.getMonth() };
      });

      const weekdayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {Object.entries(months).map(([key, info]) => {
            const { year, month, label } = info;
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

            return (
              <div key={key} className="border border-slate-200 rounded-lg p-3 bg-white">
                <h5 className="font-bold text-slate-700 text-sm mb-2 text-center border-b border-slate-100 pb-2">{label}</h5>

                <div className="grid grid-cols-7 gap-1 text-center">
                  {weekdayLabels.map((d, i) => (
                    <div key={i} className="text-[11px] text-slate-400 font-bold">{d}</div>
                  ))}

                  {Array.from({ length: totalCells }).map((_, idx) => {
                    const dayNum = idx - firstDay + 1;
                    if (dayNum < 1 || dayNum > daysInMonth) {
                      return <div key={idx} className="h-8"></div>;
                    }

                    const dateObj = new Date(year, month, dayNum);
                    const iso = normalize(dateObj);
                    const isSchoolDay = schoolSet.has(iso);
                    const isPresent = presentSet.has(iso);
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

                    // Visual styles
                    const baseClasses = `h-8 w-8 mx-auto flex items-center justify-center rounded-full text-sm font-semibold`;
                    const weekendClasses = isWeekend ? 'text-slate-300 bg-slate-50' : '';

                    if (!isSchoolDay) {
                      return (
                        <div key={idx} className={`h-8 flex items-center justify-center text-[12px] text-slate-200`}></div>
                      );
                    }

                    return (
                      <div key={idx} className="flex items-center justify-center">
                        <div
                          title={`${iso}: ${isPresent ? 'Present' : 'Absent'}`}
                          className={`${baseClasses} ${weekendClasses} ${isPresent ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
                        >
                          {dayNum}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex justify-center gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-100 rounded-full border border-emerald-200"></div> Present</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-100 rounded-full border border-red-200"></div> Absent</div>
                </div>
              </div>
            );
          })}
        </div>
      );
  };

  return (
    <Layout title="Manage Students">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex gap-2">
            <select 
              className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-slate-800 text-white"
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
            >
              <option value="all">All Classes</option>
              {CLASSES_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button 
            onClick={handleOpenAdd}
            className="flex items-center justify-center bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} className="mr-2" />
            Add Student
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Class</th>
                <th className="px-6 py-3">Gender</th>
                <th className="px-6 py-3">Guardian</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    No students found.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => {
                   const className = CLASSES_LIST.find(c => c.id === student.classId)?.name || student.classId;
                   return (
                    <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-800">{student.name}</td>
                      <td className="px-6 py-3">{className}</td>
                      <td className="px-6 py-3">{student.gender}</td>
                      <td className="px-6 py-3">
                        <div className="flex flex-col">
                          <span>{student.guardianName}</span>
                          <span className="text-xs text-slate-400">{student.guardianPhone}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <button 
                          type="button"
                          onClick={() => handleViewPerformance(student)} 
                          className="text-emerald-500 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-full transition-colors mr-1" 
                          title="View Performance"
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleEdit(student)} 
                          className="text-blue-500 hover:text-blue-700 p-2 hover:bg-blue-50 rounded-full transition-colors mr-1" 
                          title="Edit Details"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          type="button"
                          onClick={(e) => promptDelete(student.id, e)} 
                          className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full transition-colors cursor-pointer" 
                          title="Delete Student"
                        >
                          <Trash2 size={16} className="pointer-events-none" />
                        </button>
                      </td>
                    </tr>
                   );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 shadow-xl transform transition-all">
            <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle className="text-red-600 w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Student?</h3>
                <p className="text-sm text-slate-500 mb-6">
                    Are you sure you want to delete this student? This action cannot be undone.
                </p>
                <div className="flex gap-3 w-full">
                    <button 
                        onClick={() => setDeleteId(null)}
                        className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={executeDelete}
                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors shadow-sm"
                    >
                        Delete
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-6 text-slate-900 border-b pb-2">{editingId ? 'Edit Student Details' : 'Add New Student'}</h3>
            
            {/* Quick Performance Summary within Edit Modal */}
            {editingId && (
              <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between">
                <div>
                   <h4 className="text-sm font-bold text-slate-700">Attendance Summary</h4>
                   <p className="text-xs text-slate-500">Current Term Performance</p>
                </div>
                <div className="text-right">
                   {performanceData ? (
                     <>
                        <span className="text-xl font-bold text-emerald-600">{performanceData.attendance.percentage}%</span>
                        <p className="text-xs text-slate-500">{performanceData.attendance.present}/{performanceData.attendance.total} Days</p>
                     </>
                   ) : (
                     <span className="text-xs text-slate-400">Loading data...</span>
                   )}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Personal Info Section */}
              <div className="space-y-4">
                  <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wide">Personal Information</h4>
                  
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                    <input 
                      type="text" 
                      required
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder-slate-400"
                      value={formData.name || ''}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g. Kwame Nkrumah Jnr"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Gender</label>
                      <select 
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-slate-900"
                        value={formData.gender}
                        onChange={e => setFormData({...formData, gender: e.target.value as any})}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Date of Birth</label>
                      <input 
                        type="date"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={formData.dob || ''}
                        onChange={e => setFormData({...formData, dob: e.target.value})}
                      />
                    </div>
                  </div>
              </div>

              {/* Academic Info */}
              <div className="space-y-4 pt-2">
                 <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wide">Academic Info</h4>
                 <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned Class</label>
                    <select 
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-slate-900"
                        value={formData.classId}
                        onChange={e => setFormData({...formData, classId: e.target.value})}
                    >
                        {CLASSES_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
              </div>

              {/* Guardian Info */}
              <div className="space-y-4 pt-2">
                 <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wide">Guardian Information</h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Guardian Name</label>
                      <input 
                        type="text" 
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none placeholder-slate-400"
                        value={formData.guardianName || ''}
                        onChange={e => setFormData({...formData, guardianName: e.target.value})}
                        placeholder="e.g. Mr. John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
                      <input 
                        type="tel" 
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none placeholder-slate-400"
                        value={formData.guardianPhone || ''}
                        onChange={e => setFormData({...formData, guardianPhone: e.target.value})}
                        placeholder="e.g. 024 123 4567"
                      />
                    </div>
                 </div>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={handleClose}
                  className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className={`px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium shadow-sm transition-colors ${isSaving ? 'opacity-60 cursor-not-allowed hover:bg-emerald-600' : 'hover:bg-emerald-700'}`}
                >
                  {isSaving ? (
                    <span className="flex items-center">
                      <svg className="animate-spin h-4 w-4 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      {editingId ? 'Updating...' : 'Saving...'}
                    </span>
                  ) : (
                    (editingId ? 'Update Student' : 'Save Student')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Performance Modal (Report Card) */}
      {viewStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto shadow-2xl flex flex-col">
              
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50 sticky top-0 z-10">
                  <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center text-2xl font-bold text-slate-500">
                          {viewStudent.name.charAt(0)}
                      </div>
                      <div>
                          <h2 className="text-xl font-bold text-slate-900">{viewStudent.name}</h2>
                          <div className="flex gap-2 text-sm text-slate-500 mt-1">
                             <span className="flex items-center"><UserIcon size={14} className="mr-1"/> {viewStudent.gender}</span>
                             <span>•</span>
                             <span>{CLASSES_LIST.find(c => c.id === viewStudent.classId)?.name}</span>
                          </div>
                      </div>
                  </div>
                  <button onClick={closeViewModal} className="text-slate-400 hover:text-slate-700 bg-white p-2 rounded-full shadow-sm">
                      <X size={24} />
                  </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-8">
                  
                  {/* Detailed Attendance Stats */}
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
                      <div className="flex items-center gap-3 mb-6">
                          <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                              <Calendar size={20} />
                          </div>
                          <h4 className="font-bold text-slate-800 text-lg">Attendance Record</h4>
                      </div>

                      {/* Stat Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center">
                              <span className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Total School Days</span>
                              <span className="text-2xl font-bold text-slate-800">
                                  {performanceData ? performanceData.attendance.total : '-'}
                              </span>
                          </div>
                          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center">
                              <span className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Days Present</span>
                              <span className="text-2xl font-bold text-emerald-600">
                                  {performanceData ? performanceData.attendance.present : '-'}
                              </span>
                          </div>
                          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center">
                              <span className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Attendance Rate</span>
                              <span className={`text-2xl font-bold ${performanceData?.attendance?.percentage < 50 ? 'text-red-500' : 'text-blue-600'}`}>
                                  {performanceData ? `${performanceData.attendance.percentage}%` : '-'}
                              </span>
                          </div>
                      </div>

                      {/* Legend */}
                      <div className="flex justify-center gap-6 text-xs text-slate-500 mb-2">
                          <div className="flex items-center"><div className="w-3 h-3 bg-emerald-100 border border-emerald-200 rounded-full mr-2"></div> Present</div>
                          <div className="flex items-center"><div className="w-3 h-3 bg-red-100 border border-red-200 rounded-full mr-2"></div> Absent</div>
                      </div>

                      {/* Calendar View */}
                      {renderCalendar()}
                  </div>

                  {/* Academic Grades */}
                  <div>
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                          <BookOpen size={20} className="mr-2 text-blue-600"/> Academic Performance
                      </h3>
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-slate-100 text-slate-600 font-semibold">
                                  <tr>
                                      <th className="px-4 py-3">Subject</th>
                                      <th className="px-4 py-3 text-center">Score</th>
                                      <th className="px-4 py-3 text-center">Grade</th>
                                      <th className="px-4 py-3 text-right">Remark</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {performanceData ? performanceData.grades.map((g: any, i: number) => {
                                      const score = g.total || ((g.testScore||0) + (g.homeworkScore||0) + (g.projectScore||0) + (g.examScore||0));
                                      const { grade, remark } = calculateGrade(score);
                                      return (
                                          <tr key={i} className="hover:bg-slate-50">
                                              <td className="px-4 py-3 font-medium text-slate-800">{g.subject}</td>
                                              <td className="px-4 py-3 text-center">{score > 0 ? score : '-'}</td>
                                              <td className="px-4 py-3 text-center">
                                                  <span className={`px-2 py-1 rounded text-xs font-bold ${getGradeColor(grade)}`}>
                                                      {score > 0 ? grade : '-'}
                                                  </span>
                                              </td>
                                              <td className="px-4 py-3 text-right text-slate-500">{score > 0 ? remark : 'N/A'}</td>
                                          </tr>
                                      );
                                  }) : (
                                      <tr><td colSpan={4} className="p-4 text-center">Loading grades...</td></tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                  <p className="text-xs text-slate-400">Generated automatically by Noble Care Academy System</p>
              </div>
           </div>
        </div>
      )}
    </Layout>
  );
};

export default ManageStudents;