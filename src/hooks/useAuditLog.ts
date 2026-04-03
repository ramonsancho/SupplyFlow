import { useState, useCallback, useEffect } from 'react';
import { AuditLog } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

export function useAuditLog() {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'audit-logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || new Date().toISOString()
      })) as AuditLog[];
      setLogs(logData);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'audit-logs');
      } catch (e) {
        console.error('useAuditLog error:', e);
      }
      setLogs([]);
    });

    return () => unsubscribe();
  }, []);

  const addLog = useCallback(async (action: string, entity: string, entityId: string, userEmail: string) => {
    try {
      await addDoc(collection(db, 'audit-logs'), {
        userId: auth.currentUser?.uid || 'unknown',
        userEmail,
        action,
        entity,
        entityId,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, 'audit-logs');
      } catch (e) {
        console.error('Failed to add audit log:', e);
      }
    }
  }, []);

  return { logs, addLog };
}
