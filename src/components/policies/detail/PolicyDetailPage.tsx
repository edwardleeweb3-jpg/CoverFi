"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useHasMounted } from "@/hooks/useHasMounted";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Panel } from "@/components/ui/Panel";
import { Spinner } from "@/components/ui/Spinner";
import { GatedView } from "@/components/policies/GatedView";
import { applyClaimMutation } from "@/components/policies/PoliciesPage";
import { useT } from "@/hooks/useT";
import { getPolicyById, updatePolicyClaim } from "@/lib/db/policies";
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
 * Claim button: persists the new `claimed` (and possibly `status =
 * 'completed'`) to Supabase first, then applies the same mutation to
 * local state so the certificate + release block + timeline reflect
 * the claim without re-fetching. Also mirrors to `store.claimPolicy`
 * so the in-memory balance + activity update for in-session-minted
 * policies (no-op for DB-only policies — balance + activity persistence
 * have no table yet).
 *
 * If the DB write fails we surface a save-failed modal. Local state
 * is left untouched, so dismissing + clicking Claim again retries
 * cleanly.
 */
export function PolicyDetailPage({ policyId }: Props) {
  const t = useT();
  const { isConnected, status, address } = useAccount();
  const mounted = useHasMounted();
  const claimPolicyStore = useSimulationStore((s) => s.claimPolicy);
  const showToast = useToast();

  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [claimErrorOpen, setClaimErrorOpen] = useState(false);

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

  const handleClaim = async () => {
    if (busy) return;
    if (!address) return;
    const claimable = claimableOf(policy);
    if (claimable <= 0) return;

    // Pre-compute the post-claim state — the DB write needs the new
    // `claimed` + `status`, and the local mirror needs the full
    // mutated policy.
    const mutated = applyClaimMutation(policy);

    setBusy(true);
    const result = await updatePolicyClaim({
      id: policy.id,
      ownerAddress: address,
      claimed: mutated.claimed ?? 0,
      status: mutated.status,
    });
    setBusy(false);

    if (!result.ok) {
      // Local state untouched — user can dismiss and retry.
      setClaimErrorOpen(true);
      return;
    }

    setLoadState({ kind: "ready", policy: mutated });
    // Mirror to in-memory store so the global balance + activity
    // feed update for in-session-minted policies (no-op for DB-only
    // policies).
    claimPolicyStore(policyId);
    showToast(t.claimedToast(money(claimable)), { kind: "info" });
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

      {/* Non-dismissible spinner while the DB write is in flight. */}
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

      {/* DB write failed. Local state was left at the pre-claim
          policy, so dismissing + clicking Claim again retries. */}
      <Modal
        open={claimErrorOpen}
        onClose={() => setClaimErrorOpen(false)}
        title={t.errClaimSaveTitle}
      >
        <div className="errbox">{t.errClaimSaveMsg}</div>
        <Button
          variant="ghost"
          block
          className="mt-3"
          onClick={() => setClaimErrorOpen(false)}
        >
          {t.dismiss}
        </Button>
      </Modal>
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
