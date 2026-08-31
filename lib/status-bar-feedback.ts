export type StatusBarFeedbackType = 'success' | 'error' | 'info';

// Related to the toast palette, with deeper shades for white system icons.
const feedbackStyles = {
  success: { color: '#047857', duration: 2000 },
  error: { color: '#be123c', duration: 3000 },
  info: { color: '#315ee0', duration: 2000 },
} as const;

let active: { token: symbol; color: string; expiresAt: number } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function getStatusBarFeedbackColor(): string | null {
  return active && active.expiresAt > Date.now() ? active.color : null;
}

export function subscribeStatusBarFeedback(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function clearStatusBarFeedback() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (!active) return;
  active = null;
  listeners.forEach(listener => listener());
}

/** Independent of toast timers: the latest visible message owns the brief tint. */
export function startStatusBarFeedback(type: StatusBarFeedbackType) {
  if (typeof window === 'undefined' || document.hidden) return () => {};
  const style = feedbackStyles[type];
  const token = Symbol(type);
  if (timer !== null) clearTimeout(timer);
  active = { token, color: style.color, expiresAt: Date.now() + style.duration };
  const release = () => {
    // An older toast closing must never clear a newer message's color.
    if (active?.token === token) clearStatusBarFeedback();
  };
  timer = setTimeout(release, style.duration);
  listeners.forEach(listener => listener());
  return release;
}
