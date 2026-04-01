import React, { useState } from 'react';
import { X, Star, CheckCircle2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rating: number) => void;
  poNumber: number;
  supplierName: string;
}

export default function RatingModal({ isOpen, onClose, onSubmit, poNumber, supplierName }: RatingModalProps) {
  const [rating, setRating] = useState<number | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center text-green-600">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#141414]">Concluir OC #{poNumber}</h3>
                <p className="text-xs text-[#8E9299] font-medium uppercase tracking-widest">{supplierName}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-[#F5F5F5] rounded-full transition-colors">
              <X size={20} className="text-[#8E9299]" />
            </button>
          </div>

          <div className="space-y-8">
            <div className="text-center">
              <p className="text-sm text-[#141414] font-medium mb-6">
                Como você avalia o desempenho do fornecedor nesta ordem de compra? (0 a 10)
              </p>
              
              <div className="grid grid-cols-5 sm:grid-cols-11 gap-2">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    onClick={() => setRating(num)}
                    className={cn(
                      "w-full aspect-square rounded-xl text-sm font-bold transition-all flex items-center justify-center border-2",
                      rating === num 
                        ? "bg-[#141414] text-white border-[#141414] scale-110 shadow-lg" 
                        : "bg-white text-[#141414] border-[#E5E5E5] hover:border-[#141414]"
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-4 rounded-2xl font-bold text-[#8E9299] hover:bg-[#F5F5F5] transition-all"
              >
                Cancelar
              </button>
              <button
                disabled={rating === null}
                onClick={() => rating !== null && onSubmit(rating)}
                className="flex-1 bg-[#141414] text-white py-4 rounded-2xl font-bold shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Concluir e Avaliar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
