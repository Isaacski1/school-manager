import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { showToast } from '../../services/toast';
import { db } from '../../services/mockDb';
import { Notice } from '../../types';
import { Plus, Trash2, Megaphone, Book, Edit, Check, X, Save, Calendar } from 'lucide-react';

const SystemSettings = () => {
  // Notices State
  const [notices, setNotices] = useState<Notice[]>([]);
  const [newNotice, setNewNotice] = useState('');
  const [noticeDate, setNoticeDate] = useState(new Date().toISOString().split('T')[0]); // Default to today
  const [noticeType, setNoticeType] = useState<'info'|'urgent'>('info');

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

  const handleDeleteSubject = async (name: string) => {
      if(window.confirm(`Are you sure you want to delete "${name}"? This might hide scores associated with this subject.`)) {
          await db.deleteSubject(name);
          fetchSubjects();
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
                        className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center"
                    >
                        <Plus size={16} className="mr-1"/> Add Notice
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
    </Layout>
  );
};
export default SystemSettings;