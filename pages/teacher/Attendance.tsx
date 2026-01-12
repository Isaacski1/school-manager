import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/mockDb';
import { Student } from '../../types';
import { CLASSES_LIST } from '../../constants';
import { Save, Calendar, AlertTriangle } from 'lucide-react';

const Attendance = () => {
  const { user } = useAuth();
  const assignedClassIds = user?.assignedClassIds || [];
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  const [students, setStudents] = useState<Student[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [schoolConfig, setSchoolConfig] = useState<any>(null);

  // Initialize selected class
  useEffect(() => {
    if (assignedClassIds.length > 0 && !selectedClassId) {
        setSelectedClassId(assignedClassIds[0]);
    }
  }, [assignedClassIds]);

  // Fetch school config
  useEffect(() => {
    const fetchConfig = async () => {
      const config = await db.getSchoolConfig();
      setSchoolConfig(config);
      
      // Auto-set date to minimum allowed date if current date is before minimum
      const minDate = getMinDateFromConfig(config);
      if (minDate && date < minDate) {
        setDate(minDate);
      }
    };
    fetchConfig();
  }, []);

  // Helper function to get minimum allowed date
  const getMinDate = () => {
    return getMinDateFromConfig(schoolConfig);
  };

  const getMinDateFromConfig = (config: any) => {
    if (!config) return '';
    // The user wants schoolReopenDate to be the primary start date for marking attendance
    if (config.schoolReopenDate) {
      return config.schoolReopenDate;
    }
    return '';
  };

  // Helper function to get maximum allowed date for attendance marking
  const getMaxDateFromConfig = (config: any) => {
    if (!config) return '';
    // The user wants vacationDate to be the end date for marking attendance
    if (config.vacationDate) {
      return config.vacationDate;
    }
    return '';
  };

  // Helper function to check if date is blocked
  const isDateBlocked = () => {
    const vacationDate = schoolConfig?.vacationDate;
    const nextTermBegins = schoolConfig?.nextTermBegins;
    const schoolReopenDate = schoolConfig?.schoolReopenDate;
    
    // If nextTermBegins is set and we're at or past that date, allow attendance (new term started)
    if (nextTermBegins && date >= nextTermBegins) {
      return false;
    }
    
    // Block if date is after vacation date (during vacation period)
    if (vacationDate && date > vacationDate) {
      return true;
    }
    
    // Block if no vacationDate but schoolReopenDate is set and date is before it
    if (!vacationDate && schoolReopenDate && date < schoolReopenDate) {
      return true;
    }
    
    return false;
  };

  useEffect(() => {
    if (!selectedClassId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // 1. Get Students
        const studentsList = await db.getStudents(selectedClassId);
        setStudents(studentsList);

        // 2. Get existing attendance for date
        const existing = await db.getAttendance(selectedClassId, date);
        if (existing) {
          setPresentIds(new Set(existing.presentStudentIds));
        } else {
          // Default to empty - teacher must manually mark attendance
          setPresentIds(new Set());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedClassId, date]);

  const togglePresence = (id: string) => {
    const newSet = new Set(presentIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setPresentIds(newSet);
  };

  const handleSave = async () => {
    if (!selectedClassId) return;

    // Check if date is valid for attendance
    // After term reset, check if we're past nextTermBegins
    const vacationDate = schoolConfig?.vacationDate;
    const nextTermBegins = schoolConfig?.nextTermBegins;
    const schoolReopenDate = schoolConfig?.schoolReopenDate;
    
    // If nextTermBegins is set and we're at or past that date, allow attendance
    if (nextTermBegins && date >= nextTermBegins) {
      // Attendance allowed - new term has started
    } else if (vacationDate && date > vacationDate) {
      // Block if date is after vacation date
      setMessage('Cannot mark attendance after school vacation date');
      setTimeout(() => setMessage(''), 3000);
      return;
    } else if (!vacationDate && schoolReopenDate && date < schoolReopenDate) {
      // Block if no vacationDate but schoolReopenDate is set and date is before it
      setMessage(`Cannot mark attendance before school re-open date (${schoolReopenDate})`);
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setLoading(true);
    try {
      await db.saveAttendance({
        id: `${selectedClassId}_${date}`,
        classId: selectedClassId,
        date,
        presentStudentIds: Array.from(presentIds)
      });

      // Notification logic
      const className = CLASSES_LIST.find(c => c.id === selectedClassId)?.name || selectedClassId;
      await db.addSystemNotification(
          `${user?.name} marked attendance for ${className} on ${date}. (${presentIds.size} Present)`,
          'attendance'
      );

      setMessage('Attendance saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (assignedClassIds.length === 0) {
    return (
      <Layout title="Attendance">
        <div className="p-8 text-center text-slate-500">
          You are not assigned to any class. Contact Admin.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Mark Attendance">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 max-w-4xl mx-auto">
        
        {/* Header Controls */}
        <div className="flex flex-col gap-6 mb-6">
            
            {/* Top Row: Class & Date Selection */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
                 {/* Class Selector */}
                 <div className="w-full sm:w-auto">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Select Class</label>
                    <select 
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        className="w-full sm:w-48 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-black"
                    >
                        {assignedClassIds.map(id => {
                            const c = CLASSES_LIST.find(cl => cl.id === id);
                            return <option key={id} value={id}>{c?.name}</option>
                        })}
                    </select>
                </div>

                {/* Date Selector */}
                <div className="w-full sm:w-auto">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Select Date</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            min={getMinDate()}
                            className="w-full sm:w-auto pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                    </div>
                </div>
            </div>
          
            {/* Stats & Save Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-50">
                <div className="text-sm">
                <span className="font-bold text-emerald-600 text-lg mr-1">{presentIds.size}</span> Present 
                <span className="mx-2 text-slate-300">|</span> 
                <span className="font-bold text-red-500 text-lg mr-1">{students.length - presentIds.size}</span> Absent
                </div>
                <button 
                onClick={handleSave}
                disabled={loading || !selectedClassId || isDateBlocked()}
                className="w-full sm:w-auto flex justify-center items-center bg-emerald-600 text-white px-6 py-2.5 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 font-medium shadow-sm"
                >
                <Save size={18} className="mr-2" />
                {loading ? 'Saving...' : 'Save Register'}
                </button>
            </div>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded text-center text-sm ${message.includes('Cannot') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {message}
          </div>
        )}

        {(isDateBlocked()) && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle size={18} />
              <span className="font-medium">
                {schoolConfig?.nextTermBegins && date >= schoolConfig.nextTermBegins
                  ? 'Attendance not available for selected date'
                  : schoolConfig?.vacationDate && date > schoolConfig.vacationDate 
                    ? `Cannot mark attendance after vacation date (${schoolConfig.vacationDate})`
                    : !schoolConfig?.vacationDate && schoolConfig?.schoolReopenDate && date < schoolConfig.schoolReopenDate
                      ? `Cannot mark attendance before school re-open date (${schoolConfig.schoolReopenDate})`
                      : 'Attendance not available for selected date'}
              </span>
            </div>
          </div>
        )}

        {/* List */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          {students.map((student) => {
            const isPresent = presentIds.has(student.id);
            const isBlocked = isDateBlocked();
            return (
              <div 
                key={student.id} 
                className={`flex items-center justify-between p-4 border-b last:border-b-0 cursor-pointer transition-colors ${isPresent ? 'bg-white' : 'bg-red-50'} ${isBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => !isBlocked && togglePresence(student.id)}
              >
                <div className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mr-4 ${isPresent ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-600'}`}>
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <p className={`font-medium ${isPresent ? 'text-slate-800' : 'text-red-700'}`}>{student.name}</p>
                    <p className="text-xs text-slate-400">{student.gender}</p>
                  </div>
                </div>
                
                <div className={`px-3 py-1 rounded-full text-xs font-bold border ${isPresent ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                  {isPresent ? 'PRESENT' : 'ABSENT'}
                </div>
              </div>
            );
          })}
          
          {students.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              {selectedClassId ? 'No students found in this class.' : 'Select a class to view students.'}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Attendance;
