import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Trash2,
  Edit,
  User as UserIcon,
  Shield,
  CheckCircle,
  XCircle,
  Key,
  Mail
} from 'lucide-react';
import UserModal from './UserModal';
import ConfirmModal from './ConfirmModal';
import { User } from '../types';
import { useNotifications } from '../hooks/useNotifications';
import { useAuditLog } from '../hooks/useAuditLog';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { initializeApp, getAuth as getAuthSecondary, createUserWithEmailAndPassword, firebaseConfig } from '../firebase';
import { deleteApp, getApps } from 'firebase/app';

export default function UserList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | undefined>();
  const [userToDelete, setUserToDelete] = useState<{id: string, name: string} | null>(null);
  const [resetPasswordEmail, setResetPasswordEmail] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { addNotification } = useNotifications();
  const { addLog } = useAuditLog();

  useEffect(() => {
    if (auth.currentUser) {
      const fetchProfile = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
          if (userDoc.exists()) {
            setCurrentUserProfile({ ...userDoc.data(), id: userDoc.id } as User);
          }
        } catch (error) {
          try {
            handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}`);
          } catch (e) {
            console.error('Failed to fetch profile:', e);
          }
        }
      };
      fetchProfile().catch(err => console.error('Error in fetchProfile:', err));
    }

    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
      })) as User[];
      setUsers(userData);
      setIsLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'users');
      } catch (e) {
        console.error('UserList error:', e);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSaveUser = async (data: any) => {
    let secondaryApp;
    try {
      if (editingUser) {
        const userRef = doc(db, 'users', editingUser.id);
        await updateDoc(userRef, {
          ...data,
          updatedAt: serverTimestamp()
        });
        await addLog('Editou Usuário', 'User', editingUser.id, auth.currentUser?.email || 'Unknown');
        await addNotification('Usuário Atualizado', `Os dados de ${data.name} foram salvos.`, 'success');
      } else {
        // 1. Criar no Firebase Auth usando uma instância secundária para não deslogar o admin
        const tempPassword = Math.random().toString(36).slice(-10);
        const appName = `SecondaryApp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        secondaryApp = initializeApp(firebaseConfig, appName);
        const secondaryAuth = getAuthSecondary(secondaryApp);
        
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, data.email, tempPassword);
        const uid = userCredential.user.uid;
        
        // 2. Salvar no Firestore usando o UID do Auth como ID do documento
        await setDoc(doc(db, 'users', uid), {
          ...data,
          createdAt: serverTimestamp()
        });
        
        // 3. Enviar email de redefinição de senha imediatamente
        try {
          await sendPasswordResetEmail(auth, data.email);
        } catch (resetError) {
          console.error('Error sending initial reset email:', resetError);
        }
        
        await addLog('Cadastrou Usuário', 'User', uid, auth.currentUser?.email || 'Unknown');
        await addNotification('Usuário Cadastrado', `${data.name} foi adicionado e um email de redefinição foi enviado.`, 'success');
      }
      setIsModalOpen(false);
      setEditingUser(undefined);
    } catch (error: any) {
      console.error('User save error:', error);
      if (error.code === 'auth/email-already-in-use') {
        await addNotification('Erro', 'Este email já está em uso no sistema.', 'error');
      } else {
        try {
          handleFirestoreError(error, editingUser ? OperationType.UPDATE : OperationType.CREATE, 'users');
        } catch (e) {
          await addNotification('Erro', 'Não foi possível salvar o usuário.', 'error');
        }
      }
    } finally {
      if (secondaryApp) {
        try {
          // Pequeno delay para garantir que as operações do Auth foram concluídas
          await new Promise(resolve => setTimeout(resolve, 500));
          await deleteApp(secondaryApp);
        } catch (deleteError) {
          console.error('Error deleting secondary app:', deleteError);
        }
      }
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    try {
      await deleteDoc(doc(db, 'users', id));
      await addLog('Excluiu Usuário', 'User', id, auth.currentUser?.email || 'Unknown');
      await addNotification('Usuário Excluído', `${name} foi removido do sistema.`, 'warning');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `users/${id}`);
      } catch (e) {
        console.error('User delete error:', e);
      }
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      await addLog('Resetou Senha', 'User', email, auth.currentUser?.email || 'Unknown');
      await addNotification('Email Enviado', `Instruções de redefinição enviadas para ${email}.`, 'success');
    } catch (error) {
      console.error('Error resetting password:', error);
      await addNotification('Erro', 'Não foi possível enviar o email de redefinição.', 'error');
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#141414]">Usuários</h2>
          <p className="text-[#8E9299] mt-1">Gerencie os acessos e permissões do sistema.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-[#141414] text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:scale-105 transition-all"
        >
          <Plus size={20} />
          <span>Novo Usuário</span>
        </button>
      </div>

      <UserModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingUser(undefined);
        }} 
        onSubmit={(data) => handleSaveUser(data).catch(err => console.error('Error in handleSaveUser:', err))}
        initialData={editingUser}
      />

      <ConfirmModal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={() => userToDelete && handleDeleteUser(userToDelete.id, userToDelete.name).catch(err => console.error('Error in handleDeleteUser:', err))}
        title="Excluir Usuário"
        message={`Tem certeza que deseja excluir o usuário ${userToDelete?.name}? Esta ação não poderá ser desfeita.`}
        confirmText="Excluir"
        variant="danger"
      />

      <ConfirmModal
        isOpen={!!resetPasswordEmail}
        onClose={() => setResetPasswordEmail(null)}
        onConfirm={() => resetPasswordEmail && handleResetPassword(resetPasswordEmail).catch(err => console.error('Error in handleResetPassword:', err))}
        title="Resetar Senha"
        message={`Deseja enviar um email de redefinição de senha para ${resetPasswordEmail}?`}
        confirmText="Enviar Email"
        variant="info"
      />

      <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou email..." 
            className="w-full pl-10 pr-4 py-2 bg-[#F5F5F5] border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#141414]"></div>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E5E5E5] p-12 text-center">
          <UserIcon size={48} className="mx-auto text-[#E5E5E5] mb-4" />
          <h3 className="text-lg font-bold text-[#141414]">Nenhum usuário encontrado</h3>
          <p className="text-[#8E9299] mt-1">Tente ajustar seus filtros ou cadastre um novo usuário.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F5F5] border-b border-[#E5E5E5]">
                <th className="px-6 py-4 text-xs font-bold text-[#141414] uppercase tracking-widest">Usuário</th>
                <th className="px-6 py-4 text-xs font-bold text-[#141414] uppercase tracking-widest">Perfil</th>
                <th className="px-6 py-4 text-xs font-bold text-[#141414] uppercase tracking-widest">Limite de Aprovação</th>
                <th className="px-6 py-4 text-xs font-bold text-[#141414] uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-[#141414] uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-[#F9F9F9] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#141414] text-white flex items-center justify-center font-bold">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#141414]">{user.name}</p>
                        <p className="text-xs text-[#8E9299]">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#141414]">
                      <Shield size={16} className="text-[#8E9299]" />
                      {user.role}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-[#141414]">
                      {user.approvalLimit ? `R$ ${user.approvalLimit.toLocaleString()}` : 'R$ 0,00'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      user.status === 'Ativo' 
                        ? 'bg-green-50 text-green-700' 
                        : 'bg-red-50 text-red-700'
                    }`}>
                      {user.status === 'Ativo' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => setResetPasswordEmail(user.email)}
                        className="p-2 text-[#8E9299] hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
                        title="Resetar Senha"
                      >
                        <Key size={18} />
                      </button>
                      <button 
                        onClick={() => {
                          setEditingUser(user);
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-[#8E9299] hover:text-[#141414] hover:bg-[#F5F5F5] rounded-full transition-all"
                        title="Editar"
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => setUserToDelete({ id: user.id, name: user.name })}
                        className="p-2 text-[#8E9299] hover:text-[#FF4444] hover:bg-red-50 rounded-full transition-all"
                        title="Excluir"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
