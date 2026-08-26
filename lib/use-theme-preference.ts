'use client';

import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'theme';
const THEME_CHANGE_EVENT = 'theme-preference-changed';
const THEME_TRANSITION_DURATION = 280;
const THEME_TRANSITION_EASING = 'cubic-bezier(0.23, 1, 0.32, 1)';

export type ThemeTransitionOrigin = {
  clientX: number;
  clientY: number;
  detail?: number;
};

type ViewTransitionLike = {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition?: () => void;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransitionLike;
};

let activeViewTransition: ViewTransitionLike | null = null;
let activeThemeAnimation: Animation | null = null;

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system'
    ? stored
    : 'system';
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyResolvedTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  root.style.backgroundColor = theme === 'dark' ? '#050505' : '#f8fafb';
}

function getTransitionOrigin(source?: ThemeTransitionOrigin): ThemeTransitionOrigin | null {
  if (!source || source.detail === 0) return null;
  if (!Number.isFinite(source.clientX) || !Number.isFinite(source.clientY)) return null;
  return source;
}

function applyThemeWithTransition(
  commitTheme: () => void,
  source?: ThemeTransitionOrigin
) {
  const origin = getTransitionOrigin(source);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const transitionDocument = document as ViewTransitionDocument;
  const startViewTransition = transitionDocument.startViewTransition?.bind(document);

  if (!origin || reduceMotion) {
    commitTheme();
    return;
  }

  if (!startViewTransition) {
    commitTheme();
    activeThemeAnimation?.cancel();
    activeThemeAnimation = document.body.animate(
      [{ opacity: 0.88 }, { opacity: 1 }],
      {
        duration: 180,
        easing: THEME_TRANSITION_EASING,
      }
    );
    return;
  }

  activeViewTransition?.skipTransition?.();
  activeThemeAnimation?.cancel();

  const root = document.documentElement;
  root.dataset.themeTransition = 'active';

  const transition = startViewTransition(() => {
    flushSync(commitTheme);
  });
  activeViewTransition = transition;

  transition.ready
    .then(() => {
      const farthestX = Math.max(origin.clientX, window.innerWidth - origin.clientX);
      const farthestY = Math.max(origin.clientY, window.innerHeight - origin.clientY);
      const radius = Math.hypot(farthestX, farthestY);

      activeThemeAnimation = root.animate(
        {
          clipPath: [
            `circle(0px at ${origin.clientX}px ${origin.clientY}px)`,
            `circle(${radius}px at ${origin.clientX}px ${origin.clientY}px)`,
          ],
        },
        {
          duration: THEME_TRANSITION_DURATION,
          easing: THEME_TRANSITION_EASING,
          pseudoElement: '::view-transition-new(root)',
        }
      );
    })
    .catch(() => {
      // The browser can reject `ready` when a rapid second toggle supersedes it.
    });

  transition.finished.finally(() => {
    if (activeViewTransition !== transition) return;
    delete root.dataset.themeTransition;
    activeViewTransition = null;
    activeThemeAnimation = null;
  });
}

export function useThemePreference() {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const syncTheme = () => {
      const nextPreference = readStoredPreference();
      const nextResolvedTheme = resolveTheme(nextPreference);
      setPreferenceState(nextPreference);
      setResolvedTheme(nextResolvedTheme);
      applyResolvedTheme(nextResolvedTheme);
    };

    const handleSystemThemeChange = () => {
      if (readStoredPreference() === 'system') syncTheme();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) syncTheme();
    };

    syncTheme();
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    window.addEventListener('storage', handleStorage);
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
    };
  }, []);

  const setPreference = useCallback((
    nextPreference: ThemePreference,
    source?: ThemeTransitionOrigin
  ) => {
    localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    const nextResolvedTheme = resolveTheme(nextPreference);
    applyThemeWithTransition(() => {
      setPreferenceState(nextPreference);
      setResolvedTheme(nextResolvedTheme);
      applyResolvedTheme(nextResolvedTheme);
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    }, source);
  }, []);

  const toggleTheme = useCallback((source?: ThemeTransitionOrigin) => {
    setPreference(resolvedTheme === 'dark' ? 'light' : 'dark', source);
  }, [resolvedTheme, setPreference]);

  return { preference, resolvedTheme, setPreference, toggleTheme };
}
