import React, { useState, useEffect } from 'react';
import {
  Settings,
  Plus,
  Trash2,
  Save,
  ShieldAlert,
  Activity,
  History,
  AlertCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { FineConfig, FineSlab, UserProfile } from '../../types';
import { useToast } from '../../components/Toast';
import {
  Card,
  Button,
  Input,
  FormField,
  Badge,
  PageHeader
} from '../../components/ui';
import { logActivity } from '../../services/activityService';

const defaultSlabs: FineSlab[] = [
  { startDay: 6, endDay: 15, fixedPenalty: 250, percentagePenalty: 2, isHigherOf: true },
  { startDay: 16, endDay: 30, fixedPenalty: 500, percentagePenalty: 4, isHigherOf: true },
  { startDay: 31, endDay: 60, fixedPenalty: 1000, percentagePenalty: 6, isHigherOf: true },
  { startDay: 61, fixedPenalty: 1500, percentagePenalty: 8, isHigherOf: true, escalationRate: 0 }
];

// ─── Validation ───────────────────────────────────────────────────────────────

interface SlabErrors {
  startDay?: string;
  endDay?: string;
  penalty?: string;
  order?: string;
}

function validateConfig(config: FineConfig): { global: string[]; slabs: SlabErrors[] } {
  const global: string[] = [];
  const slabErrors: SlabErrors[] = config.slabs.map(() => ({}));

  if (config.gracePeriodDays < 0) {
    global.push('Grace period cannot be negative.');
  }

  config.slabs.forEach((slab, i) => {
    // startDay must be at least 1 (day after due date)
    if (slab.startDay < 1) {
      slabErrors[i].startDay = 'Start day must be ≥ 1 (days after due date).';
    }

    // First slab: startDay should be gracePeriodDays + 1 or more
    // Otherwise the slab will never fire because the grace period covers it
    if (i === 0 && slab.startDay <= config.gracePeriodDays) {
      slabErrors[i].startDay = `Start day must be > grace period (${config.gracePeriodDays}). Currently the grace period would overlap or cancel this slab.`;
    }

    // endDay must be > startDay
    if (slab.endDay !== undefined && slab.endDay <= slab.startDay) {
      slabErrors[i].endDay = 'End day must be greater than start day.';
    }

    // Penalties must be non-negative
    if (slab.fixedPenalty < 0 || slab.percentagePenalty < 0) {
      slabErrors[i].penalty = 'Penalty amounts cannot be negative.';
    }

    // Check ordering against previous slab
    if (i > 0) {
      const prev = config.slabs[i - 1];
      if (prev.endDay === undefined) {
        slabErrors[i].order = `Slab ${i} cannot exist after an open-ended slab (slab ${i} has no End Day). Remove it or add an End Day to slab ${i}.`;
      } else if (slab.startDay <= prev.endDay) {
        slabErrors[i].order = `Start day (${slab.startDay}) must be greater than previous slab's end day (${prev.endDay}). Slabs must not overlap.`;
      } else if (slab.startDay > prev.endDay + 1) {
        // Gap — not a blocking error, just a warning
        slabErrors[i].order = `Gap: days ${prev.endDay + 1}–${slab.startDay - 1} have no slab (no fine in that range).`;
      }
    }
  });

  return { global, slabs: slabErrors };
}

function hasBlockingErrors(validation: ReturnType<typeof validateConfig>): boolean {
  if (validation.global.length > 0) return true;
  return validation.slabs.some(e => e.startDay || e.endDay || e.penalty || (e.order && !e.order.startsWith('Gap:')));
}

export default function FineSettings({ user }: { user: UserProfile }) {
  const [config, setConfig] = useState<FineConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'fine-config', 'global');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setConfig(docSnap.data() as FineConfig);
        } else {
          const initialConfig: FineConfig = {
            id: 'global',
            isEnabled: true,
            gracePeriodDays: 5,
            slabs: defaultSlabs,
            updatedBy: user?.uid || '',
            updatedAt: new Date().toISOString()
          };
          setConfig(initialConfig);
        }
      } catch (err) {
        console.error('Error fetching fine config:', err);
        showToast('Failed to load settings', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [user]);

  const validation = config ? validateConfig(config) : { global: [], slabs: [] };
  const isInvalid = hasBlockingErrors(validation);

  const handleSave = async () => {
    if (!config || !user) return;
    if (isInvalid) {
      showToast('Fix the errors highlighted below before saving.', 'error');
      return;
    }
    setSaving(true);
    try {
      const updatedConfig = {
        ...config,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'fine-config', 'global'), updatedConfig);
      logActivity(user, 'Updated Fine Settings', 'Super Admin', 'Changed late payment penalty rules.');
      showToast('Fine settings saved successfully', 'success');
      setConfig(updatedConfig);
    } catch (err) {
      console.error('Error saving config:', err);
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addSlab = () => {
    if (!config) return;
    const lastSlab = config.slabs[config.slabs.length - 1];
    const newStart = lastSlab ? (lastSlab.endDay || lastSlab.startDay) + 1 : (config.gracePeriodDays + 1);

    const newSlab: FineSlab = {
      startDay: newStart,
      fixedPenalty: 0,
      percentagePenalty: 0,
      isHigherOf: true
    };

    setConfig({
      ...config,
      slabs: [...config.slabs, newSlab]
    });
  };

  const removeSlab = (index: number) => {
    if (!config) return;
    const newSlabs = config.slabs.filter((_, i) => i !== index);
    setConfig({ ...config, slabs: newSlabs });
  };

  const updateSlab = (index: number, updates: Partial<FineSlab>) => {
    if (!config) return;
    const newSlabs = [...config.slabs];
    newSlabs[index] = { ...newSlabs[index], ...updates };
    setConfig({ ...config, slabs: newSlabs });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile UI */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-rose-600 to-red-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Fine & Penalty</h1>
          <p className="text-xs text-rose-200 mt-0.5">{config?.slabs.length || 0} penalty slabs configured</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black">{config?.gracePeriodDays || 0}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Grace Days</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-xl font-black">{config?.isEnabled ? 'ON' : 'OFF'}</p>
              <p className="text-[9px] text-white/70 mt-0.5 uppercase font-bold">Status</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-24 space-y-4">
          {/* Global settings card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Global Settings</p>
            <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <div>
                <p className="text-sm font-bold text-slate-900">System Status</p>
                <p className="text-[10px] text-slate-500">Toggle penalty calculations</p>
              </div>
              <div
                onClick={() => setConfig(prev => prev ? { ...prev, isEnabled: !prev.isEnabled } : null)}
                className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${config?.isEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${config?.isEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-600 mb-1.5">Grace Period (Days)</p>
              <input
                type="number"
                value={config?.gracePeriodDays || 0}
                onChange={(e) => setConfig(prev => prev ? { ...prev, gracePeriodDays: Number(e.target.value) } : null)}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none"
              />
            </div>
          </div>

          {/* Global errors */}
          {validation.global.map((e, i) => (
            <div key={i} className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700 font-semibold">{e}</p>
            </div>
          ))}

          {/* Slabs */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Penalty Slabs</p>
            <button
              onClick={addSlab}
              className="flex items-center gap-1 text-xs font-bold text-indigo-600 active:scale-95 transition-transform"
            >
              <Plus className="w-3.5 h-3.5" /> Add Slab
            </button>
          </div>

          {/* Timeline legend */}
          <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex gap-2">
            <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-indigo-700 leading-relaxed">
              <b>Day 0</b> = due date. <b>Grace period</b> = days after due date with no fine (e.g. grace 5 → no fine until day 6).
              Each slab's <b>Start Day</b> must be &gt; grace period and &gt; previous slab's End Day.
            </p>
          </div>

          {config?.slabs.map((slab, index) => {
            const err = validation.slabs[index] || {};
            const isGap = err.order?.startsWith('Gap:');
            const hasError = !!(err.startDay || err.endDay || err.penalty || (err.order && !isGap));
            return (
              <div key={index} className={`bg-white border rounded-2xl p-4 shadow-sm ${hasError ? 'border-rose-300 bg-rose-50/30' : 'border-slate-100'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${hasError ? 'bg-rose-100 text-rose-700' : 'bg-rose-50 text-rose-700'}`}>Slab {index + 1}</span>
                    {hasError && <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                    {isGap && !hasError && <span className="text-[10px] text-amber-600 font-semibold">⚠ {err.order}</span>}
                  </div>
                  <button onClick={() => removeSlab(index)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Start Day</p>
                    <input
                      type="number"
                      min={1}
                      value={slab.startDay}
                      onChange={(e) => updateSlab(index, { startDay: Number(e.target.value) })}
                      className={`w-full h-9 px-2 bg-slate-50 border rounded-lg text-sm outline-none ${err.startDay ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`}
                    />
                    {err.startDay && <p className="text-[10px] text-rose-600 mt-0.5 font-medium">{err.startDay}</p>}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">End Day</p>
                    <input
                      type="number"
                      min={slab.startDay + 1}
                      value={slab.endDay || ''}
                      onChange={(e) => updateSlab(index, { endDay: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="∞ open-ended"
                      className={`w-full h-9 px-2 bg-slate-50 border rounded-lg text-sm outline-none ${err.endDay ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`}
                    />
                    {err.endDay && <p className="text-[10px] text-rose-600 mt-0.5 font-medium">{err.endDay}</p>}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Fixed ₹</p>
                    <input
                      type="number"
                      min={0}
                      value={slab.fixedPenalty}
                      onChange={(e) => updateSlab(index, { fixedPenalty: Number(e.target.value) })}
                      className={`w-full h-9 px-2 bg-slate-50 border rounded-lg text-sm outline-none ${err.penalty ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">% of Dues</p>
                    <input
                      type="number"
                      min={0}
                      value={slab.percentagePenalty}
                      onChange={(e) => updateSlab(index, { percentagePenalty: Number(e.target.value) })}
                      className={`w-full h-9 px-2 bg-slate-50 border rounded-lg text-sm outline-none ${err.penalty ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`}
                    />
                    {err.penalty && <p className="text-[10px] text-rose-600 mt-0.5 font-medium">{err.penalty}</p>}
                  </div>
                </div>
                {err.order && !isGap && (
                  <p className="mt-2 text-[10px] text-rose-600 font-medium flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{err.order}
                  </p>
                )}
                <div className="mt-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Logic</p>
                  <select
                    value={slab.isHigherOf ? 'higher' : 'sum'}
                    onChange={(e) => updateSlab(index, { isHigherOf: e.target.value === 'higher' })}
                    className="w-full h-9 px-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                  >
                    <option value="higher">Whichever is Higher</option>
                    <option value="sum">Sum of Both</option>
                  </select>
                </div>
              </div>
            );
          })}

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-700 leading-relaxed">Changes reflect instantly on all overdue invoices.</p>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 safe-area-bottom">
          <button
            onClick={handleSave}
            disabled={saving || isInvalid}
            className="w-full flex items-center justify-center gap-2 py-3 bg-rose-600 text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : isInvalid ? 'Fix Errors to Save' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Desktop UI */}
      <div className="hidden md:block space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <PageHeader
          title="Fine & Penalty Management"
          subtitle="Configure automatic late payment fines and penalty structures"
          icon={ShieldAlert}
          iconColor="bg-rose-500"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-50 rounded-xl">
                    <Activity className="w-5 h-5 text-rose-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Penalty Slabs</h3>
                    <p className="text-xs text-slate-500">Define how fines increase over time</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={addSlab} icon={Plus}>
                  Add Slab
                </Button>
              </div>

              {/* Timeline explainer */}
              <div className="mb-6 p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex gap-3">
                <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-700">
                  <b>Day 0</b> = due date &nbsp;·&nbsp; <b>Grace period</b> days after due date have no fine &nbsp;·&nbsp;
                  Slab <b>Start Day</b> must be &gt; grace period &nbsp;·&nbsp; Slabs must not overlap &nbsp;·&nbsp;
                  Leave End Day blank to make the last slab open-ended.
                </p>
              </div>

              {/* Global validation errors */}
              {validation.global.map((e, i) => (
                <div key={i} className="mb-4 p-3 bg-rose-50 rounded-xl border border-rose-200 flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-700 font-semibold">{e}</p>
                </div>
              ))}

              <div className="space-y-4">
                {config?.slabs.map((slab, index) => {
                  const err = validation.slabs[index] || {};
                  const isGap = err.order?.startsWith('Gap:');
                  const hasError = !!(err.startDay || err.endDay || err.penalty || (err.order && !isGap));
                  return (
                    <div key={index} className={`p-4 rounded-2xl border transition-colors ${hasError ? 'bg-rose-50/40 border-rose-300' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${hasError ? 'bg-rose-100 text-rose-700' : 'bg-rose-50 text-rose-700'}`}>
                            Slab {index + 1}
                          </span>
                          {hasError && (
                            <span className="flex items-center gap-1 text-xs text-rose-600 font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" /> Fix errors below
                            </span>
                          )}
                          {isGap && !hasError && (
                            <span className="text-xs text-amber-600 font-semibold">⚠ {err.order}</span>
                          )}
                        </div>
                        <button
                          onClick={() => removeSlab(index)}
                          className="p-2 text-rose-500 hover:bg-rose-100 rounded-xl transition-colors"
                          title="Remove Slab"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-wrap lg:flex-nowrap gap-4 items-start">
                        <div className="flex-1 min-w-[120px]">
                          <FormField label="Start Day" hint={err.startDay}>
                            <Input
                              type="number"
                              min={1}
                              value={slab.startDay}
                              onChange={(e) => updateSlab(index, { startDay: Number(e.target.value) })}
                              className={err.startDay ? 'border-rose-400 bg-rose-50 focus:ring-rose-300' : ''}
                            />
                          </FormField>
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <FormField label="End Day" hint={err.endDay || 'Leave blank = open-ended'}>
                            <Input
                              type="number"
                              min={slab.startDay + 1}
                              value={slab.endDay || ''}
                              onChange={(e) => updateSlab(index, { endDay: e.target.value ? Number(e.target.value) : undefined })}
                              placeholder="∞"
                              className={err.endDay ? 'border-rose-400 bg-rose-50 focus:ring-rose-300' : ''}
                            />
                          </FormField>
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <FormField label="Fixed Penalty (₹)" hint={err.penalty}>
                            <Input
                              type="number"
                              min={0}
                              value={slab.fixedPenalty}
                              onChange={(e) => updateSlab(index, { fixedPenalty: Number(e.target.value) })}
                              className={err.penalty ? 'border-rose-400 bg-rose-50 focus:ring-rose-300' : ''}
                            />
                          </FormField>
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <FormField label="% of Dues">
                            <Input
                              type="number"
                              min={0}
                              value={slab.percentagePenalty}
                              onChange={(e) => updateSlab(index, { percentagePenalty: Number(e.target.value) })}
                              className={err.penalty ? 'border-rose-400 bg-rose-50 focus:ring-rose-300' : ''}
                            />
                          </FormField>
                        </div>
                        <div className="flex-1 min-w-[150px]">
                          <FormField label="Logic">
                            <select
                              className="w-full h-11 px-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all outline-none text-sm"
                              value={slab.isHigherOf ? 'higher' : 'sum'}
                              onChange={(e) => updateSlab(index, { isHigherOf: e.target.value === 'higher' })}
                            >
                              <option value="higher">Whichever is Higher</option>
                              <option value="sum">Sum of Both</option>
                            </select>
                          </FormField>
                        </div>
                      </div>

                      {err.order && !isGap && (
                        <p className="mt-2 text-xs text-rose-600 font-semibold flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{err.order}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  <Settings className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="font-bold text-slate-900">Global Settings</h3>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                  <div>
                    <p className="text-sm font-medium text-indigo-900">System Status</p>
                    <p className="text-[10px] text-indigo-600">Toggle penalty calculations</p>
                  </div>
                  <div
                    onClick={() => setConfig(prev => prev ? { ...prev, isEnabled: !prev.isEnabled } : null)}
                    className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors duration-300 ${config?.isEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-300 ${config?.isEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  </div>
                </div>

                <FormField
                  label="Grace Period (Days)"
                  hint={`No fine during these days after due date. First slab must start on day ${(config?.gracePeriodDays || 0) + 1} or later.`}
                >
                  <Input
                    type="number"
                    min={0}
                    value={config?.gracePeriodDays || 0}
                    onChange={(e) => setConfig(prev => prev ? { ...prev, gracePeriodDays: Number(e.target.value) } : null)}
                  />
                </FormField>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-700 leading-relaxed italic">
                    Changes reflect instantly on all overdue invoices across Teacher, Parent, and Account portals.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-slate-50 rounded-xl">
                  <History className="w-5 h-5 text-slate-600" />
                </div>
                <h3 className="font-bold text-slate-900">Information</h3>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Last Updated</span>
                  <Badge variant="default" className="text-[10px]">
                    {config?.updatedAt ? new Date(config.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}
                  </Badge>
                </div>
                {isInvalid && (
                  <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                    <p className="text-xs text-rose-700 font-semibold">Fix the errors above before saving.</p>
                  </div>
                )}
                <div className="pt-4 mt-4 border-t border-slate-100">
                  <Button
                    className="w-full"
                    variant="primary"
                    onClick={handleSave}
                    loading={saving}
                    disabled={isInvalid}
                    icon={Save}
                  >
                    {isInvalid ? 'Fix Errors to Save' : 'Save Configuration'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
