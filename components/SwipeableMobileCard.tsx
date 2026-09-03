import React from 'react';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import { USER_TABLE_STYLES } from '@/app/(coordinator)/users/page';
import { HighlightText } from '@/components/HighlightText';

export interface SwipeableMobileCardProps {
  id?: string;
  name: string;
  phone: string;
  searchTerm: string;
  badges: React.ReactNode;
  
  onEdit: () => void;
  
  onSwipeRight: () => void;
  swipeRightIcon: string;
  swipeRightText: string;
  swipeRightColorClass: string;
  swipeRightBgColor: string;
  
  onSwipeLeft: () => void;
  swipeLeftIcon: string;
  swipeLeftText: string;
  swipeLeftColorClass: string;
  swipeLeftBgColor: string;
  
  isSelected?: boolean;
  onToggleSelect?: () => void;
  selectionModeActive?: boolean;
}

export const SwipeableMobileCard: React.FC<SwipeableMobileCardProps> = React.memo(({
  id,
  name,
  phone,
  searchTerm,
  badges,
  onEdit,
  onSwipeRight,
  swipeRightIcon,
  swipeRightText,
  swipeRightColorClass,
  swipeRightBgColor,
  onSwipeLeft,
  swipeLeftIcon,
  swipeLeftText,
  swipeLeftColorClass,
  swipeLeftBgColor,
  isSelected = false,
  onToggleSelect,
  selectionModeActive = false,
}) => {
  const x = useMotionValue(0);
  const pressTimer = React.useRef<NodeJS.Timeout | null>(null);
  
  const background = useTransform(
    x,
    [-150, 0, 150],
    [swipeLeftBgColor, "rgba(0, 0, 0, 0)", swipeRightBgColor]
  );

  const opacityLeft = useTransform(x, [-100, -10, 0], [1, 0, 0]);
  const opacityRight = useTransform(x, [0, 10, 100], [0, 0, 1]);

  const scaleLeft = useTransform(x, [-100, -20], [1, 0.8]);
  const scaleRight = useTransform(x, [20, 100], [0.8, 1]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // If we are in selection mode, disable swipes
    if (selectionModeActive) return;

    const swipeThreshold = 80;
    if (info.offset.x > swipeThreshold) {
      onSwipeRight();
    } else if (info.offset.x < -swipeThreshold) {
      onSwipeLeft();
    }
  };

  const handleCardClick = () => {
    // If we just finished a long press and enter selection mode, this click might trigger.
    // However, the long-press already activated it. We should just toggle normally if we are in selection mode.
    if (selectionModeActive && onToggleSelect) {
      onToggleSelect();
    } else {
      onEdit();
    }
  };

  const startPress = () => {
    if (selectionModeActive) return;
    pressTimer.current = setTimeout(() => {
      if (onToggleSelect) {
        onToggleSelect();
      }
    }, 500); // 500ms for long press
  };

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  return (
    <div id={id} className={cn("relative overflow-hidden w-full bg-dark2 select-none border-b border-white/5", isSelected && "bg-[#4d7cfe]/5")}>
      <motion.div 
        style={{ background }}
        className="absolute inset-0 flex items-center justify-between px-5 pointer-events-none"
      >
        <motion.div 
          style={{ opacity: opacityRight, scale: scaleRight }}
          className={cn("flex items-center gap-1.5 font-bold text-[10px] font-inter uppercase tracking-wider", swipeRightColorClass)}
        >
          <span className="material-symbols-outlined text-[18px]">{swipeRightIcon}</span>
          <span>{swipeRightText}</span>
        </motion.div>

        <motion.div 
          style={{ opacity: opacityLeft, scale: scaleLeft }}
          className={cn("flex items-center gap-1.5 font-bold text-[10px] font-inter uppercase tracking-wider", swipeLeftColorClass)}
        >
          <span>{swipeLeftText}</span>
          <span className="material-symbols-outlined text-[18px]">{swipeLeftIcon}</span>
        </motion.div>
      </motion.div>

      <motion.div
        drag={selectionModeActive ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0.5 }}
        dragDirectionLock
        style={{ x: selectionModeActive ? 0 : x }}
        onDragEnd={handleDragEnd}
        onClick={handleCardClick}
        onTouchStart={startPress}
        onTouchMove={cancelPress}
        onTouchEnd={cancelPress}
        onMouseDown={startPress}
        onMouseUp={cancelPress}
        onMouseLeave={cancelPress}
        className={cn("relative z-10 p-4 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors cursor-pointer flex gap-3 touch-pan-y", isSelected ? "bg-[#4d7cfe]/5" : "bg-dark2")}
      >
        {selectionModeActive && onToggleSelect && (
          <div className="flex items-center justify-center shrink-0" onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}>
            <div className={cn(
              "w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-all cursor-pointer select-none",
              isSelected 
                ? "bg-[#25D366] border-[#25D366] text-black shadow-sm" 
                : "border-slate-400 dark:border-white/30 bg-white dark:bg-dark3 hover:border-slate-600 dark:hover:border-white/60"
            )}>
              {isSelected && (
                <svg className="w-3.5 h-3.5 text-black stroke-[3.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </div>
          </div>
        )}
        
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <p className={USER_TABLE_STYLES.name}>
            <HighlightText text={name} term={searchTerm} />
          </p>

          <div className="flex items-center justify-between w-full gap-2">
            <p className={cn(USER_TABLE_STYLES.phone, "shrink-0")}>{phone || 'Sin teléfono'}</p>
            
            <div className="flex items-center gap-1.5 shrink">
              {badges}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.name === nextProps.name &&
    prevProps.phone === nextProps.phone &&
    prevProps.searchTerm === nextProps.searchTerm &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.selectionModeActive === nextProps.selectionModeActive &&
    prevProps.swipeRightText === nextProps.swipeRightText &&
    prevProps.swipeLeftText === nextProps.swipeLeftText
  );
});

SwipeableMobileCard.displayName = 'SwipeableMobileCard';
