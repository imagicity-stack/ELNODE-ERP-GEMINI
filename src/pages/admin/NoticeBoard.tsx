import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, Timestamp, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Notice, UserRole, UserProfile } from '../../types';
import { 
  Plus, 
  Bell, 
  Trash2, 
  Clock, 
  User, 
  AlertCircle, 
  X, 
  Search, 
  Filter,
  Megaphone,
  Calendar,
  ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface NoticeBoardProps {
  user: UserProfile;
}

export default function NoticeBoard({ user }: NoticeBoardProps) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');

  const isAdmin = user.role === 'super_admin' || user.role === 'principal';

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    targetRoles: [] as UserRole[],
    expiresAt: '',
  });

  const roles: UserRole[] = ['super_admin', 'teacher', 'student', 'parent', 'accounts', 'principal'];

  useEffect(() => {
    fetchNotices();
  }, []);

  const fetchNotices = async () => {
    try {
      let q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
      
      // If not admin, only show notices targeted to their role
      if (!isAdmin) {
        q = query(
          collection(db, 'notices'), 
          where('targetRoles', 'array-contains', user.role),
          orderBy('createdAt', 'desc')
        );
      }

      const querySnapshot = await getDocs(q);
      setNotices(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'notices');
    }
  };

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'notices'), {
        ...formData,
        authorId: user.uid,
        authorName: user.name,
        createdAt: new Date().toISOString(),
      });
      setIsModalOpen(false);
      fetchNotices();
      setFormData({ title: '', content: '', priority: 'medium', targetRoles: [], expiresAt: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notices');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNotice = (id: string) => {
    if (!isAdmin) return;
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  };

  const performDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'notices', deletingId));
      fetchNotices();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notices/${deletingId}`);
    }
  };

  const filteredNotices = notices.filter(notice => {
    const matchesSearch = notice.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         notice.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || notice.targetRoles.includes(filterRole as UserRole);
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notice Board</h1>
          <p className="text-gray-500 text-sm">
            {isAdmin ? 'Manage school-wide announcements and communications.' : 'Stay updated with the latest school announcements.'}
          </p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Post New Notice
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search notices..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20 transition-all"
          />
        </div>
        {isAdmin && (
          <select 
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as any)}
            className="px-4 py-2 bg-gray-50 border-none rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20 transition-all font-medium text-gray-600"
          >
            <option value="all">All Audiences</option>
            {roles.map(role => (
              <option key={role} value={role}>{role.replace('_', ' ').toUpperCase()}</option>
            ))}
          </select>
        )}
      </div>

      {/* Notice List */}
      <div className="grid grid-cols-1 gap-6">
        {filteredNotices.map((notice) => (
          <motion.div 
            key={notice.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
          >
            <div className={cn(
              "absolute left-0 top-0 bottom-0 w-1.5",
              notice.priority === 'high' ? "bg-red-500" :
              notice.priority === 'medium' ? "bg-amber-500" : "bg-blue-500"
            )} />
            
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    notice.priority === 'high' ? "bg-red-50 text-red-600" :
                    notice.priority === 'medium' ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                  )}>
                    {notice.priority} Priority
                  </span>
                  <div className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                    <Clock className="w-3 h-3" />
                    {new Date(notice.createdAt).toLocaleDateString()}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition-all">{notice.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">{notice.content}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {notice.targetRoles.map(role => (
                    <span key={role} className="px-2 py-1 bg-gray-100 text-gray-500 rounded-lg text-[10px] font-bold uppercase">
                      {role.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-end gap-4">
                <div className="flex items-center gap-2 text-xs text-gray-400 font-medium bg-gray-50 px-3 py-1.5 rounded-lg">
                  <User className="w-3 h-3" />
                  {notice.authorName}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleDeleteNotice(notice.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* New Notice Modal */}
      {/* Modals */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden relative z-10 p-8 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-600 mx-auto mb-6">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2">Delete Notice?</h3>
              <p className="text-gray-500 mb-8">This action cannot be undone. This notice will be removed from the board.</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={performDelete}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative z-10"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Post New Notice</h2>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <form onSubmit={handleCreateNotice} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Title</label>
                      <input 
                        type="text" required
                        value={formData.title}
                        onChange={(e) => setFormData({...formData, title: e.target.value})}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                        placeholder="e.g. School Reopening Date"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Priority</label>
                      <div className="flex gap-2">
                        {['low', 'medium', 'high'].map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setFormData({...formData, priority: p as any})}
                            className={cn(
                              "flex-1 py-2 rounded-xl text-xs font-bold border transition-all capitalize",
                              formData.priority === p 
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20" 
                                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Expiry Date (Optional)</label>
                      <input 
                        type="date"
                        value={formData.expiresAt}
                        onChange={(e) => setFormData({...formData, expiresAt: e.target.value})}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Target Audience</label>
                    <div className="grid grid-cols-1 gap-2 mt-2">
                      {roles.map(role => (
                        <label key={role} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50 transition-all group">
                          <input 
                            type="checkbox"
                            checked={formData.targetRoles.includes(role)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({...formData, targetRoles: [...formData.targetRoles, role]});
                              } else {
                                setFormData({...formData, targetRoles: formData.targetRoles.filter(r => r !== role)});
                              }
                            }}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-600/20 transition-all"
                          />
                          <span className="text-xs font-bold text-gray-600 group-hover:text-indigo-600 transition-all uppercase tracking-wider">
                            {role.replace('_', ' ')}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Notice Content</label>
                  <textarea 
                    required
                    rows={4}
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all resize-none"
                    placeholder="Write the details of the announcement here..."
                  />
                </div>

                <div className="flex items-center justify-end gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Posting...' : 'Post Notice'}
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
