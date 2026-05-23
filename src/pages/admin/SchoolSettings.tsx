import React, { useState, useEffect } from 'react';
import { Save, RotateCw, AlertTriangle, Database } from 'lucide-react';
import { UserProfile } from '../../types';
import { getSchoolSettings, saveSchoolSettings, SchoolSettings } from '../../services/settingsService';
import { useToast } from '../../components/Toast';
import { FormField, Input } from '../../components/ui';
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
    if (settings.defaultFeeDueDay != null && (settings.defaultFeeDueDay < 1 || settings.defaultFeeDueDay > 28)) {
      showToast('Default fee due day must be between 1 and 28', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveSchoolSettings({ ...settings, updatedBy: user.uid });
      await logActivity(user, 'School Settings Updated', 'Super Admin', `Academic year set to ${settings.academicYear}`, { academicYear: settings.academicYear });
      showToast('Settings saved successfully', 'success');
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="pad stack" style={{ gap: 16 }}>
        <div style={{ height: 32, width: 192, background: 'var(--cream-2)', borderRadius: 8 }} />
        <div style={{ height: 160, background: 'var(--cream-2)', borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div className="pad stack" style={{ gap: 24, maxWidth: 680 }}>
      <div className="topbar">
        <div>
          <div className="eyebrow">{user.role.replace('_', ' ')}</div>
          <h1>School Settings</h1>
        </div>
        <button className="btn accent" onClick={handleSave} disabled={saving}>
          <Save size={15} />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Academic */}
      <div className="card stack" style={{ gap: 20 }}>
        <div className="eyebrow">Academic</div>
        <FormField
          label="Current Academic Year"
          hint="Format: YYYY-YY (e.g. 2026-27). Appears on fee receipts, reports and all portals."
        >
          <Input
            value={settings.academicYear}
            onChange={set('academicYear')}
            placeholder="2026-27"
            className="mono"
            style={{ maxWidth: 200 }}
          />
        </FormField>
      </div>

      {/* School Information */}
      <div className="card stack" style={{ gap: 20 }}>
        <div className="eyebrow">School Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
      </div>

      {/* Receipt Settings */}
      <div className="card stack" style={{ gap: 20 }}>
        <div className="eyebrow">Receipt Settings</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FormField label="Receipt Prefix" hint="Letters before the number on every receipt (e.g. EHSREC → EHSREC0001)">
            <Input
              value={settings.receiptPrefix || ''}
              onChange={set('receiptPrefix')}
              placeholder="EHSREC"
              className="mono"
            />
          </FormField>
          <FormField label="Start From" hint="First receipt number. Only applies before any receipt is generated.">
            <Input
              type="number"
              min={1}
              value={settings.receiptStartNumber ?? 1}
              onChange={(e) => setSettings(prev => ({ ...prev, receiptStartNumber: Number(e.target.value) }))}
              className="mono"
              style={{ maxWidth: 160 }}
            />
          </FormField>
        </div>
      </div>

      {/* Fee Settings */}
      <div className="card stack" style={{ gap: 20 }}>
        <div className="eyebrow">Fee Settings</div>
        <FormField
          label="Default Fee Due Day"
          hint="Day of the following month that new fee requests default to. Range 1–28. Accountant can still override per request."
        >
          <Input
            type="number"
            min={1}
            max={28}
            value={settings.defaultFeeDueDay ?? 10}
            onChange={(e) => setSettings(prev => ({ ...prev, defaultFeeDueDay: Number(e.target.value) }))}
            className="mono"
            style={{ maxWidth: 120 }}
          />
        </FormField>
      </div>

      {/* Migration — super_admin only */}
      {isSuperAdmin && (
        <div className="card stack" style={{ gap: 16, borderColor: 'var(--coral)', background: 'rgba(239,68,68,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={15} style={{ color: 'var(--coral)' }} />
            <div className="eyebrow" style={{ color: 'var(--coral)' }}>Maintenance</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <AlertTriangle size={16} style={{ color: 'var(--coral)', flexShrink: 0, marginTop: 2 }} />
            <div className="stack" style={{ gap: 4, flex: 1 }}>
              <p style={{ fontWeight: 700, fontSize: 14 }}>Migrate Legacy Exam Results</p>
              <p className="muted tiny">
                A pre-fix version of the marks-entry page wrote to a <code style={{ background: 'var(--cream-2)', padding: '1px 4px', borderRadius: 4 }}>results</code> collection
                instead of <code style={{ background: 'var(--cream-2)', padding: '1px 4px', borderRadius: 4 }}>examResults</code>. This tool copies any orphaned rows over. Safe to run repeatedly — existing records are preserved.
              </p>
            </div>
          </div>

          {migrationReport && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.3)', fontSize: 13, color: 'var(--leaf)' }}>
              <strong>Migration complete:</strong> {migrationReport.copied} record(s) copied, {migrationReport.skipped} skipped.
            </div>
          )}

          <button
            className="btn ghost"
            onClick={handleMigrateResults}
            disabled={migrating}
            style={{ alignSelf: 'flex-start', borderColor: 'var(--coral)', color: 'var(--coral)' }}
          >
            <RotateCw size={14} style={migrating ? { animation: 'spin 1s linear infinite' } : {}} />
            {migrating ? 'Migrating...' : 'Run Migration'}
          </button>
        </div>
      )}
    </div>
  );
}
