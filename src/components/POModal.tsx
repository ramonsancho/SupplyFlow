import React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Save, Plus, Trash2, DollarSign, Tag, AlertCircle } from 'lucide-react';
import { PurchaseOrder, Supplier } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

const poSchema = z.object({
  supplierId: z.string().min(1, 'Selecione um fornecedor'),
  family: z.string().optional(),
  deliveryDate: z.string().min(1, 'Data de entrega obrigatória'),
  status: z.enum(['draft', 'pending_approval', 'approved', 'sent', 'received', 'closed', 'cancelled']),
  items: z.array(z.object({
    id: z.string().optional(),
    description: z.string().min(3, 'Descrição obrigatória'),
    quantity: z.number().min(1, 'Quantidade deve ser pelo menos 1'),
    unit: z.string().min(1, 'Unidade obrigatória'),
    unitPrice: z.number().min(0.01, 'Preço unitário obrigatório'),
    tax: z.number().min(0, 'Imposto deve ser maior ou igual a 0'),
  })).min(1, 'Adicione pelo menos um item'),
});

type POFormData = z.infer<typeof poSchema>;

interface POModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: POFormData) => void;
  suppliers: Supplier[];
  initialData?: Partial<PurchaseOrder>;
}

export default function POModal({ isOpen, onClose, onSubmit, suppliers, initialData }: POModalProps) {
  const [families, setFamilies] = React.useState<string[]>([]);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const { register, control, handleSubmit, formState: { errors }, watch, reset } = useForm<POFormData>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      supplierId: initialData?.supplierId || '',
      family: initialData?.family || '',
      deliveryDate: initialData?.deliveryDate || '',
      status: initialData?.status || 'draft',
      items: initialData?.items || [{ description: '', quantity: 1, unit: 'un', unitPrice: 0, tax: 0 }],
    }
  });

  React.useEffect(() => {
    if (isOpen) {
      setValidationError(null);
      reset({
        supplierId: initialData?.supplierId || '',
        family: initialData?.family || '',
        deliveryDate: initialData?.deliveryDate || '',
        status: initialData?.status || 'draft',
        items: (initialData?.items || [{ description: '', quantity: 1, unit: 'un', unitPrice: 0, tax: 0 }]).map(item => ({
          ...item,
          id: (item as any).id || crypto.randomUUID()
        })),
      });
    }
  }, [isOpen, initialData, reset]);

  React.useEffect(() => {
    if (!isOpen) return;

    const q = query(collection(db, 'families'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbFamilies = snapshot.docs.map(doc => doc.data().name as string);
      const defaultFamilies = ['Serviços de TI', 'Limpeza', 'Logística de Material'];
      const allFamilies = Array.from(new Set([...defaultFamilies, ...dbFamilies])).sort();
      setFamilies(allFamilies);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'families');
      } catch (e) {
        console.error('Families list error:', e);
      }
    });

    return () => unsubscribe();
  }, [isOpen]);

  const onFormSubmit = (data: POFormData) => {
    const selectedSupplier = suppliers.find(s => s.id === data.supplierId);
    
    if (data.family && selectedSupplier && !selectedSupplier.families.includes(data.family)) {
      setValidationError(`O fornecedor ${selectedSupplier.name} não possui a família de fornecimento "${data.family}" cadastrada.`);
      return;
    }

    setValidationError(null);
    onSubmit(data);
  };

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  const items = watch('items') || [];
  const total = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice) + item.tax, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
          <div>
            <h3 className="text-xl font-bold text-[#141414]">
              {initialData ? 'Editar Ordem de Compra' : 'Nova Ordem de Compra (OC)'}
            </h3>
            <p className="text-xs text-[#8E9299] mt-1 font-medium uppercase tracking-widest">Pedido e Autorização</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} className="p-8 space-y-8 overflow-y-auto">
          {(Object.keys(errors).length > 0 || validationError) && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-600">
              <AlertCircle size={20} className="shrink-0" />
              <p className="text-sm font-bold">{validationError || "Por favor, verifique os campos obrigatórios."}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest text-left block">Fornecedor</label>
              <select 
                {...register('supplierId')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
              >
                <option value="">Selecione um fornecedor...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {errors.supplierId && <p className="text-xs text-red-500 font-medium">{errors.supplierId.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest text-left block">Família de Fornecimento</label>
              <div className="relative">
                <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
                <select 
                  {...register('family')}
                  className="w-full pl-12 pr-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all appearance-none"
                >
                  <option value="">Selecione uma família...</option>
                  {families.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest text-left block">Status Inicial</label>
              <select 
                {...register('status')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
              >
                <option value="draft">Rascunho</option>
                <option value="pending_approval">Pendente de Aprovação</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest text-left block">Prazo de Entrega</label>
              <input 
                type="date"
                {...register('deliveryDate')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
              />
              {errors.deliveryDate && <p className="text-xs text-red-500 font-medium">{errors.deliveryDate.message}</p>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Itens do Pedido</label>
              <button 
                type="button"
                onClick={() => append({ id: crypto.randomUUID(), description: '', quantity: 1, unit: 'un', unitPrice: 0, tax: 0 })}
                className="flex items-center gap-2 text-xs font-bold text-[#141414] bg-[#F5F5F5] px-3 py-2 rounded-lg hover:bg-[#E5E5E5] transition-all"
              >
                <Plus size={16} />
                <span>Adicionar Item</span>
              </button>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="flex flex-col md:flex-row gap-4 p-4 bg-[#F5F5F5] rounded-2xl relative group">
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Descrição</label>
                    <input 
                      {...register(`items.${index}.description` as const)}
                      className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="w-20 space-y-2">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Qtd</label>
                    <input 
                      type="number"
                      {...register(`items.${index}.quantity` as const, { valueAsNumber: true })}
                      className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="w-20 space-y-2">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Un</label>
                    <input 
                      {...register(`items.${index}.unit` as const)}
                      className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="w-32 space-y-2">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Preço Unit.</label>
                    <input 
                      type="number"
                      step="0.01"
                      {...register(`items.${index}.unitPrice` as const, { valueAsNumber: true })}
                      className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="w-24 space-y-2">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Imposto</label>
                    <input 
                      type="number"
                      step="0.01"
                      {...register(`items.${index}.tax` as const, { valueAsNumber: true })}
                      className="w-full px-3 py-2 bg-white border-none rounded-xl text-sm focus:ring-2 focus:ring-[#141414]"
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={() => remove(index)}
                    className="absolute -right-2 -top-2 p-2 bg-white text-red-500 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {errors.items && <p className="text-xs text-red-500 font-medium">{errors.items.message}</p>}
          </div>

          <div className="bg-[#141414] p-8 rounded-3xl flex items-center justify-between text-white">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-2xl">
                <DollarSign size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Total do Pedido</p>
                <p className="text-3xl font-bold">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-white/60 font-medium">Itens: {items.length}</p>
              <p className="text-xs text-white/60 font-medium">Impostos: R$ {items.reduce((acc, i) => acc + (i.tax || 0), 0).toLocaleString()}</p>
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
              <span>Gerar Ordem de Compra</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
