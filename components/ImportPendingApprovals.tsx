'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toast } from '@/components/ui/toast';
import {
  getPendingImportExceptionsAction,
  resolvePendingImportExceptionAction,
} from '@/app/actions/volunteer-actions';
import { sendVolunteerCredentialsAction } from '@/app/actions/whatsapp';
import type {
  PendingImportException,
  ResolvePendingImportExceptionRequest,
} from '@/lib/services/volunteer-mutation.service';
import { SortableTableHead, TableSortDirection } from '@/components/SortableTableHead';

type Resolution = 'shared_phone' | 'corrected_phone' | 'confirmed_distinct_person' | 'rejected';
type ReviewSortField = 'imported' | 'match' | 'origin';

interface ReviewFormState {
  resolution: Resolution;
  ownerVolunteerId: string;
  reason: string;
  correctedPhone: string;
}

interface ImportPendingApprovalsProps {
  refreshKey?: number;
  onPendingCountChange?: (count: number) => void;
}

function defaultOwnerId(item: PendingImportException): string {
  const standardOwner = item.candidates.find(candidate => !candidate.isSharedPhone);
  if (standardOwner) return standardOwner.id;
  const linkedOwnerId = item.candidates.find(candidate => candidate.sharedPhoneOwnerId)?.sharedPhoneOwnerId;
  if (linkedOwnerId && item.candidates.some(candidate => candidate.id === linkedOwnerId)) return linkedOwnerId;
  return item.candidates[0]?.id || '';
}

function defaultReviewForm(item: PendingImportException): ReviewFormState {
  return {
    resolution: item.conflictType === 'name_match' ? 'confirmed_distinct_person' : 'shared_phone',
    ownerVolunteerId: defaultOwnerId(item),
    reason: '',
    correctedPhone: '',
  };
}

