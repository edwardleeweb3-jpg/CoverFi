"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/hooks/useT";
import { money } from "@/lib/format";

interface Props {
  /** Used to keep the gradient ID unique when multiple curves coexist. */
  policyId: string;
  /** Policy principal (USDC) — y-axis cap. */
  principal: number;
  /**
   * Days since settlement, capped at 365. The solid line/area runs from
   * day 0 (left edge) to day `cap`; anything past `cap` is hypothetical
   * (the dashed diagonal hints at the ultimate 100% point on day 365).
   */
  cap: number;
  /** True when policy is `completed` — switches the curve color to --good. */
  good: boolean;
}

/** viewBox dimensions — preserveAspectRatio="none" lets the SVG stretch. */
const W = 560;
const H = 140;

/**
 * Interactive release curve. Static layers (gradient fill, dashed
 * diagonal, solid line, end-point dot) come from React JSX. Hover
 * indicators (vertical line, moving dot, tooltip) are updated
 * imperatively in a mousemove handler — declarative React would burn
 * the diff cycle on every pixel, and the values are pure presentation.
 */
export function ReleaseCurve({ policyId, principal, cap, good }: Props) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipDayRef = useRef<HTMLSpanElement>(null);
  const tipValueRef = useRef<HTMLSpanElement>(null);

  const relX = (cap / 365) * W;
  const relY = H - (cap / 365) * H;
  const col = good ? "var(--good)" : "var(--signal)";
  const gradId = `cv-${policyId}`;

  useEffect(() => {
    const svg = svgRef.current;
    const line = lineRef.current;
    const dot = dotRef.current;
    const tip = tipRef.current;
    const tipDay = tipDayRef.current;
    const tipValue = tipValueRef.current;
    if (!svg || !line || !dot || !tip || !tipDay || !tipValue) return;

    const move = (e: MouseEvent) => {
      const r = svg.getBoundingClientRect();
      const px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const day = Math.round(px * 365);
      const released =
        day <= cap ? principal * (day / 365) : principal * (cap / 365);
      const sx = px * W;
      const sy = H - (released / principal) * H;

      line.setAttribute("x1", String(sx));
      line.setAttribute("x2", String(sx));
      line.style.opacity = day <= cap ? "0.6" : "0.25";

      dot.setAttribute("cx", String(sx));
      dot.setAttribute("cy", String(sy));
      dot.style.opacity = day <= cap ? "1" : "0.4";

      tip.style.opacity = "1";
      tipDay.textContent = `${t.curveDay} ${day} / 365`;
      tipValue.textContent = `${money(released)} USDC ${t.curveReleased}`;

      const tx = Math.min(
        Math.max(e.clientX - r.left - tip.offsetWidth / 2, 0),
        r.width - tip.offsetWidth,
      );
      tip.style.left = `${tx}px`;
      // sy is in viewBox space; matches prototype's direct usage. Render
      // ratio is close to 1:1 in practice (panel widths ≈ viewBox width).
      tip.style.top = `${Math.max(sy - tip.offsetHeight - 10, 0)}px`;
    };

    const leave = () => {
      line.style.opacity = "0";
      dot.style.opacity = "0";
      tip.style.opacity = "0";
    };

    svg.addEventListener("mousemove", move);
    svg.addEventListener("mouseleave", leave);
    return () => {
      svg.removeEventListener("mousemove", move);
      svg.removeEventListener("mouseleave", leave);
    };
  }, [principal, cap, t]);

  return (
    <div ref={wrapRef} className="curve-wrap" style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        className="curve"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={col} stopOpacity="0.22" />
            <stop offset="1" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Filled area under the curve. */}
        <path
          d={`M0 ${H} L${relX} ${relY} L${relX} ${H} Z`}
          fill={`url(#${gradId})`}
        />
        {/* Dashed diagonal indicating the ultimate 100% release on day 365. */}
        <path
          d={`M0 ${H} L${W} 0`}
          stroke="var(--line-3)"
          strokeWidth="1.5"
          strokeDasharray="4 5"
          fill="none"
        />
        {/* Solid curve from settlement (day 0) to current release point. */}
        <path
          d={`M0 ${H} L${relX} ${relY}`}
          stroke={col}
          strokeWidth="2.5"
          fill="none"
        />
        {/* Anchor dot at the current release point. */}
        <circle cx={relX} cy={relY} r="4.5" fill={col} />
        {/* Hover indicators — updated imperatively. */}
        <line
          ref={lineRef}
          className="cvline"
          x1="0"
          y1="0"
          x2="0"
          y2={H}
          stroke={col}
          strokeWidth="1"
          strokeDasharray="3 3"
          style={{ opacity: 0 }}
        />
        <circle
          ref={dotRef}
          className="cdot"
          r="4"
          fill={col}
          stroke="var(--surface)"
          strokeWidth="1.5"
        />
      </svg>
      <div ref={tipRef} className="ctip">
        <span ref={tipDayRef} className="ct-d" />
        <span ref={tipValueRef} className="ct-v" />
      </div>
    </div>
  );
}
