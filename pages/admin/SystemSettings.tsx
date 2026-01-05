import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { showToast } from '../../services/toast';
import { db } from '../../services/mockDb';
import { Notice } from '../../types';
import { Plus, Trash2, Megaphone, Book, Edit, Check, X, Save, Calendar, AlertTriangle } from 'lucide-react';
import { collection, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { firestore } from '../../services/firebase';

const SystemSettings = () => {
  // Notices State
  const [notices, setNotices] = useState<Notice[]>([]);
  const [newNotice, setNewNotice] = useState('');
  const [noticeDate, setNoticeDate] = useState(new Date().toISOString().split('T')[0]); // Default to today
  const [noticeType, setNoticeType] = useState<'info'|'urgent'>('info');
  const [isAddingNotice, setIsAddingNotice] = useState(false);

  // Subjects State
  const [subjects, setSubjects] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [editingSubject, setEditingSubject] = useState<{original: string, current: string} | null>(null);

  // Config State
  const [config, setConfig] = useState({
      schoolName: '',
      academicYear: '',
      currentTerm: '',
      schoolReopenDate: ''
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Danger Zone State
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteSubjectModal, setShowDeleteSubjectModal] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<string | null>(null);

  const fetchNotices = async () => {
    const data = await db.getNotices();
    setNotices(data);
  };

  const fetchSubjects = async () => {
    const data = await db.getSubjects();
    setSubjects(data);
  };

  const fetchConfig = async () => {
      const data = await db.getSchoolConfig();
      setConfig(data);
  };

  useEffect(() => {
    fetchNotices();
    fetchSubjects();
    fetchConfig();
  }, []);

  // --- Config Handlers ---
  const handleSaveConfig = async () => {
      setSavingConfig(true);
      await db.updateSchoolConfig(config);
      setSavingConfig(false);
      showToast('Configuration saved successfully!', { type: 'success' });
  };

  // --- Notices Handlers ---
  const handleAddNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!newNotice.trim() || !noticeDate) return;

    setIsAddingNotice(true);
    try {
      // Create date object from YYYY-MM-DD string safely
      const [year, month, day] = noticeDate.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      const formattedDate = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

      await db.addNotice({
          id: Math.random().toString(36).substr(2, 9),
          message: newNotice,
          date: formattedDate,
          type: noticeType
      });
      setNewNotice('');
      // Keep the date as is or reset to today - typically easier to keep it if adding multiple for same day,
      // but resetting prevents accidental wrong dates. Let's keep it.
      fetchNotices();
      showToast('Notice added successfully!', { type: 'success' });
    } catch (error) {
      console.error('Error adding notice:', error);
      showToast('Failed to add notice. Please try again.', { type: 'error' });
    } finally {
      setIsAddingNotice(false);
    }
  };

  const handleDeleteNotice = async (id: string) => {
    await db.deleteNotice(id);
    fetchNotices();
  };

  // --- Subjects Handlers ---
  const handleAddSubject = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!newSubject.trim()) return;
      await db.addSubject(newSubject.trim());
      setNewSubject('');
      fetchSubjects();
  };

  const handleDeleteSubject = (name: string) => {
      setSubjectToDelete(name);
      setShowDeleteSubjectModal(true);
  };

  const confirmDeleteSubject = async () => {
      if (!subjectToDelete) return;
      setShowDeleteSubjectModal(false);
      try {
          await db.deleteSubject(subjectToDelete);
          fetchSubjects();
          showToast(`Subject "${subjectToDelete}" deleted successfully!`, { type: 'success' });
      } catch (error) {
          console.error('Error deleting subject:', error);
          showToast('Failed to delete subject. Please try again.', { type: 'error' });
      } finally {
          setSubjectToDelete(null);
      }
  };

  const startEditSubject = (name: string) => {
      setEditingSubject({ original: name, current: name });
  };

  const saveEditSubject = async () => {
      if(!editingSubject || !editingSubject.current.trim()) return;
      await db.updateSubject(editingSubject.original, editingSubject.current.trim());
      setEditingSubject(null);
      fetchSubjects();
  };

  // --- Danger Zone Handler ---
  const handleResetAllData = () => {
      setShowResetModal(true);
  };

  const confirmReset = async () => {
      setShowResetModal(false);
      setResetting(true);
      try {
          const collections = [
              'users',
              'students',
              'attendance',
              'assessments',
              'notices',
              'admin_notifications',
              'teacher_attendance',
              'timetables'
          ];
          for (const colName of collections) {
              const snap = await getDocs(collection(firestore, colName));
              const deleteOps = snap.docs.map(d => deleteDoc(doc(firestore, colName, d.id)));
              await Promise.all(deleteOps);
          }
          // Reset settings
          await setDoc(doc(firestore, 'settings', 'subjects'), {
              list: ['Mathematics', 'English', 'Science', 'Social Studies', 'Religious Education', 'Information Technology']
          });
          await setDoc(doc(firestore, 'settings', 'schoolConfig'), {
              schoolName: 'Noble Care Academy',
              academicYear: '2024-2025',
              currentTerm: 'Term 1'
          });
          // Create default admin
          await setDoc(doc(firestore, 'users', 'admin'), {
              id: 'admin',
              name: 'Administrator',
              email: 'admin@noblecare.edu',
              role: 'ADMIN'
          });
          showToast('Database reset to defaults completed successfully!', { type: 'success' });
          // Reload the page
          window.location.reload();
      } catch (error) {
          console.error('Reset error:', error);
          showToast('Error during reset. Check console for details.', { type: 'error' });
      } finally {
          setResetting(false);
      }
  };

  return (
    <Layout title="System Settings">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           
          {/* Left Column */}
          <div className="space-y-8">
            {/* General Config */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800">General Configuration</h2>
                    <button 
                        onClick={handleSaveConfig}
                        disabled={savingConfig}
                        className="flex items-center text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Save size={14} className="mr-1"/> {savingConfig ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
                
                <div className="space-y-6">
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Academic Year</label>
                            <input 
                                type="text" 
                                value={config.academicYear} 
                                onChange={(e) => setConfig({...config, academicYear: e.target.value})}
                                className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none" 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Current Term</label>
                            <select 
                                value={config.currentTerm}
                                onChange={(e) => setConfig({...config, currentTerm: e.target.value})}
                                className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                            >
                                <option value="Term 1">Term 1</option>
                                <option value="Term 2">Term 2</option>
                                <option value="Term 3">Term 3</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-100">
                        <h3 className="font-medium text-slate-800 mb-2">School Information</h3>
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">School Name</label>
                                <input 
                                    type="text" 
                                    value={config.schoolName} 
                                    onChange={(e) => setConfig({...config, schoolName: e.target.value})}
                                    className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">School Re-open Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none"/>
                                    <input 
                                        type="date"
                                        value={config.schoolReopenDate} 
                                        onChange={(e) => setConfig({...config, schoolReopenDate: e.target.value})}
                                        className="w-full border border-slate-300 pl-10 pr-3 py-2 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none" 
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Next Term Begins</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none"/>
                                    <input
                                        type="date"
                                        value={config.nextTermBegins || ''}
                                        onChange={(e) => setConfig({...config, nextTermBegins: e.target.value})}
                                        className="w-full border border-slate-300 pl-10 pr-3 py-2 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Subject Management */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center">
                    <Book className="mr-2 text-blue-600" size={24} /> 
                    Manage Subjects
                </h2>
                
                <form onSubmit={handleAddSubject} className="flex gap-2 mb-6">
                    <input 
                        type="text" 
                        required
                        className="flex-1 border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="New subject name..."
                        value={newSubject}
                        onChange={e => setNewSubject(e.target.value)}
                    />
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                        <Plus size={20} />
                    </button>
                </form>

                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {subjects.map(subject => (
                        <div key={subject} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 group">
                            {editingSubject?.original === subject ? (
                                <div className="flex items-center flex-1 gap-2">
                                    <input 
                                        type="text" 
                                        className="flex-1 border border-slate-300 p-1 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editingSubject.current}
                                        onChange={e => setEditingSubject({...editingSubject, current: e.target.value})}
                                        autoFocus
                                    />
                                    <button onClick={saveEditSubject} className="text-emerald-600 hover:bg-emerald-50 p-1 rounded"><Check size={16}/></button>
                                    <button onClick={() => setEditingSubject(null)} className="text-red-500 hover:bg-red-50 p-1 rounded"><X size={16}/></button>
                                </div>
                            ) : (
                                <>
                                    <span className="text-sm font-medium text-slate-700">{subject}</span>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => startEditSubject(subject)} className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-md transition-colors">
                                            <Edit size={14} />
                                        </button>
                                        <button onClick={() => handleDeleteSubject(subject)} className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-md transition-colors">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Secret Database Reset */}
            {showDangerZone && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                <div className="flex items-center mb-4">
                  <AlertTriangle className="text-red-600 mr-2" size={24} />
                  <h2 className="text-xl font-bold text-red-800">Danger Zone: Database Reset</h2>
                </div>
                <p className="text-red-700 mb-4">
                  This action will permanently delete all data and reset the system to its default state. Use with extreme caution.
                </p>
                <button
                  onClick={handleResetAllData}
                  disabled={resetting}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors"
                >
                  {resetting ? 'Resetting...' : 'Reset All Data'}
                </button>
              </div>
            )}

            <div className="text-center mt-4">
              <button
                onClick={() => setShowDangerZone(!showDangerZone)}
                className="text-slate-500 text-sm underline hover:text-slate-700"
              >
                {showDangerZone ? 'Hide' : 'Show'} Advanced Settings
              </button>
            </div>
          </div>

          {/* Right Column: Notices Management */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex flex-col h-full">
            <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center">
                <Megaphone className="mr-2 text-emerald-600" size={24} /> 
                School Notices
            </h2>
            
            <form onSubmit={handleAddNotice} className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="mb-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
                        <input 
                            type="date"
                            required
                            className="w-full border border-slate-300 pl-10 pr-3 py-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                            value={noticeDate}
                            onChange={(e) => setNoticeDate(e.target.value)}
                        />
                    </div>
                </div>
                <div className="mb-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notice Message</label>
                    <textarea 
                        required
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                        placeholder="Type notice here..."
                        rows={2}
                        value={newNotice}
                        onChange={(e) => setNewNotice(e.target.value)}
                    />
                </div>
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                         <label className="flex items-center text-sm cursor-pointer">
                            <input 
                                type="radio" 
                                name="type" 
                                className="mr-2 text-emerald-600 focus:ring-emerald-500"
                                checked={noticeType === 'info'}
                                onChange={() => setNoticeType('info')}
                            />
                            Info
                         </label>
                         <label className="flex items-center text-sm cursor-pointer">
                            <input 
                                type="radio" 
                                name="type" 
                                className="mr-2 text-blue-600 focus:ring-blue-500"
                                checked={noticeType === 'urgent'}
                                onChange={() => setNoticeType('urgent')}
                            />
                            Urgent
                         </label>
                    </div>
                    <button
                        type="submit"
                        disabled={isAddingNotice}
                        className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isAddingNotice ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-1"></div>
                            Saving...
                          </>
                        ) : (
                          <>
                            <Plus size={16} className="mr-1"/> Add Notice
                          </>
                        )}
                    </button>
                </div>
            </form>

            <div className="flex-1 overflow-y-auto pr-1">
                <h3 className="text-sm font-bold text-slate-500 uppercase mb-3">Active Notices</h3>
                <div className="space-y-3">
                    {notices.length === 0 ? (
                        <p className="text-slate-400 text-sm text-center italic">No notices posted.</p>
                    ) : (
                        notices.map(notice => (
                            <div key={notice.id} className="flex justify-between items-start group p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                                <div className={`border-l-2 pl-3 ${notice.type === 'urgent' ? 'border-blue-500' : 'border-emerald-500'}`}>
                                    <p className="text-sm text-slate-800 font-medium">{notice.message}</p>
                                    <p className="text-xs text-slate-400 mt-1">{notice.date} • {notice.type === 'urgent' ? 'Urgent' : 'General Info'}</p>
                                </div>
                                <button 
                                    onClick={() => handleDeleteNotice(notice.id)}
                                    className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                    title="Delete Notice"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
          </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-30 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 transform transition-all duration-300 scale-100">
            <div className="flex items-center mb-4">
              <AlertTriangle className="text-red-600 mr-3" size={32} />
              <h2 className="text-xl font-bold text-slate-800">Confirm Database Reset</h2>
            </div>
            <p className="text-slate-600 mb-6">
              WARNING: This will permanently delete ALL data from the system and reset everything to default state. This action cannot be undone. Are you absolutely sure you want to proceed?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmReset}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Subject Confirmation Modal */}
      {showDeleteSubjectModal && subjectToDelete && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-30 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 transform transition-all duration-300 scale-100">
            <div className="flex items-center mb-4">
              <AlertTriangle className="text-red-600 mr-3" size={32} />
              <h2 className="text-xl font-bold text-slate-800">Delete Subject</h2>
            </div>
            <p className="text-slate-600 mb-6">
              Are you sure you want to delete the subject "<strong>{subjectToDelete}</strong>"? This might hide scores associated with this subject and cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteSubjectModal(false);
                  setSubjectToDelete(null);
                }}
                className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteSubject}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Subject
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
export default SystemSettings;