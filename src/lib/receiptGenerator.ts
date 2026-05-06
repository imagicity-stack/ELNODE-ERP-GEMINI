import { FeePayment, FeeRequest, Student } from '../types';
import { createPdf, addFooter, drawInfoBox, TABLE_STYLES } from './pdfTemplate';

export const generateFeeReceipt = async (
  payment: FeePayment,
  request: FeeRequest,
  student: Student,
): Promise<void> => {
  const { doc, contentY, pageWidth } = await createPdf(
    'Fee Payment Receipt',
    `Receipt No: ${payment.receiptNumber}`,
  );

  let y = contentY + 4;

  // Receipt meta info box
  y = drawInfoBox(
    doc,
    [
      { label: 'Receipt No', value: payment.receiptNumber },
      { label: 'Date', value: payment.date },
      { label: 'Method', value: payment.method.toUpperCase().replace('_', ' ') },
      { label: 'Trans. ID', value: payment.transactionId || payment.referenceNumber || 'N/A' },
    ],
    y,
    pageWidth,
    2,
  );

  y += 4;

  // Student info box
  const doc2 = doc;
  doc2.setFontSize(9);
  doc2.setFont('helvetica', 'bold');
  doc2.setTextColor(5, 150, 105);
  doc2.text('STUDENT DETAILS', 12, y);
  y += 2;

  y = drawInfoBox(
    doc,
    [
      { label: 'Name', value: student.name },
      { label: 'School No', value: student.schoolNumber || student.admissionNumber || '-' },
      { label: 'Class', value: `${student.classId} – ${student.section}` },
      { label: 'Month', value: request.month || '-' },
    ],
    y,
    pageWidth,
    2,
  );

  y += 6;

  // Fee breakdown table
  const tableData = request.heads.map((head) => [
    head.name,
    `₹${(head.amount || 0).toLocaleString('en-IN')}`,
    `₹${(head.discount || 0).toLocaleString('en-IN')}`,
    `₹${(head.finalAmount || 0).toLocaleString('en-IN')}`,
  ]);

  (doc as any).autoTable({
    startY: y,
    head: [['Fee Head', 'Base Amount', 'Discount', 'Net Amount']],
    body: tableData,
    foot: [
      [
        { content: 'TOTAL PAID', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
        {
          content: `₹${(payment.amount || 0).toLocaleString('en-IN')}`,
          styles: { fontStyle: 'bold', textColor: [5, 150, 105] },
        },
      ],
    ],
    ...TABLE_STYLES,
    footStyles: {
      fillColor: [209, 250, 229],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 10,
    },
    margin: { left: 12, right: 12 },
  });

  const finalY: number = (doc as any).lastAutoTable.finalY;

  // Remarks
  if (payment.remarks) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text(`Remarks: ${payment.remarks}`, 12, finalY + 8);
  }

  addFooter(doc);
  doc.save(`Receipt_${payment.receiptNumber}.pdf`);
};
