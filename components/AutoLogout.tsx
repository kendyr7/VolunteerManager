'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/app/actions/auth';

const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const WARNING_DURATION_MS = 5 * 60 * 1000;
const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 10 * 1000;

const PUBLIC_PATHS = new Set(['/', '/login']);

function formatRemainingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function AutoLogout() {
  const router = useRouter();
  const pathname = usePathname();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(WARNING_DURATION_MS / 1000);

  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef(0);
  const lastHandledActivityRef = useRef(0);
  const lastSessionRefreshRef = useRef(0);
  const logoutInProgressRef = useRef(false);
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  const isPublicPath = PUBLIC_PATHS.has(pathname);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    warningTimerRef.current = null;
    logoutTimerRef.current = null;
    countdownTimerRef.current = null;
  }, []);

  const refreshSession = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastSessionRefreshRef.current < SESSION_REFRESH_INTERVAL_MS) return;

    lastSessionRefreshRef.current = now;
    try {
      const response = await fetch('/api/auth/session/refresh', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) lastSessionRefreshRef.current = 0;
    } catch {
      // A temporary network failure must not interrupt active work. The next
      // activity interval will retry the session refresh.
      lastSessionRefreshRef.current = 0;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    if (isPublicPath || logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;
    clearTimers();

    localStorage.removeItem('mock_role');
    localStorage.removeItem('mock_committee');
    localStorage.removeItem('authorization_snapshot');
    await logout();

    router.replace('/login?expired=idle');
    router.refresh();
  }, [clearTimers, isPublicPath, router]);

  const scheduleTimers = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    setRemainingSeconds(WARNING_DURATION_MS / 1000);

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
    }, IDLE_TIMEOUT_MS - WARNING_DURATION_MS);

    logoutTimerRef.current = setTimeout(() => {
      void handleLogout();
    }, IDLE_TIMEOUT_MS);
  }, [clearTimers, handleLogout]);

  const registerActivity = useCallback((force = false) => {
    if (isPublicPath) return;

    const now = Date.now();
    if (
      lastActivityRef.current > 0 &&
      now - lastActivityRef.current >= IDLE_TIMEOUT_MS
    ) {
      void handleLogout();
      return;
    }
    if (!force && now - lastHandledActivityRef.current < ACTIVITY_THROTTLE_MS) return;

    lastHandledActivityRef.current = now;
    lastActivityRef.current = now;
    scheduleTimers();
    void refreshSession(force);
  }, [handleLogout, isPublicPath, refreshSession, scheduleTimers]);

  useEffect(() => {
    if (isPublicPath) {
      clearTimers();
      return;
    }

    logoutInProgressRef.current = false;
    registerActivity(true);

    const activityEvents = [
      'pointerdown',
      'pointermove',
      'keydown',
      'touchstart',
      'wheel',
      'scroll',
    ];
    const handleActivity = () => registerActivity();
    const handleFocus = () => registerActivity(true);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') registerActivity(true);
    };

    activityEvents.forEach(eventName => {
      document.addEventListener(eventName, handleActivity, { passive: true, capture: true });
    });
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      activityEvents.forEach(eventName => {
        document.removeEventListener(eventName, handleActivity, true);
      });
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimers();
    };
  }, [clearTimers, isPublicPath, registerActivity]);

  useEffect(() => {
    if (!showWarning) {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil((lastActivityRef.current + IDLE_TIMEOUT_MS - Date.now()) / 1000)
      );
      setRemainingSeconds(remaining);
      if (remaining === 0) void handleLogout();
    };

    updateCountdown();
    countdownTimerRef.current = setInterval(updateCountdown, 1000);
    continueButtonRef.current?.focus();

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    };
  }, [handleLogout, showWarning]);

  if (!showWarning || isPublicPath) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-warning-title"
        aria-describedby="session-warning-description"
        className="w-full max-w-sm rounded-xl border border-border bg-dark2 p-5 shadow-md"
      >
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
          <span className="material-symbols-outlined text-[22px]">schedule</span>
        </div>

        <h2 id="session-warning-title" className="text-lg font-bold text-text">
          Tu sesión está por cerrarse
        </h2>
        <p id="session-warning-description" className="mt-1 text-sm leading-5 text-text-dim">
          No detectamos actividad reciente. Tu sesión se cerrará automáticamente para proteger la información.
        </p>

        <div className="my-5 rounded-lg bg-dark3 px-4 py-3 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-dim">Tiempo restante</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-text">
            {formatRemainingTime(remainingSeconds)}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button
            ref={continueButtonRef}
            type="button"
            onClick={() => registerActivity(true)}
            className="h-10 flex-1 rounded-lg bg-[#4d7cfe] px-4 text-sm font-bold text-white transition-colors hover:bg-[#3b66e0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] focus-visible:ring-offset-2 focus-visible:ring-offset-dark2"
          >
            Continuar sesión
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="h-10 flex-1 rounded-lg border border-border px-4 text-sm font-bold text-text transition-colors hover:bg-dark3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
          >
            Cerrar sesión ahora
          </button>
        </div>
      </div>
    </div>
  );
}
