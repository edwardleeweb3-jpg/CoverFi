"use client";

import { useT } from "@/hooks/useT";
import { money } from "@/lib/format";
import { RELEASE_DAYS } from "@/lib/config";
import type { Policy } from "@/lib/mock";
import type { Dict } from "@/lib/i18n";

interface Step {
  title: string;
  detail: string;
  cls: "done" | "now" | "now g" | "future";
}

/**
 * Builds the timeline rows for a policy based on its current status.
 * Mirrors prototype's `policyTimeline()` — branches per status:
 *
 *   active     → minted → awaiting settlement (now) → settlement (future)
 *   hit        → minted → option won (done) → closed/premium kept (now)
 *   void       → minted → market voided (done) → closed/refunded (now)
 *   releasing  → minted → option missed (done) → releasing (now) → release complete (future)
 *   completed  → minted → option missed (done) → reimbursed in full (now g)
 */
function buildSteps(p: Policy, t: Dict): Step[] {
  const steps: Step[] = [];
  const good = p.status === "completed";
  const settled = p.settledDaysAgo ?? 0;
  const voided = p.voidedDaysAgo ?? 0;
  const minted = p.mintedDaysAgo ?? 0;

  steps.push({
    title: t.tlMinted,
    detail: t.tlInsured(money(p.premium)),
    cls: "done",
  });

  if (p.status === "active") {
    steps.push({
      title: t.tlAwait,
      detail: t.tlMintedAgo(minted),
      cls: "now",
    });
    steps.push({
      title: t.tlSettlement,
      detail: t.tlPending,
      cls: "future",
    });
  } else if (p.status === "hit") {
    steps.push({
      title: t.tlWon,
      detail: t.tlAgo(settled),
      cls: "done",
    });
    steps.push({
      title: t.tlClosed,
      detail: t.tlPremKept,
      cls: "now",
    });
  } else if (p.status === "void") {
    steps.push({
      title: t.tlVoided,
      detail: t.tlAgo(voided),
      cls: "done",
    });
    steps.push({
      title: t.tlRefunded,
      detail: t.tlReturned(money(p.premium)),
      cls: "now",
    });
  } else {
    // releasing or completed — both reached "settled · miss" already
    steps.push({
      title: t.tlMissed,
      detail: t.tlAgo(settled),
      cls: "done",
    });
    steps.push({
      title: good ? t.tlReimbursed : t.tlReleasing,
      detail: good ? t.tlDaysFull : t.tlDays(Math.min(settled, RELEASE_DAYS)),
      cls: good ? "now g" : "now",
    });
    if (!good) {
      steps.push({
        title: t.tlRelDone,
        detail: t.day365,
        cls: "future",
      });
    }
  }

  return steps;
}

interface Props {
  policy: Policy;
}

export function StatusTimeline({ policy }: Props) {
  const t = useT();
  const steps = buildSteps(policy, t);

  return (
    <div className="timeline">
      {steps.map((s, i) => (
        <div key={i} className={`tl ${s.cls}`}>
          <div className="dot" />
          <div>
            <div className="tt">{s.title}</div>
            <div className="td">{s.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
