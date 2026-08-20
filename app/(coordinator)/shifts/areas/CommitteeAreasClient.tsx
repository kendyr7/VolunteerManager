'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  archiveCommitteeAreaAction,
  assignVolunteerAreasAction,
  createCommitteeAreaAction,
  restoreCommitteeAreaAction,
  saveAreaRequirementsAction,
  updateCommitteeAreaAction,
} from '@/app/actions/committee-area-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toast } from '@/components/ui/toast';
import { SmartSearchBar } from '@/components/SmartSearchBar';
import { EventDayCards, EventShiftCard } from '@/components/EventDayCards';
import { ShiftSectionTabs } from '@/components/ShiftSectionTabs';
import { VolunteerProfileDrawer } from '@/components/VolunteerProfileDrawer';
import { Badge } from '@/components/ui/badge';
import type {
  AreaManagementData,
  AreaManagementItem,
} from '@/lib/services/committee-area-query.service';
import { cn } from '@/lib/utils';

type ShiftKey = 'T1' | 'T2' | 'T3' | 'T4';
type RequirementMap = Record<string, number>;
type AreaView = 'areas' | 'assignments' | 'coverage';
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

function RequirementInput({
  areaName,
  dayLabel,
  shiftKey,
  value,
  disabled,
  onChange,
}: {
  areaName: string;
  dayLabel: string;
  shiftKey: ShiftKey;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Input
      type="number"
      min={0}
      max={999}
      inputMode="numeric"
      value={value}
      disabled={disabled}
      aria-label={`Voluntarios requeridos en ${areaName}, ${dayLabel}, ${shiftKey}`}
      onChange={(event) => {
        const next = Number.parseInt(event.target.value || '0', 10);
        onChange(Math.min(999, Math.max(0, Number.isFinite(next) ? next : 0)));
      }}
      className="h-11 w-24 bg-dark2 text-center text-base font-bold tabular-nums disabled:opacity-45"
    />
  );
}

