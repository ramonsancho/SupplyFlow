import { useState, useCallback, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, limit, updateDoc, doc, where } from 'firebase/firestore';

export type Notification = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
  userId: string;
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!auth.currentUser) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', auth.currentUser.uid),
      orderBy('timestamp', 'desc'), 
      limit(20)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || new Date().toISOString()
      })) as Notification[];
      setNotifications(notifData);
    }, (error) => {
      // Only log if it's not a permission error during logout
      if (auth.currentUser) {
        try {
          handleFirestoreError(error, OperationType.LIST, 'notifications');
        } catch (e) {
          console.error('Notifications fetch error:', e);
        }
      }
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  const addNotification = useCallback(async (title: string, message: string, type: Notification['type'] = 'info') => {
    if (!auth.currentUser) return;
    
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: auth.currentUser.uid,
        title,
        message,
        type,
        timestamp: serverTimestamp(),
        read: false,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notifications');
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), {
        read: true,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
    }
  }, []);

  return { notifications, addNotification, markAsRead };
}
