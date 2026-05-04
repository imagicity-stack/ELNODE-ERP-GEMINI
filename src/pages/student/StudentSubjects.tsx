import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, Subject, Timetable } from '../../types';
import {
  PageHeader,
  Card,
  Spinner,
  EmptyState,
  Avatar,
  Badge,
} from '../../components/ui';
import { BookOpen, Hash, Layers, User } from 'lucide-react';

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
        // 1. Get Timetable to find subjects for this class
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
          // Fallback: Just fetch all subjects if no timetable mapping exists
          const allSubSnap = await getDocs(collection(db, 'subjects'));
          setSubjects(allSubSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
        } else {
          // Fetch specific subjects
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
    <div className="space-y-6">
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
  );
}
