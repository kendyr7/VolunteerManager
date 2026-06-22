import React from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { USER_TABLE_STYLES } from '@/app/(coordinator)/users/page';

function HighlightText({ text, term }: { text: string; term: string }) {
  if (!term.trim()) return <span>{text}</span>;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} style={{ backgroundColor: '#fde047', color: '#111827', borderRadius: '6px', padding: '0 4px', display: 'inline', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' }}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export interface SwipeableMobileCardProps {
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
}

export const SwipeableMobileCard: React.FC<SwipeableMobileCardProps> = ({
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
}) => {
  const x = useMotionValue(0);
  
  const background = useTransform(
    x,
    [-150, 0, 150],
    [swipeLeftBgColor, "rgba(0, 0, 0, 0)", swipeRightBgColor]
  );

  const opacityLeft = useTransform(x, [-100, -10, 0], [1, 0, 0]);
  const opacityRight = useTransform(x, [0, 10, 100], [0, 0, 1]);

  const scaleLeft = useTransform(x, [-100, -20], [1, 0.8]);
  const scaleRight = useTransform(x, [20, 100], [0.8, 1]);

  const handleDragEnd = (event: any, info: any) => {
    const swipeThreshold = 80;
    if (info.offset.x > swipeThreshold) {
      onSwipeRight();
    } else if (info.offset.x < -swipeThreshold) {
      onSwipeLeft();
    }
  };

  return (
    <div className="relative overflow-hidden w-full bg-dark2 select-none border-b border-white/5">
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
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0.5 }}
        dragDirectionLock
        style={{ x }}
        onDragEnd={handleDragEnd}
        onClick={onEdit}
        className="relative z-10 p-4 bg-dark2 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors cursor-pointer flex flex-col gap-1.5 touch-pan-y"
      >
        <p className={USER_TABLE_STYLES.name}>
          <HighlightText text={name} term={searchTerm} />
        </p>

        <div className="flex items-center justify-between w-full gap-2">
          <p className={cn(USER_TABLE_STYLES.phone, "shrink-0")}>{phone || 'Sin teléfono'}</p>
          
          <div className="flex items-center gap-1.5 shrink">
            {badges}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
