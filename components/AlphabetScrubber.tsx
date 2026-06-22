import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

export const AlphabetScrubber = ({ isMobile }: { isMobile: boolean }) => {
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  const handleDrag = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const y = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const elem = document.elementFromPoint(x, y);
    const letter = elem?.getAttribute('data-letter');
    if (letter) {
      if (activeLetter !== letter) {
        setActiveLetter(letter);
      }
      const targetId = isMobile ? `letter-mobile-${letter}` : `letter-${letter}`;
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
    }
  };

  const handleDragEnd = () => {
    setActiveLetter(null);
  };

  return (
    <>
      <div 
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center py-2 px-0.5 sm:px-1 bg-dark2/80 backdrop-blur-md rounded-l-xl border-y border-l border-white/10 shadow-xl touch-none"
        onTouchStart={handleDrag}
        onTouchMove={handleDrag}
        onTouchEnd={handleDragEnd}
        onMouseDown={handleDrag}
        onMouseMove={(e) => e.buttons === 1 && handleDrag(e)}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        {ALPHABET.map(letter => (
          <div 
            key={letter}
            data-letter={letter}
            className={cn(
              "text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-[1px] sm:py-0.5 cursor-pointer select-none transition-all duration-100",
              activeLetter === letter 
                ? "text-[#4d7cfe] scale-150 transform -translate-x-1" 
                : "text-text-dim hover:text-[#4d7cfe]"
            )}
            onClick={() => {
              const targetId = isMobile ? `letter-mobile-${letter}` : `letter-${letter}`;
              document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            {letter}
          </div>
        ))}
      </div>
      <AnimatePresence>
        {activeLetter && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: 10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed right-10 top-1/2 -translate-y-1/2 bg-dark3 border border-white/10 text-white font-black text-3xl w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl z-50 pointer-events-none"
          >
            {activeLetter}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
