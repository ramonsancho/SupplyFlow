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
  Star,
  Edit2
} from 'lucide-react';
import POModal from './POModal';
import RatingModal from './RatingModal';
import ReceiveModal from './ReceiveModal';
import ConfirmModal from './ConfirmModal';
import ReceiptHistoryModal from './ReceiptHistoryModal';
import EditAmountModal from './EditAmountModal';
import { PurchaseOrder, Supplier, User, Receipt } from '../types';
import { poService } from '../services/poService';
import { emailService } from '../services/emailService';
import { teamsService } from '../services/teamsService';
import { notificationService } from '../services/notificationService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useNotifications } from '../hooks/useNotifications';
import { useAuditLog } from '../hooks/useAuditLog';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  getDocs,
  where,
  arrayUnion
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function OCList() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isEditAmountModalOpen, setIsEditAmountModalOpen] = useState(false);
  const [selectedPOForHistory, setSelectedPOForHistory] = useState<PurchaseOrder | null>(null);
  const [poToDelete, setPoToDelete] = useState<{id: string, number: number} | null>(null);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { addNotification } = useNotifications();
  const { addLog } = useAuditLog();

  useEffect(() => {
    if (auth.currentUser) {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          const bootstrapEmails = ["ramon.souza@oeg.group", "ramonsancho@gmail.com"];
          const userEmail = auth.currentUser?.email?.toLowerCase().trim() || '';
          
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
              setDoc(userRef, updates, { merge: true }).catch(e => {
                console.error('Error self-healing bootstrap admin in OCList:', e);
              });
            }
          }
          
          setCurrentUserProfile({ ...userData, id: docSnap.id } as User);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}`);
      });

      const qUsers = query(collection(db, 'users'));
      const unsubscribeAllUsers = onSnapshot(qUsers, (snapshot) => {
        const users = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
        setAllUsers(users);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
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
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'suppliers');
      } catch (e) {
        console.error('OCList suppliers fetch error:', e);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSuppliers();
    };
  }, []);

  const sendApprovalEmail = async (po: PurchaseOrder, approver: User) => {
    const { emailSuccess, teamsSuccess } = await notificationService.sendPOApprovalNotification(po, approver, currentUserProfile?.name || 'Sistema');
    
    if (emailSuccess) {
      await addNotification('Email Enviado', `Notificação por e-mail enviada para ${approver.name}`, 'info');
    }
    
    if (teamsSuccess) {
      await addNotification('Teams Notificado', `Mensagem enviada para ${approver.name} no Teams`, 'success');
    }

    if (!emailSuccess && !teamsSuccess) {
      await addNotification('Erro na Notificação', `Não foi possível notificar ${approver.name}.`, 'warning');
    }
  };

  const handleAddPO = async (data: any) => {
    try {
      const poNumber = await poService.getNextPONumber();
      const supplier = suppliers.find(s => s.id === data.supplierId);
      const totalAmount = Math.round(data.items.reduce((acc: number, i: any) => acc + (i.quantity * i.unitPrice) + (i.tax || 0), 0) * 100) / 100;
      
      const poPayload = {
        ...data,
        number: poNumber,
        supplierName: supplier?.name || 'Fornecedor Desconhecido',
        receivedAmount: 0,
        totalAmount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        revision: 0,
        createdBy: auth.currentUser?.uid,
        createdByName: currentUserProfile?.name || auth.currentUser?.displayName || auth.currentUser?.email || 'Sistema',
      };

      // Se não for rascunho, verifica se precisa de aprovação
      if (data.status !== 'draft') {
        poPayload.status = 'pending_approval';
      }

      const docRef = await addDoc(collection(db, 'purchase-orders'), poPayload);
      
      setIsModalOpen(false);
      await addLog('Criou OC', 'PurchaseOrder', docRef.id, auth.currentUser?.email || 'Unknown');
      await addNotification('OC Gerada', `A ordem de compra #${poNumber} foi emitida para ${supplier?.name}.`, 'success');

      if (poPayload.status === 'pending_approval') {
        // Encontrar aprovadores que podem aprovar este valor diretamente do Firestore para garantir dados atualizados
        console.log(`[Approval] Verificando aprovadores para OC #${poNumber} no valor de R$ ${totalAmount}`);
        
        try {
          const usersRef = collection(db, 'users');
          // Fetch all active users and filter in memory to be more robust against index issues or case sensitivity
          const qApprovers = query(usersRef, where('status', '==', 'Ativo'));
          
          const approversSnapshot = await getDocs(qApprovers);
          const allActiveUsers = approversSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
          
          const potentialApprovers = allActiveUsers.filter(u => {
            const isApprover = u.role === 'Aprovador' || u.role === 'Administrador';
            // Administradores podem aprovar qualquer valor, Aprovadores dependem do limite
            const hasLimit = u.role === 'Administrador' || Number(u.approvalLimit || 0) >= totalAmount;
            return isApprover && hasLimit;
          });

          console.log(`[Approval] Detalhes dos usuários ativos:`, allActiveUsers.map(u => ({ name: u.name, role: u.role, limit: u.approvalLimit, email: u.email })));
          console.log(`[Approval] Usuários ativos: ${allActiveUsers.length}, Aprovadores com limite: ${potentialApprovers.length}`);

          if (potentialApprovers.length > 0) {
            const approverNames = potentialApprovers.map(u => u.name).join(', ');
            await addNotification('Aprovadores Encontrados', `Elegíveis: ${approverNames}`, 'info');
            
            let emailCount = 0;
            let teamsCount = 0;

            const poForNotification: PurchaseOrder = {
              id: docRef.id,
              number: poNumber,
              supplierName: supplier?.name || 'Fornecedor',
              supplierId: data.supplierId,
              totalAmount,
              status: 'pending_approval',
              createdBy: auth.currentUser?.uid || '',
              items: data.items,
              receivedAmount: 0,
              createdAt: new Date().toISOString()
            };

            for (const approver of potentialApprovers) {
              const { emailSuccess, teamsSuccess } = await notificationService.sendPOApprovalNotification(
                poForNotification, 
                approver, 
                currentUserProfile?.name || 'Sistema'
              );
              if (emailSuccess) emailCount++;
              if (teamsSuccess) teamsCount++;
            }

            if (emailCount > 0) {
              await addNotification('Emails Enviados', `${emailCount} e-mail(s) de aprovação enviado(s).`, 'success');
            }
            if (teamsCount > 0) {
              await addNotification('Teams Notificado', `${teamsCount} alerta(s) enviado(s) via Teams.`, 'success');
            }
          } else {
            const reason = allActiveUsers.length === 0 
              ? 'Nenhum usuário ativo encontrado no sistema.'
              : `Encontrados ${allActiveUsers.length} usuários ativos, mas nenhum com perfil de Aprovador/Admin e limite >= R$ ${totalAmount.toLocaleString()}.`;
            
            console.warn(`[Approval] ${reason}`);
            await addNotification('Atenção', reason, 'warning');
          }
        } catch (approverError) {
          console.error('[Approval] Erro ao buscar aprovadores ou enviar e-mails:', approverError);
          await addNotification('Erro de Notificação', 'A OC foi criada, mas houve um erro ao processar os e-mails de aprovação.', 'error');
        }
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, 'purchase-orders');
      } catch (e) {
        console.error('PO add error:', e);
      }
    }
  };

  const handleApprove = async (po: PurchaseOrder) => {
    if (!currentUserProfile) return;

    if (currentUserProfile.role === 'Comprador') {
      await addNotification('Acesso Negado', 'Compradores não podem aprovar ordens de compra.', 'error');
      return;
    }

    if ((currentUserProfile.approvalLimit || 0) < po.totalAmount && currentUserProfile.role !== 'Administrador') {
      await addNotification('Limite Insuficiente', `Seu limite de aprovação (R$ ${currentUserProfile.approvalLimit?.toLocaleString()}) é inferior ao total da OC.`, 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'purchase-orders', po.id), {
        status: 'approved',
        approvedBy: currentUserProfile.name,
        approvedByName: currentUserProfile.name,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await addLog('Aprovou OC', 'PurchaseOrder', po.id, auth.currentUser?.email || 'Unknown');
      await addNotification('OC Aprovada', `A ordem de compra #${po.number} foi aprovada com sucesso.`, 'success');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `purchase-orders/${po.id}`);
      } catch (e) {
        console.error('PO approve error:', e);
      }
    }
  };

  const handleReceive = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setIsReceiveModalOpen(true);
  };

  const onReceiveSubmit = async (amount: number, invoiceNumber: string) => {
    if (!selectedPO) return;

    try {
      const newReceived = selectedPO.receivedAmount + amount;
      const isFullyReceived = newReceived >= selectedPO.totalAmount - 0.01; // Tolerance
      const newStatus = isFullyReceived ? 'received' : selectedPO.status;
      
      const newReceipt: Receipt = {
        id: crypto.randomUUID(),
        amount,
        invoiceNumber,
        receivedAt: new Date().toISOString(),
        receivedBy: auth.currentUser?.email || 'Unknown'
      };

      await updateDoc(doc(db, 'purchase-orders', selectedPO.id), {
        receivedAmount: newReceived,
        status: newStatus,
        receipts: arrayUnion(newReceipt),
        receivedAt: isFullyReceived ? serverTimestamp() : (selectedPO.receivedAt || null),
        updatedAt: serverTimestamp()
      });

      await addLog('Registrou Recebimento', 'PurchaseOrder', selectedPO.id, auth.currentUser?.email || 'Unknown');
      await addNotification('Recebimento Registrado', `Recebimento de R$ ${amount.toLocaleString()} (NF: ${invoiceNumber}) registrado para OC #${selectedPO.number}.`, 'info');
      setIsReceiveModalOpen(false);
      setSelectedPO(null);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `purchase-orders/${selectedPO.id}`);
      } catch (e) {
        console.error('PO receive error:', e);
      }
    }
  };

  const handleEditAmount = async (newAmount: number, items?: any[]) => {
    if (!selectedPO) return;

    try {
      const oldAmount = selectedPO.totalAmount;
      const newRevision = (selectedPO.revision || 0) + 1;
      const updateData: any = {
        totalAmount: newAmount,
        updatedAt: serverTimestamp(),
        revision: newRevision
      };

      if (items) {
        updateData.items = items;
      }

      await updateDoc(doc(db, 'purchase-orders', selectedPO.id), updateData);

      await addLog(`Editou OC (Rev ${newRevision})`, 'PurchaseOrder', selectedPO.id, auth.currentUser?.email || 'Unknown');
      await addNotification('OC Atualizada', `A OC #${selectedPO.number} foi atualizada para a revisão ${newRevision}.`, 'success');
      setIsEditAmountModalOpen(false);
      setSelectedPO(null);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `purchase-orders/${selectedPO.id}`);
      } catch (e) {
        console.error('PO edit amount error:', e);
      }
    }
  };

  const handleCompletePO = async (rating: number, hasRNC: boolean) => {
    if (!selectedPO) return;

    try {
      // 1. Update the PO status to 'closed' and save the rating and RNC
      await updateDoc(doc(db, 'purchase-orders', selectedPO.id), {
        status: 'closed',
        rating,
        hasRNC,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2. Recalculate the supplier's average rating and accuracy
      const q = query(
        collection(db, 'purchase-orders'), 
        where('supplierId', '==', selectedPO.supplierId),
        where('status', '==', 'closed')
      );
      
      const querySnapshot = await getDocs(q);
      const completedPOs = querySnapshot.docs.map(doc => doc.data() as PurchaseOrder);
      
      // Include current data if not in snapshot
      const ratings = completedPOs.map(p => p.rating).filter(r => r !== undefined) as number[];
      const rncValues = completedPOs.map(p => p.hasRNC).filter(r => r !== undefined) as boolean[];

      if (!completedPOs.some(p => p.id === selectedPO.id)) {
        ratings.push(rating);
        rncValues.push(hasRNC);
      }

      const averageRating = ratings.reduce((acc, r) => acc + r, 0) / ratings.length;
      
      // Accuracy: percentage of POs WITHOUT RNC
      const accuratePOs = rncValues.filter(r => r === false).length;
      const accuracy = (accuratePOs / rncValues.length) * 100;

      // 3. Update the supplier document
      await updateDoc(doc(db, 'suppliers', selectedPO.supplierId), {
        rating: Number(averageRating.toFixed(1)),
        accuracy: Number(accuracy.toFixed(1)),
        updatedAt: serverTimestamp()
      });

      setIsRatingModalOpen(false);
      setSelectedPO(null);
      await addLog('Concluiu OC', 'PurchaseOrder', selectedPO.id, auth.currentUser?.email || 'Unknown');
      await addNotification('OC Concluída', `A ordem de compra #${selectedPO.number} foi concluída com nota ${rating} e RNC: ${hasRNC ? 'SIM' : 'NÃO'}.`, 'success');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `purchase-orders/${selectedPO.id}`);
      } catch (e) {
        console.error('PO complete error:', e);
      }
    }
  };

  const handleDeletePO = async (id: string, number: number) => {
    try {
      await deleteDoc(doc(db, 'purchase-orders', id));
      await addLog('Excluiu OC', 'PurchaseOrder', id, auth.currentUser?.email || 'Unknown');
      await addNotification('OC Excluída', `A ordem de compra #${number} foi removida.`, 'warning');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `purchase-orders/${id}`);
      } catch (e) {
        console.error('PO delete error:', e);
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

  const generatePDF = async (po: PurchaseOrder) => {
    const doc = new jsPDF();
    const supplier = suppliers.find(s => s.id === po.supplierId);

    // Logo (Top Left)
    try {
      doc.addImage('https://i.ibb.co/PvHCyFtf/logo.png', 'PNG', 10, 10, 30, 30);
    } catch (e) {
      // Fallback if image fails
      doc.setFillColor(0, 82, 255);
      doc.rect(10, 10, 30, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SupplyFlow', 25, 28, { align: 'center' });
    }

    // Company Info
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('OEG DO BRASIL ACONDICIONAMENTO LOCAÇÃO E SERVIÇOS INDUSTRIAIS E COMERCIAIS LTDA', 115, 20, { align: 'center', maxWidth: 130 });
    
    doc.setFontSize(10);
    doc.text('CNPJ: 13.595.820/0001-15', 115, 32, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('RUA COSME VELHO, 410, QD J, LT 02A - CABIÚNAS - MACAÉ - RJ', 115, 38, { align: 'center' });
    doc.text('CEP: 27977-315 - Telefone: (22) 2020-0255 | https://www.oeg.group/', 115, 44, { align: 'center' });
    doc.text('financebrasil@oegoffshore.com', 115, 50, { align: 'center' });

    doc.setLineWidth(0.5);
    doc.line(10, 55, 200, 55);

    // PO Info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    const poNumberDisplay = po.revision && po.revision > 0 ? `#${po.number} rev${po.revision}` : `#${po.number}`;
    doc.text(`ORDEM DE COMPRA ${poNumberDisplay}`, 10, 65);
    doc.setFont('helvetica', 'normal');
    
    // Use updatedAt for revised POs, otherwise createdAt
    const displayDate = po.revision && po.revision > 0 && po.updatedAt 
      ? new Date(po.updatedAt).toLocaleDateString()
      : new Date(po.createdAt).toLocaleDateString();
      
    doc.text(`Data de Emissão: ${displayDate}`, 150, 65);

    // Supplier Info
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS DO FORNECEDOR', 10, 78);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nome: ${supplier?.name || po.supplierName}`, 10, 85);
    doc.text(`CNPJ/CPF: ${supplier?.document || 'N/A'}`, 10, 91);
    doc.text(`Endereço: ${supplier?.address || 'N/A'}`, 10, 97);
    doc.text(`Email: ${supplier?.email || 'N/A'}`, 10, 103);
    doc.text(`Telefone: ${supplier?.phone || 'N/A'}`, 10, 109);
    doc.text(`Condição de Pagamento: ${supplier?.paymentTerms || 'N/A'}`, 10, 115);

    // Items Table
    const tableData = po.items.map(item => [
      item.description,
      item.quantity.toString(),
      `R$ ${item.unitPrice.toLocaleString()}`,
      `R$ ${(item.quantity * item.unitPrice).toLocaleString()}`
    ]);

    autoTable(doc, {
      startY: 125,
      head: [['Descrição', 'Qtd', 'Preço Unit.', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [0, 31, 63] },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 150;

    // Total
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL DA ORDEM: R$ ${po.totalAmount.toLocaleString()}`, 140, finalY + 15);

    // Created and Approved Info
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const createdByText = `OC CRIADA POR: ${po.createdByName || po.createdBy || 'N/A'}`;
    const approvedByText = `OC APROVADA POR: ${po.approvedByName || po.approvedBy || 'N/A'}`;
    doc.text(createdByText, 10, 258);
    doc.text(approvedByText, 110, 258);

    // Footer Disclaimer
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    const footerTexts = [
      "1.0 - Ao aceitar essa ordem de compra o fornecedor responde por danos causados a OEG e seus clientes, independentemente de culpa, bastando provar o nexo\nde causalidade entre defeito e dano e/ou responderá de forma direta ou solidariamente pelos vicios de qualidade ou quantidade.",
      "2.0 - A OEG não aceita negociação de desconto de título, é proibido ceder, transferir, onerar ou de qualquer forma alienar os direitos creditórios decorrentes\nde contratos, ordens de compra ou títulos de crédito que representem duplicatas e notas ficais, a terceiros, sejam eles empresas de fomento mercantil (factoring), fundos\nde investimento em direitos creditórios (fidc), instituições financeiras ou quaisquer outros cessionários, salvo mediante prévia e expressa autorização escrita da OEG.",
      "3.0 - As NFs e boletos emitidos em razão dessa ordem de compra devem ser enviados para o e-mail financebrasil@oegoffshore.com"
    ];
    
    // Total lines calculation to ensure it ends at 2mm from bottom (Y=295) if possible, 
    // but start below names (Y=258). Starting at 270 as requested.
    let currentFooterY = 270;
    footerTexts.forEach(text => {
      const lines = doc.splitTextToSize(text, 194);
      doc.text(lines, 8, currentFooterY, { align: 'justify', maxWidth: 194 });
      currentFooterY += (lines.length * 2.8) + 1.8;
    });

    doc.save(`OC_${po.number}.pdf`);
    await addNotification('PDF Gerado', `Ordem de compra #${po.number} salva com sucesso.`, 'success');
  };


  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#141414]">Ordens de Compra (OC)</h2>
          <p className="text-[#8E9299] mt-1">Acompanhe pedidos, recebimentos e saldos.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-[#141414] text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:scale-105 transition-all"
          >
            <Plus size={20} />
            <span>Nova Ordem de Compra</span>
          </button>
        </div>
      </div>

      <POModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={(data) => handleAddPO(data).catch(err => console.error('Error in handleAddPO:', err))}
        suppliers={suppliers}
      />

      <RatingModal
        isOpen={isRatingModalOpen}
        onClose={() => setIsRatingModalOpen(false)}
        onSubmit={(rating, hasRNC) => handleCompletePO(rating, hasRNC).catch(err => console.error('Error in handleCompletePO:', err))}
        poNumber={selectedPO?.number || 0}
        supplierName={selectedPO?.supplierName || ''}
      />

      <ReceiveModal
        isOpen={isReceiveModalOpen}
        onClose={() => {
          setIsReceiveModalOpen(false);
          setSelectedPO(null);
        }}
        onSubmit={(amount, invoiceNumber) => onReceiveSubmit(amount, invoiceNumber).catch(err => console.error('Error in onReceiveSubmit:', err))}
        po={selectedPO}
      />

      <ReceiptHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setSelectedPOForHistory(null);
        }}
        po={selectedPOForHistory}
      />

      <EditAmountModal
        isOpen={isEditAmountModalOpen}
        onClose={() => {
          setIsEditAmountModalOpen(false);
          setSelectedPO(null);
        }}
        onSubmit={(newAmount, items) => handleEditAmount(newAmount, items).catch(err => console.error('Error in handleEditAmount:', err))}
        po={selectedPO}
      />

      <ConfirmModal
        isOpen={!!poToDelete}
        onClose={() => setPoToDelete(null)}
        onConfirm={() => poToDelete && handleDeletePO(poToDelete.id, poToDelete.number).catch(err => console.error('Error in handleDeletePO:', err))}
        title="Excluir Ordem de Compra"
        message={`Tem certeza que deseja excluir a OC #${poToDelete?.number}? Esta ação não poderá ser desfeita.`}
        confirmText="Excluir"
        variant="danger"
      />

      {/* Filters */}
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por OC, fornecedor..." 
              className="w-full pl-10 pr-4 py-2 bg-[#F5F5F5] border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg border transition-all duration-300",
              showAdvancedFilters 
                ? "bg-[#141414] text-white border-[#141414] shadow-lg" 
                : "text-[#141414] bg-white border-[#E5E5E5] hover:bg-[#F5F5F5]"
            )}
          >
            <Filter size={18} />
            <span>Filtros</span>
          </button>
        </div>

        <AnimatePresence>
          {showAdvancedFilters && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-[#F5F5F5] p-6 rounded-2xl border border-[#E5E5E5] flex flex-wrap gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-[0.2em] ml-1">Status da Ordem</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Todos', value: null },
                      { label: 'Rascunho', value: 'draft' },
                      { label: 'Pendente', value: 'pending_approval' },
                      { label: 'Aprovado', value: 'approved' },
                      { label: 'Recebido', value: 'received' },
                      { label: 'Fechado', value: 'closed' }
                    ].map((btn) => (
                      <button 
                        key={String(btn.value)}
                        onClick={() => setFilterStatus(btn.value)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold border transition-all duration-300",
                          filterStatus === btn.value 
                            ? "bg-[#141414] text-white border-[#141414] shadow-md" 
                            : "bg-white text-[#8E9299] border-[#E5E5E5] hover:border-[#8E9299]"
                        )}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
          pos
            .filter(oc => {
              const matchesSearch = oc.number.toString().includes(searchTerm) || 
                                   oc.supplierName.toLowerCase().includes(searchTerm.toLowerCase());
              const matchesStatus = filterStatus === null || oc.status === filterStatus;
              return matchesSearch && matchesStatus;
            })
            .map((oc) => (
            <div 
              key={oc.id} 
              onClick={() => {
                setSelectedPOForHistory(oc);
                setIsHistoryModalOpen(true);
              }}
              className="bg-white rounded-3xl border border-[#E5E5E5] p-6 hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center gap-8 cursor-pointer group"
            >
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm font-bold text-[#141414]">#{oc.number}</span>
                  <div className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest", getStatusColor(oc.status))}>
                    {getStatusLabel(oc.status)}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-[#141414]">{oc.supplierName}</h3>
                <p className="text-xs text-[#8E9299] mt-1">Emitida em {new Date(oc.createdAt).toLocaleDateString()}</p>
                {oc.deliveryDate && (
                  <p className="text-xs text-brand-600 font-bold mt-1 flex items-center gap-1">
                    <Calendar size={12} />
                    Entrega: {new Date(oc.deliveryDate).toLocaleDateString()}
                  </p>
                )}
                {oc.createdByName && (
                  <p className="text-[10px] text-[#8E9299] font-bold mt-1">
                    Criado por {oc.createdByName}
                  </p>
                )}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApprove(oc).catch(err => console.error('Error in handleApprove:', err));
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all shadow-md"
                  >
                    <CheckCircle size={16} />
                    <span>Aprovar</span>
                  </button>
                )}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    generatePDF(oc).catch(err => console.error('Error in generatePDF:', err));
                  }}
                  disabled={oc.status === 'draft' || oc.status === 'pending_approval'}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0052FF] rounded-lg hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  title={oc.status === 'draft' || oc.status === 'pending_approval' ? "Aguardando Aprovação" : "Baixar PDF"}
                >
                  <Download size={16} />
                  <span>PDF</span>
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReceive(oc);
                  }}
                  disabled={oc.status === 'draft' || oc.status === 'pending_approval' || oc.status === 'received' || oc.status === 'closed'}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#141414] bg-[#F5F5F5] rounded-lg hover:bg-[#E5E5E5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Package size={16} />
                  <span>Receber</span>
                </button>
                {currentUserProfile?.role === 'Administrador' && (oc.status === 'approved' || oc.status === 'sent' || oc.status === 'received') && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPO(oc);
                      setIsEditAmountModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-all shadow-md"
                    title="Editar Valor (Admin)"
                  >
                    <Edit2 size={16} />
                    <span>Editar Valor</span>
                  </button>
                )}
                {oc.status !== 'closed' && oc.status !== 'draft' && oc.status !== 'pending_approval' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPO(oc);
                      setIsRatingModalOpen(true);
                    }}
                    disabled={oc.receivedAmount < oc.totalAmount}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    title={oc.receivedAmount < oc.totalAmount ? "Recebimento incompleto" : "Concluir Ordem"}
                  >
                    <CheckSquare size={16} />
                    <span>Concluir</span>
                  </button>
                )}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setPoToDelete({ id: oc.id, number: oc.number });
                  }}
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
