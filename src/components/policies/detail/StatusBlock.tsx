"use client";

import { Panel } from "@/components/ui/Panel";
import { useT } from "@/hooks/useT";
import { money } from "@/lib/format";
import type { Policy } from "@/lib/mock";

interface Props {
  policy: Policy;
}

/**
 * Text-only status panel for non-releasing states (active / hit / void).
 *
 *   active → "Coverage is active. If miss, X USDC begins releasing…"
 *   hit    → "Option won, coverage didn't trigger. Premium P retained."
 *   void   → "Market voided. Coverage didn't trigger. Premium P retained."
 *
 * The actual paragraph text comes from i18n function-keys so both
 * languages read naturally with the embedded number.
 */
export function StatusBlock({ policy }: Props) {
  const t = useT();

  let body: string;
  if (policy.status === "active") {
    body = t.stActive(money(policy.a));
  } else if (policy.status === "hit") {
    body = t.stHit(money(policy.premium));
  } else if (policy.status === "void") {
    body = t.stVoid(money(policy.premium));
  } else {
    // Defensive — not reached because the page picks ReleaseBlock for
    // releasing/completed; keep the panel rendering without text rather
    // than throwing.
    body = "";
  }

  return (
    <Panel title={t.statusH} className="release-block">
      <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
        {body}
      </p>
    </Panel>
  );
}
