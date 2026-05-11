import { UserProfile, Student, Subject, Timetable } from '../../types';
import { useData } from '../../contexts/DataContext';
import { BookOpen, Users, Award, GraduationCap, Hash } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  PageHeader,
  Card,
  Badge,
  Spinner,
  EmptyState,
} from '../../components/ui';

interface ParentSubjectsProps {
  user: UserProfile;
  selectedStudent: Student | null;
}

export default function ParentSubjects({ user, selectedStudent }: ParentSubjectsProps) {
  const { classesMap } = useData();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubjects = async () => {
      if (!selectedStudent) return;
      setLoading(true);
      try {
        const timetableQ = query(
          collection(db, 'timetable'),
          where('classId', '==', selectedStudent.classId)
        );
        const ttSnap = await getDocs(timetableQ);

        let subjectIds: string[] = [];
        if (!ttSnap.empty) {
          const tt = ttSnap.docs[0].data() as Timetable;
          tt.schedule.forEach(day => {
            day.periods.forEach(p => {
              if (p.subjectId && !subjectIds.includes(p.subjectId)) {
                subjectIds.push(p.subjectId);
              }
            });
          });
        }

        if (subjectIds.length === 0) {
          const allSubSnap = await getDocs(collection(db, 'subjects'));
          setSubjects(allSubSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
        } else {
          const subs: Subject[] = [];
          for (const id of subjectIds) {
            const sDoc = await getDoc(doc(db, 'subjects', id));
            if (sDoc.exists()) {
              subs.push({ id: sDoc.id, ...sDoc.data() } as Subject);
            }
          }
          setSubjects(subs);
        }
      } catch (err) {
        console.error('Error fetching subjects:', err);
        handleFirestoreError(err, OperationType.LIST, 'subjects');
      } finally {
        setLoading(false);
      }
    };

    fetchSubjects();
  }, [selectedStudent]);

  if (!selectedStudent) {
    return (
      <EmptyState
        icon={Users}
        title="No Student Selected"
        description="Please select a student to view their academic subjects."
      />
    );
  }

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-200">Parent Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Subjects</h1>
          <p className="text-xs text-violet-200 mt-0.5">
            {selectedStudent.name} · {classesMap[selectedStudent.classId] || selectedStudent.classId}
          </p>
          <p className="text-xs text-violet-200 mt-1">{subjects.length} subject{subjects.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="px-4 pt-4 pb-24">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : subjects.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No subjects assigned"
              description="This class doesn't have any subjects assigned in the system yet."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {subjects.map((subject) => (
                <div key={subject.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center mb-3">
                    <BookOpen className="w-5 h-5 text-violet-600" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm leading-tight mb-1">{subject.name}</h3>
                  <div className="flex items-center gap-1 mb-2">
                    <Hash className="w-3 h-3 text-violet-400" />
                    <span className="font-mono text-[10px] font-bold text-violet-600 uppercase">{subject.code}</span>
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
      <div className="hidden md:block space-y-8">
        <PageHeader
          title="Academic Subjects"
          subtitle={`Viewing subjects assigned to ${classesMap[selectedStudent.classId] || selectedStudent.classId} for ${selectedStudent.name}`}
          icon={BookOpen}
          iconColor="gradient-violet"
          actions={
            <Badge variant="info">
              {subjects.length} Total Subjects
            </Badge>
          }
        />

        {loading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject) => (
              <Card key={subject.id} className="group hover:border-violet-200 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 group-hover:bg-violet-600 group-hover:text-white transition-all">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <Badge variant="default" className="font-mono">{subject.code}</Badge>
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">{subject.name}</h3>
                <p className="text-sm text-slate-500 line-clamp-2 mb-4">
                  Full academic coverage of {subject.name} including theory and practical assessments.
                </p>

                <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-medium tracking-tight">
                    <GraduationCap className="w-3.5 h-3.5" />
                    {classesMap[selectedStudent.classId] || selectedStudent.classId}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                    <Award className="w-3.5 h-3.5" />
                    Academic
                  </div>
                </div>
              </Card>
            ))}

            {subjects.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  icon={BookOpen}
                  title="No subjects assigned"
                  description="This class doesn't have any subjects assigned in the system yet."
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
