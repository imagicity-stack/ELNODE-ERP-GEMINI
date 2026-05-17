import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { logActivity } from '../../services/activityService';
import {
  validateStaffInput,
  ensureUniqueEmail,
  provisionStaffAuthAccount,
  updateStaffWithUserSync,
  normalizeEmail,
  ConcurrentEditError,
} from '../../services/staffService';
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
import { fmtDate } from '../../lib/utils';
import {
  PageHeader, Card, Badge, Button, IconButton, Modal,
  FormField, Input, Select, Table, Thead, Th, Tbody, Tr, Td, EmptyState, Avatar
} from '../../components/ui';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'principal' | 'accounts' | 'admin' | 'security' | 'transport' | 'grievance_officer';
  joiningDate: string;
  salary: number;
  status: 'active' | 'on-leave' | 'resigned';
  version?: number;
}

const ALLOWED_ROLES: ReadonlyArray<StaffMember['role']> = [
  'principal', 'accounts', 'admin', 'security', 'transport', 'grievance_officer',
];
const PORTAL_ROLES: ReadonlyArray<string> = ['principal', 'accounts', 'grievance_officer'];
const DEFAULT_PASSWORD = 'password123';

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
    employeeId: '',
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
    if (loading) return; // guard against double-submit
    setLoading(true);
    try {
      const salaryNum = Number(formData.salary);
      const validationErr = validateStaffInput({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        salary: salaryNum,
      });
      if (validationErr) {
        showToast(validationErr, 'error');
        return;
      }
      if (!ALLOWED_ROLES.includes(formData.role as StaffMember['role'])) {
        showToast('Invalid role selected', 'error');
        return;
      }
      if (!formData.joiningDate) {
        showToast('Joining date is required', 'error');
        return;
      }

      const normalizedEmail = normalizeEmail(formData.email);
      const portalRole = PORTAL_ROLES.includes(formData.role) ? formData.role : 'office_staff';

      if (isEditMode && editingStaff) {
        try {
          await updateStaffWithUserSync({
            collectionName: 'staff',
            docId: editingStaff.id,
            expectedVersion: editingStaff.version ?? 0,
            updates: {
              employeeId: formData.employeeId.trim(),
              name: formData.name.trim(),
              email: normalizedEmail,
              phone: formData.phone,
              role: formData.role,
              joiningDate: formData.joiningDate,
              salary: salaryNum,
            },
            originalEmail: editingStaff.email,
            userProfileUpdates: {
              name: formData.name.trim(),
              email: normalizedEmail,
              phone: formData.phone,
              role: portalRole,
            },
          });
          showToast('Staff member updated successfully!', 'success');
        } catch (err: any) {
          if (err instanceof ConcurrentEditError) {
            showToast(err.message, 'error');
            fetchStaff();
            return;
          }
          throw err;
        }
        setIsModalOpen(false);
        setIsEditMode(false);
        setEditingStaff(null);
        fetchStaff();
        return;
      }

      // CREATE PATH — duplicate-email check first so we don't orphan auth users
      await ensureUniqueEmail(normalizedEmail);

      // Provision the auth account (also cleans up secondary app afterwards)
      const staffUid = await provisionStaffAuthAccount(normalizedEmail, DEFAULT_PASSWORD);

      let staffRef;
      try {
        staffRef = await addDoc(collection(db, 'staff'), {
          employeeId: formData.employeeId.trim(),
          name: formData.name.trim(),
          email: normalizedEmail,
          phone: formData.phone,
          role: formData.role,
          joiningDate: formData.joiningDate,
          salary: salaryNum,
          status: 'active',
          version: 1,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'staff');
        throw err;
      }

      try {
        await setDoc(doc(db, 'users', staffUid), {
          uid: staffUid,
          email: normalizedEmail,
          name: formData.name.trim(),
          phone: formData.phone,
          role: portalRole,
          staffId: staffRef.id,
          createdAt: new Date().toISOString(),
        });
        logActivity(
          user,
          'Staff User Provisioned',
          'Staff',
          `Provisioned portal user account for ${normalizedEmail}`,
          { email: normalizedEmail, role: portalRole, staffId: staffRef.id }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${staffUid}`);
        throw err;
      }

      logActivity(
        user,
        'Staff Member Added',
        'Staff',
        `Added staff member ${formData.name.trim()} as ${formData.role}`,
        {
          name: formData.name.trim(),
          role: formData.role,
          email: normalizedEmail,
          employeeId: formData.employeeId.trim(),
        }
      );

      setIsModalOpen(false);
      fetchStaff();
      setFormData({
        employeeId: '',
        name: '',
        email: '',
        phone: '',
        role: 'accounts',
        joiningDate: '',
        salary: '',
      });
      showToast('Staff member created successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      if (err?.code === 'auth/operation-not-allowed') {
        showToast('Firebase Error: Email/Password sign-in is not enabled in your Firebase Console.', 'error');
      } else {
        showToast(err?.message || 'Unknown error', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (member: StaffMember) => {
    setEditingStaff(member);
    setIsEditMode(true);
    setFormData({
      employeeId: member.employeeId || '',
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
                    {fmtDate(member.joiningDate)}
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
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Employee ID" required hint="e.g. EMP001 — used on payslips">
              <Input
                type="text"
                required
                placeholder="EMP001"
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value.toUpperCase() })}
              />
            </FormField>
            <FormField label="Full Name" required>
              <Input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </FormField>
          </div>
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
                <option value="grievance_officer">Grievance Officer</option>
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
