import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Save, Plus, Trash2, User, AlertCircle } from 'lucide-react';
import { RFQ, Supplier, ProposalItem } from '../types';
import { db, handleFirestoreError, OperationType, formatCurrency } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

const proposalSchema = z.object({
  supplierId: z.string().min(1, 'Selecione um fornecedor'),
  deliveryDate: z.string().min(1, 'Data de entrega obrigatória'),
  totalValue: z.number().optional(),
  items: z.array(z.object({
    id: z.string().optional(),
    description: z.string(),
    quantity: z.number(),
    unit: z.string(),
    unitPrice: z.number().min(0, 'Preço deve ser positivo'),
  })),
});

type ProposalFormData = z.infer<typeof proposalSchema>;

interface ProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProposalFormData & { supplierName: string }) => void;
  rfq: RFQ;
}

export default function ProposalModal({ isOpen, onClose, onSubmit, rfq }: ProposalModalProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  
  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm<ProposalFormData>({
    resolver: zodResolver(proposalSchema),
    defaultValues: {
      supplierId: '',
      deliveryDate: '',
      items: (rfq.items || []).map(item => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: 0,
      })),
    }
  });

  const { fields } = useFieldArray({
    control,
    name: "items"
  });

  useEffect(() => {
    if (isOpen) {
      setValidationError(null);
      reset({
        supplierId: '',
        deliveryDate: '',
        items: (rfq.items || []).map(item => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: 0,
        })),
      });
    }
  }, [isOpen, rfq, reset]);

  useEffect(() => {
    if (!isOpen) return;

    const q = query(collection(db, 'suppliers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const supplierData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Supplier[];
      setSuppliers(supplierData);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'suppliers');
      } catch (e) {
        console.error('Suppliers list error:', e);
      }
    });

    return () => unsubscribe();
  }, [isOpen]);

  const onFormSubmit = (data: ProposalFormData) => {
    const selectedSupplier = suppliers.find(s => s.id === data.supplierId);
    
    if (rfq.family && selectedSupplier && !selectedSupplier.families.includes(rfq.family)) {
      setValidationError(`O fornecedor ${selectedSupplier.name} não possui a família de fornecimento "${rfq.family}" cadastrada.`);
      return;
    }

    setValidationError(null);
    // Calculate total value to include in the payload
    const totalValue = data.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);

    // Clean up undefined values (like id in items) to avoid Firestore errors
    const cleanedItems = data.items.map(item => {
      const cleanedItem = { ...item };
      if (cleanedItem.id === undefined) {
        delete cleanedItem.id;
      }
      return cleanedItem;
    });

    onSubmit({
      ...data,
      items: cleanedItems,
      totalValue,
      supplierName: selectedSupplier?.name || 'Unknown'
    });
  };

  const items = watch('items');
  const totalValue = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
          <div>
            <h3 className="text-xl font-bold text-[#141414]">Incluir Proposta</h3>
            <p className="text-xs text-[#8E9299] mt-1 font-medium uppercase tracking-widest">RFQ #{rfq.number}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} className="p-8 space-y-8 overflow-y-auto">
          {(Object.keys(errors).length > 0 || validationError) && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-600">
              <AlertCircle size={20} className="shrink-0" />
              <p className="text-sm font-bold">{validationError || "Por favor, preencha todos os campos obrigatórios corretamente."}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Fornecedor</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
                <select 
                  {...register('supplierId')}
                  className="w-full pl-12 pr-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all appearance-none"
                >
                  <option value="">Selecione um fornecedor...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              {errors.supplierId && <p className="text-xs text-red-500 font-medium">{errors.supplierId.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Data de Entrega</label>
              <input 
                type="date"
                {...register('deliveryDate')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
              />
              {errors.deliveryDate && <p className="text-xs text-red-500 font-medium">{errors.deliveryDate.message}</p>}
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Preços dos Itens</label>
            <div className="space-y-3">
              {fields.length === 0 ? (
                <p className="text-sm text-[#8E9299]">Esta RFQ não possui itens.</p>
              ) : fields.map((field, index) => (
                <div key={field.id} className="flex flex-col md:flex-row gap-4 p-4 bg-[#F5F5F5] rounded-2xl">
                  <div className="flex-1">
                    <p className="text-xs font-bold text-[#141414]">{field.description}</p>
                    <p className="text-[10px] text-[#8E9299] uppercase tracking-widest">{field.quantity} {field.unit}</p>
                  </div>
                  <div className="w-40 space-y-2">
                    <label className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Preço Unitário (R$)</label>
                    <input 
                      type="number"
                      step="0.01"
                      {...register(`items.${index}.unitPrice` as const, { valueAsNumber: true })}
                      className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
                    />
                  </div>
                  <div className="w-32 flex flex-col justify-end items-end">
                    <p className="text-[10px] font-bold text-[#8E9299] uppercase tracking-widest">Subtotal</p>
                    <p className="text-sm font-bold text-[#141414]">
                      R$ {formatCurrency(field.quantity * (watch(`items.${index}.unitPrice`) || 0))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center p-6 bg-[#141414] rounded-2xl text-white">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-60">Valor Total da Proposta</p>
              <p className="text-2xl font-bold">R$ {formatCurrency(totalValue)}</p>
            </div>
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={onClose}
                className="px-6 py-3 text-sm font-bold text-white/60 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="bg-white text-[#141414] px-8 py-3 rounded-xl font-bold shadow-lg hover:scale-105 transition-all"
              >
                Salvar Proposta
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
