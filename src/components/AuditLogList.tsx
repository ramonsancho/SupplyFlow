import React, { useState, useEffect } from 'react';
import { useAuditLog } from '../hooks/useAuditLog';
import { History, User, Tag, Clock } from 'lucide-react';

export default function AuditLogList() {
  const { logs } = useAuditLog();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (logs.length > 0 || logs.length === 0) {
      // Small delay to simulate loading if needed, but onSnapshot handles it
      setIsLoading(false);
    }
  }, [logs]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-[#141414]">Logs de Auditoria</h2>
        <p className="text-[#8E9299] mt-1">Rastreamento completo de ações no sistema.</p>
      </div>

      <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden">
        <div className="divide-y divide-[#E5E5E5]">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#141414] mx-auto"></div>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <History size={48} className="mx-auto text-[#E5E5E5] mb-4" />
              <p className="text-[#8E9299]">Nenhum log registrado ainda.</p>
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="p-6 flex items-start gap-6 hover:bg-[#F5F5F5] transition-colors">
                <div className="p-3 bg-[#F5F5F5] rounded-2xl text-[#141414]">
                  <History size={20} />
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <p className="text-sm font-bold text-[#141414]">{log.action}</p>
                    <p className="text-xs text-[#8E9299] mt-1">
                      Entidade: <span className="font-bold text-[#141414]">{log.entity}</span> (#{log.entityId})
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#8E9299]">
                    <User size={14} />
                    <span className="font-bold text-[#141414]">{log.userEmail}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#8E9299] justify-end">
                    <Clock size={14} />
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
