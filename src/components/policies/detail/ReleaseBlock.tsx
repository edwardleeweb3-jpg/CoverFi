"use client";

import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { useT } from "@/hooks/useT";
import { claimableOf, releasedOf } from "@/lib/pricing";
import { RELEASE_DAYS } from "@/lib/config";
import { money } from "@/lib/format";
import type { Policy, PolicyStatus } from "@/lib/mock";
import { ReleaseCurve } from "./ReleaseCurve";

interface Props {
  policy: Policy;
  onClaim: () => void;
  busy: boolean;
  /**
   * Optional chain-sourced overrides — when provided, displace the
   * pricing-helper-derived values. Used by the detail page (E4) to
   * surface live `releasedOf` / `claimableOf` / `policies(id).claimed`
   * / `policies(id).status` from the contract, which are the
   * authoritative time-derived figures the DB can't track. `null`
   * means "chain read hasn't loaded yet" — fall back to the local
   * computation so the page renders something immediately.
   */
  releasedOverride?: number | null;
  claimableOverride?: number | null;
  claimedOverride?: number | null;
  statusOverride?: PolicyStatus;
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
export function ReleaseBlock({
  policy,
  onClaim,
  busy,
  releasedOverride,
  claimableOverride,
  claimedOverride,
  statusOverride,
}: Props) {
  const t = useT();
  const status = statusOverride ?? policy.status;
  const good = status === "completed";
  const released =
    releasedOverride !== undefined && releasedOverride !== null
      ? releasedOverride
      : releasedOf(policy);
  const claimable =
    claimableOverride !== undefined && claimableOverride !== null
      ? claimableOverride
      : claimableOf(policy);
  const claimed =
    claimedOverride !== undefined && claimedOverride !== null
      ? claimedOverride
      : (policy.claimed ?? 0);
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
        // 0.01 USDC threshold = the display resolution (`money()`
        // uses 2 decimal places). Below this the button would read
        // "Claim 0.00 USDC" while still being clickable, which is
        // both misleading and wastes the user's gas. Above the
        // threshold the button enables with the real amount.
        (() => {
          const canClaim = claimable >= 0.01;
          return (
            <Button
              variant="primary"
              block
              className="release-claim-btn"
              onClick={onClaim}
              disabled={!canClaim || busy}
            >
              {canClaim ? t.claimBtn(money(claimable)) : t.nothingClaim}
            </Button>
          );
        })()
      )}
    </Panel>
  );
}
