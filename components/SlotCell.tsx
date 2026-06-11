'use client'

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

interface SlotCellProps {
  date: Date;
  shiftId: number;
  initialCapacity: number;
  initialRegistered: number;
  initialIsEnrolled: boolean;
}

export function SlotCell({ 
  date, 
  shiftId, 
  initialCapacity, 
  initialRegistered, 
  initialIsEnrolled 
}: SlotCellProps) {
  // En producción, estos estados se sincronizarán con Supabase Realtime
  const [registered, setRegistered] = useState(initialRegistered);
  const [isEnrolled, setIsEnrolled] = useState(initialIsEnrolled);
  const [isPending, startTransition] = useTransition();

  const isFull = registered >= initialCapacity;

  const handleToggleEnrollment = () => {
    // Evitar acciones si está lleno (y no estamos inscritos) o si está cargando
    if ((isFull && !isEnrolled) || isPending) return;

    startTransition(async () => {
      // Simular latencia de red de Supabase
      await new Promise(resolve => setTimeout(resolve, 600));

      if (isEnrolled) {
        // Desinscribirse
        setRegistered(prev => Math.max(0, prev - 1));
        setIsEnrolled(false);
      } else {
        // Inscribirse
        setRegistered(prev => Math.min(initialCapacity, prev + 1));
        setIsEnrolled(true);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggleEnrollment}
      disabled={isPending || (isFull && !isEnrolled)}
      className={cn(
        "w-full h-16 rounded-xl flex flex-col items-center justify-center transition-all duration-200 border relative overflow-hidden group active:scale-[0.97]",
        isPending && "opacity-70 cursor-wait",
        
        // Estado: Inscrito
        isEnrolled && !isPending && "bg-[#0084d1]/5 border-[#0084d1] shadow-sm",
        
        // Estado: Lleno (y no inscrito)
        isFull && !isEnrolled && !isPending && "bg-slate-50 border-slate-200 opacity-60 grayscale cursor-not-allowed",
        
        // Estado: Disponible
        !isEnrolled && !isFull && !isPending && "bg-white border-slate-200 hover:border-[#0084d1]/50 hover:shadow-md hover:bg-slate-50/50"
      )}
    >
      {isPending ? (
        <span className="material-symbols-outlined text-[20px] animate-spin text-[#0084d1]">progress_activity</span>
      ) : isEnrolled ? (
        <>
          <div className="bg-[#0084d1] rounded-full p-1 mb-1 shadow-sm shadow-[#0084d1]/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[16px] text-white">check</span>
          </div>
          <span className="text-[10px] font-bold text-[#0084d1] uppercase tracking-widest">
            Confirmado
          </span>
          {/* Tooltip on hover to unenroll */}
          <div className="absolute inset-0 bg-red flex items-center justify-center text-white text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0">
            Remover Turno
          </div>
        </>
      ) : isFull ? (
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Sin Cupo
        </span>
      ) : (
        <div className="flex flex-col items-center">
          <span className="text-base font-bold text-slate-800 tabular-nums">
            {initialCapacity - registered}
          </span>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            Disponibles
          </span>
        </div>
      )}
    </button>
  );
}
