"use client";

import { Fragment } from "react";
import type { Dict } from "@/lib/i18n";
import type { IconName } from "@/components/ui/icon-paths";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/hooks/useT";
import { useInView } from "@/hooks/useInView";

interface Step {
  seq: string;
  icon: IconName;
  titleKey: keyof Pick<Dict, "st1t" | "st2t" | "st3t">;
  descKey: keyof Pick<Dict, "st1d" | "st2d" | "st3d">;
  metaKey: keyof Pick<Dict, "st1m" | "st2m" | "st3m">;
}

const STEPS: Step[] = [
  { seq: "01", icon: "fStep1", titleKey: "st1t", descKey: "st1d", metaKey: "st1m" },
  { seq: "02", icon: "fStep2", titleKey: "st2t", descKey: "st2d", metaKey: "st2m" },
  { seq: "03", icon: "fStep3", titleKey: "st3t", descKey: "st3d", metaKey: "st3m" },
];

/**
 * "Three steps" section. The section fades in via .reveal; the .flow
 * grid gets a separate `.lit` class with a higher threshold (0.4) so
 * the top-edge accent lines on each step card light up sequentially
 * only when the grid is meaningfully visible.
 */
export function HowItWorks() {
  const t = useT();
  const { ref: sectionRef, inView: sectionSeen } = useInView<HTMLElement>();
  const { ref: flowRef, inView: flowLit } = useInView<HTMLDivElement>({
    threshold: 0.4,
  });

  return (
    <section
      ref={sectionRef}
      className={`block motif-bg reveal${sectionSeen ? " seen" : ""}`}
      id="how"
    >
      <div className="wrap">
        <p className="lbl">{t.howItWorks}</p>
        <h2 className="h2">{t.threeSteps}</h2>
        <p className="sectlede">{t.stepsLede}</p>

        <div ref={flowRef} className={`flow${flowLit ? " lit" : ""}`}>
          {STEPS.map((step, i) => (
            <Fragment key={step.seq}>
              {i > 0 && (
                <div className={`flow-link fl-${i}`}>
                  <Icon name="arrow" size={13} />
                </div>
              )}
              <div className="flow-step">
                <div className="fs-seq">
                  STEP <b>{step.seq}</b>
                </div>
                <div className="fs-badge">
                  <Icon name={step.icon} size={30} />
                </div>
                <div className="fs-body">
                  <h3>{t[step.titleKey]}</h3>
                  <p>{t[step.descKey]}</p>
                  <span className="fs-meta">
                    <span className="fm-dot" />
                    {t[step.metaKey]}
                  </span>
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
