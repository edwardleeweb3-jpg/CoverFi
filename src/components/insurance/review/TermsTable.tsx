"use client";

import { useT } from "@/hooks/useT";
import { money } from "@/lib/format";

interface Props {
  option: string;
  principal: number;
  basePremium: number;
  floor: number;
  payable: number;
  coverage: number;
  releaseDays: number;
  linearLabel: string;
}

/**
 * Full breakdown of the policy economics — what the user is buying.
 * Seven rows matching prototype's `.terms` table 1:1; principal and
 * premium-payable rows use `.big` to draw the eye.
 */
export function TermsTable({
  option,
  principal,
  basePremium,
  floor,
  payable,
  coverage,
  releaseDays,
  linearLabel,
}: Props) {
  const t = useT();
  return (
    <table className="terms">
      <tbody>
        <tr>
          <td>{t.insuredOption}</td>
          <td>{option}</td>
        </tr>
        <tr>
          <td>{t.principal}</td>
          <td>
            <span className="big">{money(principal)} USDC</span>
          </td>
        </tr>
        <tr>
          <td>{t.basePremium}</td>
          <td>{money(basePremium)} USDC</td>
        </tr>
        <tr>
          <td>{t.premiumFloor}</td>
          <td>{money(floor)} USDC</td>
        </tr>
        <tr>
          <td>{t.premiumPayable}</td>
          <td>
            <span className="big">{money(payable)} USDC</span>
          </td>
        </tr>
        <tr>
          <td>{t.coverageAmount}</td>
          <td>{money(coverage)} USDC · 100%</td>
        </tr>
        <tr>
          <td>{t.coverPeriod}</td>
          <td>
            {releaseDays}d {linearLabel}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
