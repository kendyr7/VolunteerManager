'use client';

import React, { useState, useEffect } from 'react';
import { realtimeDebugLogger, DebugLogItem } from '@/lib/services/realtime-debug-logger';

export function RealtimeDebugOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<DebugLogItem[]>([]);
  const [status, setStatus] = useState<string>('CONNECTING');
  const [clientId, setClientId] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Enabled in dev mode or via NEXT_PUBLIC_REALTIME_DEBUG=true
  const isDebugEnabled =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_REALTIME_DEBUG === 'true';

  useEffect(() => {
    setClientId(realtimeDebugLogger.getClientSessionId());
    const unsubLogs = realtimeDebugLogger.subscribeLogs(setLogs);
    const unsubStatus = realtimeDebugLogger.subscribeConnectionStatus(setStatus);

    return () => {
      unsubLogs();
      unsubStatus();
    };
  }, []);

  if (!isDebugEnabled) return null;

  const getStatusBadge = () => {
    switch (status) {
      case 'SUBSCRIBED':
      case 'CONNECTED':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">🟢 CONNECTED</span>;
      case 'CONNECTING':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">🟡 CONNECTING</span>;
      case 'CLOSED':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">🔴 CLOSED</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">⚠️ {status}</span>;
    }
  };

  const getStageBadge = (stage: DebugLogItem['stage']) => {
    switch (stage) {
      case 'MUTATION_START':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">MUTATION START</span>;
      case 'DB_SUCCESS':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">DB SUCCESS</span>;
      case 'DB_ERROR':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">DB ERROR</span>;
      case 'REALTIME_RECEIVED':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">REALTIME EVENT</span>;
      case 'QUEUE_FLUSH':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">QUEUE FLUSH</span>;
      case 'ZUSTAND_UPDATE':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">ZUSTAND STORE</span>;
      case 'UI_UPDATE':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">UI REACT STATE</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500/20 text-gray-300 border border-gray-500/30">{stage}</span>;
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const diff = Math.max(0, Date.now() - timestamp);
    if (diff < 1000) return `${diff}ms ago`;
    return `${(diff / 1000).toFixed(1)}s ago`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] pointer-events-none font-mono">
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="pointer-events-auto flex items-center gap-2 px-3 py-2 bg-dark2/90 hover:bg-dark2 text-text border border-amber-500/40 rounded-2xl shadow-2xl backdrop-blur-md transition-all active:scale-95 text-xs font-bold cursor-pointer"
        >
          <span className="animate-pulse text-amber-400">⚡</span>
          <span>Realtime Debug</span>
          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] rounded-md font-mono">{clientId}</span>
        </button>
      )}

      {/* Expanded Debug Panel */}
      {isOpen && (
        <div className="pointer-events-auto w-[420px] max-w-[calc(100vw-32px)] h-[520px] max-h-[calc(100vh-32px)] bg-dark2/95 text-text border border-border rounded-3xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden text-xs">
          {/* Header */}
          <div className="p-3.5 border-b border-border bg-dark3/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold">⚡ REALTIME DEBUGGER</span>
              <span className="px-1.5 py-0.5 bg-dark3 text-text-dim text-[10px] rounded border border-border font-bold">CLIENT ID: {clientId}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => realtimeDebugLogger.clearLogs()}
                className="px-2 py-1 bg-dark3 hover:bg-dark3/80 text-text-dim hover:text-text text-[10px] font-bold rounded-lg border border-border transition-colors cursor-pointer"
                title="Clear Logs"
              >
                Clear
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-text rounded-lg hover:bg-dark3 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Connection Status Bar */}
          <div className="px-3.5 py-2 bg-dark3/30 border-b border-border/60 flex items-center justify-between text-[11px] shrink-0">
            <span className="text-text-dim font-medium">WEBSOCKET STATUS:</span>
            {getStatusBadge()}
          </div>

          {/* Log Stream */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-dim space-y-2">
                <span className="material-symbols-outlined text-[32px] text-text-dim/40">sensors</span>
                <p className="font-bold text-xs">Esperando eventos en tiempo real...</p>
                <p className="text-[10px] text-text-dim/70">Realiza un cambio de barrio o turno en el navegador A para observar la traza completa.</p>
              </div>
            ) : (
              logs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                return (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl bg-dark3/70 border border-border/80 hover:border-border transition-all text-[11px] space-y-1.5"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <div className="flex items-center gap-1.5">
                        {getStageBadge(log.stage)}
                        {log.traceId && (
                          <span className="px-1 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] font-bold rounded">
                            {log.traceId}
                          </span>
                        )}
                        {log.table && (
                          <span className="text-[10px] font-bold text-text-dim">
                            {log.table}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-text-dim">{formatTimeAgo(log.timestamp)}</span>
                    </div>

                    {log.volunteerName && (
                      <div className="font-bold text-text text-[11px] flex items-center gap-1">
                        <span>👤 {log.volunteerName}</span>
                        {log.eventType && (
                          <span className="text-[10px] font-normal text-text-dim">({log.eventType})</span>
                        )}
                      </div>
                    )}

                    {log.details && (
                      <p className="text-text-dim text-[10px] leading-relaxed break-words font-sans">
                        {log.details}
                      </p>
                    )}

                    {log.latencyMs && (
                      <div className="flex items-center gap-2 text-[9px] text-emerald-400 font-mono bg-emerald-500/5 p-1 rounded border border-emerald-500/10">
                        {log.latencyMs.db && <span>DB: {log.latencyMs.db}ms</span>}
                        {log.latencyMs.realtime && <span>Realtime: {log.latencyMs.realtime}ms</span>}
                        {log.latencyMs.total && <span className="font-bold">Total: {log.latencyMs.total}ms</span>}
                      </div>
                    )}

                    {log.payload && (
                      <div>
                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="text-[9px] text-sky-400 hover:underline font-bold cursor-pointer"
                        >
                          {isExpanded ? '▼ Ocultar Payload' : '▶ Ver Payload JSON'}
                        </button>
                        {isExpanded && (
                          <pre className="mt-1 p-2 bg-dark1 border border-border rounded-lg text-[9px] text-text-dim overflow-x-auto max-h-36">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Controls */}
          <div className="p-2.5 border-t border-border bg-dark3/50 flex items-center justify-between text-[10px] text-text-dim shrink-0">
            <span>{logs.length} eventos registrados</span>
            <span>WebSocket Activo</span>
          </div>
        </div>
      )}
    </div>
  );
}
