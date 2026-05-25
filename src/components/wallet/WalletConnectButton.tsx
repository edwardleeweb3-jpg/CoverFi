"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/Button";
import { useT } from "@/hooks/useT";
import { useWalletStore } from "@/stores/wallet";
import { useToast } from "@/stores/toast";
import { TARGET_CHAIN } from "@/lib/wagmi";
import { shortAddress } from "@/lib/format";

/**
 * Connect entry-point + address pill + disconnect popover.
 *
 * - Not connected: primary "Connect wallet" button; click opens the
 *   wagmi picker modal (via WalletStore.openPicker → WalletFlow).
 * - Connected: address pill with a status dot. Click toggles a popover
 *   showing the full short-address, an optional "switch network" CTA
 *   when on the wrong chain, and an explicit Disconnect action. The
 *   address pill itself NEVER disconnects on click.
 */
export function WalletConnectButton() {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: switchPending } = useSwitchChain();
  const openPicker = useWalletStore((s) => s.openPicker);
  const t = useT();
  const showToast = useToast();

  const onWrongChain = isConnected && chainId !== TARGET_CHAIN.id;

  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Outside click + Esc close menu. Listeners scoped to open state.
  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // External disconnect (from wallet, drawer) closes the popover.
  useEffect(() => {
    if (!isConnected && menuOpen) setMenuOpen(false);
  }, [isConnected, menuOpen]);

  if (!isConnected) {
    return (
      <Button
        variant="primary"
        size="sm"
        className="min-w-[9rem]"
        onClick={() => openPicker()}
      >
        {t.connect}
      </Button>
    );
  }

  const handleDisconnect = () => {
    disconnect();
    setMenuOpen(false);
    showToast(t.disconnected);
  };

  const dotBg = onWrongChain ? "var(--warn)" : "var(--good)";
  const dotSoft = onWrongChain ? "var(--warn-soft)" : "var(--good-soft)";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="flex min-w-[9rem] items-center justify-center gap-2 rounded-s border border-line-2 px-3 py-2 font-mono text-[13px] transition hover:border-line-3"
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: dotBg, boxShadow: `0 0 0 3px ${dotSoft}` }}
        />
        {shortAddress(address)}
      </button>

      {menuOpen && (
        <div
          role="menu"
          aria-label={t.disconnect}
          className="absolute right-0 top-[calc(100%+8px)] z-[80] w-[300px] max-w-[calc(100vw-32px)] rounded-m border border-line-2 bg-surface p-3"
          style={{
            animation: "fade 0.16s var(--ease)",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
          }}
        >
          {/* Wallet info row — short address + status dot. */}
          <div className="flex items-center gap-2 rounded-s border border-line px-3 py-2.5 font-mono text-[12.5px] text-text-2">
            <span
              className="inline-block h-1.5 w-1.5 flex-none rounded-full"
              style={{ background: dotBg, boxShadow: `0 0 0 3px ${dotSoft}` }}
            />
            <span>{shortAddress(address)}</span>
          </div>

          {/* Wrong-chain warning + switch button. */}
          {onWrongChain && (
            <div
              className="mt-2 rounded-s border p-3 text-[12px] leading-[1.5] text-text-2"
              style={{
                background: "var(--warn-soft)",
                borderColor: "rgba(217, 150, 63, 0.34)",
              }}
            >
              <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-warn">
                {t.wrongChain}
              </div>
              <p className="mt-1.5">{t.wrongChainDesc(TARGET_CHAIN.name)}</p>
              <Button
                variant="ghost"
                block
                className="mt-2.5"
                disabled={switchPending}
                onClick={() => switchChain({ chainId: TARGET_CHAIN.id })}
              >
                {switchPending ? t.switching : t.switchTo(TARGET_CHAIN.name)}
              </Button>
            </div>
          )}

          <Button variant="ghost" block className="mt-2" onClick={handleDisconnect}>
            {t.disconnect}
          </Button>
        </div>
      )}
    </div>
  );
}
