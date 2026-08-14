'use client';

import { useEffect, useRef } from 'react';

type MobileDrawerNavigationOptions = {
  isOpen: boolean;
  onClose: () => void;
  disabled?: boolean;
  mobileQuery?: string;
  closeThreshold?: number;
};

type LockedStyles = {
  htmlOverflow: string;
  htmlOverscrollY: string;
  bodyOverflow: string;
  bodyOverscrollY: string;
};

let mobilePageLockCount = 0;
let lockedStyles: LockedStyles | null = null;

function lockMobilePageScroll() {
  if (mobilePageLockCount === 0) {
    lockedStyles = {
      htmlOverflow: document.documentElement.style.overflow,
      htmlOverscrollY: document.documentElement.style.overscrollBehaviorY,
      bodyOverflow: document.body.style.overflow,
      bodyOverscrollY: document.body.style.overscrollBehaviorY,
    };

    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehaviorY = 'none';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehaviorY = 'none';
  }

  mobilePageLockCount += 1;
}

function unlockMobilePageScroll() {
  mobilePageLockCount = Math.max(0, mobilePageLockCount - 1);
  if (mobilePageLockCount !== 0 || !lockedStyles) return;

  document.documentElement.style.overflow = lockedStyles.htmlOverflow;
  document.documentElement.style.overscrollBehaviorY = lockedStyles.htmlOverscrollY;
  document.body.style.overflow = lockedStyles.bodyOverflow;
  document.body.style.overscrollBehaviorY = lockedStyles.bodyOverscrollY;
  lockedStyles = null;
}

/**
 * Gives mobile bottom drawers one consistent pull-down-to-close gesture while
 * preventing the browser's pull-to-refresh from taking over at scrollTop 0.
 */
export function useMobileDrawerNavigation<
  TDrawer extends HTMLElement = HTMLDivElement,
  TScrollArea extends HTMLElement = HTMLDivElement,
>({
  isOpen,
  onClose,
  disabled = false,
  mobileQuery = '(max-width: 1023px)',
  closeThreshold = 96,
}: MobileDrawerNavigationOptions) {
  const drawerRef = useRef<TDrawer>(null);
  const scrollAreaRef = useRef<TScrollArea>(null);
  const onCloseRef = useRef(onClose);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) return;

    const drawer = drawerRef.current;
    if (!drawer) return;

    const mediaQuery = window.matchMedia(mobileQuery);
    if (!mediaQuery.matches) return;

    const scrollArea = scrollAreaRef.current
      ?? drawer.querySelector<HTMLElement>('[data-mobile-drawer-scroll]');
    const previousDrawerOverscroll = drawer.style.overscrollBehaviorY;
    const previousScrollOverscroll = scrollArea?.style.overscrollBehaviorY ?? '';
    drawer.style.overscrollBehaviorY = 'contain';
    if (scrollArea) scrollArea.style.overscrollBehaviorY = 'contain';
    lockMobilePageScroll();

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let distance = 0;
    let mayDrag = false;
    let isDragging = false;
    let resetTimer: number | undefined;

    const resetDrawer = () => {
      drawer.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
      drawer.style.transform = 'translate3d(0, 0, 0)';
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        drawer.style.transition = '';
        drawer.style.transform = '';
      }, 230);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (disabledRef.current || event.touches.length !== 1) return;

      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = performance.now();
      distance = 0;
      isDragging = false;
      mayDrag = (scrollArea?.scrollTop ?? 0) <= 0;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!mayDrag || disabledRef.current || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaY = touch.clientY - startY;
      const deltaX = touch.clientX - startX;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        mayDrag = false;
        return;
      }

      if (deltaY <= 0 || (scrollArea?.scrollTop ?? 0) > 0) return;

      // This listener is deliberately non-passive: it keeps Chrome/Safari from
      // turning a drawer-dismiss gesture into a page refresh.
      event.preventDefault();
      distance = deltaY;
      isDragging = true;
      drawer.style.transition = 'none';
      drawer.style.transform = `translate3d(0, ${deltaY}px, 0)`;
    };

    const handleTouchEnd = () => {
      if (!isDragging) {
        mayDrag = false;
        return;
      }

      const elapsed = Math.max(performance.now() - startTime, 1);
      const velocity = distance / elapsed;
      const shouldClose = !disabledRef.current
        && (distance >= closeThreshold || (distance >= 36 && velocity >= 0.55));

      mayDrag = false;
      isDragging = false;

      if (!shouldClose) {
        resetDrawer();
        return;
      }

      drawer.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)';
      drawer.style.transform = 'translate3d(0, 100%, 0)';
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        onCloseRef.current();
      }, 180);
    };

    drawer.addEventListener('touchstart', handleTouchStart, { passive: true });
    drawer.addEventListener('touchmove', handleTouchMove, { passive: false });
    drawer.addEventListener('touchend', handleTouchEnd, { passive: true });
    drawer.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.clearTimeout(resetTimer);
      drawer.removeEventListener('touchstart', handleTouchStart);
      drawer.removeEventListener('touchmove', handleTouchMove);
      drawer.removeEventListener('touchend', handleTouchEnd);
      drawer.removeEventListener('touchcancel', handleTouchEnd);
      drawer.style.transition = '';
      drawer.style.transform = '';
      drawer.style.overscrollBehaviorY = previousDrawerOverscroll;
      if (scrollArea) scrollArea.style.overscrollBehaviorY = previousScrollOverscroll;
      unlockMobilePageScroll();
    };
  }, [closeThreshold, isOpen, mobileQuery]);

  return { drawerRef, scrollAreaRef };
}
