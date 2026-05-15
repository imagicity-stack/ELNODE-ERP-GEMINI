import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Salary } from '../types';
import { getSchoolSettings } from '../services/settingsService';

const NAVY: [number, number, number] = [26, 45, 80];
const GOLD: [number, number, number] = [180, 145, 45];
const WHITE: [number, number, number] = [255, 255, 255];
const DARK: [number, number, number] = [15, 23, 42];
const LIGHT: [number, number, number] = [245, 248, 252];
const SLATE: [number, number, number] = [100, 116, 139];
const GREEN: [number, number, number] = [5, 150, 105];
const RED: [number, number, number] = [220, 38, 38];

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
  if (rupees === 0) return 'Zero Rupees Only';
  let out = '';
  if (rupees >= 10000000) out += h(Math.floor(rupees / 10000000)) + 'Crore ';
  if (rupees % 10000000 >= 100000) out += h(Math.floor((rupees % 10000000) / 100000)) + 'Lakh ';
  if (rupees % 100000 >= 1000) out += h(Math.floor((rupees % 100000) / 1000)) + 'Thousand ';
  out += h(rupees % 1000);
  return out.trim() + ' Rupees Only';
}

async function fetchLogo(): Promise<string | null> {
  try {
    const res = await fetch('/logo high res tp-01.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    const imgURL = URL.createObjectURL(blob);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 150;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(imgURL);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(imgURL); resolve(null); };
      img.src = imgURL;
    });
  } catch { return null; }
}

function drawHeader(pdf: jsPDF, logo: string | null, PW: number, ML: number, MR: number): number {
  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(0.8); pdf.line(ML, 8, PW - MR, 8);
  pdf.setLineWidth(0.2); pdf.line(ML, 10, PW - MR, 10);

  if (logo) {
    try { pdf.addImage(logo, 'JPEG', ML, 13, 22, 22); } catch { /* skip */ }
  } else {
    pdf.setFillColor(...NAVY);
    pdf.roundedRect(ML, 13, 22, 22, 2, 2, 'F');
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...WHITE);
    pdf.text('EH', ML + 11, 26, { align: 'center' });
  }

  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY);
  pdf.text('SALARY SLIP', PW - MR, 19, { align: 'right' });
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...SLATE);
  pdf.text('OFFICIAL DOCUMENT', PW - MR, 24, { align: 'right' });

  pdf.setFontSize(17); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY);
  pdf.text('THE ELDEN HEIGHTS SCHOOL', PW / 2, 19, { align: 'center' });

  pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(...GOLD);
  pdf.text('Towards Eternal Glory', PW / 2, 25, { align: 'center' });

  pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...SLATE);
  pdf.text(
    'Hazaribagh, Jharkhand · 825301   ·   +91 9431904333 / 9288483677   ·   contact@eldenheights.org   ·   eldenheights.org',
    PW / 2, 31, { align: 'center' },
  );

  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(0.2); pdf.line(ML, 35, PW - MR, 35);
  pdf.setLineWidth(0.8); pdf.line(ML, 37, PW - MR, 37);

  return 46;
}

