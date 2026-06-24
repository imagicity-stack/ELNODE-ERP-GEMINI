/**
 * Shared, read-only financial data layer for the CA portal.
 *
 * One set of Firestore listeners is mounted at the portal root (CAPortal) and
 * shared with every CA page via context, so navigating between Dashboard /
 * Ledger / Reports doesn't re-fetch the same collections repeatedly.
 *
 * The CA portal is strictly view-only — nothing here ever writes.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import {
  Expense, FeePayment, FeeRequest, Salary, AdvancePayment, Student,
} from '../../types';

interface FinancialData {
  payments: FeePayment[];
  requests: FeeRequest[];
  expenses: Expense[];
  salaries: Salary[];
  advances: AdvancePayment[];
  students: Student[];
  studentsMap: Record<string, Student>;
  loading: boolean;
}

const FinancialDataContext = createContext<FinancialData | undefined>(undefined);

export function FinancialDataProvider({ children }: { children: React.ReactNode }) {
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [requests, setRequests] = useState<FeeRequest[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [advances, setAdvances] = useState<AdvancePayment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [ready, setReady] = useState({ students: false });

  useEffect(() => {
    const onErr = (name: string) => (err: any) =>
      handleFirestoreError(err, OperationType.LIST, name);

    const unsubs = [
      onSnapshot(collection(db, 'feePayments'),
        s => setPayments(s.docs.map(d => ({ id: d.id, ...d.data() } as FeePayment))),
        onErr('feePayments')),
      onSnapshot(collection(db, 'feeRequests'),
        s => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() } as FeeRequest))),
        onErr('feeRequests')),
      onSnapshot(collection(db, 'expenses'),
        s => setExpenses(s.docs.map(d => ({ id: d.id, ...d.data() } as Expense))),
        onErr('expenses')),
      onSnapshot(collection(db, 'salaries'),
        s => setSalaries(s.docs.map(d => ({ id: d.id, ...d.data() } as Salary))),
        onErr('salaries')),
      onSnapshot(collection(db, 'advancePayments'),
        s => setAdvances(s.docs.map(d => ({ id: d.id, ...d.data() } as AdvancePayment))),
        onErr('advancePayments')),
      onSnapshot(collection(db, 'students'),
        s => { setStudents(s.docs.map(d => ({ id: d.id, ...d.data() } as Student))); setReady(r => ({ ...r, students: true })); },
        onErr('students')),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const studentsMap = useMemo(() => {
    const m: Record<string, Student> = {};
    students.forEach(s => { m[s.id] = s; });
    return m;
  }, [students]);

  const value: FinancialData = {
    payments, requests, expenses, salaries, advances, students, studentsMap,
    loading: !ready.students,
  };

  return <FinancialDataContext.Provider value={value}>{children}</FinancialDataContext.Provider>;
}

export function useFinancials(): FinancialData {
  const ctx = useContext(FinancialDataContext);
  if (!ctx) throw new Error('useFinancials must be used within a FinancialDataProvider');
  return ctx;
}

// ─── Period helpers ───────────────────────────────────────────────────────────
// Indian financial year runs 1 Apr → 31 Mar.

export type PeriodKey =
  | 'this_month' | 'last_month' | 'this_quarter' | 'this_fy' | 'last_fy' | 'all';

export interface DateRange { from: string; to: string; label: string }

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Start year of the financial year that `d` falls in (Apr–Mar). */
function fyStartYear(d: Date): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

export function getDateRange(period: PeriodKey, now = new Date()): DateRange {
  switch (period) {
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: fmt(from), to: fmt(to), label: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
    }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: fmt(from), to: fmt(to), label: from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const from = new Date(now.getFullYear(), q * 3, 1);
      const to = new Date(now.getFullYear(), q * 3 + 3, 0);
      return { from: fmt(from), to: fmt(to), label: `Q${q + 1} ${now.getFullYear()}` };
    }
    case 'this_fy': {
      const y = fyStartYear(now);
      return { from: `${y}-04-01`, to: `${y + 1}-03-31`, label: `FY ${y}-${String(y + 1).slice(2)}` };
    }
    case 'last_fy': {
      const y = fyStartYear(now) - 1;
      return { from: `${y}-04-01`, to: `${y + 1}-03-31`, label: `FY ${y}-${String(y + 1).slice(2)}` };
    }
    case 'all':
    default:
      return { from: '0000-01-01', to: '9999-12-31', label: 'All Time' };
  }
}

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'this_fy', label: 'This FY' },
  { key: 'last_fy', label: 'Last FY' },
  { key: 'all', label: 'All Time' },
];

export const inRange = (date: string | undefined, r: DateRange) =>
  !!date && date >= r.from && date <= r.to;

/** Salaries are keyed by a 'YYYY-MM' month, not a full date. */
export const monthInRange = (month: string | undefined, r: DateRange) =>
  !!month && `${month}-01` >= r.from && `${month}-01` <= r.to;

export const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
