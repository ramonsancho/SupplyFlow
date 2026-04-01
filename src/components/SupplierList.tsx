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
  AlertCircle
} from 'lucide-react';
import SupplierModal from './SupplierModal';
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
        addLog('Editou Fornecedor', 'Supplier', editingSupplier.id, auth.currentUser?.email || 'Unknown');
        addNotification('Fornecedor Atualizado', `Os dados de ${data.name} foram salvos.`, 'success');
      } else {
        const docRef = await addDoc(collection(db, 'suppliers'), {
          ...data,
          createdAt: serverTimestamp(),
          rating: 0
        });
        addLog('Cadastrou Fornecedor', 'Supplier', docRef.id, auth.currentUser?.email || 'Unknown');
        addNotification('Fornecedor Cadastrado', `${data.name} foi adicionado com sucesso.`, 'success');
      }
      setIsModalOpen(false);
      setEditingSupplier(undefined);
    } catch (error) {
      handleFirestoreError(error, editingSupplier ? OperationType.UPDATE : OperationType.CREATE, 'suppliers');
    }
  };

  const handleDeleteSupplier = async (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja excluir o fornecedor ${name}?`)) {
      try {
        await deleteDoc(doc(db, 'suppliers', id));
        addLog('Excluiu Fornecedor', 'Supplier', id, auth.currentUser?.email || 'Unknown');
        addNotification('Fornecedor Excluído', `${name} foi removido do sistema.`, 'warning');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `suppliers/${id}`);
      }
    }
  };

  const filteredSuppliers = suppliers.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.document.includes(searchTerm);
    const matchesFamily = selectedFamily === 'Todas as Famílias' || s.families.includes(selectedFamily);
    return matchesSearch && matchesFamily;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#141414]">Fornecedores</h2>
          <p className="text-[#8E9299] mt-1">Gerencie sua base de parceiros e categorias.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-[#141414] text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:scale-105 transition-all"
        >
          <Plus size={20} />
          <span>Novo Fornecedor</span>
        </button>
      </div>

      <SupplierModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingSupplier(undefined);
        }} 
        onSubmit={handleSaveSupplier}
        initialData={editingSupplier}
      />

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou CNPJ..." 
            className="w-full pl-10 pr-4 py-2 bg-[#F5F5F5] border-none rounded-lg text-sm focus:ring-2 focus:ring-[#141414]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-[#141414] bg-white border border-[#E5E5E5] rounded-lg hover:bg-[#F5F5F5] transition-colors">
          <Filter size={18} />
          <span>Filtros Avançados</span>
        </button>
        <select 
          className="px-4 py-2 text-sm font-bold text-[#141414] bg-white border border-[#E5E5E5] rounded-lg focus:ring-2 focus:ring-[#141414]"
          value={selectedFamily}
          onChange={(e) => setSelectedFamily(e.target.value)}
        >
          <option>Todas as Famílias</option>
          {families.map(family => (
            <option key={family} value={family}>{family}</option>
          ))}
        </select>
      </div>

      {/* Supplier Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#141414]"></div>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E5E5E5] p-12 text-center">
          <Users size={48} className="mx-auto text-[#E5E5E5] mb-4" />
          <h3 className="text-lg font-bold text-[#141414]">Nenhum fornecedor encontrado</h3>
          <p className="text-[#8E9299] mt-1">Tente ajustar seus filtros ou cadastre um novo fornecedor.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredSuppliers.map((supplier) => (
            <div key={supplier.id} className="bg-white rounded-3xl border border-[#E5E5E5] p-6 hover:shadow-xl transition-all group">
              <div className="flex items-start justify-between mb-6">
                <div className="w-12 h-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center text-[#141414] font-bold text-xl group-hover:bg-[#141414] group-hover:text-white transition-colors">
                  {supplier.name.charAt(0)}
                </div>
                <div className="flex items-center gap-2">
                  {supplier.isCritical && (
                    <div className="bg-red-50 px-2 py-1 rounded-full flex items-center gap-1 border border-red-100">
                      <AlertCircle size={10} className="text-red-500" />
                      <span className="text-[10px] font-bold text-red-600 uppercase tracking-tighter">Crítico</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-full">
                    <Star size={14} className="fill-yellow-400 text-yellow-400" />
                    <span className="text-xs font-bold text-yellow-700">{supplier.rating}</span>
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-bold text-[#141414] mb-1">{supplier.name}</h3>
              <p className="text-xs text-[#8E9299] font-medium mb-4">{supplier.document}</p>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-sm text-[#8E9299]">
                  <MapPin size={16} />
                  <span className="truncate">{supplier.address}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-[#8E9299]">
                  <Mail size={16} />
                  <span>{supplier.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-[#8E9299]">
                  <Phone size={16} />
                  <span>{supplier.phone}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {supplier.families.map(family => (
                  <span key={family} className="text-[10px] font-bold uppercase tracking-widest bg-[#F5F5F5] text-[#8E9299] px-2 py-1 rounded-md">
                    {family}
                  </span>
                ))}
              </div>

              <div className="pt-6 border-t border-[#E5E5E5] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setEditingSupplier(supplier);
                      setIsModalOpen(true);
                    }}
                    className="p-2 text-[#8E9299] hover:text-[#141414] hover:bg-[#F5F5F5] rounded-full transition-all"
                    title="Editar"
                  >
                    <Edit size={18} />
                  </button>
                  <button 
                    onClick={() => handleDeleteSupplier(supplier.id, supplier.name)}
                    className="p-2 text-[#8E9299] hover:text-[#FF4444] hover:bg-red-50 rounded-full transition-all"
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <button className="flex items-center gap-2 text-xs font-bold text-[#141414] hover:gap-3 transition-all">
                  VER DETALHES
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
