import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, storage, auth } from '../../firebase';
import { UserProfile, Student, ExtendedStudentProfile, House } from '../../types';
import { FormField, Input } from '../../components/ui';
import {
  User, Heart, Home as HomeIcon, Briefcase, BookOpen, Activity,
  Users, CreditCard, Camera, CheckCircle, AlertCircle, Plus, X,
  Lock, Eye, EyeOff, Loader2, GraduationCap, Hash, Mail, Image as ImageIcon,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi (NCT)', 'Jammu & Kashmir', 'Ladakh', 'Chandigarh', 'Puducherry',
  'Andaman & Nicobar Islands', 'Dadra & Nagar Haveli and Daman & Diu', 'Lakshadweep',
];
const QUALIFICATIONS = [
  'Illiterate', 'Below Primary', 'Primary (Class 1–5)', 'Middle (Class 6–8)',
  'Secondary / Matric (10th)', 'Senior Secondary (12th)', 'Diploma / ITI',
  'Graduate (BA/BSc/BCom)', 'Post Graduate (MA/MSc/MCom)',
  'Professional Degree (MBBS/BTech/LLB/CA)', 'Doctorate (PhD)',
];
const INCOME_BRACKETS = [
  'Below ₹1 Lakh', '₹1–2 Lakh', '₹2–5 Lakh', '₹5–10 Lakh',
  '₹10–20 Lakh', '₹20–50 Lakh', 'Above ₹50 Lakh',
];

// ── Completion helpers ────────────────────────────────────────────────────────
const COMPLETION_CHECKS = [
  (p: Partial<ExtendedStudentProfile>) => !!p.dateOfBirth,
  (p: Partial<ExtendedStudentProfile>) => !!p.bloodGroup,
  (p: Partial<ExtendedStudentProfile>) => !!p.religion,
  (p: Partial<ExtendedStudentProfile>) => !!p.category,
  (p: Partial<ExtendedStudentProfile>) => !!p.nationality,
  (p: Partial<ExtendedStudentProfile>) => !!p.motherTongue,
  (p: Partial<ExtendedStudentProfile>) => !!p.aadhaarNumber,
  (p: Partial<ExtendedStudentProfile>) => !!p.permanentAddress?.city,
  (p: Partial<ExtendedStudentProfile>) => !!p.permanentAddress?.state,
  (p: Partial<ExtendedStudentProfile>) => !!p.permanentAddress?.pinCode,
  (p: Partial<ExtendedStudentProfile>) => !!p.father?.name,
  (p: Partial<ExtendedStudentProfile>) => !!p.father?.phone,
  (p: Partial<ExtendedStudentProfile>) => !!p.father?.occupation,
  (p: Partial<ExtendedStudentProfile>) => !!p.father?.qualification,
  (p: Partial<ExtendedStudentProfile>) => !!p.mother?.name,
  (p: Partial<ExtendedStudentProfile>) => !!p.mother?.phone,
  (p: Partial<ExtendedStudentProfile>) => !!p.previousSchool?.name,
  (p: Partial<ExtendedStudentProfile>) => !!p.health?.height,
  (p: Partial<ExtendedStudentProfile>) => !!p.health?.weight,
  (p: Partial<ExtendedStudentProfile>) => !!p.idCardFrontUrl,
  (p: Partial<ExtendedStudentProfile>) => !!p.idCardBackUrl,
];

