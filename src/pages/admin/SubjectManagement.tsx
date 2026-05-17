import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Plus, Book, Trash2, Edit2, Hash, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Subject, UserProfile } from '../../types';
import { logActivity } from '../../services/activityService';
import { usePermissions } from '../../hooks/usePermissions';
import {
  PageHeader, Card, Badge, Button, IconButton, Modal, ConfirmModal,
  SearchInput, FormField, Input, Select, Table, Thead, Th, Tbody, Tr, Td, EmptyState
} from '../../components/ui';

export default function SubjectManagement({ user }: { user: UserProfile }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('subjects');

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
        logActivity(
          user,
          'Subject Created',
          'Academic',
          `Created subject "${formData.name}" (${formData.code})`,
          { name: formData.name, code: formData.code, type: formData.type }
        );
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
      const deleted = subjects.find(s => s.id === deletingId);
      await deleteDoc(doc(db, 'subjects', deletingId));
      logActivity(
        user,
        'Subject Deleted',
        'Academic',
        `Deleted subject "${deleted?.name || deletingId}"`,
        { subjectId: deletingId, name: deleted?.name, code: deleted?.code }
      );
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

  const openAdd = () => {
    setIsEditMode(false);
    setEditingSubject(null);
    setFormData({ name: '', code: '', type: 'theory' });
    setIsModalOpen(true);
  };

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Subjects</h1>
          <p className="text-xs text-indigo-100 mt-0.5">{subjects.length} subjects defined</p>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name or code..."
            className="mt-3 w-full px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-sm text-white placeholder:text-white/60 focus:outline-none focus:bg-white/20"
          />
        </div>

        <div className="px-4 pt-4 space-y-2.5">
          {filteredSubjects.length === 0 ? (
            <div className="py-12 text-center">
              <Book className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No subjects</p>
            </div>
          ) : (
            filteredSubjects.map((subject) => (
              <div key={subject.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0">
                  <Book className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{subject.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-[10px] font-bold text-indigo-600">{subject.code}</span>
                    <Badge variant={typeVariant(subject.type || 'theory')} className="text-[9px]">{subject.type || 'theory'}</Badge>
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleEdit(subject)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
                      <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                    </button>
                    <button onClick={() => handleDelete(subject.id)} className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center active:scale-90 transition-transform">
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {!readOnly && (
          <button
            onClick={openAdd}
            className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Subject Repository"
        subtitle="Define and manage academic subjects with specific codes."
        icon={Book}
        iconColor="gradient-indigo"
        actions={
          !readOnly && (
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
          )
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
                  {!readOnly && (
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Edit2} variant="ghost" size="sm" onClick={() => handleEdit(subject)} />
                      <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => handleDelete(subject.id)} />
                    </div>
                  )}
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
      </div>

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
    </>
  );
}
