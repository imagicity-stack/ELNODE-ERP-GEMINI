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
  ExternalLink
} from 'lucide-react';
import { collection, getDocs, query, orderBy, where, Timestamp } from 'firebase/firestore';
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

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'feePayments'), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'feePayments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
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

  return (
    <div className="space-y-8">
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
  );
}
