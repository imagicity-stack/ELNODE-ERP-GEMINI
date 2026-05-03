import { UserProfile } from '../../types';
import { FileText, Download, Upload, Filter, BookOpen, MoreVertical } from 'lucide-react';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  IconButton,
  SearchInput,
  Avatar,
  EmptyState,
} from '../../components/ui';
import { useState } from 'react';

interface StudentNotesProps {
  user: UserProfile;
}

export default function StudentNotes({ user }: StudentNotesProps) {
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-8">
      <PageHeader
        title="Study Materials & Notes"
        subtitle="Access and upload study resources for your classes."
        icon={BookOpen}
        iconColor="gradient-emerald"
        actions={
          <Button variant="primary" icon={Upload}>
            Upload Notes
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Subjects Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-600" />
              Subjects
            </h3>
            <div className="space-y-1">
              {[
                { name: 'Mathematics', count: 12 },
                { name: 'Physics', count: 8 },
                { name: 'Chemistry', count: 15 },
                { name: 'English', count: 5 },
                { name: 'History', count: 10 },
              ].map((subject) => (
                <button
                  key={subject.name}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={subject.name} size="sm" />
                    <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-600 transition-all">
                      {subject.name}
                    </span>
                  </div>
                  <Badge variant="default">{subject.count}</Badge>
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
              placeholder="Search notes..."
              className="flex-1 max-w-md"
            />
            <IconButton icon={Filter} variant="ghost" />
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { title: 'Calculus - Derivatives Part 1', subject: 'Mathematics', date: 'Oct 10, 2023', size: '2.4 MB', type: 'PDF' },
              { title: 'Optics - Lens Formula Notes', subject: 'Physics', date: 'Oct 08, 2023', size: '1.8 MB', type: 'PDF' },
              { title: 'Organic Chemistry Basics', subject: 'Chemistry', date: 'Oct 05, 2023', size: '3.1 MB', type: 'DOCX' },
              { title: 'Shakespearean Tragedy Essay', subject: 'English', date: 'Oct 02, 2023', size: '1.2 MB', type: 'PDF' },
            ].map((note, i) => (
              <Card key={i} hover>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl gradient-emerald flex items-center justify-center text-white">
                    <FileText className="w-6 h-6" />
                  </div>
                  <IconButton icon={MoreVertical} variant="ghost" size="sm" />
                </div>
                <h4 className="font-bold text-slate-900 mb-1 group-hover:text-emerald-600 transition-all">{note.title}</h4>
                <p className="text-xs text-slate-500 mb-4">{note.subject} • {note.date}</p>
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <Badge variant="indigo">{note.type}</Badge>
                    <span className="text-xs text-slate-400">{note.size}</span>
                  </div>
                  <IconButton icon={Download} variant="ghost" size="sm" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
