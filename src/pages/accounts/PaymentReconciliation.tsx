import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, FeePayment, FeeRequest, Student } from '../../types';
import { fmtDate } from '../../lib/utils';
import { AlertTriangle, CheckCircle2, RefreshCcw, FileWarning, Copy, Scale, GitBranch } from 'lucide-react';
import {
  PageHeader,
  Card,
  StatCard,
  Button,
  Badge,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  EmptyState,
  Spinner,
} from '../../components/ui';
import { useData } from '../../contexts/DataContext';
import { fmtMonthYear } from '../../lib/utils';

interface Props {
  user: UserProfile;
}

interface OrphanRow {
  payment: FeePayment;
  reason: 'missing-request' | 'wrong-student';
}

interface DupRow {
  transactionId: string;
  payments: FeePayment[];
}

interface DriftRow {
  request: FeeRequest;
  recordedPaid: number;
  paymentsSum: number;
  delta: number;
  studentName?: string;
}

interface StatusMismatchRow {
  request: FeeRequest;
  expectedStatus: FeeRequest['status'];
  studentName?: string;
}

export default function PaymentReconciliation({ user: _user }: Props) {
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [requests, setRequests] = useState<FeeRequest[]>([]);
  const [studentsLocal, setStudentsLocal] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const { students: studentsCtx } = useData();

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    const all = studentsLocal.length ? studentsLocal : studentsCtx;
    (all || []).forEach(s => map.set(s.id, s));
    return map;
  }, [studentsLocal, studentsCtx]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [paySnap, reqSnap, stuSnap] = await Promise.all([
        getDocs(collection(db, 'feePayments')),
        getDocs(collection(db, 'feeRequests')),
        getDocs(collection(db, 'students')),
      ]);
      setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() } as FeePayment)));
      setRequests(reqSnap.docs.map(d => ({ id: d.id, ...d.data() } as FeeRequest)));
      setStudentsLocal(stuSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'reconciliation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ─── Build maps ────────────────────────────────────────────────────────────
  const requestMap = useMemo(() => {
    const m = new Map<string, FeeRequest>();
    requests.forEach(r => m.set(r.id, r));
    return m;
  }, [requests]);

  const paymentsByRequest = useMemo(() => {
    const m = new Map<string, FeePayment[]>();
    payments.forEach(p => {
      const arr = m.get(p.feeRequestId) || [];
      arr.push(p);
      m.set(p.feeRequestId, arr);
    });
    return m;
  }, [payments]);

  // ─── 1. Orphaned payments ──────────────────────────────────────────────────
  const orphans: OrphanRow[] = useMemo(() => {
    const list: OrphanRow[] = [];
    for (const p of payments) {
      const req = requestMap.get(p.feeRequestId);
      if (!req) {
        list.push({ payment: p, reason: 'missing-request' });
      } else if (req.studentId !== p.studentId) {
        list.push({ payment: p, reason: 'wrong-student' });
      }
    }
    return list;
  }, [payments, requestMap]);

  // ─── 2. Duplicate transactionIds ───────────────────────────────────────────
  const duplicates: DupRow[] = useMemo(() => {
    const byTxn = new Map<string, FeePayment[]>();
    for (const p of payments) {
      if (!p.transactionId) continue;
      const arr = byTxn.get(p.transactionId) || [];
      arr.push(p);
      byTxn.set(p.transactionId, arr);
    }
    return Array.from(byTxn.entries())
      .filter(([, arr]) => arr.length > 1)
      .map(([transactionId, arr]) => ({ transactionId, payments: arr }));
  }, [payments]);

  // ─── 3. Sum drift: recorded paidAmount vs sum(payments) ────────────────────
  const drift: DriftRow[] = useMemo(() => {
    const rows: DriftRow[] = [];
    for (const r of requests) {
      const related = paymentsByRequest.get(r.id) || [];
      const sum = related.reduce((acc, p) => acc + (p.amount || 0), 0);
      const recorded = r.paidAmount || 0;
      const delta = Math.round((recorded - sum) * 100) / 100;
      if (Math.abs(delta) > 0.5) {
        rows.push({
          request: r,
          recordedPaid: recorded,
          paymentsSum: sum,
          delta,
          studentName: studentMap.get(r.studentId)?.name,
        });
      }
    }
    return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [requests, paymentsByRequest, studentMap]);

  // ─── 4. Status mismatches: stored status vs computed status ────────────────
  const statusMismatches: StatusMismatchRow[] = useMemo(() => {
    const rows: StatusMismatchRow[] = [];
    for (const r of requests) {
      const totalRequired = (r.totalAmount || 0) + (r.fineAmount || 0) - (r.waivedAmount || 0);
      const paid = r.paidAmount || 0;
      let expected: FeeRequest['status'];
      if (paid <= 0.001) expected = 'pending';
      else if (paid + 0.001 >= totalRequired) expected = 'paid';
      else expected = 'partially_paid';
      // "overdue" is a separate concept tied to dueDate — leave alone if recorded
      if (r.status === 'overdue') continue;
      if (r.status !== expected) {
        rows.push({
          request: r,
          expectedStatus: expected,
          studentName: studentMap.get(r.studentId)?.name,
        });
      }
    }
    return rows;
  }, [requests, studentMap]);

  const healthy =
    orphans.length === 0 &&
    duplicates.length === 0 &&
    drift.length === 0 &&
    statusMismatches.length === 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Payment Reconciliation"
        subtitle="Audit ledger integrity: orphaned payments, duplicates, sum drift, and status mismatches"
        icon={Scale}
        actions={
          <Button variant="secondary" onClick={fetchData} loading={loading}>
            <RefreshCcw className="w-4 h-4" /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Orphaned Payments"
          value={orphans.length}
          icon={FileWarning}
          gradient={orphans.length ? 'bg-gradient-to-br from-rose-500 to-red-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}
        />
        <StatCard
          label="Duplicate Txns"
          value={duplicates.length}
          icon={Copy}
          gradient={duplicates.length ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}
        />
        <StatCard
          label="Sum Drift Requests"
          value={drift.length}
          icon={Scale}
          gradient={drift.length ? 'bg-gradient-to-br from-rose-500 to-pink-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}
        />
        <StatCard
          label="Status Mismatches"
          value={statusMismatches.length}
          icon={GitBranch}
          gradient={statusMismatches.length ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}
        />
      </div>

      {loading && (
        <Card className="p-12 flex items-center justify-center">
          <Spinner />
        </Card>
      )}

      {!loading && healthy && (
        <Card className="p-8">
          <EmptyState
            icon={CheckCircle2}
            title="Ledger is clean"
            description="No orphaned payments, duplicate transactions, sum drift, or status mismatches found."
          />
        </Card>
      )}

      {/* ─── Orphaned payments ────────────────────────────────────────────── */}
      {!loading && orphans.length > 0 && (
        <Card className="mb-6">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-100"><FileWarning className="w-4 h-4 text-rose-600" /></div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Orphaned payments</h2>
                <p className="text-xs text-slate-500">Payments referencing a missing fee request or wrong student</p>
              </div>
            </div>
            <Badge variant="error">{orphans.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>Receipt</Th>
                  <Th>Date</Th>
                  <Th>Student</Th>
                  <Th>Amount</Th>
                  <Th>Method</Th>
                  <Th>Reason</Th>
                </Tr>
              </Thead>
              <Tbody>
                {orphans.map(({ payment, reason }) => (
                  <Tr key={payment.id}>
                    <Td className="font-mono text-xs">{payment.receiptNumber}</Td>
                    <Td>{fmtDate(payment.date)}</Td>
                    <Td>{studentMap.get(payment.studentId)?.name || payment.studentId}</Td>
                    <Td>₹{(payment.amount || 0).toLocaleString('en-IN')}</Td>
                    <Td className="capitalize">{(payment.method || '').replace(/_/g, ' ')}</Td>
                    <Td>
                      <Badge variant="error">
                        {reason === 'missing-request' ? 'Missing fee request' : 'Wrong student'}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Card>
      )}

      {/* ─── Duplicate transactions ───────────────────────────────────────── */}
      {!loading && duplicates.length > 0 && (
        <Card className="mb-6">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100"><Copy className="w-4 h-4 text-amber-600" /></div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Duplicate transaction IDs</h2>
                <p className="text-xs text-slate-500">Same gateway transactionId recorded against multiple payment docs</p>
              </div>
            </div>
            <Badge variant="warning">{duplicates.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>Transaction ID</Th>
                  <Th>Receipts</Th>
                  <Th>Total ₹</Th>
                  <Th>Count</Th>
                </Tr>
              </Thead>
              <Tbody>
                {duplicates.map(d => (
                  <Tr key={d.transactionId}>
                    <Td className="font-mono text-xs">{d.transactionId}</Td>
                    <Td className="font-mono text-xs">
                      {d.payments.map(p => p.receiptNumber).join(', ')}
                    </Td>
                    <Td>₹{d.payments.reduce((s, p) => s + (p.amount || 0), 0).toLocaleString('en-IN')}</Td>
                    <Td>
                      <Badge variant="warning">{d.payments.length}</Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Card>
      )}

      {/* ─── Sum drift ────────────────────────────────────────────────────── */}
      {!loading && drift.length > 0 && (
        <Card className="mb-6">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-100"><Scale className="w-4 h-4 text-rose-600" /></div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Paid-amount drift</h2>
                <p className="text-xs text-slate-500">Fee request paidAmount does not match the sum of its payments</p>
              </div>
            </div>
            <Badge variant="error">{drift.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>Student</Th>
                  <Th>Month</Th>
                  <Th>Recorded Paid</Th>
                  <Th>Payments Sum</Th>
                  <Th>Δ</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {drift.map(d => (
                  <Tr key={d.request.id}>
                    <Td>{d.studentName || d.request.studentId}</Td>
                    <Td>{fmtMonthYear(d.request.month)}</Td>
                    <Td>₹{d.recordedPaid.toLocaleString('en-IN')}</Td>
                    <Td>₹{d.paymentsSum.toLocaleString('en-IN')}</Td>
                    <Td className={d.delta > 0 ? 'text-rose-600 font-bold' : 'text-amber-600 font-bold'}>
                      {d.delta > 0 ? '+' : ''}
                      ₹{d.delta.toLocaleString('en-IN')}
                    </Td>
                    <Td className="capitalize text-xs">{d.request.status.replace(/_/g, ' ')}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Card>
      )}

      {/* ─── Status mismatches ────────────────────────────────────────────── */}
      {!loading && statusMismatches.length > 0 && (
        <Card className="mb-6">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100"><GitBranch className="w-4 h-4 text-amber-600" /></div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Status mismatches</h2>
                <p className="text-xs text-slate-500">Stored status doesn't match the computed status from paidAmount / total</p>
              </div>
            </div>
            <Badge variant="warning">{statusMismatches.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>Student</Th>
                  <Th>Month</Th>
                  <Th>Stored</Th>
                  <Th>Expected</Th>
                  <Th>Paid / Total</Th>
                </Tr>
              </Thead>
              <Tbody>
                {statusMismatches.map(m => {
                  const total = (m.request.totalAmount || 0) + (m.request.fineAmount || 0) - (m.request.waivedAmount || 0);
                  return (
                    <Tr key={m.request.id}>
                      <Td>{m.studentName || m.request.studentId}</Td>
                      <Td>{fmtMonthYear(m.request.month)}</Td>
                      <Td className="capitalize">
                        <Badge variant="warning">{m.request.status.replace(/_/g, ' ')}</Badge>
                      </Td>
                      <Td className="capitalize">
                        <Badge variant="success">{m.expectedStatus.replace(/_/g, ' ')}</Badge>
                      </Td>
                      <Td>
                        ₹{(m.request.paidAmount || 0).toLocaleString('en-IN')} / ₹{total.toLocaleString('en-IN')}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </div>
        </Card>
      )}

      {!loading && (orphans.length + duplicates.length + drift.length + statusMismatches.length > 0) && (
        <Card className="p-5 bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-1">How to resolve</p>
              <ul className="list-disc ml-5 space-y-1 text-amber-800">
                <li><b>Orphaned payments</b>: re-link to the correct fee request, or delete if accidental.</li>
                <li><b>Duplicate txns</b>: review receipts and remove the duplicate from the Payments page.</li>
                <li><b>Sum drift</b>: edit the fee request's paidAmount to match the sum of its payments (or rollback the stray payment).</li>
                <li><b>Status mismatches</b>: usually fix themselves on the next payment; otherwise re-save the fee request.</li>
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
