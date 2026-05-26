"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  parseUnits,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { useHasMounted } from "@/hooks/useHasMounted";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Panel } from "@/components/ui/Panel";
import { Spinner } from "@/components/ui/Spinner";
import { GatedView } from "@/components/insurance/GatedView";
import { useLocale, useT } from "@/hooks/useT";
import { ORDERS } from "@/lib/mock";
import { kOf } from "@/lib/pricing";
import { premiumOf } from "@/lib/pricing.bigint";
import { RELEASE_DAYS } from "@/lib/config";
import { money, shortAddress } from "@/lib/format";
import {
  BSC_TESTNET_CHAIN_ID,
  coverFiPolicyAbi,
  formatPolicyId,
  getContractAddresses,
  mockUsdcAbi,
  optionHashOf,
  orderHashOf,
} from "@/lib/contracts";
import { isUserRejection, revertedWith } from "@/lib/contracts/errors";
import { TARGET_CHAIN } from "@/lib/wagmi";
import { insertPolicy } from "@/lib/db/policies";
import { useSimulationStore } from "@/stores/simulation";
import { useToast } from "@/stores/toast";
import { PayCoverStripe } from "./PayCoverStripe";
import { TermsTable } from "./TermsTable";
import { FloorNote } from "./FloorNote";
import { TermsChecklist } from "./TermsChecklist";
import { WalletPayBox } from "./WalletPayBox";

interface Props {
  orderId: string;
}

/** USDC base-unit decimals. */
const USDC_DECIMALS = 6;

/** Phases the pay button cycles through. */
type Phase = "idle" | "approving" | "minting" | "saving";

/**
 * /insurance/review/[orderId] — confirm-and-pay screen, on-chain edition.
 *
 * Flow:
 *   1. Pre-flight checks: connection, chain, balance, live quote.
 *   2. `approve(coverFi, premium)` on MockUSDC → wait receipt.
 *   3. `buyPolicy(orderHash, principalWei, kBps, optionHash)` on
 *      CoverFiPolicy → wait receipt → parse `PolicyMinted` log to get
 *      the chain-assigned `policyId`.
 *   4. Insert a row into Supabase with id = `formatPolicyId(policyId)`,
 *      plus `tx_hash` and `chain_policy_id` for indexer reconciliation.
 *   5. Mark the order locally (so /insurance hides it this session)
 *      and navigate to /policies/[id].
 *
 * Error branches:
 *   - user rejects in wallet → silent, back to idle.
 *   - approve tx fails → approve-failed modal.
 *   - buyPolicy reverts with OrderAlreadyInsured → order-taken modal.
 *   - buyPolicy fails otherwise → mint-failed modal.
 *   - chain succeeded but DB save failed → post-mint-failed modal with
 *     the tx hash + policyId stashed, retry button calls insertPolicy
 *     again without re-running the chain side.
 */
