import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { AlertTriangle, FileCheck2 } from 'lucide-react';
import { db } from '../../firebase';
import { Student, UserProfile, FeeRequest, ExtendedStudentProfile, TCReason } from '../../types';
import { Modal, FormField, Input, Select, Textarea, Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import { getSchoolSettings } from '../../services/settingsService';
import { issueTC, TC_REASONS, TC_CONDUCT, IssueTCForm } from '../../services/tcService';
import { downloadTC } from '../../lib/tcCertificate';

const today = () => new Date().toISOString().slice(0, 10);

function YesNo({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden">
      {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map(o => (
        <button key={o.l} type="button" onClick={() => onChange(o.v)}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${value === o.v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export default function TCIssueModal({ student, className, user, onClose, onIssued }: {
  student: Student;
  className: string;
  user: UserProfile;
  onClose: () => void;
  onIssued: (studentId: string) => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outstanding, setOutstanding] = useState<number | null>(null);

  const [form, setForm] = useState<IssueTCForm>({
    dateOfBirth: '',
    admissionDate: '',
    lastAttendanceDate: today(),
    issueDate: today(),
    reason: "Parent's request",
    reasonDetail: '',
    classLastStudied: className || '',
    qualifiedForPromotion: true,
    promotedTo: '',
    conduct: 'Good',
    duesCleared: true,
    academicYear: '',
    remarks: '',
  });
  const set = <K extends keyof IssueTCForm>(k: K, v: IssueTCForm[K]) => setForm(f => ({ ...f, [k]: v }));

  // Pre-fill DOB + academic year, and auto-detect outstanding fees.
  useEffect(() => {
    getDoc(doc(db, 'studentProfiles', student.id))
      .then(s => { if (s.exists()) { const p = s.data() as ExtendedStudentProfile; if (p.dateOfBirth) set('dateOfBirth', p.dateOfBirth); } })
      .catch(() => {});
    getSchoolSettings().then(s => set('academicYear', s.academicYear || '')).catch(() => {});
    getDocs(query(collection(db, 'feeRequests'), where('studentId', '==', student.id)))
      .then(snap => {
        const due = snap.docs.map(d => d.data() as FeeRequest)
          .filter(r => r.status !== 'paid')
          .reduce((sum, r) => sum + ((r.totalAmount || 0) - (r.waivedAmount || 0) - (r.paidAmount || 0)), 0);
        const amt = Math.max(0, Math.round(due));
        setOutstanding(amt);
        if (amt > 0) set('duesCleared', false);
      })
      .catch(() => setOutstanding(null));
  }, [student.id]);

  const handleSubmit = async () => {
    if (!form.lastAttendanceDate || !form.issueDate) { setError('Issue date and last attendance date are required.'); return; }
    if (form.reason === 'Other' && !form.reasonDetail?.trim()) { setError('Please specify the reason for leaving.'); return; }
    setSaving(true);
    setError(null);
    try {
      const record = await issueTC(student, className, form, user);
      try {
        await logActivity(user, 'Transfer Certificate Issued', 'Super Admin',
          `Issued ${record.tcNumber} for ${student.name} (${student.admissionNumber}) — ${form.reason}`);
      } catch { /* non-fatal */ }
      try { await downloadTC(record); } catch { /* download is best-effort */ }
      showToast(`TC ${record.tcNumber} issued for ${student.name}`, 'success');
      onIssued(student.id);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not issue the Transfer Certificate. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={saving ? () => {} : onClose}
      title="Issue Transfer Certificate"
      subtitle={`${student.name} · ${student.admissionNumber} · ${className}${student.section ? ` · ${student.section}` : ''}`}
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">The student will be archived from the active directory once issued.</span>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" icon={FileCheck2} loading={saving} onClick={handleSubmit}>Issue TC</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {outstanding != null && outstanding > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>This student has <b>₹{outstanding.toLocaleString('en-IN')}</b> in outstanding fees. Confirm collection or waiver before marking dues cleared.</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Date of Birth"><Input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></FormField>
          <FormField label="Academic Year"><Input value={form.academicYear} onChange={e => set('academicYear', e.target.value)} placeholder="2026-27" /></FormField>
          <FormField label="Date of Admission"><Input type="date" value={form.admissionDate} onChange={e => set('admissionDate', e.target.value)} /></FormField>
          <FormField label="Date of Leaving (last attendance)" required><Input type="date" value={form.lastAttendanceDate} onChange={e => set('lastAttendanceDate', e.target.value)} /></FormField>
          <FormField label="Issue Date" required><Input type="date" value={form.issueDate} onChange={e => set('issueDate', e.target.value)} /></FormField>
          <FormField label="Class Last Studied" required><Input value={form.classLastStudied} onChange={e => set('classLastStudied', e.target.value)} /></FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Reason for Leaving" required>
            <Select value={form.reason} onChange={e => set('reason', e.target.value as TCReason)}>
              {TC_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          </FormField>
          <FormField label={form.reason === 'Other' ? 'Specify Reason' : 'Reason Detail (optional)'} required={form.reason === 'Other'}>
            <Input value={form.reasonDetail} onChange={e => set('reasonDetail', e.target.value)} placeholder="Additional detail" />
          </FormField>
          <FormField label="General Conduct" required>
            <Select value={form.conduct} onChange={e => set('conduct', e.target.value)}>
              {TC_CONDUCT.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </FormField>
          <FormField label="Promoted To (if applicable)"><Input value={form.promotedTo} onChange={e => set('promotedTo', e.target.value)} placeholder="e.g. Class 9" disabled={!form.qualifiedForPromotion} /></FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Qualified for Promotion"><YesNo value={form.qualifiedForPromotion} onChange={v => set('qualifiedForPromotion', v)} /></FormField>
          <FormField label="All Dues Cleared"><YesNo value={form.duesCleared} onChange={v => set('duesCleared', v)} /></FormField>
          <FormField label="Total Working Days (optional)"><Input type="number" min={0} value={form.workingDays ?? ''} onChange={e => set('workingDays', e.target.value ? Number(e.target.value) : undefined)} /></FormField>
          <FormField label="Days Attended (optional)"><Input type="number" min={0} value={form.daysAttended ?? ''} onChange={e => set('daysAttended', e.target.value ? Number(e.target.value) : undefined)} /></FormField>
        </div>

        <FormField label="Remarks"><Textarea rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Optional remarks for the certificate" /></FormField>

        {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}
      </div>
    </Modal>
  );
}