export async function generatePayrollSlip(salary: Salary): Promise<void> {
  const [logo, schoolSettings] = await Promise.all([fetchLogo(), getSchoolSettings()]);
  const academicYear = schoolSettings.academicYear || '2026-27';

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const PW = pdf.internal.pageSize.width;
  const PH = pdf.internal.pageSize.height;
  const ML = 12, MR = 12;
  const CW = PW - ML - MR;

  let y = drawHeader(pdf, logo, PW, ML, MR);

  // ── TITLE ────────────────────────────────────────────────────────────────────
  const titleText = 'EMPLOYEE SALARY SLIP';
  const titleW = pdf.getTextWidth(titleText) * (13 / 10);
  const titleX = PW / 2;
  pdf.setDrawColor(...NAVY); pdf.setLineWidth(0.4);
  pdf.line(ML, y + 0.5, titleX - titleW / 2 - 4, y + 0.5);
  pdf.line(titleX + titleW / 2 + 4, y + 0.5, PW - MR, y + 0.5);
  pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...DARK);
  pdf.text(titleText, PW / 2, y, { align: 'center' });

  y += 5;
  const monthLabel = new Date(salary.month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase();
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...SLATE);
  pdf.text(`PAY PERIOD: ${monthLabel}   ·   ACADEMIC SESSION ${academicYear}`, PW / 2, y, { align: 'center' });
  y += 6;

  // ── EMPLOYEE DETAILS ─────────────────────────────────────────────────────────
  const boxW = (CW - 4) / 3;
  const metaFields = [
    { label: 'EMPLOYEE NAME', value: salary.employeeName },
    { label: 'DESIGNATION',   value: salary.employeeRole },
    { label: 'PAY MONTH',     value: monthLabel },
  ];
  metaFields.forEach((f, i) => {
    const bx = ML + i * (boxW + 2);
    pdf.setFillColor(...LIGHT);
    pdf.rect(bx, y, boxW, 14, 'F');
    pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...SLATE);
    pdf.text(f.label, bx + 3, y + 5);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...DARK);
    const maxW = boxW - 6;
    const val = pdf.splitTextToSize(f.value, maxW)[0] || f.value;
    pdf.text(val, bx + 3, y + 11);
  });
  y += 18;

  // ── EARNINGS TABLE ───────────────────────────────────────────────────────────
  const earningsRows = [
    ['Basic / Monthly Salary', `₹ ${(salary.baseAmount || 0).toLocaleString('en-IN')}`],
    ['Incentives / Allowances', `₹ ${(salary.allowances || 0).toLocaleString('en-IN')}`],
  ];
  const totalEarnings = (salary.baseAmount || 0) + (salary.allowances || 0);

  const deductionsList: [string, number][] = [
    ['EPF / Provident Fund', salary.deductions?.pf || 0],
    ['Professional Tax / TDS', salary.deductions?.tax || 0],
    ['Leave Deduction', salary.deductions?.leaveDeduction || 0],
    ['Other Deductions', salary.deductions?.other || 0],
  ].filter(([, amt]) => amt > 0) as [string, number][];

  const totalDeductions = deductionsList.reduce((s, [, a]) => s + a, 0);

  const maxRows = Math.max(earningsRows.length, deductionsList.length);
  const tableBody: any[][] = [];
  for (let i = 0; i < maxRows; i++) {
    tableBody.push([
      earningsRows[i]?.[0] ?? '',
      earningsRows[i]?.[1] ?? '',
      deductionsList[i]?.[0] ?? '',
      deductionsList[i] ? `₹ ${deductionsList[i][1].toLocaleString('en-IN')}` : '',
    ]);
  }

  autoTable(pdf, {
    startY: y,
    head: [['EARNINGS', 'AMOUNT', 'DEDUCTIONS', 'AMOUNT']],
    body: tableBody,
    foot: [[
      { content: 'GROSS EARNINGS', styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT as any, textColor: DARK as any } },
      { content: `₹ ${totalEarnings.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT as any, textColor: DARK as any } },
      { content: 'TOTAL DEDUCTIONS', styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT as any, textColor: RED as any } },
      { content: `₹ ${totalDeductions.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT as any, textColor: RED as any } },
    ]],
    headStyles: { fillColor: NAVY as any, textColor: WHITE as any, fontStyle: 'bold', fontSize: 8.5, cellPadding: 3.5 },
    bodyStyles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: LIGHT as any },
    footStyles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: (CW / 2 - 10) },
      1: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
      2: { cellWidth: (CW / 2 - 10) },
      3: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
    },
    theme: 'grid',
    tableLineColor: [200, 210, 225] as any,
    tableLineWidth: 0.15,
    margin: { left: ML, right: MR },
  });

  y = (pdf as any).lastAutoTable.finalY + 4;

  // ── NET PAY BANNER ───────────────────────────────────────────────────────────
  pdf.setFillColor(...NAVY);
  pdf.rect(ML, y, CW, 18, 'F');
  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...WHITE);
  pdf.text('NET PAY (TAKE HOME)', ML + 4, y + 7);
  pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...GOLD);
  pdf.text(`₹ ${(salary.netAmount || 0).toLocaleString('en-IN')}`, PW - MR - 4, y + 12, { align: 'right' });
  y += 22;

  // ── AMOUNT IN WORDS ──────────────────────────────────────────────────────────
  pdf.setFillColor(...LIGHT);
  pdf.rect(ML, y, CW, 14, 'F');
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...SLATE);
  pdf.text('NET AMOUNT IN WORDS', ML + 3, y + 5);
  pdf.setFontSize(9); pdf.setFont('helvetica', 'bolditalic'); pdf.setTextColor(...DARK);
  pdf.text(toWords(salary.netAmount || 0), ML + 3, y + 11);
  y += 18;

  // ── PAYMENT HISTORY ──────────────────────────────────────────────────────────
  const history = salary.paymentHistory || [];
  if (history.length > 0) {
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...DARK);
    pdf.text('PAYMENT HISTORY', ML, y);
    pdf.setDrawColor(...SLATE); pdf.setLineWidth(0.2);
    pdf.line(ML, y + 1.5, PW - MR, y + 1.5);
    y += 6;

    autoTable(pdf, {
      startY: y,
      head: [['DATE', 'AMOUNT PAID', 'METHOD', 'TRANSACTION ID', 'STATUS']],
      body: history.map(h => [
        new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        `₹ ${h.amount.toLocaleString('en-IN')}`,
        (h.method || '').replace(/_/g, ' ').toUpperCase(),
        h.transactionId || '-',
        'PAID',
      ]),
      headStyles: { fillColor: NAVY as any, textColor: WHITE as any, fontStyle: 'bold', fontSize: 8, cellPadding: 3 },
      bodyStyles: { fontSize: 8.5, cellPadding: 3 },
      alternateRowStyles: { fillColor: LIGHT as any },
      columnStyles: {
        1: { halign: 'right', fontStyle: 'bold' },
        4: { textColor: GREEN as any, fontStyle: 'bold' },
      },
      theme: 'grid',
      tableLineColor: [200, 210, 225] as any,
      tableLineWidth: 0.15,
      margin: { left: ML, right: MR },
    });

    y = (pdf as any).lastAutoTable.finalY + 6;
  } else {
    // Payment status box when no history
    pdf.setFillColor(255, 251, 235);
    pdf.rect(ML, y, CW, 14, 'F');
    pdf.setDrawColor(251, 191, 36);
    pdf.setLineWidth(0.3);
    pdf.rect(ML, y, CW, 14);
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(180, 120, 0);
    pdf.text('PAYMENT STATUS: PENDING — No disbursements recorded for this month.', ML + 4, y + 8.5);
    y += 18;
  }

  // ── REMARKS ──────────────────────────────────────────────────────────────────
  if (salary.remarks) {
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...SLATE);
    pdf.text(`Remarks: ${salary.remarks}`, ML, y);
    y += 7;
  }

  // ── SIGNATORY ────────────────────────────────────────────────────────────────
  const sigY = y + 4;
  const sigX = PW - MR - 62;
  pdf.setDrawColor(...SLATE); pdf.setLineWidth(0.3);
  pdf.rect(sigX, sigY, 62, 30);
  pdf.line(sigX, sigY + 20, sigX + 62, sigY + 20);
  pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...DARK);
  pdf.text('AUTHORISED SIGNATORY', sigX + 31, sigY + 14, { align: 'center' });
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...SLATE);
  pdf.text('Accounts & Finance Office', sigX + 31, sigY + 26, { align: 'center' });

  // ── FOOTER ───────────────────────────────────────────────────────────────────
  const footY = PH - 14;
  pdf.setDrawColor(...NAVY); pdf.setLineWidth(0.2); pdf.line(ML, footY - 2, PW - MR, footY - 2);
  pdf.setLineWidth(0.6); pdf.line(ML, footY, PW - MR, footY);

  pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...NAVY);
  pdf.text('EHS  ·  THE ELDEN HEIGHTS SCHOOL', ML, footY + 4);

  pdf.setFont('helvetica', 'italic'); pdf.setTextColor(...GOLD);
  pdf.text('Thank you for your dedicated service', PW / 2, footY + 4, { align: 'center' });

  pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...SLATE);
  pdf.text('System Generated  ·  Page 1 of 1', PW - MR, footY + 4, { align: 'right' });

  pdf.setFontSize(6.5); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(...SLATE);
  pdf.text('A unit of Bhagwati Educational And Charitable Trust', PW / 2, footY + 9, { align: 'center' });

  const fileName = `PaySlip_${salary.employeeName.replace(/\s+/g, '_')}_${salary.month}.pdf`;
  pdf.save(fileName);
}