function computeCompletion(p: Partial<ExtendedStudentProfile>): number {
  const done = COMPLETION_CHECKS.filter(fn => fn(p)).length;
  return Math.round((done / COMPLETION_CHECKS.length) * 100);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, subtitle, children }: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div className="section-icon">
          <Icon size={18} style={{ color: 'var(--ink-2)' }} />
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', lineHeight: 1.2 }}>{title}</p>
          {subtitle && <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function SiblingEditor({ siblings, onChange }: {
  siblings: { name: string; admissionNumber: string; class: string }[];
  onChange: (v: { name: string; admissionNumber: string; class: string }[]) => void;
}) {
  const add = () => onChange([...siblings, { name: '', admissionNumber: '', class: '' }]);
  const remove = (i: number) => onChange(siblings.filter((_, idx) => idx !== i));
  const update = (i: number, key: 'name' | 'admissionNumber' | 'class', val: string) => {
    const next = [...siblings];
    next[i] = { ...next[i], [key]: val };
    onChange(next);
  };
  return (
    <div>
      {siblings.map((s, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
          <FormField label="Name"><Input value={s.name} placeholder="Sibling name" onChange={e => update(i, 'name', e.target.value)} /></FormField>
          <FormField label="Adm. No."><Input value={s.admissionNumber} placeholder="e.g. 2023001" onChange={e => update(i, 'admissionNumber', e.target.value)} /></FormField>
          <FormField label="Class"><Input value={s.class} placeholder="e.g. 8A" onChange={e => update(i, 'class', e.target.value)} /></FormField>
          <button className="icon-btn" style={{ color: 'var(--coral)', marginBottom: 2 }} onClick={() => remove(i)}><X size={14} /></button>
        </div>
      ))}
      <button className="btn ghost" style={{ marginTop: 4, fontSize: 13 }} type="button" onClick={add}>
        <Plus size={14} /> Add Sibling
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface ExtendedProfileProps {
  user: UserProfile;
  student: Student | null;
}

export default function ExtendedProfile({ user, student }: ExtendedProfileProps) {
  const [profile, setProfile] = useState<Partial<ExtendedStudentProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const [frontProgress, setFrontProgress] = useState(0);
  const [backProgress, setBackProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  // Separate refs for gallery picker vs. direct camera capture
  const frontGalleryRef = useRef<HTMLInputElement>(null);
  const frontCameraRef = useRef<HTMLInputElement>(null);
  const backGalleryRef = useRef<HTMLInputElement>(null);
  const backCameraRef = useRef<HTMLInputElement>(null);

  // Profile photo (avatar)
  const [photoURL, setPhotoURL] = useState(user.photoURL || '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);
  const [photoMsg, setPhotoMsg] = useState('');
  const photoGalleryRef = useRef<HTMLInputElement>(null);
  const photoCameraRef = useRef<HTMLInputElement>(null);

  // Identity context
  const [className, setClassName] = useState('');
  const [houseName, setHouseName] = useState('');

  // Password change
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [showPwd, setShowPwd] = useState({ current: false, next: false });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  useEffect(() => {
    if (!student?.id) { setLoading(false); return; }
    getDoc(doc(db, 'studentProfiles', student.id)).then(snap => {
      if (snap.exists()) {
        setProfile(snap.data() as ExtendedStudentProfile);
      } else {
        setProfile({
          father: {
            name: student.parentDetails?.fatherName || '',
            phone: student.parentDetails?.phone || '',
            email: student.parentDetails?.email || '',
          },
          mother: {
            name: student.parentDetails?.motherName || '',
          },
          nationality: 'Indian',
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [student?.id]);

  useEffect(() => {
    if (!student) return;
    if (student.classId) {
      getDoc(doc(db, 'classes', student.classId))
        .then(s => setClassName(s.exists() ? s.data().name : student.classId))
        .catch(() => {});
    }
    if (student.houseId) {
      getDoc(doc(db, 'houses', student.houseId))
        .then(s => { if (s.exists()) setHouseName((s.data() as House).name); })
        .catch(() => {});
    }
  }, [student?.classId, student?.houseId]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so picking the same file again re-fires onChange
    if (!file) return;
    if (!file.type.startsWith('image/')) { setPhotoMsg('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setPhotoMsg('Image must be under 5 MB.'); return; }
    setUploadingPhoto(true);
    setPhotoProgress(0);
    setPhotoMsg('');
    try {
      const safeName = file.name.replace(/[^\w.\-]/g, '_');
      const storageRef = ref(storage, `profiles/${user.uid}/${Date.now()}_${safeName}`);
      const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          snap => setPhotoProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          () => resolve(),
        );
      });
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'users', user.uid), { photoURL: url, updatedAt: new Date().toISOString() });
      if (student?.id) {
        try { await updateDoc(doc(db, 'students', student.id), { photoURL: url, updatedAt: new Date().toISOString() }); } catch { /* non-fatal */ }
      }
      setPhotoURL(url);
      setPhotoMsg('Photo updated!');
      setTimeout(() => setPhotoMsg(''), 3000);
    } catch (err: any) {
      setPhotoMsg(err?.code === 'storage/unauthorized'
        ? 'Upload not permitted. Please contact administration.'
        : `Failed to upload photo${err?.message ? `: ${err.message}` : ''}. Please try again.`);
    } finally {
      setUploadingPhoto(false);
      setPhotoProgress(0);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    if (pwd.next !== pwd.confirm) { setPwdError('New passwords do not match.'); return; }
    if (pwd.next.length < 6) { setPwdError('Password must be at least 6 characters.'); return; }
    setPwdLoading(true);
    try {
      const cu = auth.currentUser;
      if (!cu || !cu.email) throw new Error('No user logged in.');
      const credential = EmailAuthProvider.credential(cu.email, pwd.current);
      await reauthenticateWithCredential(cu, credential);
      await updatePassword(cu, pwd.next);
      setPwdSuccess('Password updated successfully!');
      setPwd({ current: '', next: '', confirm: '' });
      setTimeout(() => setPwdSuccess(''), 3000);
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPwdError('Current password is incorrect.');
      } else {
        setPwdError(err.message || 'Failed to update password.');
      }
    } finally {
      setPwdLoading(false);
    }
  };

  const set = (path: string, value: any) => {
    setProfile(prev => {
      const next = { ...prev } as any;
      const parts = path.split('.');
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        else obj[parts[i]] = { ...obj[parts[i]] };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const uploadPhoto = async (file: File, side: 'front' | 'back') => {
    if (!student?.id) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file for the ID card.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('ID card image must be under 5 MB.'); return; }
    const setUploading = side === 'front' ? setUploadingFront : setUploadingBack;
    const setProgress = side === 'front' ? setFrontProgress : setBackProgress;
    setUploading(true);
    setProgress(0);
    setError('');
    try {
      const path = `studentProfiles/${student.id}/idCard-${side}-${Date.now()}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          () => resolve(),
        );
      });
      const url = await getDownloadURL(storageRef);
      setProfile(prev => ({
        ...prev,
        ...(side === 'front' ? { idCardFrontUrl: url, idCardFrontPath: path } : { idCardBackUrl: url, idCardBackPath: path }),
      }));
    } catch (err: any) {
      setError(err?.code === 'storage/unauthorized'
        ? 'ID card upload not permitted. Please contact administration.'
        : `Photo upload failed${err?.message ? `: ${err.message}` : ''}. Please try again.`);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleSave = async () => {
    if (!student?.id) return;
    if (!profile.idCardFrontUrl || !profile.idCardBackUrl) {
      setError('Both ID card photos (front & back) are mandatory before saving.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    setError('');
    try {
      const completion = computeCompletion(profile);
      const data: ExtendedStudentProfile = {
        ...(profile as ExtendedStudentProfile),
        studentId: student.id,
        completionPercentage: completion,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        updatedByName: user.name,
      };
      await setDoc(doc(db, 'studentProfiles', student.id), data, { merge: true });
      setProfile(data);
      setSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="pad" style={{ paddingTop: 32, textAlign: 'center' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: 'var(--ink)' }} />
      </div>
    );
  }
  if (!student) {
    return <div className="pad"><p className="muted">Student data not found. Please contact administration.</p></div>;
  }

  const completion = computeCompletion(profile);
  const completionColor = completion === 100 ? 'var(--leaf)' : completion >= 60 ? 'var(--accent)' : 'var(--coral)';

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="eyebrow">Student Portal</div>
          <h1>My Profile</h1>
        </div>
        <button className="btn accent" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Update Profile'}
        </button>
      </div>

      <div className="pad" style={{ paddingTop: 16, paddingBottom: 80 }}>
        <div className="stack">

          {/* Status banners */}
          {success && (
            <div className="card" style={{ background: '#f0fdf4', border: '1px solid var(--leaf)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={18} style={{ color: 'var(--leaf)', flexShrink: 0 }} />
                <p style={{ fontSize: 14, color: 'var(--leaf)', fontWeight: 600 }}>Profile updated successfully!</p>
              </div>
            </div>
          )}
          {error && (
            <div className="card" style={{ background: '#fef2f2', border: '1px solid var(--coral)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertCircle size={18} style={{ color: 'var(--coral)', flexShrink: 0 }} />
                <p style={{ fontSize: 14, color: 'var(--coral)' }}>{error}</p>
              </div>
            </div>
          )}

          {/* ── Profile header: photo + identity ── */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {uploadingPhoto ? (
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--cream-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                    <Loader2 size={20} style={{ color: 'var(--accent)' }} className="animate-spin" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{photoProgress}%</span>
                  </div>
                ) : photoURL ? (
                  <img src={photoURL} alt={user.name} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--line)' }} />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--ink)', color: 'var(--cream)', display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28 }}>
                    {(user.name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => photoCameraRef.current?.click()}
                  title="Take photo with camera"
                  style={{ position: 'absolute', bottom: -2, right: -2, width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--paper)', display: 'grid', placeItems: 'center', cursor: uploadingPhoto ? 'wait' : 'pointer' }}
                >
                  <Camera size={14} style={{ color: 'var(--accent-ink)' }} />
                </button>
                {/* Hidden inputs: camera capture + gallery picker */}
                <input ref={photoCameraRef} type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                <input ref={photoGalleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="display" style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.1, color: 'var(--ink)' }}>{user.name}</p>
                <p className="mono" style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>{student.admissionNumber || student.schoolNumber || '—'}</p>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {className && (
                    <span className="chip solid" style={{ fontSize: 11 }}>
                      Class {className}{student.section ? `–${student.section}` : ''}
                    </span>
                  )}
                  {houseName && <span className="chip" style={{ fontSize: 11 }}>{houseName}</span>}
                </div>
                {/* Camera / Gallery action buttons */}
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn ghost" disabled={uploadingPhoto} style={{ fontSize: 12, padding: '5px 12px', width: 'auto' }} onClick={() => photoCameraRef.current?.click()}>
                    <Camera size={13} /> Camera
                  </button>
                  <button type="button" className="btn ghost" disabled={uploadingPhoto} style={{ fontSize: 12, padding: '5px 12px', width: 'auto' }} onClick={() => photoGalleryRef.current?.click()}>
                    <ImageIcon size={13} /> {photoURL ? 'Change Photo' : 'Gallery'}
                  </button>
                </div>
                {uploadingPhoto && (
                  <div className="profile-completion-bar" style={{ marginTop: 8 }}>
                    <div className="profile-completion-fill" style={{ width: `${photoProgress}%`, background: 'var(--accent)' }} />
                  </div>
                )}
                {photoMsg && (
                  <p style={{ fontSize: 12, color: photoMsg.includes('Failed') || photoMsg.includes('must') || photoMsg.includes('image') || photoMsg.includes('not permitted') ? 'var(--coral)' : 'var(--leaf)', marginTop: 8 }}>
                    {photoMsg}
                  </p>
                )}
              </div>
            </div>

            {/* Identity rows */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
              {[
                { icon: Hash, label: 'Admission No.', value: student.admissionNumber || student.schoolNumber || '—' },
                { icon: GraduationCap, label: 'Class & Section', value: className ? `Class ${className}${student.section ? ` · ${student.section}` : ''}` : '—' },
                { icon: HomeIcon, label: 'House', value: houseName || 'Not Assigned' },
                { icon: Mail, label: 'Email', value: user.email },
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line-2)' : 'none' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-3)' }}>
                    <row.icon size={14} /> {row.label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, textAlign: 'right', color: 'var(--ink)', maxWidth: '60%', wordBreak: 'break-all' }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Completion indicator */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--cream-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `3px solid ${completionColor}` }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: completionColor, fontFamily: 'var(--display)', lineHeight: 1 }}>{completion}%</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', marginBottom: 6 }}>
                  {completion === 100 ? 'Profile Complete!' : `${completion}% Complete — keep going!`}
                </p>
                <div className="profile-completion-bar">
                  <div className="profile-completion-fill" style={{ width: `${completion}%`, background: completionColor }} />
                </div>
                <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                  {COMPLETION_CHECKS.length - COMPLETION_CHECKS.filter(fn => fn(profile)).length} fields remaining
                </p>
              </div>
            </div>
          </div>

          {/* ── Additional Details heading ── */}
          <div style={{ paddingTop: 4 }}>
            <p className="eyebrow" style={{ marginBottom: 4 }}>Additional Details</p>
            <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              Complete the sections below to keep your school records up to date. Tap “Update Profile” when you’re done.
            </p>
          </div>

          {/* ── ID Card Photos (Mandatory) ── */}
          <SectionCard icon={CreditCard} title="Identity Documents" subtitle="Upload both sides of your School ID card or Aadhaar — mandatory">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {(['front', 'back'] as const).map(side => {
                const url = side === 'front' ? profile.idCardFrontUrl : profile.idCardBackUrl;
                const uploading = side === 'front' ? uploadingFront : uploadingBack;
                const progress = side === 'front' ? frontProgress : backProgress;
                const galleryRef = side === 'front' ? frontGalleryRef : backGalleryRef;
                const cameraRef = side === 'front' ? frontCameraRef : backCameraRef;
                const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) uploadPhoto(f, side);
                };
                return (
                  <div key={side}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {side === 'front' ? 'Front Side' : 'Back Side'} <span style={{ color: 'var(--coral)' }}>*</span>
                    </p>
                    <div
                      onClick={() => !uploading && !url && cameraRef.current?.click()}
                      style={{
                        border: `2px dashed ${url ? 'var(--leaf)' : 'var(--line)'}`,
                        borderRadius: 12, minHeight: 130,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        cursor: uploading ? 'wait' : url ? 'default' : 'pointer', overflow: 'hidden', position: 'relative',
                        background: url ? 'transparent' : 'var(--cream)',
                        transition: 'border-color 0.2s', padding: 10,
                      }}
                    >
                      {uploading ? (
                        <>
                          <Loader2 size={24} style={{ color: 'var(--accent)', marginBottom: 8 }} className="animate-spin" />
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>Uploading… {progress}%</p>
                          <div className="profile-completion-bar" style={{ width: '80%' }}>
                            <div className="profile-completion-fill" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
                          </div>
                        </>
                      ) : url ? (
                        <>
                          <img src={url} alt={`ID ${side}`} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                          <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'var(--leaf)', color: '#fff', borderRadius: 99, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                            Uploaded ✓
                          </div>
                        </>
                      ) : (
                        <>
                          <Camera size={26} style={{ color: 'var(--ink-3)', marginBottom: 6 }} />
                          <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', fontWeight: 600 }}>
                            Tap to capture photo
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--ink-4)', textAlign: 'center', marginTop: 2 }}>JPG or PNG · max 5 MB</p>
                        </>
                      )}
                    </div>
                    {/* Camera capture + gallery inputs */}
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPick} />
                    <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPick} />
                    {!uploading && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="btn ghost" style={{ fontSize: 11, padding: '4px 10px', width: 'auto' }} onClick={() => cameraRef.current?.click()}>
                          <Camera size={12} /> Camera
                        </button>
                        <button type="button" className="btn ghost" style={{ fontSize: 11, padding: '4px 10px', width: 'auto' }} onClick={() => galleryRef.current?.click()}>
                          <ImageIcon size={12} /> {url ? 'Replace' : 'Gallery'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* ── Personal Information ── */}
          <SectionCard icon={User} title="Personal Information" subtitle="Basic demographic details for official records">
            <div className="form-grid">
              <FormField label="Date of Birth">
                <Input type="date" value={profile.dateOfBirth || ''} onChange={e => set('dateOfBirth', e.target.value)} />
              </FormField>
              <FormField label="Blood Group">
                <select className="input" value={profile.bloodGroup || ''} onChange={e => set('bloodGroup', e.target.value)}>
                  <option value="">Select blood group</option>
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(g => <option key={g}>{g}</option>)}
                </select>
              </FormField>
              <FormField label="Religion">
                <select className="input" value={profile.religion || ''} onChange={e => set('religion', e.target.value)}>
                  <option value="">Select religion</option>
                  {['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Parsi', 'Jewish', 'Other'].map(r => <option key={r}>{r}</option>)}
                </select>
              </FormField>
              <FormField label="Category">
                <select className="input" value={profile.category || ''} onChange={e => set('category', e.target.value)}>
                  <option value="">Select category</option>
                  {['General', 'OBC', 'SC', 'ST', 'EWS'].map(c => <option key={c}>{c}</option>)}
                </select>
              </FormField>
              <FormField label="Nationality">
                <Input value={profile.nationality || ''} placeholder="e.g. Indian" onChange={e => set('nationality', e.target.value)} />
              </FormField>
              <FormField label="Mother Tongue">
                <Input value={profile.motherTongue || ''} placeholder="e.g. Hindi, Tamil" onChange={e => set('motherTongue', e.target.value)} />
              </FormField>
              <FormField label="Languages Known">
                <Input value={profile.languagesKnown || ''} placeholder="e.g. Hindi, English, Kannada" onChange={e => set('languagesKnown', e.target.value)} />
              </FormField>
              <FormField label="Aadhaar Number">
                <Input value={profile.aadhaarNumber || ''} placeholder="12-digit Aadhaar" maxLength={12} onChange={e => set('aadhaarNumber', e.target.value.replace(/\D/g, ''))} />
              </FormField>
              <FormField label="Passport Number" hint="Optional — leave blank if not applicable">
                <Input value={profile.passportNumber || ''} placeholder="Passport number" onChange={e => set('passportNumber', e.target.value)} />
              </FormField>
              <FormField label="Identification Marks" hint="Optional — any visible marks or features">
                <Input value={profile.identificationMarks || ''} placeholder="e.g. Mole on left cheek" onChange={e => set('identificationMarks', e.target.value)} />
              </FormField>
            </div>
          </SectionCard>

          {/* ── Permanent Address ── */}
          <SectionCard icon={HomeIcon} title="Permanent Address" subtitle="Full residential address for official correspondence">
            <div className="form-grid">
              <FormField label="House / Flat / Door No.">
                <Input value={profile.permanentAddress?.house || ''} placeholder="e.g. 12B, Flat 302" onChange={e => set('permanentAddress.house', e.target.value)} />
              </FormField>
              <FormField label="Street / Colony / Area">
                <Input value={profile.permanentAddress?.street || ''} placeholder="Street, locality or colony name" onChange={e => set('permanentAddress.street', e.target.value)} />
              </FormField>
              <FormField label="City / Town / Village">
                <Input value={profile.permanentAddress?.city || ''} placeholder="City or town" onChange={e => set('permanentAddress.city', e.target.value)} />
              </FormField>
              <FormField label="State / Union Territory">
                <select className="input" value={profile.permanentAddress?.state || ''} onChange={e => set('permanentAddress.state', e.target.value)}>
                  <option value="">Select state</option>
                  {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="PIN Code">
                <Input value={profile.permanentAddress?.pinCode || ''} placeholder="6-digit PIN code" maxLength={6} onChange={e => set('permanentAddress.pinCode', e.target.value.replace(/\D/g, ''))} />
              </FormField>
              <FormField label="Country">
                <Input value={profile.permanentAddress?.country || 'India'} onChange={e => set('permanentAddress.country', e.target.value)} />
              </FormField>
            </div>
          </SectionCard>

          {/* ── Father's Details ── */}
          <SectionCard icon={Briefcase} title="Father's Details" subtitle="Employment and contact information for the father">
            <div className="form-grid">
              <FormField label="Full Name">
                <Input value={profile.father?.name || ''} placeholder="Father's full name" onChange={e => set('father.name', e.target.value)} />
              </FormField>
              <FormField label="Date of Birth">
                <Input type="date" value={profile.father?.dob || ''} onChange={e => set('father.dob', e.target.value)} />
              </FormField>
              <FormField label="Highest Qualification">
                <select className="input" value={profile.father?.qualification || ''} onChange={e => set('father.qualification', e.target.value)}>
                  <option value="">Select qualification</option>
                  {QUALIFICATIONS.map(q => <option key={q}>{q}</option>)}
                </select>
              </FormField>
              <FormField label="Occupation / Profession">
                <Input value={profile.father?.occupation || ''} placeholder="e.g. Government Employee, Business" onChange={e => set('father.occupation', e.target.value)} />
              </FormField>
              <FormField label="Organization / Employer" hint="Optional">
                <Input value={profile.father?.organization || ''} placeholder="Company, department, or firm name" onChange={e => set('father.organization', e.target.value)} />
              </FormField>
              <FormField label="Annual Income">
                <select className="input" value={profile.father?.annualIncome || ''} onChange={e => set('father.annualIncome', e.target.value)}>
                  <option value="">Select income range</option>
                  {INCOME_BRACKETS.map(b => <option key={b}>{b}</option>)}
                </select>
              </FormField>
              <FormField label="Mobile Number">
                <Input value={profile.father?.phone || ''} placeholder="10-digit mobile number" onChange={e => set('father.phone', e.target.value)} />
              </FormField>
              <FormField label="Email Address" hint="Optional">
                <Input type="email" value={profile.father?.email || ''} placeholder="father@example.com" onChange={e => set('father.email', e.target.value)} />
              </FormField>
              <FormField label="Aadhaar Number" hint="Optional">
                <Input value={profile.father?.aadhaar || ''} placeholder="12-digit Aadhaar" maxLength={12} onChange={e => set('father.aadhaar', e.target.value.replace(/\D/g, ''))} />
              </FormField>
            </div>
          </SectionCard>

          {/* ── Mother's Details ── */}
          <SectionCard icon={Heart} title="Mother's Details" subtitle="Employment and contact information for the mother">
            <div className="form-grid">
              <FormField label="Full Name">
                <Input value={profile.mother?.name || ''} placeholder="Mother's full name" onChange={e => set('mother.name', e.target.value)} />
              </FormField>
              <FormField label="Date of Birth">
                <Input type="date" value={profile.mother?.dob || ''} onChange={e => set('mother.dob', e.target.value)} />
              </FormField>
              <FormField label="Highest Qualification">
                <select className="input" value={profile.mother?.qualification || ''} onChange={e => set('mother.qualification', e.target.value)}>
                  <option value="">Select qualification</option>
                  {QUALIFICATIONS.map(q => <option key={q}>{q}</option>)}
                </select>
              </FormField>
              <FormField label="Occupation / Profession">
                <Input value={profile.mother?.occupation || ''} placeholder="e.g. Homemaker, Teacher, Business" onChange={e => set('mother.occupation', e.target.value)} />
              </FormField>
              <FormField label="Organization / Employer" hint="Optional">
                <Input value={profile.mother?.organization || ''} placeholder="If employed — company or department" onChange={e => set('mother.organization', e.target.value)} />
              </FormField>
              <FormField label="Annual Income" hint="Optional — include if applicable">
                <select className="input" value={profile.mother?.annualIncome || ''} onChange={e => set('mother.annualIncome', e.target.value)}>
                  <option value="">Select income range</option>
                  {INCOME_BRACKETS.map(b => <option key={b}>{b}</option>)}
                </select>
              </FormField>
              <FormField label="Mobile Number">
                <Input value={profile.mother?.phone || ''} placeholder="10-digit mobile number" onChange={e => set('mother.phone', e.target.value)} />
              </FormField>
              <FormField label="Email Address" hint="Optional">
                <Input type="email" value={profile.mother?.email || ''} placeholder="mother@example.com" onChange={e => set('mother.email', e.target.value)} />
              </FormField>
              <FormField label="Aadhaar Number" hint="Optional">
                <Input value={profile.mother?.aadhaar || ''} placeholder="12-digit Aadhaar" maxLength={12} onChange={e => set('mother.aadhaar', e.target.value.replace(/\D/g, ''))} />
              </FormField>
            </div>
          </SectionCard>

          {/* ── Guardian (conditional) ── */}
          <SectionCard icon={Users} title="Guardian Details" subtitle="Fill only if your legal guardian is someone other than your parents">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={!!profile.hasGuardian}
                onChange={e => set('hasGuardian', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                My legal guardian is different from my parents
              </span>
            </label>
            {profile.hasGuardian && (
              <div className="form-grid">
                <FormField label="Guardian's Full Name">
                  <Input value={profile.guardian?.name || ''} placeholder="Full name" onChange={e => set('guardian.name', e.target.value)} />
                </FormField>
                <FormField label="Relation to Student">
                  <Input value={profile.guardian?.relation || ''} placeholder="e.g. Uncle, Grandparent, Elder Sibling" onChange={e => set('guardian.relation', e.target.value)} />
                </FormField>
                <FormField label="Mobile Number">
                  <Input value={profile.guardian?.phone || ''} placeholder="10-digit mobile" onChange={e => set('guardian.phone', e.target.value)} />
                </FormField>
                <FormField label="Guardian's Address" hint="If different from student's address">
                  <Input value={profile.guardian?.address || ''} placeholder="Full address" onChange={e => set('guardian.address', e.target.value)} />
                </FormField>
              </div>
            )}
          </SectionCard>

          {/* ── Previous School ── */}
          <SectionCard icon={BookOpen} title="Previous Academic Record" subtitle="School attended before joining this institution">
            <div className="form-grid">
              <FormField label="Previous School Name">
                <Input value={profile.previousSchool?.name || ''} placeholder="Name of the last school attended" onChange={e => set('previousSchool.name', e.target.value)} />
              </FormField>
              <FormField label="Board / Affiliation">
                <select className="input" value={profile.previousSchool?.board || ''} onChange={e => set('previousSchool.board', e.target.value)}>
                  <option value="">Select board</option>
                  {['CBSE', 'ICSE', 'IGCSE', 'IB', 'State Board', 'Madrassa', 'Other'].map(b => <option key={b}>{b}</option>)}
                </select>
              </FormField>
              <FormField label="Last Class Attended">
                <Input value={profile.previousSchool?.lastClass || ''} placeholder="e.g. Class 5, KG-2" onChange={e => set('previousSchool.lastClass', e.target.value)} />
              </FormField>
              <FormField label="Year of Leaving">
                <Input value={profile.previousSchool?.yearOfPassing || ''} placeholder="e.g. 2024" maxLength={4} onChange={e => set('previousSchool.yearOfPassing', e.target.value)} />
              </FormField>
              <FormField label="Transfer Certificate No.">
                <Input value={profile.previousSchool?.tcNumber || ''} placeholder="TC / LC number issued by previous school" onChange={e => set('previousSchool.tcNumber', e.target.value)} />
              </FormField>
              <FormField label="Reason for Transfer">
                <Input value={profile.previousSchool?.reasonForTransfer || ''} placeholder="e.g. Relocation, better opportunities" onChange={e => set('previousSchool.reasonForTransfer', e.target.value)} />
              </FormField>
            </div>
          </SectionCard>

          {/* ── Health Information ── */}
          <SectionCard icon={Activity} title="Health Information" subtitle="Medical details for the school nurse and administration">
            <div className="form-grid">
              <FormField label="Height (cm)" hint="Measured at time of enrollment">
                <Input type="number" value={profile.health?.height || ''} placeholder="e.g. 152" onChange={e => set('health.height', e.target.value)} />
              </FormField>
              <FormField label="Weight (kg)" hint="Measured at time of enrollment">
                <Input type="number" value={profile.health?.weight || ''} placeholder="e.g. 42" onChange={e => set('health.weight', e.target.value)} />
              </FormField>
              <FormField label="Vision Correction">
                <select className="input" value={profile.health?.vision || ''} onChange={e => set('health.vision', e.target.value)}>
                  <option value="">Select</option>
                  <option>None — Normal vision</option>
                  <option>Spectacles</option>
                  <option>Contact Lens</option>
                </select>
              </FormField>
              <FormField label="Hearing Impairment">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!profile.health?.hearingIssues}
                    onChange={e => set('health.hearingIssues', e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: 14 }}>Has hearing impairment</span>
                </label>
              </FormField>
              <FormField label="Chronic Medical Conditions" hint="e.g. Asthma, Diabetes, Epilepsy — write 'None' if not applicable">
                <Input value={profile.health?.medicalConditions || ''} placeholder="List any chronic conditions or None" onChange={e => set('health.medicalConditions', e.target.value)} />
              </FormField>
              <FormField label="Known Allergies" hint="e.g. Peanuts, Dust, Penicillin — write 'None' if not applicable">
                <Input value={profile.health?.allergies || ''} placeholder="List allergies or None" onChange={e => set('health.allergies', e.target.value)} />
              </FormField>
              <FormField label="Emergency Medical Notes" hint="Critical info for school nurse — medication, special needs, etc.">
                <Input value={profile.health?.emergencyNotes || ''} placeholder="Any critical medical notes for staff" onChange={e => set('health.emergencyNotes', e.target.value)} />
              </FormField>
            </div>
          </SectionCard>

          {/* ── Siblings in School ── */}
          <SectionCard icon={Users} title="Siblings in This School" subtitle="List other family members currently enrolled here">
            <SiblingEditor
              siblings={profile.siblings || []}
              onChange={v => setProfile(p => ({ ...p, siblings: v }))}
            />
            {(!profile.siblings || profile.siblings.length === 0) && (
              <p style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>
                No siblings added — tap the button above if any apply.
              </p>
            )}
          </SectionCard>

          {/* Bottom save button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn accent" onClick={handleSave} disabled={saving} style={{ minWidth: 160 }}>
              {saving ? 'Saving…' : 'Update Profile'}
            </button>
          </div>

          {/* ── Account Security ── */}
          <div style={{ paddingTop: 8 }}>
            <p className="eyebrow" style={{ marginBottom: 4 }}>Account Security</p>
          </div>
          <SectionCard icon={Lock} title="Change Password" subtitle="Update the password you use to sign in">
            <form onSubmit={handlePasswordChange}>
              <div className="stack">
                <FormField label="Current Password" required>
                  <div style={{ position: 'relative' }}>
                    <Input
                      type={showPwd.current ? 'text' : 'password'}
                      placeholder="Enter current password"
                      required
                      value={pwd.current}
                      onChange={e => setPwd({ ...pwd, current: e.target.value })}
                    />
                    <button type="button" onClick={() => setShowPwd(s => ({ ...s, current: !s.current }))}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex' }}>
                      {showPwd.current ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </FormField>
                <FormField label="New Password" required>
                  <div style={{ position: 'relative' }}>
                    <Input
                      type={showPwd.next ? 'text' : 'password'}
                      placeholder="Min. 6 characters"
                      required
                      value={pwd.next}
                      onChange={e => setPwd({ ...pwd, next: e.target.value })}
                    />
                    <button type="button" onClick={() => setShowPwd(s => ({ ...s, next: !s.next }))}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex' }}>
                      {showPwd.next ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </FormField>
                <FormField label="Confirm New Password" required>
                  <Input
                    type="password"
                    placeholder="Repeat new password"
                    required
                    value={pwd.confirm}
                    onChange={e => setPwd({ ...pwd, confirm: e.target.value })}
                  />
                </FormField>
                {pwdError && <p style={{ fontSize: 13, color: 'var(--coral)' }}>{pwdError}</p>}
                {pwdSuccess && <p style={{ fontSize: 13, color: 'var(--leaf)' }}>{pwdSuccess}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn" disabled={pwdLoading}>
                    {pwdLoading ? 'Updating…' : 'Change Password'}
                  </button>
                </div>
              </div>
            </form>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
