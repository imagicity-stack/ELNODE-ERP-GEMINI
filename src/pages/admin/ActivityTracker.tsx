import { useState, useEffect } from 'react';
import { 
  History as HistoryIcon, 
  Search, 
  Filter, 
  Download, 
  Clock, 
  User, 
  Tag, 
  Info,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  FileText
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
  IconButton
} from '../../components/ui';
import { ActivityLog, ActivitySection, UserProfile } from '../../types';
import { getActivityLogs } from '../../services/activityService';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseFirestoreTimestamp } from '../../lib/utils';

const SECTIONS: ActivitySection[] = [
  'Super Admin', 'Accounts', 'Parents', 'Students', 'Academic', 'Teachers', 'Exam', 'Staff'
];

export default function ActivityTracker({ user }: { user: UserProfile }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchLogs();
  }, [selectedSection]);

  const fetchLogs = async () => {
    setLoading(true);
    const result = await getActivityLogs(
      selectedSection === 'all' ? undefined : selectedSection as ActivitySection,
      500 // Fetch more for filtering/viewing
    );
    setLogs(result);
    setLoading(false);
  };

  const filteredLogs = logs.filter(log => 
    log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedLogs = filteredLogs.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  const exportPDF = () => {
    const doc = new jsPDF();
    const tableColumn = ["Date", "User", "Section", "Action", "Details"];
    const tableRows: any[] = [];

    filteredLogs.forEach(log => {
      const logData = [
        format(parseFirestoreTimestamp(log.timestamp), 'dd/MM/yyyy HH:mm'),
        `${log.userName} (${log.userRole})`,
        log.section,
        log.action,
        log.details
      ];
      tableRows.push(logData);
    });

    doc.setFontSize(18);
    doc.text("Activity Tracker Report", 14, 15);
    doc.setFontSize(11);
    doc.text(`Section: ${selectedSection === 'all' ? 'All Sections' : selectedSection}`, 14, 22);
    doc.text(`Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 28);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`activity_report_${selectedSection}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const getSectionColor = (section: string) => {
    switch (section) {
      case 'Super Admin': return 'danger';
      case 'Accounts': return 'success';
      case 'Academic': return 'primary';
      case 'Students': return 'warning';
      case 'Teachers': return 'info';
      default: return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Tracker"
        subtitle="Monitor system logs and user activities across all modules."
        icon={HistoryIcon}
        iconColor="gradient-indigo"
        actions={
          <Button icon={Download} onClick={exportPDF} disabled={logs.length === 0}>
            Export PDF
          </Button>
        }
      />

      <Card className="p-4 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search logs by action, user or details..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="w-full md:w-48"
          >
            <option value="all">All Sections</option>
            {SECTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
      </Card>

      <div className={loading ? "opacity-60 pointer-events-none transition-opacity" : ""}>
        <Card padding="none">
          <Table>
          <Thead>
            <Tr>
              <Th>Timestamp</Th>
              <Th>User</Th>
              <Th className="hidden md:table-cell">Section</Th>
              <Th className="hidden sm:table-cell">Action</Th>
              <Th>Details</Th>
            </Tr>
          </Thead>
          <Tbody>
            {paginatedLogs.map((log) => (
              <Tr key={log.id} className="hover:bg-slate-50/50">
                <Td className="whitespace-nowrap">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">
                      {format(parseFirestoreTimestamp(log.timestamp), 'MMM dd, h:mm a')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono sm:hidden">
                      {log.section} · {log.action}
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
                      <span className="text-xs text-slate-500 capitalize md:hidden">{log.userRole.replace('_', ' ')}</span>
                    </div>
                  </div>
                </Td>
                <Td className="hidden md:table-cell">
                  <Badge variant={getSectionColor(log.section) as any}>
                    {log.section}
                  </Badge>
                </Td>
                <Td className="hidden sm:table-cell">
                  <span className="text-sm font-medium text-slate-700">{log.action}</span>
                </Td>
                <Td className="max-w-xs truncate">
                  <span className="text-xs text-slate-500" title={log.details}>
                    {log.details}
                  </span>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>

        {filteredLogs.length === 0 && !loading && (
          <EmptyState
            title="No activities found"
            description="Adjust your search or filters to see more results."
            icon={FileText}
          />
        )}

        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {(page - 1) * itemsPerPage + 1} to {Math.min(page * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} logs
            </p>
            <div className="flex gap-2">
              <IconButton
                icon={ChevronLeft}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                size="sm"
              />
              <span className="flex items-center px-3 text-xs font-bold text-slate-700 bg-slate-50 rounded-lg">
                {page} / {totalPages}
              </span>
              <IconButton
                icon={ChevronRight}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                size="sm"
              />
            </div>
          </div>
        )}
      </Card>
    </div>
  </div>
  );
}
