import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { 
  Plus, 
  Search, 
  Filter, 
  UserPlus, 
  Mail, 
  Phone, 
  Calendar, 
  X, 
  MoreVertical,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Class } from '../../types';

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

export default function AdmissionManagement() {
  const [leads, setLeads] = useState<AdmissionLead[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admission Management</h1>
          <p className="text-gray-500 text-sm">Track enquiries, leads and manage the onboarding process.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          New Enquiry
        </button>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'New Enquiries', count: leads.filter(l => l.status === 'enquiry').length, color: 'blue', icon: AlertCircle },
          { label: 'Follow-ups', count: leads.filter(l => l.status === 'follow-up').length, color: 'amber', icon: Clock },
          { label: 'Registered', count: leads.filter(l => l.status === 'registered').length, color: 'indigo', icon: UserPlus },
          { label: 'Admitted', count: leads.filter(l => l.status === 'admitted').length, color: 'emerald', icon: CheckCircle2 },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              stat.color === 'blue' && "bg-blue-50 text-blue-600",
              stat.color === 'amber' && "bg-amber-50 text-amber-600",
              stat.color === 'indigo' && "bg-indigo-50 text-indigo-600",
              stat.color === 'emerald' && "bg-emerald-50 text-emerald-600",
            )}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search leads..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                <th className="px-6 py-4">Student & Parent</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Class</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="group hover:bg-gray-50 transition-all">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{lead.studentName}</p>
                      <p className="text-xs text-gray-500">Parent: {lead.parentName}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs space-y-1">
                      <p className="flex items-center gap-1 text-gray-600"><Mail className="w-3 h-3" /> {lead.email}</p>
                      <p className="flex items-center gap-1 text-gray-600"><Phone className="w-3 h-3" /> {lead.phone}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{getClassName(lead.classInterested)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{lead.date}</td>
                  <td className="px-6 py-4">
                    <select 
                      value={lead.status}
                      onChange={(e) => updateStatus(lead.id, e.target.value as any)}
                      className={cn(
                        "text-[10px] font-bold uppercase px-2 py-1 rounded-full border-none focus:ring-0 cursor-pointer",
                        lead.status === 'enquiry' && "bg-blue-50 text-blue-600",
                        lead.status === 'follow-up' && "bg-amber-50 text-amber-600",
                        lead.status === 'registered' && "bg-indigo-50 text-indigo-600",
                        lead.status === 'admitted' && "bg-emerald-50 text-emerald-600",
                        lead.status === 'rejected' && "bg-red-50 text-red-600",
                      )}
                    >
                      <option value="enquiry">Enquiry</option>
                      <option value="follow-up">Follow-up</option>
                      <option value="registered">Registered</option>
                      <option value="admitted">Admitted</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative z-10"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">New Admission Enquiry</h2>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Student Name</label>
                    <input 
                      type="text" required
                      value={formData.studentName}
                      onChange={(e) => setFormData({...formData, studentName: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Parent Name</label>
                    <input 
                      type="text" required
                      value={formData.parentName}
                      onChange={(e) => setFormData({...formData, parentName: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input 
                      type="email" required
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input 
                      type="tel" required
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class Interested In</label>
                  <select 
                    required
                    value={formData.classInterested}
                    onChange={(e) => setFormData({...formData, classInterested: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                  >
                    <option value="">Select Class</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>Class {cls.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea 
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-4 pt-6 border-t">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="px-8 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Submitting...' : 'Submit Enquiry'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
