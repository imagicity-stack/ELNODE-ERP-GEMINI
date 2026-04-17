import { UserProfile } from '../../types';
import { FileText, Download, Upload, Search, Filter, BookOpen, Plus, Folder, MoreVertical } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StudentNotesProps {
  user: UserProfile;
}

export default function StudentNotes({ user }: StudentNotesProps) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Study Materials & Notes</h1>
          <p className="text-gray-500 text-sm">Access and upload study resources for your classes.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-all">
          <Upload className="w-4 h-4" />
          Upload Notes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Subjects Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              Subjects
            </h3>
            <div className="space-y-2">
              {[
                { name: 'Mathematics', count: 12, color: 'blue' },
                { name: 'Physics', count: 8, color: 'indigo' },
                { name: 'Chemistry', count: 15, color: 'emerald' },
                { name: 'English', count: 5, color: 'amber' },
                { name: 'History', count: 10, color: 'purple' },
              ].map((subject) => (
                <button key={subject.name} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                      subject.color === 'blue' && "bg-blue-50 text-blue-600",
                      subject.color === 'indigo' && "bg-indigo-50 text-indigo-600",
                      subject.color === 'emerald' && "bg-emerald-50 text-emerald-600",
                      subject.color === 'amber' && "bg-amber-50 text-amber-600",
                      subject.color === 'purple' && "bg-purple-50 text-purple-600",
                    )}>
                      {subject.name.charAt(0)}
                    </div>
                    <span className="text-sm font-bold text-gray-700 group-hover:text-blue-600 transition-all">{subject.name}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-400">{subject.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Notes List */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search notes..." 
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                <Filter className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { title: 'Calculus - Derivatives Part 1', subject: 'Mathematics', date: 'Oct 10, 2023', size: '2.4 MB', type: 'PDF' },
              { title: 'Optics - Lens Formula Notes', subject: 'Physics', date: 'Oct 08, 2023', size: '1.8 MB', type: 'PDF' },
              { title: 'Organic Chemistry Basics', subject: 'Chemistry', date: 'Oct 05, 2023', size: '3.1 MB', type: 'DOCX' },
              { title: 'Shakespearean Tragedy Essay', subject: 'English', date: 'Oct 02, 2023', size: '1.2 MB', type: 'PDF' },
            ].map((note, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <FileText className="w-6 h-6" />
                  </div>
                  <button className="p-2 hover:bg-gray-50 rounded-lg text-gray-400">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
                <h4 className="font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-all">{note.title}</h4>
                <p className="text-xs text-gray-500 mb-4">{note.subject} • {note.date}</p>
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{note.type}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">•</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{note.size}</span>
                  </div>
                  <button className="p-2 hover:bg-blue-50 rounded-lg text-blue-600 transition-all">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
