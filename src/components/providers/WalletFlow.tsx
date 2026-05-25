"use client";

import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useT } from "@/hooks/useT";
import { useWalletStore } from "@/stores/wallet";
import type { Dict } from "@/lib/i18n";

interface WalletOption {
  name: string;
  /** Looked up against the dictionary at render time so it follows the active language. */
  descKey: keyof Pick<Dict, "extension" | "scanMobile">;
  /** Marker tile background — mirrors prototype's per-wallet color. */
  bg: string;
  letter: string;
}

const OPTIONS: WalletOption[] = [
  { name: "MetaMask", descKey: "extension", bg: "#E2761B", letter: "M" },
  { name: "Rabby", descKey: "extension", bg: "#5577FF", letter: "R" },
  { name: "WalletConnect", descKey: "scanMobile", bg: "#2E3B4E", letter: "W" },
];

/**
 * Renders the wallet picker modal AND the connecting-status modal based on
 * the WalletStore's `flow` field. Mounted once via AppProviders, no props.
 */
export function WalletFlow() {
  const flow = useWalletStore((s) => s.flow);
  const closePicker = useWalletStore((s) => s.closePicker);
  const pickWallet = useWalletStore((s) => s.pickWallet);
  const t = useT();

  if (flow.kind === "picker") {
    return (
      <Modal
        open
        onClose={closePicker}
        title={t.walletModalT}
        description={t.walletModalP}
      >
        {OPTIONS.map((opt) => (
          <button
            key={opt.name}
            type="button"
            onClick={() => pickWallet(opt.name)}
            className="wallet-opt"
          >
            <span className="ic" style={{ background: opt.bg }}>
              {opt.letter}
            </span>
            <span>
              <span className="wn">{opt.name}</span>
              <br />
              <span className="wd">{t[opt.descKey]}</span>
            </span>
            <span className="arr">
              <Icon name="arrow" size={16} />
            </span>
          </button>
        ))}
      </Modal>
    );
  }

  if (flow.kind === "connecting") {
    // Non-dismissible by design — no onClose, no Esc handler. Rendered as bare
    // overlay/modal markup (not via <Modal>) so we don't inherit close behavior.
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-live="polite">
        <div className="modal">
          <div className="modal-status">
            <Spinner />
            <h3>{t.cwTitle(flow.name)}</h3>
            <p>{t.approveConn}</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
