import React, { useState } from 'react';
import { 
  LogIn, 
  Mail, 
  Lock, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  UserPlus,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  auth, 
  db 
} from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  serverTimestamp
} from 'firebase/firestore';
import { useNotifications } from '../hooks/useNotifications';

export default function Login() {
  const [isFirstAccess, setIsFirstAccess] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { addNotification } = useNotifications();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Verificar status do usuário no Firestore
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.status === 'Inativo') {
          await signOut(auth);
          addNotification('Acesso Negado', 'Sua conta está inativa. Entre em contato com o administrador.', 'error');
          setIsLoading(false);
          return;
        }
      } else {
        // Caso o usuário exista no Auth mas não no Firestore (raro, mas possível)
        // Verificar se ele está autorizado por email
        const q = query(collection(db, 'users'), where('email', '==', email));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          await signOut(auth);
          addNotification('Acesso Negado', 'Este email não está autorizado no sistema.', 'error');
          setIsLoading(false);
          return;
        }

        const authData = querySnapshot.docs[0].data();
        if (authData.status === 'Inativo') {
          await signOut(auth);
          addNotification('Acesso Negado', 'Sua conta está inativa.', 'error');
          setIsLoading(false);
          return;
        }
      }

      addNotification('Bem-vindo!', 'Login realizado com sucesso.', 'success');
    } catch (error: any) {
      let message = 'Erro ao realizar login. Verifique suas credenciais.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        message = 'Email ou senha incorretos.';
      }
      addNotification('Erro de Login', message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFirstAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      addNotification('Erro', 'As senhas não coincidem.', 'error');
      return;
    }

    if (password.length < 6) {
      addNotification('Erro', 'A senha deve ter pelo menos 6 caracteres.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      // 1. Criar o usuário no Firebase Auth primeiro para estarmos autenticados
      // Isso permite que as regras do Firestore funcionem (allow read: if isAuthenticated())
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const uid = user.uid;

      // 2. Agora autenticados, verificar se o email está cadastrado na coleção 'users'
      const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()));
      const querySnapshot = await getDocs(q);

      // Bootstrap emails
      const bootstrapEmails = ["ramon.souza@oeg.group", "ramonsancho@gmail.com"];
      const isBootstrap = bootstrapEmails.includes(email.toLowerCase().trim());

      if (querySnapshot.empty && !isBootstrap) {
        // Se não autorizado, deletamos o usuário do Auth e deslogamos
        await user.delete();
        await signOut(auth);
        addNotification('Acesso Negado', 'Este email não está autorizado no sistema. Entre em contato com o administrador.', 'error');
        setIsLoading(false);
        return;
      }

      // 3. Vincular o UID ao documento do Firestore
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        
        // Garantir que createdAt seja um Timestamp se for string
        let createdAt = userData.createdAt;
        if (typeof createdAt === 'string') {
          createdAt = new Date(createdAt);
        }
        
        await setDoc(doc(db, 'users', uid), {
          ...userData,
          uid: uid,
          createdAt: createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Deletar o documento antigo (que tinha ID aleatório ou temporário)
        if (userDoc.id !== uid) {
          await deleteDoc(doc(db, 'users', userDoc.id));
        }
      } else {
        // Criar novo documento para o bootstrap
        await setDoc(doc(db, 'users', uid), {
          name: email.split('@')[0],
          email: email.toLowerCase().trim(),
          role: 'Administrador',
          status: 'Ativo',
          uid: uid,
          approvalLimit: 10000000,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      addNotification('Conta Criada!', 'Seu primeiro acesso foi configurado com sucesso.', 'success');
    } catch (error: any) {
      console.error('First access error details:', error);
      let message = 'Erro ao configurar primeiro acesso.';
      
      // Se for erro de permissão, dar uma dica mais clara
      if (error.message && error.message.includes('insufficient permissions')) {
        message = 'Erro de permissão no banco de dados. Verifique se seu email está autorizado.';
      } else if (error.code === 'auth/email-already-in-use') {
        message = 'Este usuário já possui uma senha configurada. Tente fazer login.';
      } else if (error.code === 'auth/weak-password') {
        message = 'A senha deve ter pelo menos 6 caracteres.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'Email inválido.';
      } else if (error.message) {
        message = error.message;
      }
      addNotification('Erro', message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      addNotification('Atenção', 'Informe seu email para recuperar a senha.', 'warning');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      addNotification('Email Enviado', 'Verifique sua caixa de entrada para resetar a senha.', 'info');
    } catch (error: any) {
      addNotification('Erro', 'Erro ao enviar email de recuperação.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl border border-[#E5E5E5] overflow-hidden">
        <div className="p-10">
          <div className="flex flex-col items-center mb-10">
            <div className="flex items-center gap-3 mb-2">
              <img 
                src="https://i.ibb.co/PvHCyFtf/logo.png" 
                alt="SupplyFlow Logo" 
                className="w-12 h-12 rounded-2xl object-cover shadow-lg"
                referrerPolicy="no-referrer"
              />
              <h1 className="text-3xl font-bold text-[#141414] tracking-tight">SupplyFlow</h1>
            </div>
            <p className="text-[#8E9299] font-medium uppercase tracking-[0.2em] text-[10px]">Gestão de Suprimentos</p>
          </div>

          <div className="flex bg-[#F5F5F5] p-1 rounded-2xl mb-8">
            <button 
              onClick={() => setIsFirstAccess(false)}
              className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${!isFirstAccess ? 'bg-white text-[#141414] shadow-sm' : 'text-[#8E9299] hover:text-[#141414]'}`}
            >
              LOGIN
            </button>
            <button 
              onClick={() => setIsFirstAccess(true)}
              className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${isFirstAccess ? 'bg-white text-[#141414] shadow-sm' : 'text-[#8E9299] hover:text-[#141414]'}`}
            >
              PRIMEIRO ACESSO
            </button>
          </div>

          <form onSubmit={isFirstAccess ? handleFirstAccess : handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#141414] uppercase tracking-widest ml-1">Email Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-12 pr-4 py-4 bg-[#F5F5F5] border-none rounded-2xl focus:ring-2 focus:ring-[#141414] transition-all text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-bold text-[#141414] uppercase tracking-widest">Senha</label>
                {!isFirstAccess && (
                  <button 
                    type="button"
                    onClick={() => handleForgotPassword().catch(err => console.error('Error in handleForgotPassword:', err))}
                    className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-widest"
                  >
                    Esqueceu?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
                <input 
                  type={showPassword ? "text" : "password"} 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-14 py-4 bg-[#F5F5F5] border-none rounded-2xl focus:ring-2 focus:ring-[#141414] transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-black/5 text-[#8E9299] hover:text-[#141414] transition-all"
                  title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  <span className="text-[9px] font-bold uppercase">{showPassword ? 'Ocultar' : 'Ver'}</span>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {isFirstAccess && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                <label className="text-[10px] font-bold text-[#141414] uppercase tracking-widest ml-1">Confirmar Senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-14 py-4 bg-[#F5F5F5] border-none rounded-2xl focus:ring-2 focus:ring-[#141414] transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-black/5 text-[#8E9299] hover:text-[#141414] transition-all"
                    title={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <span className="text-[9px] font-bold uppercase">{showConfirmPassword ? 'Ocultar' : 'Ver'}</span>
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#141414] text-white py-4 rounded-2xl font-bold shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isFirstAccess ? 'Configurar Acesso' : 'Entrar no Sistema'}</span>
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>

          {!isFirstAccess && (
            <div className="mt-8 p-4 bg-blue-50 rounded-2xl flex gap-3 border border-blue-100">
              <AlertCircle className="text-blue-600 shrink-0" size={20} />
              <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
                Se este é seu primeiro acesso, use a aba acima para configurar sua senha pessoal.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
