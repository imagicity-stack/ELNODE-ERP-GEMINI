import { UserProfile } from '../../types';
import { Download, FileText, PieChart, TrendingUp, Calendar, Filter, ChevronRight } from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  FormField,
  Select,
} from '../../components/ui';

interface FinancialReportsProps {
  user: UserProfile;
}

export default function FinancialReports({ user }: FinancialReportsProps) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Financial Reports"
        subtitle="Generate and download school financial statements"
        icon={FileText}
        iconColor="gradient-amber"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Report Categories */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { title: 'Fee Collection Report', desc: 'Detailed breakdown of fee collection by class and head.', icon: TrendingUp, gradient: 'bg-amber-50 text-amber-600' },
              { title: 'Expense Statement', desc: 'Summary of all school expenditures and bills.', icon: FileText, gradient: 'bg-red-50 text-red-600' },
              { title: 'Payroll Summary', desc: 'Monthly salary disbursements and tax deductions.', icon: PieChart, gradient: 'bg-emerald-50 text-emerald-600' },
              { title: 'Profit & Loss', desc: 'Overall financial health and net profit analysis.', icon: TrendingUp, gradient: 'bg-violet-50 text-violet-600' },
            ].map((report) => (
              <Card key={report.title} hover>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${report.gradient}`}>
                  <report.icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 mb-2 group-hover:text-amber-600 transition-all">{report.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-6">{report.desc}</p>
                <button className="flex items-center gap-2 text-xs font-bold text-amber-600 uppercase tracking-widest">
                  Generate Report
                  <ChevronRight className="w-4 h-4" />
                </button>
              </Card>
            ))}
          </div>

          {/* Recent Generated Reports */}
          <Card padding="none">
            <div className="p-6 border-b bg-slate-50/50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-600" />
                Recently Generated
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
              {[
                { name: 'Monthly_Fee_Report_Oct_2023.pdf', date: '2 hours ago', size: '1.2 MB' },
                { name: 'Staff_Payroll_Sep_2023.xlsx', date: 'Yesterday', size: '450 KB' },
                { name: 'Annual_Financial_Statement_2022.pdf', date: 'Oct 05, 2023', size: '3.4 MB' },
              ].map((report, i) => (
                <div key={i} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{report.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">{report.date} • {report.size}</p>
                    </div>
                  </div>
                  <button className="p-2 hover:bg-amber-50 rounded-lg text-amber-600">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Sidebar: Quick Filters */}
        <div className="space-y-6">
          <Card>
            <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Filter className="w-5 h-5 text-amber-600" />
              Report Settings
            </h3>
            <div className="space-y-6">
              <FormField label="Date Range">
                <Select defaultValue="This Month">
                  <option>This Month</option>
                  <option>Last Month</option>
                  <option>This Quarter</option>
                  <option>This Year</option>
                  <option>Custom Range</option>
                </Select>
              </FormField>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Format</label>
                <div className="flex items-center gap-2">
                  {['PDF', 'Excel', 'CSV'].map(format => (
                    <button key={format} className="flex-1 py-2 bg-slate-50 text-xs font-bold text-slate-600 rounded-xl hover:bg-amber-50 hover:text-amber-600 transition-all">
                      {format}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-6 border-t">
                <Button variant="primary" className="w-full justify-center">
                  Generate Custom Report
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
