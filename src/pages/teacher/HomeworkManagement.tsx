import { UserProfile, Teacher, Homework } from '../../types';
import { Plus, CheckSquare, MoreVertical, TrendingUp, BookOpen, FileText, Upload, File, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import { cn } from '../../lib/utils';
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  Button,
  IconButton,
  Modal,
  SearchInput,
  FormField,
  Input,
  Select,
  Textarea,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
  Spinner,
} from '../../components/ui';

interface HomeworkManagementProps {
  user: UserProfile;
}

export default function HomeworkManagement({ user }: HomeworkManagementProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [homework, setHomework] = useState<Homework[]>([]);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { showToast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    classId: '',
    subjectId: '',
    dueDate: '',
    content: ''
  });
  const [attachment, setAttachment] = useState<File | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Teacher Profile
        const teacherIdForFetch = user.teacherId || user.uid;
        const teacherDoc = await getDoc(doc(db, 'teachers', teacherIdForFetch));
        if (teacherDoc.exists()) {
          const tData = { id: teacherDoc.id, ...teacherDoc.data() } as Teacher;
          setTeacherData(tData);
          setFormData(prev => ({
            ...prev,
            classId: tData.classes?.[0] || '',
            subjectId: tData.subjects?.[0] || ''
          }));
        }

        // Fetch Homework
        const homeworkSnap = await getDocs(query(
          collection(db, 'homework'),
          where('teacherId', '==', teacherIdForFetch),
          orderBy('dueDate', 'desc')
        ));
        setHomework(homeworkSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Homework)));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'homework');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.uid, user.teacherId]);

  const uploadFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.size > 2 * 1024 * 1024) {
        reject(new Error('File size exceeds 2MB limit.'));
        return;
      }

      const path = `homework/${Date.now()}_${file.name}`;
      const fileRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        }, 
        (error) => reject(error), 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setUploadProgress(0);

    try {
      let attachmentUrl = '';
      let attachmentName = '';

      if (attachment) {
        try {
          attachmentUrl = await uploadFile(attachment);
          attachmentName = attachment.name;
        } catch (uploadErr: any) {
          console.error("Homework upload failed:", uploadErr);
          throw new Error(`Attachment upload failed: ${uploadErr.message}`);
        }
      }

      const payload = {
        ...formData,
        teacherId: user.teacherId || user.uid,
        submissions: [],
        createdAt: serverTimestamp(),
        attachmentUrl,
        attachmentName
      };

      const docRef = await addDoc(collection(db, 'homework'), payload);

      const newHw = {
        id: docRef.id,
        ...formData,
        teacherId: user.teacherId || user.uid,
        submissions: [],
        attachmentUrl,
        attachmentName
      } as Homework;

      setHomework(prev => [newHw, ...prev]);
      setIsModalOpen(false);

      // Log activity
      logActivity(
        user,
        'Homework Assigned',
        'Teachers',
        `Assigned homework to Class ${formData.classId} for ${formData.subjectId}`,
        { 
          classId: formData.classId, 
          subjectId: formData.subjectId,
          homeworkId: docRef.id 
        }
      );

      setFormData({
        title: '',
        classId: teacherData?.classes?.[0] || '',
        subjectId: teacherData?.subjects?.[0] || '',
        dueDate: '',
        content: ''
      });
      setAttachment(null);
      showToast('Homework assigned successfully!', 'success');
    } catch (err: any) {
      if (err.message?.includes('File size')) {
        showToast(err.message, 'error');
      } else {
        handleFirestoreError(err, OperationType.WRITE, 'homework');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const filteredHomework = homework.filter(hw =>
    hw.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    hw.classId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    hw.subjectId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    active: homework.filter(hw => new Date(hw.dueDate) >= new Date()).length,
    completed: homework.filter(hw => new Date(hw.dueDate) < new Date()).length,
    totalSubmissions: homework.reduce((acc, hw) => acc + (hw.submissions?.length || 0), 0)
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Homework Management"
        subtitle="Assign and track homework for your classes."
        icon={FileText}
        iconColor="gradient-blue"
        actions={
          <Button icon={Plus} onClick={() => setIsModalOpen(true)}>
            Assign Homework
          </Button>
        }
      />

      {/* Homework Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard
          label="Active Homework"
          value={stats.active}
          icon={BookOpen}
          gradient="gradient-blue"
          index={0}
        />
        <StatCard
          label="Total Submissions"
          value={stats.totalSubmissions}
          icon={CheckSquare}
          gradient="gradient-emerald"
          index={1}
        />
        <StatCard
          label="Completed Tasks"
          value={stats.completed}
          icon={TrendingUp}
          gradient="gradient-violet"
          index={2}
        />
      </div>

      {/* Homework List */}
      <Card padding="none">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by content, class or subject..."
            className="max-w-md"
          />
        </div>
        <Table>
          <Thead>
            <tr>
              <Th>Homework Content</Th>
              <Th>Class &amp; Subject</Th>
              <Th>Due Date</Th>
              <Th>Submissions</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {filteredHomework.map((hw) => (
              <Tr key={hw.id}>
                <Td>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                        {hw.subjectId.charAt(0)}
                      </div>
                      <span className="font-bold text-slate-900 line-clamp-1">{hw.content}</span>
                    </div>
                    {hw.attachmentUrl && (
                      <a 
                        href={hw.attachmentUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 w-fit px-2 py-0.5 rounded-md mt-1 transition-colors"
                      >
                        <FileText className="w-3 h-3" />
                        <span>View Attachment</span>
                      </a>
                    )}
                  </div>
                </Td>
                <Td className="text-slate-600">{hw.classId} &bull; {hw.subjectId}</Td>
                <Td className="text-slate-600">{new Date(hw.dueDate).toLocaleDateString()}</Td>
                <Td className="font-bold text-slate-900">{hw.submissions?.length || 0}</Td>
                <Td>
                  <Badge variant={new Date(hw.dueDate) >= new Date() ? 'info' : 'success'}>
                    {new Date(hw.dueDate) >= new Date() ? 'Active' : 'Completed'}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <IconButton icon={MoreVertical} variant="ghost" />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {filteredHomework.length === 0 && (
          loading
            ? <Spinner />
            : <EmptyState
                icon={FileText}
                title="No homework assignments"
                description="No homework assignments found. Assign one to get started."
                action={
                  <Button icon={Plus} size="sm" onClick={() => setIsModalOpen(true)}>
                    Assign Homework
                  </Button>
                }
              />
        )}
      </Card>

      {/* Assign Homework Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Assign Homework"
        subtitle="Create a new homework assignment for your class."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="homework-form" loading={submitting}>
              {submitting ? 'Assigning...' : 'Assign'}
            </Button>
          </div>
        }
      >
        <form id="homework-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Class" required>
              <Select
                value={formData.classId}
                onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
              >
                {teacherData?.classes?.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Subject" required>
              <Select
                value={formData.subjectId}
                onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
              >
                {teacherData?.subjects?.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Due Date" required>
            <Input
              type="date"
              required
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
            />
          </FormField>
          <FormField label="Instructions / Content" required>
            <Textarea
              rows={3}
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Describe the homework assignment..."
            />
          </FormField>
          <FormField label="Attachment (Optional)">
            <div className="relative">
              <input
                type="file"
                id="homework-attachment"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
              />
              <label
                htmlFor="homework-attachment"
                className={cn(
                  "flex flex-col gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                  attachment ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-2">
                  {attachment ? (
                    <>
                      <File className="w-4 h-4" />
                      <span className="text-xs font-medium flex-1 truncate">{attachment.name}</span>
                      <X className="w-4 h-4 text-slate-400 hover:text-rose-500" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAttachment(null); }} />
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-medium text-slate-500">Click to upload (Max 2MB)</span>
                    </>
                  )}
                </div>
                {((uploadProgress > 0 && uploadProgress < 100) || (submitting && attachment)) && (
                  <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div 
                      className={cn(
                        "h-full transition-all duration-300",
                        uploadProgress === 100 ? "bg-emerald-500" : "bg-blue-500"
                      )} 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                )}
              </label>
            </div>
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
