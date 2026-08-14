'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type MobileNavigationMode = 'classic' | 'command';

const STORAGE_KEY = 'volunteer_manager_mobile_navigation';
const CHANGE_EVENT = 'mobile-navigation-mode-changed';

function readStoredMode(): MobileNavigationMode {
  if (typeof window === 'undefined') return 'classic';

  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'command' ? 'command' : 'classic';
  } catch {
    return 'classic';
  }
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => undefined;

  window.addEventListener(CHANGE_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);

  return () => {
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export function useMobileNavigationMode() {
  const mode = useSyncExternalStore(subscribe, readStoredMode, () => 'classic');

  const setMode = useCallback((nextMode: MobileNavigationMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // Keep the current page usable when browser storage is unavailable.
    }

    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return {
    mode,
    setMode,
    isCommandMode: mode === 'command',
  };
}
