"use client";

import { Badge } from "@/components/ui/Badge";
import { useLocale, useT } from "@/hooks/useT";
import { RELEASE_DAYS } from "@/lib/config";
import { money } from "@/lib/format";
import type { Policy, PolicyStatus } from "@/lib/mock";
import type { Dict } from "@/lib/i18n";

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

interface Props {
  policy: Policy;
}

/**
 * Insurance certificate — top stripe with policy ID + status badge over a
 * subtle diagonal hairline texture, then the 8-row terms table summarising
 * the contract. Locked snapshot per PRD §3.2 (premium/k/coverage frozen
 * at mint), so values come straight from `policy.*` — no live recompute.
 */
export function PolicyCertificate({ policy }: Props) {
  const t = useT();
  const { lang } = useLocale();

  const badge = statusBadgeProps(policy.status, t);
  const opt = lang === "zh" ? policy.optZh : policy.optEn;
  const mkt = lang === "zh" ? policy.mZh : policy.mEn;

  return (
    <div className="cert">
      <div className="cert-top">
        <div>
          <div className="pidl">policy</div>
          <div className="pid">{policy.id}</div>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <div className="cert-body">
        <table className="terms">
          <tbody>
            <tr>
              <td>{t.linkedOrder}</td>
              <td>{policy.order}</td>
            </tr>
            <tr>
              <td>{t.market}</td>
              <td
                style={{
                  fontFamily: "var(--sans)",
                  color: "var(--text)",
                  maxWidth: 230,
                  whiteSpace: "normal",
                  textAlign: "right",
                }}
              >
                {mkt}
              </td>
            </tr>
            <tr>
              <td>{t.insuredOption}</td>
              <td>{opt}</td>
            </tr>
            <tr>
              <td>{t.principal}</td>
              <td>
                <span className="big">{money(policy.a)} USDC</span>
              </td>
            </tr>
            <tr>
              <td>{t.premiumPaid}</td>
              <td>{money(policy.premium)} USDC</td>
            </tr>
            <tr>
              <td>{t.coverageAmount}</td>
              <td>{money(policy.a)} USDC · 100%</td>
            </tr>
            <tr>
              <td>{t.coverPeriod}</td>
              <td>
                {RELEASE_DAYS}d {t.linear}
              </td>
            </tr>
            <tr>
              <td>{t.transferability}</td>
              <td>{t.nonTransferable}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
