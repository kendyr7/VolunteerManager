'use client'

import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, normalizeSearch } from "@/lib/utils";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import {
  fetchAllShiftChangeRequestsAction,
  fetchShiftChangeCoverageImpactAction,
  approveShiftChangeRequestAction,
  rejectShiftChangeRequestAction
} from "@/app/actions/shift-change-actions";
import { SortableTableHead, TableSortDirection } from "@/components/SortableTableHead";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { useDebouncedSearch } from "@/lib/use-debounced-search";
import { HighlightText } from "@/components/HighlightText";
import { useRemoveSearchParam } from "@/lib/use-remove-search-param";
import { getCommitteeColor } from "@/lib/committee-colors";
import { ShiftChangeCoverageImpactPanel } from "@/components/ShiftChangeCoverageImpact";
import type { ShiftChangeCoverageImpact } from "@/lib/shift-coverage";
import { shiftChangeResolutionMessage } from "@/lib/shift-change-presentation";

type RequestSortField = 'volunteer' | 'committee' | 'currentShift' | 'requestedShift' | 'reason';

export default function ReplacementsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requestedId = searchParams.get('requestId') || '';
  const requestedSearch = searchParams.get('search')?.trim() || '';
  const requestedTab = searchParams.get('tab') || '';
  const removeUrlSearch = useRemoveSearchParam();
  const [shiftRequests, setShiftRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; warning: boolean } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [sortField, setSortField] = useState<RequestSortField>('volunteer');
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('asc');
  const impactLoadVersion = useRef(0);
  const [impactReview, setImpactReview] = useState<{
    requestId: string | null;
    loading: boolean;
    impact?: ShiftChangeCoverageImpact;
    error?: string | null;
  }>({ requestId: null, loading: false });

  // Custom Reject Modal State
  const [rejectModal, setRejectModal] = useState<{ isOpen: boolean; requestId: string | null }>({
    isOpen: false,
    requestId: null
  });

  const { inputValue, setInputValue, appliedSearch, setAppliedSearch, applySearch } = useDebouncedSearch();

  useEffect(() => {
    if (requestedSearch) {
      setInputValue(requestedSearch);
      setAppliedSearch(requestedSearch);
    }
    if (requestedTab === 'pending' || requestedTab === 'history') {
      setActiveTab(requestedTab);
    }
  }, [requestedSearch, requestedTab, setAppliedSearch, setInputValue]);

  const loadShiftRequests = async () => {
    setLoadingRequests(true);
    try {
      const res = await fetchAllShiftChangeRequestsAction();
      if (res.success && res.requests) {
        setShiftRequests(res.requests);
        setLoadError(null);
      } else {
        setLoadError(res.error || 'No se pudieron cargar las solicitudes. Intenta nuevamente.');
      }
    } catch {
      setLoadError('No se pudieron cargar las solicitudes. Revisa tu conexión e intenta nuevamente.');
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    loadShiftRequests();
    const interval = setInterval(loadShiftRequests, 5000);
    return () => clearInterval(interval);
  }, []);

  const pendingRequestsList = useMemo(() => {
    return shiftRequests.filter(r => r.status === 'pending');
  }, [shiftRequests]);

  const historyRequestsList = useMemo(() => {
    return shiftRequests.filter(r => r.status === 'approved' || r.status === 'rejected');
  }, [shiftRequests]);

  const linkedRequestStatus = shiftRequests.find(request => request.id === requestedId)?.status;
  useEffect(() => {
    if (!requestedId || !linkedRequestStatus) return;
    const timer = setTimeout(() => setActiveTab(linkedRequestStatus === 'pending' ? 'pending' : 'history'), 0);
    return () => clearTimeout(timer);
  }, [requestedId, linkedRequestStatus]);
  const clearLinkedRequest = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('requestId');
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false });
  };

  const currentTabRequests = activeTab === 'pending' ? pendingRequestsList : historyRequestsList;

  const filteredRequests = useMemo(() => {
    if (requestedId) return shiftRequests.filter(request => request.id === requestedId);
    if (!appliedSearch.trim()) return currentTabRequests;
    const searchTerms = appliedSearch.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);

    return currentTabRequests.filter(req => {
      const volName = normalizeSearch(`${req.volunteers?.first_name || ''} ${req.volunteers?.last_name || ''}`);
      const commName = normalizeSearch(req.volunteers?.committees?.name || '');
      const phone = normalizeSearch(req.volunteers?.phone || '');
      const currentDay = normalizeSearch(req.current_day_key || '');
      const currentShift = normalizeSearch(req.current_shift_key || '');
      const requestedDay = normalizeSearch(req.requested_day_key || '');
      const requestedShift = normalizeSearch(req.requested_shift_key || '');
      const reasonText = normalizeSearch(req.reason || '');

      return searchTerms.every(term =>
        volName.includes(term) ||
        commName.includes(term) ||
        phone.includes(term) ||
        currentDay.includes(term) ||
        currentShift.includes(term) ||
        requestedDay.includes(term) ||
        requestedShift.includes(term) ||
        reasonText.includes(term)
      );
    });
  }, [currentTabRequests, appliedSearch, requestedId, shiftRequests]);

  const sortedDesktopRequests = useMemo(() => {
    const getValue = (request: any) => {
      switch (sortField) {
        case 'volunteer':
          return `${request.volunteers?.first_name || ''} ${request.volunteers?.last_name || ''}`.trim();
        case 'committee':
          return request.volunteers?.committees?.name || '';
        case 'currentShift':
          return `${request.current_day_key || ''} ${request.current_shift_key || ''}`;
        case 'requestedShift':
          return `${request.requested_day_key || ''} ${request.requested_shift_key || ''}`;
        case 'reason':
          return request.reason || '';
      }
    };

    return [...filteredRequests].sort((left, right) => {
      const comparison = getValue(left).localeCompare(getValue(right), 'es', {
        numeric: true,
        sensitivity: 'base',
      });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredRequests, sortDirection, sortField]);

  const handleSort = (field: string) => {
    const nextField = field as RequestSortField;
    if (sortField === nextField) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortField(nextField);
    setSortDirection('asc');
  };

  const handleApproveRequest = async (requestId: string) => {
    if (processingId) return;
    setProcessingId(requestId);
    setFeedback(null);
    try {
      const res = await approveShiftChangeRequestAction(requestId);
      if (res.success && res.notification) {
        impactLoadVersion.current += 1;
        setImpactReview({ requestId: null, loading: false });
        setFeedback({ message: shiftChangeResolutionMessage('approved', res.notification), warning: res.notification !== 'sent' });
      } else {
        setFeedback({ message: res.error || 'No se pudo aprobar la solicitud.', warning: true });
      }
      await loadShiftRequests();
    } catch {
      setFeedback({ message: 'No se pudo confirmar la aprobación. Actualiza las solicitudes antes de intentar nuevamente.', warning: true });
    } finally {
      setProcessingId(null);
    }
  };

  const closeImpactReview = () => {
    impactLoadVersion.current += 1;
    setImpactReview({ requestId: null, loading: false });
  };

  const handleReviewCoverage = async (requestId: string) => {
    if (impactReview.requestId === requestId) {
      closeImpactReview();
      return;
    }

    const version = impactLoadVersion.current + 1;
    impactLoadVersion.current = version;
    setImpactReview({ requestId, loading: true });
    const result = await fetchShiftChangeCoverageImpactAction(requestId);
    if (impactLoadVersion.current !== version) return;

    if (result.success) {
      setImpactReview({ requestId, loading: false, impact: result.impact });
    } else {
      setImpactReview({ requestId, loading: false, error: result.error });
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectModal.requestId || processingId) return;
    if (!rejectionReason.trim()) {
      setRejectionError('Indica el motivo del rechazo.');
      return;
    }
    const requestId = rejectModal.requestId;
    setRejectModal({ isOpen: false, requestId: null });

    setProcessingId(requestId);
    setFeedback(null);
    try {
      const res = await rejectShiftChangeRequestAction(requestId, rejectionReason.trim());
      if (res.success && res.notification) {
        impactLoadVersion.current += 1;
        setImpactReview({ requestId: null, loading: false });
        setFeedback({ message: shiftChangeResolutionMessage('rejected', res.notification), warning: res.notification !== 'sent' });
      } else {
        setFeedback({ message: res.error || 'No se pudo rechazar la solicitud.', warning: true });
      }
      await loadShiftRequests();
    } catch {
      setFeedback({ message: 'No se pudo confirmar el rechazo. Actualiza las solicitudes antes de intentar nuevamente.', warning: true });
    } finally {
      setProcessingId(null);
    }
  };

  const renderImpactReview = (requestId: string) => (
    <ShiftChangeCoverageImpactPanel
      impact={impactReview.requestId === requestId ? impactReview.impact : undefined}
      loading={impactReview.requestId === requestId && impactReview.loading}
      error={impactReview.requestId === requestId ? impactReview.error : null}
      processing={processingId === requestId}
      onApprove={() => handleApproveRequest(requestId)}
      onReject={() => {
        if (processingId) return;
        setRejectionReason('');
        setRejectionError('');
        setRejectModal({ isOpen: true, requestId });
      }}
      onClose={closeImpactReview}
    />
  );

  return (
    <div className="w-full mx-auto pb-32 lg:pb-0 flex flex-col min-h-screen">
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4">
        <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[32px] sm:text-4xl font-black text-text tracking-tight">
                Solicitudes
              </h1>
              <div className="relative group flex items-center cursor-help">
                <span className="w-5 h-5 rounded-full bg-dark3 border border-border text-text-dim text-xs font-bold flex items-center justify-center group-hover:bg-[#4d7cfe]/20 group-hover:text-[#4d7cfe] group-hover:border-[#4d7cfe]/40 transition-all">
                  ?
                </span>
                <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 hidden group-hover:flex flex-col z-50 w-64 p-2.5 bg-dark2 border border-border text-text text-xs rounded-xl shadow-2xl backdrop-blur-xl font-medium pointer-events-none">
                  Revisa las solicitudes del portal y de WhatsApp. Aprueba el cambio de turno o recházalo indicando el motivo.
                </div>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Cambios de turno solicitados desde el portal y WhatsApp.</p>
          </div>

          {/* Tab Selection Toggle (Pendientes vs Historial) */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center bg-dark3 p-1 rounded-full border border-border shrink-0">
              <button
                onClick={() => { clearLinkedRequest(); setActiveTab('pending'); }}
                className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'pending'
                    ? 'bg-[#4d7cfe] text-white shadow-md'
                    : 'text-text-dim hover:text-text'
                }`}
              >
                <span>En revisión</span>
                {pendingRequestsList.length > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                    {pendingRequestsList.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => { clearLinkedRequest(); setActiveTab('history'); }}
                className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-[#4d7cfe] text-white shadow-md'
                    : 'text-text-dim hover:text-text'
                }`}
              >
                <span>Historial</span>
                {historyRequestsList.length > 0 && (
                  <span className="bg-dark2 text-text-dim text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-border">
                    {historyRequestsList.length}
                  </span>
                )}
              </button>
            </div>

            <Button
              size="sm"
              onClick={loadShiftRequests}
              aria-label="Actualizar solicitudes"
              disabled={loadingRequests || undefined}
              className="bg-dark3 hover:bg-dark2 border border-border text-text rounded-full shadow-sm h-9 px-3 text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
            </Button>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="w-full relative z-10 flex items-center gap-2.5">
          <SmartSearchBar
            value={inputValue}
            onValueChange={setInputValue}
            onImmediateSearch={applySearch}
            onClear={removeUrlSearch}
            placeholder="Buscar por voluntario, subcomité, teléfono, turno o motivo..."
            className="flex-1"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col gap-4 md:gap-6 flex-1 px-4 sm:px-6 lg:px-8 pt-2">
        {feedback && (
          <div role="status" aria-live="polite" className={cn(
            'rounded-lg border p-4 text-sm',
            feedback.warning
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
          )}>
            {feedback.message}
          </div>
        )}
        {loadError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-800 dark:text-rose-300">{loadError}</p>}
        {requestedId && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-dark2 px-4 py-3 text-sm text-text">
          <p>{!loadingRequests && !linkedRequestStatus ? 'Esta solicitud ya no está disponible o no tienes acceso.' : 'Mostrando la solicitud de tu notificación.'}</p>
          <button type="button" onClick={clearLinkedRequest} className="min-h-11 rounded px-2 font-bold text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] dark:text-blue-200">Ver todas las solicitudes</button>
        </div>}
        <div className="space-y-4">
          {loadingRequests && shiftRequests.length === 0 ? (
            <Card className="border border-border bg-dark2 p-8 text-center text-text-dim rounded-xl">
              Cargando solicitudes...
            </Card>
          ) : loadError && shiftRequests.length === 0 ? null : filteredRequests.length === 0 ? (
            <Card className="border border-border bg-dark2/60 p-12 text-center text-text-dim rounded-2xl">
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-dark3 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[36px] text-text-dim">
                    {appliedSearch ? 'search_off' : activeTab === 'pending' ? 'published_with_changes' : 'history'}
                  </span>
                </div>
                <h3 className="font-bold text-text text-lg mb-1">
                  {appliedSearch
                    ? 'No se encontraron resultados'
                    : activeTab === 'pending'
                    ? 'No hay solicitudes en revisión'
                    : 'No hay solicitudes en el historial'}
                </h3>
                <p className="text-xs text-text-dim max-w-md">
                  {appliedSearch
                    ? `No existen solicitudes que coincidan con "${appliedSearch}".`
                    : activeTab === 'pending'
                    ? 'Las solicitudes enviadas desde el portal y WhatsApp aparecerán aquí. La lista se actualiza automáticamente.'
                    : 'Las solicitudes que hayan sido aprobadas o rechazadas previamente aparecerán en este historial.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* DESKTOP TABLE VIEW (hidden on tablet/mobile, NO horizontal scrollbar) */}
              <div className="hidden lg:block rounded-2xl border border-border bg-dark2 shadow-sm max-h-[calc(100dvh-260px)] overflow-auto overscroll-contain w-full">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-20 bg-dark3">
                    <tr className="border-b border-border/80 bg-dark3/80 text-[11px] font-extrabold uppercase text-text-dim tracking-wider">
                      <SortableTableHead field="volunteer" activeField={sortField} direction={sortDirection} onSort={handleSort} className="py-3.5 px-4 w-44">Voluntario</SortableTableHead>
                      <SortableTableHead field="committee" activeField={sortField} direction={sortDirection} onSort={handleSort} className="py-3.5 px-4 w-32">Comité</SortableTableHead>
                      <SortableTableHead field="currentShift" activeField={sortField} direction={sortDirection} onSort={handleSort} className="py-3.5 px-4 w-36">Turno original</SortableTableHead>
                      <SortableTableHead field="requestedShift" activeField={sortField} direction={sortDirection} onSort={handleSort} className="py-3.5 px-4 w-36">Turno solicitado</SortableTableHead>
                      <SortableTableHead field="reason" activeField={sortField} direction={sortDirection} onSort={handleSort} className="py-3.5 px-4">Motivo</SortableTableHead>
                      <th className="py-3.5 px-4 text-center w-52">Acciones / Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-medium">
                    {sortedDesktopRequests.map((req) => {
                      const volName = `${req.volunteers?.first_name || ''} ${req.volunteers?.last_name || ''}`.trim() || 'Voluntario';
                      const commName = req.volunteers?.committees?.name || 'Sin comité';
                      const phone = req.volunteers?.phone || '';
                      const reviewerName = req.reviewer?.full_name || (req.reviewed_by ? 'Coordinador' : null);

                      const isPending = req.status === 'pending';
                      const isApproved = req.status === 'approved';
                      const isRejected = req.status === 'rejected';

                      return (
                        <Fragment key={req.id}>
                        <tr className="hover:bg-dark3/40 transition-all">
                          {/* Voluntario */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-text text-sm"><HighlightText text={volName} term={appliedSearch} /></div>
                            {phone && (
                              <div className="text-[10px] text-text-dim font-mono">{phone}</div>
                            )}
                          </td>

                          {/* Comité */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={cn("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border", getCommitteeColor(commName))}>
                              <HighlightText text={commName} term={appliedSearch} />
                            </span>
                          </td>

                          {/* Turno Actual */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="text-rose-800 dark:text-rose-400 font-bold bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 text-xs">
                              {req.current_shift_key} <span className="font-normal text-text-dim text-[11px]">({req.current_day_key})</span>
                            </span>
                          </td>

                          {/* Nuevo Turno */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="text-emerald-800 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 text-xs">
                              {req.requested_shift_key} <span className="font-normal text-text-dim text-[11px]">({req.requested_day_key})</span>
                            </span>
                          </td>

                          {/* Motivo */}
                          <td className="py-3.5 px-4">
                            {req.reason ? (
                              <p className="text-xs text-text italic truncate max-w-xs" title={req.reason}>
                                "{req.reason}"
                              </p>
                            ) : (
                              <span className="text-text-dim text-[11px] italic">Sin motivo</span>
                            )}
                            {isRejected && req.rejection_reason && (
                              <p className="mt-2 text-xs text-rose-800 dark:text-rose-300 break-words">Motivo del rechazo: {req.rejection_reason}</p>
                            )}
                          </td>

                          {/* Acciones / Estado */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {isPending ? (
                              <div className="flex flex-col items-center justify-center gap-2 shrink-0">
                                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300">En revisión</span>
                                <Button
                                  size="sm"
                                  disabled={!!processingId}
                                  onClick={() => handleReviewCoverage(req.id)}
                                  className={cn(
                                    "border text-[11px] font-bold rounded-full h-8 px-3.5 active:scale-95 transition-all flex items-center gap-1.5 shrink-0",
                                    impactReview.requestId === req.id
                                      ? "border-[#4d7cfe]/40 bg-[#4d7cfe]/15 text-blue-800 dark:text-[#7da0ff]"
                                      : "border-border bg-dark3 text-text hover:bg-dark"
                                  )}
                                >
                                  <span className="material-symbols-outlined text-[16px]">{impactReview.requestId === req.id ? 'expand_less' : 'grid_view'}</span>
                                  <span>{impactReview.requestId === req.id ? 'Ocultar impacto' : 'Revisar cobertura'}</span>
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  {isApproved && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border border-emerald-500/30">
                                      ✓ Aprobada
                                    </span>
                                  )}
                                  {isRejected && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-800 dark:text-rose-400 border border-rose-500/30">
                                      ✕ Rechazada
                                    </span>
                                  )}
                                </div>
                                {reviewerName && (
                                  <span className="text-[10px] text-text-dim font-medium">
                                    Por: {reviewerName}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                        {isPending && impactReview.requestId === req.id && (
                          <tr className="bg-dark3/20">
                            <td colSpan={6} className="px-4 py-3">
                              {renderImpactReview(req.id)}
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE & TABLET OPTIMIZED CARD VIEW (shown on tablet and mobile screens) */}
              <div className="block lg:hidden space-y-3 w-full">
                {filteredRequests.map((req) => {
                  const volName = `${req.volunteers?.first_name || ''} ${req.volunteers?.last_name || ''}`.trim() || 'Voluntario';
                  const commName = req.volunteers?.committees?.name || 'Sin comité';
                  const phone = req.volunteers?.phone || '';
                  const reviewerName = req.reviewer?.full_name || (req.reviewed_by ? 'Coordinador' : null);

                  const isPending = req.status === 'pending';
                  const isApproved = req.status === 'approved';
                  const isRejected = req.status === 'rejected';

                  return (
                    <Fragment key={req.id}>
                    <div className="bg-dark2 border border-border rounded-xl p-3.5 space-y-2.5 shadow-sm">
                      {/* Top line: Volunteer Name, Committee Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-text text-sm leading-tight"><HighlightText text={volName} term={appliedSearch} /></h4>
                          {phone && <p className="text-[10px] text-text-dim font-mono">{phone}</p>}
                        </div>
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border shrink-0", getCommitteeColor(commName))}>
                          <HighlightText text={commName} term={appliedSearch} />
                        </span>
                      </div>

                      {/* Middle line: Shift Transition Pill Badges */}
                      <div className="flex items-center justify-between bg-dark3/60 p-2 rounded-lg border border-border/60 text-xs">
                        <div className="min-w-0">
                          <span className="text-[9px] uppercase font-bold text-text-dim block mb-0.5">Original</span>
                          <span className="text-rose-800 dark:text-rose-400 font-bold">
                            {req.current_shift_key} <span className="text-[10px] text-text-dim">({req.current_day_key})</span>
                          </span>
                        </div>

                        <span className="material-symbols-outlined text-text-dim text-[16px]">arrow_forward</span>

                        <div className="text-right min-w-0">
                          <span className="text-[9px] uppercase font-bold text-text-dim block mb-0.5">Solicitado</span>
                          <span className="text-emerald-800 dark:text-emerald-400 font-bold">
                            {req.requested_shift_key} <span className="text-[10px] text-text-dim">({req.requested_day_key})</span>
                          </span>
                        </div>
                      </div>

                      {/* Reason quote */}
                      {req.reason && (
                        <div className="text-[11px] text-text-dim italic font-medium pt-1 border-t border-border/40">
                          "{req.reason}"
                        </div>
                      )}

                      {/* Bottom line: Actions or Status */}
                      {isRejected && req.rejection_reason && (
                        <p className="text-xs text-rose-800 dark:text-rose-300 break-words">Motivo del rechazo: {req.rejection_reason}</p>
                      )}
                      {isPending && <p className="text-[10px] font-bold text-amber-800 dark:text-amber-300">En revisión</p>}
                      <div className="pt-2 border-t border-border/60 flex items-center justify-end gap-2">
                        {isPending ? (
                          <Button
                            size="sm"
                            disabled={!!processingId}
                            onClick={() => handleReviewCoverage(req.id)}
                            className={cn(
                              "w-full border text-[11px] font-bold rounded-full h-9 px-3.5 active:scale-95 transition-all flex items-center justify-center gap-1.5",
                              impactReview.requestId === req.id
                                ? "border-[#4d7cfe]/40 bg-[#4d7cfe]/15 text-blue-800 dark:text-[#7da0ff]"
                                : "border-border bg-dark3 text-text hover:bg-dark"
                            )}
                          >
                            <span className="material-symbols-outlined text-[16px]">{impactReview.requestId === req.id ? 'expand_less' : 'grid_view'}</span>
                            <span>{impactReview.requestId === req.id ? 'Ocultar impacto' : 'Revisar cobertura'}</span>
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            {reviewerName && (
                              <span className="text-[10px] text-text-dim font-medium mr-1">
                                Por: {reviewerName}
                              </span>
                            )}
                            {isApproved && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border border-emerald-500/30">
                                ✓ Aprobada
                              </span>
                            )}
                            {isRejected && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-800 dark:text-rose-400 border border-rose-500/30">
                                ✕ Rechazada
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {isPending && impactReview.requestId === req.id && renderImpactReview(req.id)}
                    </Fragment>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Styled Rejection Confirmation Modal (No browser confirm dialog) */}
      <ConfirmationModal
        isOpen={rejectModal.isOpen}
        title="¿Rechazar Solicitud de Cambio?"
        message={
          <div className="space-y-3 text-left">
            <p>El estado se actualizará en el portal y se intentará enviar el resultado por WhatsApp.</p>
            <label htmlFor="rejection-reason" className="block text-text">Motivo del rechazo</label>
            <textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={event => { setRejectionReason(event.target.value); setRejectionError(''); }}
              rows={3}
              required
              aria-invalid={!!rejectionError}
              aria-describedby={rejectionError ? 'rejection-error' : undefined}
              className="w-full rounded-lg border border-border bg-dark2 p-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-primary"
            />
            {rejectionError && <p id="rejection-error" role="alert" className="text-rose-800 dark:text-rose-300">{rejectionError}</p>}
          </div>
        }
        confirmText="Sí, Rechazar"
        type="danger"
        onConfirm={handleConfirmReject}
        onCancel={() => setRejectModal({ isOpen: false, requestId: null })}
      />
    </div>
  );
}
