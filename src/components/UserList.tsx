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
  Mail,
  ChevronRight,
  ShieldCheck,
  Lock,
  UserCheck,
  MoreVertical
} from 'lucide-react';
import UserModal from './UserModal';
import ConfirmModal from './ConfirmModal';
import { User } from '../types';
import { useNotifications } from '../hooks/useNotifications';
import { useAuditLog } from '../hooks/useAuditLog';
import { emailService } from '../services/emailService';
import { teamsService } from '../services/teamsService';
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
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function UserList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | undefined>();
  const [userToDelete, setUserToDelete] = useState<{id: string, name: string, email: string} | null>(null);
  const [resetPasswordEmail, setResetPasswordEmail] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { addNotification } = useNotifications();
  const { addLog } = useAuditLog();

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    if (auth.currentUser) {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      unsubscribeProfile = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          const bootstrapEmails = ["ramon.souza@oeg.group", "ramonsancho@gmail.com"];
          const userEmail = auth.currentUser?.email?.toLowerCase().trim() || '';
          
          if (bootstrapEmails.includes(userEmail)) {
            let needsUpdate = false;
            const updates: any = {};
            
            if (userData.role !== 'Administrador') {
              updates.role = 'Administrador';
              needsUpdate = true;
            }
            
            if (userEmail === "ramon.souza@oeg.group" && userData.name !== "Ramon Souza") {
              updates.name = "Ramon Souza";
              needsUpdate = true;
            }
            
            if (needsUpdate) {
              setDoc(userRef, updates, { merge: true }).catch(e => {
                console.error('Error self-healing bootstrap admin in UserList:', e);
              });
            }
          }
          
          setCurrentUserProfile({ ...userData, id: docSnap.id } as User);
        }
      }, (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}`);
        } catch (e) {
          console.error('Failed to fetch profile in UserList:', e);
        }
      });
    }

    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribeUsers = onSnapshot(q, (snapshot) => {
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

    const checkApiHealth = async () => {
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          const data = await response.json();
          console.log('[API Health]', data);
          if (data.firebaseAdmin === 'not_initialized') {
            console.warn('[API Health] Firebase Admin não está inicializado no servidor.');
          }
        }
      } catch (e) {
        console.warn('[API Health] Não foi possível conectar à API de backend:', e);
      }
    };

    checkApiHealth();

    return () => {
      if (unsubscribeProfile) unsubscribeProfile();
      unsubscribeUsers();
    };
  }, []);

  const handleSaveUser = async (data: any) => {
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
        // 0. Verificar se já existe no Firestore
        const emailExists = users.some(u => u.email.toLowerCase() === data.email.toLowerCase());
        if (emailExists) {
          await addNotification('Erro', 'Este email já está cadastrado na lista de usuários.', 'error');
          return;
        }

        // Apenas criamos o documento no Firestore. 
        // O usuário criará sua conta de Autenticação através do "Primeiro Acesso" na tela de Login.
        const docRef = await addDoc(collection(db, 'users'), {
          ...data,
          createdAt: serverTimestamp(),
          status: data.status || 'Ativo'
        });
        
        // Opcional: Enviar um email de convite informando que ele pode fazer o primeiro acesso
        try {
          await emailService.sendCustomEmail({
            to: data.email,
            subject: 'Convite para o SupplyFlow',
            fromName: 'SupplyFlow Team',
            html: `
              <div style="font-family: sans-serif; color: #141414; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E5E5; border-radius: 12px;">
                <h2 style="color: #141414;">Bem-vindo ao SupplyFlow</h2>
                <p>Olá <strong>${data.name}</strong>,</p>
                <p>Você foi cadastrado no sistema SupplyFlow como <strong>${data.role}</strong>.</p>
                <p>Para acessar o sistema pela primeira vez, siga os passos abaixo:</p>
                <ol>
                  <li>Acesse a página de login.</li>
                  <li>Clique na aba <strong>"PRIMEIRO ACESSO"</strong>.</li>
                  <li>Informe seu e-mail corporativo e defina sua senha pessoal.</li>
                </ol>
                <p>Se tiver dúvidas, entre em contato com o administrador.</p>
                <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 20px 0;" />
                <p style="font-size: 12px; color: #8E9299;">SupplyFlow Management System</p>
              </div>
            `
          });
        } catch (emailErr) {
          console.warn('Não foi possível enviar o e-mail de convite, mas o usuário foi criado no banco.', emailErr);
        }
        
        await addLog('Cadastrou Usuário', 'User', docRef.id, auth.currentUser?.email || 'Unknown');
        await addNotification('Usuário Cadastrado', `${data.name} foi adicionado. Ele deve realizar o "Primeiro Acesso" para definir sua senha.`, 'success');
      }
      setIsModalOpen(false);
      setEditingUser(undefined);
    } catch (error: any) {
      console.error('User save error:', error);
      try {
        handleFirestoreError(error, editingUser ? OperationType.UPDATE : OperationType.CREATE, 'users');
      } catch (e) {
        await addNotification('Erro', 'Não foi possível salvar o usuário.', 'error');
      }
    }
  };

  const handleDeleteUser = async (id: string, name: string, email: string) => {
    try {
      // 1. Deletar do Firebase Authentication via API
      try {
        const response = await fetch('/api/delete-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: id, email: email })
        });

        if (!response.ok) {
          let errorMsg = 'Erro desconhecido';
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorData.message || response.statusText;
          } catch (e) {
            errorMsg = response.statusText;
          }
          console.warn('Erro ao deletar do Auth:', errorMsg);
        }
      } catch (e) {
        console.error('Falha na requisição de deleção do Auth:', e);
      }

      // 2. Deletar do Firestore
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
    <div className="space-y-12">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900">Gestão de Usuários</h2>
          <p className="text-slate-500 mt-2 text-lg font-medium">Controle acessos, perfis e limites de aprovação.</p>
        </div>
        {currentUserProfile?.role === 'Administrador' && (
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-slate-200 hover:bg-brand-600 hover:shadow-brand-500/20 transition-all duration-300 self-start"
          >
            <Plus size={20} />
            <span>Novo Usuário</span>
          </motion.button>
        )}
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
        onConfirm={() => userToDelete && handleDeleteUser(userToDelete.id, userToDelete.name, userToDelete.email).catch(err => console.error('Error in handleDeleteUser:', err))}
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

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou email do usuário..." 
            className="w-full pl-14 pr-6 py-4 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Users Table Container */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-slate-200 rounded-full" />
              <div className="absolute inset-0 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-20 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6">
              <UserIcon size={32} className="text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Nenhum usuário encontrado</h3>
            <p className="text-slate-500 mt-2 font-medium">Cadastre novos membros da equipe para colaborar no sistema.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Usuário</th>
                  <th className="px-8 py-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Perfil & Acesso</th>
                  <th className="px-8 py-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Limite de Aprovação</th>
                  <th className="px-8 py-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Status</th>
                  <th className="px-8 py-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredUsers.map((user, idx) => (
                  <motion.tr 
                    key={user.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="hover:bg-slate-50/50 transition-all duration-300 group"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-lg group-hover:bg-brand-500 group-hover:text-white transition-all duration-500 shadow-inner">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 group-hover:text-brand-600 transition-colors">{user.name}</p>
                          <p className="text-xs font-medium text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2.5 text-sm font-bold text-slate-700">
                        <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-brand-500 transition-colors">
                          <Shield size={16} />
                        </div>
                        {user.role}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-sm font-mono font-bold text-slate-900">
                        {user.approvalLimit ? `R$ ${user.approvalLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-transparent",
                        user.status === 'Ativo' 
                          ? 'bg-emerald-50 text-emerald-600' 
                          : 'bg-rose-50 text-rose-600'
                      )}>
                        {user.status === 'Ativo' ? <UserCheck size={12} /> : <Lock size={12} />}
                        {user.status}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center justify-end gap-2">
                        {currentUserProfile?.role === 'Administrador' && (
                          <>
                            <motion.button 
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setResetPasswordEmail(user.email)}
                              className="p-3 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-2xl transition-all duration-300"
                              title="Resetar Senha"
                            >
                              <Key size={18} />
                            </motion.button>
                            <motion.button 
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                setEditingUser(user);
                                setIsModalOpen(true);
                              }}
                              className="p-3 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all duration-300"
                              title="Editar"
                            >
                              <Edit size={18} />
                            </motion.button>
                            <motion.button 
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setUserToDelete({ id: user.id, name: user.name, email: user.email })}
                              className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all duration-300"
                              title="Excluir"
                            >
                              <Trash2 size={18} />
                            </motion.button>
                          </>
                        )}
                        <ChevronRight size={20} className="text-slate-200 group-hover:text-brand-500 group-hover:translate-x-1 transition-all ml-2" />
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

