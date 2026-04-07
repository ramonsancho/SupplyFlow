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
  Tag,
  ArrowUpRight,
  Download,
  Send
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
import { motion, AnimatePresence } from 'motion/react';

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
  const [searchTerm, setSearchTerm] = useState('');
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

      const suppliersRef = collection(db, 'suppliers');
      const q = query(suppliersRef, where('families', 'array-contains', rfq.family));
      const querySnapshot = await getDocs(q);
      
      const supplierEmails = querySnapshot.docs.map(doc => doc.data().email).filter(email => !!email);

      if (supplierEmails.length === 0) {
        await addNotification('Aviso', `Nenhum fornecedor encontrado para a família: ${rfq.family}`, 'warning');
        return;
      }

      const userProfileDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
      const userProfile = userProfileDoc.exists() ? userProfileDoc.data() : null;

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
    try {
      doc.addImage('https://i.ibb.co/PvHCyFtf/logo.png', 'PNG', 10, 10, 30, 30);
    } catch (e) {
      doc.setFillColor(0, 82, 255);
      doc.rect(10, 10, 30, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SupplyFlow', 25, 28, { align: 'center' });
    }

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
    if (rfq.family) doc.text(`Família: ${rfq.family}`, 10, 81);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Assunto: ${rfq.title}`, 10, 90);

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

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Página ${i} de ${pageCount} - Gerado por SupplyFlow`, 105, 285, { align: 'center' });
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
      case 'draft': return 'bg-slate-100 text-slate-600';
      case 'sent': return 'bg-brand-50 text-brand-600';
      case 'closed': return 'bg-emerald-50 text-emerald-600';
      default: return 'bg-slate-100 text-slate-600';
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

  const filteredRfqs = rfqs.filter(rfq => 
    rfq.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rfq.number.toString().includes(searchTerm)
  );

  return (
    <div className="space-y-12">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900">Cotações (RFQ)</h2>
          <p className="text-slate-500 mt-2 text-lg font-medium">Solicite propostas estratégicas e gerencie negociações.</p>
        </div>
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-slate-200 hover:bg-brand-600 hover:shadow-brand-500/20 transition-all duration-300 self-start"
        >
          <Plus size={20} />
          <span>Nova Solicitação</span>
        </motion.button>
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

      {/* Filters Bar */}
      <div className="bg-white p-3 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por número ou título da cotação..." 
            className="w-full pl-14 pr-6 py-4 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-6 py-4 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all duration-300">
          <Filter size={18} />
          <span>Filtros Avançados</span>
        </button>
      </div>

      {/* RFQ List Container */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-slate-200 rounded-full" />
              <div className="absolute inset-0 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        ) : filteredRfqs.length === 0 ? (
          <div className="p-20 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6">
              <FileText size={32} className="text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Nenhuma cotação encontrada</h3>
            <p className="text-slate-500 mt-2 font-medium">Inicie um novo processo de cotação para gerenciar seus suprimentos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Número</th>
                  <th className="px-8 py-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Título & Categoria</th>
                  <th className="px-8 py-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Status</th>
                  <th className="px-8 py-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Data Desejada</th>
                  <th className="px-8 py-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Itens</th>
                  <th className="px-8 py-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRfqs.map((rfq, idx) => (
                  <motion.tr 
                    key={rfq.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedRFQ(rfq)}
                    className="hover:bg-slate-50/50 transition-all duration-300 group cursor-pointer"
                  >
                    <td className="px-8 py-6">
                      <span className="font-mono text-sm font-bold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                        #{rfq.number}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm font-bold text-slate-900 group-hover:text-brand-600 transition-colors">{rfq.title}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Criado em {new Date(rfq.createdAt).toLocaleDateString()}</p>
                        {rfq.family && (
                          <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-md text-[9px] font-bold text-slate-500 uppercase tracking-widest group-hover:bg-brand-100 group-hover:text-brand-600 transition-colors">
                            <Tag size={10} />
                            <span>{rfq.family}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className={cn("inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-transparent", getStatusColor(rfq.status))}>
                        {getStatusIcon(rfq.status)}
                        <span>{rfq.status}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2.5 text-sm font-bold text-slate-700">
                        <Calendar size={16} className="text-slate-300" />
                        <span>{new Date(rfq.desiredDate).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl uppercase tracking-widest">
                        {rfq.items.length} {rfq.items.length === 1 ? 'Item' : 'Itens'}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center justify-end gap-2">
                        <motion.button 
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRfqToSendEmail({ id: rfq.id, number: rfq.number, family: rfq.family || '' });
                          }}
                          className={cn(
                            "p-3 rounded-2xl transition-all duration-300",
                            rfq.status === 'sent' 
                              ? "text-emerald-600 bg-emerald-50" 
                              : "text-brand-600 bg-brand-50 hover:bg-brand-100"
                          )}
                          title={rfq.status === 'sent' ? "Reenviar para Fornecedores" : "Disparar para Fornecedores"}
                        >
                          <Send size={18} />
                        </motion.button>
                        <motion.button 
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGeneratePDF(rfq).catch(err => console.error('Error in handleGeneratePDF:', err));
                          }}
                          className="p-3 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all duration-300"
                          title="Gerar PDF"
                        >
                          <Download size={18} />
                        </motion.button>
                        <motion.button 
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRfqToDelete({ id: rfq.id, number: rfq.number });
                          }}
                          className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all duration-300"
                          title="Excluir"
                        >
                          <Trash2 size={18} />
                        </motion.button>
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

