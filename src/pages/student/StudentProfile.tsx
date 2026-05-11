import { UserProfile, Student, Class } from '../../types';
import { User, Mail, Shield, Edit2, Camera, UserCircle, GraduationCap, Calendar, Hash, ChevronRight, Lock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  FormField,
  Input,
  Alert,
} from '../../components/ui';

interface StudentProfileProps {
  user: UserProfile;
  student: Student | null;
}

export default function StudentProfile({ user, student }: StudentProfileProps) {
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [className, setClassName] = useState<string>('');

  useEffect(() => {
    if (student?.classId) {
      const fetchClass = async () => {
        try {
          const classDoc = await getDoc(doc(db, 'classes', student.classId));
          if (classDoc.exists()) {
            setClassName(classDoc.data().name);
          } else {
            setClassName(student.classId);
          }
        } catch (err) {
          setClassName(student.classId);
        }
      };
      fetchClass();
    }
  }, [student?.classId]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) throw new Error('No user logged in.');

      const credential = EmailAuthProvider.credential(currentUser.email, passwordData.currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, passwordData.newPassword);

      setSuccess('Password updated successfully!');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setIsChangingPassword(false), 2000);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Current password is incorrect.');
      } else {
        setError(err.message || 'Failed to update password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        {/* Banner + Avatar */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-4 pt-5 pb-16 text-white relative">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Student Portal</p>
          <h1 className="text-xl font-bold mt-0.5">My Profile</h1>
        </div>

        <div className="px-4 -mt-10 mb-4">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-4 flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <UserCircle className="w-9 h-9 text-emerald-600" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">{user.name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Student · Class {className}-{student?.section}</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <span className="text-[10px] font-bold text-emerald-600">Active</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pb-24 space-y-4">
          {/* Academic Details */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Academic Details</p>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <Hash className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">School / Admission Number</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{student?.admissionNumber || student?.schoolNumber || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Class & Section</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">Class {className} – {student?.section || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Email Address</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">{user.email}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Security */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Security</p>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 p-4 border-b border-slate-50">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Account Status</p>
                  <p className="text-sm font-bold text-emerald-600 mt-0.5">Verified & Active</p>
                </div>
              </div>

              {!isChangingPassword ? (
                <button
                  onClick={() => setIsChangingPassword(true)}
                  className="w-full flex items-center gap-3 p-4 text-left active:bg-slate-50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">Change Password</p>
                    <p className="text-xs text-slate-400 mt-0.5">Update your account password</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              ) : (
                <div className="p-4">
                  <form onSubmit={handlePasswordChange} className="space-y-3">
                    <FormField label="Current Password" required>
                      <Input
                        type="password"
                        placeholder="Current Password"
                        required
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      />
                    </FormField>
                    <FormField label="New Password" required>
                      <Input
                        type="password"
                        placeholder="New Password"
                        required
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Confirm New Password" required>
                      <Input
                        type="password"
                        placeholder="Confirm New Password"
                        required
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      />
                    </FormField>
                    {error && <Alert variant="error">{error}</Alert>}
                    {success && <Alert variant="success">{success}</Alert>}
                    <div className="flex gap-2 pt-1">
                      <Button type="submit" variant="success" size="sm" loading={loading} className="flex-1">
                        Update Password
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => { setIsChangingPassword(false); setError(''); setSuccess(''); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block max-w-4xl mx-auto space-y-8">
        <PageHeader
          title="My Profile"
          subtitle="Manage your account details and security settings."
          icon={UserCircle}
          iconColor="gradient-emerald"
        />

        <Card padding="none" className="overflow-hidden">
          {/* Banner */}
          <div className="h-32 bg-gradient-to-r from-emerald-500 to-teal-600"></div>

          <div className="px-8 pb-8">
            {/* Avatar + Edit row */}
            <div className="relative -mt-12 flex items-end justify-between mb-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-2xl bg-white p-1 shadow-lg">
                  <div className="w-full h-full rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <UserCircle className="w-12 h-12" />
                  </div>
                </div>
                <button className="absolute -bottom-2 -right-2 p-2 bg-white rounded-lg shadow-md text-slate-400 hover:text-emerald-600 transition-all border border-slate-100">
                  <Camera className="w-4 h-4" />
                </button>
              </div>
              <Button variant="primary" icon={Edit2}>
                Edit Profile
              </Button>
            </div>

            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900">{user.name}</h1>
              <p className="text-slate-500 font-medium capitalize">Student • Class {className}-{student?.section}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Academic & Contact */}
              <div className="space-y-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Academic Details</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm">
                      <Hash className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Admission / School Number</p>
                      <p className="text-sm font-bold text-slate-900">{student?.admissionNumber || student?.schoolNumber || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Class & Section</p>
                      <p className="text-sm font-bold text-slate-900">Class {className} - {student?.section}</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-8">Contact Information</p>
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Email Address</p>
                    <p className="text-sm font-bold text-slate-900">{user.email}</p>
                  </div>
                </div>
              </div>

              {/* Account Security */}
              <div className="space-y-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Account Security</p>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Account Status</p>
                      <p className="text-sm font-bold text-emerald-600">Verified & Active</p>
                    </div>
                  </div>

                  <div className="p-6 bg-emerald-50 rounded-2xl">
                    <h4 className="text-sm font-bold text-emerald-900 mb-2">Password Management</h4>
                    {!isChangingPassword ? (
                      <>
                        <p className="text-xs text-emerald-700 leading-relaxed mb-4">
                          It is recommended to change your password every 3 months for better security.
                        </p>
                        <button
                          onClick={() => setIsChangingPassword(true)}
                          className="text-xs font-bold text-emerald-600 hover:underline"
                        >
                          Change Password
                        </button>
                      </>
                    ) : (
                      <form onSubmit={handlePasswordChange} className="space-y-3">
                        <FormField label="Current Password" required>
                          <Input
                            type="password"
                            placeholder="Current Password"
                            required
                            value={passwordData.currentPassword}
                            onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                          />
                        </FormField>
                        <FormField label="New Password" required>
                          <Input
                            type="password"
                            placeholder="New Password"
                            required
                            value={passwordData.newPassword}
                            onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                          />
                        </FormField>
                        <FormField label="Confirm New Password" required>
                          <Input
                            type="password"
                            placeholder="Confirm New Password"
                            required
                            value={passwordData.confirmPassword}
                            onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                          />
                        </FormField>
                        {error && <Alert variant="error">{error}</Alert>}
                        {success && <Alert variant="success">{success}</Alert>}
                        <div className="flex gap-2 pt-1">
                          <Button type="submit" variant="success" size="sm" loading={loading} className="flex-1">
                            Update Password
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setIsChangingPassword(false);
                              setError('');
                              setSuccess('');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
