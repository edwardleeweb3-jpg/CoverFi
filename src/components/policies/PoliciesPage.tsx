"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useHasMounted } from "@/hooks/useHasMounted";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/hooks/useT";
import { listPoliciesByOwner } from "@/lib/db/policies";
import type { Policy } from "@/lib/mock";
import { bucketOf } from "@/lib/pricing";
import { useSimulationStore } from "@/stores/simulation";
import { PolicyOverview } from "./PolicyOverview";
import { PolicyFilterBar, type FilterKey } from "./PolicyFilterBar";
import { PolicyLedger } from "./PolicyLedger";
import { ActivityFeed } from "./ActivityFeed";
import { GatedView } from "./GatedView";

/** Discriminated state for the DB read. */
type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; policies: Policy[] };

/**
 * /policies — "My Policies" overview.
 *
 * Policies are fetched from Supabase, scoped to the connected wallet
 * (PRD §5.2). Three observable states:
 *
 *   loading → existing GatedView blur skeleton (hideCard variant)
 *   error   → centered error card with a retry button
 *   ready   → real UI; if `policies.length === 0` we show the
 *             "no policies yet" empty state.
 *
 * Status / claimed values come from the DB and are kept in sync by:
 *   - the on-chain mint flow (insertPolicy at E3 review-page);
 *   - the settler script (settle.ts at E6, writes status + settled_at);
 *   - the per-policy claim flow (E4 detail page → updatePolicyClaim
 *     after the chain claim() tx confirms).
 *
 * Batch "Claim All" is INTENTIONALLY disabled at E4: the CoverFiPolicy
 * contract has no batch-claim method, so firing it would mean N
 * sequential wallet signatures (N = claimable count). PolicyOverview
 * replaces the button with a hint pointing users to per-policy claim
 * on the detail page. A future contract upgrade (multicall, or a
 * `claimMultiple(uint256[])` method) would unblock this.
 *
 * Activity feed still reads the in-memory store (Segment 4 / Phase E
 * scope cap — activities table from PRD §5.3 lives in a later
 * indexer step). The feed will look empty for a fresh wallet, which
 * is fine post-E3 (the chain truth is in events; the indexer is
 * deferred work).
 */
export function PoliciesPage() {
  const t = useT();
  const { lang } = useLocale();
  const { isConnected, status, address } = useAccount();
  const mounted = useHasMounted();

  const activities = useSimulationStore((s) => s.activities);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });

  const fetchPolicies = useCallback(async () => {
    if (!address) return;
    setLoadState({ kind: "loading" });
    const result = await listPoliciesByOwner(address);
    if (result.ok) {
      setLoadState({ kind: "ready", policies: result.policies });
    } else {
      setLoadState({ kind: "error" });
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      void fetchPolicies();
    }
  }, [isConnected, address, fetchPolicies]);

  if (!mounted || status === "connecting" || status === "reconnecting") {
    return <GatedView hideCard />;
  }
  if (!isConnected) return <GatedView />;

  if (loadState.kind === "loading") {
    return <GatedView hideCard />;
  }
  if (loadState.kind === "error") {
    return <LoadErrorView onRetry={fetchPolicies} />;
  }

  const policies = loadState.policies;
  const matched = applyFilter(policies, search, filter, lang);
  const hasAny = policies.length > 0;
  const hasFilter = search.trim().length > 0 || filter !== "all";

  return (
    <div className="page wrap">
      <div className="page-head rise">
        <div className="pagetitle">{t.pfTitle}</div>
        <p className="pagesub">{t.pfSub}</p>
      </div>

      <div className="rise-2" style={{ marginBottom: 28 }}>
        <PolicyOverview policies={policies} batchHint={t.claimAllPerDetail} />
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
  );
}

function applyFilter(
  policies: Policy[],
  search: string,
  filter: FilterKey,
  lang: "en" | "zh",
): Policy[] {
  const q = search.trim().toLowerCase();
  return policies.filter((p) => {
    if (q) {
      const mkt = lang === "zh" ? p.mZh : p.mEn;
      if (!mkt.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filter !== "all" && bucketOf(p) !== filter) return false;
    return true;
  });
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

function LoadErrorView({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="page wrap">
      <div className="page-head">
        <div className="pagetitle">{t.pfTitle}</div>
        <p className="pagesub">{t.pfSub}</p>
      </div>
      <div className="empty2">
        <div className="e-ic">
          <Icon name="empty" size={20} />
        </div>
        <div className="e-t">{t.errLoadTitle}</div>
        <div className="e-d">{t.errLoadMsg}</div>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          {t.retryBtn}
        </Button>
      </div>
    </div>
  );
}
