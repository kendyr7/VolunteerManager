import React, { useMemo, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HighlightText } from '@/components/HighlightText';
import { realtimeDebugLogger } from '@/lib/services/realtime-debug-logger';
import { getCommitteeColor } from '@/lib/committee-colors';

export { getCommitteeColor } from '@/lib/committee-colors';

export const USER_TABLE_STYLES = {
  name: "font-inter font-bold text-sm text-text leading-snug group-hover:text-text-bright transition-colors",
  phone: "font-inter font-medium text-xs text-text-dim tabular-nums",
  badgeBase: "border font-inter font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full transition-all",
  statusActive: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  statusPending: "bg-amber-500/15 text-amber-400 border-amber-500/20",
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
  canEditProfile?: boolean;
  canResetPin?: boolean;
  canArchive?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (vol: VolunteerType) => void;
  canSendCredentials?: boolean;
  onSendCredentials?: (vol: VolunteerType) => void;
}

export const VolunteerTableRow = React.memo(function VolunteerTableRow({
  id,
  vol,
  appliedSearch,
  onEditClick,
  onResetPin,
  onArchive,
  canEditProfile = true,
  canResetPin = true,
  canArchive = true,
  isSelected = false,
  onToggleSelect,
  canSendCredentials = true,
  onSendCredentials,
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
        isSelected && "bg-white/[0.04]",
        isHighlighted && "bg-amber-500/10 border-amber-500/30"
      )}
      onClick={() => onEditClick(vol)}
    >
      {onToggleSelect && (
        <div 
          className="pr-3 flex items-center shrink-0" 
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(vol);
          }}
        >
          <div className={cn(
            "w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-all cursor-pointer select-none",
            isSelected 
              ? "bg-[#25D366] border-[#25D366] text-black shadow-sm" 
              : "border-slate-400 dark:border-white/30 hover:border-slate-600 dark:hover:border-white/60 bg-white dark:bg-white/[0.04]"
          )}>
            {isSelected && (
              <svg className="w-3 h-3 text-black stroke-[3.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </div>
        </div>
      )}
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
        <HighlightText text={vol.ward} term={appliedSearch} />
        {isHighlighted && <span className="text-[12px]">✨</span>}
      </div>
      <div className="flex-[1.5] min-w-[140px] text-center font-inter font-bold text-[13px] text-text-dim opacity-70 shrink-0 truncate px-2">
        <HighlightText text={vol.stake} term={appliedSearch} />
      </div>
      <div className="flex-[1.8] min-w-[150px] text-center shrink-0 px-2 flex justify-center">
        <Badge variant="outline" className={cn(USER_TABLE_STYLES.badgeBase, committeeColor, "truncate max-w-full inline-block")}>
          <HighlightText text={vol.committee} term={appliedSearch} />
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
      <div className="w-36 flex items-center justify-center gap-1 shrink-0">
        {canSendCredentials && onSendCredentials && (
          <button
            type="button"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-[#25D366]/80 hover:bg-[#25D366]/15 hover:text-[#25D366] transition-all active:scale-90 cursor-pointer"
            title="Enviar credenciales por WhatsApp (Meta)"
            onClick={(e) => { e.stopPropagation(); onSendCredentials(vol); }}
          >
            <span className="material-symbols-outlined text-[18px]">send_to_mobile</span>
          </button>
        )}
        {canEditProfile && <button
          type="button"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-text-dim hover:bg-white/10 hover:text-text transition-all active:scale-90 cursor-pointer"
          title="Editar Perfil"
          onClick={(e) => { e.stopPropagation(); onEditClick(vol, true); }}
        >
          <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>}
        {canResetPin && <button
          type="button"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-text-dim hover:bg-white/10 hover:text-text transition-all active:scale-90 cursor-pointer"
          title="Resetear PIN"
          onClick={(e) => { e.stopPropagation(); onResetPin(vol); }}
        >
          <span className="material-symbols-outlined text-[18px]">lock_reset</span>
        </button>}
        {canArchive && <button
          type="button"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-amber-500/70 hover:bg-amber-500/10 hover:text-amber-500 transition-all active:scale-90 cursor-pointer"
          title={vol.status === 'archived' ? 'Desarchivar' : 'Archivar'}
          onClick={(e) => {
            e.stopPropagation();
            onArchive(vol);
          }}
        >
          <span className="material-symbols-outlined text-[18px]">{vol.status === 'archived' ? 'unarchive' : 'archive'}</span>
        </button>}
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
    prevProps.appliedSearch === nextProps.appliedSearch &&
    prevProps.canEditProfile === nextProps.canEditProfile &&
    prevProps.canResetPin === nextProps.canResetPin &&
    prevProps.canArchive === nextProps.canArchive &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.canSendCredentials === nextProps.canSendCredentials
  );
});
