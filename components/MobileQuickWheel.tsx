'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type MobileQuickWheelCommand = 'toggle-theme';

export interface MobileQuickWheelAction {
  name: string;
  icon: string;
  href?: string;
  command?: MobileQuickWheelCommand;
}

export interface MobileQuickWheelItem extends MobileQuickWheelAction {
  href: string;
  actions?: MobileQuickWheelAction[];
}

interface MobileQuickWheelProps {
  items: MobileQuickWheelItem[];
  onSearch: () => void;
  onSelect: (item: MobileQuickWheelAction) => void;
}

type OpenOrigin = 'gesture' | 'keyboard';

const HOLD_DELAY_MS = 340;
const SUBMENU_DELAY_MS = 300;
const HOLD_MOVE_TOLERANCE = 18;
const SELECTION_RADIUS = 48;
const SUBMENU_COLLAPSE_RADIUS = 122;
const SUBMENU_SELECTION_RADIUS = 146;
const WHEEL_RADIUS = 112;
const WHEEL_INNER_RADIUS = 42;
const WHEEL_OUTER_RADIUS = 144;
const WHEEL_VIEWBOX_SIZE = 292;
const WHEEL_CENTER = WHEEL_VIEWBOX_SIZE / 2;
const ARC_START_DEGREES = -160;
const ARC_END_DEGREES = -20;
const ARC_EDGE_START_DEGREES = -176;
const ARC_EDGE_END_DEGREES = -4;
const SUBMENU_POSITION_RADIUS = 163;
const SUBMENU_INNER_RADIUS = 142;
const SUBMENU_OUTER_RADIUS = 184;
const SUBMENU_VIEWBOX_SIZE = 400;
const SUBMENU_CENTER = SUBMENU_VIEWBOX_SIZE / 2;
const SUBMENU_ANGLE_STEP = 28;

function wheelAngle(index: number, itemCount: number) {
  if (itemCount <= 1) return -90;
  return ARC_START_DEGREES
    + ((ARC_END_DEGREES - ARC_START_DEGREES) * index) / (itemCount - 1);
}

function wheelPosition(index: number, itemCount: number) {
  const radians = wheelAngle(index, itemCount) * (Math.PI / 180);
  return {
    x: Math.cos(radians) * WHEEL_RADIUS,
    y: Math.sin(radians) * WHEEL_RADIUS,
  };
}

function wheelSegmentBounds(index: number, itemCount: number) {
  if (itemCount <= 1) {
    return { start: -124, end: -56 };
  }

  const step = (ARC_END_DEGREES - ARC_START_DEGREES) / (itemCount - 1);
  const center = wheelAngle(index, itemCount);
  return {
    start: index === 0 ? ARC_EDGE_START_DEGREES : center - step / 2,
    end: index === itemCount - 1 ? ARC_EDGE_END_DEGREES : center + step / 2,
  };
}

function polarPoint(angle: number, radius: number, center = WHEEL_CENTER) {
  const radians = angle * (Math.PI / 180);
  return {
    x: center + Math.cos(radians) * radius,
    y: center + Math.sin(radians) * radius,
  };
}

