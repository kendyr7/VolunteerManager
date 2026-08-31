"use client";

import { useEffect } from "react";
import { recordLoginActivity } from "@/lib/login-experience";

export function LoginActivityTracker() {
  useEffect(() => {
    let lastWrite = 0;
    const record = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastWrite < 1000) return;
      lastWrite = now;
      recordLoginActivity(now);
    };
    // Only real interactions count. Polling, rendering, hiding the tab and
    // automatic logout must not turn an inactive visit into a recent one.
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach(event => document.addEventListener(event, record, { passive: true, capture: true }));
    return () => events.forEach(event => document.removeEventListener(event, record, true));
  }, []);
  return null;
}
