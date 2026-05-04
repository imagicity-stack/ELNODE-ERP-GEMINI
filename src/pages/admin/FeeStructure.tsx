import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  Plus,
  IndianRupee,
  Trash2,
  Save,
  Wallet,
  Receipt,
  AlertCircle,
  ChevronRight,
  Settings
} from 'lucide-react';
import { Class, FeeStructure as IFeeStructure, FeeHead, UserProfile } from '../../types';
import { logActivity } from '../../services/activityService';
import { useToast } from '../../components/Toast';
import {
  PageHeader, Card, Button, IconButton, FormField, Input, Select,
  Table, Thead, Th, Tbody, Tr, Td, EmptyState, Alert, Modal
} from '../../components/ui';

export default function FeeStructure({ user }: { user: UserProfile }) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [feeStructure, setFeeStructure] = useState<IFeeStructure | null>(null);
  const [globalHeads, setGlobalHeads] = useState<FeeHead[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isHeadModalOpen, setIsHeadModalOpen] = useState(false);
  const { showToast } = useToast();

  const [newHead, setNewHead] = useState<Omit<FeeHead, 'id'>>({
    name: '',
    amount: 0,
    description: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [classesSnap, headsSnap] = await Promise.all([
        getDocs(collection(db, 'classes')),
        getDocs(collection(db, 'feeHeads'))
      ]);
      
      const classesList = classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
      setClasses(classesList);
      setGlobalHeads(headsSnap.docs.map(doc => ({ ...doc.data() } as FeeHead)));

      if (classesList.length > 0 && !selectedClassId) {
        setSelectedClassId(classesList[0].id);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'classes');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGlobalHead = async () => {
    if (!newHead.name) return;
    setSaving(true);
    try {
      // Use name as ID for heads to keep them unique
      await setDoc(doc(db, 'feeHeads', newHead.name.replace(/\s+/g, '_').toLowerCase()), newHead);
      showToast('Global fee head saved!', 'success');
      fetchData();
      setNewHead({ name: '', amount: 0, description: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'feeHeads');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGlobalHead = async (name: string) => {
    try {
      await deleteDoc(doc(db, 'feeHeads', name.replace(/\s+/g, '_').toLowerCase()));
      showToast('Fee head deleted', 'success');
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'feeHeads');
    }
  };

  const fetchFeeStructure = async (classId: string) => {
    if (!classId) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'feeStructures'), where('classId', '==', classId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setFeeStructure({ id: snap.docs[0].id, ...snap.docs[0].data() } as IFeeStructure);
      } else {
        setFeeStructure({
          id: '',
          classId,
          heads: [],
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `feeStructures/${classId}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchFeeStructure(selectedClassId);
    }
  }, [selectedClassId]);

  const handleAddHead = () => {
    if (!newHead.name || newHead.amount <= 0) return;
    if (!feeStructure) return;

    const updatedHeads = [...feeStructure.heads, { ...newHead }];
    setFeeStructure({ ...feeStructure, heads: updatedHeads });
    setNewHead({ name: '', amount: 0, description: '' });
  };

  const handleRemoveHead = (index: number) => {
    if (!feeStructure) return;
    const updatedHeads = feeStructure.heads.filter((_, i) => i !== index);
    setFeeStructure({ ...feeStructure, heads: updatedHeads });
  };

  const handleSaveStructure = async () => {
    if (!feeStructure || !selectedClassId) return;
    setSaving(true);
    try {
      const structureData = {
        ...feeStructure,
        classId: selectedClassId,
        updatedAt: new Date().toISOString(),
      };

      if (feeStructure.id) {
        await setDoc(doc(db, 'feeStructures', feeStructure.id), structureData);
      } else {
        const docRef = await addDoc(collection(db, 'feeStructures'), structureData);
        setFeeStructure({ ...structureData, id: docRef.id });
      }
      showToast('Fee structure saved successfully!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'feeStructures');
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = feeStructure?.heads.reduce((acc, curr) => acc + curr.amount, 0) || 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Fee Structure Management"
        subtitle="Define class-wise fee heads and amounts."
        icon={Receipt}
        iconColor="gradient-emerald"
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              icon={Settings}
              onClick={() => setIsHeadModalOpen(true)}
            >
              Fee Heads
            </Button>
            <div className="w-px h-8 bg-slate-200 mx-2" />
            <Select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-40"
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Button
              icon={Save}
              onClick={handleSaveStructure}
              disabled={saving || !feeStructure}
              loading={saving}
            >
              Save Structure
            </Button>
          </div>
        }
      />

      {/* Global Fee Heads Modal */}
      <Modal
        isOpen={isHeadModalOpen}
        onClose={() => setIsHeadModalOpen(false)}
        title="Manage Global Fee Heads"
        subtitle="Define generic fee heads that can be used across classes."
        size="lg"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="sm:col-span-5">
              <FormField label="Head Name">
                <Input
                  type="text"
                  placeholder="e.g. Activity Fee"
                  value={newHead.name}
                  onChange={(e) => setNewHead({ ...newHead, name: e.target.value })}
                />
              </FormField>
            </div>
            <div className="sm:col-span-4">
              <FormField label="Default Amount (₹)">
                <Input
                  type="number"
                  placeholder="0"
                  value={newHead.amount || ''}
                  onChange={(e) => setNewHead({ ...newHead, amount: Number(e.target.value) })}
                />
              </FormField>
            </div>
            <div className="sm:col-span-3 flex items-end">
              <Button icon={Plus} onClick={handleSaveGlobalHead} className="w-full" loading={saving}>
                Add Head
              </Button>
            </div>
          </div>

          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Default Amount</Th>
                <Th className="text-right">Action</Th>
              </Tr>
            </Thead>
            <Tbody>
              {globalHeads.map((head, index) => (
                <Tr key={index}>
                  <Td className="font-bold text-slate-900">{head.name}</Td>
                  <Td className="font-bold text-slate-500">₹{(head.amount || 0).toLocaleString()}</Td>
                  <Td className="text-right">
                    <IconButton
                      icon={Trash2}
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteGlobalHead(head.name)}
                    />
                  </Td>
                </Tr>
              ))}
              {globalHeads.length === 0 && (
                <Tr>
                  <Td colSpan={3} className="text-center py-8 text-slate-400">No global fee heads defined.</Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </div>
      </Modal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Fee Heads List */}
        <div className="lg:col-span-2 space-y-6">
          <Card padding="none">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                Fee Heads for {classes.find(c => c.id === selectedClassId)?.name || 'Class'}
              </h3>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                {feeStructure?.heads.length || 0} Heads
              </span>
            </div>

            <div className="p-5 space-y-4">
              {/* Add New Head Row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100">
                <div className="sm:col-span-5">
                  <FormField label="Head Name">
                    <Input
                      type="text"
                      placeholder="e.g. Tuition Fee"
                      value={newHead.name}
                      onChange={(e) => setNewHead({ ...newHead, name: e.target.value })}
                    />
                  </FormField>
                </div>
                <div className="sm:col-span-4">
                  <FormField label="Amount (₹)">
                    <div className="relative">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <Input
                        type="number"
                        placeholder="0"
                        value={newHead.amount || ''}
                        onChange={(e) => setNewHead({ ...newHead, amount: Number(e.target.value) })}
                        className="pl-9"
                      />
                    </div>
                  </FormField>
                </div>
                <div className="sm:col-span-3 flex items-end">
                  <Button icon={Plus} onClick={handleAddHead} className="w-full">
                    Add
                  </Button>
                </div>
              </div>

              <Table>
                <Thead>
                  <Tr>
                    <Th>Fee Head</Th>
                    <Th>Description</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Remove</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {feeStructure?.heads.map((head, index) => (
                    <Tr key={index}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg gradient-emerald flex items-center justify-center text-white">
                            <IndianRupee className="w-4 h-4" />
                          </div>
                          <span className="font-semibold text-slate-900">{head.name}</span>
                        </div>
                      </Td>
                      <Td className="text-slate-500">{head.description || '—'}</Td>
                      <Td className="text-right font-bold text-slate-900">₹{(head.amount || 0).toLocaleString()}</Td>
                      <Td className="text-right">
                        <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => handleRemoveHead(index)} />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {(!feeStructure?.heads.length) && (
                <EmptyState
                  icon={Receipt}
                  title="No fee heads defined"
                  description="Start by adding heads using the form above."
                />
              )}
            </div>
          </Card>
        </div>

        {/* Right: Summary & Stats */}
        <div className="space-y-6">
          <Card padding="none">
            <div className="p-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-t-2xl">
              <div className="flex items-center justify-between mb-8">
                <Wallet className="w-8 h-8 opacity-50" />
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Structure Summary</span>
              </div>
              <p className="text-xs opacity-80 font-bold uppercase tracking-wider">Total Class Fee</p>
              <h2 className="text-4xl font-black mt-1">₹{(totalAmount || 0).toLocaleString()}</h2>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 font-medium">Total Heads</span>
                <span className="font-bold text-slate-900">{feeStructure?.heads.length || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 font-medium">Last Updated</span>
                <span className="font-bold text-slate-900">
                  {feeStructure?.updatedAt ? new Date(feeStructure.updatedAt).toLocaleDateString() : 'Never'}
                </span>
              </div>
            </div>
          </Card>

          <Alert variant="warning" title="Important Note">
            <ul className="space-y-2 mt-1">
              <li className="flex gap-2 items-start">
                <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                Fee structures defined here will be used as templates by the accountant.
              </li>
              <li className="flex gap-2 items-start">
                <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                Changes here will not affect already generated fee requests.
              </li>
              <li className="flex gap-2 items-start">
                <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                You can add custom heads or discounts while generating individual requests.
              </li>
            </ul>
          </Alert>
        </div>
      </div>
    </div>
  );
}
