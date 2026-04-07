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
  EyeOff,
  ShieldCheck,
  Building2
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
import { motion, AnimatePresence } from 'motion/react';

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

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        const bootstrapEmails = ["ramon.souza@oeg.group", "ramonsancho@gmail.com"];
        if (bootstrapEmails.includes(user.email?.toLowerCase().trim() || '') && userData.role !== 'Administrador') {
          await setDoc(userRef, { ...userData, role: 'Administrador' }, { merge: true });
        }

        if (userData.status === 'Inativo') {
          await signOut(auth);
          addNotification('Acesso Negado', 'Sua conta está inativa. Entre em contato com o administrador.', 'error');
          setIsLoading(false);
          return;
        }
      } else {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          await signOut(auth);
          addNotification('Acesso Negado', 'Este email não está autorizado no sistema.', 'error');
          setIsLoading(false);
          return;
        }

        const authData = querySnapshot.docs[0].data();
        await setDoc(doc(db, 'users', user.uid), {
          ...authData,
          uid: user.uid,
          updatedAt: serverTimestamp()
        });

        if (querySnapshot.docs[0].id !== user.uid) {
          await deleteDoc(doc(db, 'users', querySnapshot.docs[0].id));
        }

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
      if (error.code === 'auth/operation-not-allowed') {
        message = 'O provedor de E-mail/Senha não está ativado no Firebase Console.';
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
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
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const uid = user.uid;

      const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()));
      const querySnapshot = await getDocs(q);

      const bootstrapEmails = ["ramon.souza@oeg.group", "ramonsancho@gmail.com"];
      const isBootstrap = bootstrapEmails.includes(email.toLowerCase().trim());

      if (querySnapshot.empty && !isBootstrap) {
        await user.delete();
        await signOut(auth);
        addNotification('Acesso Negado', 'Este email não está autorizado no sistema.', 'error');
        setIsLoading(false);
        return;
      }

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        let createdAt = userData.createdAt;
        if (typeof createdAt === 'string') createdAt = new Date(createdAt);
        
        await setDoc(doc(db, 'users', uid), {
          ...userData,
          uid: uid,
          createdAt: createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        if (userDoc.id !== uid) await deleteDoc(doc(db, 'users', userDoc.id));
      } else {
        const isRamon = email.toLowerCase().trim() === "ramon.souza@oeg.group";
        await setDoc(doc(db, 'users', uid), {
          name: isRamon ? "Ramon Souza" : email.split('@')[0],
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
      if (error.code === 'auth/operation-not-allowed') {
        message = 'O provedor de E-mail/Senha não está ativado no Firebase Console.';
      } else if (error.code === 'auth/email-already-in-use') {
        message = 'Este usuário já possui uma senha configurada.';
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
      addNotification('Email Enviado', 'Verifique sua caixa de entrada.', 'info');
    } catch (error: any) {
      addNotification('Erro', 'Erro ao enviar email de recuperação.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-[1000px] grid lg:grid-cols-2 bg-white rounded-[3rem] shadow-2xl overflow-hidden relative z-10"
      >
        {/* Left Side: Branding & Info */}
        <div className="hidden lg:flex flex-col justify-between p-12 bg-slate-900 text-white relative">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-12">
              <div className="w-12 h-12 bg-brand-500 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/20">
                <Building2 className="text-white" size={24} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">SupplyFlow</h1>
            </div>
            
            <div className="space-y-8">
              <h2 className="text-4xl font-bold leading-tight tracking-tight">
                Gestão Inteligente de <span className="text-brand-500">Suprimentos</span> para sua Empresa.
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed">
                Otimize seus processos de compra, gerencie fornecedores e acompanhe cotações em tempo real com nossa plataforma integrada.
              </p>
            </div>
          </div>

          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-4 text-slate-400">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
                <ShieldCheck size={20} className="text-brand-500" />
              </div>
              <p className="text-sm font-medium">Ambiente seguro e auditado</p>
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.3em] font-bold">SupplyFlow Enterprise v1.2.0</p>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="p-8 lg:p-16 bg-white">
          <div className="flex flex-col items-center lg:items-start mb-10">
            <div className="lg:hidden flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
                <Building2 className="text-white" size={20} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">SupplyFlow</h1>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">
              {isFirstAccess ? 'Configurar Acesso' : 'Bem-vindo de volta'}
            </h3>
            <p className="text-slate-500 font-medium">
              {isFirstAccess ? 'Crie sua senha para começar' : 'Acesse sua conta corporativa'}
            </p>
          </div>

          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-10">
            <button 
              onClick={() => setIsFirstAccess(false)}
              className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all duration-300 ${!isFirstAccess ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}
            >
              LOGIN
            </button>
            <button 
              onClick={() => setIsFirstAccess(true)}
              className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all duration-300 ${isFirstAccess ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}
            >
              PRIMEIRO ACESSO
            </button>
          </div>

          <form onSubmit={isFirstAccess ? handleFirstAccess : handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Corporativo</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500 transition-colors" size={18} />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all outline-none text-sm font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Senha</label>
                {!isFirstAccess && (
                  <button 
                    type="button"
                    onClick={() => handleForgotPassword().catch(err => console.error('Error in handleForgotPassword:', err))}
                    className="text-[10px] font-bold text-brand-600 hover:text-brand-700 transition-colors uppercase tracking-widest"
                  >
                    Esqueceu?
                  </button>
                )}
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500 transition-colors" size={18} />
                <input 
                  type={showPassword ? "text" : "password"} 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-14 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all outline-none text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {isFirstAccess && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Confirmar Senha</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500 transition-colors" size={18} />
                    <input 
                      type={showConfirmPassword ? "text" : "password"} 
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-14 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all outline-none text-sm font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-xl shadow-slate-200 hover:bg-brand-600 hover:shadow-brand-500/20 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-10 p-5 bg-brand-50 rounded-2xl flex gap-4 border border-brand-100"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                <AlertCircle className="text-brand-600" size={20} />
              </div>
              <p className="text-xs text-brand-900 leading-relaxed font-medium">
                Se este é seu primeiro acesso, use a aba acima para configurar sua senha pessoal.
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

