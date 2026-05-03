import { useState, useEffect } from 'react';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

      // Fetch results for this student
      const q = query(collection(db, 'examResults'), where('studentId', '==', student.id));
      const resultSnapshot = await getDocs(q);
      setResults(resultSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamResult)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'exams/subjects/examResults');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = (result: ExamResult, exam: Exam) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(30, 58, 138);
    doc.text('ELDEN HEIGHTS ACADEMY', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text('Academic Progress Report', 105, 28, { align: 'center' });

    // Student Info
    doc.setDrawColor(200);
    doc.line(20, 35, 190, 35);

    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Student Name: ${student.name}`, 20, 45);
    doc.text(`Class: ${student.classId} - ${student.section}`, 20, 52);
    doc.text(`Admission No: ${student.admissionNumber}`, 20, 59);
    doc.text(`Exam: ${exam.name} (${exam.term})`, 120, 45);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 120, 52);

    const tableData = result.subjectResults.map((res: any) => {
      const subject = subjects.find(s => s.id === res.subjectId);
      return [
        subject?.name || 'Unknown',
        res.maxMarks,
        res.marksObtained,
        res.grade,
        res.marksObtained >= 40 ? 'Pass' : 'Fail'
      ];
    });

    autoTable(doc, {
      startY: 70,
      head: [['Subject', 'Max Marks', 'Marks Obtained', 'Grade', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Marks: ${result.totalMarks} / ${result.subjectResults.length * 100}`, 20, finalY);
    doc.text(`Percentage: ${result.percentage.toFixed(2)}%`, 20, finalY + 10);
    doc.text(`Overall Grade: ${result.overallGrade}`, 120, finalY);

    doc.save(`${student.name}_${exam.name}_Report.pdf`);
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
                        <p className="text-xs text-slate-500 font-medium">{exam.term} • Published on {new Date(result.updatedAt).toLocaleDateString()}</p>
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
