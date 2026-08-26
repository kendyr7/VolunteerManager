'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface DistributionItem {
  id: string;
  name: string;
  count: number;
  secondaryCount?: number;
  color?: string;
  description?: string | null;
  href?: string;
}

interface DashboardDistributionChartProps {
  title: string;
  subtitle: string;
  items: DistributionItem[];
  totalLabel?: string;
  unitLabel?: string;
  isScopedToCommittee?: boolean;
  committeeName?: string;
  canManageAreas?: boolean;
  selectedCommitteeId?: string;
  metric?: 'volunteers' | 'shifts';
  onMetricChange?: (metric: 'volunteers' | 'shifts') => void;
  showMetricToggle?: boolean;
}

// Curated harmonious high-contrast palette
const PALETTE = [
  '#4d7cfe', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#3b82f6', // Indigo
  '#14b8a6', // Teal
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#a855f7', // Purple
  '#64748b', // Slate
];

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeDonutSlice(
  x: number,
  y: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number
) {
  const delta = endAngle - startAngle;
  const isFullCircle = delta >= 359.99;
  const effectiveEnd = isFullCircle ? startAngle + 359.99 : endAngle;

  const outerStart = polarToCartesian(x, y, rOuter, startAngle);
  const outerEnd = polarToCartesian(x, y, rOuter, effectiveEnd);
  const innerStart = polarToCartesian(x, y, rInner, effectiveEnd);
  const innerEnd = polarToCartesian(x, y, rInner, startAngle);

  const largeArcFlag = delta <= 180 ? 0 : 1;

  return [
    'M', outerStart.x, outerStart.y,
    'A', rOuter, rOuter, 0, largeArcFlag, 1, outerEnd.x, outerEnd.y,
    'L', innerStart.x, innerStart.y,
    'A', rInner, rInner, 0, largeArcFlag, 0, innerEnd.x, innerEnd.y,
    'Z',
  ].join(' ');
}

