import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Save, Plus, Trash2, Tag } from 'lucide-react';
import { RFQ } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

const rfqSchema = z.object({
  title: z.string().min(5, 'Título deve ter pelo menos 5 caracteres'),
  desiredDate: z.string().min(1, 'Data desejada obrigatória'),
  family: z.string().optional(),
  items: z.array(z.object({
    description: z.string().min(3, 'Descrição obrigatória'),
    quantity: z.number().min(1, 'Quantidade deve ser pelo menos 1'),
    unit: z.string().min(1, 'Unidade obrigatória'),
  })).min(1, 'Adicione pelo menos um item'),
});

type RFQFormData = z.infer<typeof rfqSchema>;

interface RFQModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: RFQFormData) => void;
  initialData?: Partial<RFQ>;
}

export default function RFQModal({ isOpen, onClose, onSubmit, initialData }: RFQModalProps) {
  const [families, setFamilies] = useState<string[]>([]);
  
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<RFQFormData>({
    resolver: zodResolver(rfqSchema),
    defaultValues: {
      title: initialData?.title || '',
      desiredDate: initialData?.desiredDate || '',
      family: initialData?.family || '',
      items: initialData?.items || [{ description: '', quantity: 1, unit: 'un' }],
    }
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        title: initialData?.title || '',
        desiredDate: initialData?.desiredDate || '',
        family: initialData?.family || '',
        items: initialData?.items || [{ description: '', quantity: 1, unit: 'un' }],
      });
    }
  }, [isOpen, initialData, reset]);

  useEffect(() => {
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

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  const onFormSubmit = (data: RFQFormData) => {
    const itemsWithIds = data.items.map(item => ({
      ...item,
      id: crypto.randomUUID()
    }));
    onSubmit({ ...data, items: itemsWithIds });
    reset({
      title: '',
      desiredDate: '',
      family: '',
      items: [{ description: '', quantity: 1, unit: 'un' }],
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
          <div>
            <h3 className="text-xl font-bold text-[#141414]">
              {initialData ? 'Editar Cotação' : 'Nova Cotação (RFQ)'}
            </h3>
            <p className="text-xs text-[#8E9299] mt-1 font-medium uppercase tracking-widest">Solicitação de Preços</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} className="p-8 space-y-8 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Título da Cotação</label>
              <input 
                {...register('title')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
                placeholder="Ex: Aquisição de Material de Escritório - Q2"
              />
              {errors.title && <p className="text-xs text-red-500 font-medium">{errors.title.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Família de Fornecimento</label>
              <div className="relative">
                <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
                <select 
                  {...register('family')}
                  className="w-full pl-12 pr-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all appearance-none"
                >
                  <option value="">Selecione uma família...</option>
                  {families.map(family => (
                    <option key={family} value={family}>{family}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Data Desejada para Entrega</label>
              <input 
                type="date"
                {...register('desiredDate')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
              />
              {errors.desiredDate && <p className="text-xs text-red-500 font-medium">{errors.desiredDate.message}</p>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Itens da Cotação</label>
              <button 
                type="button"
                onClick={() => append({ description: '', quantity: 1, unit: 'un' })}
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
                      placeholder="Ex: Papel A4 75g"
                    />
                  </div>
                  <div className="w-24 space-y-2">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Qtd</label>
                    <input 
                      type="number"
                      {...register(`items.${index}.quantity` as const, { valueAsNumber: true })}
                      className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="w-24 space-y-2">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Unidade</label>
                    <input 
                      {...register(`items.${index}.unit` as const)}
                      className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
                      placeholder="un, kg, cx"
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
              <span>Gerar RFQ</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
