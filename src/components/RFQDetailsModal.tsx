import React, { useState, useEffect } from 'react';
import { X, Plus, FileText, Calendar, Tag, CheckCircle2, Clock, AlertCircle, ShoppingCart } from 'lucide-react';
import { RFQ, Proposal, User, PurchaseOrder } from '../types';
import { db, auth, handleFirestoreError, OperationType, formatDate, formatCurrency } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, getDocs, orderBy, getDoc } from 'firebase/firestore';
import { useNotifications } from '../hooks/useNotifications';
import { useAuditLog } from '../hooks/useAuditLog';
import { poService } from '../services/poService';
import ProposalModal from './ProposalModal';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RFQDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  rfq: RFQ;
}

export default function RFQDetailsModal({ isOpen, onClose, rfq }: RFQDetailsModalProps) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const { addNotification } = useNotifications();
  const { addLog } = useAuditLog();

  useEffect(() => {
    const qUsers = query(collection(db, 'users'));
    const unsubscribeAllUsers = onSnapshot(qUsers, (snapshot) => {
      const users = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
      setAllUsers(users);
    }, (error) => {
      console.error('Error fetching users in RFQDetailsModal:', error);
    });

    return () => unsubscribeAllUsers();
  }, []);

  useEffect(() => {
    if (auth.currentUser) {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      getDoc(userRef).then(docSnap => {
        if (docSnap.exists()) {
          setCurrentUserProfile({ ...docSnap.data(), id: docSnap.id } as User);
        }
      }).catch(e => console.error('Error fetching user profile in RFQDetailsModal:', e));
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !rfq.id) return;

    const q = query(
      collection(db, 'proposals'),
      where('rfqId', '==', rfq.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const proposalData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
      })) as Proposal[];
      setProposals(proposalData);
      setIsLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'proposals');
      } catch (e) {
        console.error('Proposals list error:', e);
      }
    });

    return () => unsubscribe();
  }, [isOpen, rfq.id]);

  const handleAddProposal = async (data: any) => {
    if (!rfq.id) {
      await addNotification('Erro', 'ID da RFQ não encontrado.', 'error');
      return;
    }

    try {
      // Final safety check to remove any undefined values that Firestore rejects
      const proposalPayload = JSON.parse(JSON.stringify({
        rfqId: rfq.id,
        ...data,
        status: 'pending',
      }));

      const docRef = await addDoc(collection(db, 'proposals'), {
        ...proposalPayload,
        createdAt: serverTimestamp(),
      });
      setIsProposalModalOpen(false);
      await addLog('Incluiu Proposta', 'Proposal', docRef.id, auth.currentUser?.email || 'Unknown');
      await addNotification('Proposta Incluída', `A proposta de ${data.supplierName} foi registrada.`, 'success');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, 'proposals');
      } catch (e) {
        console.error('Proposal add error:', e);
      }
    }
  };

  const handleAcceptProposal = async (proposal: Proposal) => {
    try {
      // 1. Gerar a PO automaticamente com número sequencial
      const poNumber = await poService.getNextPONumber();
      
      const totalAmount = Math.round(proposal.totalValue * 100) / 100;
      
      // Prepare payload manually to avoid stripping serverTimestamp with JSON.stringify
      const poPayload: any = {
        number: poNumber,
        proposalId: proposal.id || '',
        supplierId: proposal.supplierId,
        supplierName: proposal.supplierName,
        family: rfq.family || '',
        deliveryDate: proposal.deliveryDate,
        status: 'pending_approval',
        totalAmount: totalAmount,
        receivedAmount: 0,
        items: (proposal.items || []).map(item => ({
          id: (item as any).id || crypto.randomUUID(),
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          tax: 0
        })),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        revision: 0,
        createdBy: auth.currentUser?.uid,
        createdByName: currentUserProfile?.name || auth.currentUser?.displayName || auth.currentUser?.email || 'Sistema',
      };

      const poRef = await addDoc(collection(db, 'purchase-orders'), poPayload);

      // 2. Atualizar status da proposta aceita
      await updateDoc(doc(db, 'proposals', proposal.id), {
        status: 'accepted'
      });

      // 3. Rejeitar outras propostas desta RFQ
      const otherProposals = proposals.filter(p => p.id !== proposal.id);
      for (const p of otherProposals) {
        await updateDoc(doc(db, 'proposals', p.id), {
          status: 'rejected'
        });
      }

      // 4. Fechar a RFQ
      await updateDoc(doc(db, 'rfqs', rfq.id), {
        status: 'closed'
      });

      await addLog('Gerou PO de Proposta', 'PurchaseOrder', poRef.id, auth.currentUser?.email || 'Unknown');
      await addNotification('PO Gerada', `A Ordem de Compra #${poNumber} foi gerada a partir da proposta de ${proposal.supplierName}.`, 'success');

      // Disparo de e-mail removido por desejo do usuário
      if (poPayload.status === 'pending_approval') {
        console.log(`[Approval] OC #${poNumber} aguardando aprovação.`);
      }

      onClose();
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, 'purchase-orders');
      } catch (e) {
        console.error('PO generation error:', e);
        await addNotification('Erro', 'Não foi possível gerar a Ordem de Compra.', 'error');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#141414] text-white flex items-center justify-center font-bold text-xl">
              #{rfq.number}
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#141414]">{rfq.title}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs font-bold text-[#8E9299] uppercase tracking-widest flex items-center gap-1">
                  <Tag size={12} /> {rfq.family || 'Sem Família'}
                </span>
                <span className="text-xs font-bold text-[#8E9299] uppercase tracking-widest flex items-center gap-1">
                  <Calendar size={12} /> {formatDate(rfq.desiredDate)}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* RFQ Info & Items */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-[#F5F5F5] p-6 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-[#141414] uppercase tracking-widest">Itens Solicitados</h4>
                <div className="space-y-3">
                  {rfq.items.map((item) => (
                    <div key={item.id || item.description} className="flex justify-between items-center py-2 border-b border-[#E5E5E5] last:border-0">
                      <div>
                        <p className="text-sm font-bold text-[#141414]">{item.description}</p>
                        <p className="text-[10px] text-[#8E9299] uppercase tracking-widest">{item.unit}</p>
                      </div>
                      <p className="text-sm font-bold text-[#141414]">{item.quantity}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Proposals List */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#141414] uppercase tracking-widest">Propostas Recebidas</h4>
                {currentUserProfile?.role !== 'Requisitante' && (
                  <button 
                    onClick={() => setIsProposalModalOpen(true)}
                    className="flex items-center gap-2 text-xs font-bold text-white bg-[#141414] px-4 py-2 rounded-xl hover:scale-105 transition-all shadow-md"
                  >
                    <Plus size={16} />
                    <span>Incluir Proposta</span>
                  </button>
                )}
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#141414]"></div>
                </div>
              ) : proposals.length === 0 ? (
                <div className="bg-[#F5F5F5] rounded-2xl p-12 text-center border-2 border-dashed border-[#E5E5E5]">
                  <FileText size={32} className="mx-auto text-[#E5E5E5] mb-3" />
                  <p className="text-sm font-bold text-[#8E9299]">Nenhuma proposta registrada ainda.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {proposals.map((proposal) => (
                    <div key={proposal.id} className="bg-white border border-[#E5E5E5] rounded-2xl p-6 hover:shadow-lg transition-all group">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h5 className="text-base font-bold text-[#141414]">{proposal.supplierName}</h5>
                          <p className="text-xs text-[#8E9299] mt-1">
                            Recebida em {formatDate(proposal.createdAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-[#141414]">R$ {formatCurrency(proposal.totalValue)}</p>
                          {(proposal.freightValue || proposal.discountValue) ? (
                            <div className="flex flex-col items-end gap-0.5 mt-1">
                              {proposal.freightValue! > 0 && (
                                <p className="text-[9px] text-slate-400 uppercase tracking-tighter">Frete: R$ {formatCurrency(proposal.freightValue!)}</p>
                              )}
                              {proposal.discountValue! > 0 && (
                                <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-tighter">Desconto: - R$ {formatCurrency(proposal.discountValue!)}</p>
                              )}
                            </div>
                          ) : null}
                          <p className="text-[10px] text-[#8E9299] font-bold uppercase tracking-widest mt-1">
                            Entrega: {formatDate(proposal.deliveryDate)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-[#E5E5E5]">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                          proposal.status === 'accepted' ? 'bg-green-50 text-green-700' : 
                          proposal.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                        )}>
                          {proposal.status === 'accepted' ? <CheckCircle2 size={12} /> : 
                           proposal.status === 'rejected' ? <AlertCircle size={12} /> : <Clock size={12} />}
                          {proposal.status === 'pending' ? 'Pendente' : 
                           proposal.status === 'accepted' ? 'Aceita' : 'Rejeitada'}
                        </span>

                         {proposal.status === 'pending' && rfq.status !== 'closed' && currentUserProfile?.role !== 'Requisitante' && (
                          <button 
                            onClick={() => handleAcceptProposal(proposal).catch(err => console.error('Error in handleAcceptProposal:', err))}
                            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-all shadow-md"
                          >
                            <ShoppingCart size={14} />
                            <span>ACEITAR E GERAR PO</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ProposalModal 
        isOpen={isProposalModalOpen}
        onClose={() => setIsProposalModalOpen(false)}
        onSubmit={(data) => handleAddProposal(data).catch(err => console.error('Error in handleAddProposal:', err))}
        rfq={rfq}
      />
    </div>
  );
}
