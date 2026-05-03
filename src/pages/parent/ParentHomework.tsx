import { UserProfile, Student, Homework } from '../../types';
import { CheckSquare, Clock, AlertCircle, FileText, Download, Upload, Search, Filter } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';

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
        const snap = await getDocs(q);
        setHomework(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Homework)));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'homework');
      } finally {
        setLoading(false);
      }
    };
    fetchHomework();
  }, [selectedStudent?.classId]);

  if (!selectedStudent) return null;

  const filteredHomework = homework.filter(hw => {
    const matchesSearch = hw.subjectId.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         hw.content.toLowerCase().includes(searchTerm.toLowerCase());
    // Since we don't have a submission status in the Homework object itself (it's usually in a separate collection),
    // we'll just show all for now or filter by due date.
    return matchesSearch;
  });

  const pendingCount = homework.length; // Simplified for now

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Homework Monitoring</h1>
          <p className="text-gray-500 text-sm">Track <span className="text-indigo-600 font-bold">{selectedStudent.name}'s</span> assignments and submission status.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-bold flex items-center gap-2">
            <CheckSquare className="w-4 h-4" />
            {pendingCount} Active
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Status Filter */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Filter className="w-5 h-5 text-indigo-600" />
              Filter by Status
            </h3>
            <div className="space-y-2">
              {[
                { name: 'All Assignments', count: homework.length, color: 'indigo', id: 'all' },
                { name: 'Active', count: homework.length, color: 'amber', id: 'pending' },
              ].map((filter) => (
                <button 
                  key={filter.id} 
                  onClick={() => setStatusFilter(filter.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl transition-all group",
                    statusFilter === filter.id ? "bg-indigo-50" : "hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      filter.color === 'indigo' && "bg-indigo-600",
                      filter.color === 'amber' && "bg-amber-600",
                    )}></div>
                    <span className={cn(
                      "text-sm font-bold transition-all",
                      statusFilter === filter.id ? "text-indigo-600" : "text-gray-700"
                    )}>{filter.name}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-400">{filter.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Homework List */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search assignments..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20 transition-all"
              />
            </div>
          </div>

          <div className="space-y-4">
            {filteredHomework.map((hw, i) => (
              <div key={hw.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center font-bold text-sm text-indigo-600">
                      {hw.subjectId.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900">{hw.subjectId} Assignment</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-600">
                          Active
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 font-medium mb-3">{hw.subjectId} • Due {hw.dueDate}</p>
                      <p className="text-sm text-gray-600 leading-relaxed">{hw.content}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filteredHomework.length === 0 && (
              <div className="bg-white p-12 rounded-2xl border border-dashed border-gray-200 text-center">
                <p className="text-gray-500 italic">No assignments found.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
