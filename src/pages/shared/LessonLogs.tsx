import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { UserProfile, LessonLog, Student } from '../../types';
import {
  BookOpen, Calendar as CalendarIcon, Search, Download, FileText,
  Clock, ChevronRight, Paperclip, Edit2, Trash2, AlertTriangle,
  History, User as UserIcon, RotateCw, Filter, X,
} from 'lucide-react';
import {
  collection, query, where, onSnapshot, orderBy, limit as fsLimit,
  startAfter, getDocs, QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useData } from '../../contexts/DataContext';
import {
  PageHeader, Card, Badge, Button, EmptyState, Spinner, Modal,
  FormField, Input, Textarea,
} from '../../components/ui';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import {
  updateLessonLog, deleteLessonLog, validateLessonInput,
  ConcurrentEditError,
} from '../../services/lessonLogService';

interface LessonLogsProps {
  user: UserProfile;
  student?: Student;
}

const PAGE_SIZE = 30;

export default function LessonLogs({ user, student }: LessonLogsProps) {
  const {
    classesMap: classes,
    subjectsMap: subjects,
    teachersMap: teachers,
    teacherData,
  } = useData();
  const [logs, setLogs] = useState<LessonLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LessonLog | null>(null);

  // Search & filters
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination (cursor-based)
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Edit/delete state
  const [editingLog, setEditingLog] = useState<LessonLog | null>(null);
  const [editForm, setEditForm] = useState({ topic: '', classwork: '', homework: '' });
  const [saving, setSaving] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<LessonLog | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { showToast } = useToast();

  const classTeacherId = teacherData?.classTeacherOf?.classId;

  // Build the base Firestore query for the current user's scope
  const buildScopedQuery = useCallback(() => {
    const base = collection(db, 'lessonLogs');
    if (student) {
      return query(base, where('classId', '==', student.classId), orderBy('date', 'desc'), orderBy('createdAt', 'desc'), fsLimit(PAGE_SIZE));
    }
    if (user.role === 'teacher') {
      const tid = user.teacherId || user.uid;
      if (classTeacherId) {
        return query(base, where('classId', '==', classTeacherId), orderBy('date', 'desc'), orderBy('createdAt', 'desc'), fsLimit(PAGE_SIZE));
      }
      return query(base, where('teacherId', '==', tid), orderBy('date', 'desc'), orderBy('createdAt', 'desc'), fsLimit(PAGE_SIZE));
    }
    // Admins / principal / super_admin: full view
    return query(base, orderBy('date', 'desc'), orderBy('createdAt', 'desc'), fsLimit(PAGE_SIZE));
  }, [student, user.role, user.teacherId, user.uid, classTeacherId]);

  // Real-time subscription to the first page; later pages are loaded with one-shot reads.
  useEffect(() => {
    setLoading(true);
    const q = buildScopedQuery();
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as LessonLog));
      setLogs(list);
      setCursor(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
      setLoading(false);
      // Keep the selected/editing log in sync if it's part of the live page
      setSelectedLog(prev => (prev ? list.find(l => l.id === prev.id) || prev : null));
    }, err => {
      handleFirestoreError(err, OperationType.LIST, 'lessonLogs');
      setLoading(false);
    });
    return unsub;
  }, [buildScopedQuery]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const base = collection(db, 'lessonLogs');
      let q;
      if (student) {
        q = query(base, where('classId', '==', student.classId), orderBy('date', 'desc'), orderBy('createdAt', 'desc'), startAfter(cursor), fsLimit(PAGE_SIZE));
      } else if (user.role === 'teacher') {
        const tid = user.teacherId || user.uid;
        q = classTeacherId
          ? query(base, where('classId', '==', classTeacherId), orderBy('date', 'desc'), orderBy('createdAt', 'desc'), startAfter(cursor), fsLimit(PAGE_SIZE))
          : query(base, where('teacherId', '==', tid), orderBy('date', 'desc'), orderBy('createdAt', 'desc'), startAfter(cursor), fsLimit(PAGE_SIZE));
      } else {
        q = query(base, orderBy('date', 'desc'), orderBy('createdAt', 'desc'), startAfter(cursor), fsLimit(PAGE_SIZE));
      }
      const snap = await getDocs(q);
      const more = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as LessonLog));
      setLogs(prev => [...prev, ...more]);
      setCursor(snap.docs[snap.docs.length - 1] || cursor);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'lessonLogs');
    } finally {
      setLoadingMore(false);
    }
  };

  // Client-side search + date filter on the loaded set
  const visibleLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(l => {
      if (dateFrom && l.date < dateFrom) return false;
      if (dateTo && l.date > dateTo) return false;
      if (!q) return true;
      return (
        l.topic?.toLowerCase().includes(q) ||
        l.classwork?.toLowerCase().includes(q) ||
        l.homework?.toLowerCase().includes(q) ||
        (subjects[l.subjectId] || '').toLowerCase().includes(q) ||
        (teachers[l.teacherId] || '').toLowerCase().includes(q)
      );
    });
  }, [logs, search, dateFrom, dateTo, subjects, teachers]);

  // Permission helpers
  const canEdit = (log: LessonLog) =>
    user.role === 'super_admin' || user.role === 'principal' || user.role === 'office_staff' ||
    (user.role === 'teacher' && log.teacherId === (user.teacherId || user.uid));
  const canDelete = canEdit;

  const handleDownload = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  };

  const openEdit = (log: LessonLog) => {
    setEditingLog(log);
    setEditForm({ topic: log.topic || '', classwork: log.classwork || '', homework: log.homework || '' });
    setSelectedLog(null);
  };

  const saveEdit = async () => {
    if (!editingLog || saving) return;
    const err = validateLessonInput(editForm);
    if (err) { showToast(err, 'error'); return; }
    setSaving(true);
    try {
      await updateLessonLog(
        editingLog.id,
        editingLog.version ?? 0,
        {
          topic: editForm.topic.trim(),
          classwork: editForm.classwork,
          homework: editForm.homework,
        },
        user,
      );
      logActivity(user, 'Edited Lesson Log', 'Teachers',
        `Edited diary entry for ${classes[editingLog.classId] || editingLog.classId} · ${editingLog.topic}`,
        { logId: editingLog.id, classId: editingLog.classId });
      showToast('Lesson log updated', 'success');
      setEditingLog(null);
    } catch (e: any) {
      if (e instanceof ConcurrentEditError) {
        showToast(e.message, 'error');
        setEditingLog(null); // Force user to view the fresh version
      } else {
        showToast(e?.message || 'Failed to update lesson log', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCandidate || deleting) return;
    setDeleting(true);
    try {
      await deleteLessonLog(deleteCandidate);
      logActivity(user, 'Deleted Lesson Log', 'Teachers',
        `Deleted diary entry for ${classes[deleteCandidate.classId] || deleteCandidate.classId} · ${deleteCandidate.topic}`,
        { logId: deleteCandidate.id, classId: deleteCandidate.classId });
      showToast('Lesson log deleted', 'success');
      setDeleteCandidate(null);
      setSelectedLog(null);
    } catch (e: any) {
      showToast(e?.message || 'Failed to delete', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => { setSearch(''); setDateFrom(''); setDateTo(''); };
  const hasActiveFilters = !!(search || dateFrom || dateTo);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Diary"
        subtitle={student ? `Classwork and Homework for ${student.name}` : 'Daily lesson logs across classes'}
        icon={BookOpen}
        iconColor="gradient-blue"
        actions={
          <button
            onClick={() => setShowFilters(s => !s)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && <span className="px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold">on</span>}
          </button>
        }
      />

      {/* Search + filters */}
      <Card padding="sm">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search topic, content, subject, teacher..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
              title="Clear filters"
            >
              Clear
            </button>
          )}
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="py-20 flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-slate-500 font-medium">Loading lesson logs...</p>
        </div>
      ) : visibleLogs.length > 0 ? (
        <>
          <div className="text-xs text-slate-400 font-semibold">
            Showing {visibleLogs.length} of {logs.length} loaded {hasMore && '· more available'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {visibleLogs.map(log => (
              <Card
                key={log.id}
                className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-blue-500"
                onClick={() => setSelectedLog(log)}
              >
                <div className="flex flex-col h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="min-w-0">
                      <Badge variant="info" className="mb-2">
                        {new Date(log.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </Badge>
                      <h3 className="text-lg font-black text-slate-900 leading-tight group-hover:text-blue-600 transition-colors truncate">
                        {log.topic}
                      </h3>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">
                        {subjects[log.subjectId] || log.subjectId} • Class {classes[log.classId] || log.classId}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-all shrink-0">
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="space-y-3 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-blue-500 mt-2 shrink-0" />
                      <p className="text-sm text-slate-600 line-clamp-2">
                        <span className="font-bold">CW:</span> {log.classwork || 'No classwork noted'}
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-emerald-500 mt-2 shrink-0" />
                      <p className="text-sm text-slate-600 line-clamp-2">
                        <span className="font-bold">HW:</span> {log.homework || 'No homework assigned'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase truncate">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="truncate">{teachers[log.teacherId] || 'Subject Teacher'}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      {log.classworkFileUrl && <Paperclip className="w-3 h-3 text-blue-400" />}
                      {log.homeworkFileUrl && <Paperclip className="w-3 h-3 text-emerald-400" />}
                      {log.updatedAt && log.updatedAt !== log.createdAt && (
                        <span title={`Last edited by ${log.updatedByName || 'someone'}`} className="text-[10px] text-amber-500 font-bold">edited</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button onClick={loadMore} disabled={loadingMore} variant="secondary" icon={RotateCw}>
                {loadingMore ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={FileText}
          title={hasActiveFilters ? 'No matching logs' : 'No Logs Available'}
          description={
            hasActiveFilters
              ? 'Try adjusting your search or date filters.'
              : student
                ? 'No classwork or homework has been logged for this class yet.'
                : 'Check back later for updates.'
          }
        />
      )}

      {/* ─── Detail Modal ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Lesson Details"
        subtitle={selectedLog
          ? `${subjects[selectedLog.subjectId] || selectedLog.subjectId} • Class ${classes[selectedLog.classId] || selectedLog.classId} • ${new Date(selectedLog.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
          : ''}
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-6">
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Today's Topic</h4>
              <p className="text-2xl font-black text-slate-900 leading-tight">{selectedLog.topic}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-wider">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  Classwork
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[80px]">
                  {selectedLog.classwork || 'No details provided.'}
                </div>
                {selectedLog.classworkFileUrl && (
                  <Button
                    variant="secondary" size="sm" icon={Download}
                    className="w-full justify-center"
                    onClick={() => handleDownload(selectedLog.classworkFileUrl!, selectedLog.classworkFileName || 'classwork')}
                  >
                    {selectedLog.classworkFileName || 'Download Classwork File'}
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm uppercase tracking-wider">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  Homework
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[80px]">
                  {selectedLog.homework || 'No homework assigned.'}
                </div>
                {selectedLog.homeworkFileUrl && (
                  <Button
                    variant="secondary" size="sm" icon={Download}
                    className="w-full justify-center"
                    onClick={() => handleDownload(selectedLog.homeworkFileUrl!, selectedLog.homeworkFileName || 'homework')}
                  >
                    {selectedLog.homeworkFileName || 'Download Homework File'}
                  </Button>
                )}
              </div>
            </div>

            {/* Metadata + audit trail */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Subject Teacher</p>
                  <p className="font-semibold text-slate-700">{teachers[selectedLog.teacherId] || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Period</p>
                  <p className="font-semibold text-slate-700">
                    {selectedLog.slotLabel || selectedLog.slotId}
                    {selectedLog.slotStartTime && ` · ${selectedLog.slotStartTime}–${selectedLog.slotEndTime || ''}`}
                  </p>
                </div>
                {selectedLog.createdAt && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Created</p>
                    <p className="font-semibold text-slate-700">
                      {new Date(selectedLog.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {selectedLog.createdByName && ` · ${selectedLog.createdByName}`}
                    </p>
                  </div>
                )}
                {selectedLog.updatedAt && selectedLog.updatedAt !== selectedLog.createdAt && (
                  <div>
                    <p className="text-[10px] font-bold text-amber-500 uppercase flex items-center gap-1">
                      <History className="w-3 h-3" /> Last Edited
                    </p>
                    <p className="font-semibold text-amber-700">
                      {new Date(selectedLog.updatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {selectedLog.updatedByName && ` · ${selectedLog.updatedByName}`}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Edit/delete actions */}
            {(canEdit(selectedLog) || canDelete(selectedLog)) && (
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                {canEdit(selectedLog) && (
                  <Button variant="secondary" icon={Edit2} onClick={() => openEdit(selectedLog)}>
                    Edit
                  </Button>
                )}
                {canDelete(selectedLog) && (
                  <button
                    onClick={() => { setDeleteCandidate(selectedLog); setSelectedLog(null); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold hover:bg-rose-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ─── Edit Modal ──────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!editingLog}
        onClose={() => setEditingLog(null)}
        title="Edit Lesson Log"
        subtitle={editingLog
          ? `${subjects[editingLog.subjectId] || editingLog.subjectId} • Class ${classes[editingLog.classId] || editingLog.classId} • ${new Date(editingLog.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
          : ''}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditingLog(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveEdit}>Save Changes</Button>
          </div>
        }
      >
        {editingLog && (
          <div className="space-y-5">
            <FormField label="Topic" required hint={`${editForm.topic.length}/200`}>
              <Input
                value={editForm.topic}
                maxLength={200}
                onChange={e => setEditForm(f => ({ ...f, topic: e.target.value }))}
              />
            </FormField>
            <FormField label="Classwork" hint={`${editForm.classwork.length}/5000`}>
              <Textarea
                rows={4}
                value={editForm.classwork}
                maxLength={5000}
                onChange={e => setEditForm(f => ({ ...f, classwork: e.target.value }))}
              />
            </FormField>
            <FormField label="Homework" hint={`${editForm.homework.length}/5000`}>
              <Textarea
                rows={4}
                value={editForm.homework}
                maxLength={5000}
                onChange={e => setEditForm(f => ({ ...f, homework: e.target.value }))}
              />
            </FormField>
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>If another teacher or admin saved this log while you were editing, your changes will be rejected to prevent overwriting their work.</span>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Delete Confirmation ─────────────────────────────────────────── */}
      <Modal
        isOpen={!!deleteCandidate}
        onClose={() => setDeleteCandidate(null)}
        title="Delete Lesson Log?"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteCandidate(null)} disabled={deleting}>Cancel</Button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        }
      >
        {deleteCandidate && (
          <div className="space-y-3">
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
              <p className="text-sm font-bold text-rose-700">{deleteCandidate.topic}</p>
              <p className="text-xs text-rose-600 mt-1">
                {subjects[deleteCandidate.subjectId] || deleteCandidate.subjectId} ·
                Class {classes[deleteCandidate.classId] || deleteCandidate.classId} ·
                {' '}{new Date(deleteCandidate.date).toLocaleDateString('en-IN')}
              </p>
            </div>
            <p className="text-sm text-slate-600">This will permanently delete the lesson log and any attached files. This action cannot be undone.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
