import React, { useState, useEffect } from 'react';
import { Save, Settings2, GraduationCap, Building2, Phone, Globe, Mail, Database, AlertTriangle, RotateCw, Receipt } from 'lucide-react';
import { UserProfile } from '../../types';
import { getSchoolSettings, saveSchoolSettings, SchoolSettings } from '../../services/settingsService';
import { useToast } from '../../components/Toast';
import { PageHeader, Card, Button, FormField, Input } from '../../components/ui';
import { logActivity } from '../../services/activityService';
import { migrateLegacyResults } from '../../services/examService';

const YEAR_REGEX = /^\d{4}-\d{2}$/;

export default function SchoolSettings({ user }: { user: UserProfile }) {
  const [settings, setSettings] = useState<SchoolSettings>({ academicYear: '2026-27' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationReport, setMigrationReport] = useState<{ copied: number; skipped: number } | null>(null);
  const { showToast } = useToast();

  const isSuperAdmin = user.role === 'super_admin';

  const handleMigrateResults = async () => {
    if (migrating) return;
    const ok = window.confirm(
      'Copy any orphaned exam results from the legacy "results" collection into "examResults"?\n\n' +
      'This is safe to run repeatedly — existing canonical records will not be overwritten.',
    );
    if (!ok) return;
    setMigrating(true);
    setMigrationReport(null);
    try {
      const report = await migrateLegacyResults();
      setMigrationReport(report);
      await logActivity(user, 'Legacy Results Migrated', 'Super Admin',
        `Copied ${report.copied} legacy result(s), skipped ${report.skipped}`);
      showToast(`Migrated ${report.copied} result(s) (${report.skipped} skipped)`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Migration failed', 'error');
    } finally {
      setMigrating(false);
    }
  };

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
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">School Settings</h1>
          <p className="text-xs text-indigo-200 mt-0.5">Global configuration for all portals</p>
        </div>

        <div className="px-4 pt-4 pb-24 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">Academic</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-600 mb-1.5">Current Academic Year</p>
              <input
                value={settings.academicYear}
                onChange={set('academicYear')}
                placeholder="2026-27"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">Format: YYYY-YY (e.g. 2026-27). Appears on receipts & reports.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">School Information</p>
            </div>

            {[
              { field: 'schoolName' as keyof SchoolSettings, label: 'School Name', placeholder: 'The Elden Heights School', icon: Building2 },
              { field: 'address' as keyof SchoolSettings, label: 'Address', placeholder: 'Hazaribagh, Jharkhand', icon: Building2 },
              { field: 'phone' as keyof SchoolSettings, label: 'Phone', placeholder: '9431904333', icon: Phone },
              { field: 'website' as keyof SchoolSettings, label: 'Website', placeholder: 'eldenheights.org', icon: Globe },
              { field: 'email' as keyof SchoolSettings, label: 'Email', placeholder: 'contact@eldenheights.org', icon: Mail },
            ].map(({ field, label, placeholder }) => (
              <div key={field}>
                <p className="text-xs font-bold text-slate-600 mb-1.5">{label}</p>
                <input
                  value={(settings[field] as string) || ''}
                  onChange={set(field)}
                  placeholder={placeholder}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                />
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Receipt className="w-4 h-4 text-indigo-600" />
              <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">Receipt Settings</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-600 mb-1.5">Receipt Prefix</p>
              <input
                value={settings.receiptPrefix || ''}
                onChange={set('receiptPrefix')}
                placeholder="EHSREC"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">Letters before the number on every receipt (e.g. EHSREC → EHSREC0001).</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-600 mb-1.5">Start From</p>
              <input
                type="number"
                min={1}
                value={settings.receiptStartNumber ?? 1}
                onChange={(e) => setSettings(prev => ({ ...prev, receiptStartNumber: Number(e.target.value) }))}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">First receipt number. Only applies before any receipt is generated.</p>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 safe-area-bottom">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block p-6 space-y-6 max-w-2xl">
        <PageHeader
          title="School Settings"
          subtitle="Configure global settings that apply across all portals and documents"
          icon={Settings2}
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
            <FormField label="Phone">
              <Input value={settings.phone || ''} onChange={set('phone')} placeholder="9431904333 / 9288483677" />
            </FormField>
            <FormField label="Website">
              <Input value={settings.website || ''} onChange={set('website')} placeholder="eldenheights.org" />
            </FormField>
            <FormField label="Email">
              <Input value={settings.email || ''} onChange={set('email')} placeholder="contact@eldenheights.org" />
            </FormField>
          </div>
        </Card>

        <Card className="p-6 space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Receipt className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Receipt Settings</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Receipt Prefix" hint="Letters before the number on every receipt (e.g. EHSREC → EHSREC0001)">
              <Input
                value={settings.receiptPrefix || ''}
                onChange={set('receiptPrefix')}
                placeholder="EHSREC"
                className="font-mono"
              />
            </FormField>
            <FormField label="Start From" hint="First receipt number. Only applies before any receipt is generated.">
              <Input
                type="number"
                min={1}
                value={settings.receiptStartNumber ?? 1}
                onChange={(e) => setSettings(prev => ({ ...prev, receiptStartNumber: Number(e.target.value) }))}
                className="font-mono max-w-xs"
              />
            </FormField>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>

        {isSuperAdmin && (
          <Card className="p-6 space-y-4 border-amber-200 bg-amber-50/30">
            <div className="flex items-center gap-2 pb-2 border-b border-amber-100">
              <Database className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wide">Maintenance</h3>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">Migrate Legacy Exam Results</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    A pre-fix version of the marks-entry page wrote to a <code className="px-1 bg-slate-100 rounded text-[10px]">results</code> collection
                    instead of <code className="px-1 bg-slate-100 rounded text-[10px]">examResults</code>. This tool copies any
                    orphaned rows over. Safe to run repeatedly — existing records are preserved.
                  </p>
                </div>
              </div>

              {migrationReport && (
                <div className="ml-7 mt-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                  <strong>Migration complete:</strong> {migrationReport.copied} record(s) copied, {migrationReport.skipped} skipped (already present or invalid).
                </div>
              )}

              <div className="ml-7">
                <Button
                  onClick={handleMigrateResults}
                  disabled={migrating}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <RotateCw className={`w-4 h-4 mr-2 ${migrating ? 'animate-spin' : ''}`} />
                  {migrating ? 'Migrating...' : 'Run Migration'}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
