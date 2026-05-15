import { useState, useEffect, useRef } from 'react';
import { 
  User, 
  Lock, 
  Mail, 
  Phone, 
  Camera, 
  Save, 
  Eye, 
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Shield,
  Briefcase,
  GraduationCap,
  Home,
  Hash,
  MapPin,
  Calendar,
  X
} from 'lucide-react';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage, handleFirestoreError, OperationType } from '../../firebase';
import { Button, Input, FormField, Avatar, Badge, Card } from '../../components/ui';
import { UserProfile, Student, Teacher, House } from '../../types';

interface ProfileSettingsProps {
  user: UserProfile;
}

export default function ProfileSettings({ user }: ProfileSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [studentData, setStudentData] = useState<Student | null>(null);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [parentStudents, setParentStudents] = useState<Student[]>([]);
  const [houseName, setHouseName] = useState<string>('');
  const [className, setClassName] = useState<string>('');
  const [subjectNames, setSubjectNames] = useState<string[]>([]);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile Form State
  const [profileData, setProfileData] = useState({
    name: user.name || '',
    phone: user.phone || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    address: user.address || '',
  });

  // Password State
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    const fetchExtraData = async () => {
      try {
        if (user.role === 'student') {
          const sid = user.studentId || user.uid;
          const studentDoc = await getDoc(doc(db, 'students', sid));
          if (studentDoc.exists()) {
            const sData = { id: studentDoc.id, ...studentDoc.data() } as Student;
            setStudentData(sData);
            
            // Get House
            if (sData.houseId) {
              const houseDoc = await getDoc(doc(db, 'houses', sData.houseId));
              if (houseDoc.exists()) setHouseName((houseDoc.data() as House).name);
            }
            
            // Get Class
            if (sData.classId) {
              const classDoc = await getDoc(doc(db, 'classes', sData.classId));
              if (classDoc.exists()) setClassName(classDoc.data().name);
            }
          }
        } else if (user.role === 'parent') {
          if (user.studentIds && user.studentIds.length > 0) {
            const list: Student[] = [];
            for (const id of user.studentIds) {
              const docSnap = await getDoc(doc(db, 'students', id));
              if (docSnap.exists()) list.push({ id: docSnap.id, ...docSnap.data() } as Student);
            }
            setParentStudents(list);
          }
        } else if (user.role === 'teacher' || user.role === 'principal' || user.role === 'accounts') {
          const tid = user.teacherId || user.uid;
          const teacherDoc = await getDoc(doc(db, 'teachers', tid));
          if (teacherDoc.exists()) {
            const tData = { id: teacherDoc.id, ...teacherDoc.data() } as Teacher;
            setTeacherData(tData);

            if (tData.subjects) {
              const names = await Promise.all(tData.subjects.map(async id => {
                const docSnap = await getDoc(doc(db, 'subjects', id));
                return docSnap.exists() ? docSnap.data().name : id;
              }));
              setSubjectNames(names);
            }
            if (tData.classes) {
              const names = await Promise.all(tData.classes.map(async id => {
                const docSnap = await getDoc(doc(db, 'classes', id));
                return docSnap.exists() ? docSnap.data().name : id;
              }));
              setAssignedClasses(names);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching extra profile data:', err);
      }
    };
    fetchExtraData();
  }, [user]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        name: profileData.name,
        phone: profileData.phone,
        address: profileData.address,
        updatedAt: new Date().toISOString()
      });

      // Update student/teacher record if it exists
      if (user.role === 'student' || user.role === 'parent') {
        const sid = user.studentId || user.uid;
        const studentRef = doc(db, 'students', sid);
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          await updateDoc(studentRef, { 
            name: profileData.name, 
            phone: profileData.phone
          });
        }
      } else if (user.role === 'teacher') {
        const tid = user.teacherId || user.uid;
        const teacherRef = doc(db, 'teachers', tid);
        const teacherDoc = await getDoc(teacherRef);
        if (teacherDoc.exists()) {
          await updateDoc(teacherRef, { 
            name: profileData.name, 
            phone: profileData.phone
          });
        }
      }

      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
      setError('Failed to update profile');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image size should be less than 2MB');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const storageRef = ref(storage, `profiles/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      // Update user profile in Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { photoURL: downloadURL });
      
      setProfileData(prev => ({ ...prev, photoURL: downloadURL }));
      setSuccess('Profile photo updated!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error uploading photo:', err);
      setError('Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) return;

      // Re-authenticate user before password change
      const credential = EmailAuthProvider.credential(currentUser.email, passwordForm.currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      
      // Update password
      await updatePassword(currentUser, passwordForm.newPassword);
      
      setSuccess('Password changed successfully!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      if (err.code === 'auth/wrong-password') {
        setError('Current password is incorrect');
      } else {
        setError('Failed to change password. Please try logging in again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isSuperAdmin = user.role === 'super_admin';

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Profile & Settings</h1>
          <p className="text-slate-500 font-medium mt-1">Manage your identity and security across the portal.</p>
        </div>
        <Badge variant={user.role === 'super_admin' ? 'success' : 'indigo'} className="w-fit h-fit px-4 py-1.5 text-xs font-bold uppercase tracking-wider">
          {user.role.replace('_', ' ')}
        </Badge>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="font-semibold text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-rose-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <p className="font-semibold text-sm">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto p-1 hover:bg-emerald-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Avatar & Role Info */}
        <div className="lg:col-span-1 space-y-8">
          <Card className="overflow-hidden border-none shadow-xl shadow-slate-200/50">
            <div className="h-24 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500" />
            <div className="px-6 pb-8">
              <div className="relative -mt-12 flex flex-col items-center">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-3xl overflow-hidden bg-white p-1 ring-4 ring-white shadow-xl transition-transform duration-300 group-hover:scale-105">
                    {uploading ? (
                      <div className="w-full h-full bg-slate-100 rounded-2xl flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                      </div>
                    ) : profileData.photoURL ? (
                      <img src={profileData.photoURL} alt={user.name} className="w-full h-full object-cover rounded-2xl" />
                    ) : (
                      <div className="w-full h-full bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 font-bold text-3xl">
                        {user.name[0]}
                      </div>
                    )}
                  </div>
                  {/* Photo upload restricted to admin/principal/office_staff — students/parents/teachers
                       have their photo set from the admin portal to keep records authoritative */}
                  {(user.role === 'super_admin' || user.role === 'principal' || user.role === 'office_staff') && (
                    <>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute -bottom-2 -right-2 p-2 bg-white rounded-xl shadow-lg border border-slate-100 text-slate-400 hover:text-indigo-600 hover:scale-110 transition-all active:scale-95"
                        title="Change Photo"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handlePhotoUpload}
                        accept="image/*"
                        className="hidden"
                      />
                    </>
                  )}
                </div>
                <div className="mt-4 text-center">
                  <h2 className="text-xl font-bold text-slate-900">{user.name}</h2>
                  <p className="text-slate-500 text-sm font-medium">{user.email}</p>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Identity Details</p>
                
                {user.schoolNumber && (
                   <InfoRow icon={Hash} label="School Number" value={user.schoolNumber} />
                )}

                {user.role === 'student' && studentData && (
                  <div className="space-y-2">
                    <InfoRow icon={Hash} label="Admission Number" value={studentData.admissionNumber} />
                    <InfoRow icon={GraduationCap} label="Class & Section" value={`${className} - ${studentData.section}`} />
                    <InfoRow icon={Home} label="House" value={houseName || 'Not Assigned'} color="indigo" />
                  </div>
                )}

                {user.role === 'parent' && parentStudents.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mt-2">Linked Students</p>
                    {parentStudents.map(s => (
                       <div key={s.id} className="flex items-center gap-3 p-2 bg-slate-50 border border-slate-100 rounded-xl">
                          <Avatar name={s.name} size="sm" />
                          <div className="min-w-0">
                             <p className="text-xs font-bold truncate">{s.name}</p>
                             <p className="text-[9px] text-slate-500 uppercase">{s.schoolNumber}</p>
                          </div>
                       </div>
                    ))}
                  </div>
                )}

                {user.role === 'teacher' && teacherData && (
                  <div className="space-y-2">
                    <InfoRow icon={Briefcase} label="Employee ID" value={teacherData.id} />
                    <InfoRow icon={Calendar} label="Joining Details" value={teacherData.joiningDetails} />
                    
                    {assignedClasses.length > 0 && (
                      <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                        <p className="text-[10px] font-bold text-indigo-600 uppercase">Assigned Classes</p>
                        <p className="text-xs font-bold text-indigo-900">{assignedClasses.join(', ')}</p>
                      </div>
                    )}

                    {subjectNames.length > 0 && (
                      <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase">Subjects</p>
                        <p className="text-xs font-bold text-emerald-900">{subjectNames.join(', ')}</p>
                      </div>
                    )}

                    {teacherData.isHouseIncharge && (
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                        <p className="text-[10px] font-bold text-amber-600 uppercase">Special Role</p>
                        <p className="text-xs font-bold text-amber-900">House In-charge</p>
                      </div>
                    )}
                  </div>
                )}

                {(user.role === 'principal' || user.role === 'accounts' || user.role === 'super_admin') && (
                  <div className="space-y-2">
                    <InfoRow icon={Briefcase} label="Staff Role" value={user.role.replace('_', ' ').toUpperCase()} />
                    <InfoRow icon={Shield} label="Account Clearance" value="Tier 1 - Full Access" color="emerald" />
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="border-none bg-slate-900 text-white shadow-xl">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-indigo-400" />
                </div>
                <h3 className="font-bold">Privacy Note</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your profile information is only visible to school administrators. Contact your super admin if you need to change your official name or role.
              </p>
            </div>
          </Card>
        </div>

        {/* Right Column: Forms */}
        <div className="lg:col-span-2 space-y-8">
          {/* Main Information */}
          <Card className="border-none shadow-xl shadow-slate-200/50">
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                  <User className="w-5 h-5 text-indigo-600" />
                  General Information
                </h2>
                {!isSuperAdmin && (
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-md uppercase tracking-wider">
                    Read-only by user
                  </span>
                )}
              </div>

              <form onSubmit={handleProfileUpdate} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField label="Full Name">
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        value={profileData.name}
                        onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                        className="pl-11 h-12 bg-slate-50/50 border-slate-200 focus:bg-white transition-all font-medium"
                        placeholder="Full name"
                        required
                        disabled={!isSuperAdmin}
                      />
                    </div>
                  </FormField>
                  <FormField label="Phone Number">
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        value={profileData.phone}
                        onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                        className="pl-11 h-12 bg-slate-50/50 border-slate-200 focus:bg-white transition-all font-medium"
                        placeholder="Contact number"
                        disabled={!isSuperAdmin}
                      />
                    </div>
                  </FormField>
                </div>

                <FormField label="Email Address (Login Identity)">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={profileData.email}
                      disabled
                      className="pl-11 h-12 bg-slate-100 text-slate-400 italic cursor-not-allowed"
                    />
                  </div>
                </FormField>

                <FormField label="Physical Address">
                  <div className="relative">
                    <MapPin className="absolute left-4 top-4 w-4 h-4 text-slate-400" />
                    <textarea
                      value={profileData.address}
                      onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                      className="w-full min-h-[100px] pl-11 pt-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all font-medium resize-none"
                      placeholder="Enter residence address"
                      disabled={!isSuperAdmin}
                    />
                  </div>
                </FormField>

                {isSuperAdmin && (
                  <div className="flex justify-end pt-4">
                    <Button type="submit" loading={updateLoading} className="px-10 h-12 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200">
                      Update Profile Information
                    </Button>
                  </div>
                )}
              </form>
            </div>
          </Card>

          {/* Password Section */}
          <Card className="border-none shadow-xl shadow-slate-200/50">
            <div className="p-8">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3 mb-8">
                <Lock className="w-5 h-5 text-orange-500" />
                Credential Security
              </h2>

              <form onSubmit={handlePasswordChange} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField label="Current Password">
                    <div className="relative">
                      <Input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                        className="h-12 bg-slate-50/50 border-slate-200 focus:bg-white transition-all"
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:text-indigo-600 transition-colors text-slate-400"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormField>
                  <div className="hidden md:block" />
                  
                  <FormField label="New Password">
                    <div className="relative">
                      <Input
                        type={showNewPassword ? 'text' : 'password'}
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        className="h-12 bg-slate-50/50 border-slate-200 focus:bg-white transition-all"
                        placeholder="Min. 6 characters"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:text-indigo-600 transition-colors text-slate-400"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormField>

                  <FormField label="Confirm New Password">
                    <Input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      className="h-12 bg-slate-50/50 border-slate-200 focus:bg-white transition-all"
                      placeholder="Repeat new password"
                      required
                    />
                  </FormField>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <p className="text-xs text-slate-500 font-medium max-w-[280px]">
                    Updating your password will require you to log in again on all devices for security.
                  </p>
                  <Button type="submit" variant="secondary" disabled={loading} className="px-10 h-12 border-slate-200 font-bold">
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Confirm Change'}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, color = 'slate' }: { icon: any, label: string, value: string, color?: string }) {
  const colorMap: any = {
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100'
  };

  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border ${colorMap[color] || colorMap.slate} transition-all hover:bg-white hover:shadow-sm`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm bg-white`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-0.5">{label}</p>
        <p className="text-xs font-bold truncate">{value || 'N/A'}</p>
      </div>
    </div>
  );
}
