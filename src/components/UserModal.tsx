import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Save } from 'lucide-react';
import { User } from '../types';

const userSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  role: z.enum(['Administrador', 'Comprador', 'Aprovador'] as const),
  status: z.enum(['Ativo', 'Inativo'] as const),
  approvalLimit: z.number().min(0, 'O limite deve ser maior ou igual a 0').optional(),
  teamsWebhookUrl: z.string().url('URL inválida').or(z.literal('')).optional(),
});

type UserFormData = z.infer<typeof userSchema>;

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UserFormData) => void;
  initialData?: Partial<User>;
}

export default function UserModal({ isOpen, onClose, onSubmit, initialData }: UserModalProps) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: initialData?.name || '',
      email: initialData?.email || '',
      role: initialData?.role || 'Comprador',
      status: initialData?.status || 'Ativo',
      approvalLimit: initialData?.approvalLimit || 0,
      teamsWebhookUrl: initialData?.teamsWebhookUrl || '',
    }
  });

  React.useEffect(() => {
    if (isOpen) {
      reset({
        name: initialData?.name || '',
        email: initialData?.email || '',
        role: initialData?.role || 'Comprador',
        status: initialData?.status || 'Ativo',
        approvalLimit: initialData?.approvalLimit || 0,
        teamsWebhookUrl: initialData?.teamsWebhookUrl || '',
      });
    }
  }, [initialData, isOpen, reset]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F5]">
          <div>
            <h3 className="text-xl font-bold text-[#141414]">
              {initialData ? 'Editar Usuário' : 'Novo Usuário'}
            </h3>
            <p className="text-xs text-[#8E9299] mt-1 font-medium uppercase tracking-widest">Controle de Acesso</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Nome Completo</label>
            <input 
              {...register('name')}
              className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
              placeholder="Ex: João Silva"
            />
            {errors.name && <p className="text-xs text-red-500 font-medium">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Email</label>
            <input 
              {...register('email')}
              className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
              placeholder="email@exemplo.com"
            />
            {errors.email && <p className="text-xs text-red-500 font-medium">{errors.email.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Perfil</label>
              <select 
                {...register('role')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
              >
                <option value="Administrador">Administrador</option>
                <option value="Comprador">Comprador</option>
                <option value="Aprovador">Aprovador</option>
              </select>
              {errors.role && <p className="text-xs text-red-500 font-medium">{errors.role.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Status</label>
              <select 
                {...register('status')}
                className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
              >
                <option value="Ativo">Ativo</option>
                <option value="Inativo">Inativo</option>
              </select>
              {errors.status && <p className="text-xs text-red-500 font-medium">{errors.status.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Limite de Aprovação (R$)</label>
            <input 
              type="number"
              step="0.01"
              {...register('approvalLimit', { valueAsNumber: true })}
              className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
              placeholder="Ex: 5000.00"
            />
            {errors.approvalLimit && <p className="text-xs text-red-500 font-medium">{errors.approvalLimit.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#141414] uppercase tracking-widest">Teams Webhook URL</label>
            <input 
              {...register('teamsWebhookUrl')}
              className="w-full px-4 py-3 bg-[#F5F5F5] border-none rounded-xl focus:ring-2 focus:ring-[#141414] transition-all"
              placeholder="https://m365x...webhook.office.com/..."
            />
            <p className="text-[10px] text-[#8E9299]">URL do Webhook de Entrada do Microsoft Teams para notificações.</p>
            {errors.teamsWebhookUrl && <p className="text-xs text-red-500 font-medium">{errors.teamsWebhookUrl.message}</p>}
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
              <span>Salvar Usuário</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
