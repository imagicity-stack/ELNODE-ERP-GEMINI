/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, query, where, collection, limit, getDocs } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { UserProfile } from './types';
import Login from './pages/Login';
import AdminPortal from './pages/admin/AdminPortal';
import StudentPortal from './pages/student/StudentPortal';
import ParentPortal from './pages/parent/ParentPortal';
import AccountsPortal from './pages/accounts/AccountsPortal';
import TeacherPortal from './pages/teacher/TeacherPortal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          console.log('Auth state changed: User logged in', firebaseUser.email, firebaseUser.uid);
          
          // 1. Try fetching by UID first
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          
          if (userDoc.exists()) {
            console.log('User profile found by UID');
            const existingUser = userDoc.data() as UserProfile;
            let updatedUser = { ...existingUser };
            let needsUpdate = false;

            // Self-healing: Fix missing studentId for students
            if (updatedUser.role === 'student' && !updatedUser.studentId && updatedUser.schoolNumber) {
              const studentQ = query(collection(db, 'students'), where('schoolNumber', '==', updatedUser.schoolNumber), limit(1));
              const studentDocs = await getDocs(studentQ);
              if (!studentDocs.empty) {
                updatedUser.studentId = studentDocs.docs[0].id;
                needsUpdate = true;
              }
            }

            // Self-healing: Fix missing studentIds for parents
            if (updatedUser.role === 'parent' && (!updatedUser.studentIds || updatedUser.studentIds.length === 0) && updatedUser.schoolNumber) {
              const studentQ = query(collection(db, 'students'), where('schoolNumber', '==', updatedUser.schoolNumber), limit(1));
              const studentDocs = await getDocs(studentQ);
              if (!studentDocs.empty) {
                updatedUser.studentIds = [studentDocs.docs[0].id];
                needsUpdate = true;
              }
            }

            if (needsUpdate) {
              console.log('Self-healing profile found by UID...');
              updatedUser.updatedAt = new Date().toISOString();
              await setDoc(doc(db, 'users', firebaseUser.uid), updatedUser, { merge: true });
              setUser(updatedUser);
            } else {
              setUser(existingUser);
            }
          } else {
            console.log('User profile not found by UID, searching by email...', firebaseUser.email);
            
            // 2. Try searching by email in case of UID mismatch (e.g. Google login vs Email/Password)
            if (firebaseUser.email) {
              const userEmail = firebaseUser.email.toLowerCase();
              const q = query(
                collection(db, 'users'), 
                where('email', '==', userEmail), 
                limit(1)
              );
              const querySnapshot = await getDocs(q);
              
              if (!querySnapshot.empty) {
                const existingUser = querySnapshot.docs[0].data() as UserProfile;
                console.log('User profile found by email. Linking to new UID:', firebaseUser.uid);
                
                // Create a new user doc with current UID to ensure rules work
                const newUser: UserProfile = {
                  ...existingUser,
                  uid: firebaseUser.uid,
                  updatedAt: new Date().toISOString()
                };

                // Self-healing: Fix missing studentId for students
                if (newUser.role === 'student' && !newUser.studentId && newUser.schoolNumber) {
                  const studentQ = query(collection(db, 'students'), where('schoolNumber', '==', newUser.schoolNumber), limit(1));
                  const studentDocs = await getDocs(studentQ);
                  if (!studentDocs.empty) {
                    newUser.studentId = studentDocs.docs[0].id;
                  }
                }

                // Self-healing: Fix missing studentIds for parents
                if (newUser.role === 'parent' && (!newUser.studentIds || newUser.studentIds.length === 0) && newUser.schoolNumber) {
                  const studentQ = query(collection(db, 'students'), where('schoolNumber', '==', newUser.schoolNumber), limit(1));
                  const studentDocs = await getDocs(studentQ);
                  if (!studentDocs.empty) {
                    newUser.studentIds = [studentDocs.docs[0].id];
                  }
                }
                
                try {
                  await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
                  console.log('Successfully linked profile to new UID');
                  setUser(newUser);
                } catch (setErr) {
                  console.error('Error linking profile to new UID:', setErr);
                  // Fallback: set user state anyway if we found it, but rules might fail later
                  setUser(existingUser);
                }
              } else {
                console.log('No existing profile found for email:', userEmail);
                
                // 3. Auto-create super admin if email matches
                const superAdminEmails = ['imagicityart@gmail.com', 'deweshkk@gmail.com'];
                if (superAdminEmails.includes(userEmail)) {
                  console.log('Auto-creating super admin profile...');
                  const newAdmin: UserProfile = {
                    uid: firebaseUser.uid,
                    email: userEmail,
                    name: firebaseUser.displayName || 'Super Admin',
                    role: 'super_admin',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  };
                  await setDoc(doc(db, 'users', firebaseUser.uid), newAdmin);
                  setUser(newAdmin);
                } else {
                  // No profile found and not a super admin
                  setUser(null);
                }
              }
            } else {
              setUser(null);
            }
          }
        } catch (err) {
          console.error('Error in auth state change handler:', err);
          setUser(null);
        }
      } else {
        console.log('Auth state changed: User logged out');
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Router>
          <Routes>
            <Route path="/login" element={user ? <Navigate to={`/${user.role.replace('_', '')}`} /> : <Login />} />
            
            <Route path="/superadmin/*" element={user?.role === 'super_admin' ? <AdminPortal user={user} /> : <Navigate to="/login" />} />
            <Route path="/student/*" element={user?.role === 'student' ? <StudentPortal user={user} /> : <Navigate to="/login" />} />
            <Route path="/parent/*" element={user?.role === 'parent' ? <ParentPortal user={user} /> : <Navigate to="/login" />} />
            <Route path="/accounts/*" element={user?.role === 'accounts' ? <AccountsPortal user={user} /> : <Navigate to="/login" />} />
            <Route path="/teacher/*" element={user?.role === 'teacher' ? <TeacherPortal user={user} /> : <Navigate to="/login" />} />
            
            <Route path="/" element={<Navigate to={user ? `/${user.role.replace('_', '')}` : "/login"} />} />
          </Routes>
        </Router>
      </ToastProvider>
    </ErrorBoundary>
  );
}

