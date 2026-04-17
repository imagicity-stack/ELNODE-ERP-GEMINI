import { UserProfile, Student, Class } from '../../types';
import { User, Mail, Phone, MapPin, Shield, Edit2, Camera, UserCircle, GraduationCap, Calendar, Hash } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

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

      // Re-authenticate first
      const credential = EmailAuthProvider.credential(currentUser.email, passwordData.currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Update password
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
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-700"></div>
        <div className="px-8 pb-8">
          <div className="relative -mt-12 flex items-end justify-between mb-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl bg-white p-1 shadow-lg">
                <div className="w-full h-full rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <UserCircle className="w-12 h-12" />
                </div>
              </div>
              <button className="absolute -bottom-2 -right-2 p-2 bg-white rounded-lg shadow-md text-gray-400 hover:text-blue-600 transition-all border border-gray-100">
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <button className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all">
              <Edit2 className="w-4 h-4" />
              Edit Profile
            </button>
          </div>
          
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
            <p className="text-gray-500 font-medium capitalize">Student • Class {className}-{student?.section}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
            <div className="space-y-6">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Academic Details</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-blue-600 shadow-sm">
                    <Hash className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Admission / School Number</p>
                    <p className="text-sm font-bold text-gray-900">{student?.admissionNumber || student?.schoolNumber || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-blue-600 shadow-sm">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Class & Section</p>
                    <p className="text-sm font-bold text-gray-900">Class {className} - {student?.section}</p>
                  </div>
                </div>
              </div>

              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-8">Contact Information</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-blue-600 shadow-sm">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Email Address</p>
                    <p className="text-sm font-bold text-gray-900">{user.email}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Account Security</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-blue-600 shadow-sm">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Account Status</p>
                    <p className="text-sm font-bold text-emerald-600">Verified & Active</p>
                  </div>
                </div>
                
                <div className="p-6 bg-blue-50 rounded-2xl">
                  <h4 className="text-sm font-bold text-blue-900 mb-2">Password Management</h4>
                  {!isChangingPassword ? (
                    <>
                      <p className="text-xs text-blue-700 leading-relaxed mb-4">
                        It is recommended to change your password every 3 months for better security.
                      </p>
                      <button 
                        onClick={() => setIsChangingPassword(true)}
                        className="text-xs font-bold text-blue-600 hover:underline"
                      >
                        Change Password
                      </button>
                    </>
                  ) : (
                    <form onSubmit={handlePasswordChange} className="space-y-3">
                      <div>
                        <input
                          type="password"
                          placeholder="Current Password"
                          required
                          value={passwordData.currentPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                          className="w-full px-3 py-2 text-xs border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                        />
                      </div>
                      <div>
                        <input
                          type="password"
                          placeholder="New Password"
                          required
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                          className="w-full px-3 py-2 text-xs border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                        />
                      </div>
                      <div>
                        <input
                          type="password"
                          placeholder="Confirm New Password"
                          required
                          value={passwordData.confirmPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                          className="w-full px-3 py-2 text-xs border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                        />
                      </div>
                      {error && <p className="text-[10px] text-red-600 font-medium">{error}</p>}
                      {success && <p className="text-[10px] text-emerald-600 font-medium">{success}</p>}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={loading}
                          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 disabled:opacity-50"
                        >
                          {loading ? 'Updating...' : 'Update Password'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsChangingPassword(false);
                            setError('');
                            setSuccess('');
                          }}
                          className="px-3 py-2 bg-white text-gray-500 border border-gray-200 rounded-lg text-[10px] font-bold hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
