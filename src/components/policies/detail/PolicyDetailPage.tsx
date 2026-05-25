"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useHasMounted } from "@/hooks/useHasMounted";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/Panel";
import { Spinner } from "@/components/ui/Spinner";
import { GatedView } from "@/components/policies/GatedView";
import { applyClaimMutation } from "@/components/policies/PoliciesPage";
import { useT } from "@/hooks/useT";
import { getPolicyById } from "@/lib/db/policies";
import type { Policy } from "@/lib/mock";
import { claimableOf } from "@/lib/pricing";
import { money } from "@/lib/format";
import { useSimulationStore } from "@/stores/simulation";
import { useToast } from "@/stores/toast";
import { PolicyCertificate } from "./PolicyCertificate";
import { ReleaseBlock } from "./ReleaseBlock";
import { StatusBlock } from "./StatusBlock";
import { StatusTimeline } from "./StatusTimeline";

interface Props {
  policyId: string;
}

/** Simulated single-claim latency — matches prototype's setTimeout. */
const CLAIM_DELAY_MS = 1050;

/** DB-fetch lifecycle for the detail screen. */
type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "notFound" }
  | { kind: "ready"; policy: Policy };

/**
 * /policies/[policyId] — single-policy detail screen.
 *
 * Policy data now comes from Supabase, scoped to (id, owner_address).
 * If the row doesn't exist OR belongs to a different wallet, we
 * collapse both cases to "not found" — you can only see your own
 * policies. The fetch lifecycle has four observable states:
 *
 *   loading  → existing gated blur skeleton (hideCard)
 *   error    → centered error card with a retry button
 *   notFound → existing NotFoundView (now with policy-specific copy)
 *   ready    → certificate + status block + timeline
 *
 * Claim button mirrors PoliciesPage: applies the lifecycle change
 * to local state immediately (so the UI reflects the claim), and
 * still calls `store.claimPolicy()` so balance + activity update for
 * any policies that were also minted this session. DB-persisted claim
 * writes are the next step.
 */
export function PolicyDetailPage({ policyId }: Props) {
  const t = useT();
  const { isConnected, status, address } = useAccount();
  const mounted = useHasMounted();
  const claimPolicyStore = useSimulationStore((s) => s.claimPolicy);
  const showToast = useToast();

  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });

  const fetchPolicy = useCallback(async () => {
    if (!address) return;
    setLoadState({ kind: "loading" });
    const result = await getPolicyById(policyId, address);
    if (!result.ok) {
      setLoadState({ kind: "error" });
      return;
    }
    if (!result.policy) {
      setLoadState({ kind: "notFound" });
      return;
    }
    setLoadState({ kind: "ready", policy: result.policy });
  }, [policyId, address]);

  // Initial fetch + re-fetch when the wallet or route param changes.
  useEffect(() => {
    if (isConnected && address) {
      void fetchPolicy();
    }
  }, [isConnected, address, fetchPolicy]);

  // Defer gate decision until wagmi settles — see InsuranceList for context.
  if (!mounted || status === "connecting" || status === "reconnecting") {
    return <GatedView hideCard />;
  }
  if (!isConnected) return <GatedView />;

  if (loadState.kind === "loading") return <GatedView hideCard />;
  if (loadState.kind === "error") return <LoadErrorView onRetry={fetchPolicy} />;
  if (loadState.kind === "notFound") return <NotFoundView />;

  const policy = loadState.policy;

  const handleClaim = () => {
    if (busy) return;
    setBusy(true);
    setTimeout(() => {
      const claimable = claimableOf(policy);
      if (claimable > 0) {
        // Apply the same lifecycle transition the store does, so the
        // certificate + release block + timeline reflect the claim
        // without re-fetching.
        const mutated = applyClaimMutation(policy);
        setLoadState({ kind: "ready", policy: mutated });
      }
      // Mirror to the in-memory store so the global balance +
      // activity feed update for in-session-minted policies (no-op
      // for DB-only policies). The DB-write path lands next step.
      claimPolicyStore(policyId);
      setBusy(false);
      if (claimable > 0) {
        showToast(t.claimedToast(money(claimable)), { kind: "info" });
      }
    }, CLAIM_DELAY_MS);
  };

  const showReleaseBlock =
    policy.status === "releasing" || policy.status === "completed";

  return (
    <>
      <div className="page wrap">
        <div className="page-head rise">
          <div className="crumb">
            <Link href="/policies">{t.pfTitle}</Link> / {policy.id}
          </div>
          <div className="pagetitle">{t.contractTitle}</div>
        </div>

        <div className="grid2 rise-2">
          <div>
            <PolicyCertificate policy={policy} />
            {showReleaseBlock ? (
              <ReleaseBlock policy={policy} onClaim={handleClaim} busy={busy} />
            ) : (
              <StatusBlock policy={policy} />
            )}
          </div>
          <Panel title={t.timeline}>
            <StatusTimeline policy={policy} />
          </Panel>
        </div>
      </div>

      {/* Non-dismissible spinner during the simulated claim tx. */}
      {busy && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-live="polite"
        >
          <div className="modal">
            <div className="modal-status">
              <Spinner />
              <h3>{t.claimingT}</h3>
              <p>{t.claimingSub}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NotFoundView() {
  const t = useT();
  return (
    <div className="page wrap">
      <div className="page-head">
        <div className="crumb">
          <Link href="/policies">{t.pfTitle}</Link>
        </div>
        <div className="pagetitle">{t.contractTitle}</div>
      </div>
      <div className="empty2">
        <div className="e-ic">
          <Icon name="empty" size={20} />
        </div>
        <div className="e-t">{t.notFoundPolicyT}</div>
        <div className="e-d">{t.notFoundPolicyD}</div>
        <Link href="/policies" className="btn btn-ghost btn-sm">
          {t.pfTitle}
        </Link>
      </div>
    </div>
  );
}

function LoadErrorView({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="page wrap">
      <div className="page-head">
        <div className="crumb">
          <Link href="/policies">{t.pfTitle}</Link>
        </div>
        <div className="pagetitle">{t.contractTitle}</div>
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
