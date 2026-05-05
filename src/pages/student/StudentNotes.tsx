import { UserProfile, Subject } from '../../types';
import { FileText, Download, Upload, Filter, BookOpen, MoreVertical, Clock } from 'lucide-react';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  IconButton,
  SearchInput,
  Avatar,
  EmptyState,
  Spinner,
} from '../../components/ui';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';

interface StudyMaterial {
  id: string;
  title: string;
  description?: string;
  subjectId: string;
  classId: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: string;
  teacherId: string;
  createdAt: string;
}

interface StudentNotesProps {
  user: UserProfile;
}

export default function StudentNotes({ user }: StudentNotesProps) {
  const [search, setSearch] = useState('');
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [user.classId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch materials for the student's class
      const q = query(
        collection(db, 'studyMaterials'),
        where('classId', '==', user.classId || ''),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const materialsList = snap.docs.map(d => ({ id: d.id, ...d.data() } as StudyMaterial));
      setMaterials(materialsList);

      // 2. Fetch subjects to get names
      const subSnap = await getDocs(collection(db, 'subjects'));
      setSubjects(subSnap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));

    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'studyMaterials');
    } finally {
      setLoading(false);
    }
  };

  const filteredMaterials = materials.filter(m => {
    const matchesSearch = m.title.toLowerCase().includes(search.toLowerCase()) || 
                         m.description?.toLowerCase().includes(search.toLowerCase());
    const matchesSubject = selectedSubject ? m.subjectId === selectedSubject : true;
    return matchesSearch && matchesSubject;
  });

  const subjectCounts = materials.reduce((acc, m) => {
    acc[m.subjectId] = (acc[m.subjectId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeSubjects = subjects.filter(s => subjectCounts[s.id] > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Study Materials & Notes"
        subtitle="Access resources uploaded by your teachers for your class."
        icon={BookOpen}
        iconColor="gradient-emerald"
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Subjects Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              Subjects
            </h3>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedSubject(null)}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all group ${!selectedSubject ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'hover:bg-slate-50 text-slate-600'}`}
              >
                <span className="text-sm font-bold">All Materials</span>
                <Badge variant={!selectedSubject ? 'success' : 'default'}>{materials.length}</Badge>
              </button>
              {activeSubjects.map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => setSelectedSubject(subject.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all group ${selectedSubject === subject.id ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={subject.name} size="sm" />
                    <span className="text-sm font-bold group-hover:text-emerald-600 transition-all">
                      {subject.name}
                    </span>
                  </div>
                  <Badge variant={selectedSubject === subject.id ? 'success' : 'default'}>
                    {subjectCounts[subject.id]}
                  </Badge>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Notes List */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="flex items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by title or description..."
              className="flex-1 max-w-md"
            />
          </Card>

          {loading ? (
            <Spinner />
          ) : filteredMaterials.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No materials found"
              description="Your teachers haven't uploaded any materials yet, or none match your search."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredMaterials.map((note) => (
                <Card key={note.id} hover className="group flex flex-col h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl gradient-emerald flex items-center justify-center text-white">
                      <FileText className="w-6 h-6" />
                    </div>
                    <a 
                      href={note.fileUrl} 
                      download={note.fileName}
                      className="text-slate-400 hover:text-emerald-600 transition-colors p-2 rounded-lg hover:bg-emerald-50"
                    >
                      <Download className="w-5 h-5" />
                    </a>
                  </div>
                  <h4 className="font-bold text-slate-900 group-hover:text-emerald-600 transition-all mb-1">{note.title}</h4>
                  <p className="text-xs text-slate-500 mb-3">
                    {subjects.find(s => s.id === note.subjectId)?.name || note.subjectId} • {new Date(note.createdAt).toLocaleDateString()}
                  </p>
                  
                  {note.description && (
                    <p className="text-sm text-slate-600 line-clamp-2 flex-grow mb-4">
                      {note.description}
                    </p>
                  )}

                  <div className="pt-4 border-t border-slate-50 flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">{note.fileType}</Badge>
                      <span className="text-[10px] text-slate-400 font-medium">{note.fileSize}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>Shared Recently</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
