"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  /**
   * Target string. The numeric part is parsed and animated; any non-digit
   * prefix/suffix is preserved verbatim. Examples that work:
   *   "100%"      → "100" digits, "%" suffix
   *   "$3.9M"     → "$" prefix, "3.9" digits, "M" suffix
   *   "1,284"     → grouped digits with thousands separator
   *   "365 天"    → "365" digits, " 天" suffix (CJK)
   */
  target: string;
  className?: string;
  /** Animation length in ms. Default 1100 (matches prototype). */
  durationMs?: number;
}

/**
 * Animates a numeric target on first scroll-into-view. Honors
 * prefers-reduced-motion (just renders the final value).
 *
 * SSR-safe: the initial render returns the target as-is, so the page
 * shows the correct number even without JS. On hydration the effect
 * may briefly swap to "0" before animating up — acceptable for a
 * marketing metric.
 */
export function CountUp({ target, className, durationMs = 1100 }: CountUpProps) {
  const [display, setDisplay] = useState(target);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(target);
      return;
    }

    // Parse `(non-digit prefix)(digits)(any suffix)`.
    const m = target.match(/^([^\d]*)([\d,.]+)(.*)$/);
    if (!m) {
      setDisplay(target);
      return;
    }
    const prefix = m[1];
    const suffix = m[3];
    const clean = m[2].replace(/,/g, "");
    const end = parseFloat(clean);
    if (isNaN(end)) {
      setDisplay(target);
      return;
    }
    const decimals = (clean.split(".")[1] || "").length;
    const grouped = m[2].includes(",");

    const fmt = (v: number) => {
      let s = v.toFixed(decimals);
      if (grouped) {
        s = parseFloat(s).toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      }
      return prefix + s + suffix;
    };

    let frame = 0;
    let started = false;

    const animate = () => {
      if (started) return;
      started = true;
      const t0 = performance.now();
      setDisplay(fmt(0));

      const tick = (now: number) => {
        const p = Math.min((now - t0) / durationMs, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(fmt(end * eased));
        if (p < 1) frame = requestAnimationFrame(tick);
        else setDisplay(target);
      };
      frame = requestAnimationFrame(tick);
    };

    if (!("IntersectionObserver" in window)) {
      animate();
      return;
    }

    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            animate();
            obs.disconnect();
          }
        });
      },
      { threshold: 0.5 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [target, durationMs]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
