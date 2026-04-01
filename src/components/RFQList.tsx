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
  Trash2
} from 'lucide-react';
import RFQModal from './RFQModal';
import ConfirmModal from './ConfirmModal';
import { RFQ } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useNotifications } from '../hooks/useNotifications';
import { useAuditLog } from '../hooks/useAuditLog';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function RFQList() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rfqToDelete, setRfqToDelete] = useState<{id: string, number: number} | null>(null);
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
      const docRef = await addDoc(collection(db, 'rfqs'), {
        ...data,
        number: rfqs.length + 1001,
        status: 'draft',
        createdAt: serverTimestamp(),
      });
      setIsModalOpen(false);
      addLog('Criou RFQ', 'RFQ', docRef.id, auth.currentUser?.email || 'Unknown');
      addNotification('RFQ Criada', `A cotação #${rfqs.length + 1001} foi gerada com sucesso.`, 'success');
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
      addLog('Excluiu RFQ', 'RFQ', id, auth.currentUser?.email || 'Unknown');
      addNotification('RFQ Excluída', `A cotação #${number} foi removida.`, 'warning');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `rfqs/${id}`);
      } catch (e) {
        console.error('RFQ delete error:', e);
      }
    }
  };

  const handleSendEmail = (id: string) => {
    addNotification('Email Enviado', `A cotação foi enviada para os fornecedores selecionados.`, 'success');
    addLog('Enviou RFQ por Email', 'RFQ', id, auth.currentUser?.email || 'Unknown');
  };

  const handleGeneratePDF = (id: string) => {
    addNotification('PDF Gerado', `O PDF da cotação foi gerado com sucesso.`, 'info');
    addLog('Gerou PDF de RFQ', 'RFQ', id, auth.currentUser?.email || 'Unknown');
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
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleAddRFQ}
      />

      <ConfirmModal
        isOpen={!!rfqToDelete}
        onClose={() => setRfqToDelete(null)}
        onConfirm={() => rfqToDelete && handleDeleteRFQ(rfqToDelete.id, rfqToDelete.number)}
        title="Excluir Cotação"
        message={`Tem certeza que deseja excluir a cotação #${rfqToDelete?.number}? Esta ação não poderá ser desfeita.`}
        confirmText="Excluir"
        variant="danger"
      />

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
                <tr key={rfq.id} className="hover:bg-[#F5F5F5] transition-colors group cursor-pointer">
                  <td className="px-6 py-6 font-mono text-sm font-bold text-[#141414]">#{rfq.number}</td>
                  <td className="px-6 py-6">
                    <p className="text-sm font-bold text-[#141414]">{rfq.title}</p>
                    <p className="text-[10px] text-[#8E9299] font-medium mt-1">Criado em {new Date(rfq.createdAt).toLocaleDateString()}</p>
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
                        onClick={() => handleSendEmail(rfq.id)}
                        className="p-2 text-[#8E9299] hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
                        title="Enviar por Email"
                      >
                        <Mail size={18} />
                      </button>
                      <button 
                        onClick={() => handleGeneratePDF(rfq.id)}
                        className="p-2 text-[#8E9299] hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                        title="Gerar PDF"
                      >
                        <FileText size={18} />
                      </button>
                      <button 
                        onClick={() => setRfqToDelete({ id: rfq.id, number: rfq.number })}
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
