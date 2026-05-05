import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { FeePayment, FeeRequest, Student } from '../types';

export const generateFeeReceipt = (payment: FeePayment, request: FeeRequest, student: Student, className?: string) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // Header
  doc.setFontSize(20);
  doc.setTextColor(37, 99, 235); // blue-600
  doc.text('SCHOOL MANAGEMENT SYSTEM', pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setTextColor(107, 114, 128); // gray-500
  doc.text('FEE RECEIPT', pageWidth / 2, 30, { align: 'center' });

  // Receipt Info
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Receipt No: ${payment.receiptNumber}`, 20, 45);
  doc.text(`Date: ${payment.date}`, 20, 52);
  doc.text(`Transaction ID: ${payment.transactionId || payment.referenceNumber || 'N/A'}`, 20, 59);

  // Student Info
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Student Details', 20, 75);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Name: ${student.name}`, 20, 82);
  doc.text(`School No: ${student.schoolNumber}`, 20, 89);
  doc.text(`Class: ${className || student.classId} ${student.section ? `- ${student.section}` : ''}`, 20, 96);

  // Fee Details Table
  const tableData = request.heads.map(head => [
    head.name,
    `INR ${(head.amount || 0).toLocaleString()}`,
    `INR ${(head.discount || 0).toLocaleString()}`,
    `INR ${(head.finalAmount || 0).toLocaleString()}`
  ]);

  (doc as any).autoTable({
    startY: 110,
    head: [['Fee Head', 'Base Amount', 'Discount', 'Final Amount']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
    foot: [['Total', '', '', `INR ${(payment.amount || 0).toLocaleString()}`]],
    footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' }
  });

  // Footer
  const finalY = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(10);
  doc.text('Payment Method:', 20, finalY);
  doc.setFont('helvetica', 'bold');
  doc.text(payment.method.toUpperCase().replace('_', ' '), 55, finalY);
  
  doc.setFont('helvetica', 'normal');
  doc.text('Remarks:', 20, finalY + 7);
  doc.text(payment.remarks || 'None', 55, finalY + 7);

  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text('This is a computer-generated receipt and does not require a physical signature.', pageWidth / 2, 280, { align: 'center' });

  doc.save(`Receipt_${payment.receiptNumber}.pdf`);
};
