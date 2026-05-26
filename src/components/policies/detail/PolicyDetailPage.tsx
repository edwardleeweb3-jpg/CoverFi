"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import {
  formatUnits,
  parseEventLogs,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { useHasMounted } from "@/hooks/useHasMounted";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Panel } from "@/components/ui/Panel";
import { Spinner } from "@/components/ui/Spinner";
import { GatedView } from "@/components/policies/GatedView";
import { useT } from "@/hooks/useT";
import { getPolicyById, updatePolicyClaim } from "@/lib/db/policies";
import type { Policy, PolicyStatus } from "@/lib/mock";
import { money, shortAddress } from "@/lib/format";
import {
  BSC_TESTNET_CHAIN_ID,
  coverFiPolicyAbi,
  getContractAddresses,
} from "@/lib/contracts";
import { isUserRejection } from "@/lib/contracts/errors";
import { TARGET_CHAIN } from "@/lib/wagmi";
import { useToast } from "@/stores/toast";
import { PolicyCertificate } from "./PolicyCertificate";
import { ReleaseBlock } from "./ReleaseBlock";
import { StatusBlock } from "./StatusBlock";
import { StatusTimeline } from "./StatusTimeline";

interface Props {
  policyId: string;
}

const USDC_DECIMALS = 6;

/** Mirrors `enum PolicyStatus { Active, Releasing, Completed, Hit, Void }`
 *  in CoverFiPolicy.sol — the uint8 index aligns with PRD §2.2. */
const STATUS_BY_ENUM = [
  "active",
  "releasing",
  "completed",
  "hit",
  "void",
] as const satisfies readonly PolicyStatus[];

/** DB-fetch lifecycle for the detail screen. */
type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "notFound" }
  | { kind: "ready"; policy: Policy };

type Phase = "idle" | "claiming";

/**
 * /policies/[policyId] — single-policy detail screen, E4 edition.
 *
 * Hybrid data model:
 *   - **Static fields** (id, principal, kBps, owner, market text) come
 *     from Supabase via `getPolicyById(policyId, address)`.
 *   - **Dynamic state** (status, claimed, released, claimable) comes
 *     from the live contract via three `useReadContract` hooks against
 *     the policy's `chain_policy_id`. The chain is the authority; the
 *     DB row's status / claimed are only refreshed after the
 *     corresponding write (E6 settle script for status, this page's
 *     claim handler for claimed/status).
 *
 * Claim flow:
 *   1. Pre-flight: chainId === 97, claimable > 0.
 *   2. `coverFi.claim(chainPolicyId)` → wait receipt → parse
 *      `PolicyClaimed` event for the actually-transferred amount.
 *   3. Refetch all three chain reads — these give the post-claim truth.
 *   4. `updatePolicyClaim({ chainPolicyId, claimedWei, status })` with
 *      values from the fresh chain reads (no client-side guessing).
 *   5. Toast.
 *
 * Errors:
 *   - User rejects in wallet → silent, back to idle.
 *   - Claim tx reverts → claim-failed modal.
 *   - Chain succeeded but DB save failed → post-claim modal with a
 *     retry hook that re-runs only the DB write (the chain side is
 *     irreversible).
 *
 * Note: NO automatic polling per Q5 — chain reads fire on mount and
 * after each claim. A future "ticker" UX could opt-in via
 * `query.refetchInterval: 60_000`, but the per-second accrual is
 * invisible to humans anyway.
 */
