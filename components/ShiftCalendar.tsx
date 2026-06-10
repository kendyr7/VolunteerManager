'use client'

import { useMemo } from "react";
import { getActiveEventDays, SHIFT_TIMES, formatDateShort, isHoliday } from "@/lib/dates";
import { SlotCell } from "./SlotCell";

export function ShiftCalendar() {
  const days = useMemo(() => getActiveEventDays(), []);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Scrollable Container for Mobile */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 p-4 w-32 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                <span className="sr-only">Turnos</span>
              </th>
              {days.map((day, idx) => {
                const holiday = isHoliday(day);
                return (
                  <th 
                    key={idx} 
                    className="border-b border-r border-slate-200 p-4 min-w-[120px] text-center bg-slate-50 relative"
                  >
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span className="text-sm font-semibold text-slate-700 capitalize">
                        {formatDateShort(day)}
                      </span>
                      {holiday && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20 whitespace-nowrap">
                          Feriado
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {SHIFT_TIMES.map((shift, shiftIdx) => (
              <tr key={shift.id}>
                <td className="sticky left-0 z-20 bg-white border-b border-r border-slate-200 p-4 w-32 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800 text-sm">
                      {shift.name}
                    </span>
                    <span className="text-xs text-slate-500 mt-1 whitespace-nowrap">
                      {shift.time}
                    </span>
                  </div>
                </td>
                {days.map((day, dayIdx) => (
                  <td 
                    key={`${shift.id}-${dayIdx}`} 
                    className="border-b border-r border-slate-200 p-2 text-center relative group"
                  >
                    <SlotCell 
                      date={day} 
                      shiftId={shift.id} 
                      // Mocking data for demonstration
                      initialCapacity={5}
                      initialRegistered={Math.floor(Math.random() * 6)} 
                      initialIsEnrolled={Math.random() > 0.8}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
