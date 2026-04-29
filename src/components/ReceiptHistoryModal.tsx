import React from 'react';
import { X, Calendar, FileText, User, DollarSign, Package } from 'lucide-react';
import { PurchaseOrder } from '../types';
import { formatCurrency } from '../firebase';

interface ReceiptHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  po: PurchaseOrder | null;
}

export default function ReceiptHistoryModal({ isOpen, onClose, po }: ReceiptHistoryModalProps) {
  if (!isOpen || !po) return null;

  const receipts = po.receipts || [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
          <div>
            <h3 className="text-xl font-bold text-[#141414]">Histórico de Recebimentos</h3>
            <p className="text-xs text-[#8E9299] mt-1 font-medium uppercase tracking-widest">OC #{po.number} - {po.supplierName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto">
          {receipts.length === 0 ? (
            <div className="text-center py-12 bg-[#F5F5F5] rounded-3xl border-2 border-dashed border-[#E5E5E5]">
              <Package size={48} className="mx-auto text-[#E5E5E5] mb-4" />
              <p className="text-[#8E9299] font-bold">Nenhum recebimento registrado ainda.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {receipts.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()).map((receipt) => (
                <div key={receipt.id} className="bg-white border border-[#E5E5E5] rounded-2xl p-6 hover:shadow-md transition-all">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Nota Fiscal</p>
                          <p className="text-sm font-bold text-[#141414]">{receipt.invoiceNumber}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-[#8E9299]" />
                          <span className="text-xs text-[#8E9299] font-medium">
                            {new Date(receipt.receivedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-[#8E9299]" />
                          <span className="text-xs text-[#8E9299] font-medium">
                            {receipt.receivedBy}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest mb-1">Valor Recebido</p>
                      <div className="flex items-center justify-end gap-1 text-green-600">
                        <DollarSign size={18} />
                        <span className="text-xl font-bold">
                          {formatCurrency(receipt.amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 p-6 bg-[#141414] rounded-2xl text-white flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">Total Recebido</p>
              <p className="text-2xl font-bold">R$ {formatCurrency(po.receivedAmount)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">Saldo Pendente</p>
              <p className="text-xl font-bold text-white/80">R$ {formatCurrency(po.totalAmount - po.receivedAmount)}</p>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-[#E5E5E5] flex justify-end bg-[#F5F5F5]">
          <button 
            onClick={onClose}
            className="bg-[#141414] text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:scale-105 transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
