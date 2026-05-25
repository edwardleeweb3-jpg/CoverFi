"use client";

import { useEffect, useRef, useState } from "react";

interface Options extends IntersectionObserverInit {
  /** Once visible, stop observing. Default: true. */
  once?: boolean;
}

/**
 * IntersectionObserver hook for scroll-reveal patterns.
 *
 * Respects `prefers-reduced-motion` (treats as always in view, so children
 * render in their final state without animation).
 *
 * Default options mirror prototype's home reveal: threshold 0.18 and a
 * rootMargin of `0px 0px -8% 0px` (fires slightly before fully visible).
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  opts: Options = {},
) {
  const { once = true, threshold = 0.18, rootMargin = "0px 0px -8% 0px" } = opts;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            setInView(true);
            if (once) obs.disconnect();
          } else if (!once) {
            setInView(false);
          }
        });
      },
      { threshold, rootMargin },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [once, threshold, rootMargin]);

  return { ref, inView };
}
