import autoTable from 'jspdf-autotable';
import { createPdf, addFooter, TABLE_STYLES } from './pdfTemplate';
import { savePdf } from './download';
import { TransferCertificate } from '../types';

const fmtDate = (d?: string): string => {
  if (!d) return '—';
  const dt = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Generate and download a formal Transfer Certificate PDF. */
export async function downloadTC(tc: TransferCertificate): Promise<void> {
  const { doc, contentY, pageWidth } = await createPdf(
    'Transfer Certificate',
    `TC No: ${tc.tcNumber}  ·  Issued: ${fmtDate(tc.issueDate)}`,
  );

  const rows: [string, string][] = [
    ['Transfer Certificate No.', tc.tcNumber],
    ['Admission No.', tc.admissionNumber],
    ['School No.', tc.schoolNumber || '—'],
    ['Name of Student', tc.studentName],
    ["Father's Name", tc.fatherName || '—'],
    ["Mother's Name", tc.motherName || '—'],
    ['Date of Birth', fmtDate(tc.dateOfBirth)],
    ['Gender', tc.gender ? tc.gender.charAt(0).toUpperCase() + tc.gender.slice(1) : '—'],
    ['Class Last Studied', `${tc.classLastStudied}${tc.section ? ` · ${tc.section}` : ''}`],
    ['Academic Year', tc.academicYear || '—'],
    ['Date of Admission', fmtDate(tc.admissionDate)],
    ['Date of Leaving (last attendance)', fmtDate(tc.lastAttendanceDate)],
    ['Reason for Leaving', tc.reason === 'Other' && tc.reasonDetail ? tc.reasonDetail : `${tc.reason}${tc.reasonDetail ? ` — ${tc.reasonDetail}` : ''}`],
    ['Qualified for Promotion', tc.qualifiedForPromotion ? `Yes${tc.promotedTo ? ` — promoted to ${tc.promotedTo}` : ''}` : 'No'],
    ['General Conduct', tc.conduct || '—'],
    ['All Dues Cleared', tc.duesCleared ? 'Yes' : 'No'],
  ];
  if (tc.workingDays != null || tc.daysAttended != null) {
    rows.push(['Attendance', `${tc.daysAttended ?? '—'} of ${tc.workingDays ?? '—'} working days`]);
  }
  if (tc.remarks) rows.push(['Remarks', tc.remarks]);

  autoTable(doc, {
    startY: contentY + 2,
    head: [['Particulars', 'Details']],
    body: rows,
    ...TABLE_STYLES,
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 78, fontStyle: 'bold' }, 1: { cellWidth: pageWidth - 24 - 78 } },
    margin: { left: 12, right: 12 },
  });

  let y = (doc as any).lastAutoTable.finalY + 12;
  if (y > doc.internal.pageSize.height - 50) { doc.addPage(); y = 30; }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Certified that the above particulars are in accordance with the school records.',
    12, y,
  );

  // Signature lines
  const sigY = y + 26;
  doc.setDrawColor(150, 150, 150);
  doc.line(14, sigY, 74, sigY);
  doc.line(pageWidth - 74, sigY, pageWidth - 14, sigY);
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Class Teacher', 14, sigY + 5);
  doc.text('Principal', pageWidth - 74, sigY + 5);

  addFooter(doc);
  await savePdf(doc, `TC_${tc.tcNumber}_${tc.studentName.replace(/[^\w]+/g, '_')}.pdf`);
}
