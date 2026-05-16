import { useState, useEffect } from 'react';
import {
  collection, addDoc, query, where, orderBy, onSnapshot, doc, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, Student, Grievance, GrievanceCategory, GrievancePriority } from '../../types';
import { Card, PageHeader } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { MessageSquare, Plus, Clock, CheckCircle2, AlertCircle, ChevronDown, X, Send } from 'lucide-react';
import { cn } from '../../lib/utils';

const CATEGORIES: { value: GrievanceCategory; label: string }[] = [
  { value: 'academic', label: 'Academic' },
  { value: 'fee', label: 'Fee / Payment' },
  { value: 'facility', label: 'Facility / Infrastructure' },
  { value: 'staff_conduct', label: 'Staff Conduct' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
];

const PRIORITIES: { value: GrievancePriority; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: 'General feedback or suggestion' },
  { value: 'medium', label: 'Medium', description: 'Needs attention soon' },
  { value: 'high', label: 'High', description: 'Affecting my child\'s learning' },
  { value: 'urgent', label: 'Urgent', description: 'Immediate action required' },
];

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: 'Open', color: 'text-red-600 bg-red-50', icon: AlertCircle },
  in_progress: { label: 'In Progress', color: 'text-amber-600 bg-amber-50', icon: Clock },
  awaiting_response: { label: 'Awaiting Response', color: 'text-blue-600 bg-blue-50', icon: Clock },
  resolved: { label: 'Resolved', color: 'text-emerald-600 bg-emerald-50', icon: CheckCircle2 },
  closed: { label: 'Closed', color: 'text-slate-500 bg-slate-50', icon: CheckCircle2 },
};

interface Props {
  user: UserProfile;
  selectedStudent: Student | null;
}

