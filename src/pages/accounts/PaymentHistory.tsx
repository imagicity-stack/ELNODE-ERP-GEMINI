import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, FeePayment, Student, Class, PaymentMethod } from '../../types';
import { 
  Download, 
  Search, 
  Calendar as CalendarIcon, 
  Filter, 
  History,
  FileText,
  User,
  GraduationCap,
  CreditCard,
  RefreshCcw,
  ExternalLink,
  Receipt,
} from 'lucide-react';
import { collection, getDocs, query, orderBy, where, Timestamp, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../components/Toast';
import Papa from 'papaparse';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  IconButton,
  SearchInput,
  FormField,
  Input,
  Select,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
  Spinner,
} from '../../components/ui';

interface PaymentHistoryProps {
  user: UserProfile;
}

export default function PaymentHistory({ user }: PaymentHistoryProps) {
  const { classes, students: globalStudents } = useData();
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedMethod, setSelectedMethod] = useState('all');
  const [selectedHead, setSelectedHead] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const fetchPayments = () => {
    // No-op: payments are live via onSnapshot. Kept for the manual "refresh" button.
  };

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'feePayments'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'feePayments');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredPayments = useMemo(() => {
    return payments.filter(payment => {
      const student = globalStudents.find(s => s.id === payment.studentId);
      
      const matchesSearch = 
        student?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.transactionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.referenceNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesClass = selectedClass === 'all' || student?.classId === selectedClass;
      const matchesMethod = selectedMethod === 'all' || payment.method === selectedMethod;
      const matchesHead = selectedHead === 'all' || payment.feeHead === selectedHead;
      
      const paymentDate = new Date(payment.date);
      const matchesStartDate = !startDate || paymentDate >= new Date(startDate);
      const matchesEndDate = !endDate || paymentDate <= new Date(endDate + 'T23:59:59');

      return matchesSearch && matchesClass && matchesMethod && matchesHead && matchesStartDate && matchesEndDate;
    });
  }, [payments, searchTerm, selectedClass, selectedMethod, selectedHead, startDate, endDate, globalStudents]);

  const feeHeads = useMemo(() => {
    const heads = new Set<string>();
    payments.forEach(p => { if (p.feeHead) heads.add(p.feeHead); });
    return Array.from(heads);
  }, [payments]);

  const handleExport = () => {
    if (filteredPayments.length === 0) {
      showToast('No data to export', 'error');
      return;
    }

    const exportData = filteredPayments.map(p => {
      const student = globalStudents.find(s => s.id === p.studentId);
      return {
        'Receipt No': p.receiptNumber,
        'Date': p.date ? new Date(p.date).toLocaleString() : 'N/A',
        'Student Name': student?.name || 'Unknown',
        'School No': student?.schoolNumber || 'N/A',
        'Class': student ? (classes.find(c => c.id === student.classId)?.name || student.classId) : 'N/A',
        'Category': p.feeHead || 'N/A',
        'Amount': p.amount,
        'Method': p.method.toUpperCase(),
        'Ref/Trans ID': p.transactionId || p.referenceNumber || '-',
        'Remarks': p.remarks || '-'
      };
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `payment_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Export successful!', 'success');
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const todayPayments = payments.filter(p => p.date && p.date.startsWith(todayStr));
  const todayAmount = todayPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const monthAmount = payments.filter(p => p.date && p.date.startsWith(monthPrefix)).reduce((s, p) => s + (p.amount || 0), 0);

  const dateFilters = [
    { label: 'All', val: '' },
    { label: 'Today', val: todayStr },
    { label: '7d', val: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0] },
    { label: '30d', val: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0] },
  ];

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-4 pt-5 pb-6 text-white rounded-b-3xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Accountant Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Payment History</h1>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-base font-bold">{todayPayments.length}</p>
              <p className="text-[9px] text-white/80">Today's Count</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-base font-bold">₹{((todayAmount/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">Today</p>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <p className="text-base font-bold">₹{((monthAmount/1000)|0).toLocaleString()}k</p>
              <p className="text-[9px] text-white/80">This Month</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search receipt, student or txn ID..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        <div className="px-4 overflow-x-auto flex gap-2 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {dateFilters.map(f => (
            <button
              key={f.label}
              onClick={() => setStartDate(f.val)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap active:scale-95 transition-transform ${startDate === f.val ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => setSelectedMethod(selectedMethod === 'all' ? 'online' : 'all')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap active:scale-95 transition-transform ${selectedMethod !== 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            {selectedMethod === 'all' ? 'All Methods' : selectedMethod.replace('_', ' ').toUpperCase()}
          </button>
        </div>

        <div className="px-4 pt-2 space-y-2.5">
          {loading ? (
            <div className="py-10 flex justify-center"><Spinner /></div>
          ) : filteredPayments.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No payments found</p>
              <p className="text-xs text-slate-500 mt-1">Adjust filters to see more</p>
            </div>
          ) : (
            filteredPayments.slice(0, 50).map((p) => {
              const student = globalStudents.find(s => s.id === p.studentId);
              const className = student ? (classes.find(c => c.id === student.classId)?.name || student.classId) : 'N/A';
              return (
                <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900 truncate">{student?.name || 'Unknown'}</p>
                        <p className="text-sm font-black text-emerald-600 shrink-0">₹{(p.amount || 0).toLocaleString()}</p>
                      </div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {className} • {p.receiptNumber}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={p.method === 'online' ? 'success' : 'info'} className="capitalize text-[9px] py-0.5 px-1.5">
                            <span className="flex items-center gap-1">
                              {p.method === 'online' ? <ExternalLink className="w-2.5 h-2.5" /> : <CreditCard className="w-2.5 h-2.5" />}
                              {p.method.replace('_', ' ')}
                            </span>
                          </Badge>
                          <span className="text-[10px] text-slate-400">{new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        </div>
                        <button
                          onClick={() => showToast('Receipt downloading...', 'info')}
                          className="p-1.5 rounded-lg bg-slate-50 text-slate-600 active:scale-90 transition-transform"
                          aria-label="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button
          onClick={handleExport}
          disabled={filteredPayments.length === 0}
          className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40 disabled:opacity-50"
          aria-label="Export CSV"
        >
          <Download className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-8">
      <PageHeader
        title="Payment History"
        subtitle="Comprehensive record of all school fee transactions"
        icon={History}
        iconColor="gradient-amber"
        actions={
          <div className="flex gap-3">
            <Button 
              variant="secondary" 
              icon={RefreshCcw} 
              onClick={fetchPayments}
              loading={loading}
            >
              Refresh
            </Button>
            <Button 
              variant="primary" 
              icon={Download} 
              onClick={handleExport}
              disabled={filteredPayments.length === 0}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Advanced Filters Card */}
      <Card className="overflow-visible">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[300px]">
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Search Student, Receipt, Transaction ID..."
              />
            </div>
            
            <div className="w-44">
              <FormField label="Fee Head">
                <Select value={selectedHead} onChange={(e) => setSelectedHead(e.target.value)}>
                  <option value="all">All Heads</option>
                  {feeHeads.map(head => (
                    <option key={head} value={head}>{head}</option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="w-44">
              <FormField label="Method">
                <Select value={selectedMethod} onChange={(e) => setSelectedMethod(e.target.value)}>
                  <option value="all">All Methods</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="upi">UPI</option>
                  <option value="online">Razorpay (Online)</option>
                </Select>
              </FormField>
            </div>

            <Button 
              variant={isFilterOpen ? "primary" : "secondary"} 
              icon={Filter} 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              {isFilterOpen ? "Hide" : "More"}
            </Button>
          </div>

          {isFilterOpen && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2">
              <FormField label="Class">
                <Select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
                  <option value="all">All Classes</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </FormField>
              
              <FormField label="From Date">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </FormField>

              <FormField label="To Date">
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </FormField>
            </div>
          )}
        </div>
      </Card>

      {/* Results Table */}
      <Card padding="none">
        {loading ? (
          <div className="p-20 flex flex-col items-center justify-center gap-4">
            <Spinner size="lg" />
            <p className="text-slate-500 font-medium">Fetching payment records...</p>
          </div>
        ) : filteredPayments.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <tr>
                  <Th>Receipt No</Th>
                  <Th>Student Detail</Th>
                  <Th>Category</Th>
                  <Th>Payment Date</Th>
                  <Th>Amount</Th>
                  <Th>Method</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </Thead>
              <Tbody>
                {filteredPayments.map((p) => {
                  const student = globalStudents.find(s => s.id === p.studentId);
                  const className = student ? (classes.find(c => c.id === student.classId)?.name || student.classId) : 'N/A';
                  
                  return (
                    <Tr key={p.id}>
                      <Td className="font-bold text-slate-900">
                        <div className="flex flex-col">
                          <span>{p.receiptNumber}</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {new Date(p.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 overflow-hidden">
                            {student?.photoURL ? (
                              <img src={student.photoURL} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 leading-tight">{student?.name || 'Unknown Student'}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                              {className} • {student?.schoolNumber}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <Badge variant="default" className="bg-slate-100 text-slate-600 border-none font-bold">
                          {p.feeHead || 'General Fee'}
                        </Badge>
                      </Td>
                      <Td className="text-slate-600 font-medium">
                        {new Date(p.date).toLocaleDateString()}
                      </Td>
                      <Td>
                        <p className="font-black text-emerald-600">₹{(p.amount || 0).toLocaleString()}</p>
                      </Td>
                      <Td>
                        <div className="flex flex-col">
                          <Badge 
                            variant={p.method === 'online' ? 'success' : 'info'}
                            className="capitalize py-1 px-2"
                          >
                            <div className="flex items-center gap-1.5">
                              {p.method === 'online' ? <ExternalLink className="w-3 h-3" /> : <CreditCard className="w-3 h-3" />}
                              {p.method.replace('_', ' ')}
                            </div>
                          </Badge>
                          {p.transactionId && (
                            <span className="text-[9px] font-mono text-slate-400 mt-1 truncate max-w-[80px]">
                              {p.transactionId}
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td className="text-right">
                        <IconButton 
                          icon={Download} 
                          size="sm" 
                          variant="ghost" 
                          title="Download Receipt"
                          onClick={() => {
                            // Link to receipt generator
                            showToast("Receipt downloading...", "info");
                          }}
                        />
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </div>
        ) : (
          <EmptyState 
            icon={FileText}
            title="No payments found"
            description="Try adjusting your filters or search terms."
          />
        )}
      </Card>
      </div>
    </>
  );
}
