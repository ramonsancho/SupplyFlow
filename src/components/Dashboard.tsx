import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { TrendingUp, TrendingDown, Clock, CheckCircle2, AlertCircle, ArrowUpRight, FileText, Users, ShoppingBag, Target, Calendar } from 'lucide-react';
import { db, handleFirestoreError, OperationType, formatDate, formatCurrency } from '../firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { PurchaseOrder, RFQ, Supplier, Proposal, User, Contract } from '../types';
import { auth } from '../firebase';
import { isBootstrapAdmin } from '../constants';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'motion/react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COLORS = ['#0052FF', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function Dashboard() {
  const navigate = useNavigate();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(30);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    if (auth.currentUser) {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      unsubscribeProfile = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          setCurrentUserProfile({ ...docSnap.data(), id: docSnap.id } as User);
        }
      }, (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}`);
        } catch (e) {
          console.error('User profile fetch error in Dashboard:', e);
        }
      });
    }

    const unsubscribePOs = onSnapshot(collection(db, 'purchase-orders'), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return { 
          ...d, 
          id: doc.id,
          createdAt: d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          updatedAt: d.updatedAt?.toDate?.()?.toISOString() || null,
          approvedAt: d.approvedAt?.toDate?.()?.toISOString() || null,
          receivedAt: d.receivedAt?.toDate?.()?.toISOString() || null
        };
      }) as PurchaseOrder[];
      setPos(data);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'purchase-orders');
      } catch (e) {
        console.error('Dashboard POs error:', e);
      }
    });

    const unsubscribeRFQs = onSnapshot(collection(db, 'rfqs'), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return { 
          ...d, 
          id: doc.id,
          createdAt: d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
        };
      }) as RFQ[];
      setRfqs(data);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'rfqs');
      } catch (e) {
        console.error('Dashboard RFQs error:', e);
      }
    });

    const unsubscribeProposals = onSnapshot(collection(db, 'proposals'), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return { 
          ...d, 
          id: doc.id,
          createdAt: d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
        };
      }) as Proposal[];
      setProposals(data);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'proposals');
      } catch (e) {
        console.error('Dashboard proposals error:', e);
      }
    });

    const unsubscribeSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Supplier[];
      setSuppliers(data);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'suppliers');
      } catch (e) {
        console.error('Dashboard suppliers error:', e);
      }
    });

    const unsubscribeContracts = onSnapshot(collection(db, 'contracts'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Contract[];
      setContracts(data);
      setIsLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'contracts');
      } catch (e) {
        console.error('Dashboard contracts error:', e);
      }
      setIsLoading(false);
    });

    return () => {
      if (unsubscribeProfile) unsubscribeProfile();
      unsubscribePOs();
      unsubscribeRFQs();
      unsubscribeProposals();
      unsubscribeSuppliers();
      unsubscribeContracts();
    };
  }, []);

  // Filter data based on selected period and status
  const filteredPOs = pos.filter(po => {
    // Only count non-draft and non-cancelled POs for dashboard metrics
    if (po.status === 'draft' || po.status === 'cancelled') return false;
    
    if (selectedPeriod === 0) return true;
    const poDate = new Date(po.createdAt);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - selectedPeriod);
    return poDate >= cutoff;
  });

  const filteredRFQs = rfqs.filter(rfq => {
    if (selectedPeriod === 0) return true;
    const rfqDate = new Date(rfq.createdAt);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - selectedPeriod);
    return rfqDate >= cutoff;
  });

  // Calculate KPIs
  const totalSpent = filteredPOs.reduce((acc, po) => acc + (po.totalAmount || 0), 0);
  
  const totalSavings = filteredRFQs.reduce((acc, rfq) => {
    // Check if there is an associated valid PO (not cancelled)
    const associatedPO = pos.find(p => p.proposalId && proposals.some(prop => prop.rfqId === rfq.id && prop.id === p.proposalId));
    if (associatedPO && associatedPO.status === 'cancelled') return acc;

    const rfqProposals = proposals.filter(p => p.rfqId === rfq.id);
    const acceptedProposal = rfqProposals.find(p => p.status === 'accepted');
    
    let rfqSavings = 0;

    if (acceptedProposal) {
      // Add explicit discount
      rfqSavings += (acceptedProposal.discountValue || 0);

      // Add market savings (if multiple bidders)
      if (rfqProposals.length >= 2) {
        // To avoid double counting the discount when comparing with competitors,
        // we use the accepted price BEFORE the negotiated discount
        const acceptedPriceBeforeDiscount = (acceptedProposal.totalValue || 0) + (acceptedProposal.discountValue || 0);
        const competitorPrices = rfqProposals
          .filter(p => p.id !== acceptedProposal.id)
          .map(p => p.totalValue)
          .filter(v => typeof v === 'number' && !isNaN(v));

        if (competitorPrices.length > 0) {
          const maxCompetitorPrice = Math.max(...competitorPrices);
          const marketDiff = maxCompetitorPrice - acceptedPriceBeforeDiscount;
          if (marketDiff > 0) {
            rfqSavings += marketDiff;
          }
        }
      }
    }
    
    return acc + (isNaN(rfqSavings) ? 0 : Math.max(0, rfqSavings));
  }, 0);

  const openPOsCount = filteredPOs.filter(po => po.status !== 'received' && po.status !== 'closed').length;
  
  const approvedPOs = filteredPOs.filter(po => po.approvedAt && po.createdAt);
  const totalApprovalTime = approvedPOs.reduce((acc, po) => {
    const start = new Date(po.createdAt).getTime();
    const end = new Date(po.approvedAt!).getTime();
    if (isNaN(start) || isNaN(end)) return acc;
    return acc + (end - start);
  }, 0);
  const avgApprovalTimeHours = approvedPOs.length > 0 
    ? (totalApprovalTime / approvedPOs.length / (1000 * 60 * 60)).toFixed(2) 
    : '0';

  const receivedPOs = filteredPOs.filter(po => po.receivedAt && po.createdAt);
  const totalLeadTime = receivedPOs.reduce((acc, po) => {
    const start = new Date(po.createdAt).getTime();
    const end = new Date(po.receivedAt!).getTime();
    if (isNaN(start) || isNaN(end)) return acc;
    return acc + (end - start);
  }, 0);
  const avgLeadTimeDays = receivedPOs.length > 0 
    ? (totalLeadTime / receivedPOs.length / (1000 * 60 * 60 * 24)).toFixed(2) 
    : '0';

  const suppliersWithAccuracy = suppliers.filter(s => s.accuracy !== undefined);
  const overallAccuracy = suppliersWithAccuracy.length > 0
    ? (suppliersWithAccuracy.reduce((acc, s) => acc + (s.accuracy || 0), 0) / suppliersWithAccuracy.length).toFixed(2)
    : '0';

  const getAccuracyLabel = (acc: string) => {
    const val = parseFloat(acc);
    if (val >= 90) return 'Excelente';
    if (val >= 75) return 'Bom';
    if (val >= 50) return 'Regular';
    return 'Crítico';
  };

  const supplierSpend: Record<string, { name: string, total: number }> = {};
  filteredPOs.forEach(po => {
    if (!supplierSpend[po.supplierId]) {
      supplierSpend[po.supplierId] = { name: po.supplierName, total: 0 };
    }
    supplierSpend[po.supplierId].total += po.totalAmount;
  });
  const topSuppliers = Object.values(supplierSpend)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const familySpend: Record<string, number> = {};
  filteredPOs.forEach(po => {
    const supplier = suppliers.find(s => s.id === po.supplierId);
    const family = supplier?.families[0] || 'Outros';
    familySpend[family] = (familySpend[family] || 0) + po.totalAmount;
  });

  const pieData = Object.entries(familySpend)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  if (pieData.length === 0) {
    pieData.push({ name: 'Sem Dados', value: 1 });
  }

  const getLast12Months = () => {
    const months = [];
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        name: `${monthNames[d.getMonth()]}/${d.getFullYear().toString().slice(-2)}`,
        month: d.getMonth(),
        year: d.getFullYear(),
        spend: 0,
        savings: 0
      });
    }
    return months;
  };

  const monthlyHistory = getLast12Months();
  
  pos.forEach(po => {
    const poDate = po.createdAt ? new Date(po.createdAt) : null;
    if (!poDate) return;
    
    const monthIndex = monthlyHistory.findIndex(m => 
      m.month === poDate.getMonth() && m.year === poDate.getFullYear()
    );
    
    if (monthIndex !== -1) {
      monthlyHistory[monthIndex].spend += (po.totalAmount || 0);
    }
  });

  rfqs.forEach(rfq => {
    const rfqDate = rfq.createdAt ? new Date(rfq.createdAt) : null;
    if (!rfqDate || isNaN(rfqDate.getTime())) return;

    const monthIndex = monthlyHistory.findIndex(m => 
      m.month === rfqDate.getMonth() && m.year === rfqDate.getFullYear()
    );

    if (monthIndex !== -1) {
      const rfqProposals = proposals.filter(p => p.rfqId === rfq.id);
      const acceptedProposal = rfqProposals.find(p => p.status === 'accepted');
      
      let rfqSavings = 0;
      if (acceptedProposal) {
        rfqSavings += (acceptedProposal.discountValue || 0);

        if (rfqProposals.length >= 2) {
          const acceptedPriceBeforeDiscount = (acceptedProposal.totalValue || 0) + (acceptedProposal.discountValue || 0);
          const competitorPrices = rfqProposals
            .filter(p => p.id !== acceptedProposal.id)
            .map(p => p.totalValue)
            .filter(v => typeof v === 'number' && !isNaN(v));

          if (competitorPrices.length > 0) {
            const maxCompetitorPrice = Math.max(...competitorPrices);
            const marketDiff = maxCompetitorPrice - acceptedPriceBeforeDiscount;
            if (marketDiff > 0) {
              rfqSavings += marketDiff;
            }
          }
        }
        
        if (!isNaN(rfqSavings)) {
          monthlyHistory[monthIndex].savings += Math.max(0, rfqSavings);
        }
      }
    }
  });

  const monthlyData = monthlyHistory.map(m => ({ 
    name: m.name, 
    spend: m.spend,
    savings: m.savings
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-slate-200 rounded-full" />
          <div className="absolute inset-0 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const criticalAlerts = pos.filter(po => {
    if (po.status === 'received' || po.status === 'closed' || po.status === 'draft' || po.status === 'cancelled') return false;
    if (po.receivedAmount > 0) return false;
    if (!po.deliveryDate) return false;
    
    const deliveryDate = new Date(po.deliveryDate);
    const now = new Date();
    const diffDays = Math.ceil((deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return diffDays <= 7;
  }).sort((a, b) => {
    const dateA = new Date(a.deliveryDate!).getTime();
    const dateB = new Date(b.deliveryDate!).getTime();
    return dateA - dateB;
  });

  const kpis = [
    { 
      label: 'Gasto Total', 
      value: formatCurrency(totalSpent), 
      icon: ShoppingBag, 
      color: 'brand',
      trend: `${openPOsCount} Ativas`,
      trendUp: null
    },
    { 
      label: 'Total Economizado', 
      value: formatCurrency(totalSavings), 
      icon: Target, 
      color: 'emerald',
      trend: `${((totalSavings / (totalSpent + totalSavings)) * 100).toFixed(2)}% Saving`,
      trendUp: true
    },
    { 
      label: 'Aprovação Média', 
      value: `${avgApprovalTimeHours}h`, 
      icon: Clock, 
      color: 'sky',
      trend: '-2.4h',
      trendUp: true
    },
    { 
      label: 'Para Receber', 
      value: pos.filter(p => (p.status === 'sent' || p.status === 'approved') && p.receivedAmount < p.totalAmount).length.toString(), 
      icon: Calendar, 
      color: 'amber',
      trend: 'OCs Pendentes',
      trendUp: null
    },
    { 
      label: 'Acuracidade', 
      value: `${overallAccuracy}%`, 
      icon: CheckCircle2, 
      color: 'violet',
      trend: getAccuracyLabel(overallAccuracy),
      trendUp: parseFloat(overallAccuracy) >= 75
    },
  ];

  // Calculate Action Items (Inbox)
  const isPowerUser = () => {
    const currentEmail = auth.currentUser?.email?.toLowerCase().trim() || '';
    if (currentEmail.includes('ramon') || currentEmail.includes('carina')) return true;
    if (!currentUserProfile) return false;
    const role = (currentUserProfile.role || '').toLowerCase().trim();
    return ['administrador', 'aprovador', 'aprovadora'].includes(role);
  };

  const isAdmin = isPowerUser();
  const isApprover = isPowerUser();

  const inboxItems = [
    ...(isApprover ? [{
      id: 'pending_approvals',
      title: 'Aprovações Pendentes',
      description: 'Ordens que aguardam seu aval financeiro.',
      count: pos.filter(p => p.status === 'pending_approval').length,
      icon: CheckCircle2,
      color: 'brand',
      link: '/purchase-orders'
    }] : []),
    {
      id: 'late_deliveries',
      title: 'Entregas Atrasadas',
      description: 'OCs com prazo expirado e sem recebimento total.',
      count: pos.filter(po => {
        if (po.status === 'received' || po.status === 'closed' || po.status === 'draft' || po.status === 'cancelled') return false;
        if (!po.deliveryDate) return false;
        return new Date(po.deliveryDate) < new Date() && po.receivedAmount < po.totalAmount;
      }).length,
      icon: AlertCircle,
      color: 'rose',
      link: '/purchase-orders'
    },
    {
      id: 'pending_proposals',
      title: 'RFQs sem Proposta',
      description: 'Cotações enviadas que ainda não receberam ofertas.',
      count: rfqs.filter(r => r.status === 'sent' && !proposals.some(p => p.rfqId === r.id)).length,
      icon: FileText,
      color: 'amber',
      link: '/rfqs'
    },
    {
      id: 'contracts_expiring',
      title: 'Contratos a Vencer',
      description: 'Contratos vigentes com prazo menor que 30 dias.',
      count: contracts.filter(c => {
        if (c.status !== 'active') return false;
        const diff = new Date(c.endDate).getTime() - new Date().getTime();
        return diff > 0 && diff < (1000 * 60 * 60 * 24 * 30);
      }).length,
      icon: TrendingDown,
      color: 'violet',
      link: '/contracts'
    }
  ].filter(item => item.count > 0);

  return (
    <div className="space-y-12">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900">
            {currentUserProfile ? `Olá, ${currentUserProfile.name.split(' ')[0]}` : 'Dashboard Executivo'}
          </h2>
          <p className="text-slate-500 mt-2 text-lg font-medium">
            {currentUserProfile?.role === 'Administrador' ? 'Visão global estratégica de suprimentos.' : 
             currentUserProfile?.role === 'Comprador' ? 'Suas atividades e performance de cotação.' :
             'Suas aprovações e pendências críticas.'}
          </p>
        </div>
        <div className="flex items-center gap-4 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm self-start">
          {[30, 90, 180, 365, 0].map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold transition-all duration-300",
                selectedPeriod === period 
                  ? "bg-slate-900 text-white shadow-lg" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              {period === 0 ? 'Tudo' : `${period} Dias`}
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: Executive KPIs */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-slate-400">
          <TrendingUp size={16} />
          <span className="text-xs font-bold uppercase tracking-widest italic">KPIs Executivos</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {kpis.map((kpi, idx) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-500 group"
            >
              <div className="flex items-center justify-between mb-6">
                <div className={cn(
                  "p-3 rounded-2xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3",
                  kpi.color === 'emerald' && "bg-emerald-50 text-emerald-600",
                  kpi.color === 'brand' && "bg-brand-50 text-brand-600",
                  kpi.color === 'sky' && "bg-sky-50 text-sky-600",
                  kpi.color === 'amber' && "bg-amber-50 text-amber-600",
                  kpi.color === 'violet' && "bg-violet-50 text-violet-600",
                  kpi.color === 'rose' && "bg-rose-50 text-rose-600",
                )}>
                  <kpi.icon size={24} />
                </div>
                {kpi.trend && (
                  <span className={cn(
                    "text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                    kpi.trendUp === true && "text-emerald-600 bg-emerald-50",
                    kpi.trendUp === false && "text-rose-600 bg-rose-50",
                    kpi.trendUp === null && "text-slate-500 bg-slate-50"
                  )}>
                    {kpi.trend}
                  </span>
                )}
              </div>
              <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">{kpi.label}</h3>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{kpi.value}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Row 2: Inbox / Actions */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400">
            <CheckCircle2 size={16} />
            <span className="text-xs font-bold uppercase tracking-widest italic">Minha Central de Ação</span>
          </div>
          {inboxItems.length > 0 && (
            <span className="text-[10px] font-bold text-brand-500 bg-brand-50 px-2 py-1 rounded-full uppercase tracking-wider animate-pulse">
              {inboxItems.length} Pendências Ativas
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {inboxItems.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + (idx * 0.1) }}
              className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-500 flex flex-col h-full relative overflow-hidden group"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className={cn(
                  "p-3 rounded-2xl group-hover:scale-110 transition-transform",
                  item.color === 'brand' && "bg-brand-50 text-brand-600",
                  item.color === 'rose' && "bg-rose-50 text-rose-600",
                  item.color === 'amber' && "bg-amber-50 text-amber-600",
                  item.color === 'violet' && "bg-violet-50 text-violet-600",
                )}>
                  <item.icon size={20} />
                </div>
                <div className="text-4xl font-black text-slate-200 absolute right-6 top-6 transition-colors group-hover:text-slate-100 italic">
                  {item.count}
                </div>
              </div>
              <h4 className="text-lg font-bold text-slate-900 group-hover:text-brand-600 transition-colors">{item.title}</h4>
              <p className="text-sm text-slate-500 mt-1 flex-1">{item.description}</p>
              <button 
                onClick={() => navigate(item.link)}
                className="mt-6 text-xs font-bold text-slate-400 group-hover:text-brand-600 transition-colors uppercase tracking-widest flex items-center gap-2 group-hover:gap-3 transition-all"
              >
                Gerenciar Agora <ArrowUpRight size={14} />
              </button>
            </motion.div>
          ))}
          {inboxItems.length === 0 && (
            <div className="lg:col-span-4 bg-slate-50 border border-dashed border-slate-200 p-12 rounded-[2rem] text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                <CheckCircle2 className="text-emerald-500" size={32} />
              </div>
              <h4 className="text-lg font-bold text-slate-900 italic">Tudo em dia!</h4>
              <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto italic">Você não possui pendências críticas que exigem ação imediata. Ótimo trabalho de gestão.</p>
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Trends and Analysis */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-slate-400">
          <TrendingUp size={16} />
          <span className="text-xs font-bold uppercase tracking-widest italic">Tendências e Análise</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Monthly Performance Chart */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm"
          >
          <div className="flex items-center justify-between mb-10">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Performance Mensal</h3>
              <p className="text-sm text-slate-500 mt-1">Comparativo de gastos e economia gerada.</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-brand-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gastos</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Economia</span>
              </div>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0052FF" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#0052FF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                  tickFormatter={(value) => `${value / 1000}k`}
                />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    border: 'none', 
                    borderRadius: '16px',
                    color: '#fff',
                    padding: '12px 16px',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                  }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="spend" 
                  stroke="#0052FF" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorSpend)" 
                />
                <Bar 
                  dataKey="savings" 
                  fill="#10b981" 
                  radius={[4, 4, 0, 0]} 
                  barSize={12} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Family Distribution Chart */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
          className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm"
        >
          <h3 className="text-xl font-bold text-slate-900 mb-2">Gastos por Família</h3>
          <p className="text-sm text-slate-500 mb-8">Distribuição percentual por categoria.</p>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 mt-6">
            {pieData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">{item.name}</span>
                </div>
                <span className="text-xs font-mono font-bold text-slate-400">R$ {formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>

    {/* Row 4: Performance de Rede e Alertas */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-slate-400">
          <Users size={16} />
          <span className="text-xs font-bold uppercase tracking-widest italic">Performance de Rede e Alertas</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Suppliers */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm"
        >
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Top Fornecedores</h3>
              <p className="text-xs text-slate-500 mt-1">Ranking por volume transacionado.</p>
            </div>
            <Users className="text-slate-300" size={24} />
          </div>
          <div className="divide-y divide-slate-50">
            {topSuppliers.map((s, index) => (
              <div key={s.name} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-all duration-300 group">
                <div className="flex items-center gap-5">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center text-sm font-bold group-hover:bg-brand-500 group-hover:text-white transition-all duration-500">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{s.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">Volume de Compra</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-bold text-slate-900">{formatCurrency(s.total)}</p>
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div 
                      className="h-full bg-brand-500 rounded-full" 
                      style={{ width: `${(s.total / topSuppliers[0].total) * 100}%` }} 
                    />
                  </div>
                </div>
              </div>
            ))}
            {topSuppliers.length === 0 && (
              <div className="p-12 text-center text-slate-400 text-sm font-medium italic">
                Nenhum dado disponível para o período.
              </div>
            )}
          </div>
        </motion.div>

        {/* Active Alerts */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 }}
          className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm"
        >
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Alertas Críticos</h3>
              <p className="text-xs text-slate-500 mt-1">POs sem recebimento e prazo crítico.</p>
            </div>
            <div className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
              {criticalAlerts.length} Críticos
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {criticalAlerts.slice(0, 5).map(po => {
              const deliveryDate = new Date(po.deliveryDate!);
              const now = new Date();
              const isOverdue = deliveryDate < now;
              
              return (
                <div 
                  key={po.id} 
                  onClick={() => navigate('/purchase-orders', { state: { highlightId: po.id } })}
                  className="p-6 flex items-start gap-5 hover:bg-slate-50 transition-all duration-300 cursor-pointer group"
                >
                  <div className={cn(
                    "p-3 rounded-2xl group-hover:scale-110 transition-transform",
                    isOverdue ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                  )}>
                    <AlertCircle size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-slate-900 truncate">OC #{po.number} — {po.supplierName}</p>
                      <ArrowUpRight size={14} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                    </div>
                    <div className="flex items-center gap-4">
                      <p className={cn(
                        "text-xs flex items-center gap-1.5 font-medium",
                        isOverdue ? "text-rose-600" : "text-slate-500"
                      )}>
                        <Calendar size={12} />
                        {isOverdue ? 'Vencido em' : 'Vence em'} {formatDate(po.deliveryDate)}
                      </p>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{formatCurrency(po.totalAmount, po.currency)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {criticalAlerts.length === 0 && (
              <div className="p-12 text-center text-slate-400 text-sm font-medium italic">
                Nenhum alerta crítico no momento.
              </div>
            )}
          </div>
          <div className="p-6 bg-slate-50/50 border-t border-slate-100 text-center">
            <button 
              onClick={() => navigate('/purchase-orders')}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors uppercase tracking-[0.2em]"
            >
              Ver Todas as Ordens
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  </div>
);
}

