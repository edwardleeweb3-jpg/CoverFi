"use client";

import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { useT } from "@/hooks/useT";
import { claimableOf, releasedOf } from "@/lib/pricing";
import { RELEASE_DAYS } from "@/lib/config";
import { money } from "@/lib/format";
import type { Policy } from "@/lib/mock";
import { ReleaseCurve } from "./ReleaseCurve";

interface Props {
  policy: Policy;
  onClaim: () => void;
  busy: boolean;
}

/**
 * The "principal release" panel shown for `releasing` and `completed`
 * policies. Composes:
 *   1. ReleaseCurve  — interactive SVG (gradient fill + dashed diagonal +
 *                      solid traced segment + hover tooltip).
 *   2. axis          — "settlement · day 0" ↔ "day 365"
 *   3. relrow        — 3 cells: Released, Claimed, Claimable (last cell
 *                      gets `.acc` blue highlight when claimable > 0).
 *   4. progress bar  — linear bar tracking total release ratio.
 *   5. "X of Y USDC released · Z%" mono line.
 *   6. Claim button (releasing) OR "Fully reimbursed" note (completed).
 */
export function ReleaseBlock({ policy, onClaim, busy }: Props) {
  const t = useT();
  const good = policy.status === "completed";
  const released = releasedOf(policy);
  const claimable = claimableOf(policy);
  const claimed = policy.claimed ?? 0;
  const cap = Math.min(policy.settledDaysAgo ?? 0, RELEASE_DAYS);
  const pctRaw = (released / policy.a) * 100;
  const pctTxt = pctRaw.toFixed(1);

  return (
    <Panel title={t.principalRelease} className="release-block">
      <ReleaseCurve
        policyId={policy.id}
        principal={policy.a}
        cap={cap}
        good={good}
      />
      <div className="axis">
        <span>{t.settlementDay0}</span>
        <span>{t.day365}</span>
      </div>

      <div className="relrow">
        <div className="c">
          <div className="l">{t.released}</div>
          <div className="v">{money(released)}</div>
        </div>
        <div className="c">
          <div className="l">{t.claimed}</div>
          <div className="v">{money(claimed)}</div>
        </div>
        <div className={`c${good ? "" : " acc"}`}>
          <div className="l">{t.claimableNowCol}</div>
          <div className="v">{money(claimable)}</div>
        </div>
      </div>

      <div className={`progress${good ? " g" : ""}`}>
        <div className="fill" style={{ width: `${pctTxt}%` }} />
      </div>
      <div className="release-ofline">
        {t.ofReleased(money(released), money(policy.a), pctTxt)}
      </div>

      {good ? (
        <div className="notebox release-done">{t.fullReimbursed}</div>
      ) : (
        <Button
          variant="primary"
          block
          className="release-claim-btn"
          onClick={onClaim}
          disabled={claimable <= 0 || busy}
        >
          {claimable > 0 ? t.claimBtn(money(claimable)) : t.nothingClaim}
        </Button>
      )}
    </Panel>
  );
}
