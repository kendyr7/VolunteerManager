'use client';

import React, { forwardRef } from 'react';
import { Check, Calendar, MapPin, Clock } from 'lucide-react';
import type { ShiftAreaDetails } from '@/lib/shift-area';
import { cn } from '@/lib/utils';

export interface DayScheduleItem {
  dayKey: string;
  dayLabel: string;
  dayNum: string;
  isSimulation: boolean;
  colorBg: string;
  shifts: {
    shiftKey: string;
    isActive: boolean;
    isCheckedIn: boolean;
    isCheckedOut: boolean;
    timeFormatted?: { startTime: string; endTime: string };
  }[];
  assignedAreas: { shiftKey: string; area: ShiftAreaDetails }[];
  daySessions: {
    id: string;
    status: string;
    startedAt?: string | null;
    endedAt?: string | null;
    relatedShiftKeys: string[];
  }[];
}

export interface ScheduleCaptureCardProps {
  volunteerName: string;
  committeeName?: string;
  days: DayScheduleItem[];
  formatSessionClock: (val?: string | null) => string;
  isDark?: boolean;
}

export const ScheduleCaptureCard = forwardRef<HTMLDivElement, ScheduleCaptureCardProps>(
  ({ volunteerName, committeeName, days, formatSessionClock, isDark = true }, ref) => {
    // Variables CSS exactas para renderizado 100% consistente en modo claro y oscuro
    const themeStyles: React.CSSProperties = isDark
      ? ({
          '--dark': '#050505',
          '--dark2': '#111111',
          '--dark3': '#1a1a1a',
          '--text': '#f8fafb',
          '--text-dim': '#64748b',
          '--border': '#262626',
          backgroundColor: '#050505',
          color: '#f8fafb',
          fontFamily: 'var(--font-outfit), var(--font-sans), system-ui, -apple-system, sans-serif',
          width: '640px',
          maxWidth: '640px',
          boxSizing: 'border-box',
        } as React.CSSProperties)
      : ({
          '--dark': '#f8fafb',
          '--dark2': '#ffffff',
          '--dark3': '#f2f4f6',
          '--text': '#252631',
          '--text-dim': '#778ca2',
          '--border': '#e8ecef',
          backgroundColor: '#f8fafb',
          color: '#252631',
          fontFamily: 'var(--font-outfit), var(--font-sans), system-ui, -apple-system, sans-serif',
          width: '640px',
          maxWidth: '640px',
          boxSizing: 'border-box',
        } as React.CSSProperties);

    return (
      <div
        ref={ref}
        style={themeStyles}
        className={cn(
          isDark ? 'dark' : '',
          'p-5 rounded-2xl border border-border bg-dark text-text shadow-2xl flex flex-col gap-3.5 text-left font-sans box-border overflow-hidden'
        )}
      >
        {/* Encabezado: Solo el nombre de la persona */}
        <div className="border-b border-border pb-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight text-text truncate leading-tight">
              {volunteerName}
            </h1>
            {committeeName && (
              <p className="text-xs font-semibold text-text-dim mt-0.5 truncate leading-tight">
                {committeeName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-dark2 border border-border text-text-dim text-xs font-bold shrink-0 shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-[#4d7cfe] shrink-0" />
            <span className="text-text">Cronograma</span>
          </div>
        </div>

        {/* Lista de Días del Cronograma */}
        <div className="flex flex-col gap-2.5">
          {days.map((day) => {
            return (
              <div
                key={day.dayKey}
                className="relative overflow-hidden rounded-xl border border-border bg-dark2 shadow-sm transition-all"
              >
                {/* Banda de color lateral del día */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-2 opacity-90 rounded-l-xl z-10"
                  style={{ backgroundColor: day.colorBg }}
                />

                {/* Fila principal: Fecha y Bloques de Turnos */}
                <div className="flex items-center justify-between p-3 pl-4">
                  <div className="flex items-center gap-2.5 pl-1 shrink-0">
                    <div className="flex flex-col items-center justify-center min-w-[34px]">
                      <span className="font-sans font-black text-xs uppercase tracking-widest text-text-dim leading-none">
                        {day.dayLabel}
                      </span>
                      <span className="text-base font-black text-text leading-none mt-1">
                        {day.dayNum}
                      </span>
                    </div>

                    {day.isSimulation && (
                      <>
                        <div className="h-7 w-[1px] bg-border" />
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                            Simulación
                          </span>
                          <span className="text-[10px] font-bold text-text-dim">
                            9:00 AM – 2:00 PM
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Bloques de turnos (A, B, C, D) con los mismos estilos del drawer */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {day.shifts.map((s) => {
                      let statusStyle = 'bg-dark3/50 border-border/50 text-text-dim/40';
                      let labelColor = 'text-text-dim/40';
                      let icon = <span className="text-[13px] font-bold text-text-dim/40">-</span>;

                      if (s.isCheckedOut) {
                        statusStyle = 'bg-slate-500/15 border-slate-500/30 text-slate-500 shadow-sm';
                        labelColor = 'text-slate-500 font-bold';
                        icon = <Check className="w-3.5 h-3.5 text-slate-500" strokeWidth={3} />;
                      } else if (s.isCheckedIn) {
                        statusStyle = 'bg-[#10b981]/15 border-[#10b981]/30 text-[#10b981] shadow-sm';
                        labelColor = 'text-[#10b981] font-bold';
                        icon = <Check className="w-3.5 h-3.5 text-[#10b981]" strokeWidth={3} />;
                      } else if (s.isActive) {
                        statusStyle = 'bg-[#4d7cfe]/15 border-[#4d7cfe]/35 text-[#4d7cfe] font-bold shadow-sm';
                        labelColor = 'text-[#4d7cfe] font-bold';
                        icon = <Check className="w-3.5 h-3.5 text-[#4d7cfe]" strokeWidth={3} />;
                      }

                      return (
                        <div
                          key={s.shiftKey}
                          className={cn(
                            'flex flex-col items-center justify-center w-10 sm:w-11 h-11 rounded-lg border transition-all',
                            statusStyle
                          )}
                        >
                          <div className="h-4 flex items-center justify-center">
                            {icon}
                          </div>
                          <span className={cn('text-[10px] uppercase tracking-wider mt-0.5', labelColor)}>
                            {s.shiftKey}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Horarios de asistencia reales */}
                {day.daySessions.length > 0 && (
                  <div className="ml-2 border-t border-border bg-dark3/30 px-3 py-1.5 flex flex-col gap-1">
                    {day.daySessions.map((session) => (
                      <div key={session.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-bold text-text-dim">
                        <Clock className="w-3 h-3 text-text-dim opacity-70 shrink-0" />
                        <span className={session.status === 'open' ? 'text-emerald-500 font-bold' : 'text-slate-500 font-bold'}>
                          {session.relatedShiftKeys.length > 0 ? session.relatedShiftKeys.join(' + ') : 'Asistencia'}
                        </span>
                        <span>Entrada: {formatSessionClock(session.startedAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span>Salida: {formatSessionClock(session.endedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Áreas asignadas: perfectamente contenidas con whitespace-nowrap y sin desbordamiento */}
                {day.assignedAreas.length > 0 && (
                  <div className="ml-2 border-t border-border bg-dark3/45 px-3 py-2 flex flex-wrap gap-1.5 items-center">
                    {day.assignedAreas.map(({ shiftKey, area }) => (
                      <div
                        key={shiftKey}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[#4d7cfe]/15 border border-[#4d7cfe]/30 px-3 py-1 text-[11px] font-bold text-[#4d7cfe] whitespace-nowrap leading-normal shrink-0"
                      >
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-[#4d7cfe]" />
                        <span>{shiftKey} · {area.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Leyenda de estados idéntica a la del drawer */}
        <div className="border-t border-border pt-3 flex items-center justify-between text-xs text-text-dim font-medium">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-[#4d7cfe]/15 border border-[#4d7cfe]/35 flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-[#4d7cfe]" strokeWidth={3} />
              </span>
              <span className="text-text font-medium text-xs">Programado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-emerald-500" strokeWidth={3} />
              </span>
              <span className="text-text font-medium text-xs">Asistió (Check-in)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-slate-500/15 border border-slate-500/30 flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-slate-500" strokeWidth={3} />
              </span>
              <span className="text-text font-medium text-xs">Completado (Out)</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ScheduleCaptureCard.displayName = 'ScheduleCaptureCard';
