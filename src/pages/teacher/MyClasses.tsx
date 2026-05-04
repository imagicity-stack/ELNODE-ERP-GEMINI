import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { UserProfile, Teacher, Class } from '../../types';
import { GraduationCap, Users, Layers, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PageHeader, Card, Badge, EmptyState, Spinner } from '../../components/ui';

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
    <div className="space-y-6">
      <PageHeader 
        title="My Assigned Classes" 
        subtitle="Manage and view details of classes you are assigned to." 
        icon={GraduationCap} 
        iconColor="gradient-blue"
      />

      {loading ? (
        <Spinner />
      ) : classes.length === 0 ? (
        <EmptyState 
          icon={GraduationCap} 
          title="No classes assigned" 
          description="You haven't been assigned to any classes yet. Please contact the administrator." 
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {classes.map((cls, i) => (
              <motion.div 
                layout 
                key={cls.id} 
                initial={{ opacity: 0, y: 16 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm group-hover:scale-110 transition-transform">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  {teacherData?.classTeacherOf?.classId === cls.id && (
                    <Badge variant="success">Class Teacher</Badge>
                  )}
                </div>
                
                <h3 className="text-xl font-bold text-slate-900">Class {cls.name}</h3>
                <div className="flex items-center gap-2 mt-1 mb-4 text-slate-500">
                  <Layers className="w-4 h-4" />
                  <span className="text-sm font-medium">{cls.sections?.length || 0} Sections</span>
                </div>

                <div className="space-y-2">
                  {cls.sections?.map((sec, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-transparent hover:border-blue-100 hover:bg-white hover:shadow-sm transition-all group/sec text-sm">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-xs font-bold text-blue-600 shadow-sm group-hover/sec:scale-110 transition-transform">
                          {sec.name || 'A'}
                        </span>
                        <span className="font-semibold text-slate-700">Section {sec.name || 'A'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Users className="w-4 h-4" />
                        <span className="font-medium">{sec.capacity} Students</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