export function PolicyDetailPage({ policyId }: Props) {
  const t = useT();
  const { isConnected, status, address } = useAccount();
  const chainId = useChainId();
  const mounted = useHasMounted();
  const showToast = useToast();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const COVER_FI = getContractAddresses().coverFiPolicy;

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [phase, setPhase] = useState<Phase>("idle");
  const [wrongChainOpen, setWrongChainOpen] = useState(false);
  const [claimFailedOpen, setClaimFailedOpen] = useState(false);
  const [postClaimCtx, setPostClaimCtx] = useState<{ txHash: Hex } | null>(
    null,
  );

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

  useEffect(() => {
    if (isConnected && address) {
      void fetchPolicy();
    }
  }, [isConnected, address, fetchPolicy]);

  // Chain reads — gated on loadState.kind so chainPolicyId is defined.
  const chainPolicyId =
    loadState.kind === "ready" ? loadState.policy.chainPolicyId : undefined;
  const readsEnabled = chainPolicyId !== undefined;

  const { data: chainPolicyTuple, refetch: refetchChainPolicy } =
    useReadContract({
      address: COVER_FI,
      abi: coverFiPolicyAbi,
      functionName: "policies",
      args: chainPolicyId !== undefined ? [chainPolicyId] : undefined,
      query: { enabled: readsEnabled },
    });
  const { data: releasedWei, refetch: refetchReleased } = useReadContract({
    address: COVER_FI,
    abi: coverFiPolicyAbi,
    functionName: "releasedOf",
    args: chainPolicyId !== undefined ? [chainPolicyId] : undefined,
    query: { enabled: readsEnabled },
  });
  const { data: claimableWei, refetch: refetchClaimable } = useReadContract({
    address: COVER_FI,
    abi: coverFiPolicyAbi,
    functionName: "claimableOf",
    args: chainPolicyId !== undefined ? [chainPolicyId] : undefined,
    query: { enabled: readsEnabled },
  });

  // Gate.
  if (!mounted || status === "connecting" || status === "reconnecting") {
    return <GatedView hideCard />;
  }
  if (!isConnected) return <GatedView />;

  if (loadState.kind === "loading") return <GatedView hideCard />;
  if (loadState.kind === "error") return <LoadErrorView onRetry={fetchPolicy} />;
  if (loadState.kind === "notFound") return <NotFoundView />;

  const policy = loadState.policy;

  // ─── Chain-derived display values ────────────────────────────
  const chainStatusEnum = chainPolicyTuple
    ? Number(chainPolicyTuple[1])
    : null;
  const chainStatus: PolicyStatus | null =
    chainStatusEnum !== null && chainStatusEnum >= 0 && chainStatusEnum < 5
      ? STATUS_BY_ENUM[chainStatusEnum]
      : null;
  const chainClaimedWei = chainPolicyTuple
    ? (chainPolicyTuple[8] as bigint)
    : 0n;

  // Prefer chain when loaded; fall back to DB during the brief
  // pre-load window so the page renders SOMETHING immediately.
  const effectiveStatus: PolicyStatus = chainStatus ?? policy.status;
  const releasedDisplay =
    releasedWei !== undefined
      ? Number(formatUnits(releasedWei, USDC_DECIMALS))
      : null;
  const claimableDisplay =
    claimableWei !== undefined
      ? Number(formatUnits(claimableWei, USDC_DECIMALS))
      : null;
  const claimedDisplay = chainPolicyTuple
    ? Number(formatUnits(chainClaimedWei, USDC_DECIMALS))
    : null;

  // ─── Claim handler ───────────────────────────────────────────
  const handleClaim = async () => {
    if (phase !== "idle") return;
    if (!address || !publicClient || chainPolicyId === undefined) return;
    if (chainId !== BSC_TESTNET_CHAIN_ID) {
      setWrongChainOpen(true);
      return;
    }
    if (claimableWei === undefined || claimableWei === 0n) return;

    setPhase("claiming");
    let txHash: Hex;
    let receipt: TransactionReceipt;
    try {
      txHash = await writeContractAsync({
        address: COVER_FI,
        abi: coverFiPolicyAbi,
        functionName: "claim",
        args: [chainPolicyId],
      });
      receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    } catch (e) {
      setPhase("idle");
      if (isUserRejection(e)) return; // silent
      setClaimFailedOpen(true);
      return;
    }

    // The PolicyClaimed event tells us the exact amount transferred —
    // useful for the toast even though the value also equals
    // claimableWei at the moment of the call.
    const claimedEvents = parseEventLogs({
      abi: coverFiPolicyAbi,
      eventName: "PolicyClaimed",
      logs: receipt.logs,
    });
    const transferredAmount = claimedEvents[0]?.args.amount ?? 0n;

    // Refetch chain truth — these give us the post-claim claimed and
    // status, which we then write to DB. Don't guess client-side.
    const [freshPolicy] = await Promise.all([
      refetchChainPolicy(),
      refetchReleased(),
      refetchClaimable(),
    ]);

    const freshTuple = freshPolicy.data;
    if (!freshTuple) {
      // RPC hiccup — show post-claim modal so the user can retry the
      // DB update once chain reads come back.
      setPhase("idle");
      setPostClaimCtx({ txHash });
      return;
    }
    const newClaimedWei = freshTuple[8] as bigint;
    const newStatusEnum = Number(freshTuple[1]);
    const newStatus = STATUS_BY_ENUM[newStatusEnum] ?? "releasing";

    const dbResult = await updatePolicyClaim({
      chainPolicyId,
      ownerAddress: address,
      claimedWei: newClaimedWei,
      status: newStatus,
    });

    setPhase("idle");
    if (!dbResult.ok) {
      setPostClaimCtx({ txHash });
      return;
    }

    showToast(
      t.claimedToast(money(Number(formatUnits(transferredAmount, USDC_DECIMALS)))),
      { kind: "info" },
    );
  };

  // Retry only the DB write; chain claim is already settled.
  const handlePostClaimRetry = async () => {
    if (!postClaimCtx || !address || chainPolicyId === undefined) return;
    setPhase("claiming");

    const fresh = await refetchChainPolicy();
    if (!fresh.data) {
      setPhase("idle");
      return; // leave modal open so user can retry again
    }
    const newClaimedWei = fresh.data[8] as bigint;
    const newStatusEnum = Number(fresh.data[1]);
    const newStatus = STATUS_BY_ENUM[newStatusEnum] ?? "releasing";

    const dbResult = await updatePolicyClaim({
      chainPolicyId,
      ownerAddress: address,
      claimedWei: newClaimedWei,
      status: newStatus,
    });

    setPhase("idle");
    if (dbResult.ok) {
      setPostClaimCtx(null);
    }
  };

  const showReleaseBlock =
    effectiveStatus === "releasing" || effectiveStatus === "completed";

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
              <ReleaseBlock
                policy={policy}
                released={releasedDisplay}
                claimable={claimableDisplay}
                claimed={claimedDisplay}
                status={effectiveStatus}
                onClaim={handleClaim}
                busy={phase === "claiming"}
              />
            ) : (
              <StatusBlock policy={policy} />
            )}
          </div>
          <Panel title={t.timeline}>
            <StatusTimeline policy={policy} />
          </Panel>
        </div>
      </div>

      {/* Non-dismissible spinner while the claim tx is in flight. */}
      {phase === "claiming" && (
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

      {/* Wrong network. */}
      <Modal
        open={wrongChainOpen}
        onClose={() => setWrongChainOpen(false)}
        title={t.errWrongChainTitle}
      >
        <div className="errbox">{t.errWrongChainMsg(TARGET_CHAIN.name)}</div>
        <Button
          variant="ghost"
          block
          className="mt-3"
          onClick={() => setWrongChainOpen(false)}
        >
          {t.dismiss}
        </Button>
      </Modal>

      {/* claim() tx failed (non-rejection). */}
      <Modal
        open={claimFailedOpen}
        onClose={() => setClaimFailedOpen(false)}
        title={t.errClaimTxTitle}
      >
        <div className="errbox">{t.errClaimTxMsg}</div>
        <Button
          variant="ghost"
          block
          className="mt-3"
          onClick={() => setClaimFailedOpen(false)}
        >
          {t.dismiss}
        </Button>
      </Modal>

      {/* Post-claim DB save failed — chain claim is final, USDC
          already arrived. Retry re-runs the DB write only. */}
      <Modal
        open={postClaimCtx !== null && phase === "idle"}
        onClose={() => setPostClaimCtx(null)}
        title={t.errClaimSaveTitle}
      >
        <div className="errbox">
          {t.errClaimSaveMsg(
            postClaimCtx?.txHash ? shortAddress(postClaimCtx.txHash) : "—",
          )}
        </div>
        <Button
          variant="primary"
          block
          className="mt-3"
          onClick={handlePostClaimRetry}
        >
          {t.retryRecord}
        </Button>
        <Button
          variant="ghost"
          block
          className="mt-2"
          onClick={() => setPostClaimCtx(null)}
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
