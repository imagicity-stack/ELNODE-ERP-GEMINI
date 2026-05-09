import React, { useState, useEffect } from 'react';
import { Save, Settings2, GraduationCap, Building2, Phone, Globe, Mail } from 'lucide-react';
import { UserProfile } from '../../types';
import { getSchoolSettings, saveSchoolSettings, SchoolSettings } from '../../services/settingsService';
import { useToast } from '../../components/Toast';
import { PageHeader, Card, Button, FormField, Input } from '../../components/ui';
import { logActivity } from '../../services/activityService';

const YEAR_REGEX = /^\d{4}-\d{2}$/;

export default function SchoolSettings({ user }: { user: UserProfile }) {
  const [settings, setSettings] = useState<SchoolSettings>({ academicYear: '2026-27' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    getSchoolSettings()
      .then(s => setSettings(s))
      .catch(() => showToast('Failed to load settings', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const set = (field: keyof SchoolSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings(prev => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    if (!YEAR_REGEX.test(settings.academicYear)) {
      showToast('Academic year must be in format YYYY-YY (e.g. 2026-27)', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveSchoolSettings({ ...settings, updatedBy: user.uid });
      await logActivity(user, 'School Settings Updated', `Academic year set to ${settings.academicYear}`);
      showToast('Settings saved successfully', 'success');
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-slate-100 rounded" />
        <div className="h-40 bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader
        title="School Settings"
        subtitle="Configure global settings that apply across all portals and documents"
        icon={<Settings2 className="w-5 h-5" />}
      />

      <Card className="p-6 space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <GraduationCap className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Academic</h3>
        </div>

        <FormField
          label="Current Academic Year"
          hint="Format: YYYY-YY  (e.g. 2026-27). This appears on fee receipts, reports and all portals."
        >
          <Input
            value={settings.academicYear}
            onChange={set('academicYear')}
            placeholder="2026-27"
            className="max-w-xs font-mono"
          />
        </FormField>
      </Card>

      <Card className="p-6 space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <Building2 className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">School Information</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="School Name">
            <Input value={settings.schoolName || ''} onChange={set('schoolName')} placeholder="The Elden Heights School" />
          </FormField>
          <FormField label="Address">
            <Input value={settings.address || ''} onChange={set('address')} placeholder="Hazaribagh, Jharkhand · 825301" />
          </FormField>
          <FormField label={<span className="flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</span>}>
            <Input value={settings.phone || ''} onChange={set('phone')} placeholder="9431904333 / 9288483677" />
          </FormField>
          <FormField label={<span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Website</span>}>
            <Input value={settings.website || ''} onChange={set('website')} placeholder="eldenheights.org" />
          </FormField>
          <FormField label={<span className="flex items-center gap-1"><Mail className="w-3 h-3" /> Email</span>}>
            <Input value={settings.email || ''} onChange={set('email')} placeholder="contact@eldenheights.org" />
          </FormField>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
