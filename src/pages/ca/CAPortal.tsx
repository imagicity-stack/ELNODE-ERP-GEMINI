import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { UserProfile } from '../../types';
import CAShell from '../../components/CAShell';
import { FinancialDataProvider } from './financialData';
import { ForcePasswordChangeGate } from './passwordChange';
import CADashboard from './CADashboard';
import CALedger from './CALedger';
import CAIncome from './CAIncome';
import CAExpenses from './CAExpenses';
import CAPayroll from './CAPayroll';
import CAAnalytics from './CAAnalytics';
import CAReports from './CAReports';
import CAProfile from './CAProfile';

export default function CAPortal({ user }: { user: UserProfile }) {
  // First-login gate: while the account still carries the default password, block
  // the portal behind a mandatory password change.
  const [unlocked, setUnlocked] = useState(false);
  if (user.mustChangePassword && !unlocked) {
    return <ForcePasswordChangeGate user={user} onDone={() => setUnlocked(true)} />;
  }

  return (
    <FinancialDataProvider>
      <CAShell user={user}>
        <Routes>
          <Route path="/" element={<CADashboard user={user} />} />
          <Route path="/ledger" element={<CALedger user={user} />} />
          <Route path="/income" element={<CAIncome user={user} />} />
          <Route path="/expenses" element={<CAExpenses user={user} />} />
          <Route path="/payroll" element={<CAPayroll user={user} />} />
          <Route path="/analytics" element={<CAAnalytics user={user} />} />
          <Route path="/reports" element={<CAReports user={user} />} />
          <Route path="/profile" element={<CAProfile user={user} />} />
          <Route path="*" element={<Navigate to="/ca" />} />
        </Routes>
      </CAShell>
    </FinancialDataProvider>
  );
}
