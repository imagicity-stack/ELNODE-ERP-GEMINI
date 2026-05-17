import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Plus, Home, Trash2, Edit2, User } from 'lucide-react';
import { House, Teacher, UserProfile } from '../../types';
import { logActivity } from '../../services/activityService';
import { usePermissions } from '../../hooks/usePermissions';
import {
  PageHeader, Card, Button, IconButton, Modal, ConfirmModal,
  SearchInput, FormField, Input, Select, Table, Thead, Th, Tbody, Tr, Td, EmptyState, Avatar
} from '../../components/ui';

export default function HouseManagement({ user }: { user: UserProfile }) {
  const [houses, setHouses] = useState<House[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingHouse, setEditingHouse] = useState<House | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('houses');

  const [formData, setFormData] = useState({
    name: '',
    color: '#4f46e5',
    teacherInchargeId: '',
  });

  const fetchData = async () => {
    try {
      const houseSnapshot = await getDocs(collection(db, 'houses'));
      const houseList = houseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as House));
      setHouses(houseList);

      const teacherSnapshot = await getDocs(collection(db, 'teachers'));
      const teacherList = teacherSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));
      setTeachers(teacherList);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'houses/teachers');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEditMode && editingHouse) {
        await updateDoc(doc(db, 'houses', editingHouse.id), formData);
      } else {
        await addDoc(collection(db, 'houses'), formData);
        logActivity(
          user,
          'House Created',
          'Academic',
          `Created house "${formData.name}"`,
          { name: formData.name, color: formData.color }
        );
      }
      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingHouse(null);
      fetchData();
      setFormData({ name: '', color: '#4f46e5', teacherInchargeId: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, isEditMode ? `houses/${editingHouse?.id}` : 'houses');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (house: House) => {
    setEditingHouse(house);
    setIsEditMode(true);
    setFormData({
      name: house.name,
      color: house.color,
      teacherInchargeId: house.teacherInchargeId || '',
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
      const deleted = houses.find(h => h.id === deletingId);
      await deleteDoc(doc(db, 'houses', deletingId));
      logActivity(
        user,
        'House Deleted',
        'Academic',
        `Deleted house "${deleted?.name || deletingId}"`,
        { houseId: deletingId, name: deleted?.name }
      );
      fetchData();
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `houses/${deletingId}`);
    }
  };

  const filteredHouses = houses.filter(h =>
    h.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Houses</h1>
          <p className="text-xs text-violet-200 mt-0.5">{houses.length} house{houses.length !== 1 ? 's' : ''} configured</p>
        </div>

        <div className="px-4 pt-3 pb-2 bg-white border-b border-slate-100 space-y-2">
          <input
            type="text"
            placeholder="Search houses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
          />
        </div>

        <div className="px-4 pt-3 pb-24 space-y-3">
          {filteredHouses.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-400 font-medium">{searchTerm ? 'No results found.' : 'No houses created yet.'}</p>
            </div>
          ) : (
            filteredHouses.map((house) => {
              const incharge = teachers.find(t => t.id === house.teacherInchargeId);
              return (
                <div key={house.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                      style={{ backgroundColor: house.color }}
                    >
                      <Home className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900">{house.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-3 h-3 rounded-full border border-slate-200" style={{ backgroundColor: house.color }} />
                        <span className="font-mono text-[10px] text-slate-400">{house.color}</span>
                      </div>
                      {incharge && (
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <User className="w-3 h-3" /> {incharge.name}
                        </p>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleEdit(house)}
                          className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(house.id)}
                          className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!readOnly && (
          <button
            onClick={() => {
              setIsEditMode(false);
              setEditingHouse(null);
              setFormData({ name: '', color: '#4f46e5', teacherInchargeId: '' });
              setIsModalOpen(true);
            }}
            className="fixed bottom-5 right-5 w-14 h-14 bg-violet-600 text-white rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform z-30"
          >
            <Plus className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-8">
        <PageHeader
          title="House Management"
          subtitle="Organize students into houses and assign teacher incharges."
          icon={Home}
          iconColor="gradient-violet"
          actions={
            !readOnly && (
              <Button
                icon={Plus}
                onClick={() => {
                  setIsEditMode(false);
                  setEditingHouse(null);
                  setFormData({ name: '', color: '#4f46e5', teacherInchargeId: '' });
                  setIsModalOpen(true);
                }}
              >
                Create New House
              </Button>
            )
          }
        />

        <Card padding="sm">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search houses..."
          />
        </Card>

        <Card padding="none">
          <Table>
            <Thead>
              <Tr>
                <Th>House</Th>
                <Th>Color</Th>
                <Th>Teacher Incharge</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredHouses.map((house) => {
                const incharge = teachers.find(t => t.id === house.teacherInchargeId);
                return (
                  <Tr key={house.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                          style={{ backgroundColor: house.color }}
                        >
                          <Home className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-slate-900">{house.name}</span>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: house.color }} />
                        <span className="font-mono text-xs text-slate-500">{house.color}</span>
                      </div>
                    </Td>
                    <Td>
                      {incharge ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={incharge.name} size="sm" />
                          <span className="text-sm text-slate-700">{incharge.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400 italic">Not Assigned</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      {!readOnly && (
                        <div className="flex items-center justify-end gap-1">
                          <IconButton icon={Edit2} variant="ghost" size="sm" onClick={() => handleEdit(house)} />
                          <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => handleDelete(house.id)} />
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          {filteredHouses.length === 0 && (
            <EmptyState
              icon={Home}
              title="No houses found"
              description={searchTerm ? 'Try a different search term.' : 'Create your first house to get started.'}
              action={
                !searchTerm && (
                  <Button icon={Plus} size="sm" onClick={() => setIsModalOpen(true)}>
                    Create House
                  </Button>
                )
              }
            />
          )}
        </Card>
      </div>

      {/* Shared Modals */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={performDelete}
        title="Delete House?"
        message="This action cannot be undone. All data associated with this house will be removed."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setIsEditMode(false); setEditingHouse(null); }}
        title={isEditMode ? 'Edit House' : 'New House'}
        subtitle="Define house parameters"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button form="house-form" type="submit" loading={loading}>
              {isEditMode ? 'Update House' : 'Create House'}
            </Button>
          </div>
        }
      >
        <form id="house-form" onSubmit={handleSubmit} className="space-y-4">
          <FormField label="House Name" required>
            <Input
              type="text"
              required
              placeholder="e.g. Red House"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </FormField>
          <FormField label="House Color" required>
            <div className="flex gap-3">
              <input
                type="color"
                required
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-11 h-11 p-1 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
              />
              <Input
                type="text"
                required
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="font-mono"
              />
            </div>
          </FormField>
          <FormField label="Teacher Incharge">
            <Select
              value={formData.teacherInchargeId}
              onChange={(e) => setFormData({ ...formData, teacherInchargeId: e.target.value })}
            >
              <option value="">Select Teacher</option>
              {teachers.map(teacher => (
                <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
              ))}
            </Select>
          </FormField>
        </form>
      </Modal>
    </>
  );
}
