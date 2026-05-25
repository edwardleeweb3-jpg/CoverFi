import { useLocaleStore } from "@/stores/locale";
import { dictionaries } from "@/lib/i18n";

/** React hook returning the active dictionary for the current language. */
export function useT() {
  const lang = useLocaleStore((s) => s.lang);
  return dictionaries[lang];
}

/** Hook variant returning both lang and dict for cases that need the lang code. */
export function useLocale() {
  const lang = useLocaleStore((s) => s.lang);
  const setLang = useLocaleStore((s) => s.setLang);
  return { lang, t: dictionaries[lang], setLang };
}
