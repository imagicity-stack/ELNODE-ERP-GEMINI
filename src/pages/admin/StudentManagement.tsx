import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, getApp } from 'firebase/app';
import { db, auth, firebaseConfig, handleFirestoreError, OperationType } from '../../firebase';
import { Student, UserProfile, Class, House } from '../../types';
import { SCHOOL_DOMAIN } from '../../constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit2,
  Trash2,
  Download, 
  UserPlus,
  Mail,
  Phone,
  Calendar,
  MapPin,
  FileText,
  Activity,
  History,
  Home,
  X,
  Users
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function StudentManagement() {
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
          }, { merge: true });
        }
        
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
      setFormData({
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
      });
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
      address: '' // This might need to be fetched from the parent's profile if we want to edit it here
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Student Management</h1>
          <p className="text-gray-500 text-sm">Manage all student records and profiles.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button 
            onClick={() => {
              setIsEditMode(false);
              setEditingStudent(null);
              setFormData({
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
              });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Student
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by name or admission number..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="All Classes">All Classes</option>
            {classes.map(cls => (
              <option key={cls.id} value={cls.id}>Class {cls.name}</option>
            ))}
          </select>
          <button className="p-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Student Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b bg-gray-50/50">
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Admission / School No.</th>
                <th className="px-6 py-4">Class & Section</th>
                <th className="px-6 py-4">Parent Details</th>
                <th className="px-6 py-4">Fee Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredStudents.length > 0 ? filteredStudents.map((student) => (
                <tr key={student.id} className="group hover:bg-gray-50 transition-all">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{student.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-mono">{student.admissionNumber}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{getClassName(student.classId)} - {student.section}</td>
                  <td className="px-6 py-4">
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-gray-900">{student.parentDetails?.fatherName || 'N/A'}</p>
                      <p className="text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" /> {student.parentDetails?.phone || 'N/A'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      student.feeStatus === 'paid' ? "bg-emerald-50 text-emerald-600" : 
                      student.feeStatus === 'pending' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                    )}>
                      {student.feeStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleEdit(student)}
                        className="p-2 hover:bg-blue-50 rounded-lg text-blue-400 hover:text-blue-600 transition-all"
                        title="Edit Student"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => {
                          setDeletingStudent(student);
                          setIsDeleteModalOpen(true);
                        }}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-all"
                        title="Delete Options"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No student records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Student Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden relative z-10 flex flex-col"
            >
              <div className="p-6 border-b flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                    {isEditMode ? <Edit2 className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{isEditMode ? 'Edit Student Details' : 'New Student Admission'}</h2>
                    <p className="text-sm text-gray-500">{isEditMode ? 'Update the information for this student.' : 'Fill in all the details to register a new student.'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsEditMode(false);
                    setEditingStudent(null);
                  }} 
                  className="p-2 hover:bg-gray-200 rounded-full transition-all"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Basic Information */}
                  <div className="space-y-6">
                    <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                      <UserPlus className="w-4 h-4" /> Basic Information
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                          <input 
                            type="text" required
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Admission / School No.</label>
                          <input 
                            type="text" required
                            placeholder="Enter Admission Number"
                            value={formData.admissionNumber}
                            onChange={(e) => setFormData({...formData, admissionNumber: e.target.value, schoolNumber: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none font-mono"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                          <select 
                            required
                            value={formData.classId}
                            onChange={(e) => setFormData({...formData, classId: e.target.value, section: ''})}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                          >
                            <option value="">Select Class</option>
                            {classes.map(cls => (
                              <option key={cls.id} value={cls.id}>Class {cls.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                          <select 
                            required
                            value={formData.section}
                            onChange={(e) => setFormData({...formData, section: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                            disabled={!formData.classId}
                          >
                            <option value="">Select Section</option>
                            {classes.find(c => c.id === formData.classId)?.sections.map((sec, idx) => (
                              <option key={idx} value={sec.name || 'A'}>Section {sec.name || 'A'}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">House</label>
                        <select 
                          value={formData.houseId}
                          onChange={(e) => setFormData({...formData, houseId: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                        >
                          <option value="">Select House</option>
                          {houses.map(house => (
                            <option key={house.id} value={house.id}>{house.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Parent Information */}
                  <div className="space-y-6">
                    <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                      <Users className="w-4 h-4" /> Parent Information
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Father's Name</label>
                        <input 
                          type="text" required
                          value={formData.fatherName}
                          onChange={(e) => setFormData({...formData, fatherName: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mother's Name</label>
                        <input 
                          type="text" required
                          value={formData.motherName}
                          onChange={(e) => setFormData({...formData, motherName: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                          <input 
                            type="tel" required
                            value={formData.phone}
                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                          <input 
                            type="email" required
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Details */}
                  <div className="md:col-span-2 space-y-6">
                    <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                      <FileText className="w-4 h-4" /> Additional Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Transport Details</label>
                        <textarea 
                          rows={2}
                          value={formData.transportDetails}
                          onChange={(e) => setFormData({...formData, transportDetails: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Medical Notes</label>
                        <textarea 
                          rows={2}
                          value={formData.medicalNotes}
                          onChange={(e) => setFormData({...formData, medicalNotes: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none resize-none"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Academic History</label>
                        <textarea 
                          rows={3}
                          value={formData.academicHistory}
                          onChange={(e) => setFormData({...formData, academicHistory: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none resize-none"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Parent Address</label>
                        <textarea 
                          rows={2}
                          value={formData.address}
                          onChange={(e) => setFormData({...formData, address: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600/20 outline-none resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-10 flex items-center justify-end gap-4 border-t pt-6">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsEditMode(false);
                      setEditingStudent(null);
                    }}
                    className="px-6 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="px-8 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
                  >
                    {loading ? (isEditMode ? 'Updating...' : 'Registering...') : (isEditMode ? 'Update Student' : 'Register Student')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Options Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && deletingStudent && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative z-10"
            >
              <div className="p-6 border-b bg-red-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Delete Student Data</h2>
                    <p className="text-sm text-red-600 font-medium">Select deletion scope for {deletingStudent.name}</p>
                  </div>
                </div>
                <button onClick={() => setIsDeleteModalOpen(false)} className="p-2 hover:bg-red-100 rounded-full transition-all">
                  <X className="w-5 h-5 text-red-500" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <button 
                  onClick={() => performDelete({ deleteStudent: true, deleteParent: true, deleteEverything: true, downloadFirst: false })}
                  disabled={loading}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-xl transition-all group"
                >
                  <div className="text-left">
                    <p className="font-bold text-gray-900 group-hover:text-red-700">Delete Entire Database</p>
                    <p className="text-xs text-gray-500">Removes student, parent, and all related records across portals.</p>
                  </div>
                  <Trash2 className="w-5 h-5 text-gray-400 group-hover:text-red-500" />
                </button>

                <button 
                  onClick={() => performDelete({ deleteStudent: true, deleteParent: true, deleteEverything: true, downloadFirst: true })}
                  disabled={loading}
                  className="w-full flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all group"
                >
                  <div className="text-left">
                    <p className="font-bold text-blue-900">Download & Delete Everything</p>
                    <p className="text-xs text-blue-600">Generates a full PDF record before permanent deletion.</p>
                  </div>
                  <Download className="w-5 h-5 text-blue-500" />
                </button>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button 
                    onClick={() => performDelete({ deleteStudent: true, deleteParent: false, deleteEverything: false, downloadFirst: false })}
                    disabled={loading}
                    className="p-4 bg-white border border-gray-200 hover:border-gray-300 rounded-xl transition-all text-left group"
                  >
                    <p className="font-bold text-gray-900 text-sm">Student Only</p>
                    <p className="text-[10px] text-gray-500">Keep parent profile active.</p>
                  </button>
                  <button 
                    onClick={() => performDelete({ deleteStudent: false, deleteParent: true, deleteEverything: false, downloadFirst: false })}
                    disabled={loading}
                    className="p-4 bg-white border border-gray-200 hover:border-gray-300 rounded-xl transition-all text-left group"
                  >
                    <p className="font-bold text-gray-900 text-sm">Parent Only</p>
                    <p className="text-[10px] text-gray-500">Keep student record active.</p>
                  </button>
                </div>

                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex gap-3">
                  <Activity className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    <span className="font-bold">Warning:</span> These actions are permanent and cannot be undone. 
                    Deleting the entire database will remove all history including payments and attendance.
                  </p>
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t flex justify-end">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-6 py-2 text-sm font-bold text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
