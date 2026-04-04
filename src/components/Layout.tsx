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
  LogIn
} from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { User as UserType } from '../types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const [userProfile, setUserProfile] = useState<UserType | null>(null);
  const profileUnsubscribeRef = React.useRef<(() => void) | null>(null);
  const navigate = useNavigate();
  const { notifications, markAsRead } = useNotifications();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const unsubscribeProfile = onSnapshot(userRef, async (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            const bootstrapEmails = ["ramon.souza@oeg.group", "ramonsancho@gmail.com"];
            const userEmail = user.email?.toLowerCase().trim() || '';
            
            // Self-healing for bootstrap admins
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
                try {
                  await setDoc(userRef, updates, { merge: true });
                } catch (e) {
                  console.error('Error self-healing bootstrap admin:', e);
                }
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
      case 'success': return <CheckCircle2 className="text-green-500" size={16} />;
      case 'warning': return <AlertTriangle className="text-orange-500" size={16} />;
      case 'error': return <XCircle className="text-red-500" size={16} />;
      default: return <Info className="text-blue-500" size={16} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#F5F5F5] text-[#141414] font-sans">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-[#001F3F] border-r border-[#002b56]">
        <div className="p-6 border-b border-[#002b56] flex items-center gap-3">
          <img 
            src="https://i.ibb.co/PvHCyFtf/logo.png" 
            alt="SupplyFlow Logo" 
            className="w-10 h-10 rounded-xl object-cover shadow-sm"
            referrerPolicy="no-referrer"
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">SupplyFlow</h1>
            <p className="text-[10px] uppercase tracking-widest text-blue-200/60 mt-0.5 font-semibold">Gestão de Compras</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                isActive 
                  ? "bg-white/10 text-white shadow-lg backdrop-blur-sm" 
                  : "text-blue-200/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-[#002b56]">
          <div className="px-4 py-1 text-xs font-bold text-blue-200/30 uppercase tracking-widest">
            v1.0.1
          </div>
          <button 
            onClick={() => handleLogout().catch(err => console.error('Error in handleLogout:', err))}
            className="flex items-center gap-3 px-4 py-3 w-full text-blue-200/70 hover:text-[#FF4444] transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-[#E5E5E5] flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden p-2 text-[#141414]"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
              <input 
                type="text" 
                placeholder="Buscar em todo o sistema..." 
                className="pl-10 pr-4 py-2 bg-[#F5F5F5] border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-[#141414] transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 relative">
            <button 
              className="p-2 text-[#8E9299] hover:text-[#141414] relative"
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-[#FF4444] rounded-full border-2 border-white text-[8px] font-bold text-white flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute top-12 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-[#E5E5E5] overflow-hidden z-50">
                <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-[#141414]">Notificações</h4>
                  <button onClick={() => setIsNotificationsOpen(false)} className="text-[#8E9299] hover:text-[#141414]">
                    <X size={16} />
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-[#E5E5E5]">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm text-[#8E9299]">Nenhuma notificação por enquanto.</p>
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div 
                        key={n.id} 
                        className={cn("p-4 hover:bg-[#F5F5F5] transition-colors cursor-pointer", !n.read && "bg-blue-50/30")}
                        onClick={() => markAsRead(n.id).catch(err => console.error('Error in markAsRead:', err))}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-1">{getNotificationIcon(n.type)}</div>
                          <div className="flex-1">
                            <p className="text-xs font-bold text-[#141414]">{n.title}</p>
                            <p className="text-[10px] text-[#8E9299] mt-1 leading-relaxed">{n.message}</p>
                            <p className="text-[8px] text-[#8E9299] mt-2 font-bold uppercase">{new Date(n.timestamp).toLocaleTimeString()}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pl-4 border-l border-[#E5E5E5]">
              {userProfile && (
                <>
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-[#141414]">{userProfile.name}</p>
                    <p className="text-[10px] text-[#8E9299] uppercase font-bold tracking-tighter">
                      {userProfile.role}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-[#141414] flex items-center justify-center text-white font-bold">
                    {userProfile.name.charAt(0)}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <Outlet />
        </div>
      </main>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 md:hidden">
          <div className="w-64 h-full bg-[#001F3F] flex flex-col">
            <div className="p-6 border-b border-[#002b56] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img 
                  src="https://i.ibb.co/PvHCyFtf/logo.png" 
                  alt="SupplyFlow Logo" 
                  className="w-8 h-8 rounded-lg object-cover"
                  referrerPolicy="no-referrer"
                />
                <h1 className="text-xl font-bold tracking-tight text-white">SupplyFlow</h1>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="text-white">
                <X size={24} />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) => cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                    isActive 
                      ? "bg-white/10 text-white" 
                      : "text-blue-200/70 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <item.icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="p-4 border-t border-[#002b56]">
              <div className="px-4 py-1 text-xs font-bold text-blue-200/30 uppercase tracking-widest">
                v1.0.1
              </div>
              <button 
                onClick={() => handleLogout().catch(err => console.error('Error in handleLogout:', err))}
                className="flex items-center gap-3 px-4 py-3 w-full text-blue-200/70 hover:text-[#FF4444] transition-colors"
              >
                <LogOut size={20} />
                <span className="font-medium">Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
