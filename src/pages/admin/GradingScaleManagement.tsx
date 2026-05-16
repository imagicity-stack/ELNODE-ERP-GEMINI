import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { GradingScale, UserProfile } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import {
  Plus,
  Trash2,
  Edit2,
  Settings,
  PlusCircle,
} from 'lucide-react';
import {
  PageHeader, Card, Button, IconButton, Modal, ConfirmModal,
  FormField, Input, Table, Thead, Th, Tbody, Tr, Td, EmptyState
} from '../../components/ui';
import { validateGradingScale, ValidationIssue } from '../../services/examService';
import { useToast } from '../../components/Toast';
import { AlertTriangle } from 'lucide-react';

export default function GradingScaleManagement({ user }: { user: UserProfile }) {
  const [scales, setScales] = useState<GradingScale[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingScale, setEditingScale] = useState<GradingScale | null>(null);

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('grading-scales');
  const { showToast } = useToast();
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    ranges: [
      { grade: 'A+', min: 90, max: 100, point: 4.0, description: 'Excellent' },
      { grade: 'A', min: 80, max: 89, point: 3.7, description: 'Very Good' },
      { grade: 'B', min: 70, max: 79, point: 3.0, description: 'Good' },
      { grade: 'C', min: 60, max: 69, point: 2.0, description: 'Satisfactory' },
      { grade: 'D', min: 50, max: 59, point: 1.0, description: 'Pass' },
      { grade: 'F', min: 0, max: 49, point: 0.0, description: 'Fail' },
    ]
  });

  useEffect(() => {
    fetchScales();
  }, []);

  const fetchScales = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'gradingScales'));
      setScales(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GradingScale)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'gradingScales');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate ranges: no gaps, no overlaps, no out-of-bounds, no duplicate grades.
    const validation = validateGradingScale(formData.ranges);
    setIssues(validation);
    const errors = validation.filter(i => i.level === 'error');
    if (errors.length > 0) {
      showToast(errors[0].message, 'error');
      return;
    }
    if (!formData.name.trim()) {
      showToast('Scale name is required', 'error');
      return;
    }

    setLoading(true);
    try {
      if (editingScale) {
        await updateDoc(doc(db, 'gradingScales', editingScale.id), formData);
      } else {
        await addDoc(collection(db, 'gradingScales'), {
          ...formData,
          createdAt: new Date().toISOString(),
        });
      }
      setIsModalOpen(false);
      setEditingScale(null);
      setIssues([]);
      fetchScales();
      setFormData({ name: '', ranges: [{ grade: '', min: 0, max: 0, point: 0, description: '' }] });
      showToast('Grading scale saved', 'success');
    } catch (err) {
      handleFirestoreError(err, editingScale ? OperationType.UPDATE : OperationType.CREATE, editingScale ? `gradingScales/${editingScale.id}` : 'gradingScales');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setIsDeleteModalOpen(true);
  };

  const performDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'gradingScales', deletingId));
      fetchScales();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `gradingScales/${deletingId}`);
    }
  };

  const addRange = () => {
    setFormData({
      ...formData,
      ranges: [...formData.ranges, { grade: '', min: 0, max: 0, point: 0, description: '' }]
    });
  };

  const removeRange = (index: number) => {
    setFormData({
      ...formData,
      ranges: formData.ranges.filter((_, i) => i !== index)
    });
  };

  const updateRange = (index: number, field: string, value: any) => {
    const newRanges = [...formData.ranges];
    newRanges[index] = { ...newRanges[index], [field]: value };
    setFormData({ ...formData, ranges: newRanges });
  };

  const openCreate = () => {
    setEditingScale(null);
    setFormData({
      name: '',
      ranges: [
        { grade: 'A+', min: 90, max: 100, point: 4.0, description: 'Excellent' },
        { grade: 'A', min: 80, max: 89, point: 3.7, description: 'Very Good' },
        { grade: 'B', min: 70, max: 79, point: 3.0, description: 'Good' },
        { grade: 'C', min: 60, max: 69, point: 2.0, description: 'Satisfactory' },
        { grade: 'D', min: 50, max: 59, point: 1.0, description: 'Pass' },
        { grade: 'F', min: 0, max: 49, point: 0.0, description: 'Fail' },
      ]
    });
    setIsModalOpen(true);
  };

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-100">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Grading Scales</h1>
          <p className="text-xs text-amber-100 mt-0.5">{scales.length} scale{scales.length !== 1 ? 's' : ''} defined</p>
        </div>

        {!readOnly && (
          <div className="px-4 pt-3 pb-3 bg-white border-b border-slate-100">
            <button
              onClick={openCreate}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4" /> Create New Scale
            </button>
          </div>
        )}

        <div className="px-4 pt-3 pb-24 space-y-3">
          {scales.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-400 font-medium">No grading scales defined yet.</p>
            </div>
          ) : (
            scales.map((scale) => (
              <div key={scale.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">{scale.name}</h3>
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingScale(scale); setFormData({ name: scale.name, ranges: scale.ranges }); setIsModalOpen(true); }}
                        className="p-1.5 text-slate-500 hover:bg-white rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(scale.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="divide-y divide-slate-50">
                  {scale.ranges.sort((a, b) => b.min - a.min).map((range, idx) => (
                    <div key={idx} className="px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-8 text-center text-sm font-black text-slate-800">{range.grade}</span>
                        <span className="text-xs text-slate-500">{range.min}% – {range.max}%</span>
                      </div>
                      <span className="text-xs font-bold text-indigo-600">{range.point.toFixed(1)} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-8">
        <PageHeader
          title="Grading Scales"
          subtitle="Define and manage grading systems for different examinations."
          icon={Settings}
          iconColor="gradient-amber"
          actions={
            !readOnly && (
              <Button icon={Plus} onClick={openCreate}>
                Create New Scale
              </Button>
            )
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scales.map((scale) => (
            <Card key={scale.id} padding="none">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
                <h3 className="font-bold text-slate-900">{scale.name}</h3>
                {!readOnly && (
                  <div className="flex items-center gap-1">
                    <IconButton
                      icon={Edit2}
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingScale(scale);
                        setFormData({ name: scale.name, ranges: scale.ranges });
                        setIsModalOpen(true);
                      }}
                    />
                    <IconButton
                      icon={Trash2}
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(scale.id)}
                    />
                  </div>
                )}
              </div>
              <div className="p-5">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Grade</Th>
                      <Th>Range</Th>
                      <Th className="text-right">Point</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {scale.ranges.sort((a, b) => b.min - a.min).map((range, idx) => (
                      <Tr key={idx}>
                        <Td className="font-bold text-slate-700">{range.grade}</Td>
                        <Td className="text-slate-500">{range.min}% – {range.max}%</Td>
                        <Td className="text-right font-bold text-indigo-600">{range.point.toFixed(1)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            </Card>
          ))}
        </div>

        {scales.length === 0 && (
          <Card>
            <EmptyState
              icon={Settings}
              title="No grading scales defined"
              description="Create your first grading scale to get started."
              action={
                <Button icon={Plus} size="sm" onClick={() => setIsModalOpen(true)}>
                  Create Scale
                </Button>
              }
            />
          </Card>
        )}
      </div>

      {/* Shared Modals */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={performDelete}
        title="Delete Grading Scale?"
        message="This action cannot be undone. This grading scale will be permanently removed."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingScale(null); }}
        title={editingScale ? 'Edit Grading Scale' : 'Create New Grading Scale'}
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button form="grading-form" type="submit" loading={loading}>
              {editingScale ? 'Update Scale' : 'Create Scale'}
            </Button>
          </div>
        }
      >
        <form id="grading-form" onSubmit={handleSubmit} className="space-y-6">
          {issues.length > 0 && (
            <div className="space-y-1">
              {issues.map((iss, i) => (
                <div key={i} className={
                  'flex items-start gap-2 px-3 py-2 rounded-xl text-xs ' +
                  (iss.level === 'error' ? 'bg-rose-50 border border-rose-200 text-rose-700' : 'bg-amber-50 border border-amber-200 text-amber-700')
                }>
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{iss.message}</span>
                </div>
              ))}
            </div>
          )}
          <FormField label="Scale Name" required>
            <Input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Standard High School Scale"
            />
          </FormField>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">Grade Ranges</label>
              <Button variant="ghost" size="xs" icon={PlusCircle} type="button" onClick={addRange}>
                Add Range
              </Button>
            </div>

            <div className="space-y-2">
              {formData.ranges.map((range, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-3 items-end p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Grade</label>
                    <Input
                      type="text"
                      required
                      value={range.grade}
                      onChange={(e) => updateRange(idx, 'grade', e.target.value)}
                      placeholder="A+"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Min %</label>
                    <Input
                      type="number"
                      required
                      value={range.min}
                      onChange={(e) => updateRange(idx, 'min', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Max %</label>
                    <Input
                      type="number"
                      required
                      value={range.max}
                      onChange={(e) => updateRange(idx, 'max', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Point</label>
                      <Input
                        type="number"
                        step="0.1"
                        required
                        value={range.point}
                        onChange={(e) => updateRange(idx, 'point', parseFloat(e.target.value))}
                      />
                    </div>
                    <IconButton
                      icon={Trash2}
                      variant="danger"
                      size="sm"
                      type="button"
                      onClick={() => removeRange(idx)}
                      className="mb-0.5"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
