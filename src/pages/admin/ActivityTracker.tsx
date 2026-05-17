import { useState, useEffect, useMemo } from 'react';
import {
  History as HistoryIcon,
  Search,
  Download,
  Clock,
  User,
  Globe,
  Wifi,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  RefreshCw,
  Activity,
  Users,
  Layers,
  Calendar,
  ChevronDown,
  ChevronUp,
  MonitorSmartphone,
  Sparkles,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  Badge,
  EmptyState,
  IconButton,
} from '../../components/ui';
import { ActivityLog, ActivitySection, UserProfile } from '../../types';
import { subscribeActivityLogs } from '../../services/activityService';
import { format, isAfter, isBefore, startOfDay, endOfDay, isToday } from 'date-fns';

const toDate = (ts: any): Date | null => {
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};

const safeFormat = (ts: any, pattern: string) => {
  const d = toDate(ts);
  return d ? format(d, pattern) : '—';
};

const SECTIONS: ActivitySection[] = [
  'Super Admin', 'Accounts', 'Parents', 'Students', 'Academic', 'Teachers', 'Exam', 'Staff', 'Principal',
];

const ROLES = ['super_admin', 'accountant', 'parent', 'teacher', 'student', 'principal', 'grievance_officer'];

const SECTION_COLORS: Record<string, string> = {
  'Super Admin': 'bg-rose-100 text-rose-700',
  'Accounts': 'bg-emerald-100 text-emerald-700',
  'Academic': 'bg-blue-100 text-blue-700',
  'Students': 'bg-amber-100 text-amber-700',
  'Teachers': 'bg-indigo-100 text-indigo-700',
  'Exam': 'bg-purple-100 text-purple-700',
  'Staff': 'bg-cyan-100 text-cyan-700',
  'Parents': 'bg-pink-100 text-pink-700',
  'Principal': 'bg-orange-100 text-orange-700',
};

const getSectionBadgeVariant = (section: string) => {
  switch (section) {
    case 'Super Admin': return 'danger';
    case 'Accounts': return 'success';
    case 'Academic': return 'primary';
    case 'Students': return 'warning';
    case 'Teachers': return 'info';
    default: return 'secondary';
  }
};

