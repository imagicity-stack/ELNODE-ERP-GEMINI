import { UserProfile, Homework } from '../../types';
import { CheckSquare, Download, Upload, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useData } from '../../contexts/DataContext';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Avatar,
  EmptyState,
  Spinner,
} from '../../components/ui';

interface StudentHomeworkProps {
  user: UserProfile;
}

export default function StudentHomework({ user }: StudentHomeworkProps) {
  const { subjectsMap: subjects } = useData();
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHomework = async () => {
      if (!user.classId) return;
      setLoading(true);
      try {
        const q = query(
          collection(db, 'homework'),
          where('classId', '==', user.classId),
          orderBy('dueDate', 'desc')
        );
        const snap = await getDocs(q).catch(err => { handleFirestoreError(err, OperationType.LIST, 'homework'); throw err; });
        setHomework(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Homework)));
      } catch (err) {
        console.error('Error fetching homework:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHomework();
  }, [user.classId]);

  const activeCount = homework.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homework Tracking"
        subtitle="Manage and view your assignments."
        icon={CheckSquare}
        iconColor="gradient-emerald"
        actions={
          <Badge variant="success">{activeCount} Assignments</Badge>
        }
      />

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {homework.map((hw) => (
            <Card key={hw.id} hover className="transition-all">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <Avatar name={subjects[hw.subjectId] || hw.subjectId} size="md" />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-900">{subjects[hw.subjectId] || hw.subjectId} Assignment</h3>
                      <Badge variant="warning">Pending</Badge>
                    </div>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        <Clock className="w-3 h-3" />
                        Due: {hw.dueDate}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        <CheckSquare className="w-3 h-3" />
                        {subjects[hw.subjectId] || hw.subjectId}
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">{hw.content}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="secondary" size="sm" icon={Download}>
                    Download
                  </Button>
                  <Button variant="primary" size="sm" icon={Upload}>
                    Submit
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {homework.length === 0 && (
            <EmptyState
              icon={CheckSquare}
              title="No assignments"
              description="You have no pending homework assignments."
            />
          )}
        </div>
      )}
    </div>
  );
}
