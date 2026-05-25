"use client";

import { Fragment } from "react";
import { useT } from "@/hooks/useT";
import { bucketOf, type PolicyBucket } from "@/lib/pricing";
import { money } from "@/lib/format";
import type { Policy } from "@/lib/mock";
import type { Dict } from "@/lib/i18n";
import { PolicyRow } from "./PolicyRow";

const GROUP_ORDER: Array<{
  key: PolicyBucket;
  labelKey: keyof Pick<Dict, "gPaying" | "gPaid" | "gCovered" | "gNopay">;
}> = [
  { key: "paying", labelKey: "gPaying" },
  { key: "paid", labelKey: "gPaid" },
  { key: "covered", labelKey: "gCovered" },
  { key: "nopay", labelKey: "gNopay" },
];

interface Props {
  policies: Policy[];
}

/**
 * Renders policies grouped by lifecycle bucket (paying → paid → covered
 * → nopay). Empty groups are skipped. Each group has a sticky-style
 * header row showing label, count badge, and aggregated principal sum.
 */
export function PolicyLedger({ policies }: Props) {
  const t = useT();

  return (
    <>
      {GROUP_ORDER.map(({ key, labelKey }) => {
        const list = policies.filter((p) => bucketOf(p) === key);
        if (list.length === 0) return null;
        const sum = list.reduce((s, p) => s + p.a, 0);

        return (
          <Fragment key={key}>
            <div className="pf-grouphdr">
              <span className="gh-t">{t[labelKey]}</span>
              <span className="gh-c">{list.length}</span>
              <span className="gh-line" />
              <span className="gh-sum">{money(sum)} USDC</span>
            </div>
            <div className="pledger">
              {list.map((p) => (
                <PolicyRow key={p.id} policy={p} bucket={key} />
              ))}
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
