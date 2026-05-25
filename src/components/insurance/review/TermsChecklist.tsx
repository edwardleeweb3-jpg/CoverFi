"use client";

import { useT } from "@/hooks/useT";

/**
 * Five-item plain-language terms checklist (CSS-rendered checkboxes,
 * non-interactive). Matches prototype's `ul.checklist`.
 *
 * These are PRD §3 paraphrases: refund policy, snapshot lock, linear
 * release window, market-void handling, non-transferability.
 */
export function TermsChecklist() {
  const t = useT();
  return (
    <ul className="checklist">
      <li>{t.t1}</li>
      <li>{t.t2}</li>
      <li>{t.t3}</li>
      <li>{t.t4}</li>
      <li>{t.t5}</li>
    </ul>
  );
}
