import { UserProfile } from '../../types';
import { Clock, CheckSquare, AlertCircle, FileText, Download, Upload } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StudentHomeworkProps {
  user: UserProfile;
}

export default function StudentHomework({ user }: StudentHomeworkProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Homework Tracking</h1>
          <p className="text-gray-500 text-sm">Manage and submit your assignments.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-bold">
            12/15 Completed
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {[
          { subject: 'Mathematics', title: 'Calculus Exercise 4.2', due: 'Tomorrow', status: 'pending', color: 'blue', desc: 'Solve all problems from page 142-145.' },
          { subject: 'Physics', title: 'Lab Report: Optics', due: 'Oct 15', status: 'pending', color: 'indigo', desc: 'Submit the lab report for the optics experiment conducted on Monday.' },
          { subject: 'English', title: 'Essay: Shakespearean Tragedy', due: 'Oct 18', status: 'submitted', color: 'emerald', desc: 'Write a 1000-word essay on the theme of tragedy in Hamlet.' },
          { subject: 'Chemistry', title: 'Organic Compounds', due: 'Oct 08', status: 'overdue', color: 'red', desc: 'Complete the worksheet on organic compounds.' },
        ].map((hw, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm",
                  hw.color === 'blue' && "bg-blue-50 text-blue-600",
                  hw.color === 'indigo' && "bg-indigo-50 text-indigo-600",
                  hw.color === 'emerald' && "bg-emerald-50 text-emerald-600",
                  hw.color === 'red' && "bg-red-50 text-red-600",
                )}>
                  {hw.subject.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-gray-900">{hw.title}</h3>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                      hw.status === 'pending' && "bg-amber-50 text-amber-600",
                      hw.status === 'submitted' && "bg-emerald-50 text-emerald-600",
                      hw.status === 'overdue' && "bg-red-50 text-red-600",
                    )}>
                      {hw.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 font-medium mb-3">{hw.subject} • Due {hw.due}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{hw.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all">
                  <Download className="w-4 h-4" />
                  Download
                </button>
                {hw.status !== 'submitted' && (
                  <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all">
                    <Upload className="w-4 h-4" />
                    Submit
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
