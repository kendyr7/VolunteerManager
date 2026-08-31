'use client'

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { startStatusBarFeedback } from "@/lib/status-bar-feedback"

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  isVisible: boolean
  onClose: () => void
  actionLabel?: string
  onAction?: () => void
  duration?: number
}

const TOAST_STYLES = {
  success: {
    title: 'Listo',
    icon: 'check_circle',
    accent: 'bg-emerald-500',
    iconSurface: 'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  },
  error: {
    title: 'Algo salió mal',
    icon: 'error',
    accent: 'bg-rose-500',
    iconSurface: 'bg-rose-500/12 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  },
  info: {
    title: 'Información',
    icon: 'info',
    accent: 'bg-[#4d7cfe]',
    iconSurface: 'bg-[#4d7cfe]/12 text-[#416ee5] dark:bg-[#4d7cfe]/15 dark:text-[#7c9cff]',
  },
} as const

export function Toast({
  message,
  type = 'success',
  isVisible,
  onClose,
  actionLabel,
  onAction,
  duration,
}: ToastProps) {
  const shouldReduceMotion = useReducedMotion()
  const [isPaused, setIsPaused] = React.useState(false)
  const closeRef = React.useRef(onClose)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAtRef = React.useRef(0)
  const remainingRef = React.useRef(0)
  const displayDuration = duration ?? (actionLabel && onAction ? 8000 : type === 'error' ? 6500 : 4500)
  const visual = TOAST_STYLES[type]

  // Companion system-bar feedback only; toast rendering and timing stay intact.
  React.useEffect(() => {
    if (isVisible) return startStatusBarFeedback(type)
  }, [isVisible, message, type])

  React.useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = React.useCallback((remaining: number) => {
    clearTimer()
    remainingRef.current = remaining
    startedAtRef.current = performance.now()
    timerRef.current = setTimeout(() => closeRef.current(), remaining)
  }, [clearTimer])

  const pauseTimer = React.useCallback(() => {
    if (!isVisible || !timerRef.current) return
    const elapsed = performance.now() - startedAtRef.current
    remainingRef.current = Math.max(0, remainingRef.current - elapsed)
    clearTimer()
    setIsPaused(true)
  }, [clearTimer, isVisible])

  const resumeTimer = React.useCallback(() => {
    if (!isVisible || timerRef.current || remainingRef.current <= 0) return
    setIsPaused(false)
    startTimer(remainingRef.current)
  }, [isVisible, startTimer])

  React.useEffect(() => {
    clearTimer()
    setIsPaused(false)

    if (!isVisible) return

    remainingRef.current = displayDuration
    startTimer(displayDuration)
    return clearTimer
  }, [isVisible, message, type, actionLabel, displayDuration, clearTimer, startTimer])

  React.useEffect(() => {
    if (!isVisible) return

    const handleVisibilityChange = () => {
      if (document.hidden) pauseTimer()
      else resumeTimer()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isVisible, pauseTimer, resumeTimer])

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-12px) scale(0.98)' }}
          animate={{ opacity: 1, transform: 'translateY(0) scale(1)' }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-8px) scale(0.98)' }}
          transition={{ duration: shouldReduceMotion ? 0.12 : 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="pointer-events-none fixed inset-x-0 top-[calc(1rem+env(safe-area-inset-top))] z-[400] flex justify-center px-4"
        >
          <div
            role={type === 'error' ? 'alert' : 'status'}
            aria-live={type === 'error' ? 'assertive' : 'polite'}
            onMouseEnter={pauseTimer}
            onMouseLeave={resumeTimer}
            onFocusCapture={pauseTimer}
            onBlurCapture={resumeTimer}
            className="pointer-events-auto relative flex w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_18px_50px_-18px_rgba(15,23,42,0.42)] backdrop-blur-xl dark:border-white/10 dark:bg-[#17191f]/95 dark:shadow-[0_22px_60px_-20px_rgba(0,0,0,0.8)]"
          >
            <div className={cn("w-1 shrink-0", visual.accent)} aria-hidden="true" />

            <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
              <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", visual.iconSurface)}>
                <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                  {visual.icon}
                </span>
              </div>

              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[13px] font-extrabold leading-4 text-slate-900 dark:text-white">
                  {visual.title}
                </p>
                <p className="mt-1 break-words text-[13px] font-medium leading-5 text-slate-600 dark:text-slate-300">
                  {message}
                </p>

                {actionLabel && onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      onAction()
                      closeRef.current()
                    }}
                    className="mt-2.5 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[#4d7cfe]/10 px-2.5 text-xs font-extrabold text-[#416ee5] transition-[background-color,transform] duration-150 ease-out hover:bg-[#4d7cfe]/18 active:scale-[0.97] dark:text-[#8aa6ff]"
                  >
                    <span className="material-symbols-outlined text-[15px]" aria-hidden="true">undo</span>
                    {actionLabel}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => closeRef.current()}
                aria-label="Cerrar notificación"
                className="-mr-1 -mt-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-[background-color,color,transform] duration-150 ease-out hover:bg-slate-100 hover:text-slate-700 active:scale-[0.97] dark:hover:bg-white/8 dark:hover:text-white"
              >
                <span className="material-symbols-outlined text-[19px]" aria-hidden="true">close</span>
              </button>
            </div>

            <div className="absolute inset-x-1 bottom-0 h-0.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/8" aria-hidden="true">
              <div
                key={`${message}:${type}:${actionLabel ?? ''}`}
                className={cn("toast-progress h-full origin-left", visual.accent)}
                style={{
                  animationDuration: `${displayDuration}ms`,
                  animationPlayState: isPaused ? 'paused' : 'running',
                }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