function formatSubmittedAt(value: string): string {
  try {
    return new Intl.DateTimeFormat('es-GT', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Guatemala',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function resolutionLabel(resolution: Resolution): string {
  switch (resolution) {
    case 'shared_phone':
      return 'Aprobar como número compartido';
    case 'corrected_phone':
      return 'Corregir número e importar';
    case 'confirmed_distinct_person':
      return 'Confirmar que es otra persona';
    case 'rejected':
      return 'Descartar esta fila';
  }
}

function decisionButtonLabel(resolution: Resolution): string {
  if (resolution === 'rejected') return 'Descartar fila';
  if (resolution === 'confirmed_distinct_person') return 'Confirmar e importar';
  return 'Aprobar e importar';
}

function isDecisionReady(form: ReviewFormState): boolean {
  if (form.resolution === 'confirmed_distinct_person') return true;
  if (form.resolution === 'shared_phone') {
    return Boolean(form.ownerVolunteerId) && form.reason.trim().length >= 3;
  }
  if (form.resolution === 'corrected_phone') {
    return form.correctedPhone.replace(/\D/g, '').length === 8;
  }
  return form.reason.trim().length >= 3;
}

interface ReviewDecisionFieldsProps {
  item: PendingImportException;
  form: ReviewFormState;
  isProcessing: boolean;
  onUpdate: (field: keyof ReviewFormState, value: string) => void;
  onResolve: () => void;
}

function ReviewDecisionFields({
  item,
  form,
  isProcessing,
  onUpdate,
  onResolve,
}: ReviewDecisionFieldsProps) {
  const selectedOwner = item.candidates.find(candidate => candidate.id === form.ownerVolunteerId);
  const isRejected = form.resolution === 'rejected';

  return (
    <div className="space-y-2.5">
      <Select
        value={form.resolution}
        onValueChange={value => onUpdate('resolution', (value || defaultReviewForm(item).resolution) as Resolution)}
      >
        <SelectTrigger
          aria-label={`Resolución para ${item.firstName} ${item.lastName}`}
          className="h-9 rounded-lg bg-dark3/60 border-border text-xs font-bold"
        >
          <SelectValue>{resolutionLabel(form.resolution)}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start">
          {item.conflictType === 'name_match' ? (
            <SelectItem value="confirmed_distinct_person">Confirmar que es otra persona</SelectItem>
          ) : (
            <>
              <SelectItem value="shared_phone">Aprobar como número compartido</SelectItem>
              <SelectItem value="corrected_phone">Corregir número e importar</SelectItem>
            </>
          )}
          <SelectItem value="rejected">Descartar esta fila</SelectItem>
        </SelectContent>
      </Select>

      {form.resolution === 'confirmed_distinct_person' ? (
        <p className="text-[11px] leading-relaxed text-text-dim">
          Se creará un perfil independiente; el perfil existente no cambiará.
        </p>
      ) : form.resolution === 'shared_phone' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
          <Select
            value={form.ownerVolunteerId}
            onValueChange={value => onUpdate('ownerVolunteerId', value || '')}
          >
            <SelectTrigger
              aria-label={`Titular del número de ${item.firstName} ${item.lastName}`}
              className="h-9 rounded-lg bg-dark3/60 border-border text-xs"
            >
              <SelectValue placeholder="Seleccionar titular">
                {selectedOwner?.name || 'Seleccionar titular'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              {item.candidates.map(candidate => (
                <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={`Razón del número compartido de ${item.firstName} ${item.lastName}`}
            value={form.reason}
            onChange={event => onUpdate('reason', event.target.value)}
            placeholder="Razón del número compartido"
            className="h-9 rounded-lg bg-dark3/60 border-border text-xs"
          />
        </div>
      ) : form.resolution === 'corrected_phone' ? (
        <Input
          aria-label={`Número corregido de ${item.firstName} ${item.lastName}`}
          inputMode="numeric"
          value={form.correctedPhone}
          onChange={event => onUpdate('correctedPhone', event.target.value)}
          placeholder="Número correcto, 8 dígitos"
          className="h-9 rounded-lg bg-dark3/60 border-border font-mono text-xs"
        />
      ) : (
        <Input
          aria-label={`Motivo para descartar a ${item.firstName} ${item.lastName}`}
          value={form.reason}
          onChange={event => onUpdate('reason', event.target.value)}
          placeholder="Motivo del descarte"
          className="h-9 rounded-lg bg-dark3/60 border-border text-xs"
        />
      )}

      <Button
        onClick={onResolve}
        disabled={isProcessing || !isDecisionReady(form)}
        className={
          isRejected
            ? 'w-full h-9 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs font-bold active:scale-[0.98]'
            : 'w-full h-9 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold active:scale-[0.98]'
        }
      >
        <span className={`material-symbols-outlined text-[16px] ${isProcessing ? 'animate-spin' : ''}`}>
          {isProcessing ? 'progress_activity' : isRejected ? 'close' : 'check'}
        </span>
        {isProcessing ? 'Procesando…' : decisionButtonLabel(form.resolution)}
      </Button>
    </div>
  );
}

export function ImportPendingApprovals({
  refreshKey = 0,
  onPendingCountChange,
}: ImportPendingApprovalsProps) {
  const [items, setItems] = useState<PendingImportException[]>([]);
  const [forms, setForms] = useState<Record<string, ReviewFormState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sortField, setSortField] = useState<ReviewSortField>('origin');
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('desc');
  const [toast, setToast] = useState({
    isVisible: false,
    type: 'success' as 'success' | 'error' | 'info',
    message: '',
  });

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ isVisible: true, type, message });
  }, []);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    const response = await getPendingImportExceptionsAction();
    if (!response.success) {
      setItems([]);
      setLoadError(response.error || 'No se pudieron cargar las aprobaciones pendientes.');
      onPendingCountChange?.(0);
      setIsLoading(false);
      return;
    }

    setItems(response.data);
    onPendingCountChange?.(response.data.length);
    setForms(previous => {
      const next = { ...previous };
      for (const item of response.data) {
        if (!next[item.id]) {
          next[item.id] = defaultReviewForm(item);
        }
      }
      return next;
    });
    setIsLoading(false);
  }, [onPendingCountChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadItems();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadItems, refreshKey]);

  const pendingSummary = useMemo(() => ({
    phoneConflicts: items.filter(item => item.conflictType === 'phone_conflict').length,
    nameMatches: items.filter(item => item.conflictType === 'name_match').length,
  }), [items]);

  const sortedDesktopItems = useMemo(() => {
    const getValue = (item: PendingImportException) => {
      switch (sortField) {
        case 'imported':
          return `${item.firstName} ${item.lastName}`.trim();
        case 'match':
          return item.candidates[0]?.name || '';
        case 'origin':
          return item.submittedAt || item.submittedByName || '';
      }
    };

    return [...items].sort((left, right) => {
      const comparison = getValue(left).localeCompare(getValue(right), 'es', {
        numeric: true,
        sensitivity: 'base',
      });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [items, sortDirection, sortField]);

  const handleSort = (field: string) => {
    const nextField = field as ReviewSortField;
    if (sortField === nextField) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortField(nextField);
    setSortDirection(nextField === 'origin' ? 'desc' : 'asc');
  };

  const updateForm = <K extends keyof ReviewFormState>(
    itemId: string,
    field: K,
    value: ReviewFormState[K]
  ) => {
    setForms(previous => ({
      ...previous,
      [itemId]: {
        ...previous[itemId],
        [field]: value,
      },
    }));
  };

  const resolveItem = async (item: PendingImportException) => {
    const form = forms[item.id];
    if (!form) return;

    let request: ResolvePendingImportExceptionRequest;
    if (form.resolution === 'confirmed_distinct_person') {
      request = {
        exceptionId: item.id,
        resolution: 'confirmed_distinct_person',
      };
    } else if (form.resolution === 'shared_phone') {
      if (!form.ownerVolunteerId) {
        notify('Selecciona quién será el titular del número.', 'error');
        return;
      }
      if (form.reason.trim().length < 3) {
        notify('Describe brevemente por qué comparten el número.', 'error');
        return;
      }
      request = {
        exceptionId: item.id,
        resolution: 'shared_phone',
        ownerVolunteerId: form.ownerVolunteerId,
        reason: form.reason.trim(),
      };
    } else if (form.resolution === 'corrected_phone') {
      request = {
        exceptionId: item.id,
        resolution: 'corrected_phone',
        correctedPhone: form.correctedPhone.trim(),
      };
    } else {
      if (form.reason.trim().length < 3) {
        notify('Indica por qué se descartará la fila.', 'error');
        return;
      }
      request = {
        exceptionId: item.id,
        resolution: 'rejected',
        reason: form.reason.trim(),
      };
    }

    setProcessingId(item.id);
    const response = await resolvePendingImportExceptionAction(request);
    if (!response.success) {
      notify(response.error || 'No se pudo procesar la solicitud.', 'error');
      setProcessingId(null);
      return;
    }

    let welcomeFailed = false;
    if (response.createdVolunteer?.sendWelcomeMessage) {
      try {
        const welcomeResult = await sendVolunteerCredentialsAction({
          volunteerId: response.createdVolunteer.id,
        });
        if (!welcomeResult.success) {
          welcomeFailed = true;
          notify('Se aprobó el perfil, pero no se pudo enviar el mensaje de bienvenida.', 'info');
        }
      } catch (error) {
        console.error('[ImportPendingApprovals] Welcome message failed:', error);
        welcomeFailed = true;
        notify('Se aprobó el perfil, pero no se pudo enviar el mensaje de bienvenida.', 'info');
      }
    }

    if (!welcomeFailed) {
      notify(
        form.resolution === 'rejected'
          ? 'La importación pendiente fue descartada.'
          : 'La importación fue aprobada y el perfil quedó creado.',
        'success'
      );
    }
    setProcessingId(null);
    await loadItems();
  };

  if (isLoading) {
    return (
      <div className="w-full space-y-3" aria-busy="true" aria-label="Cargando aprobaciones pendientes">
        {[0, 1, 2].map(index => (
          <div key={index} className="h-32 rounded-xl bg-dark3/70 border border-border/60 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(previous => ({ ...previous, isVisible: false }))}
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-bold text-amber-500">
          <span className="material-symbols-outlined text-[14px]">call</span>
          {pendingSummary.phoneConflicts} por teléfono
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4d7cfe]/25 bg-[#4d7cfe]/10 px-2.5 py-1 font-bold text-[#4d7cfe]">
          <span className="material-symbols-outlined text-[14px]">person_search</span>
          {pendingSummary.nameMatches} por nombre
        </span>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red/30 bg-red/10 p-4 text-sm text-red" role="alert">
          <p className="font-bold">No se pudo abrir la cola de aprobación</p>
          <p className="mt-1">{loadError}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="min-h-56 flex flex-col items-center justify-center text-center border border-border rounded-2xl bg-dark2/60 px-6 py-10">
          <div className="w-14 h-14 rounded-full bg-dark3 flex items-center justify-center">
            <span className="material-symbols-outlined text-[30px] text-text-dim">task_alt</span>
          </div>
          <h3 className="text-base font-bold text-text mt-3">No hay aprobaciones pendientes</h3>
          <p className="text-xs text-text-dim mt-1 max-w-md">
            Los teléfonos repetidos y los nombres que parezcan duplicados aparecerán aquí sin perder la fila del archivo.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden lg:block rounded-2xl border border-border bg-dark2 shadow-sm max-h-[calc(100dvh-260px)] overflow-auto overscroll-contain w-full">
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <thead className="sticky top-0 z-20 bg-dark3">
                <tr className="border-b border-border/80 bg-dark3/80 text-[11px] font-extrabold uppercase text-text-dim tracking-wider">
                  <SortableTableHead field="imported" activeField={sortField} direction={sortDirection} onSort={handleSort} className="py-3 px-3 w-[22%]">Persona importada</SortableTableHead>
                  <SortableTableHead field="match" activeField={sortField} direction={sortDirection} onSort={handleSort} className="py-3 px-3 w-[24%]">Coincidencia detectada</SortableTableHead>
                  <SortableTableHead field="origin" activeField={sortField} direction={sortDirection} onSort={handleSort} className="py-3 px-3 w-[20%]">Origen</SortableTableHead>
                  <th className="py-3 px-3 w-[34%]">Resolución</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 align-top">
                {sortedDesktopItems.map(item => {
                  const form = forms[item.id] || defaultReviewForm(item);
                  const isProcessing = processingId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-dark3/30 transition-colors">
                      <td className="py-3.5 px-3">
                        <div className="rounded-lg border border-[#4d7cfe]/20 bg-[#4d7cfe]/[0.07] p-2.5">
                          <p className="font-bold text-sm leading-tight text-text truncate">{item.firstName} {item.lastName}</p>
                          <p className="font-mono text-[11px] leading-tight text-text-dim mt-1">{item.phoneNormalized}</p>
                          <span className="inline-flex items-center justify-center mt-2 h-6 max-w-full rounded-full border border-[#4d7cfe]/25 bg-[#4d7cfe]/10 px-2.5 text-[10px] font-bold text-[#4d7cfe] whitespace-nowrap">
                            <span className="truncate">{item.committeeName}</span>
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.07] p-2.5">
                          <div className="space-y-1.5">
                            {item.candidates.slice(0, 2).map(candidate => (
                              <div key={candidate.id} className="min-w-0">
                                <p className="font-bold text-sm leading-tight text-text truncate">{candidate.name}</p>
                                <p className="text-[11px] leading-tight text-text-dim mt-1 truncate">{candidate.phone} · {candidate.committeeName}</p>
                              </div>
                            ))}
                            {item.candidates.length > 2 ? <p className="text-[10px] font-bold text-text-dim">+{item.candidates.length - 2} perfiles relacionados</p> : null}
                          </div>
                          <span className={`inline-flex items-center justify-center gap-1 mt-2 h-6 max-w-full rounded-full px-2.5 text-[10px] font-bold border whitespace-nowrap ${item.conflictType === 'name_match' ? 'bg-[#4d7cfe]/10 text-[#4d7cfe] border-[#4d7cfe]/25' : 'bg-amber-500/10 text-amber-500 border-amber-500/25'}`}>
                            <span className="material-symbols-outlined text-[13px]">{item.conflictType === 'name_match' ? 'person_search' : 'call'}</span>
                            {item.conflictType === 'name_match' ? 'Nombre similar' : 'Mismo teléfono'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <p className="font-bold text-sm leading-tight text-text truncate" title={item.submittedByName}>{item.submittedByName}</p>
                        <p className="text-[11px] leading-tight text-text-dim mt-1">{formatSubmittedAt(item.submittedAt)}</p>
                        <span className="inline-flex items-center justify-center mt-2 h-6 max-w-full rounded-full border border-border bg-dark3 px-2.5 text-[10px] font-bold text-text-dim whitespace-nowrap">
                          {item.submittedByRole || 'Usuario'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <ReviewDecisionFields
                          item={item}
                          form={form}
                          isProcessing={isProcessing}
                          onUpdate={(field, value) => updateForm(item.id, field, value)}
                          onResolve={() => void resolveItem(item)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="block lg:hidden space-y-3 w-full">
            {items.map(item => {
              const form = forms[item.id] || defaultReviewForm(item);
              const isProcessing = processingId === item.id;
              return (
                <article key={item.id} className="bg-dark2 border border-border rounded-xl p-3.5 space-y-3 shadow-sm">
                  <div className="min-w-0 rounded-lg border border-[#4d7cfe]/20 bg-[#4d7cfe]/[0.07] p-2.5">
                    <p className="font-bold text-sm text-text leading-snug text-wrap-pretty">{item.firstName} {item.lastName}</p>
                    <p className="font-mono text-[11px] text-text-dim mt-0.5">{item.phoneNormalized}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="inline-flex items-center justify-center h-6 max-w-full rounded-full border border-[#4d7cfe]/25 bg-[#4d7cfe]/10 px-2.5 text-[10px] font-bold text-[#4d7cfe] whitespace-nowrap">
                        <span className="truncate">{item.committeeName}</span>
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.07] p-2.5">
                    <p className="text-[9px] uppercase font-bold tracking-wider text-text-dim mb-1.5">Coincide con</p>
                    <div className="space-y-1.5">
                      {item.candidates.slice(0, 2).map(candidate => (
                        <div key={candidate.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-sm text-text truncate">{candidate.name}</span>
                          <span className="font-mono text-[11px] text-text-dim shrink-0">{candidate.phone}</span>
                        </div>
                      ))}
                    </div>
                    <span className={`inline-flex items-center justify-center gap-1 mt-2 h-6 max-w-full rounded-full px-2.5 text-[10px] font-bold border whitespace-nowrap ${item.conflictType === 'name_match' ? 'bg-[#4d7cfe]/10 text-[#4d7cfe] border-[#4d7cfe]/25' : 'bg-amber-500/10 text-amber-500 border-amber-500/25'}`}>
                      <span className="material-symbols-outlined text-[13px]">{item.conflictType === 'name_match' ? 'person_search' : 'call'}</span>
                      {item.conflictType === 'name_match' ? 'Nombre similar' : 'Mismo teléfono'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="font-bold text-sm leading-snug text-text text-wrap-pretty">{item.submittedByName}</p>
                    <p className="text-[11px] leading-tight text-text-dim">{formatSubmittedAt(item.submittedAt)}</p>
                  </div>
                  <span className="inline-flex items-center justify-center h-5 max-w-full rounded-full border border-border bg-dark3 px-2 text-[9px] font-bold text-text-dim whitespace-nowrap">
                    {item.submittedByRole || 'Usuario'}
                  </span>

                  <div className="pt-3 border-t border-border/60">
                    <ReviewDecisionFields
                      item={item}
                      form={form}
                      isProcessing={isProcessing}
                      onUpdate={(field, value) => updateForm(item.id, field, value)}
                      onResolve={() => void resolveItem(item)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
