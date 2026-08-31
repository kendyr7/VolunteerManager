"use client";

import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import Image from "next/image";
import { MeshGradientBackground } from "@/components/ui/mesh-gradient";
import { LOGIN_INTRO_IDLE_MS, readLoginActivity, recordLoginActivity, shouldShowTemple } from "@/lib/login-experience";
import styles from "./mobile-login.module.css";

export function MobileLoginShell({ isDark, hero, children }: {
  isDark: boolean;
  hero: ReactNode;
  children: ReactNode;
}) {
  const [page, setPage] = useState<number | null>(null);
  const [animateSwipe, setAnimateSwipe] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(10);
  const gesture = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const loginPanel = useRef<HTMLElement>(null);
  const heroButton = useRef<HTMLButtonElement>(null);
  const focusRequested = useRef(false);
  const initialPage = useRef<number | null>(null);
  const introShownForActivity = useRef<number | null>(null);
  const countdownRemaining = useRef(10);

  useEffect(() => {
    let cancelled = false;
    // Resolve storage before showing either panel: returning users must not
    // watch a flash of the temple or an entrance animation on every visit.
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (initialPage.current === null) {
        initialPage.current = shouldShowTemple(readLoginActivity()) ? 0 : 1;
        recordLoginActivity();
      }
      setPage(initialPage.current);
      setAutomatic(initialPage.current === 0);
    });

    const resume = () => {
      if (initialPage.current === null || document.hidden || !window.matchMedia("(max-width: 767px)").matches) return;
      if (shouldShowTemple(readLoginActivity())) {
        countdownRemaining.current = 10;
        setAnimateSwipe(false);
        setPage(0);
        setSecondsLeft(10);
        setAutomatic(true);
      }
      recordLoginActivity();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, []);

  useEffect(() => {
    if (page !== 1) return;
    // Check elapsed time, not interval ticks: mobile browsers suspend timers.
    const timer = window.setInterval(() => {
      const activity = readLoginActivity();
      if (!document.hidden && window.matchMedia("(max-width: 767px)").matches &&
          activity !== introShownForActivity.current && shouldShowTemple(activity)) {
        introShownForActivity.current = activity;
        setAnimateSwipe(false);
        setPage(0);
        setSecondsLeft(10);
        setAutomatic(true);
      }
    }, Math.min(LOGIN_INTRO_IDLE_MS, 15_000));
    return () => window.clearInterval(timer);
  }, [page]);

  useEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    if (page === 1) loginPanel.current?.focus({ preventScroll: true });
    else heroButton.current?.focus({ preventScroll: true });
  }, [page]);

  useEffect(() => {
    if (!automatic || page !== 0) return;
    countdownRemaining.current = 10;
    const timer = window.setInterval(() => {
      if (document.hidden || !window.matchMedia("(max-width: 767px)").matches) return;
      const remaining = --countdownRemaining.current;
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setAnimateSwipe(true);
        setPage(1);
        setAutomatic(false);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [automatic, page]);

  function goToPage(next: number) {
    recordLoginActivity();
    setAnimateSwipe(true);
    setAutomatic(false);
    focusRequested.current = true;
    setPage(next);
  }

  function startSwipe(event: PointerEvent<HTMLElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if ((event.target as HTMLElement).closest("button, input, a, label, select, textarea")) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function endSwipe(event: PointerEvent<HTMLElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const velocity = Math.abs(dx) / Math.max(1, event.timeStamp - start.time);
    if (Math.abs(dx) > Math.abs(dy) * 1.4 && (Math.abs(dx) > 48 || (Math.abs(dx) > 20 && velocity > 0.3))) {
      if (dx < 0 && page === 0) goToPage(1);
      else if (dx > 0 && page === 1) goToPage(0);
    }
  }

  return (
    <main className={`md:hidden ${styles.screen} ${styles.swipeViewport}`}
      onPointerDown={startSwipe} onPointerUp={endSwipe} onPointerCancel={() => { gesture.current = null; }}>
      {page === null && <p role="status" className={styles.status}>Preparando tu acceso…</p>}
      <div className={styles.swipeTrack} data-page={page} data-ready={page !== null} data-animate={animateSwipe}>
        <section className={styles.heroPanel} aria-label="Templo de Managua" aria-hidden={page !== 0} inert={page !== 0}>
          <Image src={isDark ? "/templodark.jpg" : "/templo.jpg"} alt="Templo de Managua" fill
            sizes="(max-width: 767px) 100vw, 1px" className={styles.heroImage} fetchPriority="high" />
          <div className={styles.heroShade} />
          <div className={styles.heroContent}>
            {hero}
            <button ref={heroButton} type="button" className={styles.heroContinue} onClick={() => goToPage(1)}>
              <span>Continuar a iniciar sesión</span>
              <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
            </button>
            <p className={styles.swipeHint}>{automatic ? `Desliza o continúa automáticamente en ${secondsLeft}s` : "Desliza para iniciar sesión"}</p>
          </div>
        </section>
        <section ref={loginPanel} tabIndex={-1} className={styles.loginPanel} aria-label="Iniciar sesión" data-mobile-login-panel
          aria-hidden={page !== 1} inert={page !== 1}>
          <div className={styles.animatedBackground} aria-hidden="true">
            <MeshGradientBackground
              colors={isDark ? ["#4d7cfe", "#1e3a8a", "#0ea5e9", "#2563eb"] : ["#60a5fa", "#3b82f6", "#93c5fd", "#2563eb"]}
              backgroundColor={isDark ? "#050a15" : "#f8fafc"} />
          </div>
          <div className={styles.body}>
            <button type="button" className={styles.backToTemple} onClick={() => goToPage(0)}>
              <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span> Templo
            </button>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
