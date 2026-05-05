import React, { useState, useEffect } from 'react';
import { UserProfile, LessonLog, Student, Class, Subject } from '../../types';
import DOMPurify from 'dompurify';
import { 
  BookOpen, 
  Calendar as CalendarIcon, 
  Search, 
  Download, 
  FileText,
  Clock,
  ChevronRight,
  GraduationCap,
  Paperclip
} from 'lucide-react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useData } from '../../contexts/DataContext';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  EmptyState,
  Spinner,
  Modal,
} from '../../components/ui';

interface LessonLogsProps {
  user: UserProfile;
  student?: Student; // If provided, only show logs for this student's class
}

export default function LessonLogs({ user, student }: LessonLogsProps) {
  const { 
    classesMap: classes, 
    subjectsMap: subjects, 
    teachersMap: teachers, 
    teacherData 
  } = useData();
  const [logs, setLogs] = useState<LessonLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LessonLog | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      let q;
      const classTeacherId = teacherData?.classTeacherOf?.classId;

      if (student) {
        q = query(
          collection(db, 'lessonLogs'),
          where('classId', '==', student.classId),
          limit(200)
        );
      } else if (user.role === 'teacher') {
        const tid = user.teacherId || user.uid;
        // If they are a class teacher, show logs for their class
        if (classTeacherId) {
          console.log(`[LessonLogs] Class Teacher view for class: ${classTeacherId}`);
          q = query(
            collection(db, 'lessonLogs'),
            where('classId', '==', classTeacherId),
            limit(200)
          );
        } else {
          console.log(`[LessonLogs] Subject Teacher view for: ${tid}`);
          q = query(
            collection(db, 'lessonLogs'),
            where('teacherId', '==', tid),
            limit(200)
          );
        }
      } else {
        // Admin/Super Admin/Principal see all
        q = query(
          collection(db, 'lessonLogs'),
          limit(100)
        );
      }
      
      const snap = await getDocs(q);
      const fetchedLogs = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) } as LessonLog));
      
      // Client-side sorting to avoid missing composite index errors in Firestore
      // Sorting by date (YYYY-MM-DD) and then by createdAt as fallback
      const sortedLogs = fetchedLogs.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        
        const timeA = a.createdAt || '';
        const timeB = b.createdAt || '';
        return timeB.localeCompare(timeA);
      });

      setLogs(sortedLogs);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'lessonLogs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [student?.id, user.uid, teacherData?.classTeacherOf?.classId]);

  const handleDownload = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.target = "_blank";
    link.click();
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Class Diary"
        subtitle={student ? `Classwork and Homework for ${student.name}` : "Daily lesson logs across classes"}
        icon={BookOpen}
        iconColor="gradient-blue"
      />

      {loading ? (
        <div className="py-20 flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-slate-500 font-medium">Loading lesson logs...</p>
        </div>
      ) : logs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {logs.map((log) => (
            <Card 
              key={log.id} 
              className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-blue-500"
              onClick={() => setSelectedLog(log)}
            >
              <div className="flex flex-col h-full">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Badge variant="info" className="mb-2">
                      {new Date(log.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </Badge>
                    <h3 className="text-lg font-black text-slate-900 leading-tight group-hover:text-blue-600 transition-colors">
                      {log.topic}
                    </h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                      {subjects[log.subjectId] || log.subjectId} • Class {classes[log.classId] || log.classId}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-all">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>

                <div className="space-y-3 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-blue-500 mt-2 shrink-0"></div>
                    <div className="text-sm text-slate-600 line-clamp-2">
                      <span className="font-bold">CW:</span> 
                      <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(log.classwork || 'No classwork noted') }} />
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 mt-2 shrink-0"></div>
                    <div className="text-sm text-slate-600 line-clamp-2">
                      <span className="font-bold">HW:</span>
                      <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(log.homework || 'No homework assigned') }} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase">
                    <Clock className="w-3 h-3" />
                    {teachers[log.teacherId] || 'Subject Teacher'}
                  </div>
                  <div className="flex gap-2">
                    {log.classworkFileUrl && <Paperclip className="w-3 h-3 text-blue-400" />}
                    {log.homeworkFileUrl && <Paperclip className="w-3 h-3 text-emerald-400" />}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No Logs Available"
          description={student ? "No classwork or homework has been logged for this class yet." : "Check back later for updates."}
        />
      )}

      {/* Log Detail Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Lesson Details"
        subtitle={selectedLog ? `${subjects[selectedLog.subjectId] || selectedLog.subjectId} • Class ${classes[selectedLog.classId] || selectedLog.classId} • ${new Date(selectedLog.date).toDateString()}` : ''}
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-8">
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Today's Topic</h4>
              <p className="text-2xl font-black text-slate-900 leading-tight">{selectedLog.topic}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-wider">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  Classwork
                </div>
                <div 
                  className="bg-white border border-slate-100 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed prose prose-slate prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedLog.classwork || 'No details provided.') }}
                />
                {selectedLog.classworkFileUrl && (
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    icon={Download} 
                    className="w-full justify-center"
                    onClick={() => handleDownload(selectedLog.classworkFileUrl!, selectedLog.classworkFileName || 'classwork')}
                  >
                    Download Classwork File
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm uppercase tracking-wider">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  Homework
                </div>
                <div 
                  className="bg-white border border-slate-100 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed prose prose-slate prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedLog.homework || 'No homework assigned.') }}
                />
                {selectedLog.homeworkFileUrl && (
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    icon={Download} 
                    className="w-full justify-center"
                    onClick={() => handleDownload(selectedLog.homeworkFileUrl!, selectedLog.homeworkFileName || 'homework')}
                  >
                    Download Homework File
                  </Button>
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Subject Teacher</p>
                <p className="font-bold text-slate-900">{teachers[selectedLog.teacherId] || 'Teacher Name'}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// Internal User component for modal if not imported
function User({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function CheckSquare({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><polyline points="9 11 12 14 22 4"/>
    </svg>
  );
}
