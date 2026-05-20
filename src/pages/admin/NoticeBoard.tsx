import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { Notice, NoticeAttachment, UserRole, UserProfile } from '../../types';
import { logActivity } from '../../services/activityService';
import { sanitizeFileName } from '../../services/lessonLogService';
import {
  Plus,
  Bell,
  Trash2,
  Clock,
  User,
  Megaphone,
  Paperclip,
  FileText,
  X,
  Download,
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
  const [files, setFiles] = useState<File[]>([]);

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

  const roles: UserRole[] = ['super_admin', 'teacher', 'student', 'parent', 'accounts', 'principal', 'grievance_officer'];

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
  const MAX_FILES = 5;
  // Must mirror isAllowedContentType() in storage.rules
  const ACCEPT_TYPES = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
  const isAllowedType = (type: string) =>
    type.startsWith('image/') ||
    type === 'application/pdf' ||
    type === 'application/msword' ||
    type.startsWith('application/vnd.openxmlformats-officedocument.') ||
    type === 'text/plain';

  const addFiles = (selected: FileList | null) => {
    if (!selected) return;
    const incoming = Array.from(selected);
    const tooBig = incoming.find(f => f.size > MAX_FILE_SIZE);
    if (tooBig) {
      handleFirestoreError(new Error(`"${tooBig.name}" exceeds the 10 MB limit.`), OperationType.CREATE, 'notices');
      return;
    }
    const badType = incoming.find(f => !isAllowedType(f.type));
    if (badType) {
      handleFirestoreError(new Error(`"${badType.name}" is not an allowed file type. Use images, PDF, Office docs, or text.`), OperationType.CREATE, 'notices');
      return;
    }
    setFiles(prev => [...prev, ...incoming].slice(0, MAX_FILES));
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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

  const sanitize = (text: string) => text.replace(/<[^>]*>/g, '').trim();

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setLoading(true);
    try {
      const attachments: NoticeAttachment[] = [];
      for (const file of files) {
        const storagePath = `notices/${user.uid}/${Date.now()}_${sanitizeFileName(file.name)}`;
        const uploadResult = await uploadBytes(ref(storage, storagePath), file);
        const url = await getDownloadURL(uploadResult.ref);
        attachments.push({
          name: file.name,
          url,
          storagePath,
          type: file.type || 'application/octet-stream',
          size: file.size,
        });
      }

      await addDoc(collection(db, 'notices'), {
        ...formData,
        title: sanitize(formData.title),
        content: sanitize(formData.content),
        authorId: user.uid,
        authorName: user.name,
        createdAt: new Date().toISOString(),
        ...(attachments.length > 0 ? { attachments } : {}),
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
      setFiles([]);
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

      // Best-effort cleanup of attached storage files
      for (const att of notice?.attachments || []) {
        if (att.storagePath) {
          try { await deleteObject(ref(storage, att.storagePath)); } catch { /* ignore */ }
        }
      }

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
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">{isAdmin ? 'Admin Portal' : 'Notices'}</p>
          <h1 className="text-xl font-bold mt-0.5">Notice Board</h1>
          <p className="text-xs text-indigo-100 mt-0.5">{notices.length} active announcement{notices.length === 1 ? '' : 's'}</p>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search notices..."
            className="mt-3 w-full px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-sm text-white placeholder:text-white/60 focus:outline-none focus:bg-white/20"
          />
        </div>

        {isAdmin && (
          <div className="px-4 pt-3 overflow-x-auto flex gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setFilterRole('all')}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition-transform",
                filterRole === 'all' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
              )}
            >
              All
            </button>
            {roles.map(role => (
              <button
                key={role}
                onClick={() => setFilterRole(role)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition-transform capitalize",
                  filterRole === role ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                )}
              >
                {role.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}

        <div className="px-4 pt-4 space-y-2.5">
          {filteredNotices.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No notices</p>
            </div>
          ) : (
            filteredNotices.map((notice) => (
              <div key={notice.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 relative overflow-hidden">
                <div className={cn(
                  'absolute left-0 top-0 bottom-0 w-1',
                  notice.priority === 'high' ? 'bg-red-500' :
                  notice.priority === 'medium' ? 'bg-amber-500' : 'bg-sky-500'
                )} />
                <div className="pl-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-2">{notice.title}</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{notice.content}</p>
                    </div>
                    <Badge variant={priorityVariant(notice.priority)} className="text-[9px] shrink-0 capitalize">{notice.priority}</Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{notice.authorName}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(notice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                  </div>
                  {notice.targetRoles && notice.targetRoles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {notice.targetRoles.map(role => (
                        <span key={role} className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md capitalize">
                          {role.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                  {notice.attachments && notice.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {notice.attachments.map((att, i) => (
                        <a
                          key={i}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg active:scale-95 transition-transform"
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="truncate flex-1">{att.name}</span>
                          <Download className="w-3 h-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                  {canWrite && (
                    <button
                      onClick={() => handleDeleteNotice(notice.id)}
                      className="mt-2 text-[11px] text-red-600 font-bold flex items-center gap-1 active:scale-95 transition-transform"
                    >
                      <Trash2 className="w-3 h-3" />Delete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {canWrite && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
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
                    {new Date(notice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">{notice.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">{notice.content}</p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {notice.targetRoles.map(role => (
                    <Badge key={role} variant="default">
                      {role.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>

                {notice.attachments && notice.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {notice.attachments.map((att, i) => (
                      <a
                        key={i}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[200px]">{att.name}</span>
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    ))}
                  </div>
                )}
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
        onClose={() => { setIsModalOpen(false); setFiles([]); }}
        title="Post New Notice"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => { setIsModalOpen(false); setFiles([]); }}>Cancel</Button>
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

          <FormField label="Attachments (Optional)">
            <div className="space-y-2">
              <label className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-slate-50 transition-all text-sm font-semibold text-slate-500">
                <Paperclip className="w-4 h-4" />
                {files.length >= MAX_FILES ? `Max ${MAX_FILES} files reached` : 'Click to attach files'}
                <input
                  type="file"
                  multiple
                  accept={ACCEPT_TYPES}
                  className="hidden"
                  disabled={files.length >= MAX_FILES}
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                />
              </label>
              <p className="text-[11px] text-slate-400">Up to {MAX_FILES} files, 10 MB each.</p>
              {files.length > 0 && (
                <div className="space-y-1.5">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded-lg">
                      <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="text-xs font-semibold text-slate-700 truncate flex-1">{file.name}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{formatSize(file.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-slate-400 hover:text-red-600 transition-colors shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FormField>
        </form>
      </Modal>
    </>
  );
}
