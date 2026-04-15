import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Save, Package, DollarSign, AlertCircle, FileText } from 'lucide-react';
import { PurchaseOrder } from '../types';

const receiveSchema = z.object({
  amount: z.number().min(0.01, 'O valor deve ser maior que zero'),
  invoiceNumber: z.string().min(1, 'Número da nota fiscal é obrigatório'),
});

type ReceiveFormData = z.infer<typeof receiveSchema>;

interface ReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (amount: number, invoiceNumber: string) => void;
  po: PurchaseOrder | null;
}

export default function ReceiveModal({ isOpen, onClose, onSubmit, po }: ReceiveModalProps) {
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const remaining = po ? po.totalAmount - po.receivedAmount : 0;

  const { register, handleSubmit, formState: { errors }, reset } = useForm<ReceiveFormData>({
    resolver: zodResolver(receiveSchema),
    defaultValues: {
      amount: remaining > 0 ? remaining : 0,
      invoiceNumber: '',
    }
  });

  React.useEffect(() => {
    if (isOpen && po) {
      setValidationError(null);
      reset({ 
        amount: po.totalAmount - po.receivedAmount,
        invoiceNumber: '',
      });
    }
  }, [isOpen, po, reset]);

  if (!isOpen || !po) return null;

  const onFormSubmit = (data: ReceiveFormData) => {
    if (data.amount > remaining + 0.01) { // Small tolerance for float issues
      setValidationError(`O valor recebido (R$ ${data.amount.toLocaleString()}) não pode ser maior que o saldo pendente (R$ ${remaining.toLocaleString()}).`);
      return;
    }
    setValidationError(null);
    onSubmit(data.amount, data.invoiceNumber);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
          <div>
            <h3 className="text-xl font-bold text-[#141414]">Registrar Recebimento</h3>
            <p className="text-xs text-[#8E9299] mt-1 font-medium uppercase tracking-widest">OC #{po.number}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} className="p-8 space-y-6">
          {validationError && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 animate-shake">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
              <p className="text-xs text-red-700 font-medium leading-relaxed">{validationError}</p>
            </div>
          )}

          <div className="bg-[#F5F5F5] p-4 rounded-2xl space-y-2">
            <div className="flex justify-between text-xs font-bold text-[#8E9299] uppercase tracking-widest">
              <span>Total da OC</span>
              <span>R$ {po.totalAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-green-600 uppercase tracking-widest">
              <span>Já Recebido</span>
              <span>R$ {po.receivedAmount.toLocaleString()}</span>
            </div>
            <div className="pt-2 border-t border-[#E5E5E5] flex justify-between text-sm font-bold text-[#141414] uppercase tracking-widest">
              <span>Saldo Pendente</span>
              <span>R$ {remaining.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Número da Nota Fiscal</label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
              <input 
                type="text"
                {...register('invoiceNumber')}
                className="w-full pl-10 pr-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
                placeholder="Ex: NF-12345"
              />
            </div>
            {errors.invoiceNumber && <p className="text-xs text-red-500 font-medium">{errors.invoiceNumber.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Valor a Receber</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
              <input 
                type="number"
                step="0.01"
                {...register('amount', { valueAsNumber: true })}
                className="w-full pl-10 pr-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
                placeholder="0,00"
              />
            </div>
            {errors.amount && <p className="text-xs text-red-500 font-medium">{errors.amount.message}</p>}
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
              <Package size={20} />
              <span>Confirmar Recebimento</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
