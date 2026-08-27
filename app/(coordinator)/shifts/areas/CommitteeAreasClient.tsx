'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  archiveCommitteeAreaAction,
  assignVolunteerAreasAction,
  createCommitteeAreaAction,
  restoreCommitteeAreaAction,
  saveAreaRequirementsAction,
  restoreVolunteerAreasAction,
  updateCommitteeAreaAction,
} from '@/app/actions/committee-area-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toast } from '@/components/ui/toast';
import { SmartSearchBar } from '@/components/SmartSearchBar';
import { EventDayCards, EventShiftCard } from '@/components/EventDayCards';
import { VolunteerProfileDrawer } from '@/components/VolunteerProfileDrawer';
import { AssignScopeDrawer, type VolunteerShiftAssignmentItem } from '@/components/AssignScopeDrawer';
import type {
  AreaManagementData,
  AreaManagementItem,
  AreaVolunteer,
} from '@/lib/services/committee-area-query.service';
import { cn } from '@/lib/utils';

type ShiftKey = 'T1' | 'T2' | 'T3' | 'T4';
type RequirementMap = Record<string, number>;
export type AreaView = 'areas' | 'assignments' | 'coverage';
const ALL_SHIFTS: ShiftKey[] = ['T1', 'T2', 'T3', 'T4'];
const MAX_SHIFT_AREA_ASSIGNMENTS = 250;
type ToastState = {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  actionLabel?: string;
  onAction?: () => void;
};

function requirementKey(dayKey: string, shiftKey: ShiftKey) {
  return `${dayKey}:${shiftKey}`;
}

function buildRequirementMap(data: AreaManagementData, areaId: string | null): RequirementMap {
  const values: RequirementMap = {};
  for (const day of data.eventDays) {
    for (const shiftKey of day.shiftKeys) values[requirementKey(day.key, shiftKey)] = 0;
  }
  if (!areaId) return values;
  for (const item of data.requirements) {
    if (item.areaId === areaId) values[requirementKey(item.dayKey, item.shiftKey)] = item.requiredCount;
  }
  return values;
}

function AreaForm({
  title,
  submitLabel,
  initialName = '',
  initialDescription = '',
  pending,
  onCancel,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initialName?: string;
  initialDescription?: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);

  return (
    <form
      className="space-y-4 border-b border-border bg-dark3/55 p-4 pb-24 lg:pb-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(name, description);
      }}
    >
      <div>
        <h2 className="text-base font-bold text-text">{title}</h2>
        <p className="mt-1 text-sm text-text-dim">El nombre será visible para coordinadores y voluntarios.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor={`${title}-name`} className="text-sm font-bold text-text">Nombre del área</label>
        <Input
          id={`${title}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          minLength={2}
          maxLength={80}
          required
          autoFocus
          placeholder="Ej. Parqueo Norte"
          className="h-11 bg-dark2 text-base"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`${title}-description`} className="text-sm font-bold text-text">Descripción <span className="font-normal text-text-dim">(opcional)</span></label>
        <textarea
          id={`${title}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={240}
          rows={3}
          placeholder="Referencia breve para identificar el lugar"
          className="input-base w-full resize-none bg-dark2 text-base text-text placeholder:text-text-dim"
        />
        <p className="text-right text-xs tabular-nums text-text-dim">{description.length}/240</p>
      </div>
      <div className="flex gap-2 pr-14 lg:pr-0">
        <Button type="submit" disabled={pending || name.trim().length < 2} className="btn-action h-11 flex-1 rounded-full text-white">
          {pending ? 'Guardando…' : submitLabel}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel} className="h-11 rounded-full">
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function AreaRequirementInputCell({
  value,
  disabled,
  onChange,
  ariaLabel,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value === 0 ? '0' : String(value)}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={(e) => e.target.select()}
      onChange={(event) => {
        const raw = event.target.value.replace(/[^0-9]/g, '');
        const next = Number.parseInt(raw || '0', 10);
        onChange(Math.min(999, Math.max(0, Number.isFinite(next) ? next : 0)));
      }}
      className={cn(
        'w-full h-11 sm:h-12 rounded-none border-0 text-center font-inter text-xs sm:text-sm font-bold tabular-nums transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#4d7cfe] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-40 select-all cursor-text p-0',
        value > 0
          ? 'bg-[#4d7cfe]/15 text-[#4d7cfe] font-extrabold focus:bg-[#4d7cfe]/25'
          : 'bg-dark/40 text-text-dim/60 hover:bg-dark3/50 focus:bg-dark focus:text-text'
      )}
    />
  );
}

