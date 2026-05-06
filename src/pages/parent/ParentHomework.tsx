import { UserProfile, Student, Homework } from '../../types';
import { CheckSquare, Filter, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  PageHeader,
  Card,
  Badge,
  SearchInput,
  EmptyState,
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
    <div className="space-y-8">
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
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search assignments..."
            />
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
                        <p className="text-xs text-slate-400 font-medium mb-2">Due {hw.dueDate}</p>
                        <p className="text-sm text-slate-600 leading-relaxed">{hw.content}</p>
                        {submitted && submission && (
                          <div className="mt-3 p-2.5 bg-emerald-50 rounded-lg border border-emerald-100">
                            <p className="text-xs font-bold text-emerald-700 mb-1">
                              Submitted on {new Date(submission.submittedAt).toLocaleDateString()}
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
  );
}
