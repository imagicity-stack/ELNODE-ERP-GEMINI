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
} from 'lucide-react';
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
    <div className="space-y-8">
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
                <Td>{lead.date}</Td>
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
    </div>
  );
}
