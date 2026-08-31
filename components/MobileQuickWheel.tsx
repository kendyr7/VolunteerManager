'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
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
  hidden?: boolean;
  trailingAction?: ReactNode;
}

type OpenOrigin = 'gesture' | 'keyboard';

const HOLD_DELAY_MS = 280;
const SUBMENU_DELAY_MS = 140;
const HOLD_MOVE_TOLERANCE = 18;
const SELECTION_RADIUS = 36;
const SUBMENU_COLLAPSE_RADIUS = 60;
const SUBMENU_SELECTION_RADIUS = 135;
const WHEEL_RADIUS = 93;
const WHEEL_INNER_RADIUS = 42;
const WHEEL_OUTER_RADIUS = 144;
const WHEEL_VIEWBOX_SIZE = 292;
const WHEEL_CENTER = WHEEL_VIEWBOX_SIZE / 2;
const ARC_START_DEGREES = -160;
const ARC_END_DEGREES = -20;
const ARC_EDGE_START_DEGREES = -176;
const ARC_EDGE_END_DEGREES = -4;
const SUBMENU_POSITION_RADIUS = 172;
const SUBMENU_INNER_RADIUS = 144;
const SUBMENU_OUTER_RADIUS = 200;
const SUBMENU_VIEWBOX_SIZE = 420;
const SUBMENU_CENTER = SUBMENU_VIEWBOX_SIZE / 2;
const SUBMENU_ANGLE_STEP = 30;

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
  const anglePadding = 24;
  if (pointerAngle < firstSegment.start - anglePadding || pointerAngle > lastSegment.end + anglePadding) {
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

export function MobileQuickWheel({ items, onSearch, onSelect, hidden = false, trailingAction }: MobileQuickWheelProps) {
  const [eventHidden, setEventHidden] = useState(false);

  useEffect(() => {
    const handleVisibilityChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ hidden?: boolean }>;
      setEventHidden(Boolean(customEvent.detail?.hidden));
    };
    window.addEventListener('hide-mobile-quick-wheel', handleVisibilityChange);
    window.addEventListener('hide-mobile-bottom-nav', handleVisibilityChange);
    return () => {
      window.removeEventListener('hide-mobile-quick-wheel', handleVisibilityChange);
      window.removeEventListener('hide-mobile-bottom-nav', handleVisibilityChange);
    };
  }, []);

  const isGloballyHidden = hidden || eventHidden;
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
      const distanceFromOrigin = Math.hypot(
        event.clientX - pointer.wheelOriginX,
        event.clientY - pointer.wheelOriginY,
      );

      const nearestMainIndex = selectedIndexFromPointer(
        event.clientX,
        event.clientY,
        pointer.pressX,
        pointer.pressY,
        pointer.wheelOriginX,
        pointer.wheelOriginY,
        items.length,
      );

      const expandedParent = expandedParentIndexRef.current;

      // If user pulled finger back near the center, collapse open submenu and clear selection
      if (distanceFromOrigin < SUBMENU_COLLAPSE_RADIUS) {
        if (expandedParent !== null) collapseSubmenu();
        updateActiveIndex(null);
        return;
      }

      // If a submenu is currently expanded:
      if (expandedParent !== null) {
        const actions = items[expandedParent]?.actions || [];
        const parentAngle = wheelAngle(expandedParent, items.length);
        const subIndex = selectedSubmenuIndexFromPointer(
          event.clientX,
          event.clientY,
          pointer.wheelOriginX,
          pointer.wheelOriginY,
          parentAngle,
          actions.length,
        );

        if (subIndex !== null) {
          // Finger is in the outer submenu ring
          updateActiveSubmenuIndex(subIndex);
          return;
        }

        // Finger is not in the outer submenu fan:
        updateActiveSubmenuIndex(null);

        // If user moved to a different main item angle in the inner wheel
        if (nearestMainIndex !== null && nearestMainIndex !== expandedParent) {
          collapseSubmenu();
          updateActiveIndex(nearestMainIndex, true);
          return;
        }

        // Still hovering near the parent item
        if (nearestMainIndex === expandedParent) {
          updateActiveIndex(expandedParent, false);
          return;
        }
        return;
      }

      // Normal wheel selection when no submenu is expanded
      updateActiveIndex(nearestMainIndex, true);
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

  let displayedTitle = 'Accesos Rápidos';
  let displayedInstruction = 'Desliza hacia arriba en abanico y suelta';

  if (activeSubmenuItem && activeItem) {
    displayedTitle = `${activeItem.name} › ${activeSubmenuItem.name}`;
    displayedInstruction = '✨ Suelta el dedo para abrir esta opción';
  } else if (expandedParentIndex !== null && activeItem) {
    displayedTitle = `${activeItem.name} (Submenú abierto)`;
    displayedInstruction = `⬆️ Desliza más hacia afuera para elegir subopción · Suelta aquí para ${activeItem.name}`;
  } else if (activeItem?.actions?.length) {
    displayedTitle = activeItem.name;
    displayedInstruction = '⬆️ Mantén aquí para ver subopciones · Suelta para abrir';
  } else if (activeItem) {
    displayedTitle = activeItem.name;
    displayedInstruction = 'Suelta el dedo para abrir';
  }
  const instantMotion = shouldReduceMotion || openOrigin === 'keyboard';
  const entranceDuration = instantMotion ? 0 : 0.18;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="quick-wheel-backdrop"
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: instantMotion ? 0 : 0.16 }}
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
            initial={{ opacity: 0, transform: 'translateX(-50%) scale(0.92)' }}
            animate={{ opacity: 1, transform: 'translateX(-50%) scale(1)' }}
            exit={{ opacity: 0, transform: 'translateX(-50%) scale(0.95)' }}
            transition={{ duration: entranceDuration, ease: [0.23, 1, 0.32, 1] }}
            onKeyDown={handleMenuKeyDown}
          >
            <AnimatePresence>
              {expandedParentIndex !== null && positionedSubmenuItems.length > 0 && (
                <motion.div
                  key={`submenu-${expandedParentIndex}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] overflow-visible"
                  initial={{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.94)' }}
                  animate={{ opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }}
                  exit={{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.97)' }}
                  transition={{ duration: instantMotion ? 0 : 0.16, ease: [0.23, 1, 0.32, 1] }}
                >
                  <svg
                    viewBox={`0 0 ${SUBMENU_VIEWBOX_SIZE} ${SUBMENU_VIEWBOX_SIZE}`}
                    className="h-full w-full overflow-visible"
                  >
                    <defs>
                      <linearGradient id="submenu-bg-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#1e293b" />
                        <stop offset="100%" stopColor="#0f172a" />
                      </linearGradient>
                      <linearGradient id="submenu-active-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#2563eb" />
                      </linearGradient>
                    </defs>

                    <path
                      d={submenuBackgroundPath}
                      fill="url(#submenu-bg-grad)"
                      stroke="rgba(255,255,255,0.18)"
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
                        fill="url(#submenu-active-grad)"
                        stroke="rgba(255,255,255,0.5)"
                        strokeWidth="1.5"
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
                opacity: expandedParentIndex === null ? 1 : 0.82,
                transform: `translate(-50%, -50%) scale(${expandedParentIndex === null ? 1 : 0.985})`,
              }}
              transition={{ duration: instantMotion ? 0 : 0.16, ease: [0.23, 1, 0.32, 1] }}
            >
              <svg
                viewBox={`0 0 ${WHEEL_VIEWBOX_SIZE} ${WHEEL_VIEWBOX_SIZE}`}
                className="h-full w-full overflow-visible"
              >
                <defs>
                  <radialGradient id="wheel-bg-grad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#1e293b" />
                    <stop offset="80%" stopColor="#0f172a" />
                    <stop offset="100%" stopColor="#090d16" />
                  </radialGradient>
                  <linearGradient id="wheel-active-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#2563eb" />
                  </linearGradient>
                </defs>

                {/* Center Pivot Hub */}
                <circle
                  cx={WHEEL_CENTER}
                  cy={WHEEL_CENTER}
                  r={WHEEL_INNER_RADIUS + 1}
                  fill="#090d16"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
                <circle
                  cx={WHEEL_CENTER}
                  cy={WHEEL_CENTER}
                  r={WHEEL_INNER_RADIUS - 6}
                  fill="none"
                  stroke="rgba(77,124,254,0.3)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={WHEEL_CENTER}
                  cy={WHEEL_CENTER}
                  r={3.5}
                  fill="#60a5fa"
                  opacity="0.8"
                />

                {/* Outer Wheel Arc */}
                <path
                  d={wheelBackgroundPath}
                  fill="url(#wheel-bg-grad)"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth="1.5"
                />

                {activeIndex !== null && positionedItems[activeIndex] && (
                  <path
                    d={arcSegmentPath(
                      positionedItems[activeIndex].segment.start,
                      positionedItems[activeIndex].segment.end,
                    )}
                    fill="url(#wheel-active-grad)"
                    stroke="rgba(255,255,255,0.5)"
                    strokeWidth="1.5"
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
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="1"
                    />
                  );
                })}
              </svg>
            </motion.div>

            {/* Floating Top HUD Guidance Pill */}
            <div
              aria-live="polite"
              className="pointer-events-none absolute left-1/2 w-[min(21rem,calc(100vw-2rem))] text-center"
              style={{ transform: `translate(-50%, ${expandedParentIndex === null ? -236 : -280}px)` }}
            >
              <div className="rounded-3xl bg-[#090d16]/90 backdrop-blur-2xl px-5 py-3.5 text-white shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-white/15 flex flex-col items-center gap-1 transition-all">
                <p className="truncate text-sm font-black tracking-tight text-white max-w-full">
                  {displayedTitle}
                </p>
                <p className="text-[11px] font-bold tracking-wide text-[#38bdf8]">
                  {displayedInstruction}
                </p>
              </div>
            </div>

            {/* Level 1 Main Wheel Buttons */}
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
                    'absolute left-1/2 top-1/2 flex h-12 w-12 items-center justify-center rounded-2xl outline-none transition-all duration-150',
                    isActive
                      ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.75)]'
                      : 'text-[#94a3b8]',
                  )}
                  initial={{ opacity: 0, transform: `${baseTransform} scale(0.92)` }}
                  animate={{
                    opacity: expandedParentIndex === null || isExpandedParent ? 1 : 0.35,
                    transform: `${baseTransform} scale(${isActive ? 1.15 : 1})`,
                  }}
                  exit={{ opacity: 0, transform: `${baseTransform} scale(0.96)` }}
                  transition={instantMotion
                    ? { duration: 0 }
                    : {
                        opacity: { duration: 0.14, delay: index * 0.018 },
                        transform: { type: 'spring', stiffness: 620, damping: 42, mass: 0.7 },
                      }}
                >
                  <span className="material-symbols-outlined text-[24px] leading-none select-none flex items-center justify-center" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="sr-only">{item.name}</span>
                </motion.button>
              );
            })}

            {/* Level 2 Submenu Buttons */}
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
                    'absolute left-1/2 top-1/2 flex h-11 w-11 items-center justify-center rounded-2xl outline-none transition-all duration-150',
                    isActive
                      ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.75)]'
                      : 'text-[#94a3b8]',
                  )}
                  initial={{ opacity: 0, transform: `${baseTransform} scale(0.94)` }}
                  animate={{
                    opacity: 1,
                    transform: `${baseTransform} scale(${isActive ? 1.15 : 1})`,
                  }}
                  exit={{ opacity: 0, transform: `${baseTransform} scale(0.97)` }}
                  transition={instantMotion
                    ? { duration: 0 }
                    : {
                        opacity: { duration: 0.12, delay: index * 0.025 },
                        transform: { type: 'spring', stiffness: 620, damping: 42, mass: 0.7 },
                      }}
                >
                  <span className="material-symbols-outlined text-[22px] leading-none select-none flex items-center justify-center" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="sr-only">{item.name}</span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isGloballyHidden && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed left-1/2 z-[70] h-[58px] w-[58px] -translate-x-1/2 rounded-full lg:hidden"
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
                'bg-gradient-to-tr from-[#2563eb] to-[#3b82f6] text-white outline-none transition-all duration-150 active:scale-[0.95]',
                'border border-white/25 shadow-[0_8px_24px_rgba(37,99,235,0.45)]',
                'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/90',
                isOpen && 'from-[#1d4ed8] to-[#2563eb] shadow-[0_0_28px_rgba(59,130,246,0.6)] scale-[1.04]',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-0 origin-left bg-white/20 transition-transform ease-linear',
                  isPressing ? 'scale-x-100 duration-[280ms]' : 'scale-x-0 duration-150',
                )}
              />
              <span className="material-symbols-outlined relative text-[25px] font-bold" aria-hidden="true">search</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!isGloballyHidden && !isOpen && trailingAction && (
        <div className="fixed left-[calc(50%+2.75rem)] z-50 flex h-[58px] items-center lg:hidden" style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {trailingAction}
        </div>
      )}

      <span id="mobile-quick-wheel-hint" className="sr-only">
        Toca para buscar. Mantén presionado, desliza hacia un acceso y suelta para abrirlo. Con teclado, presiona flecha arriba para mostrar los accesos.
      </span>
    </>
  );
}
