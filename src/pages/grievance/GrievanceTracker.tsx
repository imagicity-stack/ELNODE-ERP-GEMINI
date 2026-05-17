import { useState, useEffect, useRef } from 'react';
import {
  collection, onSnapshot, query, where, orderBy,
  doc, updateDoc, addDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, Grievance, GrievanceNote, GrievanceStatus } from '../../types';
import { logActivity } from '../../services/activityService';
import { PageHeader, Card, Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import {
  MessageSquare, AlertCircle, Clock, CheckCircle2,
  ArrowUpRight, Filter, Search, ChevronDown, ChevronUp,
  Lock, Send, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const CATEGORIES = ['academic', 'fee', 'facility', 'staff_conduct', 'transport', 'other'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const STATUSES: GrievanceStatus[] = ['open', 'in_progress', 'awaiting_response', 'resolved', 'closed'];

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: 'Open', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertCircle },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  awaiting_response: { label: 'Awaiting Response', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
  resolved: { label: 'Resolved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  closed: { label: 'Closed', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: CheckCircle2 },
};

const priorityConfig: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export default function GrievanceTracker({ user }: { user: UserProfile }) {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  const [noteText, setNoteText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [submittingNote, setSubmittingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const notesEndRef = useRef<HTMLDivElement>(null);

  const { showToast } = useToast();

  const isSuperAdmin = user.role === 'super_admin';
  const isPrincipal = user.role === 'principal';
  const isOfficer = user.role === 'grievance_officer';

  useEffect(() => {
    let q;
    if (isSuperAdmin) {
      q = query(collection(db, 'grievances'), orderBy('createdAt', 'desc'));
    } else if (isPrincipal) {
      q = query(collection(db, 'grievances'), where('isEscalated', '==', true), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'grievances'), where('isEscalated', '==', false), orderBy('createdAt', 'desc'));
    }

    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Grievance));
      setGrievances(list);
      // Sync selected grievance if open
      if (selectedGrievance) {
        const updated = list.find(g => g.id === selectedGrievance.id);
        if (updated) setSelectedGrievance(updated);
      }
      setLoading(false);
    }, () => setLoading(false));

    return unsub;
  }, [isSuperAdmin, isPrincipal]);

  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedGrievance?.notes]);

  const filtered = grievances.filter(g => {
    if (filterStatus !== 'all' && g.status !== filterStatus) return false;
    if (filterPriority !== 'all' && g.priority !== filterPriority) return false;
    if (filterCategory !== 'all' && g.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return g.title.toLowerCase().includes(q) || g.parentName.toLowerCase().includes(q) || g.studentName.toLowerCase().includes(q);
    }
    return true;
  });

  const handleStatusChange = async (grievance: Grievance, newStatus: GrievanceStatus) => {
    if (updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const updates: any = {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      };
      if (newStatus === 'resolved' || newStatus === 'closed') {
        updates.resolvedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'grievances', grievance.id), updates);
      showToast(`Status updated to ${newStatus.replace('_', ' ')}`, 'success');
      logActivity(user, 'Grievance Status Updated', 'Super Admin', `"${grievance.title}" → ${newStatus.replace('_', ' ')} (${grievance.parentName} / ${grievance.studentName})`, { grievanceId: grievance.id, fromStatus: grievance.status, toStatus: newStatus });
    } catch {
      showToast('Failed to update status', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleEscalate = async (grievance: Grievance) => {
    if (!isOfficer && !isSuperAdmin) return;
    if (grievance.isEscalated) return;
    try {
      await updateDoc(doc(db, 'grievances', grievance.id), {
        isEscalated: true,
        escalatedAt: new Date().toISOString(),
        escalatedBy: user.name,
        updatedAt: new Date().toISOString(),
      });
      setSelectedGrievance(null);
      showToast('Grievance escalated to Principal', 'success');
      logActivity(user, 'Grievance Escalated', 'Super Admin', `"${grievance.title}" escalated to Principal (${grievance.parentName} / ${grievance.studentName})`, { grievanceId: grievance.id });
    } catch {
      showToast('Failed to escalate', 'error');
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !selectedGrievance || submittingNote) return;
    setSubmittingNote(true);
    try {
      const note: GrievanceNote = {
        id: Date.now().toString(),
        content: noteText.trim(),
        authorName: user.name,
        authorRole: user.role,
        createdAt: new Date().toISOString(),
        isInternal,
      };
      const updatedNotes = [...(selectedGrievance.notes || []), note];
      await updateDoc(doc(db, 'grievances', selectedGrievance.id), {
        notes: updatedNotes,
        updatedAt: new Date().toISOString(),
      });
      setNoteText('');
      showToast('Note added', 'success');
      logActivity(user, isInternal ? 'Grievance Internal Note Added' : 'Grievance Note Added', 'Super Admin', `Note on "${selectedGrievance.title}" (${selectedGrievance.parentName} / ${selectedGrievance.studentName}): ${noteText.trim().slice(0, 80)}`, { grievanceId: selectedGrievance.id, isInternal });
    } catch {
      showToast('Failed to add note', 'error');
    } finally {
      setSubmittingNote(false);
    }
  };

  const canEscalate = (g: Grievance) => (isOfficer || isSuperAdmin) && !g.isEscalated;
  const canChangeStatus = !isPrincipal || isSuperAdmin;

  return (
    <div>
      <PageHeader
        title={isPrincipal ? 'Escalated Grievances' : 'Grievance Tracker'}
        subtitle={isPrincipal ? 'Grievances escalated for your review and resolution' : 'Manage and resolve all parent grievances'}
        icon={MessageSquare}
        iconColor="bg-teal-500"
      />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: List */}
        <div className="lg:w-2/5 space-y-4">
          {/* Filters */}
          <Card padding="sm">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by title, parent, student..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Status', value: filterStatus, set: setFilterStatus, options: ['all', ...STATUSES] },
                { label: 'Priority', value: filterPriority, set: setFilterPriority, options: ['all', ...PRIORITIES] },
                { label: 'Category', value: filterCategory, set: setFilterCategory, options: ['all', ...CATEGORIES] },
              ].map(({ label, value, set, options }) => (
                <select
                  key={label}
                  value={value}
                  onChange={e => set(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white"
                >
                  {options.map(o => (
                    <option key={o} value={o}>{o === 'all' ? `All ${label}s` : o.replace('_', ' ')}</option>
                  ))}
                </select>
              ))}
            </div>
          </Card>

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500" />
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <p className="text-slate-400 text-sm text-center py-8">No grievances found</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(g => {
                const sc = statusConfig[g.status] || statusConfig.open;
                const isSelected = selectedGrievance?.id === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGrievance(isSelected ? null : g)}
                    className={cn(
                      'w-full text-left p-4 rounded-2xl border transition-all',
                      isSelected
                        ? 'border-teal-400 bg-teal-50 shadow-sm'
                        : 'border-slate-100 bg-white hover:border-teal-200 hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-bold text-slate-900 leading-tight">{g.title}</p>
                      {g.isEscalated && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">ESCALATED</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mb-2 line-clamp-2">{g.description}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold border', sc.color)}>{sc.label}</span>
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', priorityConfig[g.priority])}>{g.priority}</span>
                      <span className="text-[10px] text-slate-400 capitalize">{g.category.replace('_', ' ')}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">{g.parentName} · {g.studentName} · {g.classSection}</p>
                    <p className="text-[10px] text-slate-400">{new Date(g.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Detail */}
        <div className="lg:w-3/5">
          {selectedGrievance ? (
            <Card>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-lg font-bold text-slate-900">{selectedGrievance.title}</h2>
                    {selectedGrievance.isEscalated && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">ESCALATED</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{selectedGrievance.parentName} · {selectedGrievance.studentName} · {selectedGrievance.classSection}</p>
                  {selectedGrievance.parentPhone && (
                    <p className="text-xs text-slate-400 mt-0.5">{selectedGrievance.parentPhone}</p>
                  )}
                </div>
                <button onClick={() => setSelectedGrievance(null)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1">Category</p>
                  <p className="text-sm font-semibold text-slate-700 capitalize">{selectedGrievance.category.replace('_', ' ')}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1">Priority</p>
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', priorityConfig[selectedGrievance.priority])}>
                    {selectedGrievance.priority.toUpperCase()}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1">Filed On</p>
                  <p className="text-sm font-semibold text-slate-700">{new Date(selectedGrievance.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1">Status</p>
                  {canChangeStatus ? (
                    <select
                      value={selectedGrievance.status}
                      onChange={e => handleStatusChange(selectedGrievance, e.target.value as GrievanceStatus)}
                      disabled={updatingStatus}
                      className="text-sm font-semibold text-slate-700 bg-transparent focus:outline-none w-full"
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  ) : (
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold border', statusConfig[selectedGrievance.status]?.color)}>
                      {statusConfig[selectedGrievance.status]?.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="p-4 bg-slate-50 rounded-xl mb-4">
                <p className="text-[10px] text-slate-400 font-semibold uppercase mb-2">Description</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedGrievance.description}</p>
              </div>

              {/* Escalate button */}
              {canEscalate(selectedGrievance) && (
                <button
                  onClick={() => handleEscalate(selectedGrievance)}
                  className="w-full mb-4 py-2.5 px-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold hover:bg-rose-100 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Escalate to Principal
                </button>
              )}
              {selectedGrievance.isEscalated && selectedGrievance.escalatedBy && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                  Escalated by <strong>{selectedGrievance.escalatedBy}</strong> on {new Date(selectedGrievance.escalatedAt!).toLocaleDateString('en-IN')}
                </div>
              )}

              {/* Thread */}
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Thread ({(selectedGrievance.notes || []).length} notes)</p>
                <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                  {(selectedGrievance.notes || []).length === 0 && (
                    <p className="text-slate-400 text-xs text-center py-4">No notes yet</p>
                  )}
                  {(selectedGrievance.notes || []).map(note => (
                    <div key={note.id} className={cn('p-3 rounded-xl text-sm', note.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200')}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-700">{note.authorName} <span className="font-normal text-slate-500">({note.authorRole.replace('_', ' ')})</span></span>
                        {note.isInternal && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold"><Lock className="w-3 h-3" /> Internal</span>
                        )}
                      </div>
                      <p className="text-slate-700 leading-relaxed">{note.content}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{new Date(note.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  ))}
                  <div ref={notesEndRef} />
                </div>
              </div>

              {/* Add note */}
              <div className="border-t border-slate-100 pt-4">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Add a note or response..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <label className="flex items-center gap-2 text-xs text-amber-600 cursor-pointer select-none">
                    <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="rounded" />
                    <Lock className="w-3 h-3" />
                    Internal note (not visible to parent)
                  </label>
                  <Button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || submittingNote}
                    size="sm"
                  >
                    <Send className="w-3.5 h-3.5 mr-1" />
                    {submittingNote ? 'Saving...' : 'Add Note'}
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-slate-400 text-sm">Select a grievance to view details</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
