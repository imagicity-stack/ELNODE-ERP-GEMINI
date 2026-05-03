import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Plus, Book, Trash2, Edit2, Hash, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Subject } from '../../types';
import {
  PageHeader, Card, Badge, Button, IconButton, Modal, ConfirmModal,
  SearchInput, FormField, Input, Select, Table, Thead, Th, Tbody, Tr, Td, EmptyState
} from '../../components/ui';

export default function SubjectManagement() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'theory' as 'theory' | 'practical' | 'both',
  });

  const fetchSubjects = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'subjects'));
      const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject));
      setSubjects(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'subjects');
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEditMode && editingSubject) {
        await updateDoc(doc(db, 'subjects', editingSubject.id), formData);
      } else {
        await addDoc(collection(db, 'subjects'), formData);
      }
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingSubject(null);
      fetchSubjects();
      setFormData({ name: '', code: '', type: 'theory' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, isEditMode ? `subjects/${editingSubject?.id}` : 'subjects');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setIsEditMode(true);
    setFormData({
      name: subject.name,
      code: subject.code,
      type: subject.type || 'theory',
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  };

  const performDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'subjects', deletingId));
      fetchSubjects();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `subjects/${deletingId}`);
    }
  };

  const filteredSubjects = subjects.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const typeVariant = (type: string) => {
    if (type === 'theory') return 'info';
    if (type === 'practical') return 'success';
    return 'purple';
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Subject Repository"
        subtitle="Define and manage academic subjects with specific codes."
        icon={Book}
        iconColor="gradient-indigo"
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              setIsEditMode(false);
              setEditingSubject(null);
              setFormData({ name: '', code: '', type: 'theory' });
              setIsModalOpen(true);
            }}
          >
            Add New Subject
          </Button>
        }
      />

      <Card padding="sm">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by subject name or code..."
        />
      </Card>

      <Card padding="none">
        <Table>
          <Thead>
            <Tr>
              <Th>Subject</Th>
              <Th>Code</Th>
              <Th>Type</Th>
              <Th className="text-right">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filteredSubjects.map((subject) => (
              <Tr key={subject.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl gradient-indigo flex items-center justify-center text-white shrink-0">
                      <Book className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-slate-900">{subject.name}</span>
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="font-mono text-xs font-bold text-indigo-600 uppercase tracking-wider">{subject.code}</span>
                  </div>
                </Td>
                <Td>
                  <Badge variant={typeVariant(subject.type || 'theory')}>
                    <Layers className="w-3 h-3" />
                    {subject.type || 'Theory'}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <IconButton icon={Edit2} variant="ghost" size="sm" onClick={() => handleEdit(subject)} />
                    <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => handleDelete(subject.id)} />
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {filteredSubjects.length === 0 && (
          <EmptyState
            icon={Book}
            title="No subjects found"
            description={searchTerm ? 'Try a different search term.' : 'Start by adding a new subject.'}
            action={
              !searchTerm && (
                <Button icon={Plus} size="sm" onClick={() => setIsModalOpen(true)}>
                  Add Subject
                </Button>
              )
            }
          />
        )}
      </Card>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={performDelete}
        title="Delete Subject?"
        message="This action cannot be undone. This subject will be removed from the repository."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setIsEditMode(false); setEditingSubject(null); }}
        title={isEditMode ? 'Edit Subject' : 'New Subject'}
        subtitle="Define academic parameters"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button form="subject-form" type="submit" loading={loading}>
              {isEditMode ? 'Update Subject' : 'Create Subject'}
            </Button>
          </div>
        }
      >
        <form id="subject-form" onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Subject Name" required>
            <Input
              type="text"
              required
              placeholder="e.g. Mathematics"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </FormField>
          <FormField label="Subject Code" required>
            <Input
              type="text"
              required
              placeholder="e.g. MATH101"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            />
          </FormField>
          <FormField label="Subject Type" required>
            <div className="grid grid-cols-3 gap-2">
              {(['theory', 'practical', 'both'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({ ...formData, type })}
                  className={cn(
                    'py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all border-2',
                    formData.type === type
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
