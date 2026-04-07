import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  MoreVertical,
  ChevronRight,
  Mail,
  Trash2,
  Tag
} from 'lucide-react';
import RFQModal from './RFQModal';
import ConfirmModal from './ConfirmModal';
import RFQDetailsModal from './RFQDetailsModal';
import { RFQ } from '../types';
import { emailService } from '../services/emailService';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, doc, deleteDoc, getDoc, getDocs, where, updateDoc } from 'firebase/firestore';
import { useNotifications } from '../hooks/useNotifications';
import { useAuditLog } from '../hooks/useAuditLog';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function RFQList() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRFQ, setSelectedRFQ] = useState<RFQ | null>(null);
  const [rfqToDelete, setRfqToDelete] = useState<{id: string, number: number} | null>(null);
  const [rfqToSendEmail, setRfqToSendEmail] = useState<{id: string, number: number, family: string} | null>(null);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { addNotification } = useNotifications();
  const { addLog } = useAuditLog();

  useEffect(() => {
    const q = query(collection(db, 'rfqs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rfqData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
      })) as RFQ[];
      setRfqs(rfqData);
      setIsLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'rfqs');
      } catch (e) {
        console.error('RFQList error:', e);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAddRFQ = async (data: any) => {
    try {
      // Final safety check to remove any undefined values that Firestore rejects
      const rfqPayload = JSON.parse(JSON.stringify({
        ...data,
        number: rfqs.length + 1001,
        status: 'draft',
      }));

      const docRef = await addDoc(collection(db, 'rfqs'), {
        ...rfqPayload,
        createdAt: serverTimestamp(),
      });
      setIsModalOpen(false);
      await addLog('Criou RFQ', 'RFQ', docRef.id, auth.currentUser?.email || 'Unknown');
      await addNotification('RFQ Criada', `A cotação #${rfqs.length + 1001} foi gerada com sucesso.`, 'success');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, 'rfqs');
      } catch (e) {
        console.error('RFQ add error:', e);
      }
    }
  };

  const handleDeleteRFQ = async (id: string, number: number) => {
    try {
      await deleteDoc(doc(db, 'rfqs', id));
      await addLog('Excluiu RFQ', 'RFQ', id, auth.currentUser?.email || 'Unknown');
      await addNotification('RFQ Excluída', `A cotação #${number} foi removida.`, 'warning');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `rfqs/${id}`);
      } catch (e) {
        console.error('RFQ delete error:', e);
      }
    }
  };

  const handleSendEmail = async (id: string) => {
    try {
      if (!auth.currentUser) {
        await addNotification('Erro', 'Você precisa estar logado para enviar emails.', 'error');
        return;
      }
      const rfqDoc = await getDoc(doc(db, 'rfqs', id));
      if (!rfqDoc.exists()) {
        await addNotification('Erro', 'Cotação não encontrada.', 'error');
        return;
      }
      const rfq = { ...rfqDoc.data(), id: rfqDoc.id } as RFQ;

      if (!rfq.family) {
        await addNotification('Aviso', 'Esta RFQ não possui uma família definida.', 'warning');
        return;
      }

      // Buscar fornecedores da mesma família
      const suppliersRef = collection(db, 'suppliers');
      const q = query(suppliersRef, where('families', 'array-contains', rfq.family));
      const querySnapshot = await getDocs(q);
      
      const supplierEmails = querySnapshot.docs.map(doc => doc.data().email).filter(email => !!email);

      if (supplierEmails.length === 0) {
        await addNotification('Aviso', `Nenhum fornecedor encontrado para a família: ${rfq.family}`, 'warning');
        return;
      }

      // Buscar perfil do usuário atual para o remetente
      const userProfileDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
      const userProfile = userProfileDoc.exists() ? userProfileDoc.data() : null;

      // Enviar email para todos os fornecedores via serviço de email
      await emailService.sendCustomEmail({
        to: supplierEmails,
        subject: `Solicitação de Cotação #${rfq.number} - ${rfq.title}`,
        fromName: userProfile?.name || 'SupplyFlow',
        html: `
          <div style="font-family: sans-serif; color: #141414; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E5E5; border-radius: 12px;">
            <h2 style="color: #141414;">Solicitação de Cotação #${rfq.number}</h2>
            <p>Prezado fornecedor,</p>
            <p>Gostaríamos de solicitar uma cotação para os seguintes itens:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background-color: #F5F5F5;">
                  <th style="padding: 10px; border: 1px solid #E5E5E5; text-align: left;">Descrição</th>
                  <th style="padding: 10px; border: 1px solid #E5E5E5; text-align: center;">Qtd</th>
                  <th style="padding: 10px; border: 1px solid #E5E5E5; text-align: center;">Unidade</th>
                </tr>
              </thead>
              <tbody>
                ${rfq.items.map(item => `
                  <tr>
                    <td style="padding: 10px; border: 1px solid #E5E5E5;">${item.description}</td>
                    <td style="padding: 10px; border: 1px solid #E5E5E5; text-align: center;">${item.quantity}</td>
                    <td style="padding: 10px; border: 1px solid #E5E5E5; text-align: center;">${item.unit}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <p><strong>Data Desejada para Entrega:</strong> ${new Date(rfq.desiredDate).toLocaleDateString()}</p>
            <p>Por favor, envie sua proposta respondendo a este e-mail ou através do nosso portal.</p>
            <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 20px 0;" />
            <p style="font-size: 12px; color: #8E9299;">Atenciosamente,<br /><strong>${userProfile?.name || 'Equipe de Compras'}</strong><br />SupplyFlow Management System</p>
          </div>
        `
      });

      await updateDoc(doc(db, 'rfqs', id), {
        status: 'sent',
        sentAt: serverTimestamp()
      });

      await addNotification('Email Enviado', `A cotação foi enviada para ${supplierEmails.length} fornecedores da família ${rfq.family}.`, 'success');
      await addLog('Enviou RFQ por Email', 'RFQ', id, auth.currentUser?.email || 'Unknown');
    } catch (error) {
      console.error('Error sending RFQ emails:', error);
      await addNotification('Erro', error instanceof Error ? error.message : 'Não foi possível enviar a cotação por email.', 'error');
    }
  };

  const generatePDF = (rfq: RFQ) => {
    const doc = new jsPDF();
    
    // Header (Identical to PO)
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

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SOLICITAÇÃO DE COTAÇÃO (RFQ)', 105, 62, { align: 'center' });
    doc.text(`#${rfq.number}`, 10, 69);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data de Emissão: ${new Date(rfq.createdAt).toLocaleDateString()}`, 150, 69);

    doc.setFontSize(10);
    doc.text(`Data Desejada: ${new Date(rfq.desiredDate).toLocaleDateString()}`, 10, 75);
    if (rfq.family) {
      doc.text(`Família: ${rfq.family}`, 10, 81);
    }

    // Title
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Assunto: ${rfq.title}`, 10, 90);

    // Items Table
    autoTable(doc, {
      startY: 100,
      head: [['Item', 'Descrição', 'Quantidade', 'Unidade']],
      body: rfq.items.map((item, index) => [
        index + 1,
        item.description,
        item.quantity,
        item.unit
      ]),
      headStyles: { fillColor: [20, 20, 20] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Página ${i} de ${pageCount} - Gerado por SupplyFlow`,
        105,
        285,
        { align: 'center' }
      );
    }

    doc.save(`RFQ_${rfq.number}.pdf`);
  };

  const handleGeneratePDF = async (rfq: RFQ) => {
    try {
      generatePDF(rfq);
      await addNotification('PDF Gerado', `O PDF da cotação #${rfq.number} foi gerado com sucesso.`, 'success');
      await addLog('Gerou PDF de RFQ', 'RFQ', rfq.id, auth.currentUser?.email || 'Unknown');
    } catch (error) {
      console.error('Error generating PDF:', error);
      await addNotification('Erro ao Gerar PDF', 'Não foi possível gerar o arquivo PDF.', 'error');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-600';
      case 'sent': return 'bg-blue-100 text-blue-600';
      case 'closed': return 'bg-green-100 text-green-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText size={14} />;
      case 'sent': return <Clock size={14} />;
      case 'closed': return <CheckCircle2 size={14} />;
      default: return <AlertCircle size={14} />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#141414]">Cotações (RFQ)</h2>
          <p className="text-[#8E9299] mt-1">Solicite propostas e gerencie negociações.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-[#141414] text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:scale-105 transition-all"
        >
          <Plus size={20} />
          <span>Nova Cotação</span>
        </button>
      </div>

      <RFQModal 
        key={isModalOpen ? 'open' : 'closed'}
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={(data) => handleAddRFQ(data).catch(err => console.error('Error in handleAddRFQ:', err))}
      />

      <ConfirmModal
        isOpen={!!rfqToDelete}
        onClose={() => setRfqToDelete(null)}
        onConfirm={() => rfqToDelete && handleDeleteRFQ(rfqToDelete.id, rfqToDelete.number).catch(err => console.error('Error in handleDeleteRFQ:', err))}
        title="Excluir Cotação"
        message={`Tem certeza que deseja excluir a cotação #${rfqToDelete?.number}? Esta ação não poderá ser desfeita.`}
        confirmText="Excluir"
        variant="danger"
      />

      <ConfirmModal
        isOpen={!!rfqToSendEmail}
        onClose={() => setRfqToSendEmail(null)}
        onConfirm={() => {
          if (rfqToSendEmail) {
            handleSendEmail(rfqToSendEmail.id).catch(err => console.error('Error in handleSendEmail:', err));
            setRfqToSendEmail(null);
          }
        }}
        title="Disparar Cotação"
        message={`Deseja enviar esta cotação por email para todos os fornecedores da família "${rfqToSendEmail?.family}"?`}
        confirmText="Enviar Emails"
        variant="info"
      />

      {selectedRFQ && (
        <RFQDetailsModal 
          isOpen={!!selectedRFQ}
          onClose={() => setSelectedRFQ(null)}
          rfq={selectedRFQ}
        />
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por número ou título..." 
            className="w-full pl-10 pr-4 py-2 bg-[#F5F5F5] border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-[#141414] bg-white border border-[#E5E5E5] rounded-lg hover:bg-[#F5F5F5] transition-colors">
          <Filter size={18} />
          <span>Filtros</span>
        </button>
      </div>

      {/* RFQ List */}
      <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#141414]"></div>
          </div>
        ) : rfqs.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={48} className="mx-auto text-[#E5E5E5] mb-4" />
            <h3 className="text-lg font-bold text-[#141414]">Nenhuma cotação encontrada</h3>
            <p className="text-[#8E9299] mt-1">Clique em "Nova Cotação" para começar.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F5F5] border-b border-[#E5E5E5]">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Número</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Título</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Data Desejada</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Itens</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {rfqs.map((rfq) => (
                <tr 
                  key={rfq.id} 
                  onClick={() => setSelectedRFQ(rfq)}
                  className="hover:bg-[#F5F5F5] transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-6 font-mono text-sm font-bold text-[#141414]">#{rfq.number}</td>
                  <td className="px-6 py-6">
                    <p className="text-sm font-bold text-[#141414]">{rfq.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[10px] text-[#8E9299] font-medium">Criado em {new Date(rfq.createdAt).toLocaleDateString()}</p>
                      {rfq.family && (
                        <div className="flex items-center gap-1 bg-[#F5F5F5] px-2 py-0.5 rounded text-[9px] font-bold text-[#8E9299] uppercase tracking-tighter">
                          <Tag size={10} />
                          <span>{rfq.family}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className={cn("inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest", getStatusColor(rfq.status))}>
                      {getStatusIcon(rfq.status)}
                      <span>{rfq.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-2 text-sm text-[#141414]">
                      <Calendar size={16} className="text-[#8E9299]" />
                      <span>{new Date(rfq.desiredDate).toLocaleDateString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <span className="text-xs font-bold text-[#141414] bg-[#F5F5F5] px-2 py-1 rounded-md">
                      {rfq.items.length} Itens
                    </span>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setRfqToSendEmail({ id: rfq.id, number: rfq.number, family: rfq.family || '' });
                        }}
                        className={cn(
                          "p-2 rounded-full transition-all",
                          rfq.status === 'sent' 
                            ? "text-green-600 bg-green-50" 
                            : "text-blue-600 bg-blue-50 hover:bg-blue-100"
                        )}
                        title={rfq.status === 'sent' ? "Reenviar para Fornecedores" : "Disparar para Fornecedores"}
                      >
                        <Mail size={18} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGeneratePDF(rfq).catch(err => console.error('Error in handleGeneratePDF:', err));
                        }}
                        className="p-2 text-[#8E9299] hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                        title="Gerar PDF"
                      >
                        <FileText size={18} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setRfqToDelete({ id: rfq.id, number: rfq.number });
                        }}
                        className="p-2 text-[#8E9299] hover:text-[#FF4444] hover:bg-red-50 rounded-full transition-all"
                        title="Excluir"
                      >
                        <Trash2 size={18} />
                      </button>
                      <ChevronRight size={18} className="text-[#E5E5E5] group-hover:text-[#141414] transition-colors" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
