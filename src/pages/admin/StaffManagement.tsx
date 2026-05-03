import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, setDoc, query, where } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, getApp } from 'firebase/app';
import { db, firebaseConfig } from '../../firebase';
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

export default function StaffManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'accounts',
    joiningDate: '',
    salary: '',
  });

  const fetchStaff = async () => {
    const querySnapshot = await getDocs(collection(db, 'staff'));
    const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StaffMember));
    setStaff(list);
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
        await setDoc(doc(db, 'staff', editingStaff.id), {
          ...formData,
          salary: Number(formData.salary),
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        // Update user profile
        const staffQuery = query(collection(db, 'users'), where('email', '==', editingStaff.email), where('role', '==', editingStaff.role));
        const staffDocs = await getDocs(staffQuery);
        if (!staffDocs.empty) {
          await setDoc(doc(db, 'users', staffDocs.docs[0].id), {
            name: formData.name,
          }, { merge: true });
        }

        setIsModalOpen(false);
        setIsEditMode(false);
        setEditingStaff(null);
        fetchStaff();
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

      const staffRef = await addDoc(collection(db, 'staff'), {
        ...formData,
        salary: Number(formData.salary),
        status: 'active',
      });

      // Create user profile for staff
      await setDoc(doc(db, 'users', staffUid), {
        uid: staffUid,
        email: formData.email,
        name: formData.name,
        role: formData.role === 'principal' ? 'principal' : formData.role === 'accounts' ? 'accounts' : 'super_admin',
        staffId: staffRef.id,
        createdAt: new Date().toISOString(),
      });

      setIsModalOpen(false);
      fetchStaff();
      setFormData({
        name: '',
        email: '',
        role: 'accounts',
        joiningDate: '',
        salary: '',
      });
      showToast(isEditMode ? 'Staff member updated successfully!' : 'Staff member created successfully!', 'success');
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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Staff & HR Management"
        subtitle="Manage non-faculty staff members and their roles."
        icon={Briefcase}
        iconColor="gradient-blue"
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              setIsEditMode(false);
              setEditingStaff(null);
              setFormData({ name: '', email: '', role: 'accounts', joiningDate: '', salary: '' });
              setIsModalOpen(true);
            }}
          >
            Add Staff Member
          </Button>
        }
      />

      <Card padding="none">
        <Table>
          <Thead>
            <Tr>
              <Th>Staff Member</Th>
              <Th>Role</Th>
              <Th>Email</Th>
              <Th>Joined</Th>
              <Th>Salary</Th>
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
                    <span className="font-semibold text-slate-900">{member.name}</span>
                  </div>
                </Td>
                <Td>
                  <Badge variant="indigo">{member.role}</Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {member.email}
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {member.joiningDate}
                  </div>
                </Td>
                <Td>
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
                  <IconButton icon={Edit2} variant="ghost" size="sm" onClick={() => handleEdit(member)} />
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
          <FormField label="Email Address" required>
            <Input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </FormField>
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
    </div>
  );
}
