"use client";

import { SignaMark } from "@/components/ui/Icon";
import { useT } from "@/hooks/useT";
import { useInView } from "@/hooks/useInView";

/**
 * "One integration. Live today." — Signa is the only supported market in
 * v1. Single card plus a mono note explaining more will arrive later.
 */
export function SupportedMarkets() {
  const t = useT();
  const { ref, inView } = useInView<HTMLElement>();

  return (
    <section
      ref={ref}
      className={`block reveal${inView ? " seen" : ""}`}
      id="markets"
    >
      <div className="wrap">
        <p className="lbl">{t.supportedMarkets}</p>
        <h2 className="h2">{t.marketsH}</h2>

        <div className="market-card">
          <div className="market-logo">
            <SignaMark />
          </div>
          <div className="market-body">
            <div className="market-name">Signa</div>
            <p className="market-desc">{t.signaDesc}</p>
          </div>
          <span className="market-status">
            <span className="ms-dot" />
            {t.liveIntegration}
          </span>
        </div>

        <p className="market-note">{t.moreMarkets}</p>
      </div>
    </section>
  );
}
