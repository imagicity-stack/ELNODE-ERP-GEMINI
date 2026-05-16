import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  Plus,
  UserPlus,
  Mail,
  Phone,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { cn, fmtDate } from '../../lib/utils';
import { Class } from '../../types';
import {
  PageHeader, Card, StatCard, Badge, Button, Modal,
  SearchInput, FormField, Input, Select, Textarea,
  Table, Thead, Th, Tbody, Tr, Td, EmptyState
} from '../../components/ui';
import { usePermissions } from '../../hooks/usePermissions';

interface AdmissionLead {
  id: string;
  studentName: string;
  parentName: string;
  email: string;
  phone: string;
  classInterested: string;
  status: 'enquiry' | 'follow-up' | 'registered' | 'admitted' | 'rejected';
  date: string;
  notes: string;
}

export default function AdmissionManagement({ user }: { user: any }) {
  const [leads, setLeads] = useState<AdmissionLead[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [mobileStatus, setMobileStatus] = useState<string>('all');

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('admissions');

  const [formData, setFormData] = useState({
    studentName: '',
    parentName: '',
    email: '',
    phone: '',
    classInterested: '',
    notes: '',
  });

  const fetchData = async () => {
    try {
      const [leadsSnap, classesSnap] = await Promise.all([
        getDocs(collection(db, 'admission_leads')),
        getDocs(collection(db, 'classes'))
      ]);

      setLeads(leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdmissionLead)));
      setClasses(classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'admission_leads');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'admission_leads'), {
        ...formData,
        status: 'enquiry',
        date: new Date().toISOString().split('T')[0],
      });

      setIsModalOpen(false);
      fetchData();
      setFormData({
        studentName: '',
        parentName: '',
        email: '',
        phone: '',
        classInterested: '',
        notes: '',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'admission_leads');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (leadId: string, newStatus: AdmissionLead['status']) => {
    try {
      await updateDoc(doc(db, 'admission_leads', leadId), { status: newStatus });
      fetchData();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admission_leads/${leadId}`);
    }
  };

  const getClassName = (id: string) => {
    const cls = classes.find(c => c.id === id);
    return cls ? `Class ${cls.name}` : id;
  };

  const filteredLeads = leads.filter(l =>
    l.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.parentName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const mobileLeads = filteredLeads.filter(l => mobileStatus === 'all' || l.status === mobileStatus);

  const statusVariant = (status: string): 'info' | 'warning' | 'indigo' | 'success' | 'error' => {
    switch (status) {
      case 'enquiry': return 'info';
      case 'follow-up': return 'warning';
      case 'registered': return 'indigo';
      case 'admitted': return 'success';
      case 'rejected': return 'error';
      default: return 'info';
    }
  };

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Admissions</h1>
          <p className="text-xs text-indigo-100 mt-0.5">{leads.length} total enquiries</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{leads.filter(l => l.status === 'enquiry').length}</p>
              <p className="text-[9px] text-white/70 uppercase">Enquiry</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{leads.filter(l => l.status === 'follow-up').length}</p>
              <p className="text-[9px] text-white/70 uppercase">Follow</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{leads.filter(l => l.status === 'registered').length}</p>
              <p className="text-[9px] text-white/70 uppercase">Reg.</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-2 py-2 text-center">
              <p className="text-base font-bold">{leads.filter(l => l.status === 'admitted').length}</p>
              <p className="text-[9px] text-white/70 uppercase">Adm.</p>
            </div>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search leads..."
            className="mt-3 w-full px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-sm text-white placeholder:text-white/60 focus:outline-none focus:bg-white/20"
          />
        </div>

        <div className="px-4 pt-3 overflow-x-auto flex gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {['all', 'enquiry', 'follow-up', 'registered', 'admitted', 'rejected'].map(s => (
            <button
              key={s}
              onClick={() => setMobileStatus(s)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition-transform capitalize",
                mobileStatus === s ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
              )}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        <div className="px-4 pt-4 space-y-2.5">
          {mobileLeads.length === 0 ? (
            <div className="py-12 text-center">
              <UserPlus className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No leads</p>
            </div>
          ) : (
            mobileLeads.map((lead) => (
              <div key={lead.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{lead.studentName}</p>
                    <p className="text-[11px] text-slate-500">Parent: {lead.parentName}</p>
                    <p className="text-[11px] text-indigo-700 font-bold mt-0.5">{getClassName(lead.classInterested)}</p>
                  </div>
                  <Badge variant={statusVariant(lead.status)} className="text-[9px] shrink-0 capitalize">{lead.status}</Badge>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>
                </div>
                {!readOnly && lead.status !== 'admitted' && lead.status !== 'rejected' && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateStatus(lead.id, 'admitted')}
                      className="py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />Admit
                    </button>
                    <button
                      onClick={() => updateStatus(lead.id, 'rejected')}
                      className="py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {!readOnly && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Admission Management"
        subtitle="Track enquiries, leads and manage the onboarding process."
        icon={UserPlus}
        iconColor="gradient-blue"
        actions={
          !readOnly && (
            <Button icon={Plus} onClick={() => setIsModalOpen(true)}>
              New Enquiry
            </Button>
          )
        }
      />

      {/* Pipeline Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="New Enquiries"
          value={leads.filter(l => l.status === 'enquiry').length}
          icon={AlertCircle}
          gradient="gradient-blue"
          index={0}
        />
        <StatCard
          label="Follow-ups"
          value={leads.filter(l => l.status === 'follow-up').length}
          icon={Clock}
          gradient="gradient-amber"
          index={1}
        />
        <StatCard
          label="Registered"
          value={leads.filter(l => l.status === 'registered').length}
          icon={UserPlus}
          gradient="gradient-indigo"
          index={2}
        />
        <StatCard
          label="Admitted"
          value={leads.filter(l => l.status === 'admitted').length}
          icon={CheckCircle2}
          gradient="gradient-emerald"
          index={3}
        />
      </div>

      {/* Leads Table */}
      <Card padding="none">
        <div className="p-4 border-b border-slate-100">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search leads..."
            className="max-w-sm"
          />
        </div>
        <Table>
          <Thead>
            <Tr>
              <Th>Student & Parent</Th>
              <Th>Contact</Th>
              <Th>Class</Th>
              <Th>Date</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filteredLeads.map((lead) => (
              <Tr key={lead.id}>
                <Td>
                  <div>
                    <p className="font-semibold text-slate-900">{lead.studentName}</p>
                    <p className="text-xs text-slate-500">Parent: {lead.parentName}</p>
                  </div>
                </Td>
                <Td>
                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-xs text-slate-600"><Mail className="w-3 h-3" /> {lead.email}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-600"><Phone className="w-3 h-3" /> {lead.phone}</p>
                  </div>
                </Td>
                <Td>{getClassName(lead.classInterested)}</Td>
                <Td>{fmtDate(lead.date)}</Td>
                <Td>
                  {readOnly ? (
                    <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
                  ) : (
                    <>
                      <select
                        value={lead.status}
                        onChange={(e) => updateStatus(lead.id, e.target.value as any)}
                        className="text-xs font-semibold bg-transparent border-none focus:ring-0 cursor-pointer outline-none"
                      >
                        <option value="enquiry">Enquiry</option>
                        <option value="follow-up">Follow-up</option>
                        <option value="registered">Registered</option>
                        <option value="admitted">Admitted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <Badge variant={statusVariant(lead.status)} className="ml-1">{lead.status}</Badge>
                    </>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {filteredLeads.length === 0 && (
          <EmptyState
            icon={UserPlus}
            title="No leads found"
            description={searchTerm ? 'Try a different search term.' : 'Add your first admission enquiry.'}
            action={
              !searchTerm && (
                <Button icon={Plus} size="sm" onClick={() => setIsModalOpen(true)}>
                  New Enquiry
                </Button>
              )
            }
          />
        )}
      </Card>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="New Admission Enquiry"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button form="admission-form" type="submit" loading={loading} icon={UserPlus}>
              Submit Enquiry
            </Button>
          </div>
        }
      >
        <form id="admission-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Student Name" required>
              <Input
                type="text"
                required
                value={formData.studentName}
                onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
              />
            </FormField>
            <FormField label="Parent Name" required>
              <Input
                type="text"
                required
                value={formData.parentName}
                onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Email" required>
              <Input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </FormField>
            <FormField label="Phone" required>
              <Input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="Class Interested In" required>
            <Select
              required
              value={formData.classInterested}
              onChange={(e) => setFormData({ ...formData, classInterested: e.target.value })}
            >
              <option value="">Select Class</option>
              {classes.map(cls => (
                <option key={cls.id} value={cls.id}>Class {cls.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Notes">
            <Textarea
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </FormField>
        </form>
      </Modal>
    </>
  );
}
