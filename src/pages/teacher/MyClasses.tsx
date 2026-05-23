import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, Teacher, Class } from '../../types';
import { GraduationCap, Users, Layers } from 'lucide-react';
import { Spinner } from '../../components/ui';

interface MyClassesProps {
  user: UserProfile;
}

export default function MyClasses({ user }: MyClassesProps) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMyClasses = async () => {
      setLoading(true);
      try {
        const teacherId = user.teacherId || user.uid;
        const teacherDoc = await getDoc(doc(db, 'teachers', teacherId));

        if (teacherDoc.exists()) {
          const tData = { id: teacherDoc.id, ...teacherDoc.data() } as Teacher;
          setTeacherData(tData);

          const assignedClasses = tData.classes || [];
          if (tData.classTeacherOf?.classId && !assignedClasses.includes(tData.classTeacherOf.classId)) {
            assignedClasses.push(tData.classTeacherOf.classId);
          }

          if (assignedClasses.length > 0) {
            const classesSnap = await getDocs(collection(db, 'classes'));
            const allClassData = classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
            setClasses(allClassData.filter(c => assignedClasses.includes(c.id)));
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'classes');
      } finally {
        setLoading(false);
      }
    };

    fetchMyClasses();
  }, [user.uid, user.teacherId]);

  return (
    <>
      <div className="topbar">
        <div className="pad">
          <p className="eyebrow">{classes.length} assigned</p>
          <h1 className="display">My Classes</h1>
        </div>
      </div>

      <div className="pad" style={{ paddingBottom: '2rem' }}>
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : classes.length === 0 ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
            <GraduationCap className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ink-3)' }} />
            <p style={{ fontWeight: 700, color: 'var(--ink)' }}>No classes assigned</p>
            <p className="muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
              Contact the administrator to get assigned to classes.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.875rem' }}>
            {classes.map((cls) => (
              <div key={cls.id} className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '0.75rem',
                      background: 'var(--ink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <GraduationCap className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                  </div>
                  {teacherData?.classTeacherOf?.classId === cls.id && (
                    <span
                      className="chip solid"
                      style={{ fontSize: '0.65rem' }}
                    >
                      Class Teacher
                    </span>
                  )}
                </div>

                <p style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--ink)' }}>
                  Class {cls.name}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.25rem', marginBottom: '1rem' }}>
                  <Layers className="w-3.5 h-3.5" style={{ color: 'var(--ink-3)' }} />
                  <span className="muted" style={{ fontSize: '0.8125rem' }}>
                    {cls.sections?.length || 0} Section{(cls.sections?.length || 0) !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="stack" style={{ gap: '0.375rem' }}>
                  {cls.sections?.map((sec, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.625rem 0.75rem',
                        background: 'var(--cream-2)',
                        borderRadius: '0.625rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '0.375rem',
                            background: 'var(--paper)',
                            border: '1px solid var(--line)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            color: 'var(--ink)',
                          }}
                        >
                          {sec.name || 'A'}
                        </span>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink-2)' }}>
                          Section {sec.name || 'A'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Users className="w-3.5 h-3.5" style={{ color: 'var(--ink-3)' }} />
                        <span className="muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                          {sec.capacity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
