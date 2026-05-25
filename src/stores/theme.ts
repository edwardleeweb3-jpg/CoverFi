import { create } from "zustand";

export type Theme = "dark" | "light";

interface ThemeStore {
  theme: Theme;
  /** User-initiated theme change. Writes DOM + localStorage AND updates store. */
  setTheme: (t: Theme) => void;
  /** Internal: store-only update (used by MutationObserver sync to avoid DOM write loops). */
  _syncFromDom: (t: Theme) => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: "dark", // SSR-safe default; corrected on client mount.
  setTheme: (t) => {
    if (typeof document !== "undefined") {
      const current = document.documentElement.getAttribute("data-theme");
      if (current !== t) {
        document.documentElement.setAttribute("data-theme", t);
      }
      try {
        localStorage.setItem("coverfi-theme", t);
      } catch {
        /* ignore */
      }
    }
    if (get().theme !== t) set({ theme: t });
  },
  _syncFromDom: (t) => {
    if (get().theme !== t) set({ theme: t });
  },
}));

/** Read the live data-theme attribute on <html>. */
export function readDomTheme(): Theme | null {
  if (typeof document === "undefined") return null;
  const v = document.documentElement.getAttribute("data-theme");
  return v === "light" || v === "dark" ? v : null;
}

/** Fall back to localStorage or system preference when the DOM attribute is missing. */
export function resolveDefaultTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem("coverfi-theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
