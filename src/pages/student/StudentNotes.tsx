import { UserProfile, Subject } from '../../types';
import { FileText, Download, BookOpen, Clock } from 'lucide-react';
import {
  PageHeader,
  Card,
  Badge,
  Avatar,
  EmptyState,
  Spinner,
  SearchInput,
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
      const q = query(
        collection(db, 'studyMaterials'),
        where('classId', '==', user.classId || ''),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const materialsList = snap.docs.map(d => ({ id: d.id, ...d.data() } as StudyMaterial));
      setMaterials(materialsList);

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
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-teal-600 to-emerald-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-100">Student Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Study Materials</h1>
          <p className="text-xs text-teal-100 mt-1">{materials.length} resource{materials.length !== 1 ? 's' : ''} available</p>
        </div>

        {/* Subject filter chips */}
        <div className="-mx-0 px-4 pt-3 pb-2 overflow-x-auto flex gap-2 [scrollbar-width:none] bg-white border-b border-slate-100">
          <button
            onClick={() => setSelectedSubject(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${!selectedSubject ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}
          >
            All ({materials.length})
          </button>
          {activeSubjects.map(subject => (
            <button
              key={subject.id}
              onClick={() => setSelectedSubject(selectedSubject === subject.id ? null : subject.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedSubject === subject.id ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}
            >
              {subject.name} ({subjectCounts[subject.id]})
            </button>
          ))}
        </div>

        <div className="px-4 pt-3 pb-3 bg-white border-b border-slate-100">
          <SearchInput value={search} onChange={setSearch} placeholder="Search materials..." />
        </div>

        <div className="px-4 pt-3 pb-24 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : filteredMaterials.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No materials found"
              description="Your teachers haven't uploaded any materials yet, or none match your search."
            />
          ) : (
            filteredMaterials.map((note) => (
              <div key={note.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 leading-tight">{note.title}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {subjects.find(s => s.id === note.subjectId)?.name || note.subjectId} · {new Date(note.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </p>
                    {note.description && (
                      <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{note.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{note.fileType}</span>
                      <span className="text-[10px] text-slate-400">{note.fileSize}</span>
                    </div>
                  </div>
                  <a
                    href={note.fileUrl}
                    download={note.fileName}
                    className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-teal-600 active:scale-95 transition-all shrink-0"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-8">
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
                      {subjects.find(s => s.id === note.subjectId)?.name || note.subjectId} • {new Date(note.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
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
    </>
  );
}
