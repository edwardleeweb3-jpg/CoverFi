"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { Button } from "@/components/ui/Button";
import { useT } from "@/hooks/useT";
import {
  coverFiPolicyAbi,
  getContractAddresses,
} from "@/lib/contracts";
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

const USDC_DECIMALS = 6;

/**
 * Four-cell coverage overview hero + release progress row + Claim All CTA.
 * Mirrors prototype's `portfolioOverview()` 1:1.
 *
 * Cells (left→right):
 *   1. Total insured principal (lead style, larger)         ← DB-derived
 *   2. Principal in payout (releasing + completed)          ← DB-derived
 *   3. Payout claimed cumulative                            ← DB-derived
 *   4. Payout to claim (highlighted blue when > 0)          ← CHAIN
 *
 * `releasedOf` and `claimableOf` are time-derived (`elapsed × a /
 * RELEASE_PERIOD`) and the DB only stores absolute `settled_at`
 * timestamps. The previous frontend port computed them locally with
 * a Math.floor day count — which underreports for the first 24h
 * after settlement and drifts thereafter. Phase F-3 switches both
 * stats to live chain reads via `useReadContracts` (one batched RPC
 * per render), so overview numbers match the detail page and the
 * contract to the wei. Loading state shows "—" in those cells.
 */
export function PolicyOverview({
  policies,
  onClaimAll,
  busy,
  batchHint,
}: Props) {
  const t = useT();
  const COVER_FI = getContractAddresses().coverFiPolicy;

  // DB-derived stats (cheap, no chain dep).
  const totalPrincipal = policies.reduce((s, p) => s + p.a, 0);
  const covered = policies
    .filter((p) => p.status === "releasing" || p.status === "completed")
    .reduce((s, p) => s + p.a, 0);
  const claimed = policies.reduce((s, p) => s + (p.claimed ?? 0), 0);
  const activeCount = policies.filter((p) => p.status === "active").length;

  // Releasing/completed policies that have a chainPolicyId — the
  // ones we'll batch-read released/claimable for. `chainPolicyId`
  // is NOT NULL in the DB after migration 0001 so the filter is
  // primarily narrowing the union type for TS. The type predicate
  // narrows `chainPolicyId` from `bigint | undefined` to `bigint`
  // for the rest of the function — matches the detail page's
  // "no cast" idiom and means downstream code can use the field
  // directly. Runtime BigInt-ness is enforced upstream in
  // `rowToPolicy` (`chainPolicyId: BigInt(row.chain_policy_id)`).
  const rel = policies.filter(
    (p): p is Policy & { chainPolicyId: bigint } =>
      (p.status === "releasing" || p.status === "completed") &&
      p.chainPolicyId !== undefined,
  );
  const relTotal = rel.reduce((s, p) => s + p.a, 0);

  // Batch chain reads — released[] and claimable[] aligned to `rel`.
  // Empty contracts array + enabled:false when nothing to read.
  const sharedRead = {
    address: COVER_FI,
    abi: coverFiPolicyAbi,
  } as const;
  const releasedReads = useReadContracts({
    contracts: rel.map((p) => ({
      ...sharedRead,
      functionName: "releasedOf" as const,
      args: [p.chainPolicyId] as const,
    })),
    query: { enabled: rel.length > 0 },
  });
  const claimableReads = useReadContracts({
    contracts: rel.map((p) => ({
      ...sharedRead,
      functionName: "claimableOf" as const,
      args: [p.chainPolicyId] as const,
    })),
    query: { enabled: rel.length > 0 },
  });

  // Loading flag — true while we have releasing/completed policies
  // but haven't gotten chain data back yet. The four DB-derived stats
  // render unaffected; the chain-backed cells show "—" until ready.
  const chainLoading =
    rel.length > 0 &&
    (releasedReads.data === undefined || claimableReads.data === undefined);

  // Inline sum — wagmi's `useReadContracts` return type is a generic
  // tuple keyed off the `contracts` array, awkward to wrap in a
  // helper without losing inference. Each entry is either
  // `{ status: "success", result }` or `{ status: "failure", error }`.
  const relReleasedWei = (releasedReads.data ?? []).reduce<bigint>(
    (s, r) => s + (r.status === "success" ? (r.result as bigint) : 0n),
    0n,
  );
  const claimableWei = (claimableReads.data ?? []).reduce<bigint>(
    (s, r) => s + (r.status === "success" ? (r.result as bigint) : 0n),
    0n,
  );

  const relReleased = Number(formatUnits(relReleasedWei, USDC_DECIMALS));
  const claimable = Number(formatUnits(claimableWei, USDC_DECIMALS));

  const claimableCount = (claimableReads.data ?? []).filter(
    (r) => r.status === "success" && (r.result as bigint) > 0n,
  ).length;

  const relPct = relTotal > 0 ? (relReleased / relTotal) * 100 : 0;

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
              {relTotal === 0
                ? "—"
                : chainLoading
                  ? "—"
                  : `${money(relReleased)} ${t.releasedLc}`}
            </div>
          </div>

          <div
            className={`pf-hcell ${!chainLoading && claimable > 0 ? "is-claim" : ""}`}
          >
            <div className="pf-k">{t.unclaimedPayout}</div>
            <div
              className={`pf-num ${!chainLoading && claimable > 0 ? "sig" : ""}`}
            >
              {chainLoading ? "—" : money(claimable)}
            </div>
            <div className="pf-sub">
              {chainLoading
                ? "—"
                : claimableCount > 0
                  ? t.acrossPolicies(claimableCount)
                  : "—"}
            </div>
          </div>
        </div>

        {relTotal > 0 && (
          <div className="pf-rel">
            <span className="pf-rel-meta">{t.principalRelease}</span>
            <div className="pf-rel-bar">
              <i
                style={{
                  width: chainLoading ? "0%" : `${relPct.toFixed(1)}%`,
                }}
              />
            </div>
            <span className="pf-rel-fig">
              {chainLoading ? (
                "—"
              ) : (
                <>
                  <b>{money(relReleased)}</b> / {money(relTotal)} USDC
                </>
              )}
            </span>
            <span className="pf-rel-pct">
              {chainLoading ? "—" : `${relPct.toFixed(1)}%`}
            </span>
            {!chainLoading &&
              claimable > 0 &&
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
