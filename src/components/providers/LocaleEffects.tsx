"use client";

import { useEffect } from "react";
import { resolveDefaultLang, useLocaleStore } from "@/stores/locale";

/** Mount-time: read language from localStorage / browser, hydrate store, set <html lang>. */
export function LocaleEffects() {
  useEffect(() => {
    useLocaleStore.getState().setLang(resolveDefaultLang());
  }, []);

  return null;
}
