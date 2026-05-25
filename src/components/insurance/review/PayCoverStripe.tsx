"use client";

import { Icon } from "@/components/ui/Icon";
import { useT } from "@/hooks/useT";
import { money } from "@/lib/format";

interface Props {
  /** What the user pays (premium payable, USDC). */
  payable: number;
  /** What the user is covered for (= principal, USDC). */
  coverage: number;
}

/**
 * "You pay → You're covered for" stripe at the top of the order panel.
 * Highlights the asymmetry: small premium, full-principal coverage.
 */
export function PayCoverStripe({ payable, coverage }: Props) {
  const t = useT();
  return (
    <div className="paycover">
      <div className="pc-cell">
        <div className="pc-l">{t.youPay}</div>
        <div className="pc-v">
          {money(payable)}
          <span className="pc-u">USDC</span>
        </div>
      </div>
      <div className="pc-arrow">
        <Icon name="arrow" size={18} />
      </div>
      <div className="pc-cell pc-cover">
        <div className="pc-l">{t.youreCovered}</div>
        <div className="pc-v">
          {money(coverage)}
          <span className="pc-u">USDC</span>
        </div>
      </div>
    </div>
  );
}
