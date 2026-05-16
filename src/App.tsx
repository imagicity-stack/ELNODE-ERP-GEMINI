/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, query, where, collection, limit, getDocs } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { UserProfile } from './types';
import { SCHOOL_DOMAIN, LEGACY_DOMAIN } from './constants';
import Login from './pages/Login';
import AdminPortal from './pages/admin/AdminPortal';
import StudentPortal from './pages/student/StudentPortal';
import ParentPortal from './pages/parent/ParentPortal';
import AccountsPortal from './pages/accounts/AccountsPortal';
import TeacherPortal from './pages/teacher/TeacherPortal';
import PrincipalPortal from './pages/admin/PrincipalPortal';
import GrievancePortal from './pages/grievance/GrievancePortal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { DataProvider } from './contexts/DataContext';

const normalizeUserRole = (role: string): UserProfile['role'] => {
  if (['admin', 'staff', 'security', 'transport', 'office_staff'].includes(role)) {
    return 'office_staff';
  }
  if (role === 'grievance_officer') return 'grievance_officer';
  return role as UserProfile['role'];
};

const normalizeUserProfile = (profile: UserProfile): UserProfile => ({
  ...profile,
  role: normalizeUserRole(profile.role),
});

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        try {
          // Force a fresh token so Firestore security rules see request.auth
          // immediately — without this, the first read can be denied because the
          // Firestore SDK hasn't received the auth token yet.
          try { await firebaseUser.getIdToken(true); } catch (_) {}

          // Use a retry mechanism with timeout for the initial profile fetch
          const fetchProfileWithRetry = async (retries = 3): Promise<any> => {
            for (let i = 0; i < retries; i++) {
              try {
                const userDocPromise = getDoc(doc(db, 'users', firebaseUser.uid));
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Profile fetch timeout')), 8000)
                );
                return await Promise.race([userDocPromise, timeoutPromise]);
              } catch (err) {
                console.warn(`Profile fetch attempt ${i + 1} failed:`, err);
                if (i === retries - 1) throw err;
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
              }
            }
          };

          let userDoc;
          try {
            userDoc = await fetchProfileWithRetry();
          } catch (fetchErr) {
            console.error('Final profile fetch failed after retries');
            throw fetchErr;
          }
          
          if (userDoc && userDoc.exists()) {
            const existingUser = normalizeUserProfile(userDoc.data() as UserProfile);
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

            // Self-healing: Denormalize classId onto student user doc so Firestore rules
            // can scope diary/notice/etc. access without extra get() roundtrips.
            if (updatedUser.role === 'student' && updatedUser.studentId && !updatedUser.classId) {
              const sDoc = await getDoc(doc(db, 'students', updatedUser.studentId));
              if (sDoc.exists()) {
                const cid = (sDoc.data() as any).classId;
                if (cid) { updatedUser.classId = cid; needsUpdate = true; }
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

            // Self-healing: Denormalize classIds onto parent user doc so Firestore rules can
            // scope diary/notice access without an extra get() per query.
            if (updatedUser.role === 'parent' && updatedUser.studentIds?.length) {
              const docs = await Promise.all(
                updatedUser.studentIds.map(id => getDoc(doc(db, 'students', id)))
              );
              const classIds = Array.from(new Set(
                docs.filter(d => d.exists()).map(d => (d.data() as any).classId).filter(Boolean)
              ));
              const currentClassIds = (updatedUser as any).classIds || [];
              if (classIds.length && JSON.stringify(classIds.sort()) !== JSON.stringify([...currentClassIds].sort())) {
                (updatedUser as any).classIds = classIds;
                needsUpdate = true;
              }
            }

            if (needsUpdate) {
              updatedUser.updatedAt = new Date().toISOString();
              await setDoc(doc(db, 'users', firebaseUser.uid), updatedUser, { merge: true });
              setUser(updatedUser);
            } else {
              setUser(existingUser);
            }
          } else {
            
            // 2. Try searching by email in case of UID mismatch
            if (firebaseUser.email) {
              const userEmail = firebaseUser.email.toLowerCase();
              const emailsToTry = [userEmail];
              
              // If email has one of the school domains, try the other one too
              if (userEmail.endsWith(`@${SCHOOL_DOMAIN}`)) {
                emailsToTry.push(userEmail.replace(`@${SCHOOL_DOMAIN}`, `@${LEGACY_DOMAIN}`));
              } else if (userEmail.endsWith(`@${LEGACY_DOMAIN}`)) {
                emailsToTry.push(userEmail.replace(`@${LEGACY_DOMAIN}`, `@${SCHOOL_DOMAIN}`));
              }
              
              const findExistingUser = async () => {
                for (const email of emailsToTry) {
                  const q = query(
                    collection(db, 'users'), 
                    where('email', '==', email), 
                    limit(1)
                  );
                  const querySnapshot = await getDocs(q);
                  if (!querySnapshot.empty) {
                    return normalizeUserProfile(querySnapshot.docs[0].data() as UserProfile);
                  }
                }
                return null;
              };

              const existingUser = await findExistingUser();
              
              if (existingUser) {

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
                  setUser(newUser);
                } catch (setErr) {
                  console.error('Error linking profile to new UID:', setErr);
                  setUser(existingUser);
                }
              } else {
                // Google-authenticated user has no linked school profile.
                // Sign out to prevent a stuck-authenticated-but-null loop.
                const isProviderAuth = firebaseUser.providerData?.some(
                  (p: any) => p.providerId !== 'password'
                );
                if (isProviderAuth) {
                  sessionStorage.setItem(
                    'auth_no_profile_error',
                    `Your Google account (${firebaseUser.email}) is not linked to a school profile. Please contact the administrator or sign in with your school email and password.`
                  );
                  try { await signOut(auth); } catch (_) {}
                }
                setUser(null);
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
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getPortalPath = (role: string) => {
    switch (role) {
      case 'super_admin': return '/superadmin';
      case 'office_staff': return '/staff';
      case 'principal': return '/principal';
      case 'teacher': return '/teacher';
      case 'student': return '/student';
      case 'parent': return '/parent';
      case 'accounts': return '/accounts';
      case 'grievance_officer': return '/grievance';
      default: return '/login';
    }
  };

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
        <DataProvider user={user}>
          <Router>
            <Routes>
              <Route path="/login" element={user ? <Navigate to={getPortalPath(user.role)} /> : <Login />} />
              
              <Route path="/superadmin/*" element={user?.role === 'super_admin' ? <AdminPortal user={user} /> : <Navigate to="/login" />} />
              <Route path="/staff/*" element={user?.role === 'office_staff' ? <AdminPortal user={user} /> : <Navigate to="/login" />} />
              <Route path="/student/*" element={user?.role === 'student' ? <StudentPortal user={user} /> : <Navigate to="/login" />} />
              <Route path="/parent/*" element={user?.role === 'parent' ? <ParentPortal user={user} /> : <Navigate to="/login" />} />
              <Route path="/accounts/*" element={user?.role === 'accounts' ? <AccountsPortal user={user} /> : <Navigate to="/login" />} />
              <Route path="/teacher/*" element={user?.role === 'teacher' ? <TeacherPortal user={user} /> : <Navigate to="/login" />} />
              <Route path="/principal/*" element={user?.role === 'principal' ? <PrincipalPortal user={user} /> : <Navigate to="/login" />} />
              <Route path="/grievance/*" element={user?.role === 'grievance_officer' || user?.role === 'super_admin' || user?.role === 'principal' ? <GrievancePortal user={user} /> : <Navigate to="/login" />} />
              
              <Route path="/" element={<Navigate to={user ? getPortalPath(user.role) : "/login"} />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Router>
        </DataProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

