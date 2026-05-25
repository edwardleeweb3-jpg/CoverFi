"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

interface Snapshot {
  attr: Theme | null;
  ink: string;
  bodyBg: string;
}

function readDomTheme(): Theme | null {
  const v = document.documentElement.getAttribute("data-theme");
  return v === "light" || v === "dark" ? v : null;
}

function resolveDefaultTheme(): Theme {
  try {
    const stored = localStorage.getItem("coverfi-theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("coverfi-theme", next);
  } catch {
    /* ignore */
  }
}

function snapshot(): Snapshot {
  return {
    attr: readDomTheme(),
    ink: getComputedStyle(document.documentElement).getPropertyValue("--ink").trim(),
    bodyBg: getComputedStyle(document.body).backgroundColor,
  };
}

/**
 * Temporary verification-only toggle for step 1.
 *
 * Source of truth = the `data-theme` attribute on `<html>`.
 * A MutationObserver keeps React state mirrored to that attribute.
 *
 * Diagnostic strip shows three independent reads:
 *   data-theme=…  (html attribute)
 *   --ink=…       (resolved CSS variable on :root)
 *   body.bg=…     (body's computed background-color)
 * If any of these disagree, we have a specific layer to investigate.
 *
 * Will be replaced by the real header lang/theme controls in step 3.
 */
export function ThemeToggleDebug() {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    // HMR can strip the attribute. Restore it before the user sees a mismatch.
    if (readDomTheme() === null) applyTheme(resolveDefaultTheme());

    const sync = () => setSnap(snapshot());
    sync();

    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  const toggle = () => {
    const current = readDomTheme() ?? resolveDefaultTheme();
    applyTheme(current === "dark" ? "light" : "dark");
  };

  return (
    <div className="mt-10 flex flex-col items-center gap-3">
      <button
        onClick={toggle}
        className="inline-flex items-center gap-2 rounded-s border border-line-2 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-text-2 hover:border-line-3 hover:text-text"
      >
        toggle theme · current: {snap?.attr ?? "…"}
      </button>

      <div className="font-mono text-[10px] leading-5 text-text-3">
        <div>
          data-theme=<span className="text-text-2">{snap?.attr ?? "(none)"}</span>
        </div>
        <div>
          --ink=<span className="text-text-2">{snap?.ink || "?"}</span>
        </div>
        <div>
          body.bg=<span className="text-text-2">{snap?.bodyBg || "?"}</span>
        </div>
      </div>
    </div>
  );
}
