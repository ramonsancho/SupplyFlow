import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDestructive = false
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isDestructive ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-lg font-bold text-[#141414]">{title}</h3>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-[#F5F5F5] rounded-full transition-colors text-[#8E9299]"
            >
              <X size={20} />
            </button>
          </div>
          
          <p className="text-[#8E9299] text-sm leading-relaxed mb-8">
            {message}
          </p>
          
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-bold text-[#141414] bg-white border border-[#E5E5E5] rounded-full hover:bg-[#F5F5F5] transition-all"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-full transition-all ${
                isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-[#141414] hover:bg-[#2A2A2A]'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
