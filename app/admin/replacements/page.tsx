'use client'

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCommitteeColor } from "@/lib/committee-colors";
import {
  fetchPendingShiftChangeRequestsAction,
  approveShiftChangeRequestAction,
  rejectShiftChangeRequestAction
} from "@/app/actions/shift-change-actions";

export default function ReplacementsPage() {
  const [shiftRequests, setShiftRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

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
    if (reason === null) return;

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
    <div className="max-w-5xl mx-auto space-y-6 p-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Solicitudes de Cambio de Turno</h2>
          <p className="text-slate-500 text-sm mt-1">Aprueba o rechaza solicitudes enviadas por voluntarios desde WhatsApp.</p>
        </div>

        <Button size="sm" variant="outline" onClick={loadShiftRequests} disabled={loadingRequests}>
          <span className="material-symbols-outlined text-[16px] mr-1">refresh</span> Actualizar
        </Button>
      </div>

      <div className="space-y-4">
        {loadingRequests && shiftRequests.length === 0 ? (
          <Card className="border-0 shadow-sm p-8 text-center text-slate-500">
            Cargando solicitudes...
          </Card>
        ) : shiftRequests.length === 0 ? (
          <Card className="border-0 shadow-sm bg-slate-50 p-12 text-center text-slate-500 rounded-xl">
            <CardContent className="p-4 flex flex-col items-center">
              <span className="material-symbols-outlined text-[48px] text-slate-400 mb-2">published_with_changes</span>
              <p className="font-bold text-base text-slate-700">No hay solicitudes pendientes</p>
              <p className="text-xs text-slate-500 mt-1">Las solicitudes enviadas por WhatsApp aparecerán aquí en tiempo real.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {shiftRequests.map((req) => {
              const volName = `${req.volunteers?.first_name || ''} ${req.volunteers?.last_name || ''}`.trim() || 'Voluntario';
              const commName = req.volunteers?.committees?.name || 'Sin comité';
              const phone = req.volunteers?.phone || '';

              return (
                <Card key={req.id} className="border border-slate-200 shadow-sm hover:shadow-md transition-all">
                  <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-base">{volName}</h4>
                        <Badge variant="outline" className={cn("text-[11px] font-bold", getCommitteeColor(commName))}>
                          {commName}
                        </Badge>
                        <Badge className="bg-amber-100 text-amber-800 border-none text-[11px] font-bold">
                          Pendiente
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 font-mono">Tel: {phone}</p>

                      <div className="flex items-center gap-3 text-xs font-semibold mt-3 pt-2 border-t border-slate-100 text-slate-700">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Turno Actual:</span>
                          <span className="text-rose-600 font-bold">{req.current_shift_key} ({req.current_day_key})</span>
                        </div>
                        <span className="material-symbols-outlined text-slate-400">arrow_forward</span>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Turno Solicitado:</span>
                          <span className="text-emerald-600 font-bold">{req.requested_shift_key} ({req.requested_day_key})</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={processingId === req.id}
                        onClick={() => handleRejectRequest(req.id)}
                        className="text-rose-600 hover:bg-rose-50 border-rose-200 text-xs font-bold"
                      >
                        <span className="material-symbols-outlined text-[16px] mr-1">close</span> Rechazar
                      </Button>

                      <Button
                        size="sm"
                        disabled={processingId === req.id}
                        onClick={() => handleApproveRequest(req.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
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
  );
}
