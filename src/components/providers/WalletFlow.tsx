"use client";

import { useEffect } from "react";
import { useAccount, useConnect } from "wagmi";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useT } from "@/hooks/useT";
import { useWalletStore } from "@/stores/wallet";
import { useToastStore } from "@/stores/toast";
import { useLocaleStore } from "@/stores/locale";
import { dictionaries } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";

const METAMASK_INSTALL_URL = "https://metamask.io/download/";

/**
 * Renders the wallet picker modal AND the connecting-status modal driven
 * by WalletStore's `flow` field. Mounted once via AppProviders.
 *
 * v1 wallet list = MetaMask only. The generic "Injected" connector that
 * wagmi creates when no EIP-6963 wallet is detected is deliberately not
 * surfaced as a separate row — it's developer terminology, not user-
 * facing. When MetaMask isn't installed we still show the MetaMask row
 * but degrade it to an install-link affordance.
 */
export function WalletFlow() {
  const flow = useWalletStore((s) => s.flow);
  const closePicker = useWalletStore((s) => s.closePicker);
  const setConnecting = useWalletStore((s) => s.setConnecting);
  const setIdle = useWalletStore((s) => s.setIdle);
  const t = useT();

  const { connectors, connect, error } = useConnect();
  const { isConnected, address } = useAccount();

  // EIP-6963 surfaces installed wallets by name; case-insensitive match.
  const metamaskConnector = connectors.find((c) =>
    c.name.toLowerCase().includes("metamask"),
  );
  const installed = Boolean(metamaskConnector);

  // Success → close the spinner + fire the connected toast.
  useEffect(() => {
    if (flow.kind === "connecting" && isConnected && address) {
      const tt = dictionaries[useLocaleStore.getState().lang];
      useToastStore.getState().show(tt.connected(flow.name), {
        kind: "info",
        sub: shortAddress(address),
      });
      setIdle();
    }
  }, [flow, isConnected, address, setIdle]);

  // Error / user-rejected → fire an error toast and return to idle.
  useEffect(() => {
    if (flow.kind === "connecting" && error) {
      const tt = dictionaries[useLocaleStore.getState().lang];
      useToastStore.getState().show(tt.rejected, {
        kind: "err",
        sub: error.message,
      });
      setIdle();
    }
  }, [flow, error, setIdle]);

  const handleMetaMaskClick = () => {
    if (installed && metamaskConnector) {
      setConnecting("MetaMask");
      connect({ connector: metamaskConnector });
    } else {
      // Open MetaMask's official download page in a new tab. The picker
      // stays open so the user can come back and click again after install.
      window.open(METAMASK_INSTALL_URL, "_blank", "noopener,noreferrer");
    }
  };

  if (flow.kind === "picker") {
    return (
      <Modal
        open
        onClose={closePicker}
        title={t.walletModalT}
        description={t.walletModalP}
      >
        <button
          type="button"
          onClick={handleMetaMaskClick}
          className="wallet-opt"
        >
          <span className="ic" style={{ background: "transparent" }}>
            <img
              src="/wallets/metamask.svg"
              alt=""
              width={28}
              height={28}
              style={{ opacity: installed ? 1 : 0.55 }}
              draggable={false}
            />
          </span>
          <span>
            <span className="wn">MetaMask</span>
            <br />
            <span className="wd">{installed ? t.extension : t.notInstalled}</span>
          </span>
          <span className="arr">
            {installed ? (
              <Icon name="arrow" size={16} />
            ) : (
              <span
                style={{
                  color: "var(--signal-2)",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {t.installMetaMask} ↗
              </span>
            )}
          </span>
        </button>
      </Modal>
    );
  }

  if (flow.kind === "connecting") {
    // Non-dismissible — no onClose, no Esc handler.
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
