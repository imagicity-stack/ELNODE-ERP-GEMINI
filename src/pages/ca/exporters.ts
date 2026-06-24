/**
 * CSV + PDF exporters for the CA portal. Builds professional, branded statements
 * using the shared pdfTemplate helpers, and plain CSVs via PapaParse. All numbers
 * use "Rs." in PDFs because the bundled Helvetica can't render the ₹ glyph cleanly.
 */

import Papa from 'papaparse';
import autoTable from 'jspdf-autotable';
import { createPdf, addFooter, drawInfoBox, TABLE_STYLES } from '../../lib/pdfTemplate';
import { savePdf, saveText } from '../../lib/download';
import { DateRange, inRange, monthInRange } from './financialData';
import {
  FinancialArrays, LedgerEntry, computeSummary, realPayments,
  incomeByHead, expenseByCategory, outstandingDues,
} from './compute';

const rs = (n: number) => `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`;
const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportCsv(rows: Record<string, any>[], filename: string): Promise<void> {
  const csv = Papa.unparse(rows.length ? rows : [{ note: 'No records for the selected period' }]);
  await saveText(csv, filename);
}

// ─── Day Book / Ledger ────────────────────────────────────────────────────────

export async function downloadLedgerPdf(entries: LedgerEntry[], range: DateRange): Promise<void> {
  const { doc, contentY } = await createPdf('Day Book / General Ledger', `Period: ${range.label} (${range.from} to ${range.to})`);
  let balance = 0;
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const rows = entries.map(e => {
    balance += e.credit - e.debit;
    return [
      e.date,
      e.particulars,
      e.ref,
      e.method,
      e.credit ? rs(e.credit) : '—',
      e.debit ? rs(e.debit) : '—',
      rs(balance),
    ];
  });
  autoTable(doc, {
    startY: contentY + 2,
    head: [['Date', 'Particulars', 'Ref', 'Mode', 'Receipt (Cr)', 'Payment (Dr)', 'Balance']],
    body: rows,
    foot: [[
      { content: 'Totals', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: rs(totalCredit), styles: { fontStyle: 'bold', textColor: [5, 150, 105] } },
      { content: rs(totalDebit), styles: { fontStyle: 'bold', textColor: [220, 38, 38] } },
      { content: rs(totalCredit - totalDebit), styles: { fontStyle: 'bold' } },
    ]],
    ...TABLE_STYLES,
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: { left: 10, right: 10 },
  });
  addFooter(doc);
  await savePdf(doc, `day_book_${range.from}_${range.to}.pdf`);
}

// ─── Income & Expenditure (P&L) ───────────────────────────────────────────────

export async function downloadIncomeExpenditurePdf(data: FinancialArrays, range: DateRange): Promise<void> {
  const s = computeSummary(data, range);
  const heads = incomeByHead(data, range);
  const cats = expenseByCategory(data, range);
  const { doc, contentY, pageWidth } = await createPdf('Income & Expenditure Statement', `Period: ${range.label} (${range.from} to ${range.to})`);

  let y = drawInfoBox(doc, [
    { label: 'Total Receipts', value: rs(s.receipts) },
    { label: 'Total Payments', value: rs(s.payments) },
    { label: 'Surplus/(Deficit)', value: rs(s.net) },
    { label: 'Collection Rate', value: `${s.collectionRate.toFixed(1)}%` },
  ], contentY + 2, pageWidth, 2);

  autoTable(doc, {
    startY: y + 2,
    head: [['Income', 'Amount']],
    body: heads.map(h => [h.name, rs(h.amount)]),
    foot: [[{ content: 'Total Income', styles: { fontStyle: 'bold' } }, { content: rs(s.receipts), styles: { fontStyle: 'bold', textColor: [5, 150, 105] } }]],
    ...TABLE_STYLES,
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 12, right: 12 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['Expenditure', 'Amount']],
    body: [...cats.map(c => [c.name, rs(c.amount)]), ['Salaries & Wages', rs(s.salaryTotal)]],
    foot: [[{ content: 'Total Expenditure', styles: { fontStyle: 'bold' } }, { content: rs(s.payments), styles: { fontStyle: 'bold', textColor: [220, 38, 38] } }]],
    ...TABLE_STYLES,
    headStyles: { ...TABLE_STYLES.headStyles, fillColor: [220, 38, 38] },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 12, right: 12 },
  });

  const net = s.net;
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    body: [[
      { content: net >= 0 ? 'Surplus carried to Balance' : 'Deficit', styles: { fontStyle: 'bold' } },
      { content: rs(Math.abs(net)), styles: { fontStyle: 'bold', halign: 'right', textColor: net >= 0 ? [5, 150, 105] : [220, 38, 38] } },
    ]],
    theme: 'grid',
    styles: { fontSize: 11, cellPadding: 5 },
    margin: { left: 12, right: 12 },
  });

  addFooter(doc);
  await savePdf(doc, `income_expenditure_${range.from}_${range.to}.pdf`);
}

// ─── Receipts & Payments (cash account) ───────────────────────────────────────

