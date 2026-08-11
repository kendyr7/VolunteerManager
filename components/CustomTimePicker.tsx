"use client";

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface CustomTimePickerProps {
  value: string; // "HH:MM" 24-hour format e.g. "11:00" or "15:30"
  onChange: (value24h: string) => void;
}

export function parse24hTo12h(time24: string) {
  if (!time24 || !time24.includes(':')) {
    return { hour12: '11', minute: '00', ampm: 'AM' };
  }
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) h = 11;
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  const hour12Str = h12 < 10 ? `0${h12}` : `${h12}`;
  
  let m = parseInt(mStr, 10);
  if (isNaN(m)) m = 0;
  // Round minute to nearest 5 for clean selection
  const roundedM = Math.round(m / 5) * 5;
  const finalM = roundedM >= 60 ? 55 : roundedM;
  const minuteStr = finalM < 10 ? `0${finalM}` : `${finalM}`;
  
  return { hour12: hour12Str, minute: minuteStr, ampm };
}

export function format12hTo24h(hour12: string, minute: string, ampm: string): string {
  let h = parseInt(hour12, 10);
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const hStr = h < 10 ? `0${h}` : `${h}`;
  return `${hStr}:${minute}`;
}

export function CustomTimePicker({ value, onChange }: CustomTimePickerProps) {
  const { hour12, minute, ampm } = parse24hTo12h(value);

  const handleHourChange = (newHour: string) => {
    onChange(format12hTo24h(newHour, minute, ampm));
  };

  const handleMinuteChange = (newMinute: string) => {
    onChange(format12hTo24h(hour12, newMinute, ampm));
  };

  const handleAmpmChange = (newAmpm: string) => {
    onChange(format12hTo24h(hour12, minute, newAmpm));
  };

  const hours = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-card border border-border shadow-sm">
      <span className="material-symbols-outlined text-[20px] text-[#4d7cfe] shrink-0 ml-1">schedule</span>
      
      {/* Hour Select */}
      <Select value={hour12} onValueChange={(v) => v && handleHourChange(v)}>
        <SelectTrigger className="h-10 border border-border bg-surface text-text font-extrabold flex items-center justify-between px-3 rounded-xl text-xs focus:border-[#4d7cfe] focus:ring-2 focus:ring-[#4d7cfe]/20 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-card border border-border text-text shadow-2xl z-[250] max-h-48">
          {hours.map(h => (
            <SelectItem key={h} value={h} className="font-bold text-xs text-text hover:bg-muted focus:bg-muted cursor-pointer py-2 px-3">
              {h} hrs
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-text font-black text-sm">:</span>

      {/* Minute Select */}
      <Select value={minute} onValueChange={(v) => v && handleMinuteChange(v)}>
        <SelectTrigger className="h-10 border border-border bg-surface text-text font-extrabold flex items-center justify-between px-3 rounded-xl text-xs focus:border-[#4d7cfe] focus:ring-2 focus:ring-[#4d7cfe]/20 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-card border border-border text-text shadow-2xl z-[250] max-h-48">
          {minutes.map(m => (
            <SelectItem key={m} value={m} className="font-bold text-xs text-text hover:bg-muted focus:bg-muted cursor-pointer py-2 px-3">
              {m} min
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* AM / PM Toggle */}
      <div className="flex items-center bg-surface border border-border rounded-xl p-1 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => handleAmpmChange('AM')}
          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
            ampm === 'AM' ? 'bg-[#4d7cfe] text-white shadow-sm' : 'text-text-dim hover:text-text'
          }`}
        >
          AM
        </button>
        <button
          type="button"
          onClick={() => handleAmpmChange('PM')}
          className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
            ampm === 'PM' ? 'bg-[#4d7cfe] text-white shadow-sm' : 'text-text-dim hover:text-text'
          }`}
        >
          PM
        </button>
      </div>
    </div>
  );
}
