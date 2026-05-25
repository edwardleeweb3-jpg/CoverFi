"use client";

import { useT } from "@/hooks/useT";
import { useInView } from "@/hooks/useInView";
import { CountUp } from "./CountUp";

/**
 * Four-cell metric strip below the hero. The strip itself fades in via
 * the `.reveal` class; each `<CountUp>` independently triggers its
 * own digit animation when it enters the viewport.
 */
export function MetricBand() {
  const t = useT();
  const { ref, inView } = useInView<HTMLElement>();

  const cells = [
    { v: t.m1v, l: t.m1l },
    { v: t.m2v, l: t.m2l },
    { v: t.m3v, l: t.m3l },
    { v: t.m4v, l: t.m4l },
  ];

  return (
    <section ref={ref} className={`metricband reveal${inView ? " seen" : ""}`}>
      <div className="wrap">
        <div className="mb-grid">
          {cells.map((c, i) => (
            <div key={i} className="mb-cell stagger">
              <div className="mb-v">
                <CountUp target={c.v} />
              </div>
              <div className="mb-l">{c.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
