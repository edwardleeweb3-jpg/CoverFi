"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/Panel";
import { Spinner } from "@/components/ui/Spinner";
import { GatedView } from "@/components/policies/GatedView";
import { useT } from "@/hooks/useT";
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

/**
 * /policies/[policyId] — single-policy detail screen.
 *
 * Three render paths:
 *   - disconnected → GatedView (same as /policies)
 *   - policy not found → NotFound (link back to /policies)
 *   - otherwise → certificate + status-dependent block + timeline
 *
 * The status-dependent block branches:
 *   releasing | completed → ReleaseBlock (curve + relrow + claim or note)
 *   active | hit | void   → StatusBlock  (plain text explanation)
 *
 * Single-policy Claim flips the spinner overlay, after 1.05s calls
 * `simulationStore.claimPolicy(id)` and fires a toast. The same store
 * mutation drives /policies overview cells too (Zustand subscription).
 */
export function PolicyDetailPage({ policyId }: Props) {
  const t = useT();
  const { isConnected } = useAccount();
  const policy = useSimulationStore((s) =>
    s.policies.find((p) => p.id === policyId),
  );
  const claimPolicy = useSimulationStore((s) => s.claimPolicy);
  const showToast = useToast();

  const [busy, setBusy] = useState(false);

  if (!isConnected) return <GatedView />;
  if (!policy) return <NotFoundView />;

  const handleClaim = () => {
    if (busy) return;
    setBusy(true);
    setTimeout(() => {
      const amount = claimPolicy(policyId);
      setBusy(false);
      if (amount > 0) {
        showToast(t.claimedToast(money(amount)), { kind: "info" });
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
        <div className="e-t">{t.emptyPoliciesT}</div>
        <div className="e-d">{t.emptyPoliciesD}</div>
        <Link href="/policies" className="btn btn-ghost btn-sm">
          {t.pfTitle}
        </Link>
      </div>
    </div>
  );
}
