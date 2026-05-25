"use client";

import { useEffect } from "react";
import { readDomTheme, resolveDefaultTheme, useThemeStore } from "@/stores/theme";

/**
 * Mounts once at the root to keep the Zustand theme store in sync with the
 * `data-theme` attribute on <html> (which the inline bootstrap script writes
 * before first paint). Watches via MutationObserver, so external mutations
 * (HMR, devtools, future components) flow into React state automatically.
 */
export function ThemeEffects() {
  useEffect(() => {
    const sync = () => {
      const v = readDomTheme();
      if (v) {
        useThemeStore.getState()._syncFromDom(v);
      } else {
        // HMR or some external code stripped the attribute — restore it.
        useThemeStore.getState().setTheme(resolveDefaultTheme());
      }
    };

    sync();

    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  return null;
}
