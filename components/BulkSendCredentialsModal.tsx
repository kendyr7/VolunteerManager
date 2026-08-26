'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { sendBulkVolunteerCredentialsAction } from '@/app/actions/whatsapp';
import { formatE164 } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';

export interface BulkVolunteerItem {
  id: string;
  name: string;
  phone: string;
  committee?: string;
  status?: string;
}

interface BulkSendCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVolunteers: BulkVolunteerItem[];
  onComplete?: (sentCount: number, failedCount: number) => void;
}

type ModalState = 'idle' | 'sending' | 'finished';

export function BulkSendCredentialsModal({
  isOpen,
  onClose,
  selectedVolunteers,
  onComplete,
}: BulkSendCredentialsModalProps) {
  const [modalState, setModalState] = useState<ModalState>('idle');
  const [forcePinReset, setForcePinReset] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultsSummary, setResultsSummary] = useState<{
    total: number;
    sentCount: number;
    failedCount: number;
    results: Array<{
      id: string;
      name: string;
      phone: string;
      success: boolean;
      error?: string;
    }>;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setModalState('idle');
      setProgress(0);
      setResultsSummary(null);
      setErrorMessage(null);
      setForcePinReset(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validPhoneCount = selectedVolunteers.filter(v => Boolean(formatE164(v.phone))).length;
  const invalidPhoneCount = selectedVolunteers.length - validPhoneCount;

  const handleStartSending = async () => {
    if (selectedVolunteers.length === 0) return;

    setModalState('sending');
    setProgress(5);
    setErrorMessage(null);

    // Simulated progress tick while backend processes batch
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.floor(Math.random() * 8) + 4;
      });
    }, 400);

    try {
      const response = await sendBulkVolunteerCredentialsAction({
        volunteerIds: selectedVolunteers.map(v => v.id),
        forcePinReset,
      });

      clearInterval(interval);
      setProgress(100);

      if (!response.success) {
        setErrorMessage(response.error || 'Ocurrió un error al procesar el envío masivo.');
        setModalState('idle');
        return;
      }

      setResultsSummary({
        total: response.total ?? selectedVolunteers.length,
        sentCount: response.sentCount ?? 0,
        failedCount: response.failedCount ?? 0,
        results: response.results ?? [],
      });
      setModalState('finished');

      if (onComplete) {
        onComplete(response.sentCount ?? 0, response.failedCount ?? 0);
      }
    } catch (err: unknown) {
      clearInterval(interval);
      setErrorMessage(err instanceof Error ? err.message : 'Error inesperado de conexión.');
      setModalState('idle');
    }
  };

  const handleRetryFailed = () => {
    if (!resultsSummary) return;
    const failedIds = new Set(resultsSummary.results.filter(r => !r.success).map(r => r.id));
    const failedVolunteers = selectedVolunteers.filter(v => failedIds.has(v.id));
    if (failedVolunteers.length === 0) return;

    setModalState('idle');
    setProgress(0);
    setResultsSummary(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="w-full max-w-lg bg-white dark:bg-[#141517] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/70 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#25D366]/15 border border-[#25D366]/25 flex items-center justify-center text-[#25D366] shadow-sm">
              <span className="material-symbols-outlined text-[22px]">mark_chat_read</span>
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                Envío Masivo de Credenciales
              </h2>
              <p className="text-xs text-slate-500 dark:text-text-dim">
                WhatsApp Cloud API · Plantilla Oficial
              </p>
            </div>
          </div>

          {modalState !== 'sending' && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:text-text-dim dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
              <p>{errorMessage}</p>
            </div>
          )}

          {/* STATE: IDLE */}
          {modalState === 'idle' && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-text-dim uppercase tracking-wider">
                    Total a enviar
                  </span>
                  <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                    {selectedVolunteers.length}
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    {validPhoneCount} con teléfono válido
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-text-dim uppercase tracking-wider">
                    Plantilla Meta
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-[#25D366] truncate">
                    finalizar_cuenta
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-text-dim">
                    PIN + enlace de acceso
                  </span>
                </div>
              </div>

              {invalidPhoneCount > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] shrink-0">warning</span>
                  <span>
                    <strong>{invalidPhoneCount}</strong> {invalidPhoneCount === 1 ? 'voluntario no tiene' : 'voluntarios no tienen'} teléfono válido y se omitirán.
                  </span>
                </div>
              )}

              {/* Reset PIN checkbox option */}
              <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors">
                <input
                  type="checkbox"
                  checked={forcePinReset}
                  onChange={e => setForcePinReset(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-2 border-slate-400 dark:border-white/30 text-accent focus:ring-accent bg-white dark:bg-dark cursor-pointer accent-[#25D366]"
                />
                <div className="text-xs">
                  <p className="font-bold text-slate-900 dark:text-text">Regenerar PIN nuevo para todos</p>
                  <p className="text-slate-500 dark:text-text-dim text-[11px]">
                    Si se desmarca, se conservará el PIN ya asignado a cada voluntario.
                  </p>
                </div>
              </label>

              {/* Preview list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-text-dim font-bold px-1">
                  <span>Destinatarios ({selectedVolunteers.length})</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {selectedVolunteers.map(vol => {
                    const hasValidPhone = Boolean(formatE164(vol.phone));
                    return (
                      <div
                        key={vol.id}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 text-xs"
                      >
                        <div className="truncate pr-2">
                          <span className="font-bold text-slate-800 dark:text-text">{vol.name}</span>
                          {vol.committee && (
                            <span className="text-[10px] text-slate-500 dark:text-text-dim ml-2 font-medium">
                              ({vol.committee})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasValidPhone ? (
                            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">{vol.phone}</span>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 py-0">
                              Sin teléfono
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STATE: SENDING */}
          {modalState === 'sending' && (
            <div className="py-8 space-y-6 text-center">
              <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-white/5 border-t-[#25D366] animate-spin" />
                <span className="material-symbols-outlined text-[32px] text-[#25D366] animate-pulse">
                  send
                </span>
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Enviando credenciales por WhatsApp...
                </h3>
                <p className="text-xs text-slate-500 dark:text-text-dim max-w-xs mx-auto">
                  Procesando {selectedVolunteers.length} mensajes con pausas reguladas para cumplir las directivas de Meta.
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2 px-4">
                <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden p-0.5 border border-slate-200 dark:border-transparent">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-[#25D366]"
                    initial={{ width: '0%' }}
                    animate={{ width: `${progress}%` }}
                    transition={{ ease: 'easeOut', duration: 0.3 }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-text-dim px-1">
                  <span>Enviando lote</span>
                  <span>{progress}%</span>
                </div>
              </div>
            </div>
          )}

          {/* STATE: FINISHED */}
          {modalState === 'finished' && resultsSummary && (
            <div className="space-y-4">
              {/* Final Metric Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    Enviados con éxito
                  </span>
                  <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {resultsSummary.sentCount}
                  </span>
                </div>

                <div className={cn(
                  "p-4 rounded-2xl border flex flex-col gap-1",
                  resultsSummary.failedCount > 0
                    ? "bg-rose-500/10 border-rose-500/20"
                    : "bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/5 opacity-60"
                )}>
                  <span className={cn(
                    "text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5",
                    resultsSummary.failedCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-text-dim"
                  )}>
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    Fallidos / Omitidos
                  </span>
                  <span className={cn(
                    "text-3xl font-black tabular-nums",
                    resultsSummary.failedCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"
                  )}>
                    {resultsSummary.failedCount}
                  </span>
                </div>
              </div>

              {/* Detailed Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-text-dim font-bold px-1">
                  <span>Detalle de envíos ({resultsSummary.results.length})</span>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {resultsSummary.results.map(res => (
                    <div
                      key={res.id}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-xl border text-xs",
                        res.success
                          ? "bg-emerald-500/5 border-emerald-500/15 text-slate-800 dark:text-text"
                          : "bg-rose-500/5 border-rose-500/15 text-rose-600 dark:text-rose-300"
                      )}
                    >
                      <div className="truncate pr-2">
                        <p className="font-bold truncate">{res.name}</p>
                        {res.error && (
                          <p className="text-[10px] text-rose-500/90 dark:text-rose-400/90 truncate">{res.error}</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        {res.success ? (
                          <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold py-0.5">
                            ✅ Enviado
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold py-0.5">
                            ❌ Falló
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] flex items-center justify-end gap-3">
          {modalState === 'idle' && (
            <>
              <Button
                variant="outline"
                onClick={onClose}
                className="h-10 px-4 rounded-xl border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-text font-bold text-xs cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleStartSending}
                disabled={selectedVolunteers.length === 0}
                className="h-10 px-5 rounded-xl bg-[#25D366] hover:bg-[#1ebd5a] text-black font-extrabold text-xs shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
                <span>Enviar a {selectedVolunteers.length} Voluntarios</span>
              </Button>
            </>
          )}

          {modalState === 'finished' && (
            <>
              {resultsSummary && resultsSummary.failedCount > 0 && (
                <Button
                  variant="outline"
                  onClick={handleRetryFailed}
                  className="h-10 px-4 rounded-xl border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 font-bold text-xs cursor-pointer mr-auto"
                >
                  Reintentar fallidos ({resultsSummary.failedCount})
                </Button>
              )}
              <Button
                onClick={onClose}
                className="h-10 px-6 rounded-xl bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-800 dark:text-white font-bold text-xs transition-all cursor-pointer"
              >
                Cerrar
              </Button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
