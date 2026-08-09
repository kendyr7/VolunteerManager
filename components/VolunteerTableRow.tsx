import React, { useMemo, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HighlightText } from '@/components/HighlightText';
import { realtimeDebugLogger } from '@/lib/services/realtime-debug-logger';

export const USER_TABLE_STYLES = {
  name: "font-inter font-bold text-sm text-text leading-snug group-hover:text-text-bright transition-colors",
  phone: "font-inter font-medium text-xs text-text-dim tabular-nums",
  badgeBase: "border font-inter font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full transition-all",
  statusActive: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  statusPending: "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

export const getCommitteeColor = (committee: string) => {
  if (!committee) return 'bg-dark3 text-text-dim border-border';
  const comm = committee.toLowerCase();
  if (comm.includes('seguridad')) return 'bg-[#fe4d97]/15 text-[#fe4d97] border-[#fe4d97]/20';
  if (comm.includes('guía') || comm.includes('guia')) return 'bg-[#6dd230]/15 text-[#6dd230] border-[#6dd230]/20';
  if (comm.includes('historia')) return 'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20';
  if (comm.includes('traducción') || comm.includes('traduccion')) return 'bg-amber-500/15 text-amber-500 border-amber-500/20';
  if (comm.includes('transporte')) return 'bg-purple-500/15 text-purple-500 border-purple-500/20';
  if (comm.includes('auxilios') || comm.includes('médico') || comm.includes('medico')) return 'bg-teal-500/15 text-teal-500 border-teal-500/20';

  const colors = [
    'bg-[#4d7cfe]/15 text-[#4d7cfe] border-[#4d7cfe]/20',
    'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
    'bg-rose-500/15 text-rose-400 border-rose-500/20',
    'bg-orange-500/15 text-orange-400 border-orange-500/20',
    'bg-sky-500/15 text-sky-400 border-sky-500/20'
  ];
  let hash = 0;
  for (let i = 0; i < committee.length; i++) {
    hash = committee.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

export interface VolunteerType {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  stake: string;
  ward: string;
  phone: string;
  shifts: number;
  reliability: number;
  computedReliability?: number | string;
  committee: string;
  committee_id?: string;
  status?: string;
  age?: number;
  normalizedSearchText?: string;
}

interface VolunteerTableRowProps {
  id?: string;
  vol: VolunteerType;
  appliedSearch: string;
  onEditClick: (vol: VolunteerType, startInEditMode?: boolean) => void;
  onResetPin: (vol: VolunteerType) => void;
  onArchive: (vol: VolunteerType) => void;
}

export const VolunteerTableRow = React.memo(function VolunteerTableRow({
  id,
  vol,
  appliedSearch,
  onEditClick,
  onResetPin,
  onArchive,
}: VolunteerTableRowProps) {
  const [isHighlighted, setIsHighlighted] = useState(false);

  useEffect(() => {
    const unsub = realtimeDebugLogger.subscribeHighlight((entityId) => {
      if (entityId === vol.id) {
        setIsHighlighted(true);
        const timer = setTimeout(() => setIsHighlighted(false), 1500);
        return () => clearTimeout(timer);
      }
    });
    return unsub;
  }, [vol.id]);

  const committeeColor = useMemo(() => getCommitteeColor(vol.committee), [vol.committee]);

  return (
    <div
      id={id}
      className={cn(
        "flex items-center w-full px-5 py-3.5 hover:bg-white/[0.02] border-b border-white/5 transition-all duration-300 group cursor-pointer text-sm",
        isHighlighted && "bg-amber-500/10 border-amber-500/30"
      )}
      onClick={() => onEditClick(vol)}
    >
      <div className="flex-[2.5] min-w-[200px] pr-4">
        <p className={cn(USER_TABLE_STYLES.name, "flex items-center gap-2 flex-wrap")}>
          <HighlightText text={vol.name} term={appliedSearch} />
          {isHighlighted && <span className="text-amber-400 text-xs font-mono font-bold animate-pulse">✨ REALTIME</span>}
          {vol.age != null && vol.age > 0 && vol.age < 18 && (
            <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-extrabold px-1.5 py-0">
              Menor ({vol.age}a)
            </Badge>
          )}
        </p>
      </div>
      <div className={cn("flex-[1.5] min-w-[140px] text-center font-inter font-bold text-[13px] text-text-dim shrink-0 truncate px-2 transition-all flex items-center justify-center gap-1", isHighlighted && "text-amber-300 font-extrabold")}>
        <span>{vol.ward}</span>
        {isHighlighted && <span className="text-[12px]">✨</span>}
      </div>
      <div className="flex-[1.5] min-w-[140px] text-center font-inter font-bold text-[13px] text-text-dim opacity-70 shrink-0 truncate px-2">
        {vol.stake}
      </div>
      <div className="flex-[1.8] min-w-[150px] text-center shrink-0 px-2 flex justify-center">
        <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, committeeColor, "truncate max-w-full inline-block")}>
          {vol.committee}
        </Badge>
      </div>
      <div className="w-24 text-center shrink-0">
        <Badge variant="secondary" className="bg-dark3 text-text border-none font-inter font-bold text-[10px] px-1.5 py-0.5">
          {vol.shifts} {vol.shifts === 1 ? 'turno' : 'turnos'}
        </Badge>
      </div>
      <div className="w-28 text-center shrink-0">
        {vol.computedReliability === '-' ? (
          <span className="font-inter font-bold text-sm text-text-dim">N/A</span>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${Number(vol.computedReliability || 0) >= 80 ? 'bg-accent' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]'}`} />
            <span className="font-inter font-bold text-[13px] text-text tabular-nums">{vol.computedReliability}%</span>
          </div>
        )}
      </div>
      <div className="w-28 flex items-center justify-center gap-1 shrink-0">
        <button
          type="button"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-text-dim hover:bg-white/10 hover:text-text transition-all active:scale-90 cursor-pointer"
          title="Editar Perfil"
          onClick={(e) => { e.stopPropagation(); onEditClick(vol, true); }}
        >
          <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
        <button
          type="button"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-text-dim hover:bg-white/10 hover:text-text transition-all active:scale-90 cursor-pointer"
          title="Resetear PIN"
          onClick={(e) => { e.stopPropagation(); onResetPin(vol); }}
        >
          <span className="material-symbols-outlined text-[18px]">lock_reset</span>
        </button>
        <button
          type="button"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-amber-500/70 hover:bg-amber-500/10 hover:text-amber-500 transition-all active:scale-90 cursor-pointer"
          title={vol.status === 'archived' ? 'Desarchivar' : 'Archivar'}
          onClick={(e) => {
            e.stopPropagation();
            onArchive(vol);
          }}
        >
          <span className="material-symbols-outlined text-[18px]">{vol.status === 'archived' ? 'unarchive' : 'archive'}</span>
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.vol.id === nextProps.vol.id &&
    prevProps.vol.name === nextProps.vol.name &&
    prevProps.vol.ward === nextProps.vol.ward &&
    prevProps.vol.stake === nextProps.vol.stake &&
    prevProps.vol.committee === nextProps.vol.committee &&
    prevProps.vol.shifts === nextProps.vol.shifts &&
    prevProps.vol.status === nextProps.vol.status &&
    prevProps.vol.computedReliability === nextProps.vol.computedReliability &&
    prevProps.appliedSearch === nextProps.appliedSearch
  );
});