function AreaRequirementsEditor({
  data,
  requirements,
  busy,
  onChange,
}: {
  data: AreaManagementData;
  requirements: RequirementMap;
  busy: boolean;
  onChange: (dayKey: string, shiftKey: ShiftKey, value: number) => void;
}) {
  const [quickFill, setQuickFill] = useState<Record<ShiftKey, number>>({ T1: 0, T2: 0, T3: 0, T4: 0 });

  const totalRequirements = data.eventDays.reduce(
    (acc, d) => acc + (d.shiftKeys || []).reduce((sub, sk) => sub + (requirements[requirementKey(d.key, sk)] || 0), 0),
    0
  );

  function handleApplyQuickFill() {
    data.eventDays.forEach((day) => {
      day.shiftKeys.forEach((shiftKey) => {
        const val = quickFill[shiftKey] || 0;
        onChange(day.key, shiftKey, val);
      });
    });
  }

  return (
    <div className="overflow-x-auto w-full">
      {/* Seamless Flat Grid Matrix (Exact match to Dashboard Heatmap layout) */}
      <table className="w-full table-fixed border-collapse text-left text-xs">
        <thead>
          {/* Main Column Headers */}
          <tr className="border-b border-border bg-dark3 text-[10px] sm:text-[11px] font-bold text-text-dim">
            <th scope="col" className="w-16 sm:w-20 md:w-24 px-1.5 sm:px-3 py-2.5 sm:py-3 border-r border-border font-bold text-text-dim text-center sm:text-left">Fecha</th>
            {ALL_SHIFTS.map((sk) => (
              <th key={sk} scope="col" className="py-2.5 sm:py-3 text-center border-r border-border font-bold text-text">
                {sk}
              </th>
            ))}
            <th scope="col" className="w-16 sm:w-20 md:w-24 py-2.5 sm:py-3 text-center font-bold text-text">Total</th>
          </tr>

          {/* Quick Fill Banner Header Row */}
          <tr className="border-b border-[#4d7cfe]/30 bg-[#4d7cfe]/10 dark:bg-[#4d7cfe]/15">
            <td colSpan={6} className="px-3 sm:px-4 py-2">
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-black text-[#4d7cfe] truncate">
                <span className="material-symbols-outlined text-[14px] shrink-0">bolt</span>
                <span className="truncate">Relleno rápido (plantilla para todas las fechas)</span>
              </div>
            </td>
          </tr>

          {/* Quick Fill Inputs Row */}
          <tr className="border-b-2 border-[#4d7cfe]/40 bg-[#4d7cfe]/5">
            <td className="px-1 sm:px-2 py-2 text-center border-r border-border bg-dark3/60 truncate">
              <span className="text-[10px] sm:text-xs font-bold text-text-dim">Todas</span>
            </td>
            {ALL_SHIFTS.map((sk) => (
              <td key={sk} className="border-r border-border p-0 text-center">
                <AreaRequirementInputCell
                  value={quickFill[sk]}
                  disabled={busy}
                  onChange={(val) => setQuickFill((prev) => ({ ...prev, [sk]: val }))}
                  ariaLabel={`Relleno rápido para ${sk}`}
                />
              </td>
            ))}
            <td className="p-1 text-center bg-dark3/30">
              <button
                type="button"
                onClick={handleApplyQuickFill}
                disabled={busy}
                className="w-full h-9 sm:h-10 rounded-md font-inter font-bold text-xs bg-[#4d7cfe] hover:bg-[#3b6ae0] text-white flex items-center justify-center gap-1 shadow-xs active:scale-95 cursor-pointer disabled:opacity-50 transition-all p-0"
                title="Aplicar valores de relleno rápido a todas las fechas"
              >
                <span className="material-symbols-outlined text-[14px] sm:text-[16px]">done_all</span>
                <span className="text-[10px] sm:text-[11px] font-extrabold hidden md:inline">Aplicar</span>
              </button>
            </td>
          </tr>
        </thead>
        <tbody className="divide-y divide-border font-inter">
          {data.eventDays.map((day) => {
            const currentDayTotal = day.shiftKeys.reduce(
              (sum, sk) => sum + (requirements[requirementKey(day.key, sk)] || 0),
              0
            );

            return (
              <tr key={day.key} className="hover:brightness-110 transition-all">
                <td className="px-1.5 sm:px-3 py-2 sm:py-2.5 font-bold text-text truncate border-r border-border bg-dark3/40 text-center sm:text-left">
                  <span className="capitalize text-[11px] sm:text-xs">{day.label}</span> <span className="text-[11px] sm:text-xs">{day.dateNum}</span>
                </td>
                {ALL_SHIFTS.map((sk) => {
                  const hasShift = day.shiftKeys.includes(sk);
                  const val = requirements[requirementKey(day.key, sk)] || 0;

                  return (
                    <td key={sk} className="border-r border-border p-0 text-center">
                      {hasShift ? (
                        <AreaRequirementInputCell
                          value={val}
                          disabled={busy}
                          onChange={(nextVal) => onChange(day.key, sk, nextVal)}
                          ariaLabel={`Meta ${sk} para ${day.label} ${day.dateNum}`}
                        />
                      ) : (
                        <div className="h-11 sm:h-12 w-full flex items-center justify-center bg-dark3/30 text-text-dim/30 font-bold text-[10px] sm:text-xs">
                          —
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="p-0 text-center">
                  <div className={cn(
                    'w-full h-11 sm:h-12 flex items-center justify-center font-inter font-bold tabular-nums text-[10px] sm:text-xs md:text-sm transition-colors',
                    currentDayTotal > 0
                      ? 'bg-[#4d7cfe]/10 text-[#4d7cfe] font-extrabold'
                      : 'bg-dark3/30 text-text-dim/40'
                  )}>
                    {currentDayTotal > 0 ? currentDayTotal : '—'}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-dark3 font-bold text-xs">
            <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-text font-bold truncate text-[11px] sm:text-xs border-r border-border">
              Total
            </td>
            {ALL_SHIFTS.map((sk) => {
              const colTotal = data.eventDays.reduce((sum, d) => {
                if (!d.shiftKeys.includes(sk)) return sum;
                return sum + (requirements[requirementKey(d.key, sk)] || 0);
              }, 0);
              return (
                <td key={sk} className="border-r border-border p-0 text-center">
                  <div className={cn(
                    'w-full h-11 sm:h-12 flex items-center justify-center font-inter font-bold tabular-nums text-[10px] sm:text-xs md:text-sm',
                    colTotal > 0
                      ? 'bg-dark3 text-text font-bold'
                      : 'bg-dark3/30 text-text-dim/40'
                  )}>
                    {colTotal > 0 ? colTotal : '—'}
                  </div>
                </td>
              );
            })}
            <td className="p-0 text-center">
              <div className="w-full h-11 sm:h-12 flex items-center justify-center bg-[#4d7cfe]/20 text-[#4d7cfe] font-black font-inter text-xs sm:text-sm md:text-base tabular-nums shadow-sm">
                {totalRequirements}
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function AssignmentPanel({
  data,
  busy,
  onAssign,
}: {
  data: AreaManagementData;
  busy: boolean;
  onAssign: (shiftIds: string[], areaId: string | null) => Promise<boolean>;
}) {
  const firstDay = data.eventDays[0];
  const [dayKey, setDayKey] = useState(firstDay?.key || '');
  const [shiftKey, setShiftKey] = useState<ShiftKey>(firstDay?.shiftKeys[0] || 'T1');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetAreaId, setTargetAreaId] = useState('__none__');
  const [bulkScope, setBulkScope] = useState<'slot' | 'all'>('slot');
  const [bulkConfirmationSignature, setBulkConfirmationSignature] = useState<string | null>(null);
  const [profileVolunteerId, setProfileVolunteerId] = useState<string | null>(null);
  const [scopeDrawerVolunteer, setScopeDrawerVolunteer] = useState<AreaVolunteer | null>(null);
  const [scopeDrawerTargetAreaId, setScopeDrawerTargetAreaId] = useState<string | null>(null);
  const [scopeDrawerInitialShiftIds, setScopeDrawerInitialShiftIds] = useState<string[]>([]);

  const selectedDay = data.eventDays.find((day) => day.key === dayKey) || firstDay;
  const volunteersById = useMemo(
    () => new Map(data.volunteers.map((volunteer) => [volunteer.id, volunteer])),
    [data.volunteers]
  );
  const areasById = useMemo(
    () => new Map(data.areas.map((area) => [area.id, area])),
    [data.areas]
  );

  // Group all assignments by volunteer across the whole event
  const assignmentsByVolunteer = useMemo(() => {
    const map = new Map<string, VolunteerShiftAssignmentItem[]>();
    for (const assignment of data.assignments) {
      const list = map.get(assignment.volunteerId) || [];
      list.push({
        id: assignment.id,
        dayKey: assignment.dayKey,
        shiftKey: assignment.shiftKey,
        areaId: assignment.areaId,
      });
      map.set(assignment.volunteerId, list);
    }
    return map;
  }, [data.assignments]);

  const slotAssignments = useMemo(
    () => data.assignments
      .filter((assignment) => assignment.dayKey === dayKey && assignment.shiftKey === shiftKey)
      .map((assignment) => ({ ...assignment, volunteer: volunteersById.get(assignment.volunteerId) }))
      .filter((assignment) => assignment.volunteer)
      .sort((a, b) => a.volunteer!.name.localeCompare(b.volunteer!.name, 'es')),
    [data.assignments, dayKey, shiftKey, volunteersById]
  );

  const normalizedSearch = search.trim().toLocaleLowerCase('es');
  const filteredAssignments = useMemo(() => {
    return slotAssignments.filter((assignment) => {
      if (normalizedSearch && !assignment.volunteer!.name.toLocaleLowerCase('es').includes(normalizedSearch)) {
        return false;
      }
      if (statusFilter === 'unassigned') return !assignment.areaId;
      if (statusFilter === 'assigned') return Boolean(assignment.areaId);
      return true;
    });
  }, [slotAssignments, normalizedSearch, statusFilter]);

  const visibleIds = filteredAssignments.map((assignment) => assignment.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const activeAreas = data.areas.filter((area) => area.status === 'active');
  const validTargetAreaId = targetAreaId === '__none__' || activeAreas.some((area) => area.id === targetAreaId)
    ? targetAreaId
    : '__none__';

  const assignmentsByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of data.assignments) {
      counts.set(assignment.dayKey, (counts.get(assignment.dayKey) || 0) + 1);
    }
    return counts;
  }, [data.assignments]);

  const unassignedCount = slotAssignments.filter((a) => !a.areaId).length;
  const assignedCount = slotAssignments.length - unassignedCount;

  // Selected volunteers across current slot selection
  const selectedVolunteers = useMemo(() => {
    const selectedShiftSet = new Set(selectedIds);
    const vols = new Set<string>();
    for (const a of slotAssignments) {
      if (selectedShiftSet.has(a.id)) {
        vols.add(a.volunteerId);
      }
    }
    return Array.from(vols);
  }, [selectedIds, slotAssignments]);

  // All shift IDs belonging to the selected volunteers across the entire event
  const selectedAllShiftIds = useMemo(() => {
    const ids: string[] = [];
    for (const volId of selectedVolunteers) {
      const volShifts = assignmentsByVolunteer.get(volId) || [];
      for (const s of volShifts) {
        ids.push(s.id);
      }
    }
    return ids;
  }, [selectedVolunteers, assignmentsByVolunteer]);

  // Unique days touched by all shifts of selected volunteers
  const selectedDaysCount = useMemo(() => {
    const dayKeys = new Set<string>();
    for (const volId of selectedVolunteers) {
      const volShifts = assignmentsByVolunteer.get(volId) || [];
      for (const s of volShifts) {
        dayKeys.add(s.dayKey);
      }
    }
    return dayKeys.size;
  }, [selectedVolunteers, assignmentsByVolunteer]);
  const bulkShiftIds = bulkScope === 'slot' ? Array.from(selectedIds) : selectedAllShiftIds;
  const bulkShiftCount = bulkShiftIds.length;
  const bulkLimitExceeded = bulkShiftCount > MAX_SHIFT_AREA_ASSIGNMENTS;
  const bulkTargetAreaId = validTargetAreaId === '__none__' ? null : validTargetAreaId;
  const assignmentsById = useMemo(
    () => new Map(data.assignments.map((assignment) => [assignment.id, assignment])),
    [data.assignments]
  );
  const bulkReplacementCount = bulkShiftIds.reduce((count, shiftId) => {
    const currentAreaId = assignmentsById.get(shiftId)?.areaId || null;
    return count + (currentAreaId && currentAreaId !== bulkTargetAreaId ? 1 : 0);
  }, 0);
  const bulkSelectionSignature = `${bulkScope}:${bulkTargetAreaId || '__none__'}:${[...bulkShiftIds].sort().join(',')}`;
  const bulkAwaitingConfirmation = bulkReplacementCount > 0 && bulkConfirmationSignature === bulkSelectionSignature;

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function applyBulkArea() {
    const targetAreaNormalized = bulkTargetAreaId;
    const shiftIdsToApply = bulkShiftIds;
    if (shiftIdsToApply.length === 0 || shiftIdsToApply.length > MAX_SHIFT_AREA_ASSIGNMENTS) return;
    if (bulkReplacementCount > 0 && !bulkAwaitingConfirmation) {
      setBulkConfirmationSignature(bulkSelectionSignature);
      return;
    }

    const success = await onAssign(shiftIdsToApply, targetAreaNormalized);
    if (success) {
      setSelectedIds(new Set());
      setBulkConfirmationSignature(null);
    }
  }

  function openScopeDrawer(volunteer: AreaVolunteer, preselectedAreaId: string | null) {
    const volunteerShifts = assignmentsByVolunteer.get(volunteer.id) || [];
    const activeShift = volunteerShifts.find(
      (assignment) => assignment.dayKey === dayKey && assignment.shiftKey === shiftKey
    );
    setScopeDrawerVolunteer(volunteer);
    setScopeDrawerTargetAreaId(preselectedAreaId);
    setScopeDrawerInitialShiftIds(activeShift ? [activeShift.id] : volunteerShifts[0] ? [volunteerShifts[0].id] : []);
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-white shadow-sm dark:bg-dark2" aria-label="Asignación de áreas">
      {/* Header Controls: Date & Shift Selection */}
      <div className="space-y-4 border-b border-border p-4 md:p-5">
        <EventDayCards
          days={data.eventDays}
          selectedDayKey={dayKey}
          getDayCount={(key) => assignmentsByDay.get(key) || 0}
          onDayChange={(value) => {
            const nextDay = data.eventDays.find((day) => day.key === value);
            setDayKey(value);
            setShiftKey(nextDay?.shiftKeys[0] || 'T1');
            setSelectedIds(new Set());
          }}
        />

        <div className="h-px bg-border/40" />

        {/* Turnos Selector */}
        <div className="space-y-2">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-text-dim">Turno a gestionar</span>
          <div className="grid grid-cols-4 gap-2 md:flex md:flex-wrap">
            {(selectedDay?.shiftKeys || []).map((key) => {
              const count = data.assignments.filter((assignment) => assignment.dayKey === dayKey && assignment.shiftKey === key).length;
              const selected = shiftKey === key;
              return (
                <EventShiftCard
                  key={key}
                  shiftKey={key}
                  count={count}
                  selected={selected}
                  title={`${key} · ${selectedDay?.shiftLabels[key] || ''}`}
                  onClick={() => {
                    setShiftKey(key);
                    setSelectedIds(new Set());
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Search Bar and Quick Status Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="w-full sm:max-w-md">
            <SmartSearchBar
              value={search}
              onValueChange={setSearch}
              onImmediateSearch={setSearch}
              placeholder="Buscar voluntario por nombre..."
              ariaLabel="Buscar voluntario"
            />
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={cn(
                'px-2.5 py-1 rounded-full font-inter font-bold text-xs transition-all cursor-pointer border',
                statusFilter === 'all'
                  ? 'bg-white text-black border-white shadow-sm dark:bg-white dark:text-black'
                  : 'bg-dark3 border-border text-text-dim hover:text-text'
              )}
            >
              Todos ({slotAssignments.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('unassigned')}
              className={cn(
                'px-2.5 py-1 rounded-full font-inter font-bold text-xs transition-all cursor-pointer border flex items-center gap-1',
                statusFilter === 'unassigned'
                  ? 'bg-amber-500 text-black border-amber-500 shadow-sm font-black'
                  : unassignedCount > 0
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                  : 'bg-dark3 border-border text-text-dim hover:text-text'
              )}
            >
              <span>Sin área</span>
              <span className="tabular-nums">({unassignedCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('assigned')}
              className={cn(
                'px-2.5 py-1 rounded-full font-inter font-bold text-xs transition-all cursor-pointer border',
                statusFilter === 'assigned'
                  ? 'bg-[#4d7cfe] text-white border-[#4d7cfe] shadow-sm'
                  : 'bg-dark3 border-border text-text-dim hover:text-text'
              )}
            >
              Asignados ({assignedCount})
            </button>
          </div>
        </div>
      </div>

      {/* Main List / Table */}
      {slotAssignments.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center px-6 pb-24 pt-6 text-center md:py-6">
          <span className="material-symbols-outlined text-[36px] text-text-dim" aria-hidden="true">event_busy</span>
          <h2 className="mt-4 text-base font-bold text-text">No hay voluntarios programados en este turno</h2>
          <p className="mt-1 text-xs text-text-dim">Selecciona otro día o turno para continuar.</p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-12 text-center">
          <span className="material-symbols-outlined text-[32px] text-text-dim mb-2">search_off</span>
          <p className="text-sm font-bold text-text">No hay coincidencias con los filtros aplicados.</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilter('all'); }}
            className="mt-2 text-xs font-bold text-[#4d7cfe] hover:underline cursor-pointer"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <>
          {/* Select All Checkbox bar */}
          <div className="flex items-center justify-between border-b border-border bg-dark3/30 px-4 py-2 text-xs">
            <label className="flex cursor-pointer items-center gap-2 font-bold text-text">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                ref={(element) => {
                  if (element) element.indeterminate = someVisibleSelected && !allVisibleSelected;
                }}
                onChange={selectAllVisible}
                className="h-4 w-4 rounded border-border accent-[#4d7cfe]"
              />
              <span>Seleccionar visibles ({filteredAssignments.length})</span>
            </label>
            <span className="font-bold tabular-nums text-text-dim">
              {selectedIds.size} voluntario{selectedIds.size === 1 ? '' : 's'} seleccionado{selectedIds.size === 1 ? '' : 's'}
            </span>
          </div>

          {/* Desktop Table View */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full table-fixed border-collapse text-left text-xs">
              <colgroup>
                <col className="w-12" />
                <col />
                <col className="w-16" />
                <col className="w-[36%]" />
                <col className="w-28" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-dark2/60 text-[11px] font-bold text-text-dim">
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Seleccionar</span></th>
                  <th scope="col" className="px-3 py-2.5 font-bold text-text">Voluntario</th>
                  <th scope="col" className="px-2 py-2.5 text-center font-bold text-text">Edad</th>
                  <th scope="col" className="px-3 py-2.5 font-bold text-text">Área asignada</th>
                  <th scope="col" className="px-2 py-2.5 text-center font-bold text-text">Alcance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-inter">
                {filteredAssignments.map((assignment) => {
                  const area = assignment.areaId ? areasById.get(assignment.areaId) : null;
                  const isSelected = selectedIds.has(assignment.id);
                  const volShifts = assignmentsByVolunteer.get(assignment.volunteerId) || [];
                  const totalShiftsCount = volShifts.length;

                  return (
                    <tr
                      key={assignment.id}
                      className={cn(
                        'hover:bg-white/[0.02] transition-colors',
                        isSelected && 'bg-[#4d7cfe]/10'
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(assignment.id)}
                          aria-label={`Seleccionar a ${assignment.volunteer!.name}`}
                          className="h-4 w-4 rounded border-border accent-[#4d7cfe]"
                        />
                      </td>

                      {/* Volunteer Name */}
                      <td className="px-3 py-2.5 text-left">
                        <button
                          type="button"
                          onClick={() => setProfileVolunteerId(assignment.volunteerId)}
                          className="block max-w-full truncate text-left text-xs font-bold text-text transition-colors hover:text-[#4d7cfe] cursor-pointer"
                          aria-label={`Abrir perfil de ${assignment.volunteer!.name}`}
                        >
                          {assignment.volunteer!.name}
                        </button>
                      </td>

                      {/* Age */}
                      <td className="px-2 py-2.5 text-center font-bold tabular-nums text-text-dim">
                        {assignment.volunteer!.age ?? '—'}
                      </td>

                      {/* Area Dropdown */}
                      <td className="px-3 py-2.5">
                        <Select
                          disabled={busy}
                          value={assignment.areaId || '__none__'}
                          onValueChange={async (val) => {
                            const newAreaId = val === '__none__' ? null : val;
                            if (totalShiftsCount > 1) {
                              // If volunteer has multiple shifts, open the scope drawer with the new area preselected
                              openScopeDrawer(assignment.volunteer!, newAreaId);
                            } else {
                              // Single shift direct assignment
                              await onAssign([assignment.id], newAreaId);
                            }
                          }}
                        >
                          <SelectTrigger className={cn(
                            'h-8 w-full rounded-full border px-3 text-xs font-bold transition-colors',
                            area
                              ? 'border-[#4d7cfe]/30 bg-[#4d7cfe]/10 text-[#4d7cfe]'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                          )}>
                            <SelectValue>
                              {area ? (
                                <span className="truncate">{area.name}</span>
                              ) : (
                                <span>Sin área asignada</span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-dark2 border-border text-text z-50">
                            <SelectItem value="__none__" className="text-xs font-bold text-amber-400">
                              Sin área asignada
                            </SelectItem>
                            {activeAreas.map((a) => (
                              <SelectItem key={a.id} value={a.id} className="text-xs font-bold">
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Multi-shift Scope Action Button */}
                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => openScopeDrawer(assignment.volunteer!, assignment.areaId)}
                          disabled={busy}
                          title="Elegir en cuáles turnos se aplicará el área"
                          aria-label={`Configurar alcance: ${totalShiftsCount} turno${totalShiftsCount === 1 ? '' : 's'} de ${assignment.volunteer!.name}`}
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-dark3 px-2.5 text-[11px] font-bold text-text-dim transition-all hover:border-[#4d7cfe]/40 hover:bg-[#4d7cfe]/10 hover:text-text active:scale-[0.97] cursor-pointer disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[15px] text-[#4d7cfe]">tune</span>
                          <span>{totalShiftsCount} turno{totalShiftsCount === 1 ? '' : 's'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile View (Phones) */}
          <div className="divide-y divide-border/40 font-inter md:hidden">
            {filteredAssignments.map((assignment) => {
              const area = assignment.areaId ? areasById.get(assignment.areaId) : null;
              const isSelected = selectedIds.has(assignment.id);
              const volShifts = assignmentsByVolunteer.get(assignment.volunteerId) || [];
              const totalShiftsCount = volShifts.length;

              return (
                <div
                  key={assignment.id}
                  className={cn(
                    'flex flex-col gap-2.5 px-3.5 py-3 transition-colors',
                    isSelected && 'bg-[#4d7cfe]/10'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(assignment.id)}
                        aria-label={`Seleccionar a ${assignment.volunteer!.name}`}
                        className="h-5 w-5 shrink-0 rounded border-border accent-[#4d7cfe]"
                      />
                      <button
                        type="button"
                        onClick={() => setProfileVolunteerId(assignment.volunteerId)}
                        className="flex flex-col text-left truncate cursor-pointer"
                        aria-label={`Abrir perfil de ${assignment.volunteer!.name}`}
                      >
                        <span className="text-xs font-bold leading-tight text-text truncate">
                          {assignment.volunteer!.name}
                        </span>
                        <span className="text-[10px] font-bold text-text-dim">
                          {assignment.volunteer!.age ? `${assignment.volunteer!.age} años` : 'Edad no registrada'}
                        </span>
                      </button>
                    </div>

                  </div>

                  {/* Area Selector + Scope button */}
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2 pl-7">
                    <Select
                      disabled={busy}
                      value={assignment.areaId || '__none__'}
                      onValueChange={async (val) => {
                        const newAreaId = val === '__none__' ? null : val;
                        if (totalShiftsCount > 1) {
                          openScopeDrawer(assignment.volunteer!, newAreaId);
                        } else {
                          await onAssign([assignment.id], newAreaId);
                        }
                      }}
                    >
                      <SelectTrigger
                        aria-label={`Área asignada a ${assignment.volunteer!.name}`}
                        className={cn(
                          'h-10 rounded-lg border px-2.5 text-xs font-bold transition-colors w-full',
                          area
                            ? 'border-[#4d7cfe]/30 bg-[#4d7cfe]/10 text-[#4d7cfe]'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                        )}
                      >
                        <SelectValue>
                          {area ? (
                            <span className="truncate">{area.name}</span>
                          ) : (
                            <span>Sin área</span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-dark2 border-border text-text z-50">
                        <SelectItem value="__none__" className="text-xs font-bold text-amber-400">
                          Sin área
                        </SelectItem>
                        {activeAreas.map((a) => (
                          <SelectItem key={a.id} value={a.id} className="text-xs font-bold">
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <button
                      type="button"
                      onClick={() => openScopeDrawer(assignment.volunteer!, assignment.areaId)}
                      disabled={busy}
                      title="Elegir en cuáles turnos se aplicará el área"
                      aria-label={`Configurar alcance para ${assignment.volunteer!.name}: ${totalShiftsCount} turno${totalShiftsCount === 1 ? '' : 's'}`}
                      className="flex h-10 min-w-24 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-dark3 px-3 text-text-dim transition-all hover:border-[#4d7cfe]/40 hover:bg-[#4d7cfe]/10 hover:text-text cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#4d7cfe]">tune</span>
                      <span className="text-[11px] font-bold">{totalShiftsCount} turno{totalShiftsCount === 1 ? '' : 's'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Bottom Action Bar for Bulk Assignment */}
          <div className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-dark2/95 backdrop-blur-md p-3.5 sm:flex-row sm:items-center sm:justify-between shadow-2xl z-30">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-text">
                  {selectedIds.size > 0 ? (
                    <span className="text-[#4d7cfe] font-black">
                      {selectedVolunteers.length} voluntario{selectedVolunteers.length === 1 ? '' : 's'} seleccionado{selectedVolunteers.length === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="text-text-dim">Selecciona voluntarios para asignar en lote</span>
                  )}
                </span>
              </div>

              {/* Scope Switcher when selection is active */}
              {selectedIds.size > 0 && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Alcance:</span>
                    <button
                    type="button"
                    onClick={() => setBulkScope('slot')}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all cursor-pointer',
                      bulkScope === 'slot'
                        ? 'bg-[#4d7cfe] text-white border-[#4d7cfe]'
                        : 'bg-dark3 border-border text-text-dim hover:text-text'
                    )}
                  >
                    Solo este turno ({selectedIds.size})
                    </button>
                    <button
                    type="button"
                    onClick={() => setBulkScope('all')}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all cursor-pointer',
                      bulkScope === 'all'
                        ? 'bg-[#4d7cfe] text-white border-[#4d7cfe]'
                        : 'bg-dark3 border-border text-text-dim hover:text-text'
                    )}
                  >
                    Todos sus turnos ({selectedAllShiftIds.length} en {selectedDaysCount} fechas)
                    </button>
                  </div>
                  {bulkLimitExceeded && (
                    <p className="text-[11px] font-bold text-amber-400" role="alert">
                      El máximo es {MAX_SHIFT_AREA_ASSIGNMENTS} turnos por operación. Reduce la selección para continuar.
                    </p>
                  )}
                  {bulkAwaitingConfirmation && (
                    <p className="text-[11px] font-bold text-amber-400" role="alert">
                      Confirma el reemplazo del área actual en {bulkReplacementCount} turno{bulkReplacementCount === 1 ? '' : 's'}.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Target Area selector & Apply button */}
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:w-auto">
              <Select
                value={validTargetAreaId}
                onValueChange={(value) => {
                  if (!value) return;
                  setTargetAreaId(value);
                  setBulkConfirmationSignature(null);
                }}
              >
                <SelectTrigger aria-label="Área para asignación en lote" className="h-10 min-w-0 rounded-lg border-border bg-dark3 px-3 text-xs font-bold sm:h-9 sm:min-w-[170px]">
                  <SelectValue>
                    {validTargetAreaId === '__none__' ? 'Sin área' : areasById.get(validTargetAreaId)?.name || 'Selecciona un área'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-dark2 border-border text-text z-50">
                  <SelectItem value="__none__" className="text-xs font-bold">
                    Sin área
                  </SelectItem>
                  {activeAreas.map((area) => (
                    <SelectItem key={area.id} value={area.id} className="text-xs font-bold">
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                onClick={applyBulkArea}
                disabled={selectedIds.size === 0 || busy || bulkLimitExceeded}
                className="btn-action h-10 rounded-lg px-4 font-inter text-xs font-bold text-white transition-all shadow-sm sm:h-9"
              >
                {busy
                  ? 'Aplicando…'
                  : bulkAwaitingConfirmation
                    ? `Confirmar (${bulkShiftCount})`
                    : bulkReplacementCount > 0
                      ? `Revisar (${bulkShiftCount})`
                      : `Asignar (${bulkShiftCount})`}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Volunteer Profile Drawer */}
      <VolunteerProfileDrawer
        isOpen={Boolean(profileVolunteerId)}
        onClose={() => setProfileVolunteerId(null)}
        volunteerId={profileVolunteerId}
      />

      {/* Multi-Shift Scope Drawer */}
      <AssignScopeDrawer
        key={`${scopeDrawerVolunteer?.id || 'closed'}:${scopeDrawerTargetAreaId || '__none__'}:${scopeDrawerInitialShiftIds.join(',')}`}
        isOpen={Boolean(scopeDrawerVolunteer)}
        onClose={() => {
          setScopeDrawerVolunteer(null);
          setScopeDrawerTargetAreaId(null);
          setScopeDrawerInitialShiftIds([]);
        }}
        volunteer={scopeDrawerVolunteer}
        initialTargetAreaId={scopeDrawerTargetAreaId}
        activeAreas={activeAreas}
        eventDays={data.eventDays}
        volunteerShifts={scopeDrawerVolunteer ? assignmentsByVolunteer.get(scopeDrawerVolunteer.id) || [] : []}
        areasById={areasById}
        busy={busy}
        onConfirmAssign={onAssign}
        initialSelectedShiftIds={scopeDrawerInitialShiftIds}
        activeDayKey={dayKey}
        activeShiftKey={shiftKey}
      />
    </section>
  );
}

function getHeatmapStyle(assigned: number, required: number) {
  if (required === 0) {
    return {
      bg: assigned > 0
        ? 'bg-teal-500/10 border-teal-500/25 text-teal-400'
        : 'bg-dark3/30 border-border/20 text-text-dim/40',
      label: 'Sin meta',
      coverage: 0,
      isEmpty: assigned === 0,
      hasTarget: false,
    };
  }
  const coverage = assigned / required;
  if (coverage >= 1) {
    return {
      bg: 'bg-teal-500/15 border-teal-500/30 text-teal-400 hover:bg-teal-500/25',
      label: 'Óptimo',
      coverage,
      isEmpty: false,
      hasTarget: true,
    };
  }
  if (coverage >= 0.7) {
    return {
      bg: 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25',
      label: 'Riesgo',
      coverage,
      isEmpty: false,
      hasTarget: true,
    };
  }
  return {
    bg: 'bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25',
    label: 'Crítico',
    coverage,
    isEmpty: false,
    hasTarget: true,
  };
}

function HeatmapCell({
  assigned,
  required,
}: {
  assigned: number;
  required: number;
}) {
  const { bg, coverage, isEmpty, hasTarget } = getHeatmapStyle(assigned, required);

  if (isEmpty) {
    return (
      <div className={cn('w-full h-11 sm:h-12 flex items-center justify-center transition-colors', bg)}>
        <span className="text-[10px] sm:text-xs text-text-dim/40 font-bold">—</span>
      </div>
    );
  }

  return (
    <div className={cn('w-full h-11 sm:h-12 flex flex-col items-center justify-center p-0.5 transition-colors', bg)}>
      <span className="font-inter font-bold tabular-nums leading-tight text-text text-[11px] sm:text-xs">
        {hasTarget ? `${Math.round(coverage * 100)}%` : assigned}
      </span>
      <span className="text-[9px] sm:text-[10px] font-inter font-bold text-text-dim tabular-nums leading-tight mt-0.5">
        {assigned}/{required}
      </span>
    </div>
  );
}

function CoveragePanel({ data, onManageAreas }: { data: AreaManagementData; onManageAreas: () => void }) {
  const activeAreas = data.areas.filter((area) => area.status === 'active');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('__all__');

  const targetAreas = useMemo(() => {
    return selectedAreaId === '__all__'
      ? activeAreas
      : activeAreas.filter((a) => a.id === selectedAreaId);
  }, [activeAreas, selectedAreaId]);

  const targetAreaIds = useMemo(() => new Set(targetAreas.map((a) => a.id)), [targetAreas]);

  const matrixData = useMemo(() => {
    return data.eventDays.map((day) => {
      const shifts = ALL_SHIFTS.map((shiftKey) => {
        const hasShift = day.shiftKeys.includes(shiftKey);
        if (!hasShift) {
          return { shiftKey, hasShift: false, assigned: 0, required: 0 };
        }

        const required = data.requirements
          .filter((r) => r.dayKey === day.key && r.shiftKey === shiftKey && targetAreaIds.has(r.areaId))
          .reduce((sum, r) => sum + r.requiredCount, 0);

        const assigned = data.assignments
          .filter((a) => a.dayKey === day.key && a.shiftKey === shiftKey && a.areaId && targetAreaIds.has(a.areaId))
          .length;

        return { shiftKey, hasShift: true, assigned, required };
      });

      const dayAssigned = shifts.reduce((sum, s) => sum + s.assigned, 0);
      const dayRequired = shifts.reduce((sum, s) => sum + s.required, 0);

      return {
        day,
        shifts,
        dayAssigned,
        dayRequired,
      };
    });
  }, [data, targetAreaIds]);

  const totalAssigned = matrixData.reduce((sum, d) => sum + d.dayAssigned, 0);
  const totalRequired = matrixData.reduce((sum, d) => sum + d.dayRequired, 0);
  const globalCoverage = totalRequired > 0 ? totalAssigned / totalRequired : 0;

  const criticalShiftsCount = matrixData.reduce((sum, d) => {
    return sum + d.shifts.filter((s) => s.hasShift && s.required > 0 && s.assigned / s.required < 0.7).length;
  }, 0);

  const selectedAreaObj = activeAreas.find((a) => a.id === selectedAreaId);

  if (activeAreas.length === 0) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-[20px] border border-border bg-white px-6 pb-24 pt-10 text-center shadow-sm dark:bg-dark2 md:py-10" aria-label="Cobertura por áreas">
        <span className="material-symbols-outlined text-[36px] text-text-dim" aria-hidden="true">grid_view</span>
        <h2 className="mt-4 text-lg font-bold text-text">Primero crea un área</h2>
        <p className="mt-2 text-sm text-text-dim">El mapa de calor aparecerá cuando el comité tenga al menos un área activa.</p>
        <Button type="button" onClick={onManageAreas} className="btn-action mt-5 h-11 rounded-full text-white">Gestionar áreas</Button>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-white shadow-sm dark:bg-dark2" aria-label="Mapa de calor de cobertura">
      {/* Top Controls: Area Filter & Metrics (Matching Dashboard standards) */}
      <div className="space-y-3.5 border-b border-border p-3 sm:p-5 bg-dark3/10">
        {/* Area Filter Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <span className="text-xs font-bold text-text shrink-0">Filtrar por Área:</span>
            <Select value={selectedAreaId} onValueChange={(val) => val && setSelectedAreaId(val)}>
              <SelectTrigger className="h-11 w-full rounded-lg border-border bg-dark3 text-xs font-bold text-text sm:h-9 sm:w-[240px]">
                <SelectValue placeholder="Todas las áreas">
                  {selectedAreaId === '__all__' ? `Todas las áreas (${activeAreas.length})` : selectedAreaObj?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-dark2 border-border text-text z-50">
                <SelectItem value="__all__" className="text-xs font-bold">
                  Todas las áreas ({activeAreas.length})
                </SelectItem>
                {activeAreas.map((area) => (
                  <SelectItem key={area.id} value={area.id} className="text-xs font-bold">
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Metric Badges (Exact match to Dashboard KPIs with uniform h-7 height) */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-bold">
          <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-dark3 px-3 text-text-dim leading-none">
            <span>Asignados:</span>
            <strong className="text-text tabular-nums">{totalAssigned}/{totalRequired}</strong>
          </div>
          <div className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 font-bold leading-none',
            globalCoverage >= 1
              ? 'border-teal-500/30 bg-teal-500/10 text-teal-400'
              : globalCoverage >= 0.7
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          )}>
            <span>Cobertura:</span>
            <strong className="tabular-nums">{Math.round(globalCoverage * 100)}%</strong>
          </div>
          {criticalShiftsCount > 0 && (
            <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 text-rose-400 font-bold leading-none">
              <span className="material-symbols-outlined text-[15px] leading-none">warning</span>
              <span>{criticalShiftsCount} turno{criticalShiftsCount > 1 ? 's' : ''} crítico{criticalShiftsCount > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* Heatmap Grid (All Event Days x Shifts) - Seamless Flat Grid matching Dashboard */}
      <div className="overflow-x-auto w-full">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-dark3 text-[10px] sm:text-[11px] font-bold text-text-dim">
              <th scope="col" className="w-16 sm:w-20 md:w-24 px-1.5 sm:px-3 py-2.5 sm:py-3 border-r border-border font-bold text-text-dim text-center sm:text-left">Fecha</th>
              {ALL_SHIFTS.map((shiftKey) => (
                <th key={shiftKey} scope="col" className="py-2.5 sm:py-3 text-center border-r border-border font-bold text-text">
                  {shiftKey}
                </th>
              ))}
              <th scope="col" className="w-16 sm:w-20 md:w-24 py-2.5 sm:py-3 text-center font-bold text-text">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-inter">
            {matrixData.map(({ day, shifts, dayAssigned, dayRequired }) => {
              return (
                <tr key={day.key} className="hover:brightness-110 transition-all">
                  <td className="px-1.5 sm:px-3 py-2 sm:py-2.5 font-bold text-text truncate border-r border-border bg-dark3/40 text-center sm:text-left">
                    <span className="capitalize text-[11px] sm:text-xs">{day.label}</span> <span className="text-[11px] sm:text-xs">{day.dateNum}</span>
                  </td>

                  {shifts.map((s) => (
                    <td key={s.shiftKey} className="border-r border-border p-0 text-center">
                      {s.hasShift ? (
                        <HeatmapCell assigned={s.assigned} required={s.required} />
                      ) : (
                        <div className="h-11 sm:h-12 w-full flex items-center justify-center bg-dark3/30 text-text-dim/30 font-bold text-[10px] sm:text-xs">
                          —
                        </div>
                      )}
                    </td>
                  ))}

                  <td className="p-0 text-center">
                    <HeatmapCell assigned={dayAssigned} required={dayRequired} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-dark3 font-bold text-xs">
              <td className="px-2 sm:px-4 py-2.5 sm:py-3 text-text font-bold truncate text-[11px] sm:text-xs border-r border-border">Total</td>
              {ALL_SHIFTS.map((shiftKey) => {
                const colAssigned = matrixData.reduce((sum, d) => {
                  const s = d.shifts.find((item) => item.shiftKey === shiftKey);
                  return sum + (s?.assigned || 0);
                }, 0);
                const colRequired = matrixData.reduce((sum, d) => {
                  const s = d.shifts.find((item) => item.shiftKey === shiftKey);
                  return sum + (s?.required || 0);
                }, 0);

                const anyDayHasShift = matrixData.some((d) => d.shifts.some((s) => s.shiftKey === shiftKey && s.hasShift));

                return (
                  <td key={shiftKey} className="border-r border-border p-0 text-center">
                    {anyDayHasShift ? (
                      <HeatmapCell assigned={colAssigned} required={colRequired} />
                    ) : (
                      <div className="h-11 sm:h-12 w-full flex items-center justify-center bg-dark3/30 text-text-dim/30 font-bold text-[10px] sm:text-xs">
                        —
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="p-0 text-center">
                <HeatmapCell assigned={totalAssigned} required={totalRequired} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Heatmap Legend (Matching Dashboard) */}
      <div className="flex items-center justify-center gap-4 sm:gap-8 py-3 sm:py-4 border-t border-border bg-dark3/20 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-sm border border-rose-500/30 bg-rose-500/15" />
          <span className="text-[10px] font-inter font-bold text-text-dim uppercase tracking-widest">Crítico (&lt; 70%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-sm border border-amber-500/30 bg-amber-500/15" />
          <span className="text-[10px] font-inter font-bold text-text-dim uppercase tracking-widest">Riesgo (70% – 99%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-sm border border-teal-500/30 bg-teal-500/15" />
          <span className="text-[10px] font-inter font-bold text-text-dim uppercase tracking-widest">Óptimo (100%)</span>
        </div>
      </div>
    </section>
  );
}

export function CommitteeAreasClient({
  data,
  requestedAreaId = null,
  initiallyShowArchived = false,
  initialView = 'coverage',
  embedded = false,
}: {
  data: AreaManagementData;
  requestedAreaId?: string | null;
  initiallyShowArchived?: boolean;
  initialView?: AreaView;
  embedded?: boolean;
}) {
  const router = useRouter();
  const initialVisibleAreas = data.areas.filter((area) => initiallyShowArchived || area.status === 'active');
  const initialSelectedArea = initialVisibleAreas.find((area) => area.id === requestedAreaId)
    || initialVisibleAreas.find((area) => area.status === 'active')
    || initialVisibleAreas[0]
    || null;
  const initialRequirements = buildRequirementMap(data, initialSelectedArea?.id || null);
  const [isPending, startTransition] = useTransition();
  const [mutationPending, setMutationPending] = useState(false);
  const [showArchived, setShowArchived] = useState(initiallyShowArchived);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [view, setView] = useState<AreaView>(initialView);
  const [requirements, setRequirements] = useState<RequirementMap>(initialRequirements);
  const [savedRequirements, setSavedRequirements] = useState<RequirementMap>(initialRequirements);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });

  const [areaOverrides, setAreaOverrides] = useState<Map<string, string | null>>(new Map());

  const effectiveAssignments = useMemo(
    () => data.assignments.map((assignment) => (
      areaOverrides.has(assignment.id)
        ? { ...assignment, areaId: areaOverrides.get(assignment.id) ?? null }
        : assignment
    )),
    [areaOverrides, data.assignments]
  );

  const effectiveData = useMemo<AreaManagementData>(
    () => ({
      ...data,
      assignments: effectiveAssignments,
    }),
    [data, effectiveAssignments]
  );

  const visibleAreas = useMemo(
    () => effectiveData.areas.filter((area) => showArchived || area.status === 'active'),
    [effectiveData.areas, showArchived]
  );

  const selectedArea = useMemo<AreaManagementItem | null>(() => {
    const requested = visibleAreas.find((area) => area.id === requestedAreaId);
    return requested || visibleAreas.find((area) => area.status === 'active') || visibleAreas[0] || null;
  }, [requestedAreaId, visibleAreas]);

  const isDirty = JSON.stringify(requirements) !== JSON.stringify(savedRequirements);
  const activeCount = effectiveData.areas.filter((area) => area.status === 'active').length;
  const archivedCount = effectiveData.areas.length - activeCount;
  const busy = isPending || mutationPending;

  function showToast(message: string, type: ToastState['type'] = 'success', options?: Pick<ToastState, 'actionLabel' | 'onAction'>) {
    setToast({ visible: true, message, type, ...options });
  }

  function areaHref(areaId?: string | null, options?: { archived?: boolean; committeeSlug?: string; view?: AreaView }) {
    const params = new URLSearchParams();
    if (data.committees.length > 1) params.set('committee', options?.committeeSlug || data.selectedCommittee.slug);
    if (areaId) params.set('area', areaId);
    if (options?.archived ?? showArchived) params.set('archived', '1');
    const nextView = options?.view || view;
    if (nextView !== 'coverage') params.set('view', nextView);
    return `/areas?${params.toString()}`;
  }

  function refreshTo(areaId?: string | null, options?: { archived?: boolean; committeeSlug?: string; view?: AreaView }) {
    if (embedded && options?.view) {
      setView(options.view);
      return;
    }
    startTransition(() => {
      router.replace(areaHref(areaId, options), { scroll: false });
    });
  }

  async function runMutation<T>(operation: () => Promise<T>): Promise<T> {
    setMutationPending(true);
    try {
      return await operation();
    } finally {
      setMutationPending(false);
    }
  }

  async function handleCreate(name: string, description: string) {
    const result = await runMutation(() => createCommitteeAreaAction({
      committeeId: data.selectedCommittee.id,
      name,
      description,
    }));
    if (!result.success || !result.area) {
      showToast(result.error || 'No se pudo crear el área.', 'error');
      return;
    }
    setShowCreate(false);
    showToast(`Área “${result.area.name}” creada.`);
    refreshTo(result.area.id);
  }

  async function handleUpdate(name: string, description: string) {
    if (!selectedArea) return;
    const result = await runMutation(() => updateCommitteeAreaAction(selectedArea.id, { name, description }));
    if (!result.success) {
      showToast(result.error || 'No se pudo actualizar el área.', 'error');
      return;
    }
    setShowEdit(false);
    showToast('Área actualizada.');
    refreshTo(selectedArea.id);
  }

  async function handleArchive() {
    if (!selectedArea) return;
    const archivedArea = selectedArea;
    const result = await runMutation(() => archiveCommitteeAreaAction(archivedArea.id));
    if (!result.success) {
      showToast(result.error || 'No se pudo archivar el área.', 'error');
      return;
    }
    showToast(`“${archivedArea.name}” fue archivada.`, 'info', {
      actionLabel: 'Deshacer',
      onAction: async () => {
        const restoreResult = await runMutation(() => restoreCommitteeAreaAction(archivedArea.id));
        if (!restoreResult.success) {
          showToast(restoreResult.error || 'No se pudo restaurar el área.', 'error');
          return;
        }
        showToast('Área restaurada.');
        refreshTo(archivedArea.id);
      },
    });
    refreshTo(null);
  }

  async function handleRestore() {
    if (!selectedArea) return;
    const result = await runMutation(() => restoreCommitteeAreaAction(selectedArea.id));
    if (!result.success) {
      showToast(result.error || 'No se pudo restaurar el área.', 'error');
      return;
    }
    showToast('Área restaurada.');
    refreshTo(selectedArea.id, { archived: showArchived });
  }

  async function handleSaveRequirements() {
    if (!selectedArea) return;
    const payload = data.eventDays.flatMap((day) =>
      day.shiftKeys.map((shiftKey) => ({
        dayKey: day.key,
        shiftKey,
        requiredCount: requirements[requirementKey(day.key, shiftKey)] || 0,
      }))
    );
    const result = await runMutation(() => saveAreaRequirementsAction(selectedArea.id, payload));
    if (!result.success) {
      showToast(result.error || 'No se pudieron guardar los requerimientos.', 'error');
      return;
    }
    setSavedRequirements({ ...requirements });
    showToast('Cobertura requerida guardada.');
    router.refresh();
  }

  function setRequirement(dayKey: string, shiftKey: ShiftKey, value: number) {
    setRequirements((current) => ({ ...current, [requirementKey(dayKey, shiftKey)]: value }));
  }

  async function handleAssign(shiftIds: string[], areaId: string | null) {
    const uniqueShiftIds = Array.from(new Set(shiftIds));
    if (uniqueShiftIds.length === 0 || uniqueShiftIds.length > MAX_SHIFT_AREA_ASSIGNMENTS) {
      showToast(`Selecciona entre 1 y ${MAX_SHIFT_AREA_ASSIGNMENTS} turnos por operación.`, 'error');
      return false;
    }

    const previousMap = new Map<string, string | null>();
    for (const id of uniqueShiftIds) {
      const existing = data.assignments.find((a) => a.id === id);
      previousMap.set(
        id,
        areaOverrides.has(id) ? areaOverrides.get(id) ?? null : existing?.areaId ?? null
      );
    }

    // Apply optimistic update immediately
    setAreaOverrides((prev) => {
      const next = new Map(prev);
      uniqueShiftIds.forEach((id) => next.set(id, areaId));
      return next;
    });

    let result: Awaited<ReturnType<typeof assignVolunteerAreasAction>>;
    try {
      result = await runMutation(() => assignVolunteerAreasAction(uniqueShiftIds, areaId));
    } catch {
      setAreaOverrides((prev) => {
        const next = new Map(prev);
        previousMap.forEach((value, id) => next.set(id, value));
        return next;
      });
      showToast('No se pudo completar la asignación. Verifica tu sesión e inténtalo nuevamente.', 'error');
      return false;
    }
    if (!result.success) {
      // Revert optimistic update on failure
      setAreaOverrides((prev) => {
        const next = new Map(prev);
        previousMap.forEach((val, id) => next.set(id, val));
        return next;
      });
      showToast(result.error || 'No se pudieron actualizar las asignaciones.', 'error');
      return false;
    }

    const updatedCount = result.assignedCount ?? uniqueShiftIds.length;
    const undoAssignments = result.previousAssignments || [];
    showToast(
      updatedCount === 0
        ? 'Los voluntarios seleccionados ya tenían esa área.'
        : `${updatedCount} asignación${updatedCount === 1 ? '' : 'es'} guardada${updatedCount === 1 ? '' : 's'}.`,
      'success',
      updatedCount > 0 && undoAssignments.length > 0 ? {
        actionLabel: 'Deshacer',
        onAction: async () => {
          const undoMap = new Map(undoAssignments.map((assignment) => [assignment.shiftId, assignment.areaId]));
          setAreaOverrides((prev) => {
            const next = new Map(prev);
            undoMap.forEach((value, id) => next.set(id, value));
            return next;
          });

          try {
            const revResult = await runMutation(() => restoreVolunteerAreasAction(undoAssignments));
            if (!revResult.success) {
              throw new Error(revResult.error || 'No se pudo revertir la asignación.');
            }
            showToast('Asignación revertida correctamente.', 'info');
          } catch {
            setAreaOverrides((prev) => {
              const next = new Map(prev);
              undoAssignments.forEach((assignment) => next.set(assignment.shiftId, areaId));
              return next;
            });
            showToast('No se pudo revertir la asignación. Los cambios originales se mantienen.', 'error');
          }
          router.refresh();
        },
      } : undefined
    );
    router.refresh();
    return true;
  }

  const renderSubNav = () => {
    const showCommitteeDropdown = data.committees.length > 1;
    if (!showCommitteeDropdown) {
      return null;
    }

    return (
      <div className={cn("flex flex-wrap items-center justify-between gap-2.5 pt-1", embedded && "pb-3")}>
        <div className="min-w-[180px]">
          <label htmlFor="committee-area-selector" className="sr-only">Comité</label>
          <Select
            value={data.selectedCommittee.slug}
            onValueChange={(committeeSlug) => committeeSlug && refreshTo(null, { committeeSlug, archived: false })}
          >
            <SelectTrigger id="committee-area-selector" className="h-11 rounded-full border-border bg-dark3 px-3 text-xs font-bold sm:h-8">
              <SelectValue>
                {() => data.selectedCommittee.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-dark2 border-border text-text">
              {data.committees.map((committee) => (
                <SelectItem key={committee.id} value={committee.slug}>{committee.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  const renderViewContent = () => (
    <AnimatePresence mode="wait">
      {view === 'assignments' ? (
        <motion.div
          key={`view-assignments-${data.selectedCommittee.id}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <AssignmentPanel data={effectiveData} busy={busy} onAssign={handleAssign} />
        </motion.div>
      ) : view === 'coverage' ? (
        <motion.div
          key={`view-coverage-${data.selectedCommittee.id}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <CoveragePanel data={effectiveData} onManageAreas={() => { setView('areas'); refreshTo(null, { view: 'areas' }); }} />
        </motion.div>
      ) : (
        <motion.div
          key={`view-areas-${data.selectedCommittee.id}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="w-full"
        >
          <section className="overflow-hidden rounded-[20px] border border-border bg-white shadow-sm dark:bg-dark2" aria-label="Gestión y metas de áreas">
            {/* Top Controls: Area Selector Dropdown + Actions (Exact match to Cobertura's header) */}
            <div className="space-y-3.5 border-b border-border p-3 sm:p-5 bg-dark3/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Area Selector Dropdown */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <span className="text-xs font-bold text-text shrink-0">Área a configurar:</span>
                  <Select
                    value={selectedArea?.id || ''}
                    onValueChange={(areaId) => {
                      if (areaId) refreshTo(areaId);
                    }}
                  >
                    <SelectTrigger className="h-11 w-full rounded-lg border-border bg-dark3 text-xs font-bold text-text sm:h-9 sm:w-[260px]">
                      <SelectValue placeholder="Selecciona un área">
                        {selectedArea?.name || 'Selecciona un área'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-dark2 border-border text-text z-50">
                      {visibleAreas.map((area) => (
                        <SelectItem key={area.id} value={area.id} className="text-xs font-bold">
                          {area.name} {area.status === 'archived' ? ' · Archivada' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {selectedArea && selectedArea.status === 'active' && (
                    <>
                      <button
                        type="button"
                        onClick={() => { setShowEdit(true); setShowCreate(false); }}
                        disabled={busy}
                        className="flex h-11 flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-1.5 rounded-full border border-border bg-dark3 px-3 font-inter text-xs font-bold text-text shadow-sm transition-all hover:bg-white/10 active:scale-95 disabled:opacity-50 sm:h-8 sm:flex-none sm:basis-auto"
                      >
                        <span className="material-symbols-outlined text-[15px] text-[#4d7cfe]" aria-hidden="true">edit</span>
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleArchive}
                        disabled={busy}
                        className="flex h-11 flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-1.5 rounded-full border border-border bg-dark3 px-3 font-inter text-xs font-bold text-text-dim shadow-sm transition-all hover:bg-white/10 hover:text-text active:scale-95 disabled:opacity-50 sm:h-8 sm:flex-none sm:basis-auto"
                      >
                        <span className="material-symbols-outlined text-[15px] text-text-dim" aria-hidden="true">archive</span>
                        <span>Archivar</span>
                      </button>
                    </>
                  )}
                  {selectedArea && selectedArea.status === 'archived' && (
                    <button
                      type="button"
                      onClick={handleRestore}
                      disabled={busy}
                      className="flex h-11 flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-3 font-inter text-xs font-bold text-emerald-300 shadow-sm transition-all hover:bg-emerald-500/30 active:scale-95 disabled:opacity-50 sm:h-8 sm:flex-none sm:basis-auto"
                    >
                      <span className="material-symbols-outlined text-[15px]" aria-hidden="true">unarchive</span>
                      <span>Restaurar</span>
                    </button>
                  )}
                  {archivedCount > 0 && (
                    <label className="flex h-11 flex-1 basis-[calc(50%-0.25rem)] cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-dark3 px-3 text-xs font-bold text-text-dim transition-colors hover:text-text sm:h-9 sm:flex-none sm:basis-auto">
                      <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={(event) => {
                          const next = event.target.checked;
                          setShowArchived(next);
                          refreshTo(null, { archived: next });
                        }}
                        className="h-4 w-4 rounded border-border accent-[#4d7cfe]"
                      />
                      <span>Archivadas ({archivedCount})</span>
                    </label>
                  )}
                  <Button
                    type="button"
                    onClick={() => { setShowCreate(true); setShowEdit(false); }}
                    disabled={showCreate || busy}
                    className="btn-action h-11 flex-1 basis-[calc(50%-0.25rem)] rounded-full px-3.5 font-inter text-xs text-white shadow-sm sm:h-9 sm:flex-none sm:basis-auto"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
                    <span>Nueva área</span>
                  </Button>
                </div>
              </div>

              {selectedArea && (
                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-2 text-xs text-text-dim">
                    <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-[#4d7cfe]" aria-hidden="true">info</span>
                    <p className="max-w-[70ch] text-pretty leading-5 [overflow-wrap:anywhere]">
                      {selectedArea.description || 'Configura la meta de voluntarios requeridos por día y turno.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto sm:shrink-0 sm:justify-end">
                    <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#4d7cfe]/30 bg-[#4d7cfe]/10 px-3 text-xs font-bold text-[#4d7cfe] leading-none">
                      <span className="tabular-nums font-extrabold">{selectedArea.assignedCount}</span> asignados
                    </div>
                    <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-dark3 px-3 text-xs font-bold text-text-dim leading-none">
                      Meta <span className="tabular-nums text-text font-bold">{selectedArea.requiredTotal}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Form for Create / Edit if active */}
            {showCreate && (
              <div className="border-b border-border bg-dark3/40 p-4">
                <AreaForm
                  title="Nueva área"
                  submitLabel="Crear área"
                  pending={busy}
                  onCancel={() => setShowCreate(false)}
                  onSubmit={handleCreate}
                />
              </div>
            )}

            {showEdit && selectedArea && (
              <div className="border-b border-border bg-dark3/40 p-4">
                <AreaForm
                  key={selectedArea.id}
                  title="Editar área"
                  submitLabel="Guardar cambios"
                  initialName={selectedArea.name}
                  initialDescription={selectedArea.description || ''}
                  pending={busy}
                  onCancel={() => setShowEdit(false)}
                  onSubmit={handleUpdate}
                />
              </div>
            )}

            {/* Content: If no area exists */}
            {visibleAreas.length === 0 && !showCreate ? (
              <div className="px-5 py-12 text-center">
                <span className="material-symbols-outlined text-[36px] text-text-dim" aria-hidden="true">location_on</span>
                <h3 className="mt-3 text-base font-bold text-text">Aún no hay áreas</h3>
                <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-5 text-text-dim">Crea la primera ubicación operativa de este comité.</p>
                <Button type="button" onClick={() => setShowCreate(true)} className="btn-action mt-5 h-11 rounded-full text-white">
                  Crear primera área
                </Button>
              </div>
            ) : selectedArea?.status === 'archived' ? (
              <div className="px-5 py-12 text-center">
                <span className="material-symbols-outlined text-[34px] text-text-dim" aria-hidden="true">inventory_2</span>
                <h3 className="mt-3 text-lg font-bold text-text">Esta área está archivada</h3>
                <p className="mx-auto mt-2 max-w-[54ch] text-sm leading-6 text-text-dim">Sus asignaciones históricas se conservan. Restáurala para editar sus datos o requerimientos.</p>
              </div>
            ) : selectedArea ? (
              <>
                <AreaRequirementsEditor
                  key={selectedArea.id}
                  data={data}
                  requirements={requirements}
                  busy={busy}
                  onChange={setRequirement}
                />

                <div className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-dark2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 shadow-lg">
                  <p className="text-xs font-bold text-text-dim" aria-live="polite">
                    {isDirty ? '⚠️ Hay cambios sin guardar.' : '✓ Todos los cambios están guardados.'}
                  </p>
                  <Button
                    type="button"
                    onClick={handleSaveRequirements}
                    disabled={!isDirty || busy}
                    className="btn-action h-11 rounded-full px-5 text-white shadow-sm cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">save</span>
                    {busy ? 'Guardando…' : 'Guardar requerimientos'}
                  </Button>
                </div>
              </>
            ) : null}
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (embedded) {
    return (
      <div className="w-full">
        {renderSubNav()}
        {renderViewContent()}
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.visible}
          onClose={() => setToast((current) => ({ ...current, visible: false }))}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
        />
      </div>
    );
  }

  return (
    <main className="min-h-full bg-dark px-4 pb-28 text-text [&_[data-slot=badge]]:h-6 sm:px-6 lg:px-8 lg:pb-12">
      {/* Standalone Areas Header */}
      <header className="sticky top-0 z-40 -mx-4 mb-4 flex flex-col gap-3.5 border-b border-border bg-dark/70 px-4 pb-4 pt-6 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[24px] font-black tracking-tight text-text sm:text-3xl">Áreas</h1>

          {/* Switches in the heading */}
          <div className="relative flex shrink-0 rounded-full border border-black/5 bg-gray-200 p-1 dark:border-white/10 dark:bg-dark3" aria-label="Vista de áreas">
            {(['coverage', 'assignments', 'areas'] as AreaView[]).map((item) => {
              const selected = view === item;
              const label = item === 'coverage' ? 'Cobertura' : item === 'assignments' ? 'Asignaciones' : 'Áreas';
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setView(item);
                    refreshTo(item === 'areas' ? selectedArea?.id : null, { view: item });
                  }}
                  aria-pressed={selected}
                  className={cn(
                    'relative flex min-h-9 min-w-0 items-center justify-center rounded-full px-3 font-inter text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] sm:min-h-8 sm:px-4 cursor-pointer',
                    selected ? 'font-extrabold text-black dark:text-black' : 'text-text-dim hover:text-text'
                  )}
                >
                  {selected && (
                    <motion.div
                      layoutId="area-sub-tab-pill"
                      className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-white"
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {renderSubNav()}
      </header>

      {renderViewContent()}

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast((current) => ({ ...current, visible: false }))}
        actionLabel={toast.actionLabel}
        onAction={toast.onAction}
      />
    </main>
  );
}
