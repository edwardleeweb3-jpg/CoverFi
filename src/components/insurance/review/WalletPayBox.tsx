"use client";

import { Button } from "@/components/ui/Button";
import { useT } from "@/hooks/useT";
import { money } from "@/lib/format";

interface Props {
  balance: number;
  premium: number;
  onPay: () => void;
  /** Disables the pay button while a mint is in flight. */
  disabled?: boolean;
}

/**
 * Top-bordered block showing wallet balance, the premium to be deducted,
 * and the primary "Pay premium · X USDC" CTA. Balance comes from the
 * simulation store (PRD §1.3 says BNB testnet but UI shows USDC per
 * project decisions; real contract balance arrives in a later step).
 *
 * The button stays enabled even when balance is insufficient — the
 * parent shows an error modal on click, matching the prototype's UX.
 */
export function WalletPayBox({ balance, premium, onPay, disabled }: Props) {
  const t = useT();
  return (
    <>
      <div className="walletpay">
        <div className="wp-row">
          <span>{t.walletBalance}</span>
          <span className="mono">{money(balance)} USDC</span>
        </div>
        <div className="wp-row">
          <span>{t.premium}</span>
          <span className="mono">− {money(premium)} USDC</span>
        </div>
      </div>
      <Button
        variant="primary"
        block
        className="walletpay-btn"
        onClick={onPay}
        disabled={disabled}
      >
        {t.payPremium} · {money(premium)} USDC
      </Button>
    </>
  );
}
