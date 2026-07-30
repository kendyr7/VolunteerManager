'use client'

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { normalizeSearch } from "@/lib/utils";
import { useSearch } from "@/lib/search-context";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import {
  fetchAllShiftChangeRequestsAction,
  approveShiftChangeRequestAction,
  rejectShiftChangeRequestAction
} from "@/app/actions/shift-change-actions";

export default function ReplacementsPage() {
  const [shiftRequests, setShiftRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  // Custom Reject Modal State
  const [rejectModal, setRejectModal] = useState<{ isOpen: boolean; requestId: string | null }>({
    isOpen: false,
    requestId: null
  });

  // Search Context & Local Input State
  const { searchTerm, setSearchTerm } = useSearch();
  const [inputValue, setInputValue] = useState(searchTerm);
  const [appliedSearch, setAppliedSearch] = useState(searchTerm);

  useEffect(() => {
    setSearchTerm(appliedSearch);
  }, [appliedSearch, setSearchTerm]);

  const loadShiftRequests = async () => {
    setLoadingRequests(true);
    const res = await fetchAllShiftChangeRequestsAction();
    if (res.success && res.requests) {
      setShiftRequests(res.requests);
    }
    setLoadingRequests(false);
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

  const currentTabRequests = activeTab === 'pending' ? pendingRequestsList : historyRequestsList;

  const filteredRequests = useMemo(() => {
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
  }, [currentTabRequests, appliedSearch]);

  const handleApproveRequest = async (requestId: string) => {
    setProcessingId(requestId);
    const res = await approveShiftChangeRequestAction(requestId);
    if (res.success) {
      await loadShiftRequests();
    } else {
      alert("❌ Error aprobando solicitud: " + res.error);
    }
    setProcessingId(null);
  };

  const handleConfirmReject = async () => {
    if (!rejectModal.requestId) return;
    const requestId = rejectModal.requestId;
    setRejectModal({ isOpen: false, requestId: null });

    setProcessingId(requestId);
    const defaultReason = "limitación de disponibilidad de cupos en el turno solicitado";
    const res = await rejectShiftChangeRequestAction(requestId, defaultReason);
    if (res.success) {
      await loadShiftRequests();
    } else {
      alert("❌ Error rechazando solicitud: " + res.error);
    }
    setProcessingId(null);
  };

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
                  Gestiona y aprueba o rechaza las solicitudes de cambio de turno enviadas por los voluntarios.
                </div>
              </div>
            </div>
          </div>

          {/* Tab Selection Toggle (Pendientes vs Historial) */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center bg-dark3 p-1 rounded-full border border-border shrink-0">
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'pending'
                    ? 'bg-[#4d7cfe] text-white shadow-md'
                    : 'text-text-dim hover:text-text'
                }`}
              >
                <span>Pendientes</span>
                {pendingRequestsList.length > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                    {pendingRequestsList.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('history')}
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
              disabled={loadingRequests || undefined}
              className="bg-dark3 hover:bg-dark2 border border-border text-text rounded-full shadow-sm h-9 px-3 text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
            </Button>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="w-full relative z-10 flex items-center gap-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (appliedSearch && inputValue === appliedSearch) {
                setInputValue('');
                setAppliedSearch('');
              } else if (inputValue.trim()) {
                setAppliedSearch(inputValue.trim());
              }
            }}
            className="relative flex-1 min-w-0 flex items-center"
          >
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none z-10">
              <span className="material-symbols-outlined text-black/40 dark:text-white/70 text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder="Buscar por voluntario, comité, teléfono, turno o motivo..."
              className="w-full bg-black/5 dark:bg-[#fff6] border border-black/10 dark:border-white/10 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-white/70 rounded-full pl-12 pr-28 py-3.5 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30 transition-all text-[13px] font-bold font-inter h-[48px]"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setAppliedSearch(e.target.value);
              }}
              autoComplete="off"
            />
            {appliedSearch !== '' && (
              <div className="absolute inset-y-0 right-1.5 flex items-center z-10">
                <button
                  type="button"
                  onClick={() => {
                    setInputValue('');
                    setAppliedSearch('');
                  }}
                  className="h-9 px-3.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-full text-xs font-bold font-inter transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                  <span>Limpiar</span>
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col gap-4 md:gap-6 flex-1 px-4 sm:px-6 lg:px-8 pt-2">
        <div className="space-y-4">
          {loadingRequests && shiftRequests.length === 0 ? (
            <Card className="border border-border bg-dark2 p-8 text-center text-text-dim rounded-xl">
              Cargando solicitudes...
            </Card>
          ) : filteredRequests.length === 0 ? (
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
                    ? 'No hay solicitudes pendientes'
                    : 'No hay solicitudes en el historial'}
                </h3>
                <p className="text-xs text-text-dim max-w-md">
                  {appliedSearch
                    ? `No existen solicitudes que coincidan con "${appliedSearch}".`
                    : activeTab === 'pending'
                    ? 'Las nuevas solicitudes de cambio de turno enviadas por los voluntarios aparecerán aquí.'
                    : 'Las solicitudes que hayan sido aprobadas o rechazadas previamente aparecerán en este historial.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* DESKTOP TABLE VIEW (hidden on tablet/mobile, NO horizontal scrollbar) */}
              <div className="hidden lg:block rounded-2xl border border-border bg-dark2 shadow-sm overflow-hidden w-full">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-dark3/80 text-[11px] font-extrabold uppercase text-text-dim tracking-wider">
                      <th className="py-3.5 px-4 w-44">Voluntario</th>
                      <th className="py-3.5 px-4 w-32">Comité</th>
                      <th className="py-3.5 px-4 w-36">Turno Actual</th>
                      <th className="py-3.5 px-4 w-36">Nuevo Turno</th>
                      <th className="py-3.5 px-4">Motivo</th>
                      <th className="py-3.5 px-4 text-center w-52">Acciones / Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-medium">
                    {filteredRequests.map((req) => {
                      const volName = `${req.volunteers?.first_name || ''} ${req.volunteers?.last_name || ''}`.trim() || 'Voluntario';
                      const commName = req.volunteers?.committees?.name || 'Servicio';
                      const phone = req.volunteers?.phone || '';
                      const reviewerName = req.reviewer?.full_name || (req.reviewed_by ? 'Coordinador' : null);

                      const isPending = req.status === 'pending';
                      const isApproved = req.status === 'approved';
                      const isRejected = req.status === 'rejected';

                      return (
                        <tr key={req.id} className="hover:bg-dark3/40 transition-all">
                          {/* Voluntario */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-text text-sm">{volName}</div>
                            {phone && (
                              <div className="text-[10px] text-text-dim font-mono">{phone}</div>
                            )}
                          </td>

                          {/* Comité */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/30">
                              {commName}
                            </span>
                          </td>

                          {/* Turno Actual */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="text-rose-400 font-bold bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 text-xs">
                              {req.current_shift_key} <span className="font-normal text-text-dim text-[11px]">({req.current_day_key})</span>
                            </span>
                          </td>

                          {/* Nuevo Turno */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 text-xs">
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
                          </td>

                          {/* Acciones / Estado */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {isPending ? (
                              <div className="flex items-center justify-center gap-2 shrink-0">
                                <Button
                                  size="sm"
                                  disabled={processingId === req.id}
                                  onClick={() => setRejectModal({ isOpen: true, requestId: req.id })}
                                  className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-[11px] font-bold rounded-full h-8 px-3 active:scale-95 transition-all flex items-center gap-1 shrink-0"
                                >
                                  <span className="material-symbols-outlined text-[15px]">close</span>
                                  <span>Rechazar</span>
                                </Button>

                                <Button
                                  size="sm"
                                  disabled={processingId === req.id}
                                  onClick={() => handleApproveRequest(req.id)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold rounded-full h-8 px-3.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1 shrink-0"
                                >
                                  <span className="material-symbols-outlined text-[15px]">check</span>
                                  <span>Aprobar</span>
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  {isApproved && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                      ✓ Aprobada
                                    </span>
                                  )}
                                  {isRejected && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/30">
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
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE & TABLET OPTIMIZED CARD VIEW (shown on tablet and mobile screens) */}
              <div className="block lg:hidden space-y-3 w-full">
                {filteredRequests.map((req) => {
                  const volName = `${req.volunteers?.first_name || ''} ${req.volunteers?.last_name || ''}`.trim() || 'Voluntario';
                  const commName = req.volunteers?.committees?.name || 'Servicio';
                  const phone = req.volunteers?.phone || '';
                  const reviewerName = req.reviewer?.full_name || (req.reviewed_by ? 'Coordinador' : null);

                  const isPending = req.status === 'pending';
                  const isApproved = req.status === 'approved';
                  const isRejected = req.status === 'rejected';

                  return (
                    <div key={req.id} className="bg-dark2 border border-border rounded-xl p-3.5 space-y-2.5 shadow-sm">
                      {/* Top line: Volunteer Name, Committee Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-text text-sm leading-tight">{volName}</h4>
                          {phone && <p className="text-[10px] text-text-dim font-mono">{phone}</p>}
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/30 shrink-0">
                          {commName}
                        </span>
                      </div>

                      {/* Middle line: Shift Transition Pill Badges */}
                      <div className="flex items-center justify-between bg-dark3/60 p-2 rounded-lg border border-border/60 text-xs">
                        <div className="min-w-0">
                          <span className="text-[9px] uppercase font-bold text-text-dim block mb-0.5">Actual</span>
                          <span className="text-rose-400 font-bold">
                            {req.current_shift_key} <span className="text-[10px] text-text-dim">({req.current_day_key})</span>
                          </span>
                        </div>

                        <span className="material-symbols-outlined text-text-dim text-[16px]">arrow_forward</span>

                        <div className="text-right min-w-0">
                          <span className="text-[9px] uppercase font-bold text-text-dim block mb-0.5">Nuevo</span>
                          <span className="text-emerald-400 font-bold">
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
                      <div className="pt-2 border-t border-border/60 flex items-center justify-end gap-2">
                        {isPending ? (
                          <>
                            <Button
                              size="sm"
                              disabled={processingId === req.id}
                              onClick={() => setRejectModal({ isOpen: true, requestId: req.id })}
                              className="flex-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-[11px] font-bold rounded-full h-8 px-3 active:scale-95 transition-all flex items-center justify-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[15px]">close</span>
                              <span>Rechazar</span>
                            </Button>

                            <Button
                              size="sm"
                              disabled={processingId === req.id}
                              onClick={() => handleApproveRequest(req.id)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold rounded-full h-8 px-3.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[15px]">check</span>
                              <span>Aprobar</span>
                            </Button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            {reviewerName && (
                              <span className="text-[10px] text-text-dim font-medium mr-1">
                                Por: {reviewerName}
                              </span>
                            )}
                            {isApproved && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                ✓ Aprobada
                              </span>
                            )}
                            {isRejected && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                ✕ Rechazada
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
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
        message="¿Estás seguro de que deseas rechazar esta solicitud? Se notificará al voluntario sobre la limitación de disponibilidad de cupos."
        confirmText="Sí, Rechazar"
        type="danger"
        onConfirm={handleConfirmReject}
        onCancel={() => setRejectModal({ isOpen: false, requestId: null })}
      />
    </div>
  );
}
