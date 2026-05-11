import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, Subject, Timetable } from '../../types';
import {
  PageHeader,
  Card,
  Spinner,
  EmptyState,
  Badge,
} from '../../components/ui';
import { BookOpen, Hash, Layers } from 'lucide-react';

interface StudentSubjectsProps {
  user: UserProfile;
}

export default function StudentSubjects({ user }: StudentSubjectsProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubjects = async () => {
      if (!user.classId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const q = query(
          collection(db, 'timetable'),
          where('classId', '==', user.classId)
        );
        const ttSnap = await getDocs(q);

        const subjectIds = new Set<string>();
        ttSnap.docs.forEach(d => {
          const tt = d.data() as Timetable;
          tt.schedule?.forEach(day => {
            day.periods?.forEach(period => {
              if (period.subjectId) subjectIds.add(period.subjectId);
            });
          });
        });

        if (subjectIds.size === 0) {
          const allSubSnap = await getDocs(collection(db, 'subjects'));
          setSubjects(allSubSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
        } else {
          const subjectList: Subject[] = [];
          for (const id of Array.from(subjectIds)) {
            const sDoc = await getDoc(doc(db, 'subjects', id));
            if (sDoc.exists()) {
              subjectList.push({ id: sDoc.id, ...sDoc.data() } as Subject);
            }
          }
          setSubjects(subjectList);
        }
      } catch (err) {
        console.error('Error fetching subjects:', err);
        handleFirestoreError(err, OperationType.LIST, 'subjects');
      } finally {
        setLoading(false);
      }
    };

    fetchSubjects();
  }, [user.classId]);

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Student Portal</p>
          <h1 className="text-xl font-bold mt-0.5">My Subjects</h1>
          <p className="text-xs text-indigo-200 mt-1">{subjects.length} subject{subjects.length !== 1 ? 's' : ''} assigned</p>
        </div>

        <div className="px-4 pt-4 pb-24">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : subjects.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No subjects assigned"
              description="Your class doesn't have any subjects assigned in the system yet."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {subjects.map((subject) => (
                <div key={subject.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mb-3">
                    <BookOpen className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm leading-tight mb-1">{subject.name}</h3>
                  <div className="flex items-center gap-1 mb-2">
                    <Hash className="w-3 h-3 text-indigo-400" />
                    <span className="font-mono text-[10px] font-bold text-indigo-600 uppercase">{subject.code}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${subject.type === 'theory' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {subject.type || 'Theory'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-6">
        <PageHeader
          title="My Subjects"
          subtitle="View the list of subjects assigned to your class."
          icon={BookOpen}
          iconColor="gradient-indigo"
        />

        {loading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject) => (
              <Card key={subject.id} hover className="transition-all hover:shadow-md">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl gradient-indigo flex items-center justify-center text-white shrink-0 shadow-lg">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-lg truncate mb-1">
                      {subject.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mb-3">
                      <Hash className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="font-mono text-xs font-bold text-indigo-600 uppercase tracking-wider">
                        {subject.code}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={subject.type === 'theory' ? 'info' : 'success'}>
                        <Layers className="w-3 h-3" />
                        {subject.type || 'Theory'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </Card>
            ))}

            {subjects.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  icon={BookOpen}
                  title="No subjects assigned"
                  description="Your class doesn't have any subjects assigned in the system yet."
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
