'use client';

import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type {
  AreaEventDay,
  AreaManagementItem,
  AreaVolunteer,
} from '@/lib/services/committee-area-query.service';

type ShiftKey = 'T1' | 'T2' | 'T3' | 'T4';

const scopeButtonClassName =
  'inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-xs font-bold transition-all active:scale-[0.97] cursor-pointer sm:min-h-0 sm:h-8 sm:text-[11px]';

export interface VolunteerShiftAssignmentItem {
  id: string;
  dayKey: string;
  shiftKey: ShiftKey;
  areaId: string | null;
}

interface AssignScopeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  volunteer: AreaVolunteer | null;
  initialTargetAreaId?: string | null;
  activeAreas: AreaManagementItem[];
  eventDays: AreaEventDay[];
  volunteerShifts: VolunteerShiftAssignmentItem[];
  areasById: Map<string, AreaManagementItem>;
  busy: boolean;
  onConfirmAssign: (shiftIds: string[], areaId: string | null) => Promise<boolean>;
  initialSelectedShiftIds: string[];
  activeDayKey?: string;
  activeShiftKey?: ShiftKey;
}

export function AssignScopeDrawer({
  isOpen,
  onClose,
  volunteer,
  initialTargetAreaId = null,
  activeAreas,
  eventDays,
  volunteerShifts,
  areasById,
  busy,
  onConfirmAssign,
  initialSelectedShiftIds,
  activeDayKey,
  activeShiftKey,
}: AssignScopeDrawerProps) {
  const [selectedAreaId, setSelectedAreaId] = useState<string>(initialTargetAreaId || '__none__');
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(
    new Set(initialSelectedShiftIds)
  );
  const [replacementConfirmed, setReplacementConfirmed] = useState(false);

  // Group volunteer shifts by day
  const shiftsByDay = useMemo(() => {
    const dayMap = new Map<string, { day: AreaEventDay; shifts: VolunteerShiftAssignmentItem[] }>();
    for (const eventDay of eventDays) {
      const dayShifts = volunteerShifts.filter((s) => s.dayKey === eventDay.key);
      if (dayShifts.length > 0) {
        dayMap.set(eventDay.key, { day: eventDay, shifts: dayShifts });
      }
    }
    return Array.from(dayMap.values());
  }, [eventDays, volunteerShifts]);

  const targetArea = selectedAreaId === '__none__' ? null : areasById.get(selectedAreaId);

  // Analysis of selected shifts
  const targetAreaIdNormalized = selectedAreaId === '__none__' ? null : selectedAreaId;
  const selectedCount = selectedShiftIds.size;
  const allShiftsSelected = volunteerShifts.length > 0 && selectedCount === volunteerShifts.length;
  const activeShift = activeDayKey && activeShiftKey
    ? volunteerShifts.find((shift) => shift.dayKey === activeDayKey && shift.shiftKey === activeShiftKey)
    : undefined;
  const activeDayShifts = activeDayKey
    ? volunteerShifts.filter((shift) => shift.dayKey === activeDayKey)
    : [];
  const onlyActiveShiftSelected = Boolean(
    activeShift && selectedCount === 1 && selectedShiftIds.has(activeShift.id)
  );
  const onlyActiveDaySelected = activeDayShifts.length > 0
    && selectedCount === activeDayShifts.length
    && activeDayShifts.every((shift) => selectedShiftIds.has(shift.id));

  const { newAssignmentsCount, replacementsCount, noChangesCount } = useMemo(() => {
    let newCount = 0;
    let replCount = 0;
    let noChangeCount = 0;

    for (const shift of volunteerShifts) {
      if (!selectedShiftIds.has(shift.id)) continue;
      if (shift.areaId === targetAreaIdNormalized) {
        noChangeCount++;
      } else if (!shift.areaId) {
        newCount++;
      } else {
        replCount++;
      }
    }

    return {
      newAssignmentsCount: newCount,
      replacementsCount: replCount,
      noChangesCount: noChangeCount,
    };
  }, [volunteerShifts, selectedShiftIds, targetAreaIdNormalized]);

  function toggleShift(id: string) {
    setReplacementConfirmed(false);
    setSelectedShiftIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setReplacementConfirmed(false);
    setSelectedShiftIds(new Set(volunteerShifts.map((s) => s.id)));
  }

  function selectNone() {
    setReplacementConfirmed(false);
    setSelectedShiftIds(new Set());
  }

  function selectOnlyActiveShift() {
    if (!activeDayKey || !activeShiftKey) return;
    const match = volunteerShifts.find((s) => s.dayKey === activeDayKey && s.shiftKey === activeShiftKey);
    if (match) {
      setReplacementConfirmed(false);
      setSelectedShiftIds(new Set([match.id]));
    }
  }

  function selectOnlyActiveDay() {
    if (!activeDayKey) return;
    const dayMatches = volunteerShifts.filter((s) => s.dayKey === activeDayKey).map((s) => s.id);
    if (dayMatches.length > 0) {
      setReplacementConfirmed(false);
      setSelectedShiftIds(new Set(dayMatches));
    }
  }

  async function handleApply() {
    const ids = Array.from(selectedShiftIds);
    if (ids.length === 0) return;
    if (replacementsCount > 0 && !replacementConfirmed) {
      setReplacementConfirmed(true);
      return;
    }
    const success = await onConfirmAssign(ids, targetAreaIdNormalized);
    if (success) {
      onClose();
    }
  }

  if (!volunteer) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="z-[100] flex h-full w-full flex-col border-l border-border bg-dark2 p-0 text-text sm:max-w-lg md:max-w-xl max-sm:inset-x-0 max-sm:inset-y-auto max-sm:bottom-0 max-sm:right-auto max-sm:h-[min(90dvh,760px)] max-sm:max-w-none max-sm:rounded-t-[40px] max-sm:border-0 max-sm:pb-[env(safe-area-inset-bottom)] max-sm:data-starting-style:translate-x-0 max-sm:data-ending-style:translate-x-0 max-sm:data-starting-style:translate-y-10 max-sm:data-ending-style:translate-y-10"
      >
        <div className="mx-auto mb-2 mt-4 h-1.5 w-12 shrink-0 rounded-full bg-white/30 sm:hidden" aria-hidden="true" />

        <div className="shrink-0 border-b border-border p-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[#4d7cfe]" aria-hidden="true">
                  tune
                </span>
                <SheetTitle className="text-base sm:text-lg font-black tracking-tight text-text">
                  Alcance de Asignación
                </SheetTitle>
              </div>
              <SheetDescription className="text-xs font-bold text-text-dim">
                {volunteer.name} {volunteer.age ? `· ${volunteer.age} años` : ''}
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Cerrar panel"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-dim hover:bg-dark3 hover:text-text transition-colors cursor-pointer sm:h-8 sm:w-8"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Area destination selector */}
          <div className="mt-4 space-y-1.5">
            <label htmlFor="drawer-target-area" className="block text-[11px] font-bold uppercase tracking-wider text-text-dim">
              Área a asignar
            </label>
            <Select
              value={selectedAreaId}
              onValueChange={(val) => {
                if (!val) return;
                setSelectedAreaId(val);
                setReplacementConfirmed(false);
              }}
            >
              <SelectTrigger
                id="drawer-target-area"
                className="h-11 w-full rounded-xl border-border bg-dark3 px-3.5 text-xs font-bold text-text sm:text-sm"
              >
                <SelectValue placeholder="Selecciona un área">
                  {selectedAreaId === '__none__' ? (
                    <span className="text-amber-400 font-bold">Sin área asignada</span>
                  ) : (
                    <span className="font-bold text-[#4d7cfe]">{targetArea?.name || 'Selecciona un área'}</span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-dark2 border-border text-text z-[110]">
                <SelectItem value="__none__" className="text-xs font-bold text-amber-400">
                  Sin área asignada (quitar área)
                </SelectItem>
                {activeAreas.map((area) => (
                  <SelectItem key={area.id} value={area.id} className="text-xs font-bold">
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quick scope action chips */}
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className={cn(
                scopeButtonClassName,
                allShiftsSelected
                  ? 'border-[#4d7cfe] bg-[#4d7cfe] text-white'
                  : 'border-border bg-dark3 text-text-dim hover:border-[#4d7cfe]/40 hover:text-text'
              )}
            >
              Todos ({volunteerShifts.length})
            </button>

            {activeDayKey && activeShiftKey && (
              <button
                type="button"
                onClick={selectOnlyActiveShift}
                className={cn(
                  scopeButtonClassName,
                  onlyActiveShiftSelected
                    ? 'border-[#4d7cfe] bg-[#4d7cfe] text-white'
                    : 'border-border bg-dark3 text-text-dim hover:border-[#4d7cfe]/40 hover:text-text'
                )}
              >
                Solo este turno ({activeShiftKey})
              </button>
            )}

            {activeDayKey && shiftsByDay.some((g) => g.day.key === activeDayKey && g.shifts.length > 1) && (
              <button
                type="button"
                onClick={selectOnlyActiveDay}
                className={cn(
                  scopeButtonClassName,
                  onlyActiveDaySelected
                    ? 'border-[#4d7cfe] bg-[#4d7cfe] text-white'
                    : 'border-border bg-dark3 text-text-dim hover:border-[#4d7cfe]/40 hover:text-text'
                )}
              >
                Este día ({shiftsByDay.find((g) => g.day.key === activeDayKey)?.shifts.length || 0})
              </button>
            )}

            {selectedCount > 0 && (
              <button
                type="button"
                onClick={selectNone}
                className={cn(
                  scopeButtonClassName,
                  'ml-auto border-transparent bg-transparent text-text-dim hover:border-border hover:bg-dark3 hover:text-text'
                )}
              >
                Desmarcar
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Body: compact shift schedule */}
        <div className="flex-1 overflow-y-auto">
          {volunteerShifts.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center text-center p-6">
              <span className="material-symbols-outlined text-[36px] text-text-dim">event_busy</span>
              <p className="mt-2 text-sm font-bold text-text">No hay turnos registrados para este voluntario</p>
            </div>
          ) : (
            <>
              {/* Desktop and tablet table */}
              <table className="hidden w-full table-fixed border-collapse text-left text-xs sm:table">
                <colgroup>
                  <col className="w-12" />
                  <col className="w-[34%]" />
                  <col className="w-[18%]" />
                  <col />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-dark3">
                  <tr className="border-b border-border text-[11px] font-bold text-text-dim">
                    <th scope="col" className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={allShiftsSelected}
                        ref={(element) => {
                          if (element) element.indeterminate = selectedCount > 0 && selectedCount < volunteerShifts.length;
                        }}
                        onChange={() => {
                          if (allShiftsSelected) selectNone();
                          else selectAll();
                        }}
                        aria-label={allShiftsSelected ? 'Desmarcar todos los turnos' : 'Seleccionar todos los turnos'}
                        className="h-4 w-4 rounded border-border accent-[#4d7cfe]"
                      />
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-text">Fecha</th>
                    <th scope="col" className="px-3 py-2.5 text-center text-text">Turno</th>
                    <th scope="col" className="px-4 py-2.5 text-text">Área actual</th>
                  </tr>
                </thead>
                {shiftsByDay.map(({ day, shifts }) => {
                  return (
                    <tbody key={day.key} className="border-b border-border/60 last:border-b-0">
                      {shifts.map((shift) => {
                        const isChecked = selectedShiftIds.has(shift.id);
                        const currentArea = shift.areaId ? areasById.get(shift.areaId) : null;
                        const isSameArea = shift.areaId === targetAreaIdNormalized;
                        const willReplace = isChecked && Boolean(shift.areaId) && !isSameArea;

                        return (
                          <tr
                            key={shift.id}
                            className={cn(
                              'border-b border-border/30 transition-colors last:border-b-0 hover:bg-dark3/50',
                              isChecked && 'bg-[#4d7cfe]/10 hover:bg-[#4d7cfe]/10'
                            )}
                          >
                            <td className="px-3 py-3.5 text-center align-middle">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleShift(shift.id)}
                                aria-label={`Seleccionar ${shift.shiftKey} del ${day.label} ${day.dateNum}`}
                                className="h-4 w-4 rounded border-border accent-[#4d7cfe]"
                              />
                            </td>
                            <th scope="row" className="px-4 py-3.5 align-middle font-bold capitalize text-text">
                              {day.label} {day.dateNum}
                            </th>
                            <td className="px-3 py-3.5 text-center align-middle font-black text-text">{shift.shiftKey}</td>
                            <td className="px-4 py-3.5 align-middle">
                              <div className="min-w-0">
                                {currentArea ? (
                                  <span className="inline-flex h-7 max-w-full items-center rounded-full border border-[#4d7cfe]/30 bg-[#4d7cfe]/10 px-2.5 text-[11px] font-bold text-[#4d7cfe]">
                                    <span className="truncate">{currentArea.name}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex h-7 items-center rounded-full border border-border bg-dark3 px-2.5 text-[11px] font-bold text-text-dim">Sin área</span>
                                )}
                                {willReplace && (
                                  <span className="mt-1 block text-[10px] font-bold text-amber-400">Cambiará a {targetArea?.name || 'Sin área'}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>

              {/* Phone list: flat rows without nested cards */}
              <div className="divide-y divide-border/60 sm:hidden">
                {shiftsByDay.map(({ day, shifts }) => {
                  return (
                    <section key={day.key} aria-label={`${day.label} ${day.dateNum}`}>
                      <div className="sticky top-0 z-10 flex min-h-11 items-center border-b border-border/40 bg-dark3 px-4 py-2">
                        <span className="text-xs font-black capitalize text-text">
                          {day.label} {day.dateNum}
                          <span className="ml-1.5 font-bold text-text-dim">· {shifts.length} turno{shifts.length === 1 ? '' : 's'}</span>
                        </span>
                      </div>
                      <div className="divide-y divide-border/30">
                        {shifts.map((shift) => {
                          const isChecked = selectedShiftIds.has(shift.id);
                          const currentArea = shift.areaId ? areasById.get(shift.areaId) : null;
                          const isSameArea = shift.areaId === targetAreaIdNormalized;
                          const willReplace = isChecked && Boolean(shift.areaId) && !isSameArea;
                          const timeLabel = day.shiftLabels[shift.shiftKey] || 'Horario no registrado';

                          return (
                            <label
                              key={shift.id}
                              className={cn(
                                'flex min-h-[72px] cursor-pointer items-start gap-3 px-4 py-3 transition-colors',
                                isChecked ? 'bg-[#4d7cfe]/10' : 'bg-white dark:bg-dark2'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleShift(shift.id)}
                                className="mt-1 h-5 w-5 shrink-0 rounded border-border accent-[#4d7cfe]"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-baseline justify-between gap-2">
                                  <strong className="text-sm font-black text-text">{shift.shiftKey}</strong>
                                  <span className="text-[11px] font-bold tabular-nums text-text-dim">{timeLabel}</span>
                                </span>
                                <span className="mt-1.5 block min-w-0">
                                  {currentArea ? (
                                    <span className="inline-flex h-7 max-w-full items-center rounded-full border border-[#4d7cfe]/30 bg-[#4d7cfe]/10 px-2.5 text-[11px] font-bold text-[#4d7cfe]">
                                      <span className="truncate">{currentArea.name}</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex h-7 items-center rounded-full border border-border bg-dark3 px-2.5 text-[11px] font-bold text-text-dim">Sin área</span>
                                  )}
                                  {willReplace && (
                                    <em className="mt-1 block text-[10px] not-italic font-bold text-amber-400">Cambiará a {targetArea?.name || 'Sin área'}</em>
                                  )}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer: Summary & Action Buttons */}
        <div className="shrink-0 space-y-3 border-t border-border bg-dark2 p-4 sm:px-6 sm:py-5">
          {/* Summary Alert */}
          <div className="text-xs font-bold space-y-1">
            {selectedCount === 0 ? (
              <p className="text-amber-400">⚠️ Selecciona al menos un turno para aplicar la asignación.</p>
            ) : replacementConfirmed && replacementsCount > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-300" role="alert">
                Confirma que deseas reemplazar el área actual en {replacementsCount} turno{replacementsCount === 1 ? '' : 's'}.
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 text-text">
                <span>Se asignará</span>
                <strong className="text-[#4d7cfe]">
                  {targetArea ? `“${targetArea.name}”` : '“Sin área”'}
                </strong>
                <span>a</span>
                <strong className="tabular-nums">{selectedCount} turno{selectedCount === 1 ? '' : 's'}</strong>
                {newAssignmentsCount > 0 && (
                  <span className="text-text-dim">
                    ({newAssignmentsCount} nueva{newAssignmentsCount === 1 ? '' : 's'})
                  </span>
                )}
                {replacementsCount > 0 && (
                  <span className="text-amber-400 font-extrabold">
                    ({replacementsCount} reemplazo{replacementsCount === 1 ? '' : 's'})
                  </span>
                )}
                {noChangesCount > 0 && noChangesCount === selectedCount && (
                  <span className="text-text-dim font-normal">
                    (sin cambios pendientes)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
              className="h-11 flex-1 rounded-full border-border bg-dark3 text-xs font-bold text-text hover:bg-dark active:scale-[0.97]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy || selectedCount === 0}
              onClick={handleApply}
              className="btn-action h-11 flex-[2] rounded-full px-5 text-xs font-bold text-white sm:text-sm"
            >
              {busy ? (
                'Guardando…'
              ) : (
                replacementsCount > 0 && !replacementConfirmed
                  ? `Revisar ${replacementsCount} reemplazo${replacementsCount === 1 ? '' : 's'}`
                  : replacementConfirmed && replacementsCount > 0
                    ? `Confirmar y guardar en ${selectedCount}`
                    : `Guardar en ${selectedCount} turno${selectedCount === 1 ? '' : 's'}`
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
