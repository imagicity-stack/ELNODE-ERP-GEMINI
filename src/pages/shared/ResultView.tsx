import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Exam, ExamResult, Student, Subject } from '../../types';
import {
  FileText,
  Download,
  Award,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion } from 'motion/react';
import { createPdf, addFooter, drawInfoBox, TABLE_STYLES } from '../../lib/pdfTemplate';
import { savePdf } from '../../lib/download';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Spinner,
  EmptyState,
} from '../../components/ui';

interface ResultViewProps {
  student: Student;
}

export default function ResultView({ student }: ResultViewProps) {
  const { classesMap } = useData();
  const [results, setResults] = useState<ExamResult[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (student) {
      fetchData();
    }
  }, [student]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch exams
      const examSnapshot = await getDocs(collection(db, 'exams'));
      const examList = examSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam));
      setExams(examList);

      // Fetch subjects
      const subjectSnapshot = await getDocs(collection(db, 'subjects'));
      setSubjects(subjectSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject)));

      // Fetch results for this student — ONLY published ones are visible to students/parents.
      // (We do the filter client-side so we don't need a composite index, and so legacy results
      //  without an explicit `published` field aren't accidentally hidden if `examResults` had
      //  no migration. The default for old rows is `published === undefined` which is filtered.)
      const q = query(collection(db, 'examResults'), where('studentId', '==', student.id));
      const resultSnapshot = await getDocs(q);
      const all = resultSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamResult));
      setResults(all.filter(r => r.published === true));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'exams/subjects/examResults');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async (result: ExamResult, exam: Exam) => {
    const { doc, contentY, pageWidth } = await createPdf(
      'Academic Progress Report',
      `${exam.name} · ${exam.term}`,
    );

    let y = contentY + 4;

    y = drawInfoBox(
      doc,
      [
        { label: 'Student', value: student.name },
        { label: 'Admission No', value: student.admissionNumber || '-' },
        { label: 'Class', value: `${classesMap[student.classId] || student.classId} – ${student.section}` },
        { label: 'Date', value: new Date().toLocaleDateString('en-IN') },
      ],
      y,
      pageWidth,
      2,
    );

    y += 6;

    const tableData = result.subjectResults.map((res: any) => {
      const subject = subjects.find((s) => s.id === res.subjectId);
      const isAbsent = res.status === 'absent';
      const isExempt = res.status === 'exempt';
      const pct = res.maxMarks > 0 && !isAbsent && !isExempt
        ? ((res.marksObtained / res.maxMarks) * 100).toFixed(1) : '-';
      const status = isAbsent ? 'Absent' : isExempt ? 'Exempt' : (res.marksObtained >= (res.maxMarks * 0.4) ? 'Pass' : 'Fail');
      return [
        subject?.name || 'Unknown',
        res.maxMarks,
        isAbsent || isExempt ? '-' : res.marksObtained,
        pct === '-' ? '-' : `${pct}%`,
        res.grade,
        status,
      ];
    });

    (doc as any).autoTable({
      startY: y,
      head: [['Subject', 'Max Marks', 'Obtained', '%', 'Grade', 'Status']],
      body: tableData,
      ...TABLE_STYLES,
      columnStyles: {
        5: {
          fontStyle: 'bold',
          cellCallback: (cell: any, data: any) => {
            cell.styles.textColor = data.row.raw[5] === 'Pass' ? [5, 150, 105] : [220, 38, 38];
          },
        },
      },
      margin: { left: 12, right: 12 },
    });

    const finalY: number = (doc as any).lastAutoTable.finalY + 8;

    // Summary box
    doc.setFillColor(209, 250, 229);
    doc.roundedRect(12, finalY, pageWidth - 24, 22, 2, 2, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text(`Overall Grade: ${result.overallGrade}`, 20, finalY + 8);
    doc.text(`Percentage: ${result.percentage.toFixed(2)}%`, 20, finalY + 16);

    doc.setTextColor(15, 23, 42);
    doc.text(
      `Total: ${result.totalMarks} / ${result.subjectResults.reduce((s: number, r: any) => s + r.maxMarks, 0)}`,
      pageWidth - 20,
      finalY + 8,
      { align: 'right' },
    );
    doc.text(
      result.percentage >= 40 ? 'RESULT: PASS' : 'RESULT: FAIL',
      pageWidth - 20,
      finalY + 16,
      { align: 'right' },
    );

    addFooter(doc);
    await savePdf(doc, `${student.name}_${exam.name}_Report.pdf`);
  };

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Examination Results"
        subtitle="View and download academic performance reports"
        icon={Award}
        iconColor="gradient-violet"
      />

      {results.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Results Published"
          description="Examination results for the current term haven't been published yet."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {results.map((result) => {
            const exam = exams.find(e => e.id === result.examId);
            if (!exam) return null;

            return (
              <motion.div
                key={result.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 gradient-violet rounded-2xl flex items-center justify-center text-white">
                        <Award className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{exam.name}</h3>
                        <p className="text-xs text-slate-500 font-medium">{exam.term} • Published on {new Date(result.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Percentage</p>
                        <p className="text-xl font-bold text-violet-600">{result.percentage.toFixed(1)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Grade</p>
                        <p className="text-xl font-bold text-emerald-600">{result.overallGrade}</p>
                      </div>
                      <div className="text-center hidden sm:block">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                        <Badge variant={result.percentage >= 40 ? 'success' : 'error'}>
                          {result.percentage >= 40 ? 'Pass' : 'Fail'}
                        </Badge>
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      icon={Download}
                      onClick={() => generatePDF(result, exam)}
                    >
                      Download Report
                    </Button>
                  </div>

                  <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {result.subjectResults.map((res) => {
                      const subject = subjects.find(s => s.id === res.subjectId);
                      return (
                        <div key={res.subjectId} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-700">{subject?.name}</span>
                            <Badge variant={res.marksObtained >= 40 ? 'success' : 'error'}>
                              {res.grade}
                            </Badge>
                          </div>
                          <div className="flex items-end justify-between">
                            <p className="text-lg font-bold text-slate-900">{res.marksObtained}</p>
                            <p className="text-[10px] text-slate-400 font-medium">/ {res.maxMarks}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
