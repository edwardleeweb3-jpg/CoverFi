"use client";

import { Button } from "@/components/ui/Button";
import { useT } from "@/hooks/useT";
import { claimableOf, releasedOf } from "@/lib/pricing";
import { money } from "@/lib/format";
import type { Policy } from "@/lib/mock";

interface Props {
  policies: Policy[];
  /** Optional — kept for future "real batch claim" support. When
   *  `batchHint` is set, the button is replaced by the hint text
   *  instead of being rendered. */
  onClaimAll?: () => void;
  busy?: boolean;
  /** When set, the Claim All button is replaced by this hint text.
   *  Used post-E4: the CoverFiPolicy contract has no batch method,
   *  so per-policy claim is the only path. */
  batchHint?: string;
}

/**
 * Four-cell coverage overview hero + release progress row + Claim All CTA.
 * Mirrors prototype's `portfolioOverview()` 1:1.
 *
 * Cells (left→right):
 *   1. Total insured principal (lead style, larger)
 *   2. Principal in payout (releasing + completed)
 *   3. Payout claimed cumulative
 *   4. Payout to claim (highlighted blue when > 0)
 *
 * The bottom `.pf-rel` row appears only when at least one policy is
 * releasing/completed; it shows the aggregated release progress and the
 * batch Claim All button (only when there's something to claim).
 */
export function PolicyOverview({
  policies,
  onClaimAll,
  busy,
  batchHint,
}: Props) {
  const t = useT();

  const totalPrincipal = policies.reduce((s, p) => s + p.a, 0);
  const covered = policies
    .filter((p) => p.status === "releasing" || p.status === "completed")
    .reduce((s, p) => s + p.a, 0);
  const claimed = policies.reduce((s, p) => s + (p.claimed ?? 0), 0);
  const claimable = policies.reduce((s, p) => s + claimableOf(p), 0);

  const rel = policies.filter(
    (p) => p.status === "releasing" || p.status === "completed",
  );
  const relReleased = rel.reduce((s, p) => s + releasedOf(p), 0);
  const relTotal = rel.reduce((s, p) => s + p.a, 0);
  const relPct = relTotal > 0 ? (relReleased / relTotal) * 100 : 0;

  const claimableCount = policies.filter((p) => claimableOf(p) > 0).length;
  const activeCount = policies.filter((p) => p.status === "active").length;

  return (
    <>
      <div className="ov-lbl">{t.ovTitle}</div>

      <div className="pf-hero">
        <div className="pf-hero-grid">
          <div className="pf-hcell lead">
            <div className="pf-k">{t.totalPrincipal}</div>
            <div className="pf-num">
              {money(totalPrincipal)}
              <span className="u">USDC</span>
            </div>
            <div className="pf-sub">{t.acrossN(policies.length)}</div>
          </div>

          <div className="pf-hcell">
            <div className="pf-k">{t.underCover}</div>
            <div className="pf-num">{money(covered)}</div>
            <div className="pf-sub">{t.activeN(activeCount)}</div>
          </div>

          <div className="pf-hcell">
            <div className="pf-k">{t.claimedPayout}</div>
            <div className="pf-num">{money(claimed)}</div>
            <div className="pf-sub">
              {relTotal > 0 ? `${money(relReleased)} ${t.releasedLc}` : "—"}
            </div>
          </div>

          <div className={`pf-hcell ${claimable > 0 ? "is-claim" : ""}`}>
            <div className="pf-k">{t.unclaimedPayout}</div>
            <div className={`pf-num ${claimable > 0 ? "sig" : ""}`}>
              {money(claimable)}
            </div>
            <div className="pf-sub">
              {claimableCount > 0 ? t.acrossPolicies(claimableCount) : "—"}
            </div>
          </div>
        </div>

        {relTotal > 0 && (
          <div className="pf-rel">
            <span className="pf-rel-meta">{t.principalRelease}</span>
            <div className="pf-rel-bar">
              <i style={{ width: `${relPct.toFixed(1)}%` }} />
            </div>
            <span className="pf-rel-fig">
              <b>{money(relReleased)}</b> / {money(relTotal)} USDC
            </span>
            <span className="pf-rel-pct">{relPct.toFixed(1)}%</span>
            {claimable > 0 &&
              (batchHint !== undefined ? (
                <span
                  className="pf-rel-fig"
                  style={{ fontStyle: "italic", opacity: 0.75 }}
                >
                  {batchHint}
                </span>
              ) : (
                onClaimAll && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onClaimAll}
                    disabled={busy}
                  >
                    {t.claimAll} · {money(claimable)} USDC
                  </Button>
                )
              ))}
          </div>
        )}
      </div>
    </>
  );
}
