import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, Grievance } from '../../types';
import { PageHeader, Card, StatCard } from '../../components/ui';
import {
  MessageSquare, AlertCircle, CheckCircle2, Clock,
  TrendingUp, Users, Wallet, ArrowUpRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

const statusColor: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  in_progress: 'bg-amber-100 text-amber-700',
  awaiting_response: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-100 text-slate-600',
};

const priorityColor: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export default function GrievanceDashboard({ user }: { user: UserProfile }) {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = user.role === 'super_admin';
  const isPrincipal = user.role === 'principal';
  const isOfficer = user.role === 'grievance_officer';

  useEffect(() => {
    let q;
    if (isSuperAdmin) {
      q = query(collection(db, 'grievances'), orderBy('createdAt', 'desc'));
    } else if (isPrincipal) {
      q = query(collection(db, 'grievances'), where('isEscalated', '==', true), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'grievances'), where('isEscalated', '==', false), orderBy('createdAt', 'desc'));
    }

    const unsub = onSnapshot(q, snap => {
      setGrievances(snap.docs.map(d => ({ id: d.id, ...d.data() } as Grievance)));
      setLoading(false);
    }, () => setLoading(false));

    return unsub;
  }, [isSuperAdmin, isPrincipal]);

  const open = grievances.filter(g => g.status === 'open').length;
  const inProgress = grievances.filter(g => g.status === 'in_progress').length;
  const resolved = grievances.filter(g => g.status === 'resolved' || g.status === 'closed').length;
  const urgent = grievances.filter(g => g.priority === 'urgent' && g.status !== 'resolved' && g.status !== 'closed').length;

  const avgResolutionHours = (() => {
    const resolvedWithTime = grievances.filter(g => g.resolvedAt && g.createdAt);
    if (resolvedWithTime.length === 0) return null;
    const totalHours = resolvedWithTime.reduce((sum, g) => {
      const diff = new Date(g.resolvedAt!).getTime() - new Date(g.createdAt).getTime();
      return sum + diff / 3600000;
    }, 0);
    return Math.round(totalHours / resolvedWithTime.length);
  })();

  const recent = grievances.slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Grievance Dashboard"
        subtitle={isPrincipal ? 'Escalated grievances requiring your attention' : 'Overview of all grievances and parent relations'}
        icon={MessageSquare}
        iconColor="bg-teal-500"
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Open" value={open} icon={AlertCircle} gradient="from-red-500 to-rose-600" index={0} />
            <StatCard label="In Progress" value={inProgress} icon={Clock} gradient="from-amber-500 to-orange-500" index={1} />
            <StatCard label="Resolved" value={resolved} icon={CheckCircle2} gradient="from-emerald-500 to-teal-600" index={2} />
            <StatCard
              label={avgResolutionHours !== null ? `Avg ${avgResolutionHours}h resolution` : 'Avg Resolution'}
              value={urgent > 0 ? `${urgent} Urgent` : '—'}
              icon={TrendingUp}
              gradient={urgent > 0 ? 'from-red-600 to-rose-700' : 'from-slate-400 to-slate-500'}
              index={3}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Grievances */}
            <div className="lg:col-span-2">
              <Card>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-bold text-slate-900">Recent Grievances</h2>
                  <Link
                    to={user.role === 'grievance_officer' ? '/grievance/tracker' :
                        user.role === 'principal' ? '/principal/tracker' : '/superadmin/tracker'}
                    className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 font-semibold"
                  >
                    View all <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
                {recent.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-8">No grievances found</p>
                ) : (
                  <div className="space-y-3">
                    {recent.map(g => (
                      <div key={g.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{g.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{g.parentName} · {g.studentName} · {g.classSection}</p>
                        </div>
                        <div className="flex flex-col gap-1 items-end shrink-0">
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide', statusColor[g.status] || 'bg-slate-100 text-slate-600')}>
                            {g.status.replace('_', ' ')}
                          </span>
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide', priorityColor[g.priority] || 'bg-slate-100 text-slate-600')}>
                            {g.priority}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Quick Stats */}
            <div className="space-y-4">
              <Card>
                <h2 className="font-bold text-slate-900 mb-4">By Category</h2>
                {(['academic', 'fee', 'facility', 'staff_conduct', 'transport', 'other'] as const).map(cat => {
                  const count = grievances.filter(g => g.category === cat).length;
                  const pct = grievances.length > 0 ? Math.round((count / grievances.length) * 100) : 0;
                  return (
                    <div key={cat} className="mb-3">
                      <div className="flex justify-between text-xs text-slate-600 mb-1">
                        <span className="capitalize font-medium">{cat.replace('_', ' ')}</span>
                        <span>{count}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </Card>

              <Card>
                <h2 className="font-bold text-slate-900 mb-4">Quick Links</h2>
                <div className="space-y-2">
                  {isOfficer && (
                    <>
                      <Link to="/grievance/tracker" className="flex items-center gap-3 p-3 rounded-xl bg-teal-50 hover:bg-teal-100 transition-colors">
                        <MessageSquare className="w-4 h-4 text-teal-600" />
                        <span className="text-sm font-semibold text-teal-700">Manage Grievances</span>
                      </Link>
                      <Link to="/grievance/fee-followup" className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 hover:bg-amber-100 transition-colors">
                        <Wallet className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-semibold text-amber-700">Fee Follow-up</span>
                      </Link>
                      <Link to="/grievance/broadcast" className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-700">WhatsApp Broadcast</span>
                      </Link>
                    </>
                  )}
                  {isPrincipal && (
                    <Link to="/principal/tracker" className="flex items-center gap-3 p-3 rounded-xl bg-rose-50 hover:bg-rose-100 transition-colors">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      <span className="text-sm font-semibold text-rose-700">Escalated Grievances</span>
                    </Link>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
