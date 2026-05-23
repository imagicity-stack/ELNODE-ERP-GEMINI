import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, doc, setDoc, deleteDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { createUserWithEmailAndPassword, getAuth, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, getApp } from 'firebase/app';
import { db, auth, storage, firebaseConfig, handleFirestoreError, OperationType } from '../../firebase';
import { Student, UserProfile, Class, House } from '../../types';
import { logActivity } from '../../services/activityService';
import { SCHOOL_DOMAIN } from '../../constants';
import { createPdf, addFooter, drawInfoBox, TABLE_STYLES } from '../../lib/pdfTemplate';
import { savePdf, saveText } from '../../lib/download';
import {
  Plus,
  Edit2,
  Trash2,
  Download,
  Upload,
  UserPlus,
  Phone,
  FileText,
  Activity,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileDown,
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronRight,
  Mail,
  MapPin,
  Home as HomeIcon,
  Bus,
  Heart,
  GraduationCap,
  Hash,
  Check,
  ImageIcon,
  Filter as FilterIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { usePermissions } from '../../hooks/usePermissions';
import {
  PageHeader, Card, Badge, Button, IconButton, Modal, SearchInput,
  FormField, Input, Select, Textarea, Table, Thead, Th, Tbody, Tr, Td,
  EmptyState, Avatar,
} from '../../components/ui';
import { useToast } from '../../components/Toast';
import { StaggeredList } from '../../components/animations';

export default function StudentManagement({ user }: { user: UserProfile }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // ─── Advanced filters (multi-select arrays + presence tri-state) ────────────
  type TriState = 'any' | 'yes' | 'no';
  const [filterClass, setFilterClass] = useState<string[]>([]);
  const [filterSection, setFilterSection] = useState<string[]>([]);
  const [filterHouse, setFilterHouse] = useState<string[]>([]);
  const [filterGender, setFilterGender] = useState<string[]>([]);
  const [filterTransport, setFilterTransport] = useState<string[]>([]);
  const [filterPhoto, setFilterPhoto] = useState<TriState>('any');
  const [filterMedical, setFilterMedical] = useState<TriState>('any');
  const [filterAcademic, setFilterAcademic] = useState<TriState>('any');
  const [filterAddress, setFilterAddress] = useState<TriState>('any');
  const [filterStudentEmail, setFilterStudentEmail] = useState<TriState>('any');
  const [filterParentEmail, setFilterParentEmail] = useState<TriState>('any');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  // ─── Export modal state ─────────────────────────────────────────────────────
  const ALL_EXPORT_COLUMNS = [
    { key: 'name', label: 'Name' },
    { key: 'admissionNumber', label: 'Admission Number' },
    { key: 'schoolNumber', label: 'School Number' },
    { key: 'class', label: 'Class' },
    { key: 'section', label: 'Section' },
    { key: 'gender', label: 'Gender' },
    { key: 'house', label: 'House' },
    { key: 'fatherName', label: 'Father Name' },
    { key: 'motherName', label: 'Mother Name' },
    { key: 'phone', label: 'Parent Phone' },
    { key: 'parentEmail', label: 'Parent Email' },
    { key: 'studentEmail', label: 'Student Email' },
    { key: 'transport', label: 'Transport' },
    { key: 'address', label: 'Address' },
    { key: 'medicalNotes', label: 'Medical Notes' },
    { key: 'academicHistory', label: 'Academic History' },
  ] as const;
  type ExportColKey = typeof ALL_EXPORT_COLUMNS[number]['key'];
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'filtered' | 'all'>('filtered');
  const [exportCols, setExportCols] = useState<Record<ExportColKey, boolean>>(
    Object.fromEntries(ALL_EXPORT_COLUMNS.map(c => [c.key, true])) as Record<ExportColKey, boolean>
  );

  const toggleArrayValue = (arr: string[], value: string): string[] =>
    arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('students');
  const { showToast } = useToast();

  // Bulk import state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [importResults, setImportResults] = useState<{ name: string; status: 'ok' | 'error'; message?: string }[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    schoolNumber: '',
    admissionNumber: '',
    classId: '',
    section: '',
    gender: '',
    fatherName: '',
    motherName: '',
    phone: '',
    email: '',
    studentEmail: '',
    transportDetails: '',
    medicalNotes: '',
    academicHistory: '',
    houseId: '',
    address: '',
    photoURL: '',
  });

  const fetchData = async () => {
    try {
      const [studentSnapshot, classSnapshot, houseSnapshot] = await Promise.all([
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'classes')),
        getDocs(collection(db, 'houses'))
      ]);

      setStudents(studentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
      setClasses(classSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class)));
      setHouses(houseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as House)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'students/classes/houses');
    }
  };

  const fetchStudents = fetchData;

  useEffect(() => {
    fetchData();
    // Real-time class list so newly added classes appear instantly in dropdowns/filters
    const unsubClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
    });
    return () => unsubClasses();
  }, []);

  const getClassName = (id: string) => {
    const cls = classes.find(c => c.id === id);
    return cls ? `Class ${cls.name}` : id;
  };

  const getHouseName = (id?: string) => {
    if (!id) return '';
    return houses.find(h => h.id === id)?.name || '';
  };

  const generateSchoolNumber = () => {
    // Randomizer removed as requested. Returning empty string to force manual entry or handle elsewhere.
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const studentData = {
        name: formData.name,
        schoolNumber: formData.schoolNumber,
        admissionNumber: formData.admissionNumber,
        classId: formData.classId,
        section: formData.section,
        gender: formData.gender,
        houseId: formData.houseId,
        photoURL: formData.photoURL,
        email: formData.studentEmail,
        transportDetails: formData.transportDetails,
        medicalNotes: formData.medicalNotes,
        academicHistory: formData.academicHistory,
        parentDetails: {
          fatherName: formData.fatherName,
          motherName: formData.motherName,
          phone: formData.phone,
          email: formData.email,
        }
      };

      if (isEditMode && editingStudent) {
        // Update existing student
        await setDoc(doc(db, 'students', editingStudent.id), {
          ...studentData,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        // Update student user profile
        const studentQuery = query(collection(db, 'users'), where('schoolNumber', '==', editingStudent.schoolNumber), where('role', '==', 'student'));
        const studentDocs = await getDocs(studentQuery);
        if (!studentDocs.empty) {
          await setDoc(doc(db, 'users', studentDocs.docs[0].id), {
            name: formData.name,
            classId: formData.classId,
            section: formData.section,
            photoURL: formData.photoURL,
          }, { merge: true });
        }
        
        await logActivity(
          user,
          'UPDATE_STUDENT',
          'Students',
          `Updated student profile for ${formData.name} (${formData.schoolNumber})`
        );

        setIsModalOpen(false);
        setIsEditMode(false);
        setEditingStudent(null);
        fetchStudents();
        return;
      }

      const schoolNumber = formData.admissionNumber || formData.schoolNumber;
      if (!schoolNumber) {
        throw new Error('Admission / School Number is required.');
      }
      const admissionNumber = schoolNumber;
      const studentEmail = `${schoolNumber}@${SCHOOL_DOMAIN}`;
      const parentEmail = `p${schoolNumber}@${SCHOOL_DOMAIN}`;
      const defaultPassword = 'password123';
      
      // Initialize secondary app for user creation without signing out admin
      let secondaryApp;
      try {
        secondaryApp = getApp('Secondary');
      } catch (e) {
        secondaryApp = initializeApp(firebaseConfig, 'Secondary');
      }
      const secondaryAuth = getAuth(secondaryApp);

      const getOrCreateUser = async (email: string) => {
        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, email, defaultPassword);
          const uid = cred.user.uid;
          await signOut(secondaryAuth);
          return uid;
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
            try {
              const cred = await signInWithEmailAndPassword(secondaryAuth, email, defaultPassword);
              const uid = cred.user.uid;
              await signOut(secondaryAuth);
              return uid;
            } catch (signInErr: any) {
              if (signInErr.code === 'auth/invalid-credential' || signInErr.code === 'auth/wrong-password') {
                throw new Error(`The email ${email} is already in use with a different password. Please contact support to reset it.`);
              }
              throw signInErr;
            }
          }
          throw err;
        }
      };

      // Create Student Auth Account
      const studentUid = await getOrCreateUser(studentEmail);

      // Look up existing parent by phone number (multi-child families share one login)
      const normalizePhone = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
      const normalizedPhone = normalizePhone(formData.phone);

      const allParentsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'parent')));
      const existingParentDoc = normalizedPhone
        ? allParentsSnap.docs.find(d => normalizePhone((d.data() as any).phone || '') === normalizedPhone)
        : undefined;

      let parentUid: string;
      let isNewParent: boolean;
      let existingParentData: UserProfile | null = null;

      if (existingParentDoc) {
        parentUid = existingParentDoc.id;
        existingParentData = existingParentDoc.data() as UserProfile;
        isNewParent = false;
      } else {
        parentUid = await getOrCreateUser(parentEmail);
        isNewParent = true;
      }

      // 2. Save Student Document
      const studentRef = await addDoc(collection(db, 'students'), {
        ...studentData,
        schoolNumber: schoolNumber,
        admissionNumber: admissionNumber,
        parentId: parentUid,
        // feeStatus intentionally omitted — set only when a fee request is created
        createdAt: new Date().toISOString(),
      });

      // 3. Create/Update User Profiles
      // Student User
      await setDoc(doc(db, 'users', studentUid), {
        uid: studentUid,
        email: studentEmail,
        name: formData.name,
        role: 'student',
        schoolNumber: schoolNumber,
        classId: formData.classId,
        section: formData.section,
        parentId: parentUid,
        studentId: studentRef.id, // Linked student record ID
        photoURL: formData.photoURL,
        createdAt: new Date().toISOString(),
      });

      // Parent User
      if (isNewParent) {
        await setDoc(doc(db, 'users', parentUid), {
          uid: parentUid,
          email: parentEmail,
          name: formData.fatherName?.trim() || formData.motherName?.trim() || `Parent of ${formData.name}`,
          role: 'parent',
          schoolNumber: schoolNumber, // Base school number for login
          studentIds: [studentRef.id],
          phone: formData.phone,
          address: formData.address,
          createdAt: new Date().toISOString(),
        });
      } else {
        // Update existing parent with new student ID
        await setDoc(doc(db, 'users', parentUid), {
          ...(existingParentData || {}),
          studentIds: [...((existingParentData?.studentIds) || []), studentRef.id]
        }, { merge: true });
      }

      setIsModalOpen(false);
      fetchStudents();
      
      await logActivity(
        user,
        'ADMIT_STUDENT',
        'Students',
        `Admitted new student ${formData.name} (${schoolNumber})`
      );
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        showToast('Email/Password sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.', 'error');
      } else {
        showToast('Error creating student: ' + (err.message || 'Unknown error'), 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Bulk import helpers ──────────────────────────────────────────────────

  const CSV_HEADERS = [
    'name', 'admissionNumber', 'class', 'section', 'gender',
    'fatherName', 'motherName', 'phone', 'email',
    'studentEmail', 'house', 'transport', 'medicalNotes', 'academicHistory', 'address',
  ];

  const getColumnValue = (s: Student, col: ExportColKey): string => {
    switch (col) {
      case 'name':            return s.name || '';
      case 'admissionNumber': return s.admissionNumber || '';
      case 'schoolNumber':    return s.schoolNumber || '';
      case 'class':           return classes.find(c => c.id === s.classId)?.name || '';
      case 'section':         return s.section || '';
      case 'gender':          return s.gender || '';
      case 'house':           return houses.find(h => h.id === s.houseId)?.name || '';
      case 'fatherName':      return s.parentDetails?.fatherName || '';
      case 'motherName':      return s.parentDetails?.motherName || '';
      case 'phone':           return s.parentDetails?.phone || '';
      case 'parentEmail':     return s.parentDetails?.email || '';
      case 'studentEmail':    return (s as any).email || '';
      case 'transport':       return s.transportDetails || '';
      case 'address':         return (s as any).address || '';
      case 'medicalNotes':    return s.medicalNotes || '';
      case 'academicHistory': return s.academicHistory || '';
      default:                return '';
    }
  };

  const handleExportCSV = async () => {
    const selectedCols = ALL_EXPORT_COLUMNS.filter(c => exportCols[c.key]);
    if (selectedCols.length === 0) {
      showToast('Select at least one column to export', 'error');
      return;
    }
    const sourceRows = exportScope === 'filtered' ? filteredStudents : students;
    const headers = selectedCols.map(c => c.label);
    const rows = sourceRows.map(s => selectedCols.map(c => getColumnValue(s, c.key)));
    const lines = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ];
    const suffix = exportScope === 'filtered' && activeFilterCount > 0 ? '_filtered' : '_all';
    await saveText(lines.join('\n'), `students${suffix}_${new Date().toISOString().slice(0, 10)}.csv`);
    setExportModalOpen(false);
    showToast(`Exported ${sourceRows.length} student${sourceRows.length !== 1 ? 's' : ''}`, 'success');
  };

  const handleDownloadTemplate = async () => {
    const exampleRows = [
      ['Ravi Kumar', '1001', '5', 'A', 'male', 'Suresh Kumar', 'Priya Kumar', '9876543210', 'parent@example.com', 'ravi@example.com', 'Red House', 'School', '', '', '123 Main Street'],
      ['Anita Sharma', '1002', '3', 'B', 'female', 'Ramesh Sharma', 'Sunita Sharma', '9123456789', 'sharma@example.com', '', '', 'Private', '', '', ''],
    ];
    const lines = [CSV_HEADERS.join(','), ...exampleRows.map(r => r.map(v => `"${v}"`).join(','))];
    await saveText(lines.join('\n'), 'student_import_template.csv');
  };

  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.trim().split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    return lines.slice(1).map(line => {
      // Handle quoted fields with commas
      const values: string[] = [];
      let cur = '', inQuote = false;
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) { values.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      values.push(cur.trim());
      return Object.fromEntries(headers.map((h, i) => [h, (values[i] || '').replace(/^"|"$/g, '').trim()]));
    });
  };

  const handleCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      const errors: string[] = [];
      rows.forEach((row, i) => {
        const rowNum = i + 2;
        if (!row.name) errors.push(`Row ${rowNum}: name is required`);
        if (!row.admissionnumber) errors.push(`Row ${rowNum}: admissionNumber is required`);
        if (!row.class) errors.push(`Row ${rowNum}: class is required`);
        if (!row.section) errors.push(`Row ${rowNum}: section is required`);
        if (row.gender && !['male', 'female', 'other'].includes(row.gender.toLowerCase())) errors.push(`Row ${rowNum}: gender must be male/female/other (or left blank)`);
        if (!row.fathername) errors.push(`Row ${rowNum}: fatherName is required`);
        if (!row.mothername) errors.push(`Row ${rowNum}: motherName is required`);
        if (!row.phone) errors.push(`Row ${rowNum}: phone is required`);
      });
      setImportRows(rows);
      setImportErrors(errors);
      setImportProgress(null);
      setImportResults([]);
    };
    reader.readAsText(file);
  };

  const handleBulkImport = async () => {
    if (importRows.length === 0 || importErrors.length > 0) return;

    let secondaryApp;
    try { secondaryApp = getApp('Secondary'); }
    catch (e) { secondaryApp = initializeApp(firebaseConfig, 'Secondary'); }
    const secondaryAuth = getAuth(secondaryApp);

    const getOrCreateUser = async (email: string) => {
      const defaultPassword = 'password123';
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, defaultPassword);
        await signOut(secondaryAuth);
        return cred.user.uid;
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
          const cred = await signInWithEmailAndPassword(secondaryAuth, email, defaultPassword);
          await signOut(secondaryAuth);
          return cred.user.uid;
        }
        throw err;
      }
    };

    setImportProgress({ done: 0, total: importRows.length, failed: 0 });
    const results: { name: string; status: 'ok' | 'error'; message?: string }[] = [];
    let failed = 0;

    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i];
      const name = row.name;
      const admissionNumber = row.admissionnumber;
      const gender = row.gender?.toLowerCase();
      const houseObj = houses.find(h => h.name.toLowerCase() === (row.house || '').toLowerCase());
      const classObj = classes.find(c => c.name === row.class || c.name.toLowerCase() === row.class?.toLowerCase());

      try {
        if (!classObj) throw new Error(`Class "${row.class}" not found`);

        const schoolNumber = admissionNumber;
        const studentEmail = `${schoolNumber}@${SCHOOL_DOMAIN}`;
        const parentEmail = `p${schoolNumber}@${SCHOOL_DOMAIN}`;

        const studentUid = await getOrCreateUser(studentEmail);

        // Look up existing parent by phone (multi-child families share one login)
        const normalizePhone = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
        const normalizedPhone = normalizePhone(row.phone || '');
        const allParentsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'parent')));
        const existingParentDoc = normalizedPhone
          ? allParentsSnap.docs.find(d => normalizePhone((d.data() as any).phone || '') === normalizedPhone)
          : undefined;

        let parentUid: string;
        let isNewParent: boolean;
        let existingParentData: UserProfile | null = null;

        if (existingParentDoc) {
          parentUid = existingParentDoc.id;
          existingParentData = existingParentDoc.data() as UserProfile;
          isNewParent = false;
        } else {
          parentUid = await getOrCreateUser(parentEmail);
          isNewParent = true;
        }

        const studentRef = await addDoc(collection(db, 'students'), {
          name,
          schoolNumber,
          admissionNumber,
          classId: classObj.id,
          section: row.section,
          gender,
          houseId: houseObj?.id || '',
          email: (row.studentemail as string) || '',
          transportDetails: row.transport || row.transportdetails || '',
          medicalNotes: row.medicalnotes || '',
          academicHistory: row.academichistory || '',
          address: row.address || '',
          parentId: parentUid,
          // feeStatus intentionally omitted — set only when a fee request is created
          photoURL: '',
          parentDetails: {
            fatherName: row.fathername,
            motherName: row.mothername,
            phone: row.phone,
            email: row.email,
          },
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'users', studentUid), {
          uid: studentUid,
          email: studentEmail,
          name,
          role: 'student',
          schoolNumber,
          classId: classObj.id,
          section: row.section,
          parentId: parentUid,
          studentId: studentRef.id,
          photoURL: '',
          createdAt: new Date().toISOString(),
        });

        if (isNewParent) {
          await setDoc(doc(db, 'users', parentUid), {
            uid: parentUid,
            email: parentEmail,
            name: (row.fathername as string)?.trim() || (row.mothername as string)?.trim() || `Parent of ${name}`,
            role: 'parent',
            schoolNumber,
            studentIds: [studentRef.id],
            phone: row.phone,
            address: row.address || '',
            createdAt: new Date().toISOString(),
          });
        } else {
          await setDoc(doc(db, 'users', parentUid), {
            ...(existingParentData || {}),
            studentIds: [...((existingParentData?.studentIds) || []), studentRef.id],
          }, { merge: true });
        }

        results.push({ name, status: 'ok' });
      } catch (err: any) {
        failed++;
        results.push({ name: name || `Row ${i + 2}`, status: 'error', message: err.message || 'Unknown error' });
      }

      setImportProgress({ done: i + 1, total: importRows.length, failed });
      setImportResults([...results]);
    }

    fetchStudents();
    await logActivity(user, 'BULK_IMPORT_STUDENTS', 'Students', `Bulk imported ${importRows.length - failed}/${importRows.length} students`);
  };

  const handleEdit = (student: Student) => {
    setEditingStudent(student);
    setIsEditMode(true);
    
    // Find IDs if they were stored as names
    const classObj = classes.find(c => c.id === student.classId || c.name === student.classId);
    const houseObj = houses.find(h => h.id === student.houseId || h.name === student.houseId);

    setFormData({
      name: student.name,
      schoolNumber: student.schoolNumber,
      admissionNumber: student.admissionNumber,
      classId: classObj?.id || student.classId,
      section: student.section,
      gender: student.gender || '',
      fatherName: student.parentDetails?.fatherName || '',
      motherName: student.parentDetails?.motherName || '',
      phone: student.parentDetails?.phone || '',
      email: student.parentDetails?.email || '',
      studentEmail: (student as any).email || '',
      transportDetails: student.transportDetails || '',
      medicalNotes: student.medicalNotes || '',
      academicHistory: student.academicHistory || '',
      houseId: houseObj?.id || student.houseId || '',
      address: '',
      photoURL: student.photoURL || ''
    });
    setIsModalOpen(true);
  };

  const generateStudentPDF = async (student: Student) => {
    const { doc, contentY, pageWidth } = await createPdf(
      'Complete Student Record',
      `Generated on ${new Date().toLocaleDateString('en-IN')}`,
    );

    let y = contentY + 4;

    // Basic info
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text('BASIC INFORMATION', 12, y);
    y += 3;

    y = drawInfoBox(
      doc,
      [
        { label: 'Name', value: student.name },
        { label: 'Admission No', value: student.admissionNumber || '-' },
        { label: 'School No', value: student.schoolNumber || '-' },
        { label: 'Class & Section', value: `${getClassName(student.classId)} – ${student.section}` },
        { label: 'House', value: student.houseId || 'N/A' },
      ],
      y,
      pageWidth,
      2,
    );

    y += 6;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text('PARENT INFORMATION', 12, y);
    y += 3;

    y = drawInfoBox(
      doc,
      [
        { label: "Father's Name", value: student.parentDetails?.fatherName || 'N/A' },
        { label: "Mother's Name", value: student.parentDetails?.motherName || 'N/A' },
        { label: 'Phone', value: student.parentDetails?.phone || 'N/A' },
        { label: 'Email', value: student.parentDetails?.email || 'N/A' },
      ],
      y,
      pageWidth,
      2,
    );

    y += 6;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text('ADDITIONAL DETAILS', 12, y);
    y += 3;

    y = drawInfoBox(
      doc,
      [
        { label: 'Transport', value: student.transportDetails || 'None' },
        { label: 'Medical Notes', value: student.medicalNotes || 'None' },
        { label: 'Academic History', value: student.academicHistory || 'None' },
        { label: 'Gender', value: student.gender || 'N/A' },
      ],
      y,
      pageWidth,
      2,
    );

    y += 6;

    // Recent fee payments
    const paymentsSnap = await getDocs(
      query(collection(db, 'feePayments'), where('studentId', '==', student.id), orderBy('date', 'desc')),
    );

    if (!paymentsSnap.empty) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105);
      doc.text('PAYMENT HISTORY', 12, y);
      y += 3;

      const paymentData = paymentsSnap.docs.slice(0, 10).map((d) => {
        const p = d.data();
        return [
          p.receiptNumber || '-',
          p.date || '-',
          `₹${(p.amount || 0).toLocaleString('en-IN')}`,
          (p.method || 'N/A').replace('_', ' ').toUpperCase(),
          p.feeHead || '-',
        ];
      });

      (doc as any).autoTable({
        startY: y,
        head: [['Receipt No', 'Date', 'Amount', 'Method', 'Fee Head']],
        body: paymentData,
        ...TABLE_STYLES,
        margin: { left: 12, right: 12 },
      });
    }

    addFooter(doc);
    await savePdf(doc, `student_record_${student.schoolNumber || student.admissionNumber}.pdf`);
  };

  const performDelete = async (options: {
    deleteStudent: boolean;
    deleteParent: boolean;
    deleteEverything: boolean;
    downloadFirst: boolean;
  }) => {
    if (!deletingStudent) return;
    setLoading(true);
    
    try {
      if (options.downloadFirst) {
        await generateStudentPDF(deletingStudent);
      }

      // 1. Delete Student Document
      if (options.deleteStudent || options.deleteEverything) {
        await deleteDoc(doc(db, 'students', deletingStudent.id));
        
        await logActivity(
          user,
          'DELETE_STUDENT',
          'Super Admin',
          `Deleted student record for ${deletingStudent.name} (${deletingStudent.schoolNumber}). Options: ${JSON.stringify(options)}`
        );

        // Delete related data if everything
        if (options.deleteEverything) {
          const collectionsToDelete = ['fees', 'attendance', 'examResults'];
          for (const coll of collectionsToDelete) {
            const q = query(collection(db, coll), where('studentId', '==', deletingStudent.id));
            const snapshot = await getDocs(q);
            for (const d of snapshot.docs) {
              await deleteDoc(doc(db, coll, d.id));
            }
          }
        }
      }

      // 2. Delete User Profiles
      if ((options.deleteStudent || options.deleteEverything) && deletingStudent.schoolNumber) {
        const studentUserQuery = query(collection(db, 'users'), where('schoolNumber', '==', deletingStudent.schoolNumber), where('role', '==', 'student'));
        const studentUserDocs = await getDocs(studentUserQuery);
        for (const d of studentUserDocs.docs) {
          await deleteDoc(doc(db, 'users', d.id));
        }
      }

      if ((options.deleteParent || options.deleteEverything) && deletingStudent.parentId) {
        // Check if other students use this parent
        const otherStudentsQuery = query(collection(db, 'students'), where('parentId', '==', deletingStudent.parentId));
        const otherStudentsDocs = await getDocs(otherStudentsQuery);
        
        // If deleting everything, we don't care about other students unless we want to keep parent for them
        // But usually "delete parent" means delete that parent profile
        if (otherStudentsDocs.size <= 1 || options.deleteParent) {
          const parentUserQuery = query(collection(db, 'users'), where('uid', '==', deletingStudent.parentId));
          const parentUserDocs = await getDocs(parentUserQuery);
          for (const d of parentUserDocs.docs) {
            await deleteDoc(doc(db, 'users', d.id));
          }
        }
      }

      setIsDeleteModalOpen(false);
      setDeletingStudent(null);
      fetchStudents();
    } catch (error) {
      console.error("Error deleting student data:", error);
      showToast('An error occurred while deleting student data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const presenceFilters: TriState[] = [filterPhoto, filterMedical, filterAcademic, filterAddress, filterStudentEmail, filterParentEmail];
  const activeFilterCount =
    (filterClass.length ? 1 : 0) +
    (filterSection.length ? 1 : 0) +
    (filterHouse.length ? 1 : 0) +
    (filterGender.length ? 1 : 0) +
    (filterTransport.length ? 1 : 0) +
    presenceFilters.filter(p => p !== 'any').length;

  const clearFilters = () => {
    setFilterClass([]);
    setFilterSection([]);
    setFilterHouse([]);
    setFilterGender([]);
    setFilterTransport([]);
    setFilterPhoto('any');
    setFilterMedical('any');
    setFilterAcademic('any');
    setFilterAddress('any');
    setFilterStudentEmail('any');
    setFilterParentEmail('any');
  };

  // Sections available across the selected classes (or all unique sections if none selected)
  const availableSections = filterClass.length > 0
    ? Array.from(new Set(
        filterClass.flatMap(cid =>
          (classes.find(c => c.id === cid)?.sections.map(s => s.name || 'A')) ?? []
        )
      ))
    : Array.from(new Set(students.map(s => s.section).filter(Boolean)));

  const matchTri = (state: TriState, hasValue: boolean) =>
    state === 'any' || (state === 'yes' && hasValue) || (state === 'no' && !hasValue);

  const filteredStudents = students.filter(s => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q ||
      s.name.toLowerCase().includes(q) ||
      s.admissionNumber.includes(searchTerm) ||
      s.schoolNumber.includes(searchTerm) ||
      (s.parentDetails?.fatherName || '').toLowerCase().includes(q) ||
      (s.parentDetails?.motherName || '').toLowerCase().includes(q) ||
      (s.parentDetails?.phone || '').includes(searchTerm) ||
      (s.parentDetails?.email || '').toLowerCase().includes(q) ||
      ((s as any).email || '').toLowerCase().includes(q) ||
      ((s as any).address || '').toLowerCase().includes(q);

    const matchesClass     = filterClass.length === 0     || filterClass.includes(s.classId);
    const matchesSection   = filterSection.length === 0   || filterSection.includes(s.section || '');
    const matchesHouse     = filterHouse.length === 0     || filterHouse.includes(s.houseId || '');
    const matchesGender    = filterGender.length === 0    || filterGender.includes((s.gender || '').toLowerCase());
    const matchesTransport = filterTransport.length === 0 || filterTransport.includes(s.transportDetails || '');

    const matchesPhoto         = matchTri(filterPhoto,         Boolean(s.photoURL));
    const matchesMedical       = matchTri(filterMedical,       Boolean(s.medicalNotes && s.medicalNotes.trim()));
    const matchesAcademic      = matchTri(filterAcademic,      Boolean(s.academicHistory && s.academicHistory.trim()));
    const matchesAddress       = matchTri(filterAddress,       Boolean(((s as any).address || '').toString().trim()));
    const matchesStudentEmail  = matchTri(filterStudentEmail,  Boolean(((s as any).email || '').toString().trim()));
    const matchesParentEmail   = matchTri(filterParentEmail,   Boolean((s.parentDetails?.email || '').trim()));

    return matchesSearch && matchesClass && matchesSection && matchesHouse && matchesGender && matchesTransport
      && matchesPhoto && matchesMedical && matchesAcademic && matchesAddress && matchesStudentEmail && matchesParentEmail;
  });

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingStudent(null);
    setFormData({ name: '', schoolNumber: '', admissionNumber: '', classId: '', section: '', gender: '', fatherName: '', motherName: '', phone: '', email: '', studentEmail: '', transportDetails: '', medicalNotes: '', academicHistory: '', houseId: '', address: '', photoURL: '' });
    setIsModalOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be under 5MB', 'error');
      return;
    }

    setLoading(true);
    try {
      // Always upload under the admin's own uid so request.auth.uid == userId in storage rules.
      const adminUid = (user as any)?.uid;
      const studentFolder = editingStudent?.id || 'new';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageRef = ref(storage, `profiles/${adminUid}/students/${studentFolder}/${Date.now()}_${safeName}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setFormData(prev => ({ ...prev, photoURL: url }));
      showToast('Photo uploaded', 'success');
    } catch (err: any) {
      console.error('Error uploading photo:', err);
      const msg = err?.code === 'storage/unauthorized'
        ? 'Storage permission denied. Check Firebase Storage rules for the profiles/ path.'
        : (err?.message || 'Failed to upload photo');
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ─── Mobile UI ────────────────────────────────────────────────────── */}
      <div className="md:hidden -mx-4 -mt-4 pb-24 min-h-screen bg-slate-50">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-5 pb-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Students</h1>
          <p className="text-xs text-indigo-100 mt-0.5">{students.length} enrolled · {classes.length} classes</p>
          <div className="mt-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name or admission no..."
              className="w-full px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-sm text-white placeholder:text-white/60 focus:outline-none focus:bg-white/20"
            />
          </div>
        </div>

        <div className="px-4 pt-3 overflow-x-auto flex gap-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={clearFilters}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition-transform",
              activeFilterCount === 0 ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
            )}
          >
            All
          </button>
          {classes.map(cls => (
            <button
              key={cls.id}
              onClick={() => setFilterClass(toggleArrayValue(filterClass, cls.id))}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition-transform",
                filterClass.includes(cls.id) ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
              )}
            >
              Class {cls.name}
            </button>
          ))}
          {houses.map(h => (
            <button
              key={h.id}
              onClick={() => setFilterHouse(toggleArrayValue(filterHouse, h.id))}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition-transform",
                filterHouse.includes(h.id) ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
              )}
            >
              {h.name}
            </button>
          ))}
          {(['male', 'female'] as const).map(g => (
            <button
              key={g}
              onClick={() => setFilterGender(toggleArrayValue(filterGender, g))}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition-transform capitalize",
                filterGender.includes(g) ? 'bg-violet-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
              )}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="px-4 pt-4">
          {filteredStudents.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">No students found</p>
              <p className="text-xs text-slate-500 mt-1">Try adjusting filters or add a student</p>
            </div>
          ) : (
            <StaggeredList className="space-y-2.5">
              {filteredStudents.map((student) => (
                <button
                  key={student.id}
                  onClick={() => !readOnly && handleEdit(student)}
                  className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex items-center gap-3 active:scale-[0.98] transition-transform text-left"
                >
                  <Avatar name={student.name} src={student.photoURL} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{student.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                        {getClassName(student.classId)}{student.section ? ` - ${student.section}` : ''}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{student.admissionNumber}</span>
                    </div>
                  </div>
                </button>
              ))}
            </StaggeredList>
          )}
        </div>

        {!readOnly && (
          <button
            onClick={openAddModal}
            className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-40"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ─── Desktop UI (unchanged) ─────────────────────────────────────── */}
      <div className="hidden md:block space-y-6">
      <PageHeader
        title="Student Management"
        subtitle={`${filteredStudents.length} students`}
        icon={Users}
        iconColor="gradient-indigo"
        actions={
          <>
            <button
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 transition-all"
            >
              <Download className="w-4 h-4" />
              Export CSV
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-md">
                  {filteredStudents.length}
                </span>
              )}
            </button>
            {!readOnly && (
              <Button variant="secondary" size="sm" icon={Upload} onClick={() => { setImportRows([]); setImportErrors([]); setImportProgress(null); setImportResults([]); setImportModalOpen(true); }}>
                Import CSV
              </Button>
            )}
            {!readOnly && <Button size="sm" icon={UserPlus} onClick={openAddModal}>Add Student</Button>}
          </>
        }
      />

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-col gap-3">
          {/* Search + filter toggle row */}
          <div className="flex gap-3">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search name, admission no., parent…"
              className="flex-1"
            />
            <button
              onClick={() => setShowFilters(v => !v)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all',
                showFilters || activeFilterCount > 0
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
              )}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-white text-indigo-700 text-[10px] font-black flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Expanded filter panel — multi-select dropdowns + presence toggles */}
          {showFilters && (
            <div className="pt-3 border-t border-slate-100 space-y-4">
              {/* Multi-select dropdowns */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <MultiSelectDropdown
                  label="Classes"
                  options={classes.map(c => ({ value: c.id, label: `Class ${c.name}` }))}
                  selected={filterClass}
                  onChange={(next) => {
                    setFilterClass(next);
                    // prune sections that no longer exist for selected classes
                    if (next.length > 0) {
                      const valid = new Set(next.flatMap(cid => (classes.find(c => c.id === cid)?.sections.map(s => s.name || 'A')) ?? []));
                      setFilterSection(prev => prev.filter(s => valid.has(s)));
                    }
                  }}
                  color="indigo"
                />
                <MultiSelectDropdown
                  label="Sections"
                  options={availableSections.map(s => ({ value: s, label: `Section ${s}` }))}
                  selected={filterSection}
                  onChange={setFilterSection}
                  disabled={availableSections.length === 0}
                  color="indigo"
                />
                <MultiSelectDropdown
                  label="Houses"
                  options={houses.map(h => ({ value: h.id, label: h.name }))}
                  selected={filterHouse}
                  onChange={setFilterHouse}
                  color="amber"
                />
                <MultiSelectDropdown
                  label="Gender"
                  options={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                    { value: 'other', label: 'Other' },
                  ]}
                  selected={filterGender}
                  onChange={setFilterGender}
                  color="violet"
                />
                <MultiSelectDropdown
                  label="Transport"
                  options={[
                    { value: 'School', label: 'School' },
                    { value: 'Private', label: 'Private' },
                    { value: '', label: 'None' },
                  ]}
                  selected={filterTransport}
                  onChange={setFilterTransport}
                  color="emerald"
                />
              </div>

              {/* Presence filters */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Has Information</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <TriStateFilter label="Photo" icon={ImageIcon} value={filterPhoto} onChange={setFilterPhoto} />
                  <TriStateFilter label="Address" icon={MapPin} value={filterAddress} onChange={setFilterAddress} />
                  <TriStateFilter label="Medical Notes" icon={Heart} value={filterMedical} onChange={setFilterMedical} />
                  <TriStateFilter label="Academic History" icon={FileText} value={filterAcademic} onChange={setFilterAcademic} />
                  <TriStateFilter label="Student Email" icon={Mail} value={filterStudentEmail} onChange={setFilterStudentEmail} />
                  <TriStateFilter label="Parent Email" icon={Mail} value={filterParentEmail} onChange={setFilterParentEmail} />
                </div>
              </div>
            </div>
          )}

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {filterClass.map(cid => (
                <FilterChip key={cid} color="indigo" onRemove={() => setFilterClass(filterClass.filter(v => v !== cid))}>
                  Class {classes.find(c => c.id === cid)?.name}
                </FilterChip>
              ))}
              {filterSection.map(sec => (
                <FilterChip key={sec} color="indigo" onRemove={() => setFilterSection(filterSection.filter(v => v !== sec))}>
                  Section {sec}
                </FilterChip>
              ))}
              {filterHouse.map(hid => (
                <FilterChip key={hid} color="amber" onRemove={() => setFilterHouse(filterHouse.filter(v => v !== hid))}>
                  {houses.find(h => h.id === hid)?.name}
                </FilterChip>
              ))}
              {filterGender.map(g => (
                <FilterChip key={g} color="violet" onRemove={() => setFilterGender(filterGender.filter(v => v !== g))}>
                  <span className="capitalize">{g}</span>
                </FilterChip>
              ))}
              {filterTransport.map(t => (
                <FilterChip key={t} color="emerald" onRemove={() => setFilterTransport(filterTransport.filter(v => v !== t))}>
                  Transport: {t || 'None'}
                </FilterChip>
              ))}
              {filterPhoto !== 'any' && (
                <FilterChip color="slate" onRemove={() => setFilterPhoto('any')}>
                  {filterPhoto === 'yes' ? 'Has photo' : 'No photo'}
                </FilterChip>
              )}
              {filterAddress !== 'any' && (
                <FilterChip color="slate" onRemove={() => setFilterAddress('any')}>
                  {filterAddress === 'yes' ? 'Has address' : 'No address'}
                </FilterChip>
              )}
              {filterMedical !== 'any' && (
                <FilterChip color="slate" onRemove={() => setFilterMedical('any')}>
                  {filterMedical === 'yes' ? 'Has medical notes' : 'No medical notes'}
                </FilterChip>
              )}
              {filterAcademic !== 'any' && (
                <FilterChip color="slate" onRemove={() => setFilterAcademic('any')}>
                  {filterAcademic === 'yes' ? 'Has academic history' : 'No academic history'}
                </FilterChip>
              )}
              {filterStudentEmail !== 'any' && (
                <FilterChip color="slate" onRemove={() => setFilterStudentEmail('any')}>
                  {filterStudentEmail === 'yes' ? 'Has student email' : 'No student email'}
                </FilterChip>
              )}
              {filterParentEmail !== 'any' && (
                <FilterChip color="slate" onRemove={() => setFilterParentEmail('any')}>
                  {filterParentEmail === 'yes' ? 'Has parent email' : 'No parent email'}
                </FilterChip>
              )}
              <button
                onClick={clearFilters}
                className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
              >
                Clear all
              </button>
              <span className="ml-auto text-xs text-slate-400 font-medium">{filteredStudents.length} result{filteredStudents.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <Table>
          <Thead>
            <tr>
              <Th className="w-8"></Th>
              <Th>Student</Th>
              <Th className="hidden sm:table-cell">Admission / School No.</Th>
              <Th className="hidden md:table-cell">Class & Section</Th>
              <Th className="hidden md:table-cell">House</Th>
              <Th className="hidden lg:table-cell">Parent Details</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {filteredStudents.length > 0 ? filteredStudents.map((student) => {
              const isExpanded = expandedStudentId === student.id;
              const houseName = getHouseName(student.houseId);
              return (
              <React.Fragment key={student.id}>
                <Tr
                  className={cn(
                    'cursor-pointer transition-colors',
                    isExpanded ? 'bg-indigo-50/40' : 'hover:bg-slate-50'
                  )}
                  onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                >
                  <Td>
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-indigo-600" />
                      : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={student.name} src={student.photoURL} size="sm" />
                      <div>
                        <span className="font-semibold text-slate-900 block">{student.name}</span>
                        <span className="text-[10px] text-slate-400 sm:hidden">{student.admissionNumber}</span>
                        <span className="text-[10px] text-slate-400 md:hidden block">{getClassName(student.classId)}</span>
                      </div>
                    </div>
                  </Td>
                  <Td className="hidden sm:table-cell"><span className="font-mono text-slate-600">{student.admissionNumber}</span></Td>
                  <Td className="hidden md:table-cell text-slate-600">{getClassName(student.classId)} {student.section && `- ${student.section}`}</Td>
                  <Td className="hidden md:table-cell">
                    {houseName ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-semibold rounded-md border border-amber-100">
                        <HomeIcon className="w-3 h-3" />{houseName}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="hidden lg:table-cell">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-slate-900">{student.parentDetails?.fatherName || 'N/A'}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <Phone className="w-3 h-3" />{student.parentDetails?.phone || 'N/A'}
                      </p>
                    </div>
                  </Td>
                  <Td onClick={(e: any) => e.stopPropagation()}>
                    {!readOnly && (
                      <div className="flex items-center justify-end gap-1">
                        <IconButton icon={Edit2} variant="ghost" size="sm" onClick={() => handleEdit(student)} title="Edit" />
                        <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => { setDeletingStudent(student); setIsDeleteModalOpen(true); }} title="Delete" />
                      </div>
                    )}
                  </Td>
                </Tr>
                {isExpanded && (
                  <tr className="bg-slate-50/60">
                    <td colSpan={7} className="px-6 py-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {/* Student Identity */}
                        <div className="space-y-3">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Student</p>
                          <DetailRow icon={Hash} label="Admission No." value={student.admissionNumber} />
                          <DetailRow icon={Hash} label="School No." value={student.schoolNumber} />
                          <DetailRow icon={GraduationCap} label="Class & Section" value={`${getClassName(student.classId)}${student.section ? ` - ${student.section}` : ''}`} />
                          <DetailRow icon={HomeIcon} label="House" value={houseName || 'Not Assigned'} />
                          <DetailRow icon={Users} label="Gender" value={student.gender ? student.gender.charAt(0).toUpperCase() + student.gender.slice(1) : 'Not specified'} />
                          <DetailRow icon={Mail} label="Student Email" value={(student as any).email || '—'} />
                        </div>

                        {/* Parents */}
                        <div className="space-y-3">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Parents & Contact</p>
                          <DetailRow icon={UserPlus} label="Father" value={student.parentDetails?.fatherName || '—'} />
                          <DetailRow icon={UserPlus} label="Mother" value={student.parentDetails?.motherName || '—'} />
                          <DetailRow icon={Phone} label="Phone" value={student.parentDetails?.phone || '—'} />
                          <DetailRow icon={Mail} label="Parent Email" value={student.parentDetails?.email || '—'} />
                        </div>

                        {/* Additional */}
                        <div className="space-y-3">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Additional</p>
                          <DetailRow icon={Bus} label="Transport" value={student.transportDetails || '—'} />
                          <DetailRow icon={Heart} label="Medical Notes" value={student.medicalNotes || '—'} />
                          <DetailRow icon={FileText} label="Academic History" value={student.academicHistory || '—'} multiline />
                          <DetailRow icon={MapPin} label="Address" value={(student as any).address || '—'} multiline />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
              );
            }) : (
              <Tr>
                <td colSpan={7}>
                  <EmptyState icon={Users} title="No students found" description="Try adjusting your search or filter" />
                </td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Card>
      </div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setIsEditMode(false); setEditingStudent(null); }}
        title={isEditMode ? 'Edit Student Details' : 'New Student Admission'}
        subtitle={isEditMode ? 'Update student information' : 'Fill in all details to register a new student'}
        size="xl"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => { setIsModalOpen(false); setIsEditMode(false); setEditingStudent(null); }}>Cancel</Button>
            <Button form="student-form" loading={loading} icon={isEditMode ? Edit2 : UserPlus}>
              {isEditMode ? 'Update Student' : 'Register Student'}
            </Button>
          </div>
        }
      >
        <form id="student-form" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-3.5 h-3.5" /> Basic Information
              </p>
              
              <div className="flex items-center gap-6 mb-6">
                <div className="relative group">
                  <Avatar name={formData.name || 'S'} src={formData.photoURL} size="lg" className="w-20 h-20 shadow-lg" />
                  <label className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-lg shadow-md border border-slate-100 flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-all">
                    <Plus className="w-4 h-4 text-indigo-600" />
                    <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                  </label>
                </div>
                <div>
                   <p className="text-sm font-bold text-slate-900">Student Photo</p>
                   <p className="text-[10px] text-slate-400">Click the + to upload</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Full Name" required className="col-span-2">
                  <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Student's full name" />
                </FormField>
                <FormField label="Admission / School No." required className="col-span-2">
                  <Input required value={formData.admissionNumber} onChange={e => setFormData({...formData, admissionNumber: e.target.value, schoolNumber: e.target.value})} placeholder="e.g. 1234567" className="font-mono" />
                </FormField>
                <FormField label="Class" required>
                  <Select required value={formData.classId} onChange={e => setFormData({...formData, classId: e.target.value, section: ''})}>
                    <option value="">Select Class</option>
                    {classes.map(cls => <option key={cls.id} value={cls.id}>Class {cls.name}</option>)}
                  </Select>
                </FormField>
                <FormField label="Section" required>
                  <Select required value={formData.section} onChange={e => setFormData({...formData, section: e.target.value})} disabled={!formData.classId}>
                    <option value="">Section</option>
                    {classes.find(c => c.id === formData.classId)?.sections.map((sec, i) => (
                      <option key={i} value={sec.name || 'A'}>Section {sec.name || 'A'}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Gender">
                  <Select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}>
                    <option value="">Select Gender (optional)</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </Select>
                </FormField>
                <FormField label="House">
                  <Select value={formData.houseId} onChange={e => setFormData({...formData, houseId: e.target.value})}>
                    <option value="">Select House (optional)</option>
                    {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </Select>
                </FormField>
                <FormField label="Student Email" className="col-span-2">
                  <Input type="email" value={formData.studentEmail} onChange={e => setFormData({...formData, studentEmail: e.target.value})} placeholder="Optional" />
                </FormField>
              </div>
            </div>

            {/* Parent Info */}
            <div className="space-y-4">
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-3.5 h-3.5" /> Parent Information
              </p>
              <div className="space-y-3">
                <FormField label="Father's Name" required>
                  <Input required value={formData.fatherName} onChange={e => setFormData({...formData, fatherName: e.target.value})} />
                </FormField>
                <FormField label="Mother's Name" required>
                  <Input required value={formData.motherName} onChange={e => setFormData({...formData, motherName: e.target.value})} />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Phone" required>
                    <Input type="tel" required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </FormField>
                  <FormField label="Email">
                    <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="Optional" />
                  </FormField>
                </div>
              </div>
            </div>

            {/* Additional Details */}
            <div className="md:col-span-2 space-y-4">
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Additional Details
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField label="Transport">
                  <Select value={formData.transportDetails} onChange={e => setFormData({...formData, transportDetails: e.target.value})}>
                    <option value="">Select transport</option>
                    <option value="School">School</option>
                    <option value="Private">Private</option>
                  </Select>
                </FormField>
                <FormField label="Medical Notes">
                  <Textarea rows={2} value={formData.medicalNotes} onChange={e => setFormData({...formData, medicalNotes: e.target.value})} />
                </FormField>
                <FormField label="Academic History" className="md:col-span-2">
                  <Textarea rows={2} value={formData.academicHistory} onChange={e => setFormData({...formData, academicHistory: e.target.value})} />
                </FormField>
                <FormField label="Parent Address" className="md:col-span-2">
                  <Textarea rows={2} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                </FormField>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Bulk Import Students"
        subtitle="Upload a CSV file to add multiple students at once"
        size="xl"
        footer={
          <div className="flex items-center justify-between w-full gap-3">
            <Button variant="secondary" size="sm" icon={FileDown} onClick={handleDownloadTemplate}>
              Download Template
            </Button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setImportModalOpen(false)}>Cancel</Button>
              <Button
                icon={Upload}
                onClick={handleBulkImport}
                disabled={importRows.length === 0 || importErrors.length > 0 || !!importProgress}
                loading={!!importProgress && importProgress.done < importProgress.total}
              >
                Import {importRows.length > 0 ? `${importRows.length} Students` : ''}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* File drop zone */}
          {!importProgress && (
            <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group">
              <Upload className="w-8 h-8 text-slate-300 group-hover:text-indigo-400 mb-2 transition-colors" />
              <p className="text-sm font-semibold text-slate-500 group-hover:text-indigo-600">Click to upload CSV file</p>
              <p className="text-xs text-slate-400 mt-1">or drag and drop</p>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleCSVFile(e.target.files[0])}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) handleCSVFile(f); }}
              />
            </label>
          )}

          {/* Validation errors */}
          {importErrors.length > 0 && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 space-y-1.5 max-h-40 overflow-y-auto">
              <p className="text-xs font-bold text-rose-700 uppercase tracking-wide flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" /> {importErrors.length} validation error{importErrors.length > 1 ? 's' : ''}
              </p>
              {importErrors.map((e, i) => (
                <p key={i} className="text-xs text-rose-600">{e}</p>
              ))}
            </div>
          )}

          {/* Preview table */}
          {importRows.length > 0 && importErrors.length === 0 && !importProgress && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                Preview — {importRows.length} student{importRows.length > 1 ? 's' : ''} ready to import
              </p>
              <div className="border border-slate-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      {['Name', 'Adm. No.', 'Class', 'Sec.', 'Gender', 'Father', 'Phone'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {importRows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{row.admissionnumber}</td>
                        <td className="px-3 py-2 text-slate-600">{row.class}</td>
                        <td className="px-3 py-2 text-slate-600">{row.section}</td>
                        <td className="px-3 py-2 text-slate-600 capitalize">{row.gender}</td>
                        <td className="px-3 py-2 text-slate-600">{row.fathername}</td>
                        <td className="px-3 py-2 text-slate-600">{row.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress */}
          {importProgress && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">Importing… {importProgress.done} / {importProgress.total}</span>
                {importProgress.failed > 0 && <span className="text-rose-500 text-xs font-bold">{importProgress.failed} failed</span>}
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-2.5 bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
                />
              </div>

              {/* Per-row results */}
              {importResults.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {importResults.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${r.status === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {r.status === 'ok'
                        ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                      <span className="font-semibold">{r.name}</span>
                      {r.message && <span className="opacity-70">— {r.message}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Done summary */}
              {importProgress.done === importProgress.total && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-semibold ${importProgress.failed === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  <CheckCircle2 className="w-4 h-4" />
                  {importProgress.failed === 0
                    ? `All ${importProgress.total} students imported successfully!`
                    : `${importProgress.total - importProgress.failed} imported, ${importProgress.failed} failed — check errors above`}
                </div>
              )}
            </div>
          )}

          {/* How-to hint */}
          {!importProgress && importRows.length === 0 && (
            <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-500 space-y-1">
              <p className="font-bold text-slate-700">CSV format rules:</p>
              <p>• First row must be the header row exactly as in the template</p>
              <p>• <span className="font-semibold">Required:</span> name, admissionNumber, class, section, fatherName, motherName, phone, email</p>
              <p>• <span className="font-semibold">Optional:</span> gender, studentEmail, house, transport (School/Private), medicalNotes, academicHistory, address</p>
              <p>• <span className="font-semibold">class</span> must match an existing class name (e.g. "5", "10A")</p>
              <p>• <span className="font-semibold">gender</span> (if provided) must be male, female, or other</p>
              <p>• Download the template above for a ready-to-fill example</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Student Data"
        subtitle={`Select deletion scope for ${deletingStudent?.name}`}
        size="sm"
        footer={<div className="flex justify-end"><Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button></div>}
      >
        {deletingStudent && (
          <div className="space-y-3">
            <button onClick={() => performDelete({ deleteStudent: true, deleteParent: true, deleteEverything: true, downloadFirst: false })} disabled={loading}
              className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl transition-all group text-left">
              <div><p className="font-semibold text-slate-900 group-hover:text-red-700 text-sm">Delete Entire Database</p><p className="text-xs text-slate-400 mt-0.5">Student, parent, and all related records</p></div>
              <Trash2 className="w-4 h-4 text-slate-400 group-hover:text-red-500 shrink-0" />
            </button>
            <button onClick={() => performDelete({ deleteStudent: true, deleteParent: true, deleteEverything: true, downloadFirst: true })} disabled={loading}
              className="w-full flex items-center justify-between p-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all group text-left">
              <div><p className="font-semibold text-indigo-900 text-sm">Download & Delete Everything</p><p className="text-xs text-indigo-500 mt-0.5">Generates PDF record before deletion</p></div>
              <Download className="w-4 h-4 text-indigo-500 shrink-0" />
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => performDelete({ deleteStudent: true, deleteParent: false, deleteEverything: false, downloadFirst: false })} disabled={loading}
                className="p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-left transition-all">
                <p className="font-semibold text-slate-900 text-sm">Student Only</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Keep parent active</p>
              </button>
              <button onClick={() => performDelete({ deleteStudent: false, deleteParent: true, deleteEverything: false, downloadFirst: false })} disabled={loading}
                className="p-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-left transition-all">
                <p className="font-semibold text-slate-900 text-sm">Parent Only</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Keep student active</p>
              </button>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">These actions are permanent and cannot be undone.</p>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Export CSV Modal ──────────────────────────────────────────────── */}
      <Modal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Export Students to CSV"
        size="md"
      >
        <div className="space-y-5">
          {/* Scope selection */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Scope</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExportScope('filtered')}
                className={cn(
                  'p-3 rounded-xl border text-left transition-all',
                  exportScope === 'filtered'
                    ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                )}
              >
                <p className="text-sm font-bold text-slate-900">Current filter</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}</p>
              </button>
              <button
                type="button"
                onClick={() => setExportScope('all')}
                className={cn(
                  'p-3 rounded-xl border text-left transition-all',
                  exportScope === 'all'
                    ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                )}
              >
                <p className="text-sm font-bold text-slate-900">All students</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{students.length} student{students.length !== 1 ? 's' : ''}</p>
              </button>
            </div>
          </div>

          {/* Column selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Columns ({Object.values(exportCols).filter(Boolean).length}/{ALL_EXPORT_COLUMNS.length})</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setExportCols(Object.fromEntries(ALL_EXPORT_COLUMNS.map(c => [c.key, true])) as Record<ExportColKey, boolean>)}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setExportCols(Object.fromEntries(ALL_EXPORT_COLUMNS.map(c => [c.key, false])) as Record<ExportColKey, boolean>)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-rose-600"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
              {ALL_EXPORT_COLUMNS.map(col => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-white rounded-lg border border-slate-100 hover:border-indigo-200 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={exportCols[col.key]}
                    onChange={() => setExportCols(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="font-medium text-slate-700">{col.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setExportModalOpen(false)}>Cancel</Button>
            <Button size="sm" icon={FileDown} onClick={handleExportCSV}>
              Download CSV
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function DetailRow({ icon: Icon, label, value, multiline = false }: { icon: any; label: string; value: string; multiline?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`text-sm font-semibold text-slate-800 ${multiline ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────
type ChipColor = 'indigo' | 'amber' | 'violet' | 'emerald' | 'slate';

const colorRing: Record<ChipColor, string> = {
  indigo: 'ring-indigo-500/20 border-indigo-400',
  amber: 'ring-amber-500/20 border-amber-400',
  violet: 'ring-violet-500/20 border-violet-400',
  emerald: 'ring-emerald-500/20 border-emerald-400',
  slate: 'ring-slate-500/20 border-slate-400',
};

function MultiSelectDropdown({
  label, options, selected, onChange, disabled = false, color = 'indigo',
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  color?: ChipColor;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  const summary = selected.length === 0
    ? `All ${label}`
    : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label || selected[0])
      : `${selected.length} ${label} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-50 border rounded-xl text-sm text-left transition-all',
          'focus:outline-none focus:ring-2',
          selected.length > 0 ? cn('bg-white', colorRing[color]) : 'border-slate-200',
          disabled && 'opacity-40 cursor-not-allowed'
        )}
      >
        <span className={cn('truncate', selected.length === 0 ? 'text-slate-500' : 'text-slate-900 font-semibold')}>
          {summary}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1.5 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto py-1.5">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">No options available</div>
          ) : (
            <>
              <div className="px-3 py-1 flex items-center justify-between border-b border-slate-100 mb-1">
                <button
                  type="button"
                  onClick={() => onChange(options.map(o => o.value))}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] font-semibold text-slate-500 hover:text-rose-600"
                >
                  Clear
                </button>
              </div>
              {options.map(opt => {
                const isSelected = selected.includes(opt.value);
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => toggle(opt.value)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                      isSelected ? 'bg-indigo-50 text-indigo-900 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                      isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
                    )}>
                      {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tri-state presence filter ────────────────────────────────────────────────
function TriStateFilter({
  label, icon: Icon, value, onChange,
}: {
  label: string;
  icon: any;
  value: 'any' | 'yes' | 'no';
  onChange: (v: 'any' | 'yes' | 'no') => void;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
        <p className="text-[11px] font-semibold text-slate-600 truncate">{label}</p>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(['any', 'yes', 'no'] as const).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'px-1 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all',
              value === v
                ? v === 'yes' ? 'bg-emerald-600 text-white' : v === 'no' ? 'bg-rose-600 text-white' : 'bg-slate-700 text-white'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
            )}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────
function FilterChip({
  children, color, onRemove,
}: {
  children: React.ReactNode;
  color: ChipColor;
  onRemove: () => void;
}) {
  const colorClasses: Record<ChipColor, string> = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <span className={cn('flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full border', colorClasses[color])}>
      {children}
      <button onClick={onRemove} className="hover:opacity-70"><X className="w-3 h-3" /></button>
    </span>
  );
}