export default function ParentGrievance({ user, selectedStudent }: Props) {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'other' as GrievanceCategory,
    priority: 'medium' as GrievancePriority,
  });
  const [submitting, setSubmitting] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    if (!user.uid) return;
    const q = query(
      collection(db, 'grievances'),
      where('submittedByUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Grievance));
      setGrievances(list);
      // Sync selected
      if (selectedGrievance) {
        const updated = list.find(g => g.id === selectedGrievance.id);
        if (updated) setSelectedGrievance(updated);
      }
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user.uid]);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim() || submitting) return;
    setSubmitting(true);
    try {
      const grievance = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
        status: 'open',
        submittedByUid: user.uid,
        parentName: user.name,
        parentPhone: user.phone || '',
        studentId: selectedStudent?.id || '',
        studentName: selectedStudent?.name || '',
        classSection: selectedStudent ? `${selectedStudent.classId} ${selectedStudent.section}`.trim() : '',
        isEscalated: false,
        notes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'grievances'), grievance);
      setForm({ title: '', description: '', category: 'other', priority: 'medium' });
      setShowForm(false);
      showToast('Grievance submitted successfully. We will get back to you shortly.', 'success');
    } catch {
      showToast('Failed to submit grievance', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selectedGrievance || submittingReply) return;
    setSubmittingReply(true);
    try {
      const note = {
        id: Date.now().toString(),
        content: replyText.trim(),
        authorName: user.name,
        authorRole: 'parent',
        createdAt: new Date().toISOString(),
        isInternal: false,
      };
      const updatedNotes = [...(selectedGrievance.notes || []), note];
      await updateDoc(doc(db, 'grievances', selectedGrievance.id), {
        notes: updatedNotes,
        status: 'awaiting_response',
        updatedAt: new Date().toISOString(),
      });
      setReplyText('');
      showToast('Reply added', 'success');
    } catch {
      showToast('Failed to add reply', 'error');
    } finally {
      setSubmittingReply(false);
    }
  };

  const publicNotes = (g: Grievance) => (g.notes || []).filter(n => !n.isInternal);

  return (
    <div>
      <PageHeader
        title="My Grievances"
        subtitle="Submit and track complaints or concerns"
        icon={MessageSquare}
        iconColor="bg-violet-500"
        actions={
          !showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Grievance
            </button>
          ) : undefined
        }
      />

      {/* Submit form */}
      {showForm && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900">Submit a Grievance</h2>
            <button onClick={() => setShowForm(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Brief title of your concern"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Category *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as GrievanceCategory }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 bg-white"
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Priority *</label>
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value as GrievancePriority }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 bg-white"
                >
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label} — {p.description}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description *</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe your concern in detail..."
                rows={4}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 resize-none"
              />
            </div>

            {selectedStudent && (
              <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl text-sm text-violet-700">
                Filing for: <strong>{selectedStudent.name}</strong> ({selectedStudent.classId} {selectedStudent.section})
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.title.trim() || !form.description.trim() || submitting}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Submit Grievance'}
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* List */}
        <div className="lg:w-2/5 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" /></div>
          ) : grievances.length === 0 ? (
            <Card className="text-center py-10">
              <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No grievances filed yet</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors"
              >
                File a Grievance
              </button>
            </Card>
          ) : (
            grievances.map(g => {
              const sc = statusConfig[g.status] || statusConfig.open;
              const Icon = sc.icon;
              const isSelected = selectedGrievance?.id === g.id;
              const unreadCount = publicNotes(g).filter(n => n.authorRole !== 'parent').length;
              return (
                <button
                  key={g.id}
                  onClick={() => setSelectedGrievance(isSelected ? null : g)}
                  className={cn(
                    'w-full text-left p-4 rounded-2xl border transition-all',
                    isSelected ? 'border-violet-400 bg-violet-50 shadow-sm' : 'border-slate-100 bg-white hover:border-violet-200 hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-bold text-slate-900 leading-tight">{g.title}</p>
                    <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0', sc.color)}>
                      <Icon className="w-3 h-3" />
                      {sc.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-2">{g.description}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 capitalize">{g.category.replace('_', ' ')}</span>
                    <span className="text-[10px] text-slate-300">·</span>
                    <span className="text-[10px] text-slate-400">{new Date(g.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                    {publicNotes(g).length > 0 && (
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold">
                        {publicNotes(g).length} note{publicNotes(g).length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Detail */}
        <div className="lg:w-3/5">
          {selectedGrievance ? (
            <Card>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedGrievance.title}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold', statusConfig[selectedGrievance.status]?.color)}>
                      {statusConfig[selectedGrievance.status]?.label}
                    </span>
                    <span className="text-xs text-slate-400 capitalize">{selectedGrievance.category.replace('_', ' ')}</span>
                    <span className="text-xs text-slate-400">{new Date(selectedGrievance.createdAt).toLocaleDateString('en-IN')}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedGrievance(null)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl mb-4">
                <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Your Complaint</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedGrievance.description}</p>
              </div>

              {/* Thread - only public notes */}
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Communication Thread</p>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {publicNotes(selectedGrievance).length === 0 ? (
                    <p className="text-slate-400 text-xs text-center py-4">No replies yet. The grievance team will respond shortly.</p>
                  ) : (
                    publicNotes(selectedGrievance).map(note => (
                      <div
                        key={note.id}
                        className={cn(
                          'p-3 rounded-xl text-sm max-w-[85%]',
                          note.authorRole === 'parent'
                            ? 'ml-auto bg-violet-100 border border-violet-200'
                            : 'bg-blue-50 border border-blue-200',
                        )}
                      >
                        <p className="text-xs font-bold text-slate-600 mb-1">
                          {note.authorRole === 'parent' ? 'You' : note.authorName}
                        </p>
                        <p className="text-slate-700 leading-relaxed">{note.content}</p>
                        <p className="text-[10px] text-slate-400 mt-1 text-right">{new Date(note.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Reply (only if not closed) */}
              {selectedGrievance.status !== 'closed' && (
                <div className="border-t border-slate-100 pt-4">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Add more details or reply to the team..."
                    rows={2}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 resize-none mb-2"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleReply}
                      disabled={!replyText.trim() || submittingReply}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {submittingReply ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          ) : (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-slate-400 text-sm">Select a grievance to view the conversation</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
