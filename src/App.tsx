/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Toaster } from 'sonner';
import { auth, db } from './firebase';
import { collection, query, getDocs, setDoc, doc, serverTimestamp, getDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import SupplierList from './components/SupplierList';
import RFQList from './components/RFQList';
import OCList from './components/OCList';
import UserList from './components/UserList';
import AuditLogList from './components/AuditLogList';
import ContractList from './components/ContractList';
import Login from './components/Login';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      try {
        clearTimeout(timeout);
        
        // Limpar inscrição anterior se existir
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }

        setUser(user);
        
        if (user) {
          // Monitorar status do usuário em tempo real
          const userRef = doc(db, 'users', user.uid);
          unsubProfile = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
              const userData = doc.data();
              if (userData.status === 'Inativo') {
                signOut(auth).catch(e => console.error('Sign out error:', e));
              }
            }
          }, (error) => {
            console.error('onSnapshot error:', error);
          });
        }
        setLoading(false);
      } catch (error) {
        console.error('onAuthStateChanged error:', error);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-slate-200 rounded-full" />
          <div className="absolute inset-0 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-slate-500 font-medium animate-pulse">Carregando SupplyFlow...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="suppliers" element={<SupplierList />} />
            <Route path="rfqs" element={<RFQList />} />
            <Route path="purchase-orders" element={<OCList />} />
            <Route path="contracts" element={<ContractList />} />
            <Route path="users" element={<UserList />} />
            <Route path="audit-logs" element={<AuditLogList />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}


