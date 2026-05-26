"use client";

import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { useT } from "@/hooks/useT";
import { RELEASE_DAYS } from "@/lib/config";
import { money } from "@/lib/format";
import type { Policy, PolicyStatus } from "@/lib/mock";
import { ReleaseCurve } from "./ReleaseCurve";

interface Props {
  policy: Policy;
  onClaim: () => void;
  busy: boolean;
  /** Live values read from the chain by the parent (detail page).
   *  `null` while wagmi's `useReadContract` hasn't returned data
   *  yet — the relrow / progress / claim button all render a
   *  loading sentinel ("—" / 0% width / disabled button) when so.
   *  Once loaded, these are the authoritative numbers and match
   *  PolicyOverview + PolicyRow + the contract to the wei.
   *
   *  No fallback to `lib/pricing.ts` here on purpose: the float
   *  helpers compute from `settledDaysAgo` (a day-floored DB
   *  derivative) and that approximation was the source of the
   *  Phase F-3 "first 24h shows 0" bug. Better to show "—" for
   *  the brief load window than to show a wrong value. */
  released: number | null;
  claimable: number | null;
  claimed: number | null;
  /** Status as known to the chain — detail page reads it live and
   *  falls back to DB only for first-paint. */
  status: PolicyStatus;
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
  released,
  claimable,
  claimed,
  status,
}: Props) {
  const t = useT();
  const good = status === "completed";
  // ReleaseCurve still uses the day-floored `settledDaysAgo` for its
  // x-position cap — it's a visual estimate, not the authoritative
  // released number (that's the relrow / progress line below). Will
  // show a sub-day curve at day 0 for the first 24h post-settle;
  // acceptable visual approximation.
  const cap = Math.min(policy.settledDaysAgo ?? 0, RELEASE_DAYS);
  const pctRaw = released === null ? 0 : (released / policy.a) * 100;
  const pctTxt = pctRaw.toFixed(1);

  // 0.01 USDC threshold = the display resolution (`money()` uses 2
  // decimal places). Below this the button would read "Claim 0.00
  // USDC" while still being clickable — misleading and wastes the
  // user's gas. `null` means "chain read still loading" — same
  // treatment, button disabled.
  const claimAmount =
    claimable !== null && claimable >= 0.01 ? claimable : null;

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
          <div className="v">{released === null ? "—" : money(released)}</div>
        </div>
        <div className="c">
          <div className="l">{t.claimed}</div>
          <div className="v">{claimed === null ? "—" : money(claimed)}</div>
        </div>
        <div className={`c${good ? "" : " acc"}`}>
          <div className="l">{t.claimableNowCol}</div>
          <div className="v">
            {claimable === null ? "—" : money(claimable)}
          </div>
        </div>
      </div>

      <div className={`progress${good ? " g" : ""}`}>
        <div
          className="fill"
          style={{ width: released === null ? "0%" : `${pctTxt}%` }}
        />
      </div>
      <div className="release-ofline">
        {released === null
          ? "—"
          : t.ofReleased(money(released), money(policy.a), pctTxt)}
      </div>

      {good ? (
        <div className="notebox release-done">{t.fullReimbursed}</div>
      ) : (
        <Button
          variant="primary"
          block
          className="release-claim-btn"
          onClick={onClaim}
          disabled={claimAmount === null || busy}
        >
          {claimAmount === null
            ? t.nothingClaim
            : t.claimBtn(money(claimAmount))}
        </Button>
      )}
    </Panel>
  );
}
