import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, Student, ExtendedStudentProfile } from '../../types';
import { FormField, Input } from '../../components/ui';
import {
  User, Heart, Home as HomeIcon, Briefcase, BookOpen, Activity,
  Users, CreditCard, CheckCircle, AlertCircle, ExternalLink, Edit2, Save, X,
} from 'lucide-react';

const QUALIFICATIONS = [
  'Illiterate','Below Primary','Primary (Class 1–5)','Middle (Class 6–8)',
  'Secondary / Matric (10th)','Senior Secondary (12th)','Diploma / ITI',
  'Graduate (BA/BSc/BCom)','Post Graduate (MA/MSc/MCom)',
  'Professional Degree (MBBS/BTech/LLB/CA)','Doctorate (PhD)',
];
const INCOME_BRACKETS = [
  'Below ₹1 Lakh','₹1–2 Lakh','₹2–5 Lakh','₹5–10 Lakh',
  '₹10–20 Lakh','₹20–50 Lakh','Above ₹50 Lakh',
];

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--line-2)' }}>
      <span style={{ fontSize: 12, color: 'var(--ink-3)', flexShrink: 0, paddingTop: 2, minWidth: 140 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, textAlign: 'right', color: value ? 'var(--ink)' : 'var(--ink-4)', wordBreak: 'break-word' }}>
        {value || '—'}
      </span>
    </div>
  );
}

function SectionCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
        <div className="section-icon" style={{ width: 30, height: 30, borderRadius: 8 }}>
          <Icon size={15} style={{ color: 'var(--ink-2)' }} />
        </div>
        <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</p>
      </div>
      {children}
    </div>
  );
}

interface Props {
  user: UserProfile;
  selectedStudent: Student | null;
}

