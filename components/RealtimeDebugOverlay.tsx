import React, { useEffect, useState } from 'react';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';

export const RealtimeDebugOverlay: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const status = useRealtimeStore((s) => s.status);
  const latencyMs = useRealtimeStore((s) => s.latencyMs);
  const lastSyncTimestamp = useRealtimeStore((s) => s.lastSyncTimestamp);
  const metrics = useRealtimeStore((s) => s.metrics);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isOpen) return null;

  const timeAgo = lastSyncTimestamp
    ? `${Math.round((Date.now() - lastSyncTimestamp) / 1000)}s atrás`
    : 'Sin sync';

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-dark3/95 border border-white/20 backdrop-blur-md rounded-2xl p-4 shadow-2xl text-xs font-mono text-text w-80">
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              status === 'connected'
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                : status === 'reconnecting'
                ? 'bg-amber-500 animate-pulse'
                : 'bg-red-500'
            }`}
          />
          <span className="font-bold uppercase tracking-wider text-[11px]">
            Realtime Telemetry (Ctrl+Shift+D)
          </span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-text-dim hover:text-text text-sm font-bold"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center bg-dark2/60 px-2.5 py-1.5 rounded-lg border border-white/5">
          <span className="text-text-dim">Estado Socket:</span>
          <span
            className={`font-bold ${
              status === 'connected' ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {status.toUpperCase()}
          </span>
        </div>

        <div className="flex justify-between items-center bg-dark2/60 px-2.5 py-1.5 rounded-lg border border-white/5">
          <span className="text-text-dim">Latencia Socket:</span>
          <span className="font-bold text-text tabular-nums">{latencyMs} ms</span>
        </div>

        <div className="flex justify-between items-center bg-dark2/60 px-2.5 py-1.5 rounded-lg border border-white/5">
          <span className="text-text-dim">Última Sync:</span>
          <span className="font-bold text-text tabular-nums">{timeAgo}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="bg-dark2/60 p-2 rounded-lg border border-white/5">
            <span className="text-[10px] text-text-dim block">Procesados</span>
            <span className="text-base font-bold text-emerald-400 tabular-nums">
              {metrics.eventsProcessed}
            </span>
          </div>

          <div className="bg-dark2/60 p-2 rounded-lg border border-white/5">
            <span className="text-[10px] text-text-dim block">Merged (Coalesced)</span>
            <span className="text-base font-bold text-purple-400 tabular-nums">
              {metrics.eventsMerged}
            </span>
          </div>

          <div className="bg-dark2/60 p-2 rounded-lg border border-white/5">
            <span className="text-[10px] text-text-dim block">Tamaño Cola</span>
            <span className="text-base font-bold text-amber-400 tabular-nums">
              {metrics.queueSize}
            </span>
          </div>

          <div className="bg-dark2/60 p-2 rounded-lg border border-white/5">
            <span className="text-[10px] text-text-dim block">Batch Time</span>
            <span className="text-base font-bold text-sky-400 tabular-nums">
              {metrics.avgBatchTimeMs} ms
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