function arcSegmentPath(
  startAngle: number,
  endAngle: number,
  innerRadius = WHEEL_INNER_RADIUS,
  outerRadius = WHEEL_OUTER_RADIUS,
  center = WHEEL_CENTER,
) {
  const outerStart = polarPoint(startAngle, outerRadius, center);
  const outerEnd = polarPoint(endAngle, outerRadius, center);
  const innerEnd = polarPoint(endAngle, innerRadius, center);
  const innerStart = polarPoint(startAngle, innerRadius, center);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function submenuAngle(index: number, itemCount: number, parentAngle: number) {
  if (itemCount <= 1) return parentAngle;
  return parentAngle + (index - (itemCount - 1) / 2) * SUBMENU_ANGLE_STEP;
}

function submenuSegmentBounds(index: number, itemCount: number, parentAngle: number) {
  const center = submenuAngle(index, itemCount, parentAngle);
  const halfWidth = itemCount <= 1 ? 16 : SUBMENU_ANGLE_STEP / 2;
  return { start: center - halfWidth, end: center + halfWidth };
}

function submenuPosition(index: number, itemCount: number, parentAngle: number) {
  const angle = submenuAngle(index, itemCount, parentAngle);
  const radians = angle * (Math.PI / 180);
  return {
    angle,
    x: Math.cos(radians) * SUBMENU_POSITION_RADIUS,
    y: Math.sin(radians) * SUBMENU_POSITION_RADIUS,
    segment: submenuSegmentBounds(index, itemCount, parentAngle),
  };
}

function selectedIndexFromPointer(
  clientX: number,
  clientY: number,
  pressX: number,
  pressY: number,
  wheelOriginX: number,
  wheelOriginY: number,
  itemCount: number,
) {
  if (itemCount === 0) return null;

  const dragDistance = Math.hypot(clientX - pressX, clientY - pressY);
  if (dragDistance < SELECTION_RADIUS) return null;

  const deltaX = clientX - wheelOriginX;
  const deltaY = clientY - wheelOriginY;
  if (deltaY > 12) return null;

  const pointerAngle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
  if (pointerAngle < ARC_START_DEGREES - 20 || pointerAngle > ARC_END_DEGREES + 20) {
    return null;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < itemCount; index += 1) {
    const angleDistance = Math.abs(pointerAngle - wheelAngle(index, itemCount));
    if (angleDistance < nearestDistance) {
      nearestDistance = angleDistance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

function selectedSubmenuIndexFromPointer(
  clientX: number,
  clientY: number,
  wheelOriginX: number,
  wheelOriginY: number,
  parentAngle: number,
  itemCount: number,
) {
  if (itemCount === 0) return null;

  const deltaX = clientX - wheelOriginX;
  const deltaY = clientY - wheelOriginY;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < SUBMENU_SELECTION_RADIUS || deltaY > 12) return null;

  const pointerAngle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
  const firstSegment = submenuSegmentBounds(0, itemCount, parentAngle);
  const lastSegment = submenuSegmentBounds(itemCount - 1, itemCount, parentAngle);
  if (pointerAngle < firstSegment.start - 8 || pointerAngle > lastSegment.end + 8) {
    return null;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < itemCount; index += 1) {
    const distanceFromAction = Math.abs(pointerAngle - submenuAngle(index, itemCount, parentAngle));
    if (distanceFromAction < nearestDistance) {
      nearestDistance = distanceFromAction;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

export function MobileQuickWheel({ items, onSearch, onSelect }: MobileQuickWheelProps) {
  const shouldReduceMotion = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const submenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const holdTimerRef = useRef<number | null>(null);
  const submenuTimerRef = useRef<number | null>(null);
  const pointerRef = useRef<{
    pointerId: number;
    pressX: number;
    pressY: number;
    wheelOriginX: number;
    wheelOriginY: number;
    latestX: number;
    latestY: number;
    cancelled: boolean;
  } | null>(null);
  const isOpenRef = useRef(false);
  const activeIndexRef = useRef<number | null>(null);
  const expandedParentIndexRef = useRef<number | null>(null);
  const activeSubmenuIndexRef = useRef<number | null>(null);
  const [isPressing, setIsPressing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [openOrigin, setOpenOrigin] = useState<OpenOrigin>('gesture');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [expandedParentIndex, setExpandedParentIndex] = useState<number | null>(null);
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null);

  const positionedItems = useMemo(
    () => items.map((item, index) => ({
      ...item,
      ...wheelPosition(index, items.length),
      segment: wheelSegmentBounds(index, items.length),
    })),
    [items],
  );

  const wheelBackgroundPath = useMemo(() => {
    if (items.length === 0) return '';
    const firstSegment = wheelSegmentBounds(0, items.length);
    const lastSegment = wheelSegmentBounds(items.length - 1, items.length);
    return arcSegmentPath(firstSegment.start, lastSegment.end);
  }, [items.length]);

  const positionedSubmenuItems = useMemo(() => {
    if (expandedParentIndex === null) return [];
    const parent = items[expandedParentIndex];
    const actions = parent?.actions || [];
    const parentAngle = wheelAngle(expandedParentIndex, items.length);
    return actions.map((action, index) => ({
      ...action,
      ...submenuPosition(index, actions.length, parentAngle),
    }));
  }, [expandedParentIndex, items]);

  const submenuBackgroundPath = useMemo(() => {
    if (positionedSubmenuItems.length === 0) return '';
    return arcSegmentPath(
      positionedSubmenuItems[0].segment.start,
      positionedSubmenuItems[positionedSubmenuItems.length - 1].segment.end,
      SUBMENU_INNER_RADIUS,
      SUBMENU_OUTER_RADIUS,
      SUBMENU_CENTER,
    );
  }, [positionedSubmenuItems]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const clearSubmenuTimer = useCallback(() => {
    if (submenuTimerRef.current !== null) {
      window.clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
  }, []);

  const updateActiveSubmenuIndex = useCallback((nextIndex: number | null) => {
    if (activeSubmenuIndexRef.current === nextIndex) return;
    activeSubmenuIndexRef.current = nextIndex;
    setActiveSubmenuIndex(nextIndex);
    if (nextIndex !== null) vibrate(6);
  }, []);

  const collapseSubmenu = useCallback(() => {
    clearSubmenuTimer();
    expandedParentIndexRef.current = null;
    activeSubmenuIndexRef.current = null;
    setExpandedParentIndex(null);
    setActiveSubmenuIndex(null);
  }, [clearSubmenuTimer]);

  const revealSubmenu = useCallback((parentIndex: number, focusFirst = false) => {
    const actions = items[parentIndex]?.actions;
    if (!actions?.length) return;
    clearSubmenuTimer();
    expandedParentIndexRef.current = parentIndex;
    activeSubmenuIndexRef.current = null;
    setExpandedParentIndex(parentIndex);
    setActiveSubmenuIndex(null);
    vibrate([10, 24, 10]);
    if (focusFirst) {
      window.requestAnimationFrame(() => submenuItemRefs.current[0]?.focus());
    }
  }, [clearSubmenuTimer, items]);

  const updateActiveIndex = useCallback((nextIndex: number | null, allowSubmenu = false) => {
    if (activeIndexRef.current === nextIndex) return;
    clearSubmenuTimer();
    if (expandedParentIndexRef.current !== null && expandedParentIndexRef.current !== nextIndex) {
      collapseSubmenu();
    }
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    if (nextIndex !== null) vibrate(5);

    const actions = nextIndex === null ? null : items[nextIndex]?.actions;
    if (allowSubmenu && nextIndex !== null && actions?.length) {
      const parentIndex = nextIndex;
      submenuTimerRef.current = window.setTimeout(() => {
        if (
          isOpenRef.current
          && pointerRef.current
          && activeIndexRef.current === parentIndex
        ) {
          revealSubmenu(parentIndex);
        }
      }, SUBMENU_DELAY_MS);
    }
  }, [clearSubmenuTimer, collapseSubmenu, items, revealSubmenu]);

  const closeWheel = useCallback((restoreFocus = false) => {
    clearHoldTimer();
    clearSubmenuTimer();
    pointerRef.current = null;
    isOpenRef.current = false;
    activeIndexRef.current = null;
    expandedParentIndexRef.current = null;
    activeSubmenuIndexRef.current = null;
    setIsPressing(false);
    setIsOpen(false);
    setActiveIndex(null);
    setExpandedParentIndex(null);
    setActiveSubmenuIndex(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [clearHoldTimer, clearSubmenuTimer]);

  const openWheel = useCallback((origin: OpenOrigin) => {
    if (items.length === 0) return;
    isOpenRef.current = true;
    setOpenOrigin(origin);
    setIsPressing(false);
    setIsOpen(true);
    vibrate(12);
  }, [items.length]);

  const executeTarget = useCallback((target: MobileQuickWheelAction | undefined) => {
    if (!target) return;
    closeWheel();
    onSelect(target);
  }, [closeWheel, onSelect]);

  useEffect(() => () => {
    clearHoldTimer();
    clearSubmenuTimer();
  }, [clearHoldTimer, clearSubmenuTimer]);

  useEffect(() => {
    if (!isOpen || openOrigin === 'gesture') return;
    const frame = window.requestAnimationFrame(() => itemRefs.current[0]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, openOrigin]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || isOpenRef.current) return;

    clearHoldTimer();
    event.currentTarget.setPointerCapture(event.pointerId);
    const triggerBounds = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      pointerId: event.pointerId,
      pressX: event.clientX,
      pressY: event.clientY,
      wheelOriginX: triggerBounds.left + triggerBounds.width / 2,
      wheelOriginY: triggerBounds.top + triggerBounds.height / 2,
      latestX: event.clientX,
      latestY: event.clientY,
      cancelled: false,
    };
    setIsPressing(true);

    holdTimerRef.current = window.setTimeout(() => {
      const pointer = pointerRef.current;
      if (!pointer) return;
      openWheel('gesture');
      updateActiveIndex(selectedIndexFromPointer(
        pointer.latestX,
        pointer.latestY,
        pointer.pressX,
        pointer.pressY,
        pointer.wheelOriginX,
        pointer.wheelOriginY,
        items.length,
      ), true);
    }, HOLD_DELAY_MS);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;

    pointer.latestX = event.clientX;
    pointer.latestY = event.clientY;

    if (isOpenRef.current) {
      const expandedParent = expandedParentIndexRef.current;
      if (expandedParent !== null) {
        const distanceFromOrigin = Math.hypot(
          event.clientX - pointer.wheelOriginX,
          event.clientY - pointer.wheelOriginY,
        );

        if (distanceFromOrigin < SUBMENU_COLLAPSE_RADIUS) {
          collapseSubmenu();
          updateActiveIndex(selectedIndexFromPointer(
            event.clientX,
            event.clientY,
            pointer.pressX,
            pointer.pressY,
            pointer.wheelOriginX,
            pointer.wheelOriginY,
            items.length,
          ), true);
          return;
        }

        const actions = items[expandedParent]?.actions || [];
        updateActiveSubmenuIndex(selectedSubmenuIndexFromPointer(
          event.clientX,
          event.clientY,
          pointer.wheelOriginX,
          pointer.wheelOriginY,
          wheelAngle(expandedParent, items.length),
          actions.length,
        ));
        return;
      }

      updateActiveIndex(selectedIndexFromPointer(
        event.clientX,
        event.clientY,
        pointer.pressX,
        pointer.pressY,
        pointer.wheelOriginX,
        pointer.wheelOriginY,
        items.length,
      ), true);
      return;
    }

    if (Math.hypot(event.clientX - pointer.pressX, event.clientY - pointer.pressY) > HOLD_MOVE_TOLERANCE) {
      clearHoldTimer();
      pointer.cancelled = true;
      setIsPressing(false);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;

    clearHoldTimer();
    pointerRef.current = null;
    setIsPressing(false);

    if (isOpenRef.current) {
      const expandedParent = expandedParentIndexRef.current;
      const selectedSubmenuIndex = activeSubmenuIndexRef.current;
      if (expandedParent !== null && selectedSubmenuIndex !== null) {
        executeTarget(items[expandedParent]?.actions?.[selectedSubmenuIndex]);
        return;
      }

      const selectedIndex = activeIndexRef.current;
      if (selectedIndex !== null) executeTarget(items[selectedIndex]);
      else closeWheel();
      return;
    }

    if (pointer.cancelled) return;
    onSearch();
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerRef.current?.pointerId !== event.pointerId) return;
    closeWheel();
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const expandedParent = expandedParentIndexRef.current;
    if (expandedParent !== null) {
      if (event.key === 'Escape' || event.key === 'ArrowDown') {
        event.preventDefault();
        collapseSubmenu();
        window.requestAnimationFrame(() => itemRefs.current[expandedParent]?.focus());
        return;
      }

      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const actions = items[expandedParent]?.actions || [];
      const currentIndex = submenuItemRefs.current.findIndex(item => item === document.activeElement);
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      const nextIndex = (Math.max(currentIndex, 0) + direction + actions.length) % actions.length;
      updateActiveSubmenuIndex(nextIndex);
      submenuItemRefs.current[nextIndex]?.focus();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeWheel(true);
      return;
    }

    const currentIndex = itemRefs.current.findIndex(item => item === document.activeElement);
    if (event.key === 'ArrowUp' && currentIndex >= 0 && items[currentIndex]?.actions?.length) {
      event.preventDefault();
      revealSubmenu(currentIndex, true);
      return;
    }

    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(event.key)) return;

    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const nextIndex = (Math.max(currentIndex, 0) + direction + items.length) % items.length;
    updateActiveIndex(nextIndex);
    itemRefs.current[nextIndex]?.focus();
  };

  const activeItem = activeIndex === null ? null : items[activeIndex];
  const activeSubmenuItem = activeSubmenuIndex === null
    ? null
    : positionedSubmenuItems[activeSubmenuIndex];
  const displayedItem = activeSubmenuItem || activeItem;
  const displayedTitle = activeSubmenuItem && activeItem
    ? `${activeItem.name} · ${activeSubmenuItem.name}`
    : expandedParentIndex !== null && activeItem
      ? `Más opciones de ${activeItem.name}`
      : displayedItem?.name || 'Elige un acceso';
  const displayedInstruction = activeSubmenuItem
    ? 'Suelta para abrir'
    : expandedParentIndex !== null
      ? `Desliza más lejos · Suelta aquí para abrir ${activeItem?.name || 'la sección'}`
      : activeItem?.actions?.length
        ? 'Mantén esta dirección para ver más opciones'
        : activeItem
          ? 'Suelta para abrir'
          : 'Desliza hacia una opción y suelta';
  const instantMotion = shouldReduceMotion || openOrigin === 'keyboard';
  const entranceDuration = instantMotion ? 0 : 0.18;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="quick-wheel-backdrop"
            className="fixed inset-0 z-50 bg-[#020617]/60 backdrop-blur-[2px] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: instantMotion ? 0 : 0.14 }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) closeWheel(true);
            }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="quick-wheel"
            id="mobile-quick-wheel"
            role="menu"
            aria-label="Accesos rápidos"
            className="fixed z-[60] h-0 w-0 lg:hidden"
            style={{
              left: '50%',
              bottom: 'calc(max(1rem, env(safe-area-inset-bottom)) + 29px)',
            }}
            initial={{ opacity: 0, transform: 'translateX(-50%) scale(0.94)' }}
            animate={{ opacity: 1, transform: 'translateX(-50%) scale(1)' }}
            exit={{ opacity: 0, transform: 'translateX(-50%) scale(0.97)' }}
            transition={{ duration: entranceDuration, ease: [0.23, 1, 0.32, 1] }}
            onKeyDown={handleMenuKeyDown}
          >
            <AnimatePresence>
              {expandedParentIndex !== null && positionedSubmenuItems.length > 0 && (
                <motion.div
                  key={`submenu-${expandedParentIndex}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[400px] overflow-visible"
                  initial={{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.96)' }}
                  animate={{ opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }}
                  exit={{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.98)' }}
                  transition={{ duration: instantMotion ? 0 : 0.16, ease: [0.23, 1, 0.32, 1] }}
                >
                  <svg
                    viewBox={`0 0 ${SUBMENU_VIEWBOX_SIZE} ${SUBMENU_VIEWBOX_SIZE}`}
                    className="h-full w-full overflow-visible"
                  >
                  <path
                    d={submenuBackgroundPath}
                    fill="#162033"
                    stroke="rgba(255,255,255,0.16)"
                    strokeWidth="1.5"
                  />

                  {activeSubmenuIndex !== null && positionedSubmenuItems[activeSubmenuIndex] && (
                    <path
                      d={arcSegmentPath(
                        positionedSubmenuItems[activeSubmenuIndex].segment.start,
                        positionedSubmenuItems[activeSubmenuIndex].segment.end,
                        SUBMENU_INNER_RADIUS,
                        SUBMENU_OUTER_RADIUS,
                        SUBMENU_CENTER,
                      )}
                      fill="#6f95ff"
                      stroke="rgba(255,255,255,0.42)"
                      strokeWidth="1"
                    />
                  )}

                  {positionedSubmenuItems.slice(1).map((item) => {
                    const inner = polarPoint(item.segment.start, SUBMENU_INNER_RADIUS, SUBMENU_CENTER);
                    const outer = polarPoint(item.segment.start, SUBMENU_OUTER_RADIUS, SUBMENU_CENTER);
                    return (
                      <line
                        key={`${item.href || item.command || item.name}-divider`}
                        x1={inner.x}
                        y1={inner.y}
                        x2={outer.x}
                        y2={outer.y}
                        stroke="rgba(255,255,255,0.12)"
                        strokeWidth="1"
                      />
                    );
                  })}
                  </svg>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-[292px] w-[292px] overflow-visible"
              initial={{ transform: 'translate(-50%, -50%)' }}
              animate={{
                opacity: expandedParentIndex === null ? 1 : 0.78,
                transform: `translate(-50%, -50%) scale(${expandedParentIndex === null ? 1 : 0.985})`,
              }}
              transition={{ duration: instantMotion ? 0 : 0.16, ease: [0.23, 1, 0.32, 1] }}
            >
              <svg
                viewBox={`0 0 ${WHEEL_VIEWBOX_SIZE} ${WHEEL_VIEWBOX_SIZE}`}
                className="h-full w-full overflow-visible"
              >
                <circle
                  cx={WHEEL_CENTER}
                  cy={WHEEL_CENTER}
                  r={WHEEL_INNER_RADIUS + 1}
                  fill="#101827"
                />
                <path
                  d={wheelBackgroundPath}
                  fill="#101827"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="1.5"
                />

                {activeIndex !== null && positionedItems[activeIndex] && (
                  <path
                    d={arcSegmentPath(
                      positionedItems[activeIndex].segment.start,
                      positionedItems[activeIndex].segment.end,
                    )}
                    fill={expandedParentIndex === null ? '#4d7cfe' : '#315fd6'}
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth="1"
                  />
                )}

                {positionedItems.slice(1).map((item) => {
                  const inner = polarPoint(item.segment.start, WHEEL_INNER_RADIUS);
                  const outer = polarPoint(item.segment.start, WHEEL_OUTER_RADIUS);
                  return (
                    <line
                      key={`${item.href}-divider`}
                      x1={inner.x}
                      y1={inner.y}
                      x2={outer.x}
                      y2={outer.y}
                      stroke="rgba(255,255,255,0.11)"
                      strokeWidth="1"
                    />
                  );
                })}
              </svg>
            </motion.div>

            <div
              aria-live="polite"
              className="pointer-events-none absolute left-1/2 w-[min(19rem,calc(100vw-2rem))] text-center"
              style={{ transform: `translate(-50%, ${expandedParentIndex === null ? -234 : -270}px)` }}
            >
              <div className="rounded-xl bg-[#172033] px-4 py-3 text-white shadow-[0_4px_8px_rgba(2,6,23,0.38)] outline outline-1 outline-white/10">
                <p className="truncate text-[15px] font-bold leading-5 tracking-[-0.01em]">
                  {displayedTitle}
                </p>
                <p className="mt-1 text-sm font-medium leading-[1.35] text-[#cbd5e1] text-pretty">
                  {displayedInstruction}
                </p>
              </div>
            </div>

            {positionedItems.map((item, index) => {
              const isActive = activeIndex === index;
              const isExpandedParent = expandedParentIndex === index;
              const baseTransform = `translate3d(calc(-50% + ${item.x}px), calc(-50% + ${item.y}px), 0)`;
              return (
                <motion.button
                  key={item.href}
                  ref={(element) => { itemRefs.current[index] = element; }}
                  type="button"
                  role="menuitem"
                  aria-label={`Abrir ${item.name}`}
                  aria-haspopup={item.actions?.length ? 'menu' : undefined}
                  aria-expanded={item.actions?.length ? expandedParentIndex === index : undefined}
                  onClick={() => executeTarget(item)}
                  onFocus={() => updateActiveIndex(index)}
                  className={cn(
                    'absolute left-1/2 top-1/2 flex h-12 w-12 items-center justify-center rounded-xl outline-none',
                    isActive
                      ? 'text-white'
                      : 'text-[#c4cfdd]',
                  )}
                  initial={{ opacity: 0, transform: `${baseTransform} scale(0.92)` }}
                  animate={{
                    opacity: expandedParentIndex === null || isExpandedParent ? 1 : 0.32,
                    transform: `${baseTransform} scale(${isActive ? 1.08 : 1})`,
                  }}
                  exit={{ opacity: 0, transform: `${baseTransform} scale(0.96)` }}
                  transition={instantMotion
                    ? { duration: 0 }
                    : {
                        opacity: { duration: 0.14, delay: index * 0.018 },
                        transform: { type: 'spring', stiffness: 620, damping: 42, mass: 0.7 },
                      }}
                >
                  <span className="material-symbols-outlined text-[23px]" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="sr-only">{item.name}</span>
                </motion.button>
              );
            })}

            {positionedSubmenuItems.map((item, index) => {
              const isActive = activeSubmenuIndex === index;
              const baseTransform = `translate3d(calc(-50% + ${item.x}px), calc(-50% + ${item.y}px), 0)`;
              return (
                <motion.button
                  key={item.href || item.command || item.name}
                  ref={(element) => { submenuItemRefs.current[index] = element; }}
                  type="button"
                  role="menuitem"
                  aria-label={item.name}
                  onClick={() => executeTarget(item)}
                  onFocus={() => updateActiveSubmenuIndex(index)}
                  className={cn(
                    'absolute left-1/2 top-1/2 flex h-11 w-11 items-center justify-center rounded-xl outline-none',
                    isActive ? 'text-white' : 'text-[#dbe4f0]',
                  )}
                  initial={{ opacity: 0, transform: `${baseTransform} scale(0.94)` }}
                  animate={{
                    opacity: 1,
                    transform: `${baseTransform} scale(${isActive ? 1.1 : 1})`,
                  }}
                  exit={{ opacity: 0, transform: `${baseTransform} scale(0.97)` }}
                  transition={instantMotion
                    ? { duration: 0 }
                    : {
                        opacity: { duration: 0.12, delay: index * 0.025 },
                        transform: { type: 'spring', stiffness: 620, damping: 42, mass: 0.7 },
                      }}
                >
                  <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="sr-only">{item.name}</span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="fixed left-1/2 z-[70] h-[58px] w-[58px] -translate-x-1/2 overflow-hidden rounded-full bg-[#4d7cfe] text-white shadow-[0_4px_8px_rgba(49,95,214,0.28)] lg:hidden"
        style={{
          bottom: 'max(1rem, env(safe-area-inset-bottom))',
          WebkitTouchCallout: 'none',
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-label="Buscar. Mantén presionado para mostrar accesos rápidos"
          aria-describedby="mobile-quick-wheel-hint"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(event) => event.preventDefault()}
          onClick={(event) => {
            if (event.detail === 0) onSearch();
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              openWheel('keyboard');
            }
          }}
          className={cn(
            'relative flex h-full w-full touch-none select-none items-center justify-center overflow-hidden rounded-full',
            'bg-[#4d7cfe] text-white outline-none transition-transform duration-150 active:scale-[0.97]',
            'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/90',
            isOpen && 'bg-[#315fd6]',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-0 origin-left bg-white/16 transition-transform ease-linear',
              isPressing ? 'scale-x-100 duration-[340ms]' : 'scale-x-0 duration-150',
            )}
          />
          <span className="material-symbols-outlined relative text-[24px]" aria-hidden="true">search</span>
        </button>
      </div>

      <span id="mobile-quick-wheel-hint" className="sr-only">
        Toca para buscar. Mantén presionado, desliza hacia un acceso y suelta para abrirlo. Con teclado, presiona flecha arriba para mostrar los accesos.
      </span>
    </>
  );
}
