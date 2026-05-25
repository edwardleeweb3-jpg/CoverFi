"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useHasMounted } from "@/hooks/useHasMounted";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Panel } from "@/components/ui/Panel";
import { Spinner } from "@/components/ui/Spinner";
import { GatedView } from "@/components/insurance/GatedView";
import { useLocale, useT } from "@/hooks/useT";
import { ORDERS } from "@/lib/mock";
import { kOf, premiumOf } from "@/lib/pricing";
import { RELEASE_DAYS } from "@/lib/config";
import { money } from "@/lib/format";
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

/** Simulated mint delay, mirrors prototype's setTimeout. */
const MINT_DELAY_MS = 1200;

/**
 * /insurance/review/[orderId] — confirm-and-pay screen.
 *
 * Reads the target order from the static seed; if not found OR already
 * insured (from a previous mint in the same session) it falls back to a
 * small "not found" view with a link back to the insurance list. The
 * pay flow:
 *   1. Verify balance ≥ payable; if not, open the insufficient-balance modal.
 *   2. Open a non-dismissible busy overlay (Spinner + "Minting policy").
 *   3. After MINT_DELAY_MS: mint via the simulation store (deducts balance,
 *      adds policy + activity, marks order as insured), close overlay,
 *      fire success toast, navigate to /policies/[newId].
 */
export function ReviewPage({ orderId }: Props) {
  const t = useT();
  const { lang } = useLocale();
  const { isConnected, status } = useAccount();
  const mounted = useHasMounted();
  const balance = useSimulationStore((s) => s.balance);
  const insuredOrderIds = useSimulationStore((s) => s.insuredOrderIds);
  const mintPolicy = useSimulationStore((s) => s.mintPolicy);
  const showToast = useToast();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);

  // Gate before doing anything else — disconnected users see the locked
  // preview (reused from /insurance for visual continuity). Defer the
  // decision until wagmi finishes its initial reconnect.
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

  const k = kOf(order);
  const pr = premiumOf(order.a, k);

  const cat = lang === "zh" ? order.catZh : order.catEn;
  const mkt = lang === "zh" ? order.mZh : order.mEn;
  const opt = lang === "zh" ? order.optZh : order.optEn;

  const handlePay = () => {
    if (busy) return;
    if (pr.payable > balance) {
      setErrorOpen(true);
      return;
    }
    setBusy(true);
    setTimeout(() => {
      const id = mintPolicy(order, pr.payable, k);
      setBusy(false);
      showToast(t.minted(id), { kind: "info" });
      router.push(`/policies/${id}`);
    }, MINT_DELAY_MS);
  };

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
          {/* Left panel: order + coverage breakdown */}
          <Panel title={t.orderCoverage}>
            <div className="review-subhead">
              {cat} · {order.id}
            </div>
            <div className="review-mkt">{mkt}</div>

            <PayCoverStripe payable={pr.payable} coverage={order.a} />

            <TermsTable
              option={opt}
              principal={order.a}
              basePremium={pr.base}
              floor={pr.floor}
              payable={pr.payable}
              coverage={order.a}
              releaseDays={RELEASE_DAYS}
              linearLabel={t.linear}
            />

            <FloorNote floored={pr.floored} base={pr.base} floor={pr.floor} />
          </Panel>

          {/* Right panel: terms checklist + balance + pay button */}
          <Panel title={t.terms}>
            <TermsChecklist />
            <WalletPayBox
              balance={balance}
              premium={pr.payable}
              onPay={handlePay}
              disabled={busy}
            />
          </Panel>
        </div>
      </div>

      {/* Non-dismissible busy overlay during the simulated mint. Rendered
          inline (not via <Modal>) so neither Esc nor backdrop close it. */}
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
              <h3>{t.minting}</h3>
              <p>{t.mintingSub}</p>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient balance — uses the standard Modal (Esc / backdrop close). */}
      <Modal
        open={errorOpen}
        onClose={() => setErrorOpen(false)}
        title={t.errInsufTitle}
      >
        <div className="errbox">
          {t.errInsufMsg(money(pr.payable), money(balance))}
        </div>
        <Button
          variant="ghost"
          block
          className="mt-3"
          onClick={() => setErrorOpen(false)}
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
