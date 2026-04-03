import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  FileText, 
  Calendar, 
  TrendingUp, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Contract, Supplier } from '../types';
import ContractModal from './ContractModal';
import ConfirmModal from './ConfirmModal';
import { Tag as TagIcon } from 'lucide-react';

export default function ContractList() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [contractToDelete, setContractToDelete] = useState<{id: string, supplierName: string} | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const qContracts = query(collection(db, 'contracts'), orderBy('createdAt', 'desc'));
    const unsubscribeContracts = onSnapshot(qContracts, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Contract[];
      setContracts(data);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'contracts');
      } catch (e) {
        console.error('ContractList contracts error:', e);
      }
    });

    const qSuppliers = query(collection(db, 'suppliers'));
    const unsubscribeSuppliers = onSnapshot(qSuppliers, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Supplier[];
      setSuppliers(data);
      setIsLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'suppliers');
      } catch (e) {
        console.error('ContractList suppliers error:', e);
      }
      setIsLoading(false);
    });

    return () => {
      unsubscribeContracts();
      unsubscribeSuppliers();
    };
  }, []);

  const filteredContracts = contracts.filter(c => 
    c.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.notes?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSupplierFamilies = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.families || [];
  };

  const handleAddContract = async (data: any) => {
    try {
      if (editingContract) {
        await updateDoc(doc(db, 'contracts', editingContract.id), {
          ...data,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'contracts'), {
          ...data,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setEditingContract(null);
    } catch (error) {
      try {
        handleFirestoreError(error, editingContract ? OperationType.UPDATE : OperationType.CREATE, 'contracts');
      } catch (e) {
        console.error('Contract save error:', e);
      }
    }
  };

  const handleDeleteContract = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'contracts', id));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, 'contracts');
      } catch (e) {
        console.error('Contract delete error:', e);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
            <CheckCircle2 size={12} /> Ativo
          </span>
        );
      case 'expired':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
            <XCircle size={12} /> Expirado
          </span>
        );
      case 'terminated':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-[#F5F5F5] text-[#8E9299] rounded-full text-[10px] font-bold uppercase tracking-wider">
            <AlertCircle size={12} /> Rescindido
          </span>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#141414]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#141414]">Contratos</h2>
          <p className="text-[#8E9299] mt-1">Gestão de contratos vigentes e reajustes.</p>
        </div>
        <button 
          onClick={() => {
            setEditingContract(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-[#141414] text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg shadow-black/10"
        >
          <Plus size={20} />
          Novo Contrato
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm">
        <div className="p-6 border-b border-[#E5E5E5] bg-[#F5F5F5]/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299]" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por fornecedor ou notas..." 
              className="w-full pl-10 pr-4 py-2 bg-white border border-[#E5E5E5] rounded-xl text-sm focus:ring-2 focus:ring-[#141414] transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5E5E5]">
                <th className="px-6 py-4 text-xs font-bold text-[#8E9299] uppercase tracking-widest">Fornecedor</th>
                <th className="px-6 py-4 text-xs font-bold text-[#8E9299] uppercase tracking-widest">Vigência</th>
                <th className="px-6 py-4 text-xs font-bold text-[#8E9299] uppercase tracking-widest">Último Reajuste</th>
                <th className="px-6 py-4 text-xs font-bold text-[#8E9299] uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-[#8E9299] uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {filteredContracts.map((contract) => (
                <tr key={contract.id} className="hover:bg-[#F5F5F5]/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#141414]">{contract.supplierName}</span>
                        <div className="flex flex-wrap gap-1">
                          {getSupplierFamilies(contract.supplierId).map((family) => (
                            <span 
                              key={family} 
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#F5F5F5] text-[#8E9299] rounded text-[8px] font-bold uppercase tracking-tighter"
                            >
                              <TagIcon size={8} />
                              {family}
                            </span>
                          ))}
                        </div>
                      </div>
                      {contract.notes && (
                        <span className="text-[10px] text-[#8E9299] mt-0.5 line-clamp-1">{contract.notes}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs text-[#141414]">
                      <Calendar size={14} className="text-[#8E9299]" />
                      <span>{new Date(contract.startDate).toLocaleDateString()} - {new Date(contract.endDate).toLocaleDateString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {contract.lastAdjustmentDate ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-[#141414]">
                          {contract.lastAdjustmentPercentage}% em {new Date(contract.lastAdjustmentDate).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] text-[#8E9299] uppercase tracking-tighter">Reajuste aplicado</span>
                      </div>
                    ) : (
                      <span className="text-xs text-[#8E9299]">Sem reajustes</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(contract.status)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          setEditingContract(contract);
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-[#8E9299] hover:text-[#141414] hover:bg-white rounded-lg transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => setContractToDelete({ id: contract.id, supplierName: contract.supplierName })}
                        className="p-2 text-[#8E9299] hover:text-[#FF4444] hover:bg-white rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredContracts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#8E9299] text-sm italic">
                    Nenhum contrato encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ContractModal 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingContract(null);
        }}
        onSubmit={(data) => handleAddContract(data).catch(err => console.error('Error in handleAddContract:', err))}
        initialData={editingContract || undefined}
      />

      <ConfirmModal
        isOpen={!!contractToDelete}
        onClose={() => setContractToDelete(null)}
        onConfirm={() => contractToDelete && handleDeleteContract(contractToDelete.id).catch(err => console.error('Error in handleDeleteContract:', err))}
        title="Excluir Contrato"
        message={`Tem certeza que deseja excluir o contrato do fornecedor ${contractToDelete?.supplierName}? Esta ação não poderá ser desfeita.`}
        confirmText="Excluir"
        variant="danger"
      />
    </div>
  );
}
