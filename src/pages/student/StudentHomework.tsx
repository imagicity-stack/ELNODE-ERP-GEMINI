import { UserProfile } from '../../types';
import { CheckSquare, Download, Upload } from 'lucide-react';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Avatar,
  EmptyState,
} from '../../components/ui';

interface StudentHomeworkProps {
  user: UserProfile;
}

export default function StudentHomework({ user }: StudentHomeworkProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Homework Tracking"
        subtitle="Manage and submit your assignments."
        icon={CheckSquare}
        iconColor="gradient-emerald"
        actions={
          <Badge variant="success">12/15 Completed</Badge>
        }
      />

      <div className="grid grid-cols-1 gap-4">
        {[
          { subject: 'Mathematics', title: 'Calculus Exercise 4.2', due: 'Tomorrow', status: 'pending', desc: 'Solve all problems from page 142-145.' },
          { subject: 'Physics', title: 'Lab Report: Optics', due: 'Oct 15', status: 'pending', desc: 'Submit the lab report for the optics experiment conducted on Monday.' },
          { subject: 'English', title: 'Essay: Shakespearean Tragedy', due: 'Oct 18', status: 'submitted', desc: 'Write a 1000-word essay on the theme of tragedy in Hamlet.' },
          { subject: 'Chemistry', title: 'Organic Compounds', due: 'Oct 08', status: 'overdue', desc: 'Complete the worksheet on organic compounds.' },
        ].map((hw, i) => (
          <Card key={i} hover className="transition-all">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <Avatar name={hw.subject} size="md" />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-900">{hw.title}</h3>
                    <Badge
                      variant={
                        hw.status === 'pending' ? 'warning' :
                        hw.status === 'submitted' ? 'success' :
                        'error'
                      }
                    >
                      {hw.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 font-medium mb-3">{hw.subject} • Due {hw.due}</p>
                  <p className="text-sm text-slate-600 leading-relaxed">{hw.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="secondary" size="sm" icon={Download}>
                  Download
                </Button>
                {hw.status !== 'submitted' && (
                  <Button variant="primary" size="sm" icon={Upload}>
                    Submit
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
