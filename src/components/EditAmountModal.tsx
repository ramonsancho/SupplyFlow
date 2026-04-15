import React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Save, DollarSign, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { PurchaseOrder, POItem } from '../types';

const editAmountSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    description: z.string().min(1, 'Descrição é obrigatória'),
    quantity: z.number().min(0.01, 'Qtd deve ser maior que zero'),
    unit: z.string().min(1, 'Unidade é obrigatória'),
    unitPrice: z.number().min(0, 'Preço deve ser positivo'),
    tax: z.number().min(0, 'Imposto deve ser positivo'),
  })),
  totalAmount: z.number().min(0, 'O valor deve ser positivo'),
});

type EditAmountFormData = z.infer<typeof editAmountSchema>;

interface EditAmountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newAmount: number, items: POItem[]) => void;
  po: PurchaseOrder | null;
}

export default function EditAmountModal({ isOpen, onClose, onSubmit, po }: EditAmountModalProps) {
  const { register, handleSubmit, control, watch, setValue, formState: { errors }, reset } = useForm<EditAmountFormData>({
    resolver: zodResolver(editAmountSchema),
    defaultValues: {
      items: po?.items || [],
      totalAmount: po?.totalAmount || 0,
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  const watchedItems = watch("items");

  React.useEffect(() => {
    if (isOpen && po) {
      reset({ 
        items: po.items,
        totalAmount: po.totalAmount 
      });
    }
  }, [isOpen, po, reset]);

  // Recalculate total on the fly for display and submission
  const calculatedTotal = watchedItems?.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    return acc + (qty * price);
  }, 0) || 0;

  if (!isOpen || !po) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
          <div>
            <h3 className="text-xl font-bold text-[#141414]">Editar Itens e Valores da OC</h3>
            <p className="text-xs text-[#8E9299] mt-1 font-medium uppercase tracking-widest">OC #{po.number} - {po.supplierName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => onSubmit(calculatedTotal, data.items as POItem[]))} className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
            <AlertCircle className="text-blue-500 shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-blue-700 font-medium leading-relaxed">
              Atenção: Você está alterando os itens de uma OC já aprovada. O valor total será recalculado automaticamente.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#141414] uppercase tracking-widest">Itens da Ordem</h4>
              <button 
                type="button"
                onClick={() => append({ id: crypto.randomUUID(), description: '', quantity: 1, unit: 'UN', unitPrice: 0, tax: 0 })}
                className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
              >
                <Plus size={16} />
                Adicionar Item / Desconto
              </button>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-3 p-4 bg-[#F5F5F5] rounded-2xl items-end group">
                  <div className="col-span-4 space-y-1">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest ml-1">Descrição</label>
                    <input 
                      {...register(`items.${index}.description`)}
                      className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
                      placeholder="Descrição do item"
                    />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest ml-1">Qtd</label>
                    <input 
                      type="number"
                      step="0.01"
                      {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                      className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest ml-1">Unid</label>
                    <input 
                      {...register(`items.${index}.unit`)}
                      className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest ml-1">Preço Unit.</label>
                    <input 
                      type="number"
                      step="0.01"
                      {...register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                      className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest ml-1">Subtotal</label>
                    <div className="px-3 py-2 bg-white/50 rounded-lg text-sm font-bold text-[#141414]">
                      R$ {((Number(watchedItems?.[index]?.quantity) || 0) * (Number(watchedItems?.[index]?.unitPrice) || 0)).toLocaleString()}
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center pb-2">
                    <button 
                      type="button"
                      onClick={() => remove(index)}
                      className="p-2 text-[#8E9299] hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 bg-[#141414] rounded-2xl flex items-center justify-between text-white">
            <div>
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">Novo Total da Ordem</p>
              <div className="flex items-center gap-2">
                <DollarSign size={24} className="text-white/60" />
                <span className="text-3xl font-bold">R$ {calculatedTotal.toLocaleString()}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">Valor Anterior</p>
              <p className="text-xl font-bold text-white/40 line-through">R$ {po.totalAmount.toLocaleString()}</p>
            </div>
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
              <span>Salvar Alterações</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

