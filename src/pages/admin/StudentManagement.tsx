import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { createUserWithEmailAndPassword, getAuth, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, getApp } from 'firebase/app';
import { db, auth, storage, firebaseConfig, handleFirestoreError, OperationType } from '../../firebase';
import { Student, UserProfile, Class, House } from '../../types';
import { logActivity } from '../../services/activityService';
import { SCHOOL_DOMAIN } from '../../constants';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Plus,
  Edit2,
  Trash2,
  Download,
  UserPlus,
  Phone,
  FileText,
  Activity,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { usePermissions } from '../../hooks/usePermissions';
import {
  PageHeader, Card, Badge, Button, IconButton, Modal, SearchInput,
  FormField, Input, Select, Textarea, Table, Thead, Th, Tbody, Tr, Td,
  EmptyState, Avatar,
} from '../../components/ui';

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
  const [filterClass, setFilterClass] = useState('All Classes');

  const { isReadOnly } = usePermissions(user.role);
  const readOnly = isReadOnly('students');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    schoolNumber: '',
    admissionNumber: '',
    classId: '',
    section: '',
    fatherName: '',
    motherName: '',
    phone: '',
    email: '',
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
  }, []);

  const getClassName = (id: string) => {
    const cls = classes.find(c => c.id === id);
    return cls ? `Class ${cls.name}` : id;
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
        houseId: formData.houseId,
        photoURL: formData.photoURL,
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

      // Create Parent Auth Account
      const parentUidFromAuth = await getOrCreateUser(parentEmail);
      
      // 1. Check if parent already exists (by phone or email)
      const parentsQuery = query(
        collection(db, 'users'), 
        where('role', '==', 'parent'),
        where('email', '==', parentEmail)
      );
      const parentDocs = await getDocs(parentsQuery);
      
      let parentUid = parentUidFromAuth;
      let isNewParent = true;

      if (!parentDocs.empty) {
        parentUid = parentDocs.docs[0].id;
        isNewParent = false;
      }

      // 2. Save Student Document
      const studentRef = await addDoc(collection(db, 'students'), {
        ...studentData,
        schoolNumber: schoolNumber,
        admissionNumber: admissionNumber,
        parentId: parentUid,
        feeStatus: 'pending',
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
          name: `Parent of ${formData.name}`,
          role: 'parent',
          schoolNumber: schoolNumber, // Base school number for login
          studentIds: [studentRef.id],
          phone: formData.phone,
          address: formData.address,
          createdAt: new Date().toISOString(),
        });
      } else {
        // Update existing parent with new student ID
        const existingData = parentDocs.docs[0].data() as UserProfile;
        await setDoc(doc(db, 'users', parentUid), {
          ...existingData,
          studentIds: [...(existingData.studentIds || []), studentRef.id]
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
        alert('Firebase Error: Email/Password sign-in is not enabled in your Firebase Console. Please go to Authentication > Sign-in method and enable Email/Password.');
      } else {
        alert('Error creating student: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
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
      fatherName: student.parentDetails?.fatherName || '',
      motherName: student.parentDetails?.motherName || '',
      phone: student.parentDetails?.phone || '',
      email: student.parentDetails?.email || '',
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
    const doc = new jsPDF() as any;
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235); // Blue-600
    doc.text("ELDEN HEIGHTS SCHOOL", pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setTextColor(107, 114, 128); // Gray-500
    doc.text("Complete Student Record", pageWidth / 2, 28, { align: 'center' });
    
    // Basic Info
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text("BASIC INFORMATION", 20, 45);
    doc.line(20, 47, 190, 47);
    
    const basicInfo = [
      ["Name", student.name],
      ["Admission / School No.", student.admissionNumber],
      ["Class & Section", `${student.classId} - ${student.section}`],
      ["House", student.houseId || "N/A"],
      ["Fee Status", student.feeStatus.toUpperCase()]
    ];
    
    autoTable(doc, {
      startY: 50,
      head: [['Field', 'Value']],
      body: basicInfo,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }
    });
    
    // Parent Info
    const finalY = (doc as any).lastAutoTable.finalY;
    doc.text("PARENT INFORMATION", 20, finalY + 15);
    doc.line(20, finalY + 17, 190, finalY + 17);
    
    const parentInfo = [
      ["Father's Name", student.parentDetails?.fatherName || "N/A"],
      ["Mother's Name", student.parentDetails?.motherName || "N/A"],
      ["Phone Number", student.parentDetails?.phone || "N/A"],
      ["Email Address", student.parentDetails?.email || "N/A"]
    ];
    
    autoTable(doc, {
      startY: finalY + 20,
      head: [['Field', 'Value']],
      body: parentInfo,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }
    });
    
    // Additional Details
    const finalY2 = (doc as any).lastAutoTable.finalY;
    doc.text("ADDITIONAL DETAILS", 20, finalY2 + 15);
    doc.line(20, finalY2 + 17, 190, finalY2 + 17);
    
    const additionalInfo = [
      ["Transport", student.transportDetails || "None"],
      ["Medical Notes", student.medicalNotes || "None"],
      ["Academic History", student.academicHistory || "None"]
    ];
    
    autoTable(doc, {
      startY: finalY2 + 20,
      head: [['Field', 'Value']],
      body: additionalInfo,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }
    });

    // Fetch related data (Fees, Attendance, etc.)
    // Note: This is a simplified version. In a real app, you'd fetch all collections.
    const feeQuery = query(collection(db, 'fees'), where('studentId', '==', student.id));
    const feeDocs = await getDocs(feeQuery);
    if (!feeDocs.empty) {
      const finalY3 = (doc as any).lastAutoTable.finalY;
      doc.text("FEE HISTORY", 20, finalY3 + 15);
      doc.line(20, finalY3 + 17, 190, finalY3 + 17);
      
        const feeData = feeDocs.docs.map(d => {
          const data = d.data();
          return [data.id || d.id, data.status.toUpperCase(), `$${(data.structure?.reduce((acc: number, curr: any) => acc + (curr.amount || 0), 0) || 0).toLocaleString()}`];
        });
      
      autoTable(doc, {
        startY: finalY3 + 20,
        head: [['Receipt ID', 'Status', 'Total Amount']],
        body: feeData,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] }
      });
    }

    doc.save(`student_record_${student.schoolNumber}.pdf`);
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
      alert("An error occurred while deleting student data.");
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         s.admissionNumber.includes(searchTerm) ||
                         s.schoolNumber.includes(searchTerm);
    const matchesClass = filterClass === 'All Classes' || s.classId === filterClass;
    return matchesSearch && matchesClass;
  });

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingStudent(null);
    setFormData({ name: '', schoolNumber: '', admissionNumber: '', classId: '', section: '', fatherName: '', motherName: '', phone: '', email: '', transportDetails: '', medicalNotes: '', academicHistory: '', houseId: '', address: '', photoURL: '' });
    setIsModalOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    try {
      const storageRef = ref(storage, `profiles/${formData.schoolNumber || 'temp'}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setFormData(prev => ({ ...prev, photoURL: url }));
    } catch (err) {
      console.error('Error uploading photo:', err);
      alert('Failed to upload photo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Management"
        subtitle={`${filteredStudents.length} students`}
        icon={Users}
        iconColor="gradient-indigo"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={Download}>Export</Button>
            {!readOnly && <Button size="sm" icon={UserPlus} onClick={openAddModal}>Add Student</Button>}
          </>
        }
      />

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by name or admission number..."
            className="flex-1"
          />
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          >
            <option value="All Classes">All Classes</option>
            {classes.map(cls => <option key={cls.id} value={cls.id}>Class {cls.name}</option>)}
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <Table>
          <Thead>
            <tr>
              <Th>Student</Th>
              <Th className="hidden sm:table-cell">Admission / School No.</Th>
              <Th className="hidden md:table-cell">Class & Section</Th>
              <Th className="hidden lg:table-cell">Parent Details</Th>
              <Th>Fee Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {filteredStudents.length > 0 ? filteredStudents.map((student) => (
              <Tr key={student.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={student.name} src={student.photoURL} size="sm" />
                    <div>
                      <span className="font-semibold text-slate-900 block">{student.name}</span>
                      <span className="text-[10px] text-slate-400 sm:hidden">{student.admissionNumber}</span>
                      <span className="text-[10px] text-slate-400 md:hidden block">Class {student.classId}</span>
                    </div>
                  </div>
                </Td>
                <Td className="hidden sm:table-cell"><span className="font-mono text-slate-600">{student.admissionNumber}</span></Td>
                <Td className="hidden md:table-cell text-slate-600">{getClassName(student.classId)} {student.section && `- ${student.section}`}</Td>
                <Td className="hidden lg:table-cell">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-slate-900">{student.parentDetails?.fatherName || 'N/A'}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Phone className="w-3 h-3" />{student.parentDetails?.phone || 'N/A'}
                    </p>
                  </div>
                </Td>
                <Td>
                  <Badge variant={student.feeStatus === 'paid' ? 'success' : student.feeStatus === 'pending' ? 'warning' : 'error'} dot>
                    {student.feeStatus}
                  </Badge>
                </Td>
                <Td>
                  {!readOnly && (
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Edit2} variant="ghost" size="sm" onClick={() => handleEdit(student)} title="Edit" />
                      <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => { setDeletingStudent(student); setIsDeleteModalOpen(true); }} title="Delete" />
                    </div>
                  )}
                </Td>
              </Tr>
            )) : (
              <Tr>
                <td colSpan={6}>
                  <EmptyState icon={Users} title="No students found" description="Try adjusting your search or filter" />
                </td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Card>

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
                <FormField label="House" className="col-span-2">
                  <Select value={formData.houseId} onChange={e => setFormData({...formData, houseId: e.target.value})}>
                    <option value="">Select House (optional)</option>
                    {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </Select>
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
                  <FormField label="Email" required>
                    <Input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
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
                <FormField label="Transport Details">
                  <Textarea rows={2} value={formData.transportDetails} onChange={e => setFormData({...formData, transportDetails: e.target.value})} />
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
    </div>
  );
}
