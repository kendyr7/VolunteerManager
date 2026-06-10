'use client'

import { useState, useTransition } from "react";
import { Loader2, Check } from "lucide-react";
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
        "w-full h-16 rounded-xl flex flex-col items-center justify-center transition-all duration-200 border-2 relative overflow-hidden group",
        isPending && "opacity-70 cursor-wait",
        
        // Estado: Inscrito
        isEnrolled && !isPending && "bg-blue-50 border-blue-500 hover:bg-blue-100",
        
        // Estado: Lleno (y no inscrito)
        isFull && !isEnrolled && !isPending && "bg-slate-100 border-transparent cursor-not-allowed opacity-60",
        
        // Estado: Disponible
        !isEnrolled && !isFull && !isPending && "bg-white border-slate-200 hover:border-blue-300 hover:shadow-md"
      )}
    >
      {isPending ? (
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      ) : isEnrolled ? (
        <>
          <Check className="h-5 w-5 text-blue-600 mb-0.5" />
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
            Inscrito
          </span>
          {/* Tooltip on hover to unenroll */}
          <div className="absolute inset-0 bg-red-500 flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
            Quitar
          </div>
        </>
      ) : isFull ? (
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Lleno
        </span>
      ) : (
        <div className="flex flex-col items-center">
          <span className="text-sm font-bold text-slate-700">
            {initialCapacity - registered}
          </span>
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
            Disp.
          </span>
        </div>
      )}
    </button>
  );
}
