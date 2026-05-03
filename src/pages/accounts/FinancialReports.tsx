import { UserProfile } from '../../types';
import { Download, FileText, PieChart, TrendingUp, Calendar, Filter, Search, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FinancialReportsProps {
  user: UserProfile;
}

export default function FinancialReports({ user }: FinancialReportsProps) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Reports</h1>
          <p className="text-gray-500 text-sm">Generate and download school financial statements.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Report Categories */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { title: 'Fee Collection Report', desc: 'Detailed breakdown of fee collection by class and head.', icon: TrendingUp, color: 'blue' },
              { title: 'Expense Statement', desc: 'Summary of all school expenditures and bills.', icon: FileText, color: 'red' },
              { title: 'Payroll Summary', desc: 'Monthly salary disbursements and tax deductions.', icon: PieChart, color: 'emerald' },
              { title: 'Profit & Loss', desc: 'Overall financial health and net profit analysis.', icon: TrendingUp, color: 'indigo' },
            ].map((report) => (
              <div key={report.title} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group cursor-pointer">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
                  report.color === 'blue' && "bg-blue-50 text-blue-600",
                  report.color === 'red' && "bg-red-50 text-red-600",
                  report.color === 'emerald' && "bg-emerald-50 text-emerald-600",
                  report.color === 'indigo' && "bg-indigo-50 text-indigo-600",
                )}>
                  <report.icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-all">{report.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed mb-6">{report.desc}</p>
                <button className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-widest">
                  Generate Report
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Recent Generated Reports */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b bg-gray-50/50">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Recently Generated
              </h3>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { name: 'Monthly_Fee_Report_Oct_2023.pdf', date: '2 hours ago', size: '1.2 MB' },
                { name: 'Staff_Payroll_Sep_2023.xlsx', date: 'Yesterday', size: '450 KB' },
                { name: 'Annual_Financial_Statement_2022.pdf', date: 'Oct 05, 2023', size: '3.4 MB' },
              ].map((report, i) => (
                <div key={i} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{report.name}</p>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">{report.date} • {report.size}</p>
                    </div>
                  </div>
                  <button className="p-2 hover:bg-blue-50 rounded-lg text-blue-600">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar: Quick Filters */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              Report Settings
            </h3>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Date Range</label>
                <select className="w-full px-4 py-2 bg-gray-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-600/20 outline-none">
                  <option>This Month</option>
                  <option>Last Month</option>
                  <option>This Quarter</option>
                  <option>This Year</option>
                  <option>Custom Range</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Format</label>
                <div className="flex items-center gap-2">
                  {['PDF', 'Excel', 'CSV'].map(format => (
                    <button key={format} className="flex-1 py-2 bg-gray-50 text-xs font-bold text-gray-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all">
                      {format}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-6 border-t">
                <button className="w-full py-3 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all">
                  Generate Custom Report
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