export async function downloadReceiptsPaymentsPdf(data: FinancialArrays, range: DateRange): Promise<void> {
  const s = computeSummary(data, range);
  const { doc, contentY } = await createPdf('Receipts & Payments Account', `Period: ${range.label} (${range.from} to ${range.to})`);
  autoTable(doc, {
    startY: contentY + 2,
    head: [['Receipts', 'Amount', 'Payments', 'Amount']],
    body: [
      ['Fee Collections', rs(s.feeIncome), 'Operating Expenses', rs(s.expenseTotal)],
      ['Advance Fees', rs(s.advanceIncome), 'Salaries & Wages', rs(s.salaryTotal)],
      ['', '', s.net >= 0 ? 'Closing Surplus' : 'Closing Deficit', rs(Math.abs(s.net))],
    ],
    foot: [[
      { content: 'Total', styles: { fontStyle: 'bold' } },
      { content: rs(s.receipts), styles: { fontStyle: 'bold', halign: 'right' } },
      { content: 'Total', styles: { fontStyle: 'bold' } },
      { content: rs(s.payments + Math.max(0, s.net)), styles: { fontStyle: 'bold', halign: 'right' } },
    ]],
    ...TABLE_STYLES,
    columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 12, right: 12 },
  });
  addFooter(doc);
  await savePdf(doc, `receipts_payments_${range.from}_${range.to}.pdf`);
}

// ─── Registers ────────────────────────────────────────────────────────────────

export async function downloadFeeCollectionPdf(data: FinancialArrays, range: DateRange): Promise<void> {
  const rows = realPayments(data.payments).filter(p => inRange(p.date, range))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const total = rows.reduce((s, p) => s + (p.amount || 0), 0);
  const { doc, contentY } = await createPdf('Fee Collection Register', `Period: ${range.label} (${range.from} to ${range.to})`);
  autoTable(doc, {
    startY: contentY + 2,
    head: [['Receipt', 'Date', 'Student', 'Head', 'Mode', 'Amount']],
    body: rows.map(p => [
      p.receiptNumber || '—', p.date,
      data.studentsMap[p.studentId]?.name || p.studentId,
      p.feeHead || '—',
      (p.method || '').replace(/_/g, ' ').toUpperCase(),
      rs(p.amount || 0),
    ]),
    foot: [[{ content: `${rows.length} receipts`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } }, { content: rs(total), styles: { fontStyle: 'bold', textColor: [5, 150, 105] } }]],
    ...TABLE_STYLES,
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 5: { halign: 'right' } },
    margin: { left: 12, right: 12 },
  });
  addFooter(doc);
  await savePdf(doc, `fee_collection_${range.from}_${range.to}.pdf`);
}

export async function downloadExpensePdf(data: FinancialArrays, range: DateRange): Promise<void> {
  const rows = data.expenses.filter(e => inRange(e.date, range)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const total = rows.reduce((s, e) => s + (e.amount || 0), 0);
  const { doc, contentY } = await createPdf('Expense Statement', `Period: ${range.label} (${range.from} to ${range.to})`);
  autoTable(doc, {
    startY: contentY + 2,
    head: [['Date', 'Category', 'Biller', 'Description', 'Status', 'Amount']],
    body: rows.map(e => [e.date, e.category, e.biller || '—', e.description || '—', (e.status || '').toUpperCase(), rs(e.amount || 0)]),
    foot: [[{ content: `${rows.length} entries`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } }, { content: rs(total), styles: { fontStyle: 'bold', textColor: [220, 38, 38] } }]],
    ...TABLE_STYLES,
    headStyles: { ...TABLE_STYLES.headStyles, fillColor: [220, 38, 38] },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 5: { halign: 'right' } },
    margin: { left: 12, right: 12 },
  });
  addFooter(doc);
  await savePdf(doc, `expense_statement_${range.from}_${range.to}.pdf`);
}

export async function downloadPayrollPdf(data: FinancialArrays, range: DateRange): Promise<void> {
  const rows = data.salaries.filter(s => monthInRange(s.month, range)).sort((a, b) => (a.month || '').localeCompare(b.month || ''));
  const totalNet = rows.reduce((s, e) => s + (e.netAmount || 0), 0);
  const totalPaid = rows.reduce((s, e) => s + (e.paidAmount || 0), 0);
  const { doc, contentY } = await createPdf('Payroll Register', `Period: ${range.label} (${range.from} to ${range.to})`);
  autoTable(doc, {
    startY: contentY + 2,
    head: [['Employee', 'Role', 'Month', 'Net Pay', 'Paid', 'Status']],
    body: rows.map(s => [s.employeeName, s.employeeRole, s.month, rs(s.netAmount || 0), rs(s.paidAmount || 0), (s.status || '').toUpperCase()]),
    foot: [[
      { content: `${rows.length} records`, colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: rs(totalNet), styles: { fontStyle: 'bold' } },
      { content: rs(totalPaid), styles: { fontStyle: 'bold', textColor: [5, 150, 105] } },
      { content: '' },
    ]],
    ...TABLE_STYLES,
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: 12, right: 12 },
  });
  addFooter(doc);
  await savePdf(doc, `payroll_register_${range.from}_${range.to}.pdf`);
}

export async function downloadOutstandingPdf(data: FinancialArrays, classNameById: Record<string, string>): Promise<void> {
  const rows = outstandingDues(data, classNameById);
  const total = rows.reduce((s, r) => s + r.due, 0);
  const { doc, contentY } = await createPdf('Outstanding Fees (Debtors)', `As on ${new Date().toLocaleDateString('en-IN')}`);
  autoTable(doc, {
    startY: contentY + 2,
    head: [['Student', 'Class', 'Month', 'Due Date', 'Status', 'Outstanding']],
    body: rows.map(r => [r.name, r.className, r.month, r.dueDate || '—', r.overdue ? 'OVERDUE' : r.status.toUpperCase(), rs(r.due)]),
    foot: [[{ content: `${rows.length} debtors`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } }, { content: rs(total), styles: { fontStyle: 'bold', textColor: [220, 38, 38] } }]],
    ...TABLE_STYLES,
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 5: { halign: 'right' } },
    margin: { left: 12, right: 12 },
  });
  addFooter(doc);
  await savePdf(doc, `outstanding_fees_${stamp()}.pdf`);
}
