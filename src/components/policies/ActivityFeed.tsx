"use client";

import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/hooks/useT";
import { money } from "@/lib/format";
import type { Activity } from "@/lib/mock";
import type { IconName } from "@/components/ui/icon-paths";

const ICON_BY_TYPE: Record<Activity["type"], IconName> = {
  mint: "shield",
  claim: "arrow",
  void: "empty",
};

interface Props {
  activities: Activity[];
}

/**
 * "Recent activity" panel below the policy ledger. Shows up to 6 most
 * recent events. Mint rows show `−amt` (debit), claim rows show `+amt`
 * (credit, green), void rows show `—`. Market titles are clipped to
 * 42 chars to keep rows single-line.
 */
export function ActivityFeed({ activities }: Props) {
  const t = useT();
  const { lang } = useLocale();

  if (activities.length === 0) return null;

  const label: Record<Activity["type"], string> = {
    mint: t.actMint,
    claim: t.actClaim,
    void: t.actVoid,
  };

  const rows = activities.slice(0, 6);

  return (
    <>
      <div className="pf-grouphdr">
        <span className="gh-t">{t.activityTitle}</span>
        <span className="gh-c">{activities.length}</span>
        <span className="gh-line" />
      </div>
      <div className="actfeed">
        {rows.map((a, i) => {
          const rowCls =
            a.type === "claim" ? "a-in" : a.type === "mint" ? "a-out" : "";
          const m = lang === "zh" ? a.mkt.mZh : a.mkt.mEn;
          const trimmed = m.length > 42 ? m.slice(0, 42) + "…" : m;
          return (
            <div key={i} className={`actrow ${rowCls}`.trim()}>
              <span className="aic">
                <Icon name={ICON_BY_TYPE[a.type]} size={14} />
              </span>
              <div>
                <div className="at">
                  {label[a.type]} · {a.id}
                </div>
                <div className="ad">
                  {trimmed} · {t.daysAgoShort(a.ago)}
                </div>
              </div>
              {a.type === "claim" ? (
                <span className="av pos">+{money(a.amt)}</span>
              ) : a.type === "mint" ? (
                <span className="av neg">−{money(a.amt)}</span>
              ) : (
                <span className="av neg">—</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
