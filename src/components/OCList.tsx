import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  ShoppingCart, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  MoreVertical,
  ChevronRight,
  Package,
  DollarSign,
  Trash2,
  CheckCircle,
  Mail,
  Download,
  CheckSquare,
  Star
} from 'lucide-react';
import POModal from './POModal';
import RatingModal from './RatingModal';
import { PurchaseOrder, Supplier, User } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useNotifications } from '../hooks/useNotifications';
import { useAuditLog } from '../hooks/useAuditLog';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  getDocs,
  where
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function OCList() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { addNotification } = useNotifications();
  const { addLog } = useAuditLog();

  useEffect(() => {
    if (auth.currentUser) {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const unsubscribeUser = onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
          setCurrentUserProfile({ ...doc.data(), id: doc.id } as User);
        }
      });

      const qUsers = query(collection(db, 'users'));
      const unsubscribeAllUsers = onSnapshot(qUsers, (snapshot) => {
        const users = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
        setAllUsers(users);
      });

      return () => {
        unsubscribeUser();
        unsubscribeAllUsers();
      };
    }
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'purchase-orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const poData = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          createdAt: d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          approvedAt: d.approvedAt?.toDate?.()?.toISOString() || null,
          receivedAt: d.receivedAt?.toDate?.()?.toISOString() || null,
          completedAt: d.completedAt?.toDate?.()?.toISOString() || null
        };
      }) as PurchaseOrder[];
      setPos(poData);
      setIsLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'purchase-orders');
      } catch (e) {
        console.error('OCList POs error:', e);
      }
    });

    const qSuppliers = query(collection(db, 'suppliers'), orderBy('name', 'asc'));
    const unsubscribeSuppliers = onSnapshot(qSuppliers, (snapshot) => {
      const supplierData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Supplier[];
      setSuppliers(supplierData);
    });

    return () => {
      unsubscribe();
      unsubscribeSuppliers();
    };
  }, []);

  const sendApprovalEmail = (po: PurchaseOrder, approver: User) => {
    // Simulação de envio de email
    console.log(`[EMAIL SIMULADO] Enviando para: ${approver.email}`);
    console.log(`Assunto: Ordem de Compra #${po.number} Pendente de Aprovação`);
    console.log(`Corpo: Olá ${approver.name}, a OC #${po.number} no valor de R$ ${po.totalAmount.toLocaleString()} aguarda sua aprovação.`);
    
    addNotification('Email de Aprovação Enviado', `Notificação enviada para ${approver.name} (${approver.email})`, 'info');
  };

  const handleAddPO = async (data: any) => {
    try {
      const supplier = suppliers.find(s => s.id === data.supplierId);
      const totalAmount = data.items.reduce((acc: number, i: any) => acc + (i.quantity * i.unitPrice) + i.tax, 0);
      
      const poNumber = pos.length + 5001;
      const newPO = {
        ...data,
        number: poNumber,
        supplierName: supplier?.name || 'Fornecedor Desconhecido',
        receivedAmount: 0,
        totalAmount,
        createdAt: serverTimestamp(),
      };

      // Se não for rascunho, verifica se precisa de aprovação
      if (data.status !== 'draft') {
        newPO.status = 'pending_approval';
      }

      const docRef = await addDoc(collection(db, 'purchase-orders'), newPO);
      
      setIsModalOpen(false);
      addLog('Criou OC', 'PurchaseOrder', docRef.id, auth.currentUser?.email || 'Unknown');
      addNotification('OC Gerada', `A ordem de compra #${poNumber} foi emitida para ${supplier?.name}.`, 'success');

      if (newPO.status === 'pending_approval') {
        // Encontrar aprovadores que podem aprovar este valor
        const potentialApprovers = allUsers.filter(u => 
          (u.role === 'Aprovador' || u.role === 'Administrador') && 
          u.status === 'Ativo' &&
          (u.approvalLimit || 0) >= totalAmount
        );

        if (potentialApprovers.length > 0) {
          // Envia para o primeiro aprovador encontrado (ou todos)
          potentialApprovers.forEach(approver => {
            sendApprovalEmail({ ...newPO, id: docRef.id } as any, approver);
          });
        } else {
          addNotification('Atenção', 'Nenhum aprovador com limite suficiente encontrado para este valor.', 'warning');
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'purchase-orders');
    }
  };

  const handleApprove = async (po: PurchaseOrder) => {
    if (!currentUserProfile) return;

    if (currentUserProfile.role === 'Comprador') {
      addNotification('Acesso Negado', 'Compradores não podem aprovar ordens de compra.', 'error');
      return;
    }

    if ((currentUserProfile.approvalLimit || 0) < po.totalAmount && currentUserProfile.role !== 'Administrador') {
      addNotification('Limite Insuficiente', `Seu limite de aprovação (R$ ${currentUserProfile.approvalLimit?.toLocaleString()}) é inferior ao total da OC.`, 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'purchase-orders', po.id), {
        status: 'approved',
        approvedBy: currentUserProfile.name,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      addLog('Aprovou OC', 'PurchaseOrder', po.id, auth.currentUser?.email || 'Unknown');
      addNotification('OC Aprovada', `A ordem de compra #${po.number} foi aprovada com sucesso.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `purchase-orders/${po.id}`);
    }
  };

  const handleReceive = async (id: string) => {
    const oc = pos.find(p => p.id === id);
    if (!oc) return;

    try {
      const remaining = oc.totalAmount - oc.receivedAmount;
      const receiveAmount = Math.min(remaining, 5000); // Mock receiving 5000 at a time
      const newReceived = oc.receivedAmount + receiveAmount;
      const isFullyReceived = newReceived >= oc.totalAmount;
      const newStatus = isFullyReceived ? 'received' : oc.status;
      
      await updateDoc(doc(db, 'purchase-orders', id), {
        receivedAmount: newReceived,
        status: newStatus,
        receivedAt: isFullyReceived ? serverTimestamp() : (oc.receivedAt || null),
        updatedAt: serverTimestamp()
      });

      addLog('Registrou Recebimento', 'PurchaseOrder', id, auth.currentUser?.email || 'Unknown');
      addNotification('Recebimento Registrado', `Recebimento de R$ ${receiveAmount.toLocaleString()} registrado para OC #${oc.number}.`, 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `purchase-orders/${id}`);
    }
  };

  const handleCompletePO = async (rating: number) => {
    if (!selectedPO) return;

    try {
      // 1. Update the PO status to 'closed' and save the rating
      await updateDoc(doc(db, 'purchase-orders', selectedPO.id), {
        status: 'closed',
        rating,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2. Recalculate the supplier's average rating
      const q = query(
        collection(db, 'purchase-orders'), 
        where('supplierId', '==', selectedPO.supplierId),
        where('status', '==', 'closed')
      );
      
      const querySnapshot = await getDocs(q);
      const completedPOs = querySnapshot.docs.map(doc => doc.data() as PurchaseOrder);
      
      // Include the current rating in the calculation (since query might not have it yet if it's not real-time enough)
      // Actually, getDocs should be fine, but let's be safe.
      const ratings = completedPOs.map(p => p.rating).filter(r => r !== undefined) as number[];
      
      // Add the current one if it's not already there (it shouldn't be in the snapshot yet)
      if (!ratings.includes(rating)) {
        ratings.push(rating);
      }

      const averageRating = ratings.reduce((acc, r) => acc + r, 0) / ratings.length;

      // 3. Update the supplier document
      await updateDoc(doc(db, 'suppliers', selectedPO.supplierId), {
        rating: Number(averageRating.toFixed(1)),
        updatedAt: serverTimestamp()
      });

      setIsRatingModalOpen(false);
      setSelectedPO(null);
      addLog('Concluiu OC', 'PurchaseOrder', selectedPO.id, auth.currentUser?.email || 'Unknown');
      addNotification('OC Concluída', `A ordem de compra #${selectedPO.number} foi concluída com nota ${rating}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `purchase-orders/${selectedPO.id}`);
    }
  };

  const handleDeletePO = async (id: string, number: number) => {
    if (window.confirm(`Tem certeza que deseja excluir a OC #${number}?`)) {
      try {
        await deleteDoc(doc(db, 'purchase-orders', id));
        addLog('Excluiu OC', 'PurchaseOrder', id, auth.currentUser?.email || 'Unknown');
        addNotification('OC Excluída', `A ordem de compra #${number} foi removida.`, 'warning');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `purchase-orders/${id}`);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-600';
      case 'pending_approval': return 'bg-yellow-100 text-yellow-600';
      case 'approved': return 'bg-blue-100 text-blue-600';
      case 'sent': return 'bg-orange-100 text-orange-600';
      case 'received': return 'bg-green-100 text-green-600';
      case 'closed': return 'bg-purple-100 text-purple-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Rascunho';
      case 'pending_approval': return 'Pendente de Aprovação';
      case 'approved': return 'Aprovado';
      case 'sent': return 'Enviado';
      case 'received': return 'Recebido';
      case 'closed': return 'Fechado';
      default: return status;
    }
  };

  const generatePDF = (po: PurchaseOrder) => {
    const doc = new jsPDF();
    const supplier = suppliers.find(s => s.id === po.supplierId);

    // Header Image (Placeholder or Text)
    // Since we can't easily load external images into jsPDF without base64, 
    // we'll draw the header text as requested in the image.
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('OEG DO BRASIL ACOND. LOCAC. E SERV.IND. E COM. LTDA', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('RUA COSME VELHO, 410, QD J LT 02 A - CABIUNAS - MACAE - RJ', 105, 28, { align: 'center' });
    doc.text('Fone: (22)2020-0255 - CEP: 27977-315', 105, 34, { align: 'center' });
    doc.text('https://www.oeg.group/', 105, 40, { align: 'center' });
    doc.text('financebrasil@oegoffshore.com', 105, 46, { align: 'center' });

    doc.setLineWidth(0.5);
    doc.line(10, 52, 200, 52);

    // PO Info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`ORDEM DE COMPRA #${po.number}`, 10, 62);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data de Emissão: ${new Date(po.createdAt).toLocaleDateString()}`, 150, 62);

    // Supplier Info
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS DO FORNECEDOR', 10, 75);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nome: ${supplier?.name || po.supplierName}`, 10, 82);
    doc.text(`CNPJ/CPF: ${supplier?.document || 'N/A'}`, 10, 88);
    doc.text(`Email: ${supplier?.email || 'N/A'}`, 10, 94);
    doc.text(`Telefone: ${supplier?.phone || 'N/A'}`, 10, 100);

    // Items Table
    const tableData = po.items.map(item => [
      item.description,
      item.quantity.toString(),
      `R$ ${item.unitPrice.toLocaleString()}`,
      `R$ ${(item.quantity * item.unitPrice).toLocaleString()}`
    ]);

    autoTable(doc, {
      startY: 110,
      head: [['Descrição', 'Qtd', 'Preço Unit.', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [0, 31, 63] },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 150;

    // Total
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL DA ORDEM: R$ ${po.totalAmount.toLocaleString()}`, 140, finalY + 15);

    // Footer Disclaimer
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    const footerText = "AO ACEITAR ESSA ORDEM DE COMPRA O FORNECEDOR RESPONDE POR DANOS CAUSADOS A OEG OFFSHORE E SEUS CLIENTES, INDEPENDENTENDMENTE DE CULPA, BASTANDO PROVAR O NEXO DE CAUSALIDADE ENTRE DEFEITO E DANO E/OU RESPONDERÁ DE FORMA DIRETA OU  SOLIDARIAMENTE PELOS VICIOS DE QUALIDADE OU QUANTIDADE.";
    const splitFooter = doc.splitTextToSize(footerText, 180);
    doc.text(splitFooter, 10, 270);

    doc.save(`OC_${po.number}.pdf`);
    addNotification('PDF Gerado', `Ordem de compra #${po.number} salva com sucesso.`, 'success');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#141414]">Ordens de Compra (OC)</h2>
          <p className="text-[#8E9299] mt-1">Acompanhe pedidos, recebimentos e saldos.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-[#141414] text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:scale-105 transition-all"
        >
          <Plus size={20} />
          <span>Nova Ordem de Compra</span>
        </button>
      </div>

      <POModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleAddPO}
        suppliers={suppliers}
      />

      <RatingModal
        isOpen={isRatingModalOpen}
        onClose={() => setIsRatingModalOpen(false)}
        onSubmit={handleCompletePO}
        poNumber={selectedPO?.number || 0}
        supplierName={selectedPO?.supplierName || ''}
      />

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por OC, fornecedor..." 
            className="w-full pl-10 pr-4 py-2 bg-[#F5F5F5] border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-[#141414] bg-white border border-[#E5E5E5] rounded-lg hover:bg-[#F5F5F5] transition-colors">
          <Filter size={18} />
          <span>Filtros</span>
        </button>
      </div>

      {/* OC Grid */}
      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#141414]"></div>
          </div>
        ) : pos.length === 0 ? (
          <div className="bg-white rounded-3xl border border-[#E5E5E5] p-12 text-center">
            <ShoppingCart size={48} className="mx-auto text-[#E5E5E5] mb-4" />
            <h3 className="text-lg font-bold text-[#141414]">Nenhuma ordem de compra encontrada</h3>
            <p className="text-[#8E9299] mt-1">Clique em "Nova Ordem de Compra" para começar.</p>
          </div>
        ) : (
          pos.map((oc) => (
            <div key={oc.id} className="bg-white rounded-3xl border border-[#E5E5E5] p-6 hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center gap-8">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm font-bold text-[#141414]">#{oc.number}</span>
                  <div className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest", getStatusColor(oc.status))}>
                    {getStatusLabel(oc.status)}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-[#141414]">{oc.supplierName}</h3>
                <p className="text-xs text-[#8E9299] mt-1">Emitida em {new Date(oc.createdAt).toLocaleDateString()}</p>
                {oc.status === 'closed' && oc.rating !== undefined && (
                  <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-full w-fit mt-2">
                    <Star size={12} className="fill-yellow-400 text-yellow-400" />
                    <span className="text-[10px] font-bold text-yellow-700">Avaliação: {oc.rating}/10</span>
                  </div>
                )}
                {oc.approvedBy && (
                  <p className="text-[10px] text-blue-600 font-bold mt-1 flex items-center gap-1">
                    <CheckCircle size={12} />
                    Aprovado por {oc.approvedBy}
                  </p>
                )}
              </div>

              <div className="flex-1 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest mb-1">Total</p>
                  <p className="text-lg font-bold text-[#141414]">R$ {oc.totalAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest mb-1">Recebido</p>
                  <p className="text-lg font-bold text-green-600">R$ {oc.receivedAmount.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex-1">
                <p className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest mb-2">Saldo em Aberto</p>
                <div className="w-full bg-[#F5F5F5] h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#141414] h-full transition-all duration-1000" 
                    style={{ width: `${(oc.receivedAmount / oc.totalAmount) * 100}%` }}
                  ></div>
                </div>
                <p className="text-xs font-bold text-[#141414] mt-2">
                  R$ {(oc.totalAmount - oc.receivedAmount).toLocaleString()} pendente
                </p>
              </div>

              <div className="flex items-center gap-4">
                {oc.status === 'pending_approval' && (
                  <button 
                    onClick={() => handleApprove(oc)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all shadow-md"
                  >
                    <CheckCircle size={16} />
                    <span>Aprovar</span>
                  </button>
                )}
                <button 
                  onClick={() => generatePDF(oc)}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0052FF] rounded-lg hover:bg-blue-700 transition-all shadow-md"
                  title="Baixar PDF"
                >
                  <Download size={16} />
                  <span>PDF</span>
                </button>
                <button 
                  onClick={() => handleReceive(oc.id)}
                  disabled={oc.status === 'draft' || oc.status === 'pending_approval' || oc.status === 'received' || oc.status === 'closed'}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#141414] bg-[#F5F5F5] rounded-lg hover:bg-[#E5E5E5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Package size={16} />
                  <span>Receber</span>
                </button>
                {oc.status !== 'closed' && oc.status !== 'draft' && oc.status !== 'pending_approval' && (
                  <button 
                    onClick={() => {
                      setSelectedPO(oc);
                      setIsRatingModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-all shadow-md"
                  >
                    <CheckSquare size={16} />
                    <span>Concluir</span>
                  </button>
                )}
                <button 
                  onClick={() => handleDeletePO(oc.id, oc.number)}
                  className="p-2 text-[#8E9299] hover:text-[#FF4444] hover:bg-red-50 rounded-full transition-all"
                  title="Excluir"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
