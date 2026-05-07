import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FeePayment, FeeRequest, Student } from '../types';

const NAVY: [number, number, number] = [26, 45, 80];
const GOLD: [number, number, number] = [180, 145, 45];
const WHITE: [number, number, number] = [255, 255, 255];
const DARK: [number, number, number] = [15, 23, 42];
const LIGHT: [number, number, number] = [245, 248, 252];
const SLATE: [number, number, number] = [100, 116, 139];
const GREEN: [number, number, number] = [5, 150, 105];

// ── Number to Indian words ────────────────────────────────────────────────────
function toWords(n: number): string {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const h = (num: number): string => {
    if (num === 0) return '';
    if (num < 20) return ones[num] + ' ';
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '') + ' ';
    return ones[Math.floor(num / 100)] + ' Hundred ' + h(num % 100);
  };
  const rupees = Math.floor(n);
  const paise  = Math.round((n - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  let out = '';
  if (rupees >= 10000000) out += h(Math.floor(rupees / 10000000)) + 'Crore ';
  if (rupees % 10000000 >= 100000) out += h(Math.floor((rupees % 10000000) / 100000)) + 'Lakh ';
  if (rupees % 100000  >= 1000)    out += h(Math.floor((rupees % 100000) / 1000)) + 'Thousand ';
  out += h(rupees % 1000);
  out = out.trim() + ' Rupees';
  if (paise > 0) out += ' and ' + h(paise).trim() + ' Paise';
  return out + ' Only';
}

async function fetchLogo(): Promise<string | null> {
  try {
    const res = await fetch('/logo high res tp-01.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror  = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export const generateFeeReceipt = async (
  payment: FeePayment,
  request: FeeRequest,
  student: Student,
): Promise<void> => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PW = doc.internal.pageSize.width;
  const PH = doc.internal.pageSize.height;
  const ML = 12, MR = 12; // margins
  const CW = PW - ML - MR; // content width
  const logo = await fetchLogo();

  // ── HEADER ──────────────────────────────────────────────────────────────────
  // Double top rule
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.8); doc.line(ML, 8, PW - MR, 8);
  doc.setLineWidth(0.2); doc.line(ML, 10, PW - MR, 10);

  // Logo (top-left)
  if (logo) {
    try { doc.addImage(logo, 'PNG', ML, 13, 22, 22); } catch { /* skip */ }
  } else {
    // fallback EH initials box
    doc.setFillColor(...NAVY);
    doc.roundedRect(ML, 13, 22, 22, 2, 2, 'F');
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE);
    doc.text('EH', ML + 11, 26, { align: 'center' });
  }

  // "FEE RECEIPT" badge (top-right)
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.5);
  doc.rect(PW - MR - 28, 13, 28, 16);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('FEE',     PW - MR - 14, 21, { align: 'center' });
  doc.text('RECEIPT', PW - MR - 14, 26, { align: 'center' });

  // School name
  doc.setFontSize(17); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('THE ELDEN HEIGHTS SCHOOL', PW / 2, 19, { align: 'center' });

  // Tagline
  doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(...GOLD);
  doc.text('WHERE LEGACY MEETS TOMORROW', PW / 2, 25, { align: 'center' });

  // Address
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  doc.text(
    'Hazaribagh, Jharkhand · 825301 · India   ·   +91 XXXXX XXXXX   ·   accounts@eldenheights.in   ·   www.eldenheights.in',
    PW / 2, 31, { align: 'center' },
  );

  // Double bottom rule
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.2); doc.line(ML, 35, PW - MR, 35);
  doc.setLineWidth(0.8); doc.line(ML, 37, PW - MR, 37);

  // ── TITLE ───────────────────────────────────────────────────────────────────
  let y = 46;
  const titleText = 'OFFICIAL FEE RECEIPT';
  const titleW = doc.getTextWidth(titleText) * (13 / 10);
  const titleX = PW / 2;

  doc.setDrawColor(...NAVY); doc.setLineWidth(0.4);
  doc.line(ML, y + 0.5,     titleX - titleW / 2 - 4, y + 0.5);
  doc.line(titleX + titleW / 2 + 4, y + 0.5, PW - MR, y + 0.5);

  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
  doc.text(titleText, PW / 2, y, { align: 'center' });

  y += 5;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  doc.text(`ACADEMIC SESSION ${request.academicYear || new Date().getFullYear() + '-' + (new Date().getFullYear() + 1).toString().slice(2)}`, PW / 2, y, { align: 'center' });

  y += 6;

  // ── RECEIPT META — 3 boxes ───────────────────────────────────────────────────
  const boxW = (CW - 4) / 3;
  const metaFields = [
    { label: 'RECEIPT NO.',    value: payment.receiptNumber },
    { label: 'DATE OF ISSUE',  value: new Date(payment.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) },
    { label: 'TERM / QUARTER', value: request.month || '-' },
  ];
  metaFields.forEach((f, i) => {
    const bx = ML + i * (boxW + 2);
    doc.setFillColor(...LIGHT);
    doc.rect(bx, y, boxW, 14, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
    doc.text(f.label, bx + 3, y + 5);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
    doc.text(f.value, bx + 3, y + 11);
  });
  y += 18;

  // ── STUDENT PARTICULARS ──────────────────────────────────────────────────────
  const sectionHeader = (label: string) => {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
    doc.text(label, ML, y);
    doc.setDrawColor(...SLATE); doc.setLineWidth(0.2);
    doc.line(ML, y + 1.5, PW - MR, y + 1.5);
    y += 6;
  };

  sectionHeader('STUDENT PARTICULARS');

  const half = CW / 2;
  const studentRows: [string, string, string, string][] = [
    ['Student Name',   student.name,                                     'Admission No.',  student.admissionNumber || student.schoolNumber || '-'],
    ['Class & Section', `Class ${student.classId} - ${student.section}`, "Father's Name",  student.parentDetails?.fatherName || '-'],
    ['Contact No.',    student.parentDetails?.phone || '-',               'Academic Year',  request.academicYear || '-'],
  ];

  studentRows.forEach(([l1, v1, l2, v2]) => {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
    doc.text(l1, ML + 2, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
    doc.text(v1, ML + 38, y);

    doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
    doc.text(l2, ML + half + 2, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
    doc.text(v2, ML + half + 38, y);
    y += 7;
  });
  y += 2;

  // ── FEE PARTICULARS TABLE ────────────────────────────────────────────────────
  sectionHeader('FEE PARTICULARS');

  const subTotal   = request.heads.reduce((s, h) => s + (h.finalAmount ?? h.amount ?? 0), 0);
  const discount   = request.waivedAmount || 0;
  const lateFee    = request.fineAmount || 0;
  const grandTotal = subTotal - discount + lateFee;

  const tableRows = request.heads.map((head, i) => [
    String(i + 1).padStart(2, '0'),
    head.name,
    request.month || 'Annual',
    (head.finalAmount ?? head.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['S.NO.', 'PARTICULARS', 'PERIOD', 'AMOUNT (INR)']],
    body: tableRows,
    foot: [
      [{ content: '', colSpan: 2, styles: { fillColor: WHITE as any, lineWidth: 0 } },
       { content: 'Sub Total',              styles: { halign: 'right', fontStyle: 'bold', fillColor: LIGHT as any, textColor: DARK as any } },
       { content: `Rs. ${subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,  styles: { halign: 'right', fontStyle: 'bold', fillColor: LIGHT as any, textColor: DARK as any } }],
      [{ content: '', colSpan: 2, styles: { fillColor: WHITE as any, lineWidth: 0 } },
       { content: 'Discount / Concession',  styles: { halign: 'right', fillColor: WHITE as any, textColor: SLATE as any } },
       { content: `Rs. ${discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,  styles: { halign: 'right', fillColor: WHITE as any, textColor: SLATE as any } }],
      [{ content: '', colSpan: 2, styles: { fillColor: WHITE as any, lineWidth: 0 } },
       { content: 'Late Fee',               styles: { halign: 'right', fillColor: WHITE as any, textColor: SLATE as any } },
       { content: `Rs. ${lateFee.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,   styles: { halign: 'right', fillColor: WHITE as any, textColor: SLATE as any } }],
      [{ content: 'GRAND TOTAL', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: NAVY as any, textColor: WHITE as any, fontSize: 10 } },
       { content: `Rs. ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, styles: { fontStyle: 'bold', halign: 'right', fillColor: NAVY as any, textColor: WHITE as any, fontSize: 10 } }],
    ],
    headStyles: { fillColor: NAVY as any, textColor: WHITE as any, fontStyle: 'bold', fontSize: 8.5, cellPadding: 3.5 },
    bodyStyles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: LIGHT as any },
    footStyles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 16 },
      2: { halign: 'center', cellWidth: 36 },
      3: { halign: 'right',  cellWidth: 40, fontStyle: 'bold' },
    },
    theme: 'grid',
    tableLineColor: [200, 210, 225] as any,
    tableLineWidth: 0.15,
    margin: { left: ML, right: MR },
  });

  y = (doc as any).lastAutoTable.finalY + 5;

  // ── AMOUNT IN WORDS ──────────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT);
  doc.rect(ML, y, CW, 16, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  doc.text('AMOUNT RECEIVED (IN WORDS)', ML + 3, y + 5.5);
  doc.setFontSize(9.5); doc.setFont('helvetica', 'bolditalic'); doc.setTextColor(...DARK);
  doc.text(toWords(grandTotal), ML + 3, y + 12);
  y += 20;

  // ── PAYMENT INFORMATION ──────────────────────────────────────────────────────
  sectionHeader('PAYMENT INFORMATION');

  const payRows: [string, string, boolean?][] = [
    ['Payment Mode',   payment.method.toUpperCase().replace(/_/g, ' / ')],
    ['Transaction ID', payment.transactionId || payment.referenceNumber || 'N/A'],
    ['Status',         'PAID & VERIFIED', true],
    ['Received By',    'Accounts Department'],
  ];
  const payStartY = y;
  payRows.forEach(([label, value, green], i) => {
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
    doc.text(label, ML + 2, y + i * 7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(green ? GREEN : DARK));
    doc.text(value, ML + 40, y + i * 7);
  });

  // Authorised Signatory box
  const sigX = PW - MR - 60, sigY = payStartY - 3, sigH = 32;
  doc.setDrawColor(...SLATE); doc.setLineWidth(0.3);
  doc.rect(sigX, sigY, 60, sigH);
  doc.setLineWidth(0.3);
  doc.line(sigX, sigY + sigH - 10, sigX + 60, sigY + sigH - 10);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
  doc.text('AUTHORISED', sigX + 30, sigY + 14, { align: 'center' });
  doc.text('SIGNATORY',  sigX + 30, sigY + 20, { align: 'center' });
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  doc.text('Accounts & Finance Office', sigX + 30, sigY + 27, { align: 'center' });

  y = payStartY + payRows.length * 7 + 4;

  // ── IMPORTANT NOTES ──────────────────────────────────────────────────────────
  doc.setDrawColor(...SLATE); doc.setLineWidth(0.25);
  const noteText = 'This receipt is computer-generated and valid without a physical signature when accompanied by the official school seal. Please retain this receipt for the entire academic session for reference and tax purposes. Fees once paid are non-refundable except as per the school\'s official refund policy. For any discrepancy, kindly contact the Accounts Office within 7 working days of receipt issuance.';
  const noteLines = doc.splitTextToSize(noteText, CW - 8);
  const noteH = noteLines.length * 4.2 + 12;
  doc.rect(ML, y, CW, noteH);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
  doc.text('IMPORTANT NOTES', ML + 4, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE); doc.setFontSize(7);
  doc.text(noteLines, ML + 4, y + 11.5);
  y += noteH + 4;

  // ── FOOTER ───────────────────────────────────────────────────────────────────
  const footY = PH - 10;
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.2); doc.line(ML, footY - 4, PW - MR, footY - 4);
  doc.setLineWidth(0.6); doc.line(ML, footY - 2, PW - MR, footY - 2);

  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text('EHS  ·  THE ELDEN HEIGHTS SCHOOL', ML, footY + 2);

  doc.setFont('helvetica', 'italic'); doc.setTextColor(...GOLD);
  doc.text('Thank you for being part of our legacy', PW / 2, footY + 2, { align: 'center' });

  doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE);
  doc.text('Page 1 of 1  ·  System Generated', PW - MR, footY + 2, { align: 'right' });

  doc.save(`Receipt_${payment.receiptNumber}.pdf`);
};
