"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { Badge } from "@/components/ui/Badge";
import { useLocale, useT } from "@/hooks/useT";
import {
  coverFiPolicyAbi,
  getContractAddresses,
} from "@/lib/contracts";
import { type PolicyBucket } from "@/lib/pricing";
import { money } from "@/lib/format";
import type { Policy, PolicyStatus } from "@/lib/mock";
import type { Dict } from "@/lib/i18n";

interface Props {
  policy: Policy;
  bucket: PolicyBucket;
}

const USDC_DECIMALS = 6;

type BadgeVariant = "default" | "signal" | "good";

function statusBadgeProps(
  status: PolicyStatus,
  t: Dict,
): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "releasing":
      return { label: t.stsReleasing, variant: "signal" };
    case "completed":
      return { label: t.stsCompleted, variant: "good" };
    case "active":
      return { label: t.stsActive, variant: "default" };
    case "hit":
      return { label: t.stsHit, variant: "default" };
    case "void":
      return { label: t.stsVoid, variant: "default" };
  }
}

/**
 * One row in the grouped policy ledger. Anchored to /policies/[id]; the
 * left-edge accent color (via `.prow.s-{bucket}`) mirrors the bucket
 * (signal/good/text-3/line-3). Right-side figure + bar differ per bucket:
 *
 *   paying   → "Claimable XX USDC" + release progress bar  ← CHAIN reads
 *   paid     → "Recovered XX USDC" + 100%-filled bar       ← static
 *   covered  → "Coverage XX USDC"  (no bar, nothing released yet)
 *   nopay    → "Premium kept / refunded XX USDC"           ← static
 *
 * The `paying` bucket reads `releasedOf` and `claimableOf` live from
 * the contract (matches PolicyOverview + detail page; the previous
 * float-based port underreported in the first 24h after settlement
 * due to its day-floor precision). Other buckets render from static
 * fields and don't need chain reads; their useReadContract hooks
 * still fire (rules of hooks) but with `enabled: false` so no RPC.
 */
export function PolicyRow({ policy, bucket }: Props) {
  const t = useT();
  const { lang } = useLocale();

  const COVER_FI = getContractAddresses().coverFiPolicy;
  const enabled =
    bucket === "paying" && policy.chainPolicyId !== undefined;

  const { data: releasedWei } = useReadContract({
    address: COVER_FI,
    abi: coverFiPolicyAbi,
    functionName: "releasedOf",
    args:
      policy.chainPolicyId !== undefined
        ? [policy.chainPolicyId]
        : undefined,
    query: { enabled },
  });
  const { data: claimableWei } = useReadContract({
    address: COVER_FI,
    abi: coverFiPolicyAbi,
    functionName: "claimableOf",
    args:
      policy.chainPolicyId !== undefined
        ? [policy.chainPolicyId]
        : undefined,
    query: { enabled },
  });

  const released =
    releasedWei !== undefined
      ? Number(formatUnits(releasedWei, USDC_DECIMALS))
      : null;
  const claimable =
    claimableWei !== undefined
      ? Number(formatUnits(claimableWei, USDC_DECIMALS))
      : null;
  const pc = released !== null ? (released / policy.a) * 100 : 0;

  const badge = statusBadgeProps(policy.status, t);
  const cat = lang === "zh" ? policy.catZh : policy.catEn;
  const mkt = lang === "zh" ? policy.mZh : policy.mEn;
  const opt = lang === "zh" ? policy.optZh : policy.optEn;

  let fig: React.ReactNode;
  let bar: React.ReactNode = null;

  if (bucket === "paying") {
    fig = (
      <>
        <div className="fk">{t.claimable}</div>
        <div className="fv sig">
          {claimable === null ? "—" : money(claimable)}
          <span className="fu">USDC</span>
        </div>
      </>
    );
    bar = (
      <div className="prow-bar">
        <div className="pbar">
          <i style={{ width: released === null ? "0%" : `${pc.toFixed(1)}%` }} />
        </div>
        <span className="pbt">
          {released === null
            ? "—"
            : `${money(released)} / ${money(policy.a)} · ${pc.toFixed(1)}%`}
        </span>
      </div>
    );
  } else if (bucket === "paid") {
    fig = (
      <>
        <div className="fk">{t.recovered}</div>
        <div className="fv">
          {money(policy.a)}
          <span className="fu">USDC</span>
        </div>
      </>
    );
    bar = (
      <div className="prow-bar">
        <div className="pbar">
          <i style={{ width: "100%" }} />
        </div>
        <span className="pbt">100% {t.releasedLc}</span>
      </div>
    );
  } else if (bucket === "covered") {
    fig = (
      <>
        <div className="fk">{t.coverageCol}</div>
        <div className="fv">
          {money(policy.a)}
          <span className="fu">USDC</span>
        </div>
      </>
    );
  } else {
    // nopay = Hit OR Void. Both have no claim payout, but Void
    // refunded the premium back to the wallet while Hit kept it.
    // Single bucket, two labels.
    fig = (
      <>
        <div className="fk">
          {policy.status === "void" ? t.premiumRefunded : t.premiumKept}
        </div>
        <div className="fv">
          {money(policy.premium)}
          <span className="fu">USDC</span>
        </div>
      </>
    );
  }

  return (
    <Link href={`/policies/${policy.id}`} className={`prow s-${bucket}`}>
      <div className="prow-main">
        <div className="prow-top">
          <span className="prow-id">{policy.id}</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <div className="prow-mkt">{mkt}</div>
        <div className="prow-meta">
          <span className="tag">{cat}</span>
          <span className="tag">{opt}</span>
          <span className="tag">
            {t.principal} {money(policy.a)}
          </span>
        </div>
      </div>
      <div className="prow-fig">{fig}</div>
      {bar}
    </Link>
  );
}
