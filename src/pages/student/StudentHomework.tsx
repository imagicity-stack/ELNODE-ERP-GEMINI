import { UserProfile, Homework } from '../../types';
import { fmtDate } from '../../lib/utils';
import { CheckSquare, Download, Upload, Clock, ExternalLink, BookOpen } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
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
      logActivity(
        user,
        'Homework Submitted',
        'Students',
        `Submitted homework for ${selectedHw.subjectId}`,
        { homeworkId: selectedHw.id, subject: selectedHw.subjectId }
      );
      showToast('Homework submitted successfully!', 'success');
      setSelectedHw(null);
      setSubmitText('');
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

  const pendingCount = homework.filter(hw => !isSubmitted(hw)).length;
  const submittedCount = homework.filter(hw => isSubmitted(hw)).length;

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-4 pt-5 pb-6 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-100">Student Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Homework</h1>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black">{homework.length}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Total</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black text-red-200">{pendingCount}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Pending</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black text-green-200">{submittedCount}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Done</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-24 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : homework.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="No assignments"
              description="You have no pending homework assignments."
            />
          ) : (
            homework.map((hw) => {
              const submitted = isSubmitted(hw);
              return (
                <div key={hw.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                        <BookOpen className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">{hw.subjectId}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${submitted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {submitted ? 'Submitted' : 'Pending'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                          <Clock className="w-3 h-3" />
                          Due: {fmtDate(hw.dueDate)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed mb-3">{hw.content}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(hw)}
                      disabled={!hw.attachmentUrl}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95 transition-transform"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                    {!submitted && (
                      <button
                        onClick={() => { setSelectedHw(hw); setSubmitText(''); }}
                        className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Submit
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-6">
        <PageHeader
          title="Homework Tracking"
          subtitle="Manage and view your assignments."
          icon={CheckSquare}
          iconColor="gradient-emerald"
          actions={<Badge variant="success">{homework.length} Assignments</Badge>}
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
                            Due: {fmtDate(hw.dueDate)}
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
                      <Button variant="secondary" size="sm" icon={Download} onClick={() => handleDownload(hw)} disabled={!hw.attachmentUrl}>
                        Download
                      </Button>
                      {!submitted && (
                        <Button variant="primary" size="sm" icon={Upload} onClick={() => { setSelectedHw(hw); setSubmitText(''); }}>
                          Submit
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
            {homework.length === 0 && (
              <EmptyState icon={CheckSquare} title="No assignments" description="You have no pending homework assignments." />
            )}
          </div>
        )}
      </div>

      {/* Shared Submit Modal */}
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
    </>
  );
}