export function DashboardDistributionChart({
  title,
  subtitle,
  items,
  totalLabel = 'Total',
  unitLabel = 'voluntarios',
  isScopedToCommittee = false,
  committeeName,
  canManageAreas = false,
  selectedCommitteeId,
  metric = 'volunteers',
  onMetricChange,
  showMetricToggle = true,
}: DashboardDistributionChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Filter out items with 0 count for the chart slices, but keep list of all items
  const activeItems = useMemo(() => {
    return items
      .map((item, idx) => ({
        ...item,
        color: item.color || PALETTE[idx % PALETTE.length],
      }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const totalValue = useMemo(() => {
    return activeItems.reduce((acc, curr) => acc + curr.count, 0);
  }, [activeItems]);

  const slices = useMemo(() => {
    if (totalValue <= 0) return [];

    let currentAngle = 0;
    const gapAngle = activeItems.filter(i => i.count > 0).length > 1 ? 1.5 : 0;

    return activeItems
      .filter((item) => item.count > 0)
      .map((item, index) => {
        const percentage = (item.count / totalValue) * 100;
        const sliceAngle = (item.count / totalValue) * 360;
        const startAngle = currentAngle + gapAngle / 2;
        const endAngle = currentAngle + sliceAngle - gapAngle / 2;
        currentAngle += sliceAngle;

        const pathData = describeDonutSlice(140, 140, 115, 78, startAngle, endAngle);

        return {
          ...item,
          originalIndex: index,
          percentage,
          startAngle,
          endAngle,
          pathData,
        };
      });
  }, [activeItems, totalValue]);

  // Empty state if committee has no areas created or 0 items
  if (isScopedToCommittee && activeItems.length === 0) {
    return (
      <div className="p-8 sm:p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#4d7cfe]/10 text-[#4d7cfe] border border-[#4d7cfe]/20 flex items-center justify-center mb-4 shadow-inner">
          <span className="material-symbols-outlined text-[32px]">category</span>
        </div>
        <h4 className="text-base font-bold text-text mb-1">Sin áreas operativas configuradas</h4>
        <p className="text-xs text-text-dim max-w-sm mb-5 leading-relaxed">
          {committeeName
            ? `El comité "${committeeName}" aún no tiene áreas operativas creadas.`
            : 'Este comité aún no cuenta con áreas creadas para distribuir sus voluntarios.'}
        </p>
        {canManageAreas && (
          <Link href={`/areas${selectedCommitteeId ? `?committee=${selectedCommitteeId}` : ''}`}>
            <Button className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full text-xs font-bold px-5 h-9 flex items-center gap-1.5 shadow-md active:scale-95 transition-all">
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              <span>Crear áreas en Áreas y Cobertura</span>
            </Button>
          </Link>
        )}
      </div>
    );
  }

  const activeHoveredSlice = hoveredIndex !== null ? slices.find(s => s.originalIndex === hoveredIndex) : null;
  const hoveredItem = hoveredIndex !== null ? activeItems[hoveredIndex] : null;

  return (
    <div className="px-5 sm:px-8 py-6">
      {/* Metric Toggle Sub-header (Optional) */}
      {showMetricToggle && onMetricChange && (
        <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Métrica de distribución:</span>
            <span className="text-xs font-bold text-text">
              {metric === 'volunteers' ? 'Personas únicas' : 'Turnos asignados'}
            </span>
          </div>

          <div className="flex items-center p-0.5 rounded-lg bg-dark3 border border-border">
            <button
              type="button"
              onClick={() => onMetricChange('volunteers')}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                metric === 'volunteers'
                  ? "bg-[#4d7cfe] text-white shadow-sm"
                  : "text-text-dim hover:text-text"
              )}
            >
              <span className="material-symbols-outlined text-[14px]">groups</span>
              <span>Voluntarios</span>
            </button>
            <button
              type="button"
              onClick={() => onMetricChange('shifts')}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                metric === 'shifts'
                  ? "bg-[#4d7cfe] text-white shadow-sm"
                  : "text-text-dim hover:text-text"
              )}
            >
              <span className="material-symbols-outlined text-[14px]">calendar_month</span>
              <span>Turnos</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* ── Donut Chart Visual ── */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center relative">
          <div className="relative w-[280px] h-[280px] sm:w-[300px] sm:h-[300px]">
            <svg
              viewBox="0 0 280 280"
              className="w-full h-full transform -rotate-90 drop-shadow-md select-none"
            >
              {/* Background Empty Ring if 0 total */}
              {totalValue === 0 && (
                <path
                  d={describeDonutSlice(140, 140, 115, 78, 0, 360)}
                  className="fill-white/5 stroke-border"
                  strokeWidth={1}
                />
              )}

              {/* Slices */}
              {slices.map((slice) => {
                const isHovered = hoveredIndex === slice.originalIndex;
                const isOtherHovered = hoveredIndex !== null && !isHovered;

                return (
                  <path
                    key={slice.id}
                    d={slice.pathData}
                    fill={slice.color}
                    onMouseEnter={() => setHoveredIndex(slice.originalIndex)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className="transition-all duration-200 cursor-pointer focus:outline-none"
                    style={{
                      opacity: isOtherHovered ? 0.35 : 1,
                      transform: isHovered ? 'scale(1.03)' : 'scale(1)',
                      transformOrigin: '140px 140px',
                      filter: isHovered ? `drop-shadow(0 0 8px ${slice.color}80)` : 'none',
                    }}
                  />
                );
              })}
            </svg>

            {/* Donut Center Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
              <AnimatePresence mode="wait">
                {hoveredItem ? (
                  <motion.div
                    key={hoveredItem.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col items-center justify-center max-w-[150px]"
                  >
                    <span className="text-[11px] font-bold text-text-dim uppercase tracking-wider truncate w-full" title={hoveredItem.name}>
                      {hoveredItem.name}
                    </span>
                    <span className="text-3xl sm:text-4xl font-black text-text tabular-nums tracking-tight my-0.5" style={{ color: hoveredItem.color }}>
                      {hoveredItem.count.toLocaleString()}
                    </span>
                    <span className="text-[11px] font-extrabold bg-white/10 px-2 py-0.5 rounded-full text-text tabular-nums">
                      {totalValue > 0 ? ((hoveredItem.count / totalValue) * 100).toFixed(1) : 0}%
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="total"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col items-center justify-center"
                  >
                    <span className="text-[10px] sm:text-xs font-bold text-text-dim uppercase tracking-widest">
                      {totalLabel}
                    </span>
                    <span className="text-3xl sm:text-4xl font-black text-text tabular-nums tracking-tight my-0.5">
                      {totalValue.toLocaleString()}
                    </span>
                    <span className="text-[11px] font-bold text-text-dim">
                      {unitLabel}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <p className="text-[11px] font-semibold text-text-dim mt-2 text-center">
            Pasa el cursor o toca un segmento para ver detalles
          </p>
        </div>

        {/* ── Legend Grid ── */}
        <div className="lg:col-span-7">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
            {activeItems.map((item, idx) => {
              const percentage = totalValue > 0 ? ((item.count / totalValue) * 100).toFixed(1) : '0';
              const isHovered = hoveredIndex === idx;
              const isOtherHovered = hoveredIndex !== null && !isHovered;

              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className={cn(
                    "p-3 rounded-xl border transition-all duration-200 flex items-center justify-between gap-3 cursor-pointer select-none",
                    isHovered
                      ? "bg-white/10 border-white/20 shadow-md scale-[1.01]"
                      : isOtherHovered
                      ? "bg-dark2/40 border-white/5 opacity-50"
                      : "bg-dark2 border-white/5 hover:bg-dark3 hover:border-white/10"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-text truncate" title={item.name}>
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="text-[10px] text-text-dim truncate">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-black text-text tabular-nums">
                        {item.count.toLocaleString()}
                      </p>
                      <p className="text-[10px] font-bold text-text-dim tabular-nums">
                        {percentage}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
