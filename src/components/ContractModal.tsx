import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Save, Tag } from 'lucide-react';
import { Contract, Supplier } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const contractSchema = z.object({
  supplierId: z.string().min(1, 'Selecione um fornecedor'),
  supplierName: z.string().min(1, 'Nome do fornecedor obrigatório'),
  startDate: z.string().min(1, 'Data de início obrigatória'),
  endDate: z.string().min(1, 'Data de término obrigatória'),
  status: z.enum(['active', 'expired', 'terminated']),
  lastAdjustmentDate: z.string().optional(),
  lastAdjustmentPercentage: z.number().optional(),
  notes: z.string().optional(),
});

type ContractFormData = z.infer<typeof contractSchema>;

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ContractFormData) => void;
  initialData?: Partial<Contract>;
}

export default function ContractModal({ isOpen, onClose, onSubmit, initialData }: ContractModalProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<ContractFormData>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      status: 'active',
      ...initialData
    }
  });

  useEffect(() => {
    const q = query(collection(db, 'suppliers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Supplier[];
      setSuppliers(data);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'suppliers');
      } catch (e) {
        console.error('ContractModal suppliers error:', e);
      }
    });

    return () => unsubscribe();
  }, []);

  const selectedSupplierId = watch('supplierId');
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

  useEffect(() => {
    if (selectedSupplierId) {
      if (selectedSupplier) {
        setValue('supplierName', selectedSupplier.name);
      }
    }
  }, [selectedSupplierId, selectedSupplier, setValue]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
          <h3 className="text-xl font-bold text-[#141414]">
            {initialData?.id ? 'Editar Contrato' : 'Novo Contrato'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#8E9299] uppercase tracking-widest">Fornecedor</label>
                {selectedSupplier && (
                  <div className="flex flex-wrap gap-1">
                    {selectedSupplier.families.map((family) => (
                      <span 
                        key={family} 
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#F5F5F5] text-[#8E9299] rounded text-[8px] font-bold uppercase tracking-tighter"
                      >
                        <Tag size={8} />
                        {family}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <select
                {...register('supplierId')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#141414] transition-all"
              >
                <option value="">Selecione um fornecedor</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {errors.supplierId && <p className="text-red-500 text-[10px] font-bold uppercase">{errors.supplierId.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#8E9299] uppercase tracking-widest">Status</label>
              <select
                {...register('status')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#141414] transition-all"
              >
                <option value="active">Ativo</option>
                <option value="expired">Expirado</option>
                <option value="terminated">Rescindido</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#8E9299] uppercase tracking-widest">Data de Início</label>
              <input
                type="date"
                {...register('startDate')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#141414] transition-all"
              />
              {errors.startDate && <p className="text-red-500 text-[10px] font-bold uppercase">{errors.startDate.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#8E9299] uppercase tracking-widest">Data de Término</label>
              <input
                type="date"
                {...register('endDate')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#141414] transition-all"
              />
              {errors.endDate && <p className="text-red-500 text-[10px] font-bold uppercase">{errors.endDate.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#8E9299] uppercase tracking-widest">Último Reajuste (Data)</label>
              <input
                type="date"
                {...register('lastAdjustmentDate')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#141414] transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#8E9299] uppercase tracking-widest">Último Reajuste (%)</label>
              <input
                type="number"
                step="0.01"
                {...register('lastAdjustmentPercentage', { valueAsNumber: true })}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#141414] transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#8E9299] uppercase tracking-widest">Observações</label>
            <textarea
              {...register('notes')}
              rows={3}
              className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl text-sm focus:ring-2 focus:ring-[#141414] transition-all resize-none"
              placeholder="Detalhes adicionais do contrato..."
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-[#E5E5E5] text-[#141414] rounded-xl font-bold hover:bg-[#F5F5F5] transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-[#141414] text-white rounded-xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2"
            >
              <Save size={18} />
              Salvar Contrato
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