export function ReviewPage({ orderId }: Props) {
  const t = useT();
  const { lang } = useLocale();
  const { isConnected, status, address } = useAccount();
  const chainId = useChainId();
  const mounted = useHasMounted();
  const insuredOrderIds = useSimulationStore((s) => s.insuredOrderIds);
  const markInsured = useSimulationStore((s) => s.markInsured);
  const showToast = useToast();
  const router = useRouter();

  const usdcAddress = getContractAddresses().mockUSDC;
  const coverFiAddress = getContractAddresses().coverFiPolicy;

  // Live qBps off the chain — drives the displayed premium so an
  // admin-tuned Q is reflected immediately (matches what the contract
  // will charge at buyPolicy time).
  const { data: qBpsRaw } = useReadContract({
    address: coverFiAddress,
    abi: coverFiPolicyAbi,
    functionName: "qBps",
  });

  // Real USDC balance — wagmi v3 `useBalance` is native-token only,
  // so we read `balanceOf(address)` on the MockUSDC contract.
  const { data: balanceRaw, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // Phase + modal state.
  const [phase, setPhase] = useState<Phase>("idle");
  const [insufOpen, setInsufOpen] = useState(false);
  const [wrongChainOpen, setWrongChainOpen] = useState(false);
  const [approveFailedOpen, setApproveFailedOpen] = useState(false);
  const [mintFailedOpen, setMintFailedOpen] = useState(false);
  const [orderTakenOpen, setOrderTakenOpen] = useState(false);
  // Post-mint failure context — keep the tx hash + chain id around so
  // the retry button can re-call insertPolicy without re-running the
  // (already-successful, irreversible) chain side.
  const [postMintCtx, setPostMintCtx] = useState<{
    txHash: Hex;
    policyId: bigint | null;
  } | null>(null);

  // ─── Gate ────────────────────────────────────────────────────
  if (!mounted || status === "connecting" || status === "reconnecting") {
    return <GatedView hideCard />;
  }
  if (!isConnected) {
    return <GatedView />;
  }

  const order = ORDERS.find((o) => o.id === orderId);
  if (!order || insuredOrderIds.has(orderId)) {
    return <NotFoundView />;
  }

  // ─── Quote (bigint) ──────────────────────────────────────────
  const k = kOf(order);
  const kBpsLocal = Math.round(k * 10_000);
  const principalWei = parseUnits(order.a.toString(), USDC_DECIMALS);
  const quote =
    qBpsRaw !== undefined
      ? premiumOf({
          principal: principalWei,
          kBps: BigInt(kBpsLocal),
          qBps: qBpsRaw,
        })
      : null;

  // ─── Display values (number, for the existing components) ────
  const balanceWei: bigint = balanceRaw ?? 0n;
  const balanceDisplay = Number(formatUnits(balanceWei, USDC_DECIMALS));
  const payableDisplay = quote
    ? Number(formatUnits(quote.premium, USDC_DECIMALS))
    : 0;
  const baseDisplay = quote
    ? Number(formatUnits(quote.base, USDC_DECIMALS))
    : 0;
  const floorDisplay = quote
    ? Number(formatUnits(quote.floor, USDC_DECIMALS))
    : 0;
  const flooredDisplay = quote ? quote.floor > quote.base : false;

  const cat = lang === "zh" ? order.catZh : order.catEn;
  const mkt = lang === "zh" ? order.mZh : order.mEn;
  const opt = lang === "zh" ? order.optZh : order.optEn;

  // ─── Pay handler ─────────────────────────────────────────────
  const handlePay = async () => {
    if (phase !== "idle") return;
    if (!address || !quote || !publicClient) return;

    if (chainId !== BSC_TESTNET_CHAIN_ID) {
      setWrongChainOpen(true);
      return;
    }
    if (balanceWei < quote.premium) {
      setInsufOpen(true);
      return;
    }

    // 1. Approve USDC → coverFiAddress for exactly the premium amount.
    setPhase("approving");
    let approveHash: Hex;
    try {
      approveHash = await writeContractAsync({
        address: usdcAddress,
        abi: mockUsdcAbi,
        functionName: "approve",
        args: [coverFiAddress, quote.premium],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    } catch (e) {
      setPhase("idle");
      if (isUserRejection(e)) return; // silent — user explicitly cancelled
      setApproveFailedOpen(true);
      return;
    }

    // 2. buyPolicy on-chain.
    setPhase("minting");
    let mintHash: Hex;
    let mintReceipt: TransactionReceipt;
    try {
      mintHash = await writeContractAsync({
        address: coverFiAddress,
        abi: coverFiPolicyAbi,
        functionName: "buyPolicy",
        args: [
          orderHashOf(order.id),
          principalWei,
          kBpsLocal,
          optionHashOf(order.optEn),
        ],
      });
      mintReceipt = await publicClient.waitForTransactionReceipt({
        hash: mintHash,
      });
    } catch (e) {
      setPhase("idle");
      if (isUserRejection(e)) return;
      if (revertedWith(e) === "OrderAlreadyInsured") {
        setOrderTakenOpen(true);
        return;
      }
      setMintFailedOpen(true);
      return;
    }

    // 3. Extract policyId from PolicyMinted log.
    const minted = parseEventLogs({
      abi: coverFiPolicyAbi,
      eventName: "PolicyMinted",
      logs: mintReceipt.logs,
    });
    const policyId = minted[0]?.args.policyId;
    if (policyId === undefined) {
      // On-chain succeeded but we can't find the event — bizarre but
      // possible if the receipt was reorganised before our parse.
      // Stash the tx hash for support-side recovery.
      setPhase("idle");
      setPostMintCtx({ txHash: mintHash, policyId: null });
      return;
    }

    // 4. Insert into Supabase. Failure here is non-recoverable from a
    // chain perspective (mint is final), so we surface a dedicated
    // post-mint modal with a retry hook.
    setPhase("saving");
    const formattedId = formatPolicyId(policyId);
    const dbResult = await insertPolicy({
      id: formattedId,
      chainPolicyId: policyId,
      txHash: mintHash,
      ownerAddress: address,
      order,
      premium: quote.premium,
      kBps: kBpsLocal,
    });

    if (!dbResult.ok) {
      setPhase("idle");
      setPostMintCtx({ txHash: mintHash, policyId });
      return;
    }

    // 5. Success.
    markInsured(order.id);
    void refetchBalance(); // header / pay box reflects new balance
    showToast(t.minted(formattedId), { kind: "info" });
    setPhase("idle");
    router.push(`/policies/${formattedId}`);
  };

  // Post-mint DB save retry — chain side stays as-is, only DB is re-attempted.
  const handlePostMintRetry = async () => {
    if (!postMintCtx?.policyId || !address || !quote) return;
    setPostMintCtx({ ...postMintCtx }); // keep modal closed via separate state below
    setPhase("saving");
    const formattedId = formatPolicyId(postMintCtx.policyId);
    const dbResult = await insertPolicy({
      id: formattedId,
      chainPolicyId: postMintCtx.policyId,
      txHash: postMintCtx.txHash,
      ownerAddress: address,
      order,
      premium: quote.premium,
      kBps: kBpsLocal,
    });
    if (!dbResult.ok) {
      // Stay on the modal — leave ctx so user can retry again.
      setPhase("idle");
      return;
    }
    markInsured(order.id);
    showToast(t.minted(formattedId), { kind: "info" });
    setPhase("idle");
    setPostMintCtx(null);
    router.push(`/policies/${formattedId}`);
  };

  const busy = phase !== "idle";
  const phaseTitle =
    phase === "approving"
      ? t.approving
      : phase === "minting"
        ? t.minting
        : phase === "saving"
          ? t.savingPolicy
          : "";
  const phaseSub =
    phase === "approving"
      ? t.approvingSub
      : phase === "minting"
        ? t.mintingSub
        : phase === "saving"
          ? t.savingPolicySub
          : "";

  return (
    <>
      <div className="page wrap">
        <div className="page-head rise">
          <div className="crumb">
            <Link href="/insurance">{t.insureTitle}</Link> / {t.reviewCrumb}
          </div>
          <div className="pagetitle">{t.reviewTitle}</div>
        </div>

        <div className="grid2 rise-2">
          <Panel title={t.orderCoverage}>
            <div className="review-subhead">
              {cat} · {order.id}
            </div>
            <div className="review-mkt">{mkt}</div>

            <PayCoverStripe payable={payableDisplay} coverage={order.a} />

            <TermsTable
              option={opt}
              principal={order.a}
              basePremium={baseDisplay}
              floor={floorDisplay}
              payable={payableDisplay}
              coverage={order.a}
              releaseDays={RELEASE_DAYS}
              linearLabel={t.linear}
            />

            <FloorNote
              floored={flooredDisplay}
              base={baseDisplay}
              floor={floorDisplay}
            />
          </Panel>

          <Panel title={t.terms}>
            <TermsChecklist />
            <WalletPayBox
              balance={balanceDisplay}
              premium={payableDisplay}
              onPay={handlePay}
              disabled={busy || !quote}
            />
          </Panel>
        </div>
      </div>

      {/* Non-dismissible spinner overlay during approve / mint / save. */}
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
              <h3>{phaseTitle}</h3>
              <p>{phaseSub}</p>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient balance. */}
      <Modal
        open={insufOpen}
        onClose={() => setInsufOpen(false)}
        title={t.errInsufTitle}
      >
        <div className="errbox">
          {t.errInsufMsg(money(payableDisplay), money(balanceDisplay))}
        </div>
        <Button
          variant="ghost"
          block
          className="mt-3"
          onClick={() => setInsufOpen(false)}
        >
          {t.dismiss}
        </Button>
      </Modal>

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

      {/* approve() tx failed (non-rejection). */}
      <Modal
        open={approveFailedOpen}
        onClose={() => setApproveFailedOpen(false)}
        title={t.errApproveTitle}
      >
        <div className="errbox">{t.errApproveMsg}</div>
        <Button
          variant="ghost"
          block
          className="mt-3"
          onClick={() => setApproveFailedOpen(false)}
        >
          {t.dismiss}
        </Button>
      </Modal>

      {/* buyPolicy() tx failed (non-rejection, non-OrderAlreadyInsured). */}
      <Modal
        open={mintFailedOpen}
        onClose={() => setMintFailedOpen(false)}
        title={t.errMintTitle}
      >
        <div className="errbox">{t.errMintMsg}</div>
        <Button
          variant="ghost"
          block
          className="mt-3"
          onClick={() => setMintFailedOpen(false)}
        >
          {t.dismiss}
        </Button>
      </Modal>

      {/* OrderAlreadyInsured contract revert. */}
      <Modal
        open={orderTakenOpen}
        onClose={() => setOrderTakenOpen(false)}
        title={t.errOrderTakenTitle}
      >
        <div className="errbox">{t.errOrderTakenMsg}</div>
        <Button
          variant="ghost"
          block
          className="mt-3"
          onClick={() => setOrderTakenOpen(false)}
        >
          {t.dismiss}
        </Button>
      </Modal>

      {/* Post-mint DB-save failure. Keeps the tx hash visible so user
          can show support a BscScan link. Retry calls insertPolicy
          only — the chain side is already final. */}
      <Modal
        open={postMintCtx !== null && phase === "idle"}
        onClose={() => setPostMintCtx(null)}
        title={t.errPostMintTitle}
      >
        <div className="errbox">
          {t.errPostMintMsg(
            postMintCtx?.txHash ? shortAddress(postMintCtx.txHash) : "—",
          )}
        </div>
        {postMintCtx?.policyId !== null && (
          <Button
            variant="primary"
            block
            className="mt-3"
            onClick={handlePostMintRetry}
          >
            {t.retryRecord}
          </Button>
        )}
        <Button
          variant="ghost"
          block
          className="mt-2"
          onClick={() => setPostMintCtx(null)}
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
          <Link href="/insurance">{t.insureTitle}</Link> / {t.reviewCrumb}
        </div>
        <div className="pagetitle">{t.reviewTitle}</div>
      </div>
      <div className="empty2">
        <div className="e-ic">
          <Icon name="empty" size={20} />
        </div>
        <div className="e-t">{t.emptyOrdersT}</div>
        <div className="e-d">{t.emptyOrdersD}</div>
        <Link href="/insurance" className="btn btn-ghost btn-sm">
          {t.insureTitle}
        </Link>
      </div>
    </div>
  );
}
