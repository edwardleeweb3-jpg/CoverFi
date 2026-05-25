import { create } from "zustand";
import type { Lang } from "@/lib/i18n";

interface LocaleStore {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useLocaleStore = create<LocaleStore>((set, get) => ({
  lang: "en", // SSR-safe default; corrected on client mount via LocaleEffects.
  setLang: (l) => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
      try {
        localStorage.setItem("coverfi-lang", l);
      } catch {
        /* ignore */
      }
    }
    if (get().lang !== l) set({ lang: l });
  },
}));

export function resolveDefaultLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem("coverfi-lang");
    if (stored === "en" || stored === "zh") return stored;
  } catch {
    /* ignore */
  }
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}
