"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { useLocale, useT } from "@/hooks/useT";
import { claimableOf, releasedOf, type PolicyBucket } from "@/lib/pricing";
import { money } from "@/lib/format";
import type { Policy, PolicyStatus } from "@/lib/mock";
import type { Dict } from "@/lib/i18n";

interface Props {
  policy: Policy;
  bucket: PolicyBucket;
}

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
 *   paying   → "Claimable XX USDC" + release progress bar
 *   paid     → "Recovered XX USDC" + 100%-filled bar
 *   covered  → "Coverage XX USDC"  (no bar, nothing released yet)
 *   nopay    → "Premium kept XX USDC" (terminal, no payout)
 */
export function PolicyRow({ policy, bucket }: Props) {
  const t = useT();
  const { lang } = useLocale();

  const released = releasedOf(policy);
  const claimable = claimableOf(policy);
  const pc = (released / policy.a) * 100;

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
          {money(claimable)}
          <span className="fu">USDC</span>
        </div>
      </>
    );
    bar = (
      <div className="prow-bar">
        <div className="pbar">
          <i style={{ width: `${pc.toFixed(0)}%` }} />
        </div>
        <span className="pbt">
          {money(released)} / {money(policy.a)} · {pc.toFixed(0)}%
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
    fig = (
      <>
        <div className="fk">{t.premiumKept}</div>
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
