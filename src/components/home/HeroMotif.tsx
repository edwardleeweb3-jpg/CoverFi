"use client";

import { BrandMark } from "@/components/ui/Icon";
import { useT } from "@/hooks/useT";

/**
 * The diagonal-stacked policy-cards visual that sits to the right of the
 * hero copy. Three cards (back/middle/front) showing three lifecycle
 * states — Reimbursed, Coverage active, Paying out. Pure decoration;
 * data is illustrative.
 */
export function HeroMotif() {
  const t = useT();

  return (
    <div className="hv2-stage">
      <div className="hv2-deck">
        {/* Card C — back, faded · a fully-reimbursed policy */}
        <div className="hv2-card hv2-card-c">
          <div className="hv2-c-head">
            <span className="hv2-c-brand">
              <BrandMark className="hv2-c-mark" />
              <span className="hv2-c-id">CF-00150</span>
            </span>
            <span className="hv2-c-badge b-good">
              <span className="hv2-c-dot" />
              {t.stsCompleted}
            </span>
          </div>
          <div className="hv2-c-mini">
            <span className="mk">{t.recovered}</span>
            <span className="mv">
              364.25<i> USDC</i>
            </span>
          </div>
        </div>

        {/* Card B — middle · coverage active, pre-settlement */}
        <div className="hv2-card hv2-card-b">
          <div className="hv2-c-head">
            <span className="hv2-c-brand">
              <BrandMark className="hv2-c-mark" />
              <span className="hv2-c-id">CF-00221</span>
            </span>
            <span className="hv2-c-badge b-mut">
              <span className="hv2-c-dot" />
              {t.stsActive}
            </span>
          </div>
          <div className="hv2-c-mini">
            <span className="mk">{t.coverageCol}</span>
            <span className="mv">
              792.30<i> USDC</i>
            </span>
          </div>
        </div>

        {/* Card A — front · paying out, the hero feature card */}
        <div className="hv2-card hv2-card-a">
          <div className="hv2-c-head">
            <span className="hv2-c-brand">
              <BrandMark className="hv2-c-mark" />
              <span className="hv2-c-id">CF-00231</span>
            </span>
            <span className="hv2-c-badge b-sig">
              <span className="hv2-c-dot live" />
              {t.stsReleasing}
            </span>
          </div>
          <div className="hv2-c-mkt">{t.hvCardMkt}</div>
          <div className="hv2-c-div" />
          <div className="hv2-c-figs">
            <div className="hv2-c-fig">
              <span className="hv2-c-k">{t.principal}</span>
              <span className="hv2-c-v">
                638.50<i> USDC</i>
              </span>
            </div>
            <div className="hv2-c-fig">
              <span className="hv2-c-k">{t.coverageCol}</span>
              <span className="hv2-c-v accent">
                100<i>%</i>
              </span>
            </div>
          </div>
          <div className="hv2-c-rel">
            <div className="hv2-c-rel-top">
              <span className="hv2-c-k">{t.principalRelease}</span>
              <span className="hv2-c-rel-pct">63%</span>
            </div>
            <div className="hv2-c-bar">
              <i />
            </div>
          </div>
          <div className="hv2-c-foot">
            <span>{t.hvFootLeft}</span>
            <span>
              <b>{t.hvFootRight}</b>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
