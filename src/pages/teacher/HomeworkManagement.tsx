import { UserProfile, Teacher, Homework } from '../../types';
import { Plus, Search, Filter, CheckSquare, Clock, AlertCircle, FileText, Download, Upload, MoreVertical, Trash2, Edit2, X, TrendingUp, BookOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';

interface HomeworkManagementProps {
  user: UserProfile;
}

export default function HomeworkManagement({ user }: HomeworkManagementProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [homework, setHomework] = useState<Homework[]>([]);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    classId: '',
    subjectId: '',
    dueDate: '',
    content: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Teacher Profile
        const teacherDoc = await getDoc(doc(db, 'teachers', user.uid));
        if (teacherDoc.exists()) {
          const tData = { id: teacherDoc.id, ...teacherDoc.data() } as Teacher;
          setTeacherData(tData);
          setFormData(prev => ({
            ...prev,
            classId: tData.classes?.[0] || '',
            subjectId: tData.subjects?.[0] || ''
          }));
        }

        // Fetch Homework
        const homeworkSnap = await getDocs(query(
          collection(db, 'homework'),
          where('teacherId', '==', user.uid),
          orderBy('dueDate', 'desc')
        ));
        setHomework(homeworkSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Homework)));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'homework');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'homework'), {
        ...formData,
        teacherId: user.uid,
        submissions: [],
        createdAt: serverTimestamp()
      });
      
      const newHw = { 
        id: docRef.id, 
        ...formData, 
        teacherId: user.uid, 
        submissions: [] 
      } as Homework;
      
      setHomework(prev => [newHw, ...prev]);
      setIsModalOpen(false);
      setFormData({
        title: '',
        classId: teacherData?.classes?.[0] || '',
        subjectId: teacherData?.subjects?.[0] || '',
        dueDate: '',
        content: ''
      });
      showToast('Homework assigned successfully!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'homework');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredHomework = homework.filter(hw => 
    hw.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    hw.classId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    hw.subjectId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    active: homework.filter(hw => new Date(hw.dueDate) >= new Date()).length,
    completed: homework.filter(hw => new Date(hw.dueDate) < new Date()).length,
    totalSubmissions: homework.reduce((acc, hw) => acc + (hw.submissions?.length || 0), 0)
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Homework Management</h1>
          <p className="text-gray-500 text-sm">Assign and track homework for your classes.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Assign Homework
        </button>
      </div>

      {/* Homework Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Active Homework', value: stats.active, count: `${teacherData?.classes?.length || 0} Classes`, color: 'blue', icon: BookOpen },
          { label: 'Total Submissions', value: stats.totalSubmissions, count: 'Across all tasks', color: 'emerald', icon: CheckSquare },
          { label: 'Completed Tasks', value: stats.completed, count: 'Past due date', color: 'indigo', icon: TrendingUp },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              stat.color === 'blue' && "bg-blue-50 text-blue-600",
              stat.color === 'emerald' && "bg-emerald-50 text-emerald-600",
              stat.color === 'red' && "bg-red-50 text-red-600",
              stat.color === 'indigo' && "bg-indigo-50 text-indigo-600",
            )}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-[10px] text-gray-500 font-medium">{stat.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Homework List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by content, class or subject..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 transition-all"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                <th className="px-6 py-4">Homework Content</th>
                <th className="px-6 py-4">Class & Subject</th>
                <th className="px-6 py-4">Due Date</th>
                <th className="px-6 py-4">Submissions</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredHomework.map((hw, i) => (
                <tr key={hw.id} className="group hover:bg-gray-50 transition-all">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-xs">
                        {hw.subjectId.charAt(0)}
                      </div>
                      <span className="text-sm font-bold text-gray-900 line-clamp-1">{hw.content}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{hw.classId} • {hw.subjectId}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{new Date(hw.dueDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">{hw.submissions?.length || 0}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      new Date(hw.dueDate) >= new Date() ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600",
                    )}>
                      {new Date(hw.dueDate) >= new Date() ? 'active' : 'completed'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredHomework.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500 italic">
                    {loading ? 'Loading homework...' : 'No homework assignments found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                    <Plus className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Assign Homework</h2>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select 
                      value={formData.classId}
                      onChange={(e) => setFormData({...formData, classId: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none"
                    >
                      {teacherData?.classes?.map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <select 
                      value={formData.subjectId}
                      onChange={(e) => setFormData({...formData, subjectId: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none"
                    >
                      {teacherData?.subjects?.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input 
                    type="date" required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Instructions / Content</label>
                  <textarea 
                    rows={3} required
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-600/20 outline-none resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-4 pt-6 border-t">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={submitting}
                    className="px-8 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                  >
                    {submitting ? 'Assigning...' : 'Assign'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

