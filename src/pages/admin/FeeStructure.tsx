import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  Plus,
  IndianRupee,
  Trash2,
  Save,
  Receipt,
  Settings,
} from 'lucide-react';
import { Class, FeeStructure as IFeeStructure, FeeHead, UserProfile } from '../../types';
import { logActivity } from '../../services/activityService';
import { useToast } from '../../components/Toast';
import { Modal, FormField, Input, Button, IconButton } from '../../components/ui';
import { sortByClassName } from '../../lib/utils';

export default function FeeStructure({ user }: { user: UserProfile }) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [feeStructure, setFeeStructure] = useState<IFeeStructure | null>(null);
  const [globalHeads, setGlobalHeads] = useState<FeeHead[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isHeadModalOpen, setIsHeadModalOpen] = useState(false);
  const { showToast } = useToast();

  const [newHead, setNewHead] = useState<Omit<FeeHead, 'id'>>({ name: '', amount: 0, description: '', billingMonth: '' });

  // "2025-06" <-> "June 2025" conversion helpers for <input type="month">
  const toMonthInput = (display: string) => {
    if (!display) return '';
    const d = new Date(`1 ${display}`);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const fromMonthInput = (yyyymm: string) => {
    if (!yyyymm) return '';
    const [y, m] = yyyymm.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [classesSnap, headsSnap] = await Promise.all([
        getDocs(collection(db, 'classes')),
        getDocs(collection(db, 'feeHeads')),
      ]);
      const classesList = sortByClassName(classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class)));
      setClasses(classesList);
      setGlobalHeads(headsSnap.docs.map(doc => ({ ...doc.data() } as FeeHead)));
      if (classesList.length > 0 && !selectedClassId) {
        setSelectedClassId(classesList[0].id);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'classes');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGlobalHead = async () => {
    if (!newHead.name) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'feeHeads', newHead.name.replace(/\s+/g, '_').toLowerCase()), newHead);
      showToast('Global fee head saved!', 'success');
      logActivity(user, 'Global Fee Head Saved', 'Accounts', `Fee head "${newHead.name}" set to ₹${newHead.amount}`, { name: newHead.name, amount: newHead.amount });
      fetchData();
      setNewHead({ name: '', amount: 0, description: '', billingMonth: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'feeHeads');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGlobalHead = async (name: string) => {
    try {
      await deleteDoc(doc(db, 'feeHeads', name.replace(/\s+/g, '_').toLowerCase()));
      showToast('Fee head deleted', 'success');
      logActivity(user, 'Global Fee Head Deleted', 'Accounts', `Deleted fee head "${name}"`, { name });
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'feeHeads');
    }
  };

  const fetchFeeStructure = async (classId: string) => {
    if (!classId) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'feeStructures'), where('classId', '==', classId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setFeeStructure({ id: snap.docs[0].id, ...snap.docs[0].data() } as IFeeStructure);
      } else {
        setFeeStructure({ id: '', classId, heads: [], updatedAt: new Date().toISOString() });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `feeStructures/${classId}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (selectedClassId) fetchFeeStructure(selectedClassId); }, [selectedClassId]);

  const handleAddHead = () => {
    if (!newHead.name || newHead.amount <= 0) return;
    if (!feeStructure) return;
    setFeeStructure({ ...feeStructure, heads: [...feeStructure.heads, { ...newHead }] });
    setNewHead({ name: '', amount: 0, description: '', billingMonth: '' });
  };

  const handleRemoveHead = (index: number) => {
    if (!feeStructure) return;
    setFeeStructure({ ...feeStructure, heads: feeStructure.heads.filter((_, i) => i !== index) });
  };

  const handleSaveStructure = async () => {
    if (!feeStructure || !selectedClassId) return;
    setSaving(true);
    try {
      const structureData = { ...feeStructure, classId: selectedClassId, updatedAt: new Date().toISOString() };
      const className = classes.find(c => c.id === selectedClassId)?.name || selectedClassId;
      if (feeStructure.id) {
        await setDoc(doc(db, 'feeStructures', feeStructure.id), structureData);
      } else {
        const docRef = await addDoc(collection(db, 'feeStructures'), structureData);
        setFeeStructure({ ...structureData, id: docRef.id });
      }
      showToast('Fee structure saved successfully!', 'success');
      logActivity(user, 'Fee Structure Saved', 'Accounts', `Fee structure for Class ${className} saved — ${feeStructure.heads.length} heads, total ₹${totalAmount}`, { classId: selectedClassId, className, headsCount: feeStructure.heads.length, totalAmount });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'feeStructures');
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = feeStructure?.heads.reduce((acc, curr) => acc + curr.amount, 0) || 0;
  const selectedClass = classes.find(c => c.id === selectedClassId);

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="eyebrow">fee configuration</div>
          <h1>Fee Structure</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="icon-btn"
            onClick={() => setIsHeadModalOpen(true)}
            title="Manage global fee heads"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      <div className="pad stack" style={{ paddingBottom: 32, maxWidth: 680, marginLeft: 'auto', marginRight: 'auto' }}>
        {/* Class selector chips */}
        <div className="hscroll" style={{ padding: 0 }}>
          {classes.map(cls => (
            <button
              key={cls.id}
              onClick={() => setSelectedClassId(cls.id)}
              className={selectedClassId === cls.id ? 'chip solid' : 'chip'}
            >
              {cls.name}
            </button>
          ))}
        </div>

        {/* Selected class summary */}
        {selectedClass && (
          <div className="card flex" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 2 }}>Selected class</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedClass.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="eyebrow" style={{ marginBottom: 2 }}>Total fee</div>
              <div className="t-num" style={{ fontSize: 22 }}>₹{totalAmount.toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* Global fee heads */}
        <div className="card flush">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Receipt size={16} style={{ color: 'var(--ink-3)' }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Global Fee Heads</span>
            </div>
            <span className="eyebrow">{globalHeads.length} heads</span>
          </div>
          {globalHeads.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <p className="muted tiny">No global fee heads. Use the settings icon to add some.</p>
            </div>
          ) : (
            globalHeads.map((head, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--cream-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IndianRupee size={14} style={{ color: 'var(--ink-2)' }} />
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 13 }}>{head.name}</p>
                    {head.billingMonth
                      ? <p className="muted tiny">{head.billingMonth}</p>
                      : head.description
                        ? <p className="muted tiny">{head.description}</p>
                        : null
                    }
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="t-num" style={{ fontSize: 15 }}>₹{(head.amount || 0).toLocaleString()}</span>
                  <button
                    onClick={() => handleDeleteGlobalHead(head.name)}
                    className="icon-btn"
                    style={{ color: 'var(--coral)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Class-specific overrides */}
        {selectedClass && (
          <div className="card flush">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Receipt size={16} style={{ color: 'var(--ink-3)' }} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Class {selectedClass.name} — Fee Heads</span>
              </div>
              <span className="eyebrow">{feeStructure?.heads.length || 0} heads</span>
            </div>

            {/* Add fee head inline form */}
            <div style={{ padding: 14, borderBottom: '1px solid var(--line-2)', background: 'var(--cream-2)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 140px' }}>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Head name</div>
                  <input
                    type="text"
                    placeholder="e.g. Tuition Fee"
                    value={newHead.name}
                    onChange={e => setNewHead({ ...newHead, name: e.target.value })}
                    style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: 'var(--body)', color: 'var(--ink)', background: 'var(--paper)', outline: 'none' }}
                  />
                </div>
                <div style={{ flex: '1 1 100px' }}>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Amount ₹</div>
                  <div style={{ position: 'relative' }}>
                    <IndianRupee size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
                    <input
                      type="number"
                      placeholder="0"
                      value={newHead.amount || ''}
                      onChange={e => setNewHead({ ...newHead, amount: Number(e.target.value) })}
                      style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px 9px 28px', fontSize: 13, fontFamily: 'var(--body)', color: 'var(--ink)', background: 'var(--paper)', outline: 'none' }}
                    />
                  </div>
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Billing month</div>
                  <input
                    type="month"
                    value={toMonthInput(newHead.billingMonth || '')}
                    onChange={e => setNewHead({ ...newHead, billingMonth: fromMonthInput(e.target.value) })}
                    style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: 'var(--body)', color: 'var(--ink)', background: 'var(--paper)', outline: 'none' }}
                  />
                </div>
                <button
                  onClick={handleAddHead}
                  className="btn accent"
                  style={{ width: 'auto', padding: '10px 14px', fontSize: 13, flexShrink: 0 }}
                >
                  <Plus size={14} /> Add Fee Head
                </button>
              </div>
            </div>

            {/* Heads list */}
            {feeStructure?.heads.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <p className="muted tiny">No fee heads yet. Add one above.</p>
              </div>
            ) : (
              feeStructure?.heads.map((head, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--cream-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <IndianRupee size={14} style={{ color: 'var(--ink-2)' }} />
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 13 }}>{head.name}</p>
                      {head.billingMonth
                        ? <p className="muted tiny">{head.billingMonth}</p>
                        : head.description
                          ? <p className="muted tiny">{head.description}</p>
                          : null
                      }
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="t-num" style={{ fontSize: 15 }}>₹{(head.amount || 0).toLocaleString()}</span>
                    <button onClick={() => handleRemoveHead(index)} className="icon-btn" style={{ color: 'var(--coral)' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}

            {/* Total + Save */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--cream-2)' }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 2 }}>Total class fee</div>
                <div className="t-num" style={{ fontSize: 20 }}>₹{totalAmount.toLocaleString()}</div>
              </div>
              <button
                className="btn accent"
                style={{ width: 'auto', padding: '10px 18px', fontSize: 13 }}
                onClick={handleSaveStructure}
                disabled={saving || !feeStructure}
              >
                <Save size={14} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Global Fee Heads Modal */}
      <Modal
        isOpen={isHeadModalOpen}
        onClose={() => setIsHeadModalOpen(false)}
        title="Manage Global Fee Heads"
        subtitle="Define generic fee heads that can be used across classes."
        size="lg"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="sm:col-span-4">
              <FormField label="Head Name">
                <Input type="text" placeholder="e.g. Activity Fee" value={newHead.name}
                  onChange={e => setNewHead({ ...newHead, name: e.target.value })} />
              </FormField>
            </div>
            <div className="sm:col-span-3">
              <FormField label="Default Amount (₹)">
                <Input type="number" placeholder="0" value={newHead.amount || ''}
                  onChange={e => setNewHead({ ...newHead, amount: Number(e.target.value) })} />
              </FormField>
            </div>
            <div className="sm:col-span-3">
              <FormField label="Billing Month">
                <Input type="month" value={toMonthInput(newHead.billingMonth || '')}
                  onChange={e => setNewHead({ ...newHead, billingMonth: fromMonthInput(e.target.value) })} />
              </FormField>
            </div>
            <div className="sm:col-span-2 flex items-end">
              <Button icon={Plus} onClick={handleSaveGlobalHead} className="w-full" loading={saving}>
                Add
              </Button>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Name', 'Amount', 'Billing Month', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {globalHeads.map((head, index) => (
                <tr key={index} style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{head.name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--ink-2)' }}>₹{(head.amount || 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--ink-3)', fontSize: 12 }}>{head.billingMonth || <span style={{ opacity: 0.4 }}>—</span>}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => handleDeleteGlobalHead(head.name)} />
                  </td>
                </tr>
              ))}
              {globalHeads.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                    No global fee heads defined.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
  );
}
