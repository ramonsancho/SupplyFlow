import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  ShoppingCart, 
  History,
  LogOut, 
  Bell,
  Search,
  Menu,
  X,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Settings
} from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { isBootstrapAdmin } from '../constants';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { User as UserType } from '../types';
import { motion, AnimatePresence } from 'motion/react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [userProfile, setUserProfile] = useState<UserType | null>(null);
  const profileUnsubscribeRef = React.useRef<(() => void) | null>(null);
  const navigate = useNavigate();
  const { notifications, markAsRead } = useNotifications();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const unsubscribeProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            const userEmail = user.email?.toLowerCase().trim() || '';
            
            if (isBootstrapAdmin(userEmail)) {
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
                  console.error('Error self-healing bootstrap admin:', e);
                });
              }
            }
            
            setUserProfile({ ...userData, id: docSnap.id } as UserType);
          }
        }, (error) => {
          try {
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          } catch (e) {
            console.error('Layout profile fetch error:', e);
          }
        });
        profileUnsubscribeRef.current = unsubscribeProfile;
      } else {
        setUserProfile(null);
        if (profileUnsubscribeRef.current) {
          profileUnsubscribeRef.current();
          profileUnsubscribeRef.current = null;
        }
      }
    });
    return () => {
      unsubscribe();
      if (profileUnsubscribeRef.current) {
        profileUnsubscribeRef.current();
        profileUnsubscribeRef.current = null;
      }
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/suppliers', icon: Users, label: 'Fornecedores' },
    { to: '/rfqs', icon: FileText, label: 'Cotações (RFQ)' },
    { to: '/purchase-orders', icon: ShoppingCart, label: 'Ordens de Compra' },
    { to: '/contracts', icon: FileText, label: 'Contratos' },
    { to: '/users', icon: Users, label: 'Usuários' },
    { to: '/audit-logs', icon: History, label: 'Auditoria' },
  ];

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="text-emerald-500" size={16} />;
      case 'warning': return <AlertTriangle className="text-amber-500" size={16} />;
      case 'error': return <XCircle className="text-rose-500" size={16} />;
      default: return <Info className="text-sky-500" size={16} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-72 bg-slate-900 border-r border-slate-800 shadow-2xl z-20">
        <div className="p-8 flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg overflow-hidden">
            <img 
              src="https://i.ibb.co/PvHCyFtf/logo.png" 
              alt="SupplyFlow Logo" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">SupplyFlow</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mt-1.5 font-bold">Procurement Pro</p>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 group relative",
                isActive 
                  ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} className={cn("transition-transform duration-300", "group-hover:scale-110")} />
                  <span className="font-medium tracking-tight">{item.label}</span>
                  {/* Active Indicator Dot */}
                  <div className={cn(
                    "absolute right-4 w-1.5 h-1.5 rounded-full bg-white transition-opacity duration-300",
                    isActive ? "opacity-100" : "opacity-0"
                  )} />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-6 mt-auto">
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold shadow-inner">
                {userProfile?.name?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{userProfile?.name || 'Usuário'}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider truncate">{userProfile?.role || 'Acesso'}</p>
              </div>
            </div>
            <button 
              onClick={() => handleLogout().catch(err => console.error('Error in handleLogout:', err))}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-slate-700 text-slate-300 hover:bg-rose-500 hover:text-white transition-all duration-300 text-sm font-semibold"
            >
              <LogOut size={16} />
              Sair do Sistema
            </button>
          </div>
          <p className="text-[10px] text-center text-slate-400 mt-4 font-bold tracking-widest uppercase">Version 2.6</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex items-center gap-6">
            <button 
              className="lg:hidden p-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <div className="relative group hidden md:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Pesquisar em SupplyFlow..." 
                className="pl-12 pr-6 py-2.5 bg-slate-100 border-transparent rounded-2xl text-sm w-80 focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications */}
            <div className="relative">
              <button 
                className={cn(
                  "p-2.5 text-slate-500 hover:text-brand-500 hover:bg-brand-50 rounded-xl transition-all relative",
                  isNotificationsOpen && "bg-brand-50 text-brand-500"
                )}
                onClick={() => {
                  setIsNotificationsOpen(!isNotificationsOpen);
                  setIsProfileOpen(false);
                }}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-4 h-4 bg-rose-500 rounded-full border-2 border-white text-[8px] font-bold text-white flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {isNotificationsOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-14 right-0 w-96 bg-white rounded-3xl shadow-2xl shadow-slate-200 border border-slate-200 overflow-hidden z-50"
                  >
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Centro de Notificações</h4>
                      <button onClick={() => setIsNotificationsOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={18} />
                      </button>
                    </div>
                    <div className="max-h-[450px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-12 text-center">
                          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Bell className="text-slate-300" size={24} />
                          </div>
                          <p className="text-sm text-slate-500 font-medium">Tudo limpo por aqui!</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {notifications.map(n => (
                            <div 
                              key={n.id} 
                              className={cn(
                                "p-5 hover:bg-slate-50 transition-colors cursor-pointer group relative",
                                !n.read && "bg-brand-50/30"
                              )}
                              onClick={() => markAsRead(n.id).catch(err => console.error('Error in markAsRead:', err))}
                            >
                              <div className="flex items-start gap-4">
                                <div className="mt-1 p-2 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                                  {getNotificationIcon(n.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-slate-900 mb-1">{n.title}</p>
                                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{n.message}</p>
                                  <p className="text-[10px] text-slate-400 mt-3 font-bold uppercase tracking-wider">
                                    {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                                {!n.read && <div className="w-2 h-2 bg-brand-500 rounded-full mt-2" />}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                      <button className="text-xs font-bold text-brand-600 hover:text-brand-700 transition-colors uppercase tracking-widest">Ver Todas</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button 
                onClick={() => {
                  setIsProfileOpen(!isProfileOpen);
                  setIsNotificationsOpen(false);
                }}
                className="flex items-center gap-3 p-1.5 pr-4 hover:bg-slate-100 rounded-2xl transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform">
                  {userProfile?.name?.charAt(0) || 'U'}
                </div>
                <div className="text-left hidden lg:block">
                  <p className="text-sm font-bold text-slate-900 leading-none mb-1">{userProfile?.name || 'Usuário'}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{userProfile?.role || 'Acesso'}</p>
                </div>
                <ChevronDown size={16} className={cn("text-slate-400 transition-transform duration-300", isProfileOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {isProfileOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-14 right-0 w-64 bg-white rounded-3xl shadow-2xl shadow-slate-200 border border-slate-200 overflow-hidden z-50"
                  >
                    <div className="p-6 text-center bg-slate-50/50 border-b border-slate-100">
                      <div className="w-16 h-16 rounded-2xl bg-brand-500 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3 shadow-lg shadow-brand-500/20">
                        {userProfile?.name?.charAt(0) || 'U'}
                      </div>
                      <p className="font-bold text-slate-900">{userProfile?.name}</p>
                      <p className="text-xs text-slate-500 mt-1">{userProfile?.email}</p>
                    </div>
                    <div className="p-2">
                      <button className="flex items-center gap-3 w-full px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 rounded-xl transition-colors">
                        <Settings size={18} />
                        Configurações
                      </button>
                      <button 
                        onClick={() => handleLogout().catch(err => console.error('Error in handleLogout:', err))}
                        className="flex items-center gap-3 w-full px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                      >
                        <LogOut size={18} />
                        Sair do Sistema
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 relative">
          <div className="max-w-[1600px] mx-auto p-8 lg:p-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Outlet />
            </motion.div>
          </div>
        </div>
      </main>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside 
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-slate-900 z-50 lg:hidden flex flex-col"
            >
              <div className="p-8 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20">
                    <ShoppingCart className="text-white" size={20} />
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-white">SupplyFlow</h1>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={({ isActive }) => cn(
                      "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200",
                      isActive 
                        ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20" 
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    )}
                  >
                    <item.icon size={20} />
                    <span className="font-medium">{item.label}</span>
                  </NavLink>
                ))}
              </nav>
              <div className="p-6 border-t border-slate-800">
                <button 
                  onClick={() => handleLogout().catch(err => console.error('Error in handleLogout:', err))}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-rose-500 text-white font-bold shadow-lg shadow-rose-500/20"
                >
                  <LogOut size={18} />
                  Sair do Sistema
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

