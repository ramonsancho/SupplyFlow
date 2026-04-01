/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
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
    const seedAdmin = async () => {
      try {
        const q = query(collection(db, 'users'));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          // Criar o primeiro administrador se a coleção estiver vazia
          await setDoc(doc(db, 'users', 'initial-admin'), {
            name: 'Ramon Souza',
            email: 'ramon.souza@oeg.group',
            role: 'Administrador',
            status: 'Ativo',
            approvalLimit: 10000000,
            createdAt: serverTimestamp()
          });
        } else {
          // Migração: Atualizar o usuário se ele ainda estiver com os dados antigos ou precisar de atualização de limite
          for (const userDoc of snapshot.docs) {
            const data = userDoc.data();
            const email = data.email?.toLowerCase();
            if (email === 'ramonsancho@gmail.com' || email === 'ramon.souza@oeg.group') {
              await setDoc(doc(db, 'users', userDoc.id), {
                ...data,
                name: 'Ramon Souza',
                email: 'ramon.souza@oeg.group',
                approvalLimit: 10000000,
                updatedAt: serverTimestamp()
              }, { merge: true });
            }
          }
        }
      } catch (error) {
        console.error('Error seeding admin:', error);
      }
    };
    seedAdmin();

    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(timeout);
      console.log('onAuthStateChanged fired:', user?.email);
      
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

        // Se o usuário logado for o admin, garantir que o UID dele esteja vinculado ao documento de admin
        const email = user.email?.toLowerCase();
        if (email === 'ramonsancho@gmail.com' || email === 'ramon.souza@oeg.group') {
          try {
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
              const adminRef = doc(db, 'users', 'initial-admin');
              const adminSnap = await getDoc(adminRef);
              
              if (adminSnap.exists()) {
                const adminData = adminSnap.data();
                await setDoc(userRef, {
                  ...adminData,
                  uid: user.uid,
                  updatedAt: serverTimestamp()
                });
                await deleteDoc(adminRef);
              }
            }
          } catch (error) {
            console.error('Migration error:', error);
          }
        }
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#141414] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
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
  );
}


