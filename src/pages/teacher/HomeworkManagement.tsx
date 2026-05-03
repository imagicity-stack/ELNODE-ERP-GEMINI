import { UserProfile, Teacher, Homework } from '../../types';
import { Plus, CheckSquare, MoreVertical, TrendingUp, BookOpen, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useToast } from '../../components/Toast';
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
  const { showToast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    classId: '',
    subjectId: '',
    dueDate: '',
    content: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Teacher Profile
        const teacherDoc = await getDoc(doc(db, 'teachers', user.uid));
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
          where('teacherId', '==', user.uid),
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
  }, [user.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'homework'), {
        ...formData,
        teacherId: user.uid,
        submissions: [],
        createdAt: serverTimestamp()
      });

      const newHw = {
        id: docRef.id,
        ...formData,
        teacherId: user.uid,
        submissions: []
      } as Homework;

      setHomework(prev => [newHw, ...prev]);
      setIsModalOpen(false);
      setFormData({
        title: '',
        classId: teacherData?.classes?.[0] || '',
        subjectId: teacherData?.subjects?.[0] || '',
        dueDate: '',
        content: ''
      });
      showToast('Homework assigned successfully!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'homework');
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
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                      {hw.subjectId.charAt(0)}
                    </div>
                    <span className="font-bold text-slate-900 line-clamp-1">{hw.content}</span>
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
        </form>
      </Modal>
    </div>
  );
}