export default function ActivityTracker({ user }: { user: UserProfile }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveCount, setLiveCount] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const itemsPerPage = 25;

  // Expanded row for details
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeActivityLogs({
      limitCount: 1000,
      onData: (docs) => {
        setLogs(docs);
        setLiveCount(prev => prev + 1);
        setLoading(false);
      },
      onError: () => setLoading(false),
    });
    return unsub;
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, selectedSection, selectedRole, dateFrom, dateTo]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (selectedSection !== 'all' && log.section !== selectedSection) return false;
      if (selectedRole !== 'all' && log.userRole !== selectedRole) return false;

      if (dateFrom) {
        const d = toDate(log.timestamp);
        if (!d || isBefore(d, startOfDay(new Date(dateFrom)))) return false;
      }
      if (dateTo) {
        const d = toDate(log.timestamp);
        if (!d || isAfter(d, endOfDay(new Date(dateTo)))) return false;
      }

      if (search) {
        const q = search.toLowerCase();
        return (
          (log.userName || '').toLowerCase().includes(q) ||
          (log.action || '').toLowerCase().includes(q) ||
          (log.details || '').toLowerCase().includes(q) ||
          (log.aiDescription || '').toLowerCase().includes(q) ||
          (log.ip || '').toLowerCase().includes(q) ||
          (log.location || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, search, selectedSection, selectedRole, dateFrom, dateTo]);

  const paginatedLogs = filteredLogs.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  // Stats
  const stats = useMemo(() => {
    const todayLogs = logs.filter(l => {
      const d = toDate(l.timestamp);
      return d ? isToday(d) : false;
    });
    const uniqueUsers = new Set(logs.map(l => l.userId)).size;
    const sectionsUsed = new Set(logs.map(l => l.section)).size;
    const uniqueIPs = new Set(logs.filter(l => l.ip).map(l => l.ip)).size;
    return { total: logs.length, today: todayLogs.length, uniqueUsers, sectionsUsed, uniqueIPs };
  }, [logs]);

  const exportCSV = () => {
    const headers = ['Timestamp', 'User', 'Role', 'Section', 'Action', 'Details', 'IP', 'Location', 'ISP'];
    const rows = filteredLogs.map(log => [
      safeFormat(log.timestamp, 'dd/MM/yyyy HH:mm:ss'),
      log.userName,
      log.userRole,
      log.section,
      log.action,
      `"${(log.details || '').replace(/"/g, '""')}"`,
      log.ip || '',
      log.location || '',
      log.isp || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_log_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedSection('all');
    setSelectedRole('all');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = search || selectedSection !== 'all' || selectedRole !== 'all' || dateFrom || dateTo;

  return (
    <>
      {/* ─── Mobile UI ──────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Activity Tracker</h1>
          <p className="text-xs text-indigo-200 mt-0.5">{filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''} · live</p>

          {/* Mobile quick stats */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            {[
              { label: 'Total Logs', value: stats.total },
              { label: "Today's Activity", value: stats.today },
              { label: 'Unique Users', value: stats.uniqueUsers },
              { label: 'Unique IPs', value: stats.uniqueIPs },
            ].map(s => (
              <div key={s.label} className="bg-white/10 rounded-2xl p-3">
                <p className="text-[10px] text-indigo-200 font-semibold uppercase">{s.label}</p>
                <p className="text-xl font-black text-white">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Section chips */}
        <div className="px-4 pt-3 pb-2 overflow-x-auto flex gap-2 [scrollbar-width:none] bg-white border-b border-slate-100">
          {['all', ...SECTIONS].map(s => (
            <button
              key={s}
              onClick={() => setSelectedSection(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                selectedSection === s ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        <div className="px-4 pt-3 pb-3 bg-white border-b border-slate-100 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              placeholder="Search logs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
            />
          </div>
          <button
            onClick={exportCSV}
            disabled={filteredLogs.length === 0}
            className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold active:scale-95 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-24 space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          ) : paginatedLogs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-400 font-medium">No activity logs found.</p>
            </div>
          ) : (
            paginatedLogs.map(log => (
              <div key={log.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold text-slate-900">{log.userName}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${SECTION_COLORS[log.section] || 'bg-slate-100 text-slate-600'}`}>
                        {log.section}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-700 mb-0.5">{log.action}</p>
                    {log.aiDescription ? (
                      <div className="flex items-start gap-1 mb-1">
                        <Sparkles className="w-3 h-3 text-violet-500 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-slate-700 leading-snug">{log.aiDescription}</p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 line-clamp-2">{log.details}</p>
                    )}
                    {log.ip && (
                      <div className="flex items-center gap-1 mt-1">
                        <Globe className="w-3 h-3 text-slate-300" />
                        <span className="text-[10px] text-slate-400 font-mono">{log.ip}</span>
                        {log.location && <span className="text-[10px] text-slate-400">· {log.location}</span>}
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">
                      {safeFormat(log.timestamp, 'EEE, dd MMM yyyy · HH:mm:ss')}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between py-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-slate-600">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Desktop UI ─────────────────────────────────────────────── */}
      <div className="hidden md:block space-y-6">
        <PageHeader
          title="Activity Tracker"
          subtitle="Real-time audit log of all system activities across every portal."
          icon={HistoryIcon}
          iconColor="gradient-indigo"
          actions={
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-emerald-700">Live</span>
              </div>
              <Button icon={Download} onClick={exportCSV} disabled={filteredLogs.length === 0}>
                Export CSV
              </Button>
            </div>
          }
        />

        {/* Stats cards */}
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: 'Total Logs', value: stats.total, icon: Activity, color: 'text-indigo-600 bg-indigo-50' },
            { label: "Today's Activity", value: stats.today, icon: Calendar, color: 'text-emerald-600 bg-emerald-50' },
            { label: 'Unique Users', value: stats.uniqueUsers, icon: Users, color: 'text-blue-600 bg-blue-50' },
            { label: 'Sections Active', value: stats.sectionsUsed, icon: Layers, color: 'text-purple-600 bg-purple-50' },
            { label: 'Unique IPs', value: stats.uniqueIPs, icon: Globe, color: 'text-amber-600 bg-amber-50' },
          ].map(s => (
            <Card key={s.label} className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{s.label}</p>
                <p className="text-2xl font-black text-slate-900">{s.value}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="p-4 space-y-3">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by user, action, details, IP or location..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
                showFilters || hasActiveFilters
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="w-5 h-5 bg-indigo-600 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                  {[search, selectedSection !== 'all', selectedRole !== 'all', dateFrom, dateTo].filter(Boolean).length}
                </span>
              )}
              {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-4 gap-3 pt-1 border-t border-slate-100">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Section</label>
                <Select value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
                  <option value="all">All Sections</option>
                  {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Role</label>
                <Select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
                  <option value="all">All Roles</option>
                  {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white"
                />
              </div>
            </div>
          )}

          {/* Section chips */}
          <div className="flex gap-2 flex-wrap pt-1">
            {['all', ...SECTIONS].map(s => (
              <button
                key={s}
                onClick={() => setSelectedSection(s)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                  selectedSection === s
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s === 'all' ? 'All Sections' : s}
              </button>
            ))}
          </div>
        </Card>

        {/* Table */}
        <div className={loading ? 'opacity-60 pointer-events-none transition-opacity' : ''}>
          <Card padding="none">
            <Table>
              <Thead>
                <Tr>
                  <Th>Timestamp</Th>
                  <Th>User</Th>
                  <Th>Section</Th>
                  <Th>Action</Th>
                  <Th>Details</Th>
                  <Th>IP / Location</Th>
                </Tr>
              </Thead>
              <Tbody>
                {paginatedLogs.map(log => (
                  <>
                    <Tr
                      key={log.id}
                      className="hover:bg-slate-50/50 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <Td className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                            {safeFormat(log.timestamp, 'EEEE')}
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            {safeFormat(log.timestamp, 'dd MMM yyyy')}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {safeFormat(log.timestamp, 'HH:mm:ss')}
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-slate-500" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold text-slate-900 truncate">{log.userName}</span>
                            <span className="text-xs text-slate-400 capitalize">{(log.userRole || '').replace('_', ' ')}</span>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <Badge variant={getSectionBadgeVariant(log.section) as any}>
                          {log.section}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="text-sm font-semibold text-slate-700">{log.action}</span>
                      </Td>
                      <Td className="max-w-md">
                        {log.aiDescription ? (
                          <div className="flex items-start gap-1.5">
                            <Sparkles className="w-3 h-3 text-violet-500 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs text-slate-700 leading-snug line-clamp-2" title={log.aiDescription}>
                                {log.aiDescription}
                              </p>
                              <p className="text-[10px] text-slate-400 italic line-clamp-1 mt-0.5" title={log.details}>
                                {log.details}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 line-clamp-2" title={log.details}>
                            {log.details}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {log.ip ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="text-xs font-mono text-slate-600">{log.ip}</span>
                            </div>
                            {log.location && (
                              <span className="text-[10px] text-slate-400 pl-4">{log.location}</span>
                            )}
                            {log.isp && (
                              <div className="flex items-center gap-1 pl-0">
                                <Wifi className="w-3 h-3 text-slate-300 shrink-0" />
                                <span className="text-[10px] text-slate-400 truncate max-w-[140px]" title={log.isp}>{log.isp}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </Td>
                    </Tr>
                    {expandedId === log.id && (
                      <tr key={`${log.id}-exp`} className="bg-indigo-50/40">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              {log.aiDescription && (
                                <div className="mb-3 p-3 bg-violet-50 border border-violet-200 rounded-lg">
                                  <p className="text-[10px] font-bold text-violet-700 uppercase mb-1 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" /> AI-Generated Description
                                  </p>
                                  <p className="text-sm text-violet-900 leading-relaxed">{log.aiDescription}</p>
                                </div>
                              )}
                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Raw Details</p>
                              <p className="text-sm text-slate-700 leading-relaxed">{log.details}</p>
                              {log.metadata && (
                                <div className="mt-2">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Metadata</p>
                                  <pre className="text-[10px] text-slate-600 bg-white border border-slate-200 rounded-lg p-2 overflow-x-auto max-h-32">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">User Agent</p>
                              {log.userAgent ? (
                                <div className="flex items-start gap-2">
                                  <MonitorSmartphone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                                  <p className="text-[10px] text-slate-500 break-all leading-relaxed">{log.userAgent}</p>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-300">Not available</p>
                              )}
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">User ID</p>
                                  <p className="text-[10px] font-mono text-slate-500 break-all">{log.userId}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Exact Time</p>
                                  <p className="text-[10px] font-mono text-slate-500">{safeFormat(log.timestamp, 'dd MMM yyyy, HH:mm:ss')}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </Tbody>
            </Table>

            {filteredLogs.length === 0 && !loading && (
              <EmptyState
                title="No activities found"
                description="Adjust your search or filters to see more results."
                icon={HistoryIcon}
              />
            )}

            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Showing {(page - 1) * itemsPerPage + 1}–{Math.min(page * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} logs
                </p>
                <div className="flex gap-2 items-center">
                  <IconButton icon={ChevronLeft} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} size="sm" />
                  <span className="flex items-center px-3 text-xs font-bold text-slate-700 bg-slate-50 rounded-lg">
                    {page} / {totalPages}
                  </span>
                  <IconButton icon={ChevronRight} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} size="sm" />
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
