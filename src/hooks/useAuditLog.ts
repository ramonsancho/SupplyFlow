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
      // SIlently handle permission errors for non-admin users to avoid crashing the whole UI
      if (error.code !== 'permission-denied') {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'audit-logs');
        }
      }
      setLogs([]);
    });

    return () => unsubscribe();
  }, []);

  const addLog = useCallback(async (
    action: string, 
    entity: string, 
    entityId: string, 
    userEmail: string,
    previousState?: any,
    newState?: any
  ) => {
    const safeClone = (obj: any): any => {
      if (obj === null || obj === undefined) return null;
      if (typeof obj !== 'object') return obj;
      try {
        const cache = new Set();
        const str = JSON.stringify(obj, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (cache.has(value)) {
              return '[Circular]';
            }
            cache.add(value);
          }
          if (typeof value === 'function') {
            return undefined;
          }
          return value;
        });
        return JSON.parse(str);
      } catch (e) {
        console.warn('Error cloning object for audit log:', e);
        return { error: 'Non-serializable object' };
      }
    };

    try {
      await addDoc(collection(db, 'audit-logs'), {
        userId: auth.currentUser?.uid || 'unknown',
        userEmail,
        action,
        entity,
        entityId,
        timestamp: serverTimestamp(),
        previousState: previousState ? safeClone(previousState) : null,
        newState: newState ? safeClone(newState) : null,
        undone: false
      });
    } catch (error) {
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.CREATE, 'audit-logs');
      }
    }
  }, []);

  return { logs, addLog };
}
