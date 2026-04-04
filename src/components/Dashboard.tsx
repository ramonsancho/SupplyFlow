import React, { useState, useEffect } from 'react';
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
  Cell 
} from 'recharts';
import { TrendingUp, TrendingDown, Clock, CheckCircle2, AlertCircle, ArrowUpRight, FileText } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { PurchaseOrder, RFQ, Supplier, Proposal } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COLORS = ['#141414', '#8E9299', '#E5E5E5', '#F5F5F5'];

export default function Dashboard() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribePOs = onSnapshot(collection(db, 'purchase-orders'), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return { 
          ...d, 
          id: doc.id,
          createdAt: d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
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
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as RFQ[];
      setRfqs(data);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'rfqs');
      } catch (e) {
        console.error('Dashboard RFQs error:', e);
      }
    });

    const unsubscribeProposals = onSnapshot(collection(db, 'proposals'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Proposal[];
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
      setIsLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'suppliers');
      } catch (e) {
        console.error('Dashboard suppliers error:', e);
      }
      setIsLoading(false);
    });

    return () => {
      unsubscribePOs();
      unsubscribeRFQs();
      unsubscribeProposals();
      unsubscribeSuppliers();
    };
  }, []);

  // Calculate KPIs
  const totalSpent = pos.reduce((acc, po) => acc + po.totalAmount, 0);
  
  // Total Savings: difference between highest and accepted proposal for each RFQ
  const totalSavings = rfqs.reduce((acc, rfq) => {
    const rfqProposals = proposals.filter(p => p.rfqId === rfq.id);
    const acceptedProposal = rfqProposals.find(p => p.status === 'accepted');
    if (acceptedProposal && rfqProposals.length >= 2) {
      const prices = rfqProposals.map(p => p.totalValue);
      const maxPrice = Math.max(...prices);
      return acc + (maxPrice - acceptedProposal.totalValue);
    }
    return acc;
  }, 0);

  const openPOsAmount = pos.filter(po => po.status !== 'received' && po.status !== 'closed')
                           .reduce((acc, po) => acc + (po.totalAmount - po.receivedAmount), 0);
  const openPOsCount = pos.filter(po => po.status !== 'received' && po.status !== 'closed').length;
  
  // Calculate Average Approval Time (in hours)
  const approvedPOs = pos.filter(po => po.approvedAt && po.createdAt);
  const totalApprovalTime = approvedPOs.reduce((acc, po) => {
    const start = new Date(po.createdAt).getTime();
    const end = new Date(po.approvedAt!).getTime();
    return acc + (end - start);
  }, 0);
  const avgApprovalTimeHours = approvedPOs.length > 0 
    ? (totalApprovalTime / approvedPOs.length / (1000 * 60 * 60)).toFixed(1) 
    : '0';

  // Calculate Average Lead Time (in days)
  const receivedPOs = pos.filter(po => po.receivedAt && po.createdAt);
  const totalLeadTime = receivedPOs.reduce((acc, po) => {
    const start = new Date(po.createdAt).getTime();
    const end = new Date(po.receivedAt!).getTime();
    return acc + (end - start);
  }, 0);
  const avgLeadTimeDays = receivedPOs.length > 0 
    ? (totalLeadTime / receivedPOs.length / (1000 * 60 * 60 * 24)).toFixed(1) 
    : '0';

  // Calculate Overall Accuracy (Average of all suppliers' accuracy)
  const suppliersWithAccuracy = suppliers.filter(s => s.accuracy !== undefined);
  const overallAccuracy = suppliersWithAccuracy.length > 0
    ? (suppliersWithAccuracy.reduce((acc, s) => acc + (s.accuracy || 0), 0) / suppliersWithAccuracy.length).toFixed(1)
    : '0';

  const getAccuracyLabel = (acc: string) => {
    const val = parseFloat(acc);
    if (val >= 90) return 'Excelente';
    if (val >= 75) return 'Bom';
    if (val >= 50) return 'Regular';
    return 'Crítico';
  };

  // Top Suppliers Ranking
  const supplierSpend: Record<string, { name: string, total: number }> = {};
  pos.forEach(po => {
    if (!supplierSpend[po.supplierId]) {
      supplierSpend[po.supplierId] = { name: po.supplierName, total: 0 };
    }
    supplierSpend[po.supplierId].total += po.totalAmount;
  });
  const topSuppliers = Object.values(supplierSpend)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Spend by Family
  const familySpend: Record<string, number> = {};
  pos.forEach(po => {
    // We assume each PO belongs to a family based on the supplier's primary family or items
    // For simplicity, let's use the first family of the supplier if available
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

  // Calculate 12-month history dynamically
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
      monthlyHistory[monthIndex].spend += po.totalAmount;
    }
  });

  rfqs.forEach(rfq => {
    const rfqDate = rfq.createdAt ? new Date(rfq.createdAt) : null;
    if (!rfqDate) return;

    const monthIndex = monthlyHistory.findIndex(m => 
      m.month === rfqDate.getMonth() && m.year === rfqDate.getFullYear()
    );

    if (monthIndex !== -1) {
      const rfqProposals = proposals.filter(p => p.rfqId === rfq.id);
      const acceptedProposal = rfqProposals.find(p => p.status === 'accepted');
      if (acceptedProposal && rfqProposals.length >= 2) {
        const prices = rfqProposals.map(p => p.totalValue);
        const maxPrice = Math.max(...prices);
        monthlyHistory[monthIndex].savings += (maxPrice - acceptedProposal.totalValue);
      }
    }
  });

  const monthlySpendData = monthlyHistory.map(m => ({ name: m.name, value: m.spend }));
  const monthlySavingsData = monthlyHistory.map(m => ({ name: m.name, value: m.savings }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#141414]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#141414]">Dashboard</h2>
          <p className="text-[#8E9299] mt-1">Visão geral da performance de compras e fornecedores.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[#141414] bg-white px-4 py-2 rounded-full border border-[#E5E5E5]">
            <Clock size={16} />
            <span>Últimos 30 dias</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-[#F5F5F5] rounded-lg">
              <TrendingUp className="text-[#141414]" size={20} />
            </div>
            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">Economia</span>
          </div>
          <h3 className="text-[#8E9299] text-xs font-bold uppercase tracking-widest mt-4">Total de Economia</h3>
          <p className="text-2xl font-bold text-[#141414] mt-1">R$ {totalSavings.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-[#F5F5F5] rounded-lg">
              <FileText className="text-[#141414]" size={20} />
            </div>
            <span className="text-[10px] font-bold text-[#141414] bg-[#F5F5F5] px-2 py-1 rounded-full">{openPOsCount} Ativas</span>
          </div>
          <h3 className="text-[#8E9299] text-xs font-bold uppercase tracking-widest mt-4">Gasto Total</h3>
          <p className="text-2xl font-bold text-[#141414] mt-1">R$ {totalSpent.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-[#F5F5F5] rounded-lg">
              <Clock className="text-[#141414]" size={20} />
            </div>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Eficiência</span>
          </div>
          <h3 className="text-[#8E9299] text-xs font-bold uppercase tracking-widest mt-4">Tempo Médio Aprovação</h3>
          <p className="text-2xl font-bold text-[#141414] mt-1">{avgApprovalTimeHours} h</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-[#F5F5F5] rounded-lg">
              <Clock className="text-[#141414]" size={20} />
            </div>
            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-full">Lead Time</span>
          </div>
          <h3 className="text-[#8E9299] text-xs font-bold uppercase tracking-widest mt-4">Lead Time Médio</h3>
          <p className="text-2xl font-bold text-[#141414] mt-1">{avgLeadTimeDays} dias</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-[#F5F5F5] rounded-lg">
              <CheckCircle2 className="text-[#141414]" size={20} />
            </div>
            <span className={cn(
              "text-[10px] font-bold px-2 py-1 rounded-full",
              parseFloat(overallAccuracy) >= 75 ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"
            )}>
              {overallAccuracy}%
            </span>
          </div>
          <h3 className="text-[#8E9299] text-xs font-bold uppercase tracking-widest mt-4">Acuracidade</h3>
          <p className="text-2xl font-bold text-[#141414] mt-1">{getAccuracyLabel(overallAccuracy)}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-[#141414]">Gasto Mensal</h3>
            <button className="text-[#8E9299] hover:text-[#141414] transition-colors">
              <ArrowUpRight size={20} />
            </button>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySpendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F5" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#8E9299', fontSize: 10 }} 
                  interval={0}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#8E9299', fontSize: 12 }}
                  tickFormatter={(value) => `R$ ${value}`}
                />
                <Tooltip 
                  cursor={{ fill: '#F5F5F5' }}
                  contentStyle={{ 
                    backgroundColor: '#141414', 
                    border: 'none', 
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="value" fill="#141414" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-[#141414]">Economia Gerada por Mês</h3>
            <button className="text-[#8E9299] hover:text-[#141414] transition-colors">
              <ArrowUpRight size={20} />
            </button>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySavingsData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F5" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#8E9299', fontSize: 10 }} 
                  interval={0}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#8E9299', fontSize: 12 }}
                  tickFormatter={(value) => `R$ ${value}`}
                />
                <Tooltip 
                  cursor={{ fill: '#F5F5F5' }}
                  contentStyle={{ 
                    backgroundColor: '#141414', 
                    border: 'none', 
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="value" fill="#8E9299" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] lg:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-[#141414]">Distribuição de Gastos por Família</h3>
            <button className="text-[#8E9299] hover:text-[#141414] transition-colors">
              <ArrowUpRight size={20} />
            </button>
          </div>
          <div className="h-[300px] w-full flex flex-col md:flex-row items-center justify-around">
            <div className="h-full w-full md:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => `R$ ${value.toLocaleString()}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-4 md:mt-0">
              {pieData.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[#141414]">{item.name}</span>
                    <span className="text-[10px] text-[#8E9299]">R$ {item.value.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ranking and Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden">
          <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#141414]">Ranking Principais Fornecedores</h3>
            <span className="text-xs font-bold text-[#8E9299] uppercase tracking-widest">Por Volume de Compra</span>
          </div>
          <div className="divide-y divide-[#E5E5E5]">
            {topSuppliers.map((s, index) => (
              <div key={`${s.name}-${index}`} className="p-6 flex items-center justify-between hover:bg-[#F5F5F5] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#141414] text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <span className="text-sm font-bold text-[#141414]">{s.name}</span>
                </div>
                <span className="text-sm font-bold text-[#141414]">R$ {s.total.toLocaleString()}</span>
              </div>
            ))}
            {topSuppliers.length === 0 && (
              <div className="p-6 text-center text-[#8E9299] text-sm">
                Nenhum dado disponível.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden">
          <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#141414]">Alertas e Prazos</h3>
            <span className="text-xs font-bold text-[#8E9299] uppercase tracking-widest">{rfqs.length} RFQs Ativas</span>
          </div>
          <div className="divide-y divide-[#E5E5E5]">
            {rfqs.slice(0, 3).map(rfq => (
              <div key={rfq.id} className="p-6 flex items-start gap-4 hover:bg-[#F5F5F5] transition-colors cursor-pointer">
                <div className="p-2 bg-orange-50 rounded-lg text-orange-600">
                  <Clock size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#141414]">RFQ #{rfq.number} - {rfq.title}</p>
                  <p className="text-xs text-[#8E9299] mt-1">Vence em {new Date(rfq.desiredDate).toLocaleDateString()}</p>
                </div>
                <span className="text-[10px] font-bold text-[#8E9299] uppercase">Ativa</span>
              </div>
            ))}
            {rfqs.length === 0 && (
              <div className="p-6 text-center text-[#8E9299] text-sm">
                Nenhum alerta no momento.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
