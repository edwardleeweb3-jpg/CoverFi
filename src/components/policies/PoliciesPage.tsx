"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useHasMounted } from "@/hooks/useHasMounted";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { useLocale, useT } from "@/hooks/useT";
import { bucketOf } from "@/lib/pricing";
import { money } from "@/lib/format";
import { useSimulationStore } from "@/stores/simulation";
import { useToast } from "@/stores/toast";
import { PolicyOverview } from "./PolicyOverview";
import { PolicyFilterBar, type FilterKey } from "./PolicyFilterBar";
import { PolicyLedger } from "./PolicyLedger";
import { ActivityFeed } from "./ActivityFeed";
import { GatedView } from "./GatedView";

/** Simulated batch-claim latency — matches prototype's setTimeout. */
const BATCH_CLAIM_DELAY_MS = 1200;

/**
 * /policies — "My Policies" overview. Owns search + filter state
 * (local React; resets on navigation), reads policies + activities
 * from the simulation store, and drives the batch Claim All flow.
 *
 * The single-policy Claim button is on /policies/[id] (step 10) and
 * uses `claimPolicy()` from the same store.
 */
export function PoliciesPage() {
  const t = useT();
  const { lang } = useLocale();
  const { isConnected, status } = useAccount();
  const mounted = useHasMounted();

  const policies = useSimulationStore((s) => s.policies);
  const activities = useSimulationStore((s) => s.activities);
  const claimAll = useSimulationStore((s) => s.claimAll);
  const showToast = useToast();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [batching, setBatching] = useState(false);

  const matched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return policies.filter((p) => {
      if (q) {
        const mkt = lang === "zh" ? p.mZh : p.mEn;
        if (
          !mkt.toLowerCase().includes(q) &&
          !p.id.toLowerCase().includes(q)
        )
          return false;
      }
      if (filter !== "all" && bucketOf(p) !== filter) return false;
      return true;
    });
  }, [policies, search, filter, lang]);

  // See InsuranceList for rationale — defer gate decision until wagmi
  // settles its initial reconnect.
  if (!mounted || status === "connecting" || status === "reconnecting") {
    return <GatedView hideCard />;
  }
  if (!isConnected) return <GatedView />;

  const hasAny = policies.length > 0;
  const hasFilter = search.trim().length > 0 || filter !== "all";

  const handleBatchClaim = () => {
    if (batching) return;
    setBatching(true);
    setTimeout(() => {
      const { total, count } = claimAll();
      setBatching(false);
      if (total > 0) {
        showToast(t.claimedBatch(money(total)), {
          kind: "info",
          sub: t.batchDone(count),
        });
      }
    }, BATCH_CLAIM_DELAY_MS);
  };

  return (
    <>
      <div className="page wrap">
        <div className="page-head rise">
          <div className="pagetitle">{t.pfTitle}</div>
          <p className="pagesub">{t.pfSub}</p>
        </div>

        <div className="rise-2" style={{ marginBottom: 28 }}>
          <PolicyOverview
            policies={policies}
            onClaimAll={handleBatchClaim}
            busy={batching}
          />
        </div>

        <div className="rise-2">
          {hasAny ? (
            <>
              <PolicyFilterBar
                search={search}
                filter={filter}
                onSearch={setSearch}
                onFilter={setFilter}
              />
              {matched.length === 0 ? (
                hasFilter ? (
                  <NoMatch
                    onClear={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                  />
                ) : null
              ) : (
                <PolicyLedger policies={matched} />
              )}
            </>
          ) : (
            <NoPoliciesYet />
          )}
        </div>

        {activities.length > 0 && (
          <div className="rise-3" style={{ marginTop: 8 }}>
            <ActivityFeed activities={activities} />
          </div>
        )}
      </div>

      {/* Non-dismissible busy overlay during the simulated batch claim. */}
      {batching && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-live="polite"
        >
          <div className="modal">
            <div className="modal-status">
              <Spinner />
              <h3>{t.batchT}</h3>
              <p>{t.batchSub}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NoMatch({ onClear }: { onClear: () => void }) {
  const t = useT();
  return (
    <div className="empty2">
      <div className="e-ic">
        <Icon name="search" size={20} />
      </div>
      <div className="e-t">{t.noMatch}</div>
      <div className="e-d">{t.noMatchD}</div>
      <Button variant="ghost" size="sm" onClick={onClear}>
        {t.clearFilters}
      </Button>
    </div>
  );
}

function NoPoliciesYet() {
  const t = useT();
  return (
    <div className="empty2">
      <div className="e-ic">
        <Icon name="empty" size={20} />
      </div>
      <div className="e-t">{t.emptyPoliciesT}</div>
      <div className="e-d">{t.emptyPoliciesD}</div>
      <Link href="/insurance" className="btn btn-primary btn-sm">
        {t.emptyPoliciesBtn}
      </Link>
    </div>
  );
}
