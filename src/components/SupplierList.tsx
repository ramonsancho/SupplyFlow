import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Filter, 
  MoreVertical, 
  Star, 
  MapPin, 
  Phone, 
  Mail,
  Trash2,
  Edit,
  ChevronRight,
  Users,
  AlertCircle,
  Building2,
  Globe,
  ShieldCheck,
  X
} from 'lucide-react';
import SupplierModal from './SupplierModal';
import ConfirmModal from './ConfirmModal';
import { Supplier } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useNotifications } from '../hooks/useNotifications';
import { useAuditLog } from '../hooks/useAuditLog';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function SupplierList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [families, setFamilies] = useState<string[]>(['Eletrônicos', 'Escritório', 'Serviços de TI', 'Limpeza', 'Mobiliário', 'Logística']);
  const [selectedFamily, setSelectedFamily] = useState('Todas as Famílias');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>();
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterCritical, setFilterCritical] = useState<boolean | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<{id: string, name: string} | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { addNotification } = useNotifications();
  const { addLog } = useAuditLog();

  useEffect(() => {
    const q = query(collection(db, 'suppliers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const supplierData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
      })) as Supplier[];
      setSuppliers(supplierData);
      setIsLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'suppliers');
      } catch (e) {
        console.error('SupplierList error:', e);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'families'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbFamilies = snapshot.docs.map(doc => doc.data().name as string);
      const defaultFamilies = ['Eletrônicos', 'Escritório', 'Serviços de TI', 'Limpeza', 'Mobiliário', 'Logística'];
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
  }, []);

  const handleSaveSupplier = async (data: any) => {
    try {
      if (editingSupplier) {
        const supplierRef = doc(db, 'suppliers', editingSupplier.id);
        await updateDoc(supplierRef, {
          ...data,
          updatedAt: serverTimestamp()
        });
        await addLog('Editou Fornecedor', 'Supplier', editingSupplier.id, auth.currentUser?.email || 'Unknown');
        await addNotification('Fornecedor Atualizado', `Os dados de ${data.name} foram salvos.`, 'success');
      } else {
        const docRef = await addDoc(collection(db, 'suppliers'), {
          ...data,
          createdAt: serverTimestamp(),
          rating: 0
        });
        await addLog('Cadastrou Fornecedor', 'Supplier', docRef.id, auth.currentUser?.email || 'Unknown');
        await addNotification('Fornecedor Cadastrado', `${data.name} foi adicionado com sucesso.`, 'success');
      }
      setIsModalOpen(false);
      setEditingSupplier(undefined);
      setIsReadOnly(false);
    } catch (error) {
      try {
        handleFirestoreError(error, editingSupplier ? OperationType.UPDATE : OperationType.CREATE, 'suppliers');
      } catch (e) {
        console.error('Supplier save error:', e);
      }
    }
  };

  const handleDeleteSupplier = async (id: string, name: string) => {
    try {
      await deleteDoc(doc(db, 'suppliers', id));
      await addLog('Excluiu Fornecedor', 'Supplier', id, auth.currentUser?.email || 'Unknown');
      await addNotification('Fornecedor Excluído', `${name} foi removido do sistema.`, 'warning');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `suppliers/${id}`);
      } catch (e) {
        console.error('Supplier delete error:', e);
      }
    }
  };

  const filteredSuppliers = suppliers.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.document.includes(searchTerm);
    const matchesFamily = selectedFamily === 'Todas as Famílias' || s.families.includes(selectedFamily);
    const matchesCritical = filterCritical === null || s.isCritical === filterCritical;
    return matchesSearch && matchesFamily && matchesCritical;
  });

  return (
    <div className="space-y-12">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900">Base de Fornecedores</h2>
          <p className="text-slate-500 mt-2 text-lg font-medium">Gerencie sua rede de parceiros estratégicos e categorias.</p>
        </div>
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setEditingSupplier(undefined);
            setIsReadOnly(false);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-slate-200 hover:bg-brand-600 hover:shadow-brand-500/20 transition-all duration-300 self-start"
        >
          <Plus size={20} />
          <span>Cadastrar Parceiro</span>
        </motion.button>
      </div>

      <SupplierModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingSupplier(undefined);
          setIsReadOnly(false);
        }} 
        onSubmit={(data) => handleSaveSupplier(data).catch(err => console.error('Error in handleSaveSupplier:', err))}
        initialData={editingSupplier}
        readOnly={isReadOnly}
      />

      <ConfirmModal
        isOpen={!!supplierToDelete}
        onClose={() => setSupplierToDelete(null)}
        onConfirm={() => supplierToDelete && handleDeleteSupplier(supplierToDelete.id, supplierToDelete.name).catch(err => console.error('Error in handleDeleteSupplier:', err))}
        title="Excluir Fornecedor"
        message={`Tem certeza que deseja excluir o fornecedor ${supplierToDelete?.name}? Esta ação não poderá ser desfeita.`}
        confirmText="Excluir"
        variant="danger"
      />

      {/* Search and Filters */}
      <div className="space-y-6">
        <div className="bg-white p-3 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por nome, CNPJ ou categoria..." 
              className="w-full pl-14 pr-6 py-4 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <button 
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={cn(
                "flex items-center gap-2 px-6 py-4 text-sm font-bold rounded-2xl border transition-all duration-300",
                showAdvancedFilters 
                  ? "bg-slate-900 text-white border-slate-900 shadow-lg" 
                  : "text-slate-600 bg-white border-slate-200 hover:bg-slate-50"
              )}
            >
              <Filter size={18} />
              <span>Filtros</span>
            </button>
            <div className="relative flex-1 lg:w-64">
              <select 
                className="w-full appearance-none px-6 py-4 text-sm font-bold text-slate-700 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-500/20 outline-none cursor-pointer"
                value={selectedFamily}
                onChange={(e) => setSelectedFamily(e.target.value)}
              >
                <option>Todas as Famílias</option>
                {families.map(family => (
                  <option key={family} value={family}>{family}</option>
                ))}
              </select>
              <ChevronRight size={16} className="absolute right-5 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showAdvancedFilters && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200 flex flex-wrap gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Criticidade do Parceiro</label>
                  <div className="flex gap-2">
                    {[
                      { label: 'Todos', value: null },
                      { label: 'Críticos', value: true },
                      { label: 'Não Críticos', value: false }
                    ].map((btn) => (
                      <button 
                        key={String(btn.value)}
                        onClick={() => setFilterCritical(btn.value)}
                        className={cn(
                          "px-6 py-2.5 rounded-xl text-xs font-bold border transition-all duration-300",
                          filterCritical === btn.value 
                            ? "bg-slate-900 text-white border-slate-900 shadow-md" 
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                        )}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Supplier Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-4 border-slate-200 rounded-full" />
            <div className="absolute inset-0 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[3rem] border border-slate-200 p-20 text-center shadow-sm"
        >
          <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8">
            <Users size={40} className="text-slate-300" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900">Nenhum parceiro encontrado</h3>
          <p className="text-slate-500 mt-3 text-lg font-medium max-w-md mx-auto">Tente ajustar seus filtros ou cadastre um novo fornecedor para começar.</p>
          <button 
            onClick={() => {
              setSearchTerm('');
              setSelectedFamily('Todas as Famílias');
              setFilterCritical(null);
            }}
            className="mt-8 text-brand-600 font-bold text-sm hover:text-brand-700 transition-colors"
          >
            Limpar todos os filtros
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {filteredSuppliers.map((supplier, idx) => (
            <motion.div 
              key={supplier.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white rounded-[2.5rem] border border-slate-200 p-8 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 group relative overflow-hidden"
            >
              {/* Decorative background icon */}
              <Building2 className="absolute -right-8 -bottom-8 text-slate-50 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity" size={200} />
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-8">
                  <div className="w-16 h-16 rounded-[1.5rem] bg-slate-50 flex items-center justify-center text-slate-400 font-bold text-2xl group-hover:bg-brand-500 group-hover:text-white transition-all duration-500 shadow-inner">
                    {supplier.name.charAt(0)}
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    {supplier.isCritical && (
                      <div className="bg-rose-50 px-3 py-1 rounded-full flex items-center gap-1.5 border border-rose-100">
                        <AlertCircle size={12} className="text-rose-500" />
                        <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Crítico</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                      <Star size={14} className="fill-amber-400 text-amber-400" />
                      <span className="text-xs font-bold text-amber-700">{supplier.rating}</span>
                    </div>
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-brand-600 transition-colors">{supplier.name}</h3>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono font-bold text-slate-400">{supplier.document}</p>
                    <span className="w-1 h-1 rounded-full bg-slate-200" />
                    <p className={cn(
                      "text-xs font-bold",
                      (supplier.accuracy || 0) >= 90 ? "text-emerald-600" : 
                      (supplier.accuracy || 0) >= 70 ? "text-amber-600" : "text-rose-600"
                    )}>
                      {supplier.accuracy !== undefined ? `${supplier.accuracy}% Acuracidade` : 'Sem dados de performance'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-4 text-sm text-slate-500 font-medium">
                    <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-brand-500 transition-colors">
                      <MapPin size={16} />
                    </div>
                    <span className="truncate">{supplier.address}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500 font-medium">
                    <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-brand-500 transition-colors">
                      <Mail size={16} />
                    </div>
                    <span className="truncate">{supplier.email}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500 font-medium">
                    <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-brand-500 transition-colors">
                      <Phone size={16} />
                    </div>
                    <span>{supplier.phone}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-10">
                  {supplier.families.map(family => (
                    <span key={family} className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 px-3 py-1.5 rounded-xl group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                      {family}
                    </span>
                  ))}
                </div>

                <div className="pt-8 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <motion.button 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        setEditingSupplier(supplier);
                        setIsReadOnly(false);
                        setIsModalOpen(true);
                      }}
                      className="p-3 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all"
                      title="Editar"
                    >
                      <Edit size={18} />
                    </motion.button>
                    <motion.button 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setSupplierToDelete({ id: supplier.id, name: supplier.name })}
                      className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all"
                      title="Excluir"
                    >
                      <Trash2 size={18} />
                    </motion.button>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingSupplier(supplier);
                      setIsReadOnly(true);
                      setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 text-xs font-bold text-slate-900 hover:text-brand-600 transition-all group/btn"
                  >
                    DETALHES
                    <ChevronRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

