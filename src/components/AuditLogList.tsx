import React, { useState, useEffect } from 'react';
import { useAuditLog } from '../hooks/useAuditLog';
import { History, User, Tag, Clock, RotateCcw } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, onSnapshot, updateDoc, deleteDoc, setDoc, addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { isBootstrapAdmin } from '../constants';
import { useNotifications } from '../hooks/useNotifications';
import { AuditLog } from '../types';

export default function AuditLogList() {
  const { logs } = useAuditLog();
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (logs.length > 0 || logs.length === 0) {
      setIsLoading(false);
    }
  }, [logs]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const userEmail = auth.currentUser.email;
    if (isBootstrapAdmin(userEmail)) {
      setIsAdmin(true);
      return;
    }

    const userRef = doc(db, 'users', auth.currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const userData = snapshot.data();
        setIsAdmin(userData.role === 'Administrador');
      }
    });

    return () => unsubscribe();
  }, []);

  const handleUndo = async (log: AuditLog) => {
    if (!isAdmin) {
      addNotification('Erro', 'Você não tem permissão de administrador.', 'error');
      return;
    }

    if (window.confirm(`Tem certeza de que deseja desfazer a ação "${log.action}"?`)) {
      setIsProcessingId(log.id);
      try {
        // Recursively convert ISO strings to Firestore Timestamps for validation passing
        const convertDatesToTimestamps = (obj: any): any => {
          if (obj === null || obj === undefined) return obj;
          if (typeof obj !== 'object') {
            if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
              const d = new Date(obj);
              return !isNaN(d.getTime()) ? Timestamp.fromDate(d) : obj;
            }
            return obj;
          }
          if (Array.isArray(obj)) {
            return obj.map(item => convertDatesToTimestamps(item));
          }
          const result: any = {};
          for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (typeof val === 'string' && (
              ['createdAt', 'updatedAt', 'sentAt', 'approvedAt', 'receivedAt', 'completedAt', 'timestamp', 'deliveryDate', 'lastAdjustmentDate', 'startDate', 'endDate'].includes(key) ||
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)
            )) {
              const d = new Date(val);
              result[key] = !isNaN(d.getTime()) ? Timestamp.fromDate(d) : val;
            } else {
              result[key] = convertDatesToTimestamps(val);
            }
          }
          return result;
        };

        const ENTITY_COLLECTIONS: Record<string, string> = {
          'Supplier': 'suppliers',
          'RFQ': 'rfqs',
          'Proposal': 'proposals',
          'PurchaseOrder': 'purchase-orders',
          'User': 'users',
          'Contract': 'contracts'
        };

        const collectionName = ENTITY_COLLECTIONS[log.entity];

        // 1. Check for composite cascading operations
        if (log.action === 'Gerou PO de Proposta') {
          const prev = log.previousState;
          const next = log.newState;
          if (next && next.poId) {
            // Delete generated PO
            await deleteDoc(doc(db, 'purchase-orders', next.poId));
          }
          if (prev && prev.proposalStates) {
            // Restore proposal statuses
            for (const prop of prev.proposalStates) {
              await updateDoc(doc(db, 'proposals', prop.id), { status: prop.status });
            }
          }
          if (prev && prev.rfqState) {
            // Restore RFQ status
            await updateDoc(doc(db, 'rfqs', prev.rfqState.id), { status: prev.rfqState.status });
          }
        } 
        // 2. Generic Undo: Creation (previousState is null, newState exists)
        else if (!log.previousState && log.newState) {
          if (!collectionName) throw new Error(`Entidade desconhecida para deleção: ${log.entity}`);
          await deleteDoc(doc(db, collectionName, log.entityId));
        } 
        // 3. Generic Undo: Deletion (previousState exists, newState is null)
        else if (log.previousState && !log.newState) {
          if (!collectionName) throw new Error(`Entidade desconhecida para restauração: ${log.entity}`);
          const restoredPayload = convertDatesToTimestamps(log.previousState);
          await setDoc(doc(db, collectionName, log.entityId), restoredPayload);
        } 
        // 4. Generic Undo: Modification/Update (both exist)
        else if (log.previousState && log.newState) {
          if (!collectionName) throw new Error(`Entidade desconhecida para modificação: ${log.entity}`);
          const restoredPayload = convertDatesToTimestamps(log.previousState);
          await setDoc(doc(db, collectionName, log.entityId), restoredPayload);
        } else {
          throw new Error('Este log não contém dados suficientes para ser desfeito.');
        }

        // Mark this log as undone
        const logRef = doc(db, 'audit-logs', log.id);
        await updateDoc(logRef, {
          undone: true,
          undoneBy: auth.currentUser?.email || 'Unknown',
          undoneAt: new Date().toISOString()
        });

        // Add log entry for the undo operation itself
        await addDoc(collection(db, 'audit-logs'), {
          userId: auth.currentUser?.uid || 'unknown',
          userEmail: auth.currentUser?.email || 'Unknown',
          action: `Desfez: ${log.action}`,
          entity: log.entity,
          entityId: log.entityId,
          timestamp: serverTimestamp(),
          undone: false
        });

        addNotification('Ação Desfeita', `A ação "${log.action}" foi desfeita com sucesso.`, 'success');
      } catch (error: any) {
        console.error('Error undoing action:', error);
        addNotification('Erro ao Desfazer', error.message || 'Ocorreu um erro ao desfazer a ação.', 'error');
      } finally {
        setIsProcessingId(null);
      }
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#141414]">Logs de Auditoria</h2>
          <p className="text-[#8E9299] mt-1">Rastreamento completo de ações no sistema com suporte a desfazer (Undo) para administradores.</p>
        </div>
        {isAdmin && (
          <span className="text-xs bg-[#F5F5F5] text-[#141414] font-bold px-4 py-2 rounded-full border border-[#E5E5E5] flex items-center gap-1.5">
            Admin Mode
          </span>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden">
        <div className="divide-y divide-[#E5E5E5]">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#141414] mx-auto"></div>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <History size={48} className="mx-auto text-[#E5E5E5] mb-4" />
              <p className="text-[#8E9299]">Nenhum log registrado ainda.</p>
            </div>
          ) : (
            logs.map(log => {
              const hasStates = !!(log.previousState || log.newState || log.action === 'Gerou PO de Proposta');
              return (
                <div key={log.id} className="p-6 flex items-center justify-between gap-6 hover:bg-[#F5F5F5] transition-colors">
                  <div className="flex items-start gap-6 flex-1">
                    <div className="p-3 bg-[#F5F5F5] rounded-2xl text-[#141414]">
                      <History size={20} />
                    </div>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-2">
                        <p className={`text-sm font-bold ${log.undone ? 'line-through text-[#8E9299]' : 'text-[#141414]'}`}>{log.action}</p>
                        <p className="text-xs text-[#8E9299] mt-1">
                          Entidade: <span className="font-bold text-[#141414]">{log.entity}</span> (#{log.entityId})
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#8E9299]">
                        <User size={14} />
                        <span className="font-bold text-[#141414]">{log.userEmail}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#8E9299] md:justify-end">
                        <Clock size={14} />
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    {log.undone ? (
                      <span className="text-xs bg-[#FFF2F0] text-[#FF4D4F] border border-[#FFA39E] px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5" title={`Desfeito por ${log.undoneBy} em ${log.undoneAt ? new Date(log.undoneAt).toLocaleString() : ''}`}>
                        <RotateCcw size={12} /> Desfeito
                      </span>
                    ) : isAdmin && hasStates ? (
                      <button
                        onClick={() => handleUndo(log)}
                        disabled={isProcessingId === log.id}
                        className="text-xs font-bold text-[#FF4D4F] hover:text-white bg-white hover:bg-[#FF4D4F] px-4 py-2 rounded-2xl border border-[#FFA39E] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        {isProcessingId === log.id ? (
                          <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-[#FF4D4F]"></span>
                        ) : (
                          <RotateCcw size={12} />
                        )}
                        Desfazer
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
