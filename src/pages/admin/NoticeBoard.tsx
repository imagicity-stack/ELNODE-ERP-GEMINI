import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Notice, UserRole, UserProfile } from '../../types';
import { logActivity } from '../../services/activityService';
import DOMPurify from 'dompurify';
import {
  Plus,
  Bell,
  Trash2,
  Clock,
  User,
  Megaphone,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  PageHeader, Card, Badge, Button, IconButton, Modal, ConfirmModal,
  SearchInput, FormField, Input, Select, Textarea, EmptyState
} from '../../components/ui';
import { usePermissions } from '../../hooks/usePermissions';

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

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('notices');

  const isAdmin = user.role === 'super_admin' || user.role === 'principal';
  const canWrite = user.role === 'super_admin' || (user.role === 'principal' && !readOnly);

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
      
      await logActivity(
        user,
        'POST_NOTICE',
        'Academic',
        `Posted notice: ${formData.title} for ${formData.targetRoles.join(', ')}`
      );

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
      const notice = notices.find(n => n.id === deletingId);
      await deleteDoc(doc(db, 'notices', deletingId));
      
      await logActivity(
        user,
        'DELETE_NOTICE',
        'Super Admin',
        `Deleted notice: ${notice?.title || deletingId}`
      );

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

  const priorityVariant = (priority: string): 'error' | 'warning' | 'info' => {
    if (priority === 'high') return 'error';
    if (priority === 'medium') return 'warning';
    return 'info';
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Notice Board"
        subtitle={isAdmin ? 'Manage school-wide announcements and communications.' : 'Stay updated with the latest school announcements.'}
        icon={Bell}
        iconColor="gradient-amber"
        actions={
          canWrite ? (
            <Button icon={Plus} onClick={() => setIsModalOpen(true)}>
              Post New Notice
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search notices..."
            className="flex-1"
          />
          {isAdmin && (
            <Select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as any)}
              className="sm:w-48"
            >
              <option value="all">All Audiences</option>
              {roles.map(role => (
                <option key={role} value={role}>{role.replace('_', ' ').toUpperCase()}</option>
              ))}
            </Select>
          )}
        </div>
      </Card>

      {/* Notice List */}
      <div className="space-y-4">
        {filteredNotices.map((notice) => (
          <Card key={notice.id} className="relative overflow-hidden">
            <div className={cn(
              'absolute left-0 top-0 bottom-0 w-1',
              notice.priority === 'high' ? 'bg-red-500' :
              notice.priority === 'medium' ? 'bg-amber-500' : 'bg-sky-500'
            )} />
            <div className="pl-3 flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={priorityVariant(notice.priority)}>
                    {notice.priority} Priority
                  </Badge>
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    {new Date(notice.createdAt).toLocaleDateString()}
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">{notice.title}</h3>
                  <div 
                    className="text-sm text-slate-600 leading-relaxed max-w-3xl prose prose-slate prose-sm"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notice.content) }}
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {notice.targetRoles.map(role => (
                    <Badge key={role} variant="default">
                      {role.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-end gap-3 shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg">
                  <User className="w-3 h-3" />
                  {notice.authorName}
                </div>
                {canWrite && (
                  <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => handleDeleteNotice(notice.id)} />
                )}
              </div>
            </div>
          </Card>
        ))}

        {filteredNotices.length === 0 && (
          <Card>
            <EmptyState
              icon={Bell}
              title="No notices found"
              description={searchTerm ? 'Try a different search term.' : 'Post the first notice to the board.'}
              action={
                isAdmin && !searchTerm ? (
                  <Button icon={Plus} size="sm" onClick={() => setIsModalOpen(true)}>
                    Post Notice
                  </Button>
                ) : undefined
              }
            />
          </Card>
        )}
      </div>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={performDelete}
        title="Delete Notice?"
        message="This action cannot be undone. This notice will be removed from the board."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Post New Notice"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button form="notice-form" type="submit" loading={loading} icon={Megaphone}>
              Post Notice
            </Button>
          </div>
        }
      >
        <form id="notice-form" onSubmit={handleCreateNotice} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <FormField label="Title" required>
                <Input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. School Reopening Date"
                />
              </FormField>
              <FormField label="Priority" required>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormData({ ...formData, priority: p })}
                      className={cn(
                        'flex-1 py-2 rounded-xl text-xs font-bold border transition-all capitalize',
                        formData.priority === p
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Expiry Date (Optional)">
                <Input
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                />
              </FormField>
            </div>

            <div>
              <FormField label="Target Audience">
                <div className="space-y-1.5 mt-1">
                  {roles.map(role => (
                    <label key={role} className="flex items-center gap-3 p-2.5 border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-all">
                      <input
                        type="checkbox"
                        checked={formData.targetRoles.includes(role)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, targetRoles: [...formData.targetRoles, role] });
                          } else {
                            setFormData({ ...formData, targetRoles: formData.targetRoles.filter(r => r !== role) });
                          }
                        }}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-600/20"
                      />
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        {role.replace('_', ' ')}
                      </span>
                    </label>
                  ))}
                </div>
              </FormField>
            </div>
          </div>

          <FormField label="Notice Content" required>
            <Textarea
              required
              rows={4}
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Write the details of the announcement here..."
            />
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
