import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { PayrollConfig, UserProfile } from '../../types';
import { useToast } from '../../components/Toast';
import { logActivity } from '../../services/activityService';
import { 
  Settings, 
  Save, 
  RefreshCcw, 
  HelpCircle,
  Percent,
  Calculator,
  ShieldCheck,
  CreditCard,
  DollarSign
} from 'lucide-react';
import { 
  Card, 
  PageHeader, 
  Button, 
  Input, 
  FormField, 
  Badge 
} from '../../components/ui';

export default function PayrollSettings({ user }: { user: UserProfile }) {
  const [config, setConfig] = useState<PayrollConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, 'payroll-config', 'global');
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        setConfig(docSnap.data() as PayrollConfig);
      } else {
        // Default config
        const defaultConfig: PayrollConfig = {
          id: 'global',
          workingDaysInYear: 240,
          pfRate: 12,
          professionalTax: 200,
          updatedBy: user.uid,
          updatedAt: new Date().toISOString()
        };
        setConfig(defaultConfig);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'payroll-config/global');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updatedConfig = {
        ...config,
        updatedBy: user.uid,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'payroll-config', 'global'), updatedConfig);
      logActivity(user, 'Updated Payroll Settings', 'Super Admin', 'Changed global salary calculation variables.');
      showToast('Payroll settings updated successfully', 'success');
      setConfig(updatedConfig);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'payroll-config/global');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading configuration...</div>;

  return (
    <div className="space-y-8 pb-20">
      <PageHeader 
        title="Payroll Configuration" 
        subtitle="Define global variables for automatic salary and deduction calculations"
        icon={Settings}
        iconColor="bg-slate-900"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="space-y-6">
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Leave Deduction Logic</h3>
              <p className="text-xs text-slate-500">Calculate deduction per day</p>
            </div>
          </div>

          <div className="space-y-4">
            <FormField 
              label="Standard Daily Leave Deduction (₹)" 
              hint="Leave this empty or 0 to use the annual formula: (Monthly Salary × 12) / Total Working Days."
            >
              <div className="relative">
                <Input 
                  type="number"
                  value={config?.leaveDeductionPerDay ?? 0}
                  onChange={(e) => setConfig(prev => prev ? { ...prev, leaveDeductionPerDay: Number(e.target.value) } : null)}
                  className="pl-10"
                  placeholder="Fixed amount, e.g. 500"
                />
                <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              </div>
            </FormField>

            <FormField 
              label="Total Working Days in Year" 
              hint="Used to calculate per-day deduction rate (e.g., 240 days)."
            >
              <div className="relative">
                <Input 
                  type="number"
                  value={config?.workingDaysInYear ?? 240}
                  onChange={(e) => setConfig(prev => prev ? { ...prev, workingDaysInYear: Number(e.target.value) } : null)}
                  className="pl-10"
                />
                <RefreshCcw className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              </div>
            </FormField>
            
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 italic text-[10px] text-slate-500 flex gap-2">
              <HelpCircle className="w-4 h-4 shrink-0 text-slate-400" />
              Formula: (Salary × 12) / {config?.workingDaysInYear || 240} = Per day deduction.
            </div>
          </div>
        </Card>

        <Card className="space-y-6">
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <Percent className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Statutory Deductions</h3>
              <p className="text-xs text-slate-500">Manage standard PF and Tax percentages</p>
            </div>
          </div>

          <div className="space-y-4">
            <FormField label="Standard PF Contribution (%)">
              <div className="relative">
                <Input 
                  type="number"
                  value={config?.pfRate ?? 12}
                  onChange={(e) => setConfig(prev => prev ? { ...prev, pfRate: Number(e.target.value) } : null)}
                  className="pl-10"
                />
                <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              </div>
            </FormField>

            <FormField label="Standard Professional Tax (Flat ₹)">
              <div className="relative">
                <Input 
                  type="number"
                  value={config?.professionalTax ?? 200}
                  onChange={(e) => setConfig(prev => prev ? { ...prev, professionalTax: Number(e.target.value) } : null)}
                  className="pl-10"
                />
                <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              </div>
            </FormField>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between border-t pt-8">
        <div className="flex items-center gap-2">
          <Badge variant="default">Last Updated: {config?.updatedAt ? new Date(config.updatedAt).toLocaleString() : 'Never'}</Badge>
        </div>
        <Button 
          variant="primary" 
          icon={Save} 
          loading={saving}
          onClick={handleSave}
          size="lg"
        >
          Save Payroll Configuration
        </Button>
      </div>
    </div>
  );
}
