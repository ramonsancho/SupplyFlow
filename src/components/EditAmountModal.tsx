import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Save, DollarSign, AlertCircle } from 'lucide-react';
import { PurchaseOrder } from '../types';

const editAmountSchema = z.object({
  totalAmount: z.number().min(0.01, 'O valor deve ser maior que zero'),
});

type EditAmountFormData = z.infer<typeof editAmountSchema>;

interface EditAmountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newAmount: number) => void;
  po: PurchaseOrder | null;
}

export default function EditAmountModal({ isOpen, onClose, onSubmit, po }: EditAmountModalProps) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<EditAmountFormData>({
    resolver: zodResolver(editAmountSchema),
    defaultValues: {
      totalAmount: po?.totalAmount || 0,
    }
  });

  React.useEffect(() => {
    if (isOpen && po) {
      reset({ totalAmount: po.totalAmount });
    }
  }, [isOpen, po, reset]);

  if (!isOpen || !po) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
          <div>
            <h3 className="text-xl font-bold text-[#141414]">Editar Valor da OC</h3>
            <p className="text-xs text-[#8E9299] mt-1 font-medium uppercase tracking-widest">OC #{po.number}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => onSubmit(data.totalAmount))} className="p-8 space-y-6">
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
            <AlertCircle className="text-blue-500 shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-blue-700 font-medium leading-relaxed">
              Atenção: Você está alterando o valor total de uma OC já aprovada. Esta ação será registrada no log de auditoria.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Novo Valor Total</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
              <input 
                type="number"
                step="0.01"
                {...register('totalAmount', { valueAsNumber: true })}
                className="w-full pl-10 pr-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
                placeholder="0,00"
              />
            </div>
            {errors.totalAmount && <p className="text-xs text-red-500 font-medium">{errors.totalAmount.message}</p>}
          </div>

          <div className="pt-6 border-t border-[#E5E5E5] flex items-center justify-end gap-4">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-3 text-sm font-bold text-[#8E9299] hover:text-[#141414] transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="flex items-center gap-2 bg-[#141414] text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:scale-105 transition-all"
            >
              <Save size={20} />
              <span>Salvar Alteração</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
