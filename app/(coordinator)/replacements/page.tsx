'use client'

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { normalizeSearch } from "@/lib/utils";
import { useSearch } from "@/lib/search-context";
import {
  fetchPendingShiftChangeRequestsAction,
  approveShiftChangeRequestAction,
  rejectShiftChangeRequestAction
} from "@/app/actions/shift-change-actions";

export default function ReplacementsPage() {
  const [shiftRequests, setShiftRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Search Context & Local Input State
  const { searchTerm, setSearchTerm } = useSearch();
  const [inputValue, setInputValue] = useState(searchTerm);
  const [appliedSearch, setAppliedSearch] = useState(searchTerm);

  useEffect(() => {
    setSearchTerm(appliedSearch);
  }, [appliedSearch, setSearchTerm]);

  const loadShiftRequests = async () => {
    setLoadingRequests(true);
    const res = await fetchPendingShiftChangeRequestsAction();
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

  const filteredRequests = useMemo(() => {
    if (!appliedSearch.trim()) return shiftRequests;
    const searchTerms = appliedSearch.split(',').map(s => normalizeSearch(s.trim())).filter(s => s.length > 0);

    return shiftRequests.filter(req => {
      const volName = normalizeSearch(`${req.volunteers?.first_name || ''} ${req.volunteers?.last_name || ''}`);
      const commName = normalizeSearch(req.volunteers?.committees?.name || '');
      const phone = normalizeSearch(req.volunteers?.phone || '');
      const currentDay = normalizeSearch(req.current_day_key || '');
      const currentShift = normalizeSearch(req.current_shift_key || '');
      const requestedDay = normalizeSearch(req.requested_day_key || '');
      const requestedShift = normalizeSearch(req.requested_shift_key || '');

      return searchTerms.every(term =>
        volName.includes(term) ||
        commName.includes(term) ||
        phone.includes(term) ||
        currentDay.includes(term) ||
        currentShift.includes(term) ||
        requestedDay.includes(term) ||
        requestedShift.includes(term)
      );
    });
  }, [shiftRequests, appliedSearch]);

  const handleApproveRequest = async (requestId: string) => {
    setProcessingId(requestId);
    const res = await approveShiftChangeRequestAction(requestId);
    if (res.success) {
      alert("✅ Solicitud de cambio de turno APROBADA exitosamente. Se notificó al voluntario por WhatsApp.");
      await loadShiftRequests();
    } else {
      alert("❌ Error aprobando solicitud: " + res.error);
    }
    setProcessingId(null);
  };

  const handleRejectRequest = async (requestId: string) => {
    const reason = prompt("Ingresa el motivo del rechazo:", "limitación de disponibilidad de cupos en el turno solicitado");
    if (reason === null) return; // User cancelled prompt

    setProcessingId(requestId);
    const res = await rejectShiftChangeRequestAction(requestId, reason);
    if (res.success) {
      alert("Solicitud rechazada. Se notificó al voluntario por WhatsApp.");
      await loadShiftRequests();
    } else {
      alert("❌ Error rechazando solicitud: " + res.error);
    }
    setProcessingId(null);
  };

  return (
    <div className="w-full mx-auto pb-32 lg:pb-0 flex flex-col min-h-screen">
      {/* Sticky Header matching Users and Reminders pages */}
      <div className="sticky top-0 z-40 bg-dark/70 dark:bg-dark/70 backdrop-blur-xl pt-6 pb-4 px-4 sm:px-6 lg:px-8 flex flex-col gap-4">
        <div className="w-full flex items-center justify-between gap-4">
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
                  Gestiona y aprueba o rechaza las solicitudes de cambio de turno enviadas desde WhatsApp.
                </div>
              </div>
            </div>
          </div>

          <Button
            size="sm"
            onClick={loadShiftRequests}
            disabled={loadingRequests}
            className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-9 px-4 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>Actualizar</span>
          </Button>
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
              placeholder="Buscar voluntario, comité, teléfono o fecha de turno..."
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
              Cargando solicitudes de WhatsApp...
            </Card>
          ) : filteredRequests.length === 0 ? (
            <Card className="border border-border bg-dark2/60 p-12 text-center text-text-dim rounded-2xl">
              <CardContent className="p-4 flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-dark3 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[36px] text-text-dim">
                    {appliedSearch ? 'search_off' : 'published_with_changes'}
                  </span>
                </div>
                <h3 className="font-bold text-text text-lg mb-1">
                  {appliedSearch ? 'No se encontraron resultados' : 'No hay solicitudes pendientes'}
                </h3>
                <p className="text-xs text-text-dim max-w-md">
                  {appliedSearch
                    ? `No existen solicitudes de cambio que coincidan con "${appliedSearch}". Intenta con otros términos.`
                    : 'Las solicitudes de cambio de turno que envíen los voluntarios a través del bot de WhatsApp aparecerán aquí en tiempo real para ser aprobadas o rechazadas.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredRequests.map((req) => {
                const volName = `${req.volunteers?.first_name || ''} ${req.volunteers?.last_name || ''}`.trim() || 'Voluntario';
                const commName = req.volunteers?.committees?.name || 'Servicio';
                const phone = req.volunteers?.phone || '';

                return (
                  <Card key={req.id} className="border border-border bg-dark2 rounded-xl shadow-md overflow-hidden">
                    <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-text text-base">{volName}</h4>
                          <Badge className="bg-[#4d7cfe]/15 text-[#4d7cfe] border border-[#4d7cfe]/30 text-[11px] font-bold">
                            {commName}
                          </Badge>
                          <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[11px] font-bold">
                            Pendiente
                          </Badge>
                        </div>
                        <p className="text-xs text-text-dim font-mono">Tel: {phone}</p>

                        <div className="flex items-center gap-3 text-xs font-semibold mt-3 pt-3 border-t border-border text-text">
                          <div className="bg-dark3 px-3 py-1.5 rounded-md border border-border">
                            <span className="text-text-dim block text-[10px] uppercase font-bold">Turno Actual:</span>
                            <span className="text-rose-400 font-bold">{req.current_shift_key} ({req.current_day_key})</span>
                          </div>
                          <span className="material-symbols-outlined text-text-dim">arrow_forward</span>
                          <div className="bg-dark3 px-3 py-1.5 rounded-md border border-border">
                            <span className="text-text-dim block text-[10px] uppercase font-bold">Turno Solicitado:</span>
                            <span className="text-emerald-400 font-bold">{req.requested_shift_key} ({req.requested_day_key})</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full md:w-auto justify-end shrink-0 pt-2 md:pt-0">
                        <Button
                          size="sm"
                          disabled={processingId === req.id}
                          onClick={() => handleRejectRequest(req.id)}
                          className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs font-bold rounded-full h-9 px-4 active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px] mr-1">close</span> Rechazar
                        </Button>

                        <Button
                          size="sm"
                          disabled={processingId === req.id}
                          onClick={() => handleApproveRequest(req.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-full h-9 px-4 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px] mr-1">check</span> Aprobar y Notificar WA
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
