import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { getActiveEventDays, formatDateShort } from '@/lib/dates';
import { createClient } from '@/lib/supabase/client';
import { useCoordinatorData } from '@/lib/coordinator-data-context';

export interface ReassignShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  volunteer: {
    id: string;
    name: string;
    committee?: string;
  } | null;
  sourceDayKey?: string;
  sourceShiftId?: string;
  onSuccess?: (message: string, undoAction?: () => Promise<void>) => void;
  onError?: (error: string) => void;
  mode?: 'coordinator' | 'volunteer';
}

export const ReassignShiftModal: React.FC<ReassignShiftModalProps> = ({
  isOpen,
  onClose,
  volunteer,
  sourceDayKey = '',
  sourceShiftId = '',
  onSuccess,
  onError,
  mode = 'coordinator',
}) => {
  const eventDays = useMemo(() => {
    const raw = getActiveEventDays();
    return raw.map(date => ({
      date,
      key: formatDateShort(date),
      label: formatDateShort(date),
      dateNum: date.getDate(),
    }));
  }, []);

  const [targetDayKey, setTargetDayKey] = useState<string>(sourceDayKey || eventDays[0]?.key || '');
  const [targetShiftId, setTargetShiftId] = useState<string>(sourceShiftId || 'T1');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    indexedAssignments,
    requirementsByCommittee,
    shiftsData = [],
    globalShifts = {},
    checkedOutMap = {},
    refresh,
  } = useCoordinatorData();

  // Reset values when modal opens with new source parameters
  React.useEffect(() => {
    if (isOpen) {
      setTargetDayKey(sourceDayKey || eventDays[0]?.key || '');
      setTargetShiftId(sourceShiftId || 'T1');
    }
  }, [isOpen, sourceDayKey, sourceShiftId, eventDays]);

  // Regla 1: Comprobar si el turno ORIGEN ya fue completado
  const isSourceCompleted = useMemo(() => {
    if (!volunteer || !sourceDayKey || !sourceShiftId) return false;
    const match = shiftsData.find(
      (s: any) => s.volunteer_id === volunteer.id && s.day_key === sourceDayKey && s.shift_key === sourceShiftId
    );
    if (match && (match.checked_out || match.checked_out_at)) return true;
    if (checkedOutMap[`${volunteer.id}-${sourceDayKey}-${sourceShiftId}`]) return true;

    if (typeof window !== 'undefined') {
      try {
        const localMap = JSON.parse(localStorage.getItem('completed_shifts_map') || '{}');
        if (localMap[`${volunteer.id}-${sourceDayKey}-${sourceShiftId}`]) return true;
      } catch (e) {}
    }
    return false;
  }, [volunteer, sourceDayKey, sourceShiftId, shiftsData, checkedOutMap]);

  // Regla 1b: Comprobar si el turno ORIGEN ya fue iniciado (Check-in activo)
  const isSourceStarted = useMemo(() => {
    if (!volunteer || !sourceDayKey || !sourceShiftId) return false;
    const match = shiftsData.find(
      (s: any) => s.volunteer_id === volunteer.id && s.day_key === sourceDayKey && s.shift_key === sourceShiftId
    );
    if (match && (match.checked_in || match.checked_in_at) && !match.checked_out) return true;
    return false;
  }, [volunteer, sourceDayKey, sourceShiftId, shiftsData]);

  // Regla 2 & 3: Obtener el estado del turno DESTINO para el voluntario
  const getTargetShiftStatus = (dayKey: string, shiftId: string) => {
    if (!volunteer || !dayKey || !shiftId) return { isAssigned: false, isCompleted: false, isSource: false };

    const isSource = sourceDayKey === dayKey && sourceShiftId === shiftId;

    const match = shiftsData.find(
      (s: any) => s.volunteer_id === volunteer.id && s.day_key === dayKey && s.shift_key === shiftId
    );

    const isCompletedDb = !!(match && (match.checked_out || match.checked_out_at));
    const isCheckedOutMap = !!checkedOutMap[`${volunteer.id}-${dayKey}-${shiftId}`];
    let isCompletedLocal = false;
    if (typeof window !== 'undefined') {
      try {
        const localMap = JSON.parse(localStorage.getItem('completed_shifts_map') || '{}');
        isCompletedLocal = !!localMap[`${volunteer.id}-${dayKey}-${shiftId}`];
      } catch (e) {}
    }

    const isCompleted = isCompletedDb || isCheckedOutMap || isCompletedLocal;
    const isAssigned = !!match || !!(globalShifts[volunteer.id]?.[dayKey]?.includes(shiftId));

    return { isAssigned, isCompleted, isSource };
  };

  const targetStatus = useMemo(() => {
    return getTargetShiftStatus(targetDayKey, targetShiftId);
  }, [targetDayKey, targetShiftId, volunteer, shiftsData, globalShifts, checkedOutMap, sourceDayKey, sourceShiftId]);

  const isSameCurrentShift = sourceDayKey === targetDayKey && sourceShiftId === targetShiftId;

  // Validar capacidad disponible por comité para el turno destino
  const capacityInfo = useMemo(() => {
    if (!targetDayKey || !targetShiftId || !volunteer) return { isFull: false, currentCount: 0, maxReq: 0, committeeName: '' };
    const commName = volunteer.committee || 'Sin comité';
    const maxReq = requirementsByCommittee[commName]?.[targetShiftId] ?? 0;

    const dayAssignments = indexedAssignments[targetDayKey]?.[targetShiftId] || {};
    const currentCommIds = dayAssignments[commName] || [];
    const count = currentCommIds.length;

    const isAlreadyInShift = currentCommIds.includes(volunteer.id);
    const projected = isAlreadyInShift ? count : count + 1;
    const isFull = maxReq > 0 && projected > maxReq;

    return {
      isFull,
      currentCount: count,
      maxReq,
      committeeName: commName,
    };
  }, [targetDayKey, targetShiftId, volunteer, requirementsByCommittee, indexedAssignments]);

  const checkShiftCapacity = (dayKey: string, shiftId: string) => {
    if (!volunteer) return { isFull: false, currentCount: 0, maxReq: 0, committeeName: '' };
    const commName = volunteer.committee || 'Sin comité';
    const maxReq = requirementsByCommittee[commName]?.[shiftId] ?? 0;
    const currentCommIds = indexedAssignments[dayKey]?.[shiftId]?.[commName] || [];
    const count = currentCommIds.length;
    const isAlready = currentCommIds.includes(volunteer.id);
    const projected = isAlready ? count : count + 1;
    return {
      isFull: maxReq > 0 && projected > maxReq,
      currentCount: count,
      maxReq,
      committeeName: commName,
    };
  };

  if (!isOpen || !volunteer) return null;

  const isTargetBlocked = targetStatus.isCompleted || (targetStatus.isAssigned && !targetStatus.isSource);
  const isActionDisabled = isSubmitting || !targetDayKey || !targetShiftId || isSameCurrentShift || isSourceCompleted || isSourceStarted || isTargetBlocked;

  const handleConfirmReassign = async () => {
    if (!targetDayKey || !targetShiftId) {
      if (onError) onError('Selecciona una fecha y un turno válidos.');
      return;
    }

    if (isSourceCompleted) {
      if (onError) onError('No se puede reasignar un turno que ya ha sido completado y finalizado.');
      return;
    }

    if (isSourceStarted) {
      if (onError) onError('Este turno se encuentra activo en curso. Primero debes registrar la salida antes de reasignar a otra fecha.');
      return;
    }

    if (isSameCurrentShift) {
      if (onError) onError('El voluntario ya se encuentra asignado a este mismo turno.');
      return;
    }

    if (targetStatus.isCompleted) {
      if (onError) onError('El voluntario ya tiene un turno completado en esta fecha y horario.');
      return;
    }

    if (targetStatus.isAssigned && !targetStatus.isSource) {
      if (onError) onError('El voluntario ya tiene un turno asignado en esta fecha y horario.');
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      if (mode === 'coordinator') {
        if (sourceDayKey && sourceShiftId) {
          await supabase
            .from('shifts')
            .delete()
            .eq('volunteer_id', volunteer.id)
            .eq('day_key', sourceDayKey)
            .eq('shift_key', sourceShiftId);
        }

        const { error } = await supabase
          .from('shifts')
          .upsert(
            {
              volunteer_id: volunteer.id,
              day_key: targetDayKey,
              shift_key: targetShiftId,
            },
            { onConflict: 'volunteer_id,day_key,shift_key', ignoreDuplicates: true }
          );

        if (error) {
          if (onError) onError(`Error al reasignar: ${error.message}`);
        } else {
          await refresh(true);

          const undoAction = async () => {
            const client = createClient();
            if (targetDayKey && targetShiftId) {
              await client
                .from('shifts')
                .delete()
                .eq('volunteer_id', volunteer.id)
                .eq('day_key', targetDayKey)
                .eq('shift_key', targetShiftId);
            }
            if (sourceDayKey && sourceShiftId) {
              await client
                .from('shifts')
                .upsert({
                  volunteer_id: volunteer.id,
                  day_key: sourceDayKey,
                  shift_key: sourceShiftId,
                });
            }
            await refresh(true);
          };

          const successMsg = `Turno de ${volunteer.name} reasignado a ${targetShiftId} el ${targetDayKey}.`;
          if (onSuccess) onSuccess(successMsg, undoAction);
          onClose();
        }
      } else {
        const { error } = await supabase
          .from('shift_requests')
          .insert({
            volunteer_id: volunteer.id,
            requested_day_key: targetDayKey,
            requested_shift_key: targetShiftId,
            status: 'pending',
            created_at: new Date().toISOString(),
          });

        if (error) {
          if (onError) onError(`Error al solicitar cambio: ${error.message}`);
        } else {
          if (onSuccess) onSuccess('Solicitud de reagendamiento enviada correctamente.');
          onClose();
        }
      }
    } catch (err: any) {
      if (onError) onError(err?.message || 'Error inesperado al procesar reasignación');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] flex flex-col justify-end pointer-events-auto">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 opacity-100"
        onClick={onClose}
      />

      {/* Sheet Content */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 350, damping: 32 }}
        className="relative w-full md:w-[420px] md:mx-auto bg-dark2 border border-white/10 rounded-t-[40px] shadow-2xl flex flex-col overflow-hidden text-text"
      >
        <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mt-4 mb-2 shrink-0 touch-none" />

        <div className="p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-text mb-1">
              {mode === 'coordinator' ? 'Reasignar Turno' : 'Solicitar Reagendamiento'}
            </h3>
            <p className="text-sm font-inter font-bold text-text-dim">Moviendo a {volunteer.name}</p>
            {volunteer.committee && (
              <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-inter font-bold bg-[#4d7cfe]/20 text-[#8bb0ff] border border-[#4d7cfe]/30">
                {volunteer.committee}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {/* Advertencia Bloqueante si el turno ORIGEN ya está completado */}
            {isSourceCompleted && (
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-inter font-bold flex items-start gap-3 animate-in fade-in zoom-in-95">
                <span className="material-symbols-outlined text-[22px] text-rose-400 shrink-0">block</span>
                <div>
                  <p className="text-rose-200 font-extrabold text-xs mb-1">Turno Origen Completado</p>
                  <p className="text-[11px] text-rose-300/90 font-medium leading-relaxed">
                    Este turno ya fue completado y finalizado por el voluntario. No es posible reasignar turnos en estado completado.
                  </p>
                </div>
              </div>
            )}

            {/* Fecha Destino */}
            <div>
              <label className="text-[10px] font-bold text-text-dim tracking-widest uppercase mb-3 block">
                FECHA DESTINO
              </label>
              <div className="grid grid-cols-4 gap-2">
                {eventDays.map((d, index) => {
                  const isSelected = targetDayKey === d.key;
                  const dayAbbr = d.label.substring(0, 3);
                  const bgColors = [
                    'bg-[#10a562]', 'bg-[#4aa9df]', 'bg-[#f1c130]', 'bg-[#d54134]',
                    'bg-[#981e32]', 'bg-[#2c44c2]', 'bg-[#f1c130]', 'bg-[#ed1b24]'
                  ];
                  const cardBg = bgColors[index % bgColors.length];

                  return (
                    <button
                      key={d.key}
                      type="button"
                      disabled={isSourceCompleted}
                      onClick={() => setTargetDayKey(d.key)}
                      className={`relative overflow-hidden flex flex-col items-center justify-center p-2 rounded-lg border transition-all bg-dark3 cursor-pointer ${
                        isSourceCompleted
                          ? 'opacity-40 cursor-not-allowed border-border'
                          : isSelected
                          ? 'border-text text-text shadow-sm scale-105 z-10'
                          : 'border-border text-text-dim opacity-70 hover:opacity-100'
                      }`}
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${cardBg} opacity-90`} />
                      <span className={`font-inter font-bold text-[9px] uppercase tracking-widest ${isSelected ? 'text-text' : 'text-text-dim'}`}>
                        {dayAbbr}
                      </span>
                      <span className="text-sm font-black leading-none mt-0.5 drop-shadow-sm">{d.dateNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Turno Destino */}
            <div className="pt-2">
              <label className="text-[10px] font-bold text-text-dim tracking-widest uppercase mb-3 block">
                TURNO DESTINO (SLOTS / OCUPACIÓN)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {['T1', 'T2', 'T3', 'T4'].map((t) => {
                  const isSelected = targetShiftId === t;
                  const stStatus = getTargetShiftStatus(targetDayKey, t);
                  const capInfo = targetDayKey ? checkShiftCapacity(targetDayKey, t) : null;
                  const count = capInfo?.currentCount ?? 0;
                  const maxReq = capInfo?.maxReq ?? 0;
                  const isFull = capInfo?.isFull;

                  const isBtnDisabled = isSourceCompleted || stStatus.isCompleted || (stStatus.isAssigned && !stStatus.isSource);

                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={isBtnDisabled}
                      onClick={() => setTargetShiftId(t)}
                      className={`flex flex-col items-center justify-center py-2.5 rounded-lg border text-sm font-bold transition-all relative ${
                        isBtnDisabled
                          ? 'bg-dark2 border-border text-text-dim/40 opacity-50 cursor-not-allowed'
                          : stStatus.isSource
                          ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 font-bold ring-2 ring-purple-500/30 cursor-pointer'
                          : isFull
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25 cursor-pointer'
                          : isSelected
                          ? 'bg-[#4d7cfe] border-[#4d7cfe] text-white shadow-sm scale-105 z-10 cursor-pointer'
                          : 'bg-dark3 border-border text-text hover:bg-dark3/80 hover:text-text cursor-pointer'
                      }`}
                    >
                      <span>{t}</span>
                      {stStatus.isSource ? (
                        <span className="text-[8px] font-extrabold text-purple-300 leading-none mt-1 uppercase tracking-wider">
                          Origen
                        </span>
                      ) : stStatus.isCompleted ? (
                        <span className="text-[8px] font-extrabold text-emerald-400 leading-none mt-1 uppercase tracking-wider">
                          Completado
                        </span>
                      ) : stStatus.isAssigned ? (
                        <span className="text-[8px] font-extrabold text-amber-400 leading-none mt-1 uppercase tracking-wider">
                          Asignado
                        </span>
                      ) : isFull ? (
                        <span className="text-[8px] font-extrabold text-amber-400 leading-none mt-1 uppercase tracking-wider">
                          Lleno ({count}/{maxReq})
                        </span>
                      ) : (
                        <span className={`text-[9px] font-bold leading-none mt-1 ${isSelected ? 'text-white/90' : 'text-text-dim'}`}>
                          {maxReq > 0 ? `${count} / ${maxReq}` : `${count} asig.`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Advertencia si el turno origen está iniciado (Check-in activo) */}
            {isSourceStarted && (
              <div className="mt-4 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">warning</span>
                <div>
                  <p className="text-amber-200 font-extrabold text-xs mb-0.5">Turno en Curso (Check-in Activo)</p>
                  <p className="text-[11px] text-amber-300/90 font-medium leading-relaxed">
                    Este turno ya fue iniciado por el voluntario y se encuentra activo. Para asignar un nuevo turno en otra fecha, primero debes registrar la salida (Check-out) de este turno.
                  </p>
                </div>
              </div>
            )}

            {/* Advertencia si es el mismo turno actual */}
            {!isSourceCompleted && !isSourceStarted && isSameCurrentShift && (
              <div className="mt-4 p-3.5 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-inter font-bold flex items-center gap-2.5 animate-in fade-in zoom-in-95">
                <span className="material-symbols-outlined text-[20px] text-purple-400 shrink-0">info</span>
                <span>Este es el turno actual origen del voluntario. Selecciona otro horario o día para reasignar.</span>
              </div>
            )}

            {/* Advertencia si el turno destino está bloqueado porque el voluntario ya tiene un turno completado o asignado ahí */}
            {!isSourceCompleted && !isSameCurrentShift && targetStatus.isCompleted && (
              <div className="mt-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                <span className="material-symbols-outlined text-[20px] text-rose-400 shrink-0">block</span>
                <div>
                  <p className="text-rose-200 font-extrabold text-xs mb-0.5">Turno Ya Completado</p>
                  <p className="text-[11px] text-rose-300/90 font-medium leading-relaxed">
                    El voluntario ya completó este turno previamente. No es posible reasignar a un turno ya completado.
                  </p>
                </div>
              </div>
            )}

            {!isSourceCompleted && !isSameCurrentShift && !targetStatus.isCompleted && targetStatus.isAssigned && (
              <div className="mt-4 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">warning</span>
                <div>
                  <p className="text-amber-200 font-extrabold text-xs mb-0.5">Turno Ya Asignado</p>
                  <p className="text-[11px] text-amber-300/90 font-medium leading-relaxed">
                    El voluntario ya cuenta con este turno activo asignado. Elige un horario o día distinto.
                  </p>
                </div>
              </div>
            )}

            {/* Advertencia si el turno está lleno (PERMITE CONTINUAR) */}
            {!isSourceCompleted && !isSameCurrentShift && !isTargetBlocked && capacityInfo.isFull && (
              <div className="mt-4 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-inter font-bold flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">warning</span>
                <div>
                  <p className="text-amber-200 font-extrabold text-xs mb-0.5">Capacidad Máxima Alcanzada</p>
                  <p className="text-[11px] text-amber-300/90 font-medium leading-relaxed">
                    El turno <strong className="text-white">{targetShiftId}</strong> del <strong className="text-white">{targetDayKey}</strong> ya alcanzó la meta requerida para <strong className="text-white">{capacityInfo.committeeName}</strong> ({capacityInfo.currentCount}/{capacityInfo.maxReq}). Puedes confirmar para sobreasignar si es necesario.
                  </p>
                </div>
              </div>
            )}

            {/* Botones de Acción */}
            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 btn-cancel py-3.5 rounded-full border border-red/30 text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Cancelar</span>
              </button>
              <button
                type="button"
                disabled={isActionDisabled}
                onClick={handleConfirmReassign}
                className="flex-1 btn-action py-3.5 rounded-full text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none disabled:transform-none"
              >
                <span>{isSubmitting ? 'Procesando...' : mode === 'coordinator' ? 'Confirmar Reasignación' : 'Enviar Solicitud'}</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
