import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Save, Plus } from 'lucide-react';
import { Supplier } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_FAMILIES = ['Eletrônicos', 'Escritório', 'Serviços de TI', 'Limpeza', 'Mobiliário', 'Logística'];

const supplierSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  document: z.string().min(11, 'Documento inválido'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  address: z.string().min(5, 'Endereço obrigatório'),
  contactName: z.string().min(3, 'Nome do contato obrigatório'),
  paymentTerms: z.string().min(1, 'Condição de pagamento obrigatória'),
  notes: z.string().optional(),
  families: z.array(z.string()).min(1, 'Selecione pelo menos uma família'),
  isCritical: z.boolean(),
});

type SupplierFormData = z.infer<typeof supplierSchema>;

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: SupplierFormData) => void;
  initialData?: Partial<Supplier>;
}

export default function SupplierModal({ isOpen, onClose, onSubmit, initialData }: SupplierModalProps) {
  const [families, setFamilies] = useState<string[]>(DEFAULT_FAMILIES);
  const [newFamily, setNewFamily] = useState('');
  const [isAddingFamily, setIsAddingFamily] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      families: initialData?.families || [],
      isCritical: initialData?.isCritical || false,
      ...initialData
    }
  });

  useEffect(() => {
    const q = query(collection(db, 'families'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbFamilies = snapshot.docs.map(doc => doc.data().name as string);
      // Combine default with DB families, removing duplicates
      const allFamilies = Array.from(new Set([...DEFAULT_FAMILIES, ...dbFamilies])).sort();
      setFamilies(allFamilies);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'families');
      } catch (e) {
        console.error('SupplierModal families error:', e);
      }
    });

    return () => unsubscribe();
  }, []);

  const selectedFamilies = watch('families') || [];

  if (!isOpen) return null;

  const toggleFamily = (family: string) => {
    const current = selectedFamilies;
    if (current.includes(family)) {
      setValue('families', current.filter(f => f !== family));
    } else {
      setValue('families', [...current, family]);
    }
  };

  const handleAddFamily = async () => {
    if (!newFamily.trim()) return;
    
    const normalized = newFamily.trim();
    if (families.includes(normalized)) {
      setNewFamily('');
      setIsAddingFamily(false);
      return;
    }

    try {
      await addDoc(collection(db, 'families'), {
        name: normalized,
        createdAt: serverTimestamp()
      });
      setNewFamily('');
      setIsAddingFamily(false);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, 'families');
      } catch (e) {
        console.error('Family add error:', e);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
          <div>
            <h3 className="text-xl font-bold text-[#141414]">
              {initialData ? 'Editar Fornecedor' : 'Novo Fornecedor'}
            </h3>
            <p className="text-xs text-[#8E9299] mt-1 font-medium uppercase tracking-widest">Cadastro e Gerenciamento</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Razão Social / Nome</label>
              <input 
                {...register('name')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
                placeholder="Ex: Tech Solutions Ltda"
              />
              {errors.name && <p className="text-xs text-red-500 font-medium">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">CNPJ / CPF</label>
              <input 
                {...register('document')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
                placeholder="00.000.000/0001-00"
              />
              {errors.document && <p className="text-xs text-red-500 font-medium">{errors.document.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Email de Contato</label>
              <input 
                {...register('email')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
                placeholder="contato@empresa.com"
              />
              {errors.email && <p className="text-xs text-red-500 font-medium">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Telefone</label>
              <input 
                {...register('phone')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
                placeholder="(11) 99999-9999"
              />
              {errors.phone && <p className="text-xs text-red-500 font-medium">{errors.phone.message}</p>}
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Endereço Completo</label>
              <input 
                {...register('address')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
                placeholder="Rua, Número, Bairro, Cidade - UF"
              />
              {errors.address && <p className="text-xs text-red-500 font-medium">{errors.address.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Nome do Contato</label>
              <input 
                {...register('contactName')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
                placeholder="Nome do responsável"
              />
              {errors.contactName && <p className="text-xs text-red-500 font-medium">{errors.contactName.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Condições de Pagamento</label>
              <input 
                {...register('paymentTerms')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
                placeholder="Ex: 30/60 dias, À vista"
              />
              {errors.paymentTerms && <p className="text-xs text-red-500 font-medium">{errors.paymentTerms.message}</p>}
            </div>

            <div className="md:col-span-2 flex items-center gap-3 p-4 bg-[#F5F5F5] rounded-2xl border-2 border-transparent hover:border-[#141414] transition-all cursor-pointer" onClick={() => setValue('isCritical', !watch('isCritical'))}>
              <div className={cn(
                "w-12 h-6 rounded-full relative transition-colors duration-200",
                watch('isCritical') ? "bg-red-500" : "bg-gray-300"
              )}>
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200",
                  watch('isCritical') ? "left-7" : "left-1"
                )} />
              </div>
              <div>
                <p className="text-xs font-bold text-[#141414] uppercase tracking-widest">Fornecedor Crítico</p>
                <p className="text-[10px] text-[#8E9299] font-medium">Marque se este fornecedor é essencial para a operação.</p>
              </div>
              <input type="checkbox" {...register('isCritical')} className="hidden" />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Famílias de Produtos/Serviços</label>
            <div className="flex flex-wrap gap-2">
              {families.map(family => (
                <button
                  key={family}
                  type="button"
                  onClick={() => toggleFamily(family)}
                  className={cn(
                    "px-4 py-2 rounded-full text-xs font-bold transition-all border",
                    selectedFamilies.includes(family)
                      ? "bg-[#141414] text-white border-[#141414]"
                      : "bg-white text-[#8E9299] border-[#E5E5E5] hover:border-[#141414]"
                  )}
                >
                  {family}
                </button>
              ))}
              
              {!isAddingFamily ? (
                <button
                  type="button"
                  onClick={() => setIsAddingFamily(true)}
                  className="px-4 py-2 rounded-full text-xs font-bold transition-all border border-dashed border-[#E5E5E5] text-[#8E9299] hover:border-[#141414] hover:text-[#141414] flex items-center gap-1"
                >
                  <Plus size={14} />
                  Nova Família
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={newFamily}
                    onChange={(e) => setNewFamily(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddFamily();
                      }
                      if (e.key === 'Escape') setIsAddingFamily(false);
                    }}
                    className="px-4 py-2 rounded-full text-xs font-bold border border-[#141414] focus:outline-none w-32"
                    placeholder="Nome..."
                  />
                  <button
                    type="button"
                    onClick={handleAddFamily}
                    className="p-2 bg-[#141414] text-white rounded-full hover:bg-black transition-all"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingFamily(false)}
                    className="p-2 text-[#8E9299] hover:text-[#141414]"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            {errors.families && <p className="text-xs text-red-500 font-medium">{errors.families.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Notas Internas</label>
            <textarea 
              {...register('notes')}
              rows={3}
              className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all resize-none"
              placeholder="Observações sobre o fornecedor..."
            />
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
              <span>Salvar Fornecedor</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
