import { UserProfile, Student, Homework } from '../../types';
import { CheckSquare, Filter, CheckCircle2, Clock, BookOpen } from 'lucide-react';
import { cn, fmtDate } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  PageHeader,
  Card,
  Badge,
  SearchInput,
  EmptyState,
  Spinner,
} from '../../components/ui';

interface ParentHomeworkProps {
  user: UserProfile;
  selectedStudent: Student | null;
}

export default function ParentHomework({ user, selectedStudent }: ParentHomeworkProps) {
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const fetchHomework = async () => {
      if (!selectedStudent?.classId) return;
      setLoading(true);
      try {
        const q = query(
          collection(db, 'homework'),
          where('classId', '==', selectedStudent.classId),
          orderBy('dueDate', 'desc')
        );
        const snap = await getDocs(q).catch(err => { handleFirestoreError(err, OperationType.LIST, 'homework'); throw err; });
        setHomework(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Homework)));
      } catch (err) {
        console.error('Error fetching parent homework data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHomework();
  }, [selectedStudent?.classId]);

  if (!selectedStudent) return null;

  const isSubmitted = (hw: Homework) =>
    hw.submissions?.some(s => s.studentId === selectedStudent.id);

  const submittedCount = homework.filter(isSubmitted).length;
  const pendingCount = homework.length - submittedCount;

  const filteredHomework = homework.filter(hw => {
    const matchesSearch =
      hw.subjectId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      hw.content.toLowerCase().includes(searchTerm.toLowerCase());
    const submitted = isSubmitted(hw);
    if (statusFilter === 'submitted') return matchesSearch && submitted;
    if (statusFilter === 'pending') return matchesSearch && !submitted;
    return matchesSearch;
  });

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 px-4 pt-5 pb-6 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-200">Parent Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Homework Monitor</h1>
          <p className="text-xs text-violet-200 mt-0.5">{selectedStudent.name}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black">{homework.length}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Total</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black text-amber-300">{pendingCount}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Pending</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black text-emerald-300">{submittedCount}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Done</p>
            </div>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="px-4 pt-3 pb-2 overflow-x-auto flex gap-2 [scrollbar-width:none] bg-white border-b border-slate-100">
          {[
            { id: 'all', label: `All (${homework.length})` },
            { id: 'pending', label: `Pending (${pendingCount})` },
            { id: 'submitted', label: `Done (${submittedCount})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${statusFilter === f.id ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="px-4 pt-3 pb-3 bg-white border-b border-slate-100">
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search assignments..." />
        </div>

        <div className="px-4 pt-3 pb-24 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : filteredHomework.length === 0 ? (
            <EmptyState icon={CheckSquare} title="No assignments found" description="No homework assignments match your search." />
          ) : (
            filteredHomework.map((hw) => {
              const submitted = isSubmitted(hw);
              const submission = hw.submissions?.find(s => s.studentId === selectedStudent.id);
              return (
                <div key={hw.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{hw.subjectId}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${submitted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {submitted ? 'Submitted' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Due {fmtDate(hw.dueDate)}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{hw.content}</p>
                  {submitted && submission && (
                    <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <p className="text-xs font-bold text-emerald-700 mb-1">
                        Submitted on {new Date(submission.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-emerald-600 line-clamp-2">{submission.content}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-8">
        <PageHeader
          title="Homework Monitoring"
          subtitle={`Track ${selectedStudent.name}'s assignments and submission status`}
          icon={CheckSquare}
          iconColor="gradient-violet"
          actions={
            <div className="flex gap-2">
              <div className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                {submittedCount} Submitted
              </div>
              <div className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-xl text-sm font-bold flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {pendingCount} Pending
              </div>
            </div>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Status Filter */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Filter className="w-5 h-5 text-violet-600" />
                Filter by Status
              </h3>
              <div className="space-y-2">
                {[
                  { name: 'All Assignments', count: homework.length, color: 'violet', id: 'all' },
                  { name: 'Pending', count: pendingCount, color: 'amber', id: 'pending' },
                  { name: 'Submitted', count: submittedCount, color: 'emerald', id: 'submitted' },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setStatusFilter(filter.id)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl transition-all group",
                      statusFilter === filter.id ? "bg-violet-50" : "hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        filter.color === 'violet' && "bg-violet-600",
                        filter.color === 'amber' && "bg-amber-500",
                        filter.color === 'emerald' && "bg-emerald-500",
                      )} />
                      <span className={cn(
                        "text-sm font-bold transition-all",
                        statusFilter === filter.id ? "text-violet-600" : "text-slate-700"
                      )}>{filter.name}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-400">{filter.count}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Homework List */}
          <div className="lg:col-span-3 space-y-6">
            <Card>
              <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search assignments..." />
            </Card>

            <div className="space-y-4">
              {filteredHomework.map((hw) => {
                const submitted = isSubmitted(hw);
                const submission = hw.submissions?.find(s => s.studentId === selectedStudent.id);
                return (
                  <Card key={hw.id} hover>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl gradient-violet flex items-center justify-center font-bold text-sm text-white">
                          {hw.subjectId.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-slate-900">{hw.subjectId} Assignment</h3>
                            <Badge variant={submitted ? 'success' : 'warning'}>
                              {submitted ? 'Submitted' : 'Pending'}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400 font-medium mb-2">Due {fmtDate(hw.dueDate)}</p>
                          <p className="text-sm text-slate-600 leading-relaxed">{hw.content}</p>
                          {submitted && submission && (
                            <div className="mt-3 p-2.5 bg-emerald-50 rounded-lg border border-emerald-100">
                              <p className="text-xs font-bold text-emerald-700 mb-1">
                                Submitted on {new Date(submission.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </p>
                              <p className="text-xs text-emerald-600 line-clamp-2">{submission.content}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
              {filteredHomework.length === 0 && (
                <EmptyState
                  icon={CheckSquare}
                  title="No assignments found"
                  description="No homework assignments match your search."
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