function AreaRequirementsEditor({
  data,
  areaName,
  requirements,
  busy,
  onChange,
}: {
  data: AreaManagementData;
  areaName: string;
  requirements: RequirementMap;
  busy: boolean;
  onChange: (dayKey: string, shiftKey: ShiftKey, value: number) => void;
}) {
  const firstDay = data.eventDays[0];
  const [dayKey, setDayKey] = useState(firstDay?.key || '');
  const selectedDay = data.eventDays.find((day) => day.key === dayKey) || firstDay;
  const dayTotal = (selectedDay?.shiftKeys || []).reduce(
    (total, shiftKey) => total + (requirements[requirementKey(dayKey, shiftKey)] || 0),
    0
  );

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <EventDayCards
        days={data.eventDays}
        selectedDayKey={dayKey}
        getDayCount={(key) => {
          const day = data.eventDays.find((item) => item.key === key);
          return (day?.shiftKeys || []).reduce(
            (total, shiftKey) => total + (requirements[requirementKey(key, shiftKey)] || 0),
            0
          );
        }}
        onDayChange={setDayKey}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="rounded-full border-[#4d7cfe]/25 bg-[#4d7cfe]/10 px-3 py-1 font-bold text-[#4d7cfe]">
          {selectedDay?.label} · {selectedDay?.dateLabel}
        </Badge>
        <Badge variant="outline" className="rounded-full border-border bg-dark3 px-3 py-1 font-bold text-text-dim">
          <span className="tabular-nums text-text">{dayTotal}</span> requeridos este día
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(selectedDay?.shiftKeys || []).map((shiftKey) => (
          <div key={shiftKey} className="flex min-h-20 items-center justify-between gap-3 rounded-xl border border-border bg-dark3/45 p-3">
            <div className="min-w-0">
              <strong className="block text-sm font-bold text-text">{shiftKey}</strong>
              <span className="mt-1 block text-xs text-text-dim">{selectedDay?.shiftLabels[shiftKey]}</span>
            </div>
            <RequirementInput
              areaName={areaName}
              dayLabel={`${selectedDay?.label || ''} ${selectedDay?.dateLabel || ''}`}
              shiftKey={shiftKey}
              value={requirements[requirementKey(dayKey, shiftKey)] || 0}
              disabled={busy}
              onChange={(value) => onChange(dayKey, shiftKey, value)}
            />
          </div>
        ))}
      </div>
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetAreaId, setTargetAreaId] = useState('__none__');
  const [profileVolunteerId, setProfileVolunteerId] = useState<string | null>(null);
  const [areaOverrides, setAreaOverrides] = useState<Map<string, string | null>>(new Map());
  const assignments = useMemo(
    () => data.assignments.map((assignment) => (
      areaOverrides.has(assignment.id)
        ? { ...assignment, areaId: areaOverrides.get(assignment.id) ?? null }
        : assignment
    )),
    [areaOverrides, data.assignments]
  );
  const selectedDay = data.eventDays.find((day) => day.key === dayKey) || firstDay;
  const volunteersById = useMemo(
    () => new Map(data.volunteers.map((volunteer) => [volunteer.id, volunteer])),
    [data.volunteers]
  );
  const areasById = useMemo(
    () => new Map(data.areas.map((area) => [area.id, area])),
    [data.areas]
  );
  const slotAssignments = useMemo(
    () => assignments
      .filter((assignment) => assignment.dayKey === dayKey && assignment.shiftKey === shiftKey)
      .map((assignment) => ({ ...assignment, volunteer: volunteersById.get(assignment.volunteerId) }))
      .filter((assignment) => assignment.volunteer)
      .sort((a, b) => a.volunteer!.name.localeCompare(b.volunteer!.name, 'es')),
    [assignments, dayKey, shiftKey, volunteersById]
  );
  const normalizedSearch = search.trim().toLocaleLowerCase('es');
  const visibleAssignments = slotAssignments.filter((assignment) =>
    !normalizedSearch || assignment.volunteer!.name.toLocaleLowerCase('es').includes(normalizedSearch)
  );
  const visibleIds = visibleAssignments.map((assignment) => assignment.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const activeAreas = data.areas.filter((area) => area.status === 'active');
  const validTargetAreaId = targetAreaId === '__none__' || activeAreas.some((area) => area.id === targetAreaId)
    ? targetAreaId
    : '__none__';
  const assignmentsByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of assignments) {
      counts.set(assignment.dayKey, (counts.get(assignment.dayKey) || 0) + 1);
    }
    return counts;
  }, [assignments]);
  const areaCounts = new Map<string, number>();
  let unassignedCount = 0;
  for (const assignment of slotAssignments) {
    if (assignment.areaId) areaCounts.set(assignment.areaId, (areaCounts.get(assignment.areaId) || 0) + 1);
    else unassignedCount++;
  }

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

  async function applyArea() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const nextAreaId = validTargetAreaId === '__none__' ? null : validTargetAreaId;
    const selectedShiftIds = new Set(ids);
    const previousOverrides = areaOverrides;
    setAreaOverrides((current) => {
      const next = new Map(current);
      selectedShiftIds.forEach((shiftId) => next.set(shiftId, nextAreaId));
      return next;
    });
    const success = await onAssign(ids, nextAreaId);
    if (success) setSelectedIds(new Set());
    else setAreaOverrides(previousOverrides);
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-white shadow-sm dark:bg-dark2" aria-label="Asignación de áreas">
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

        <div className="space-y-3">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-text-dim">Turnos</span>
          <div className="grid grid-cols-4 gap-2 md:flex md:flex-wrap">
            {(selectedDay?.shiftKeys || []).map((key) => {
              const count = assignments.filter((assignment) => assignment.dayKey === dayKey && assignment.shiftKey === key).length;
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

        <div className="max-w-xl">
          <SmartSearchBar
            value={search}
            onValueChange={setSearch}
            onImmediateSearch={setSearch}
            placeholder="Buscar voluntario..."
            ariaLabel="Buscar voluntario"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-dark3/45 px-4 py-3">
        <Badge variant="outline" className="rounded-full border-sky-500/25 bg-sky-500/10 px-3 py-1 font-bold text-sky-600 dark:text-sky-400">
          <span className="tabular-nums">{slotAssignments.length}</span> programados
        </Badge>
        <Badge variant="outline" className={cn('rounded-full px-3 py-1 font-bold', unassignedCount > 0 ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>
          <span className="tabular-nums">{unassignedCount}</span> sin área
        </Badge>
        {activeAreas.map((area) => (
          <Badge key={area.id} variant="outline" className="rounded-full border-[#4d7cfe]/25 bg-[#4d7cfe]/10 px-3 py-1 font-bold text-[#4d7cfe]">
            <span className="tabular-nums">{areaCounts.get(area.id) || 0}</span> {area.name}
          </Badge>
        ))}
      </div>

      {slotAssignments.length === 0 ? (
        <div className="flex min-h-[340px] flex-col items-center justify-center px-6 pb-24 pt-6 text-center md:py-6">
          <span className="material-symbols-outlined text-[36px] text-text-dim" aria-hidden="true">event_busy</span>
          <h2 className="mt-4 text-lg font-bold text-text">No hay voluntarios programados</h2>
          <p className="mt-2 text-sm text-text-dim">Selecciona otro día o turno para continuar.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold text-text">
              <input type="checkbox" checked={allVisibleSelected} onChange={selectAllVisible} className="h-5 w-5 rounded border-border accent-[#4d7cfe]" />
              Seleccionar visibles ({visibleAssignments.length})
            </label>
            <span className="text-sm tabular-nums text-text-dim">{selectedIds.size} seleccionados</span>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="w-14 px-4 py-3"><span className="sr-only">Seleccionar</span></th>
                  <th scope="col" className="px-3 py-3 font-bold text-text">Voluntario</th>
                  <th scope="col" className="w-24 px-3 py-3 text-center font-bold text-text">Edad</th>
                  <th scope="col" className="w-[320px] px-4 py-3 font-bold text-text">Área actual</th>
                </tr>
              </thead>
              <tbody>
                {visibleAssignments.map((assignment) => {
                  const area = assignment.areaId ? areasById.get(assignment.areaId) : null;
                  return (
                    <tr key={assignment.id} className={cn('border-b border-border last:border-b-0', selectedIds.has(assignment.id) && 'bg-[#4d7cfe]/10')}>
                      <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(assignment.id)} onChange={() => toggleSelection(assignment.id)} aria-label={`Seleccionar a ${assignment.volunteer!.name}`} className="h-5 w-5 rounded border-border accent-[#4d7cfe]" /></td>
                      <th scope="row" className="px-3 py-3 text-left">
                        <button
                          type="button"
                          onClick={() => setProfileVolunteerId(assignment.volunteerId)}
                          className="rounded-sm text-left font-bold text-text underline-offset-4 transition-colors hover:text-[#4d7cfe] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]"
                          aria-label={`Abrir perfil de ${assignment.volunteer!.name}`}
                        >
                          {assignment.volunteer!.name}
                        </button>
                      </th>
                      <td className="px-3 py-3 text-center font-bold tabular-nums text-text-dim">{assignment.volunteer!.age ?? '—'}</td>
                      <td className="px-4 py-3"><span className={cn('inline-flex h-6 items-center rounded-full px-2.5 py-1 text-xs font-bold', area ? 'bg-[#4d7cfe]/15 text-[#4d7cfe]' : 'bg-dark3 text-text-dim')}>{area?.name || 'Sin área'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border md:hidden">
            {visibleAssignments.map((assignment) => {
              const area = assignment.areaId ? areasById.get(assignment.areaId) : null;
              return (
                <div key={assignment.id} className={cn('flex min-h-16 items-center gap-3 px-4 py-3', selectedIds.has(assignment.id) && 'bg-[#4d7cfe]/10')}>
                  <input type="checkbox" checked={selectedIds.has(assignment.id)} onChange={() => toggleSelection(assignment.id)} aria-label={`Seleccionar a ${assignment.volunteer!.name}`} className="h-5 w-5 shrink-0 rounded border-border accent-[#4d7cfe]" />
                  <span className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        setProfileVolunteerId(assignment.volunteerId);
                      }}
                      className="block max-w-full truncate rounded-sm text-left text-sm font-bold text-text underline-offset-4 transition-colors hover:text-[#4d7cfe] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]"
                      aria-label={`Abrir perfil de ${assignment.volunteer!.name}`}
                    >
                      {assignment.volunteer!.name}
                    </button>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
                      <span>{assignment.volunteer!.age === null ? 'Edad no registrada' : `${assignment.volunteer!.age} años`}</span>
                      <span>{area?.name || 'Sin área'}</span>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {visibleAssignments.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-text-dim">No hay coincidencias para “{search}”.</div>
          )}

          <div className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-dark2 p-4 pr-16 sm:flex-row sm:items-end sm:justify-end lg:pr-4">
            <div className="w-full space-y-2 sm:max-w-[300px]">
              <label htmlFor="assignment-area" className="text-sm font-bold text-text">Asignar a</label>
              <Select value={validTargetAreaId} onValueChange={(value) => value && setTargetAreaId(value)}>
                <SelectTrigger id="assignment-area" className="h-11 rounded-full bg-dark3 px-4">
                  <SelectValue>{() => validTargetAreaId === '__none__' ? 'Sin área' : areasById.get(validTargetAreaId)?.name || 'Selecciona un área'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin área</SelectItem>
                  {activeAreas.map((area) => <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={applyArea} disabled={selectedIds.size === 0 || busy} className="btn-action h-11 rounded-full px-5 text-white">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">assignment_ind</span>
              {busy ? 'Aplicando…' : `Aplicar a ${selectedIds.size || 0}`}
            </Button>
          </div>
        </>
      )}
      <VolunteerProfileDrawer
        isOpen={Boolean(profileVolunteerId)}
        onClose={() => setProfileVolunteerId(null)}
        volunteerId={profileVolunteerId}
      />
    </section>
  );
}

function coverageCellClass(assigned: number, required: number) {
  if (required === 0) return 'border-border bg-dark3/55 text-text-dim';
  if (assigned >= required) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (assigned * 2 < required) return 'border-red/30 bg-red-faint text-red';
  return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
}

function coverageStatus(assigned: number, required: number) {
  if (required === 0) return 'Sin meta';
  if (assigned >= required) return 'Cubierto';
  if (assigned * 2 < required) return 'Crítico';
  return 'Déficit';
}

function CoveragePanel({ data, onManageAreas }: { data: AreaManagementData; onManageAreas: () => void }) {
  const firstDay = data.eventDays[0];
  const [dayKey, setDayKey] = useState(firstDay?.key || '');
  const selectedDay = data.eventDays.find((day) => day.key === dayKey) || firstDay;
  const activeAreas = data.areas.filter((area) => area.status === 'active');
  const activeAreaIds = new Set(activeAreas.map((area) => area.id));
  const requirements = new Map<string, number>();
  const assignments = new Map<string, number>();

  for (const requirement of data.requirements) {
    if (requirement.dayKey === dayKey) {
      requirements.set(`${requirement.areaId}:${requirement.shiftKey}`, requirement.requiredCount);
    }
  }
  const dayAssignments = data.assignments.filter((assignment) => assignment.dayKey === dayKey);
  for (const assignment of dayAssignments) {
    if (assignment.areaId && activeAreaIds.has(assignment.areaId)) {
      const key = `${assignment.areaId}:${assignment.shiftKey}`;
      assignments.set(key, (assignments.get(key) || 0) + 1);
    }
  }

  const reviewByShift = new Map<ShiftKey, number>();
  for (const shiftKey of selectedDay?.shiftKeys || []) {
    reviewByShift.set(
      shiftKey,
      dayAssignments.filter((assignment) => assignment.shiftKey === shiftKey && (!assignment.areaId || !activeAreaIds.has(assignment.areaId))).length
    );
  }
  const programmedTotal = dayAssignments.length;
  const reviewTotal = Array.from(reviewByShift.values()).reduce((total, count) => total + count, 0);
  const assignedTotal = programmedTotal - reviewTotal;
  const requiredTotal = activeAreas.reduce(
    (total, area) => total + (selectedDay?.shiftKeys || []).reduce(
      (areaTotal, shiftKey) => areaTotal + (requirements.get(`${area.id}:${shiftKey}`) || 0),
      0
    ),
    0
  );
  const coveredSlots = activeAreas.reduce(
    (total, area) => total + (selectedDay?.shiftKeys || []).filter((shiftKey) => {
      const required = requirements.get(`${area.id}:${shiftKey}`) || 0;
      return required > 0 && (assignments.get(`${area.id}:${shiftKey}`) || 0) >= required;
    }).length,
    0
  );
  const requiredSlots = activeAreas.reduce(
    (total, area) => total + (selectedDay?.shiftKeys || []).filter((shiftKey) => (requirements.get(`${area.id}:${shiftKey}`) || 0) > 0).length,
    0
  );

  if (activeAreas.length === 0) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-[20px] border border-border bg-white px-6 pb-24 pt-10 text-center shadow-sm dark:bg-dark2 md:py-10" aria-label="Cobertura por áreas">
        <span className="material-symbols-outlined text-[36px] text-text-dim" aria-hidden="true">grid_view</span>
        <h2 className="mt-4 text-lg font-bold text-text">Primero crea un área</h2>
        <p className="mt-2 text-sm text-text-dim">La matriz aparecerá cuando el comité tenga al menos un área activa.</p>
        <Button type="button" onClick={onManageAreas} className="btn-action mt-5 h-11 rounded-full text-white">Gestionar áreas</Button>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-white shadow-sm dark:bg-dark2" aria-label="Cobertura por áreas">
      <div className="space-y-4 border-b border-border p-4 sm:p-5">
        <EventDayCards
          days={data.eventDays}
          selectedDayKey={dayKey}
          getDayCount={(key) => data.assignments.filter((assignment) => assignment.dayKey === key).length}
          onDayChange={setDayKey}
        />

        <div className="flex flex-wrap gap-2" aria-label="Resumen de cobertura">
          <Badge variant="outline" className="rounded-full border-sky-500/25 bg-sky-500/10 px-3 py-1 font-bold text-sky-600 dark:text-sky-400"><span className="tabular-nums">{programmedTotal}</span> programados</Badge>
          <Badge variant="outline" className="rounded-full border-[#4d7cfe]/25 bg-[#4d7cfe]/10 px-3 py-1 font-bold text-[#4d7cfe]"><span className="tabular-nums">{assignedTotal}</span> con área</Badge>
          <Badge variant="outline" className={cn('rounded-full px-3 py-1 font-bold', reviewTotal > 0 ? 'border-red/25 bg-red-faint text-red' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}><span className="tabular-nums">{reviewTotal}</span> por revisar</Badge>
          <Badge variant="outline" className="rounded-full border-border bg-dark3 px-3 py-1 font-bold text-text-dim"><span className="tabular-nums text-text">{requiredTotal}</span> requeridos</Badge>
          <Badge variant="outline" className="rounded-full border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-bold text-emerald-700 dark:text-emerald-300"><span className="tabular-nums">{coveredSlots}/{requiredSlots}</span> turnos cubiertos</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border bg-dark3/45 px-4 py-3" aria-label="Leyenda de cobertura">
        <Badge variant="outline" className="rounded-full border-emerald-500/25 bg-emerald-500/10 font-bold text-emerald-700 dark:text-emerald-300">Cubierto</Badge>
        <Badge variant="outline" className="rounded-full border-amber-500/25 bg-amber-500/10 font-bold text-amber-700 dark:text-amber-300">Déficit</Badge>
        <Badge variant="outline" className="rounded-full border-red/25 bg-red-faint font-bold text-red">Crítico</Badge>
        <Badge variant="outline" className="rounded-full border-border bg-dark3 font-bold text-text-dim">Sin meta</Badge>
      </div>

      <div className="grid gap-4 bg-dark3/20 p-4 2xl:grid-cols-2">
        {activeAreas.map((area) => {
          const areaAssigned = (selectedDay?.shiftKeys || []).reduce((total, shiftKey) => total + (assignments.get(`${area.id}:${shiftKey}`) || 0), 0);
          const areaRequired = (selectedDay?.shiftKeys || []).reduce((total, shiftKey) => total + (requirements.get(`${area.id}:${shiftKey}`) || 0), 0);
          const areaStatus = coverageStatus(areaAssigned, areaRequired);
          return (
            <article key={area.id} className="rounded-xl border border-border bg-white p-4 dark:bg-dark2">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-text">{area.name}</h2>
                  <span className="mt-1 block text-xs text-text-dim">Asignados / requeridos</span>
                </div>
                <Badge variant="outline" className={cn('rounded-full px-3 py-1 font-bold', coverageCellClass(areaAssigned, areaRequired))}>
                  <span className="tabular-nums">{areaAssigned}/{areaRequired}</span> · {areaStatus}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(selectedDay?.shiftKeys || []).map((shiftKey) => {
                  const assigned = assignments.get(`${area.id}:${shiftKey}`) || 0;
                  const required = requirements.get(`${area.id}:${shiftKey}`) || 0;
                  return (
                    <div key={shiftKey} className={cn('min-w-0 rounded-lg border p-3', coverageCellClass(assigned, required))}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold">{shiftKey}</span>
                        <span className="text-[10px] font-bold">{coverageStatus(assigned, required)}</span>
                      </div>
                      <strong className="mt-2 block text-center text-lg tabular-nums">{assigned}/{required}</strong>
                      <span className="mt-1 block truncate text-center text-[10px] opacity-80">{selectedDay?.shiftLabels[shiftKey]}</span>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
      {reviewTotal > 0 && (
        <div className="border-t border-red/20 bg-red-faint p-4 text-sm font-bold text-red">{reviewTotal} asignación{reviewTotal === 1 ? '' : 'es'} sin área activa requieren revisión.</div>
      )}
    </section>
  );
}

export function CommitteeAreasClient({
  data,
  requestedAreaId,
  initiallyShowArchived,
  initialView,
}: {
  data: AreaManagementData;
  requestedAreaId: string | null;
  initiallyShowArchived: boolean;
  initialView: AreaView;
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

  const visibleAreas = useMemo(
    () => data.areas.filter((area) => showArchived || area.status === 'active'),
    [data.areas, showArchived]
  );
  const selectedArea = useMemo<AreaManagementItem | null>(() => {
    const requested = visibleAreas.find((area) => area.id === requestedAreaId);
    return requested || visibleAreas.find((area) => area.status === 'active') || visibleAreas[0] || null;
  }, [requestedAreaId, visibleAreas]);

  const isDirty = JSON.stringify(requirements) !== JSON.stringify(savedRequirements);
  const requiredTotal = Object.values(requirements).reduce((total, value) => total + value, 0);
  const activeCount = data.areas.filter((area) => area.status === 'active').length;
  const archivedCount = data.areas.length - activeCount;
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
    if (nextView !== 'areas') params.set('view', nextView);
    return `/shifts/areas?${params.toString()}`;
  }

  function refreshTo(areaId?: string | null, options?: { archived?: boolean; committeeSlug?: string; view?: AreaView }) {
    startTransition(() => {
      router.push(areaHref(areaId, options));
      router.refresh();
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
    const result = await runMutation(() => assignVolunteerAreasAction(shiftIds, areaId));
    if (!result.success) {
      showToast(result.error || 'No se pudieron actualizar las asignaciones.', 'error');
      return false;
    }
    const updatedCount = result.assignedCount ?? shiftIds.length;
    showToast(updatedCount === 0
      ? 'Los voluntarios seleccionados ya tenían esa área.'
      : `${updatedCount} asignación${updatedCount === 1 ? '' : 'es'} actualizada${updatedCount === 1 ? '' : 's'}.`
    );
    router.refresh();
    return true;
  }

  return (
    <main className="min-h-full bg-dark px-4 pb-28 text-text [&_[data-slot=badge]]:h-6 sm:px-6 lg:px-8 lg:pb-12">
      <header className="sticky top-0 z-40 -mx-4 mb-4 flex flex-col gap-4 border-b border-border bg-dark/70 px-4 pb-4 pt-6 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[32px] font-black tracking-tight text-text sm:text-4xl">Turnos</h1>
          <ShiftSectionTabs current="areas" />
        </div>
        <div className="flex items-center justify-between gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-3 rounded-full border border-black/5 bg-gray-200 p-1 dark:border-white/10 dark:bg-dark3 sm:flex sm:flex-none" aria-label="Vista de áreas">
              {(['areas', 'assignments', 'coverage'] as AreaView[]).map((item) => (
                <button key={item} type="button" onClick={() => { setView(item); refreshTo(item === 'areas' ? selectedArea?.id : null, { view: item }); }} aria-pressed={view === item} className={cn('min-h-8 min-w-0 rounded-full px-2 font-inter text-[10px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] sm:px-3.5', view === item ? 'bg-white font-extrabold text-black shadow-sm' : 'text-text-dim hover:text-text')}>
                  {item === 'areas' ? 'Áreas' : item === 'assignments' ? 'Asignaciones' : 'Cobertura'}
                </button>
              ))}
            </div>
            {view === 'areas' && (
          <Button
            type="button"
            onClick={() => { setShowCreate(true); setShowEdit(false); }}
            disabled={showCreate || busy}
            className="btn-action h-9 rounded-full px-3.5 font-inter text-xs text-white"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
            <span className="hidden sm:inline">Nueva área</span>
          </Button>
            )}
        </div>
      </header>

      <section className="mb-4 flex flex-col gap-3 rounded-[20px] border border-border bg-white p-3 shadow-sm dark:bg-dark2 sm:flex-row sm:items-center sm:justify-between" aria-label="Contexto del comité">
        <div className="flex flex-wrap items-center gap-3">
          {data.committees.length > 1 ? (
            <div className="min-w-[240px]">
              <label htmlFor="committee-area-selector" className="sr-only">Comité</label>
              <Select
                value={data.selectedCommittee.slug}
                onValueChange={(committeeSlug) => committeeSlug && refreshTo(null, { committeeSlug, archived: false })}
              >
                <SelectTrigger id="committee-area-selector" className="h-10 rounded-full bg-dark3 px-4 text-xs font-bold">
                  <SelectValue>
                    {() => data.selectedCommittee.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {data.committees.map((committee) => (
                    <SelectItem key={committee.id} value={committee.slug}>{committee.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex min-h-10 items-center gap-2 rounded-full bg-[#4d7cfe]/15 px-4 text-xs font-bold text-[#4d7cfe]">
              <span className="material-symbols-outlined text-[19px]" aria-hidden="true">groups</span>
              {data.selectedCommittee.name}
            </div>
          )}
          <Badge variant="outline" className="rounded-full border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-bold text-emerald-700 dark:text-emerald-300">
            <span className="tabular-nums">{activeCount}</span> activas
          </Badge>
          {archivedCount > 0 && (
            <Badge variant="outline" className="rounded-full border-border bg-dark3 px-3 py-1 font-bold text-text-dim">
              <span className="tabular-nums text-text">{archivedCount}</span> archivadas
            </Badge>
          )}
        </div>
        {view === 'areas' && archivedCount > 0 && (
          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-dark3 px-4 text-xs font-bold text-text">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => {
                const next = event.target.checked;
                setShowArchived(next);
                refreshTo(null, { archived: next });
              }}
              className="h-5 w-5 rounded border-border accent-[#4d7cfe]"
            />
            Mostrar archivadas
          </label>
        )}
      </section>

      {view === 'assignments' ? (
        <AssignmentPanel key={data.selectedCommittee.id} data={data} busy={busy} onAssign={handleAssign} />
      ) : view === 'coverage' ? (
        <CoveragePanel key={data.selectedCommittee.id} data={data} onManageAreas={() => { setView('areas'); refreshTo(null, { view: 'areas' }); }} />
      ) : (
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="h-full overflow-hidden rounded-[20px] border border-border bg-white shadow-sm dark:bg-dark2" aria-label="Áreas del comité">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-base font-bold text-text">Áreas</h2>
              <p className="text-sm text-text-dim">{data.selectedCommittee.name}</p>
            </div>
            <Badge variant="outline" className="rounded-full border-border bg-dark3 px-2.5 py-1 font-bold tabular-nums text-text-dim">{visibleAreas.length}</Badge>
          </div>

          {showCreate && (
            <AreaForm
              title="Nueva área"
              submitLabel="Crear área"
              pending={busy}
              onCancel={() => setShowCreate(false)}
              onSubmit={handleCreate}
            />
          )}

          {visibleAreas.length === 0 && !showCreate ? (
            <div className="px-5 py-12 text-center">
              <span className="material-symbols-outlined text-[32px] text-text-dim" aria-hidden="true">location_on</span>
              <h3 className="mt-3 text-base font-bold text-text">Aún no hay áreas</h3>
              <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-5 text-text-dim">Crea la primera ubicación operativa de este comité.</p>
              {!showCreate && (
                <Button type="button" onClick={() => setShowCreate(true)} className="btn-action mt-5 h-11 rounded-full text-white">
                  Crear primera área
                </Button>
              )}
            </div>
          ) : visibleAreas.length > 0 ? (
            <>
              <div className="p-3 lg:hidden">
                <label htmlFor="mobile-area-selector" className="sr-only">Área</label>
                <Select value={selectedArea?.id || ''} onValueChange={(areaId) => areaId && refreshTo(areaId)}>
                  <SelectTrigger id="mobile-area-selector" className="h-11 w-full rounded-full bg-dark3 px-4 text-sm font-bold">
                    <SelectValue>{() => selectedArea?.name || 'Selecciona un área'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {visibleAreas.map((area) => <SelectItem key={area.id} value={area.id}>{area.name}{area.status === 'archived' ? ' · Archivada' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden max-h-[640px] overflow-y-auto p-2 lg:block">
                {visibleAreas.map((area) => {
                  const selected = selectedArea?.id === area.id;
                  return (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => refreshTo(area.id)}
                      aria-current={selected ? 'true' : undefined}
                      className={cn(
                        'mb-1 flex min-h-[72px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]',
                        selected ? 'bg-[#4d7cfe]/15 text-text' : 'hover:bg-dark3',
                        area.status === 'archived' && 'opacity-70'
                      )}
                    >
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-[#4d7cfe] text-white' : 'bg-dark3 text-text-dim')}>
                        <span className="material-symbols-outlined text-[19px]" aria-hidden="true">location_on</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold">{area.name}</span>
                          {area.status === 'archived' && <Badge variant="outline" className="rounded-full border-border bg-dark3 px-2 py-0.5 text-[0.7rem] font-bold text-text-dim">Archivada</Badge>}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="rounded-full border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[0.68rem] font-bold text-sky-600 dark:text-sky-400"><span className="tabular-nums">{area.assignedCount}</span> asignaciones</Badge>
                          <Badge variant="outline" className="rounded-full border-border bg-dark3 px-2 py-0.5 text-[0.68rem] font-bold text-text-dim">Meta <span className="tabular-nums text-text">{area.requiredTotal}</span></Badge>
                        </span>
                      </span>
                      <span className="material-symbols-outlined text-[18px] text-text-dim" aria-hidden="true">chevron_right</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </aside>

        <section className="min-w-0 overflow-hidden rounded-[20px] border border-border bg-white shadow-sm dark:bg-dark2" aria-label="Configuración del área seleccionada">
          {!selectedArea ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
              <span className="material-symbols-outlined text-[36px] text-text-dim" aria-hidden="true">table_chart</span>
              <h2 className="mt-4 text-lg font-bold text-text">Selecciona o crea un área</h2>
              <p className="mt-2 max-w-[46ch] text-sm leading-6 text-text-dim">Aquí configurarás la cantidad requerida para cada día y turno.</p>
            </div>
          ) : showEdit ? (
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
          ) : (
            <>
              <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-bold text-text">{selectedArea.name}</h2>
                    {selectedArea.status === 'archived' && <Badge variant="outline" className="rounded-full border-border bg-dark3 px-2.5 py-1 text-xs font-bold text-text-dim">Archivada</Badge>}
                  </div>
                  <p className="mt-1 max-w-[65ch] text-sm leading-5 text-text-dim">
                    {selectedArea.description || 'Sin descripción.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline" className="rounded-full border-sky-500/25 bg-sky-500/10 px-3 py-1 font-bold text-sky-600 dark:text-sky-400"><span className="tabular-nums">{selectedArea.assignedCount}</span> asignaciones</Badge>
                    <Badge variant="outline" className="rounded-full border-border bg-dark3 px-3 py-1 font-bold text-text-dim"><span className="tabular-nums text-text">{requiredTotal}</span> requeridos</Badge>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {selectedArea.status === 'active' ? (
                    <>
                      <Button type="button" variant="outline" onClick={() => setShowEdit(true)} disabled={busy} className="h-11 rounded-full">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
                        Editar
                      </Button>
                      <Button type="button" onClick={handleArchive} disabled={busy} className="btn-cancel h-11 rounded-full border border-red/30 text-red">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">archive</span>
                        Archivar
                      </Button>
                    </>
                  ) : (
                    <Button type="button" onClick={handleRestore} disabled={busy} className="btn-action h-11 rounded-full text-white">
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">unarchive</span>
                      Restaurar
                    </Button>
                  )}
                </div>
              </div>

              {selectedArea.status === 'archived' ? (
                <div className="px-5 py-12 text-center">
                  <span className="material-symbols-outlined text-[34px] text-text-dim" aria-hidden="true">inventory_2</span>
                  <h3 className="mt-3 text-lg font-bold text-text">Esta área está archivada</h3>
                  <p className="mx-auto mt-2 max-w-[54ch] text-sm leading-6 text-text-dim">Sus asignaciones históricas se conservan. Restáurala para editar sus datos o requerimientos.</p>
                </div>
              ) : (
                <>
                  <div className="border-b border-border bg-dark3/45 px-4 py-3 sm:px-5">
                    <h3 className="text-base font-bold text-text">Cobertura requerida</h3>
                    <p className="mt-1 text-sm text-text-dim">Ingresa el mínimo de voluntarios necesarios. Usa 0 cuando no se requiera cobertura.</p>
                  </div>

                  <AreaRequirementsEditor
                    key={selectedArea.id}
                    data={data}
                    areaName={selectedArea.name}
                    requirements={requirements}
                    busy={busy}
                    onChange={setRequirement}
                  />

                  <div className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-dark2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <p className="text-sm text-text-dim" aria-live="polite">
                      {isDirty ? 'Hay cambios sin guardar.' : 'Todos los cambios están guardados.'}
                    </p>
                    <Button
                      type="button"
                      onClick={handleSaveRequirements}
                      disabled={!isDirty || busy}
                      className="btn-action h-11 rounded-full px-5 text-white"
                    >
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">save</span>
                      {busy ? 'Guardando…' : 'Guardar requerimientos'}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
      )}

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
