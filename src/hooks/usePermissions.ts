import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { RolePermissions, UserRole } from '../types';

export function usePermissions(role: UserRole | undefined) {
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!role || role === 'super_admin') {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(doc(db, 'rolePermissions', role), (docSnap) => {
      if (docSnap.exists()) {
        setPermissions(docSnap.data() as RolePermissions);
      } else {
        setPermissions(null);
      }
      setLoading(false);
    }, (err) => {
      console.error('Error fetching permissions:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [role]);

  const canAccess = (moduleId: string): boolean => {
    if (role === 'super_admin') return true;
    // Fail-closed: if no permissions document exists, deny access rather than grant it.
    if (!permissions) return false;
    const module = permissions.modules[moduleId];
    return module?.enabled !== false;
  };

  const isReadOnly = (moduleId: string): boolean => {
    if (role === 'super_admin') return false;
    // Fail-closed: if no permissions document exists, treat as read-only.
    if (!permissions) return true;
    const module = permissions.modules[moduleId];
    return module?.readOnly === true;
  };

  return { permissions, loading, canAccess, isReadOnly };
}