export default function ParentChildProfile({ user, selectedStudent }: Props) {
  const [profile, setProfile] = useState<ExtendedStudentProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [editSection, setEditSection] = useState<'father' | 'mother' | null>(null);
  const [editData, setEditData] = useState<{ qualification?: string; occupation?: string; organization?: string; annualIncome?: string; phone?: string; email?: string; aadhaar?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedStudent?.id) return;
    setLoading(true);
    getDoc(doc(db, 'studentProfiles', selectedStudent.id)).then(snap => {
      setProfile(snap.exists() ? snap.data() as ExtendedStudentProfile : null);
    }).catch(() => setProfile(null)).finally(() => setLoading(false));
  }, [selectedStudent?.id]);

  const startEdit = (section: 'father' | 'mother') => {
    setEditSection(section);
    const data = profile?.[section] || {};
    setEditData({
      qualification: data.qualification || '',
      occupation: data.occupation || '',
      organization: data.organization || '',
      annualIncome: data.annualIncome || '',
      phone: data.phone || '',
      email: data.email || '',
      aadhaar: data.aadhaar || '',
    });
    setError('');
  };

  const handleSave = async () => {
    if (!selectedStudent?.id || !editSection) return;
    setSaving(true);
    setError('');
    try {
      const updatedProfile = {
        ...(profile || {}),
        studentId: selectedStudent.id,
        [editSection]: {
          ...(profile?.[editSection] || {}),
          ...editData,
        },
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        updatedByName: user.name,
      } as ExtendedStudentProfile;
      await setDoc(doc(db, 'studentProfiles', selectedStudent.id), updatedProfile, { merge: true });
      setProfile(updatedProfile);
      setEditSection(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch { setError('Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  if (!selectedStudent) {
    return (
      <div className="pad">
        <div className="topbar"><div><div className="eyebrow">Parent Portal</div><h1>Child Profile</h1></div></div>
        <p className="muted" style={{ paddingTop: 20 }}>No student selected.</p>
      </div>
    );
  }

  const completion = profile?.completionPercentage || 0;
  const completionColor = completion === 100 ? 'var(--leaf)' : completion >= 60 ? 'var(--accent)' : 'var(--coral)';

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="eyebrow">Parent Portal</div>
          <h1>Child Profile</h1>
        </div>
      </div>

      <div className="pad" style={{ paddingTop: 16, paddingBottom: 40 }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: 'var(--ink)' }} />
          </div>
        ) : (
          <div className="stack">

            {/* Student summary card */}
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {selectedStudent.photoURL
                ? <img src={selectedStudent.photoURL} alt={selectedStudent.name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                : <div className="avatar" style={{ width: 56, height: 56, fontSize: 18, flexShrink: 0 }}>{selectedStudent.name.charAt(0).toUpperCase()}</div>
              }
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)' }} className="display">{selectedStudent.name}</p>
                <p style={{ fontSize: 12, color: 'var(--ink-3)' }} className="mono">{selectedStudent.admissionNumber}</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', border: `3px solid ${completionColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: completionColor, fontFamily: 'var(--display)' }}>{completion}%</span>
                </div>
                <p style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3 }}>Profile</p>
              </div>
            </div>

            {/* Status messages */}
            {saveSuccess && (
              <div style={{ background: '#f0fdf4', border: '1px solid var(--leaf)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={16} style={{ color: 'var(--leaf)' }} />
                <span style={{ fontSize: 13, color: 'var(--leaf)', fontWeight: 600 }}>Your details have been updated!</span>
              </div>
            )}
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid var(--coral)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} style={{ color: 'var(--coral)' }} />
                <span style={{ fontSize: 13, color: 'var(--coral)' }}>{error}</span>
              </div>
            )}

            {!profile ? (
              <div style={{ background: 'var(--cream-2)', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
                <AlertCircle size={24} style={{ color: 'var(--ink-3)', margin: '0 auto 8px' }} />
                <p style={{ fontWeight: 600, fontSize: 14 }}>Profile not yet filled</p>
                <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>Your child hasn't completed their student profile yet. Please ask them to log in and fill their profile.</p>
              </div>
            ) : (
              <>

                {/* ID Card Photos */}
                <SectionCard icon={CreditCard} title="Identity Documents">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                    {(['front', 'back'] as const).map(side => {
                      const url = side === 'front' ? profile.idCardFrontUrl : profile.idCardBackUrl;
                      return (
                        <div key={side}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 6, textTransform: 'uppercase' }}>
                            {side === 'front' ? 'Front Side' : 'Back Side'}
                          </p>
                          <div style={{ border: `2px solid ${url ? 'var(--leaf)' : 'var(--coral)'}`, borderRadius: 10, minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', background: 'var(--cream)' }}>
                            {url ? (
                              <img src={url} alt={`ID ${side}`} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                            ) : (
                              <p style={{ fontSize: 12, color: 'var(--coral)', fontWeight: 600 }}>Not uploaded</p>
                            )}
                          </div>
                          {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 4 }}><ExternalLink size={10} /> View</a>}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>

                {/* Student Personal Info (read-only) */}
                <SectionCard icon={User} title="Personal Information">
                  <InfoRow label="Date of Birth" value={profile.dateOfBirth} />
                  <InfoRow label="Blood Group" value={profile.bloodGroup} />
                  <InfoRow label="Religion" value={profile.religion} />
                  <InfoRow label="Category" value={profile.category} />
                  <InfoRow label="Nationality" value={profile.nationality} />
                  <InfoRow label="Aadhaar Number" value={profile.aadhaarNumber ? `****${profile.aadhaarNumber.slice(-4)}` : undefined} />
                  <InfoRow label="Languages Known" value={profile.languagesKnown} />
                </SectionCard>

                {/* Address (read-only) */}
                {profile.permanentAddress && (
                  <SectionCard icon={HomeIcon} title="Permanent Address">
                    <InfoRow label="House/Flat" value={profile.permanentAddress.house} />
                    <InfoRow label="Street/Colony" value={profile.permanentAddress.street} />
                    <InfoRow label="City" value={profile.permanentAddress.city} />
                    <InfoRow label="State" value={profile.permanentAddress.state} />
                    <InfoRow label="PIN Code" value={profile.permanentAddress.pinCode} />
                  </SectionCard>
                )}

                {/* Health (read-only) */}
                {profile.health && (
                  <SectionCard icon={Activity} title="Health Information">
                    <InfoRow label="Height" value={profile.health.height ? `${profile.health.height} cm` : null} />
                    <InfoRow label="Weight" value={profile.health.weight ? `${profile.health.weight} kg` : null} />
                    <InfoRow label="Vision" value={profile.health.vision} />
                    <InfoRow label="Medical Conditions" value={profile.health.medicalConditions} />
                    <InfoRow label="Allergies" value={profile.health.allergies} />
                  </SectionCard>
                )}

                {/* Previous School (read-only) */}
                {profile.previousSchool?.name && (
                  <SectionCard icon={BookOpen} title="Previous School">
                    <InfoRow label="School Name" value={profile.previousSchool.name} />
                    <InfoRow label="Board" value={profile.previousSchool.board} />
                    <InfoRow label="Last Class" value={profile.previousSchool.lastClass} />
                    <InfoRow label="TC Number" value={profile.previousSchool.tcNumber} />
                  </SectionCard>
                )}

                {/* Father (parent can edit their own section) */}
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="section-icon" style={{ width: 30, height: 30, borderRadius: 8 }}>
                        <Briefcase size={15} style={{ color: 'var(--ink-2)' }} />
                      </div>
                      <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Father's Details</p>
                    </div>
                    {editSection !== 'father' ? (
                      <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => startEdit('father')}>
                        <Edit2 size={12} /> Edit My Info
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => { setEditSection(null); setError(''); }}>
                          <X size={12} /> Cancel
                        </button>
                        <button className="btn accent" style={{ fontSize: 12, padding: '5px 10px' }} onClick={handleSave} disabled={saving}>
                          <Save size={12} /> {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
                  {editSection === 'father' ? (
                    <div className="form-grid">
                      <FormField label="Qualification">
                        <select className="input" value={editData.qualification || ''} onChange={e => setEditData(d => ({ ...d, qualification: e.target.value }))}>
                          <option value="">Select</option>{QUALIFICATIONS.map(q => <option key={q}>{q}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Occupation"><Input value={editData.occupation || ''} onChange={e => setEditData(d => ({ ...d, occupation: e.target.value }))} /></FormField>
                      <FormField label="Organization"><Input value={editData.organization || ''} onChange={e => setEditData(d => ({ ...d, organization: e.target.value }))} /></FormField>
                      <FormField label="Annual Income">
                        <select className="input" value={editData.annualIncome || ''} onChange={e => setEditData(d => ({ ...d, annualIncome: e.target.value }))}>
                          <option value="">Select</option>{INCOME_BRACKETS.map(b => <option key={b}>{b}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Mobile Number"><Input value={editData.phone || ''} onChange={e => setEditData(d => ({ ...d, phone: e.target.value }))} /></FormField>
                      <FormField label="Email"><Input type="email" value={editData.email || ''} onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} /></FormField>
                    </div>
                  ) : (
                    <>
                      <InfoRow label="Full Name" value={profile.father?.name} />
                      <InfoRow label="Qualification" value={profile.father?.qualification} />
                      <InfoRow label="Occupation" value={profile.father?.occupation} />
                      <InfoRow label="Organization" value={profile.father?.organization} />
                      <InfoRow label="Annual Income" value={profile.father?.annualIncome} />
                      <InfoRow label="Mobile" value={profile.father?.phone} />
                      <InfoRow label="Email" value={profile.father?.email} />
                    </>
                  )}
                </div>

                {/* Mother (parent can edit) */}
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="section-icon" style={{ width: 30, height: 30, borderRadius: 8 }}>
                        <Heart size={15} style={{ color: 'var(--ink-2)' }} />
                      </div>
                      <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mother's Details</p>
                    </div>
                    {editSection !== 'mother' ? (
                      <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => startEdit('mother')}>
                        <Edit2 size={12} /> Edit My Info
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => { setEditSection(null); setError(''); }}>
                          <X size={12} /> Cancel
                        </button>
                        <button className="btn accent" style={{ fontSize: 12, padding: '5px 10px' }} onClick={handleSave} disabled={saving}>
                          <Save size={12} /> {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
                  {editSection === 'mother' ? (
                    <div className="form-grid">
                      <FormField label="Qualification">
                        <select className="input" value={editData.qualification || ''} onChange={e => setEditData(d => ({ ...d, qualification: e.target.value }))}>
                          <option value="">Select</option>{QUALIFICATIONS.map(q => <option key={q}>{q}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Occupation"><Input value={editData.occupation || ''} onChange={e => setEditData(d => ({ ...d, occupation: e.target.value }))} /></FormField>
                      <FormField label="Organization"><Input value={editData.organization || ''} onChange={e => setEditData(d => ({ ...d, organization: e.target.value }))} /></FormField>
                      <FormField label="Annual Income">
                        <select className="input" value={editData.annualIncome || ''} onChange={e => setEditData(d => ({ ...d, annualIncome: e.target.value }))}>
                          <option value="">Select</option>{INCOME_BRACKETS.map(b => <option key={b}>{b}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Mobile Number"><Input value={editData.phone || ''} onChange={e => setEditData(d => ({ ...d, phone: e.target.value }))} /></FormField>
                      <FormField label="Email"><Input type="email" value={editData.email || ''} onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} /></FormField>
                    </div>
                  ) : (
                    <>
                      <InfoRow label="Full Name" value={profile.mother?.name} />
                      <InfoRow label="Qualification" value={profile.mother?.qualification} />
                      <InfoRow label="Occupation" value={profile.mother?.occupation} />
                      <InfoRow label="Organization" value={profile.mother?.organization} />
                      <InfoRow label="Annual Income" value={profile.mother?.annualIncome} />
                      <InfoRow label="Mobile" value={profile.mother?.phone} />
                      <InfoRow label="Email" value={profile.mother?.email} />
                    </>
                  )}
                </div>

                {/* Siblings */}
                {(profile.siblings || []).length > 0 && (
                  <SectionCard icon={Users} title="Siblings in School">
                    {(profile.siblings || []).map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--line-2)' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{s.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--ink-3)' }} className="mono">{s.admissionNumber}</span>
                        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{s.class}</span>
                      </div>
                    ))}
                  </SectionCard>
                )}

                {profile.updatedAt && (
                  <p style={{ fontSize: 11, color: 'var(--ink-4)', textAlign: 'center' }}>
                    Last updated {new Date(profile.updatedAt).toLocaleString()}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
