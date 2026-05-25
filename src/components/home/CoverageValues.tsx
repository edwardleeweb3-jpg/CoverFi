"use client";

import type { Dict } from "@/lib/i18n";
import type { IconName } from "@/components/ui/icon-paths";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/hooks/useT";
import { useInView } from "@/hooks/useInView";

interface SupportingValue {
  idx: string;
  icon: IconName;
  titleKey: keyof Pick<Dict, "v2t" | "v3t" | "v4t">;
  descKey: keyof Pick<Dict, "v2d" | "v3d" | "v4d">;
}

const SUPPORTING: SupportingValue[] = [
  { idx: "02", icon: "doc", titleKey: "v2t", descKey: "v2d" },
  { idx: "03", icon: "code", titleKey: "v3t", descKey: "v3d" },
  { idx: "04", icon: "layer", titleKey: "v4t", descKey: "v4d" },
];

/**
 * "Coverage that behaves predictably" section. One feature card on the
 * left (100% principal coverage — the load-bearing promise), three
 * supporting rows on the right.
 */
export function CoverageValues() {
  const t = useT();
  const { ref, inView } = useInView<HTMLElement>();

  return (
    <section
      ref={ref}
      className={`block reveal${inView ? " seen" : ""}`}
      id="value"
    >
      <div className="wrap">
        <p className="lbl">{t.coverage}</p>
        <h2 className="h2">{t.whatCoverageH}</h2>
        <p className="sectlede">{t.whatCoverageLede}</p>

        <div className="valwrap">
          <div className="val-feature stagger">
            <svg className="vf-motif" viewBox="0 0 100 100" aria-hidden="true">
              <rect className="vfm-fr" x="14" y="14" width="72" height="72" rx="16" />
              <rect className="vfm-sq" x="26" y="26" width="28" height="28" rx="7" />
            </svg>
            <span className="vf-tag">
              <span className="vft-dot" />
              {t.vfTag}
            </span>
            <div className="vf-icon">
              <Icon name="shield" size={24} />
            </div>
            <div className="vf-h">{t.v1t}</div>
            <p className="vf-p">{t.v1d}</p>
          </div>

          <div className="val-list stagger">
            {SUPPORTING.map((row) => (
              <div key={row.idx} className="val-row">
                <div className="vr-icon">
                  <Icon name={row.icon} size={19} />
                </div>
                <div className="vr-body">
                  <div className="vr-h">{t[row.titleKey]}</div>
                  <p className="vr-p">{t[row.descKey]}</p>
                </div>
                <span className="vr-idx">{row.idx}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
