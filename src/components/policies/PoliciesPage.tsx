"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useHasMounted } from "@/hooks/useHasMounted";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { useLocale, useT } from "@/hooks/useT";
import { listPoliciesByOwner } from "@/lib/db/policies";
import type { Policy, PolicyStatus } from "@/lib/mock";
import { bucketOf, claimableOf, releasedOf } from "@/lib/pricing";
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

/** Discriminated state for the DB read. */
type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; policies: Policy[] };

/**
 * /policies — "My Policies" overview.
 *
 * Policies are now fetched from Supabase, scoped to the connected
 * wallet (PRD §5.2). The fetch lifecycle has three observable states:
 *
 *   loading → existing GatedView blur skeleton (hideCard variant)
 *   error   → centered error card with a retry button
 *   ready   → real UI; if `policies.length === 0` we show the
 *             "no policies yet" empty state (PRD A-plan: a fresh
 *             wallet starts empty — seed policies no longer surface)
 *
 * Activity feed and the in-memory balance/counter still come from
 * `useSimulationStore` — out of scope for this step (DB persistence
 * for those lands in later steps).
 *
 * Claim All flow: we apply the lifecycle mutation locally so the
 * overview cells + ledger reflect it immediately, and still call
 * `store.claimAll()` so the in-memory balance + activity update for
 * any policies that were also minted in this session. DB-persisted
 * claim writes are the next step — for now refreshing the page will
 * snap back to the DB's view (matching the existing behaviour where
 * balance/activity also reset on reload).
 */
export function PoliciesPage() {
  const t = useT();
  const { lang } = useLocale();
  const { isConnected, status, address } = useAccount();
  const mounted = useHasMounted();

  const activities = useSimulationStore((s) => s.activities);
  const claimAllStore = useSimulationStore((s) => s.claimAll);
  const showToast = useToast();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [batching, setBatching] = useState(false);
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

  // Trigger initial fetch (and re-fetch when the connected wallet
  // changes). We only fire once we know wagmi is connected — gate
  // checks live below and would otherwise let through a fetch with
  // an undefined address.
  useEffect(() => {
    if (isConnected && address) {
      void fetchPolicies();
    }
  }, [isConnected, address, fetchPolicies]);

  // Gate logic stays the same — wagmi-reconnecting and not-connected
  // are handled before any data is read.
  if (!mounted || status === "connecting" || status === "reconnecting") {
    return <GatedView hideCard />;
  }
  if (!isConnected) return <GatedView />;

  // While the DB fetch is in flight, reuse the gated-blur skeleton —
  // visually it's the same dashboard frame the page will inhabit
  // once data lands, so the transition is continuous.
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

  const handleBatchClaim = () => {
    if (batching) return;
    setBatching(true);
    setTimeout(() => {
      // Snapshot which policies have something claimable now —
      // mirrors store.claimAll's filter but operates on our locally-
      // fetched array.
      const claimable = policies.filter((p) => claimableOf(p) > 0);
      if (claimable.length === 0) {
        setBatching(false);
        return;
      }
      const total = claimable.reduce((s, p) => s + claimableOf(p), 0);

      // Apply the same lifecycle transition the store does (claimed →
      // released; status flips to `completed` when within epsilon of
      // full release).
      setLoadState({
        kind: "ready",
        policies: policies.map((p) => applyClaimMutation(p)),
      });

      // Still call store.claimAll so balance + activity update for
      // any policies that were also minted this session. For DB-only
      // policies the store call is a no-op — that's fine; balance
      // reconciliation moves to the DB-claim step next.
      claimAllStore();
      setBatching(false);
      showToast(t.claimedBatch(money(total)), {
        kind: "info",
        sub: t.batchDone(claimable.length),
      });
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

/**
 * Mirror of `store.claimPolicy`'s lifecycle mutation, applied
 * locally so the overview + ledger update without a DB round-trip.
 * No-op for policies with nothing claimable right now.
 */
export function applyClaimMutation(p: Policy): Policy {
  const claimable = claimableOf(p);
  if (claimable <= 0) return p;
  const released = releasedOf(p);
  const fullyClaimed = released >= p.a - 0.01;
  const newStatus: PolicyStatus = fullyClaimed ? "completed" : p.status;
  return { ...p, claimed: released, status: newStatus };
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
