import { UserProfile, Student, Subject, Timetable } from '../../types';
import { BookOpen, Users, Clock, Award, GraduationCap } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useData } from '../../contexts/DataContext';
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
  const { classesMap: classes } = useData();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubjects = async () => {
      if (!selectedStudent) return;
      setLoading(true);
      try {
        // 1. Get Timetable to find subjects for this class
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
          // Fallback: Just fetch all subjects if no timetable mapping exists
          const allSubSnap = await getDocs(collection(db, 'subjects'));
          setSubjects(allSubSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
        } else {
          // Fetch specific subjects
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
    <div className="space-y-8">
      <PageHeader
        title="Academic Subjects"
        subtitle={`Viewing subjects assigned to Class ${classes[selectedStudent.classId] || selectedStudent.classId} for ${selectedStudent.name}`}
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
                  Grade {classes[selectedStudent.classId] || selectedStudent.classId}
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
  );
}
