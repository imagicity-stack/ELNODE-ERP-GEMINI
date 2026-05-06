import { UserProfile, Homework } from '../../types';
import { CheckSquare, Download, Upload, Clock, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Avatar,
  EmptyState,
  Spinner,
  Modal,
  FormField,
  Textarea,
} from '../../components/ui';

interface StudentHomeworkProps {
  user: UserProfile;
}

export default function StudentHomework({ user }: StudentHomeworkProps) {
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedHw, setSelectedHw] = useState<Homework | null>(null);
  const [submitText, setSubmitText] = useState('');
  const { showToast } = useToast();

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
        setHomework(snap.docs.map(d => ({ id: d.id, ...d.data() } as Homework)));
      } catch (err) {
        console.error('Error fetching homework:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHomework();
  }, [user.classId]);

  const isSubmitted = (hw: Homework) =>
    hw.submissions?.some(s => s.studentId === user.studentId);

  const handleDownload = (hw: Homework) => {
    if (hw.attachmentUrl) {
      window.open(hw.attachmentUrl, '_blank', 'noopener,noreferrer');
    } else {
      showToast('No attachment available for this assignment.', 'info');
    }
  };

  const handleSubmit = async () => {
    if (!selectedHw || !submitText.trim()) {
      showToast('Please write your submission before submitting.', 'error');
      return;
    }
    if (!user.studentId) {
      showToast('Student ID not found. Please contact admin.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'homework', selectedHw.id), {
        submissions: arrayUnion({
          studentId: user.studentId,
          content: submitText.trim(),
          submittedAt: new Date().toISOString(),
        }),
      });
      showToast('Homework submitted successfully!', 'success');
      setSelectedHw(null);
      setSubmitText('');
      // Refresh to reflect submitted state
      setHomework(prev =>
        prev.map(hw =>
          hw.id === selectedHw.id
            ? { ...hw, submissions: [...(hw.submissions || []), { studentId: user.studentId!, content: submitText.trim(), submittedAt: new Date().toISOString() }] }
            : hw
        )
      );
    } catch (err) {
      showToast('Failed to submit homework. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
          {homework.map((hw) => {
            const submitted = isSubmitted(hw);
            return (
              <Card key={hw.id} hover className="transition-all">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <Avatar name={hw.subjectId} size="md" />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-slate-900">{hw.subjectId} Assignment</h3>
                        <Badge variant={submitted ? 'success' : 'warning'}>
                          {submitted ? 'Submitted' : 'Pending'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          <Clock className="w-3 h-3" />
                          Due: {hw.dueDate}
                        </div>
                        {hw.attachmentName && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <ExternalLink className="w-3 h-3" />
                            {hw.attachmentName}
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">{hw.content}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Download}
                      onClick={() => handleDownload(hw)}
                      disabled={!hw.attachmentUrl}
                    >
                      Download
                    </Button>
                    {!submitted && (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Upload}
                        onClick={() => { setSelectedHw(hw); setSubmitText(''); }}
                      >
                        Submit
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          {homework.length === 0 && (
            <EmptyState
              icon={CheckSquare}
              title="No assignments"
              description="You have no pending homework assignments."
            />
          )}
        </div>
      )}

      <Modal
        isOpen={!!selectedHw}
        onClose={() => setSelectedHw(null)}
        title={`Submit: ${selectedHw?.subjectId} Assignment`}
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setSelectedHw(null)}>Cancel</Button>
            <Button variant="primary" icon={Upload} loading={submitting} onClick={handleSubmit}>
              Submit Homework
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-xl text-sm text-slate-600">
            <strong>Assignment:</strong> {selectedHw?.content}
          </div>
          <FormField label="Your Submission" required>
            <Textarea
              rows={5}
              value={submitText}
              onChange={e => setSubmitText(e.target.value)}
              placeholder="Write your answer or describe what you've done..."
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
