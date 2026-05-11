import React, { useState, useEffect } from 'react';
import {
  Settings,
  Plus,
  Trash2,
  Save,
  ShieldAlert,
  Activity,
  History,
  AlertCircle
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

  const handleSave = async () => {
    if (!config || !user) return;
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
    const newStart = lastSlab ? (lastSlab.endDay || lastSlab.startDay) + 1 : 1;

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

          {config?.slabs.map((slab, index) => (
            <div key={index} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">Slab {index + 1}</span>
                <button onClick={() => removeSlab(index)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Start Day</p>
                  <input
                    type="number"
                    value={slab.startDay}
                    onChange={(e) => updateSlab(index, { startDay: Number(e.target.value) })}
                    className="w-full h-9 px-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">End Day</p>
                  <input
                    type="number"
                    value={slab.endDay || ''}
                    onChange={(e) => updateSlab(index, { endDay: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="∞"
                    className="w-full h-9 px-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Fixed ₹</p>
                  <input
                    type="number"
                    value={slab.fixedPenalty}
                    onChange={(e) => updateSlab(index, { fixedPenalty: Number(e.target.value) })}
                    className="w-full h-9 px-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">% of Dues</p>
                  <input
                    type="number"
                    value={slab.percentagePenalty}
                    onChange={(e) => updateSlab(index, { percentagePenalty: Number(e.target.value) })}
                    className="w-full h-9 px-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                  />
                </div>
              </div>
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
          ))}

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-700 leading-relaxed">Changes reflect instantly on all overdue invoices.</p>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 safe-area-bottom">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-rose-600 text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Configuration'}
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
              <div className="flex items-center justify-between mb-8">
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

              <div className="space-y-4">
                {config?.slabs.map((slab, index) => (
                  <div key={index} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-wrap lg:flex-nowrap gap-4 items-end">
                    <div className="flex-1 min-w-[120px]">
                      <FormField label="Start Day">
                        <Input
                          type="number"
                          value={slab.startDay}
                          onChange={(e) => updateSlab(index, { startDay: Number(e.target.value) })}
                        />
                      </FormField>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <FormField label="End Day (Optional)">
                        <Input
                          type="number"
                          value={slab.endDay || ''}
                          onChange={(e) => updateSlab(index, { endDay: e.target.value ? Number(e.target.value) : undefined })}
                          placeholder="Beyond"
                        />
                      </FormField>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <FormField label="Fixed Penalty (₹)">
                        <Input
                          type="number"
                          value={slab.fixedPenalty}
                          onChange={(e) => updateSlab(index, { fixedPenalty: Number(e.target.value) })}
                        />
                      </FormField>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <FormField label="% of Dues">
                        <Input
                          type="number"
                          value={slab.percentagePenalty}
                          onChange={(e) => updateSlab(index, { percentagePenalty: Number(e.target.value) })}
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
                    <button
                      onClick={() => removeSlab(index)}
                      className="p-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors mb-1"
                      title="Remove Slab"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
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

                <FormField label="Grace Period (Days)" hint="No fine will be applied during these initial days after due date.">
                  <Input
                    type="number"
                    value={config?.gracePeriodDays || 0}
                    onChange={(e) => setConfig(prev => prev ? { ...prev, gracePeriodDays: Number(e.target.value) } : null)}
                  />
                </FormField>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-700 leading-relaxed italic">
                    Note: Any changes here will be reflected instantly for all overdue invoices across Teacher, Parent, and Account portals.
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
                    {config?.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : 'N/A'}
                  </Badge>
                </div>
                <div className="pt-4 mt-4 border-t border-slate-100">
                  <Button
                    className="w-full"
                    variant="primary"
                    onClick={handleSave}
                    loading={saving}
                    icon={Save}
                  >
                    Save Configuration
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
