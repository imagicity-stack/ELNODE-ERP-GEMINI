import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, setDoc, query, where } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, getApp } from 'firebase/app';
import { db, firebaseConfig, handleFirestoreError, OperationType } from '../../firebase';
import {
  Plus,
  Briefcase,
  Mail,
  Calendar,
  UserPlus,
  Edit2,
  CreditCard
} from 'lucide-react';
import { useToast } from '../../components/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import {
  PageHeader, Card, Badge, Button, IconButton, Modal,
  FormField, Input, Select, Table, Thead, Th, Tbody, Tr, Td, EmptyState, Avatar
} from '../../components/ui';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: 'principal' | 'accounts' | 'admin' | 'security' | 'transport';
  joiningDate: string;
  salary: number;
  status: 'active' | 'on-leave' | 'resigned';
}

export default function StaffManagement({ user }: { user: any }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('staff');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'accounts',
    joiningDate: '',
    salary: '',
  });

  const fetchStaff = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'staff'));
      const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StaffMember));
      setStaff(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'staff');
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEditMode && editingStaff) {
        // Update existing staff
        try {
          await setDoc(doc(db, 'staff', editingStaff.id), {
            ...formData,
            salary: Number(formData.salary),
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `staff/${editingStaff.id}`);
        }

        // Update user profile
        try {
          const staffQuery = query(collection(db, 'users'), where('email', '==', editingStaff.email), where('role', '==', editingStaff.role));
          const staffDocs = await getDocs(staffQuery);
          if (!staffDocs.empty) {
            await setDoc(doc(db, 'users', staffDocs.docs[0].id), {
              name: formData.name,
            }, { merge: true });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'users');
        }

        setIsModalOpen(false);
        setIsEditMode(false);
        setEditingStaff(null);
        fetchStaff();
        showToast('Staff member updated successfully!', 'success');
        return;
      }

      const defaultPassword = 'password123';

      // Initialize secondary app for user creation without signing out admin
      let secondaryApp;
      try {
        secondaryApp = getApp('Secondary');
      } catch (e) {
        secondaryApp = initializeApp(firebaseConfig, 'Secondary');
      }
      const secondaryAuth = getAuth(secondaryApp);

      const getOrCreateUser = async (email: string) => {
        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, email, defaultPassword);
          const uid = cred.user.uid;
          await signOut(secondaryAuth);
          return uid;
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
            try {
              const cred = await signInWithEmailAndPassword(secondaryAuth, email, defaultPassword);
              const uid = cred.user.uid;
              await signOut(secondaryAuth);
              return uid;
            } catch (signInErr: any) {
              if (signInErr.code === 'auth/invalid-credential' || signInErr.code === 'auth/wrong-password') {
                throw new Error(`The email ${email} is already in use with a different password. Please contact support to reset it.`);
              }
              throw signInErr;
            }
          }
          throw err;
        }
      };

      // Create Auth Account
      const staffUid = await getOrCreateUser(formData.email);

      let staffRef;
      try {
        staffRef = await addDoc(collection(db, 'staff'), {
          ...formData,
          salary: Number(formData.salary),
          status: 'active',
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'staff');
      }

      // Create user profile for staff
      try {
        await setDoc(doc(db, 'users', staffUid), {
          uid: staffUid,
          email: formData.email,
          name: formData.name,
          // Portal roles are intentionally limited; keep the staff job type in the
          // staff document and map non-portal staff roles to the staff portal.
          role: ['principal', 'accounts'].includes(formData.role) ? formData.role : 'office_staff',
          staffId: staffRef?.id,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${staffUid}`);
      }

      setIsModalOpen(false);
      fetchStaff();
      setFormData({
        name: '',
        email: '',
        role: 'accounts',
        joiningDate: '',
        salary: '',
      });
      showToast('Staff member created successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        showToast('Firebase Error: Email/Password sign-in is not enabled in your Firebase Console.', 'error');
      } else {
        showToast('Error: ' + (err.message || 'Unknown error'), 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (member: StaffMember) => {
    setEditingStaff(member);
    setIsEditMode(true);
    setFormData({
      name: member.name,
      email: member.email,
      phone: member.phone || '',
      role: member.role,
      joiningDate: member.joiningDate,
      salary: member.salary.toString(),
    });
    setIsModalOpen(true);
  };

  const statusVariant = (status: string) => {
    if (status === 'active') return 'success';
    if (status === 'on-leave') return 'warning';
    return 'error';
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingStaff(null);
    setFormData({ name: '', email: '', phone: '', role: 'accounts', joiningDate: '', salary: '' });
    setIsModalOpen(true);
  };

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Staff & HR</h1>
          <p className="text-xs text-indigo-100 mt-0.5">{staff.length} non-faculty members</p>
        </div>

        <div className="px-4 pt-4 space-y-2.5">
          {staff.length === 0 ? (
            <div className="py-12 text-center">
              <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No staff yet</p>
              <p className="text-xs text-slate-500 mt-1">Tap + to add a member</p>
            </div>
          ) : (
            staff.map((member) => (
              <button
                key={member.id}
                onClick={() => !readOnly && handleEdit(member)}
                className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-3 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={member.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{member.name}</p>
                    <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                      <Mail className="w-3 h-3 shrink-0" />{member.email}
                    </p>
                  </div>
                  <Badge variant={statusVariant(member.status)} className="text-[9px] shrink-0">
                    {member.status}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md uppercase">{member.role}</span>
                  <span className="text-slate-500">₹{(member.salary || 0).toLocaleString()}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {!readOnly && (
          <button
            onClick={openAddModal}
            className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Staff & HR Management"
        subtitle="Manage non-faculty staff members and their roles."
        icon={Briefcase}
        iconColor="gradient-blue"
        actions={
          !readOnly && (
            <Button
              icon={Plus}
              onClick={() => {
                setIsEditMode(false);
                setEditingStaff(null);
                setFormData({ name: '', email: '', phone: '', role: 'accounts', joiningDate: '', salary: '' });
                setIsModalOpen(true);
              }}
            >
              Add Staff Member
            </Button>
          )
        }
      />

      <Card padding="none">
        <Table>
          <Thead>
            <Tr>
              <Th>Staff Member</Th>
              <Th>Role</Th>
              <Th className="hidden md:table-cell">Email</Th>
              <Th className="hidden lg:table-cell">Joined</Th>
              <Th className="hidden sm:table-cell">Salary</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {staff.map((member) => (
              <Tr key={member.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name} size="sm" />
                    <div>
                      <span className="font-semibold text-slate-900 block">{member.name}</span>
                      <span className="text-[10px] text-slate-400 md:hidden">{member.email}</span>
                    </div>
                  </div>
                </Td>
                <Td>
                  <Badge variant="indigo">{member.role}</Badge>
                </Td>
                <Td className="hidden md:table-cell">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {member.email}
                  </div>
                </Td>
                <Td className="hidden lg:table-cell">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {member.joiningDate}
                  </div>
                </Td>
                <Td className="hidden sm:table-cell">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                    ${(member.salary || 0).toLocaleString()}
                  </div>
                </Td>
                <Td>
                  <Badge variant={statusVariant(member.status)} dot>
                    {member.status}
                  </Badge>
                </Td>
                <Td className="text-right">
                  {!readOnly && (
                    <IconButton icon={Edit2} variant="ghost" size="sm" onClick={() => handleEdit(member)} />
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {staff.length === 0 && (
          <EmptyState
            icon={Briefcase}
            title="No staff members yet"
            description="Add your first staff member to get started."
            action={
              <Button icon={Plus} size="sm" onClick={() => setIsModalOpen(true)}>
                Add Staff Member
              </Button>
            }
          />
        )}
      </Card>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setIsEditMode(false); setEditingStaff(null); }}
        title={isEditMode ? 'Edit Staff Member' : 'Add Staff Member'}
        subtitle={isEditMode ? 'Update staff information.' : 'Register a new staff member.'}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => { setIsModalOpen(false); setIsEditMode(false); setEditingStaff(null); }}>
              Cancel
            </Button>
            <Button form="staff-form" type="submit" loading={loading} icon={isEditMode ? Edit2 : UserPlus}>
              {isEditMode ? 'Update Staff' : 'Add Staff'}
            </Button>
          </div>
        }
      >
        <form id="staff-form" onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Full Name" required>
            <Input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Email Address" required>
              <Input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </FormField>
            <FormField label="Phone Number" required>
              <Input
                type="tel"
                required
                placeholder="10-digit number"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Role" required>
              <Select
                required
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
              >
                <option value="principal">Principal</option>
                <option value="accounts">Accounts</option>
                <option value="admin">Admin Staff</option>
                <option value="security">Security</option>
                <option value="transport">Transport</option>
              </Select>
            </FormField>
            <FormField label="Salary" required>
              <Input
                type="number"
                required
                value={formData.salary}
                onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="Joining Date" required>
            <Input
              type="date"
              required
              value={formData.joiningDate}
              onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
            />
          </FormField>
        </form>
      </Modal>
    </>
  );
}
