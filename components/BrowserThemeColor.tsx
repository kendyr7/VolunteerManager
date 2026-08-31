'use client';

import { useEffect } from 'react';
import { clearStatusBarFeedback, getStatusBarFeedbackColor, subscribeStatusBarFeedback } from '@/lib/status-bar-feedback';

/** Match browser/status-bar chrome to the actual app surface, including login. */
export function BrowserThemeColor() {
  useEffect(() => {
    const root = document.documentElement;
    const syncColor = () => {
      const color = getStatusBarFeedbackColor() ?? getComputedStyle(root).getPropertyValue('--dark').trim();
      if (!color) return;
      document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
        // Avoid a mutation loop when observing Next's managed viewport metadata.
        if (meta.content !== color) meta.content = color;
      });
    };

    const unsubscribe = subscribeStatusBarFeedback(syncColor);
    const onVisibilityChange = () => {
      if (document.hidden) clearStatusBarFeedback();
      syncColor();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', syncColor);
    syncColor();
    const themeObserver = new MutationObserver(syncColor);
    themeObserver.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
    // Navigation can replace the viewport meta even though the root stays mounted.
    const headObserver = new MutationObserver(syncColor);
    headObserver.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content', 'name'] });
    return () => {
      clearStatusBarFeedback();
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', syncColor);
      themeObserver.disconnect();
      headObserver.disconnect();
    };
  }, []);

  return null;
}
