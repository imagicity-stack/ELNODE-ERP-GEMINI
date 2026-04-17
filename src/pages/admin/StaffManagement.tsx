import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, setDoc, query, where } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, getApp } from 'firebase/app';
import { db, firebaseConfig } from '../../firebase';
import { 
  Plus, 
  Search, 
  Briefcase, 
  UserCheck, 
  Mail, 
  Phone, 
  Calendar, 
  X, 
  UserPlus,
  MoreVertical,
  Edit2,
  Shield,
  CreditCard
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '../../components/Toast';

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff & HR Management</h1>
          <p className="text-gray-500 text-sm">Manage non-faculty staff members and their roles.</p>
        </div>
        <button 
          onClick={() => {
            setIsEditMode(false);
            setEditingStaff(null);
            setFormData({
              name: '',
              email: '',
              role: 'accounts',
              joiningDate: '',
              salary: '',
            });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Staff Member
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {staff.map((member) => (
          <motion.div
            key={member.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Briefcase className="w-6 h-6" />
              </div>
              <div className={cn(
                "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                member.status === 'active' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
              )}>
                {member.status}
              </div>
            </div>
            <h3 className="text-lg font-bold text-gray-900">{member.name}</h3>
            <p className="text-sm text-blue-600 font-medium capitalize">{member.role}</p>
            
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Mail className="w-4 h-4 text-gray-400" />
                {member.email}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Calendar className="w-4 h-4 text-gray-400" />
                Joined: {member.joiningDate}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <CreditCard className="w-4 h-4 text-gray-400" />
                Salary: ${(member.salary || 0).toLocaleString()}
              </div>
            </div>

            <div className="mt-6 pt-6 border-t flex items-center justify-between">
              <button className="text-sm font-bold text-gray-400 hover:text-gray-600">
                View Details
              </button>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleEdit(member)}
                  className="p-2 hover:bg-blue-50 rounded-lg text-blue-400 hover:text-blue-600 transition-all"
                  title="Edit Staff"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button className="p-2 hover:bg-gray-50 rounded-lg text-gray-400">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                    {isEditMode ? <Edit2 className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{isEditMode ? 'Edit Staff Member' : 'Add Staff Member'}</h2>
                    <p className="text-sm text-gray-500">{isEditMode ? 'Update staff information.' : 'Register a new staff member.'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsEditMode(false);
                    setEditingStaff(null);
                  }} 
                  className="p-2 hover:bg-gray-200 rounded-full transition-all"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input 
                    type="text" required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input 
                    type="email" required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select 
                      required
                      value={formData.role}
                      onChange={(e) => setFormData({...formData, role: e.target.value as any})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                    >
                      <option value="principal">Principal</option>
                      <option value="accounts">Accounts</option>
                      <option value="admin">Admin Staff</option>
                      <option value="security">Security</option>
                      <option value="transport">Transport</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salary</label>
                    <input 
                      type="number" required
                      value={formData.salary}
                      onChange={(e) => setFormData({...formData, salary: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Joining Date</label>
                  <input 
                    type="date" required
                    value={formData.joiningDate}
                    onChange={(e) => setFormData({...formData, joiningDate: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-4 pt-6 border-t">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsEditMode(false);
                      setEditingStaff(null);
                    }}
                    className="px-6 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="px-8 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
                  >
                    {loading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Staff' : 'Add Staff')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
