"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/hooks/useT";
import { useWalletStore } from "@/stores/wallet";

function money(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Combined wallet entry-point + status pill + disconnect dropdown.
 *
 * Not connected → primary "Connect wallet" button; click opens the
 * wallet picker via the store.
 *
 * Connected → address pill; click toggles a popover with the address,
 * balance, and an explicit Disconnect action. The address pill itself
 * NEVER disconnects on click — only the menu's Disconnect button does.
 *
 * Drop-in for the SiteHeader in step 3.
 */
export function WalletConnectButton() {
  const connected = useWalletStore((s) => s.connected);
  const address = useWalletStore((s) => s.address);
  const balance = useWalletStore((s) => s.balance);
  const openPicker = useWalletStore((s) => s.openPicker);
  const disconnect = useWalletStore((s) => s.disconnect);
  const t = useT();

  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Outside click + Esc close menu. Listeners only mount while open so we
  // don't pay for global handlers when idle.
  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
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

  // If disconnect happens from anywhere else (e.g. drawer in step 3), close.
  useEffect(() => {
    if (!connected && menuOpen) setMenuOpen(false);
  }, [connected, menuOpen]);

  if (!connected) {
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
          style={{
            background: "var(--good)",
            boxShadow: "0 0 0 3px var(--good-soft)",
          }}
        />
        {address}
      </button>

      {menuOpen && (
        <div
          role="menu"
          aria-label={t.disconnect}
          className="absolute right-0 top-[calc(100%+8px)] z-[80] w-[280px] max-w-[calc(100vw-32px)] rounded-m border border-line-2 bg-surface p-3"
          style={{
            animation: "fade 0.16s var(--ease)",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
          }}
        >
          {/* Wallet info row — mirrors prototype `.d-wallet` (live dot + addr + balance). */}
          <div className="flex items-center gap-2 rounded-s border border-line px-3 py-2.5 font-mono text-[12.5px] text-text-2">
            <span
              className="inline-block h-1.5 w-1.5 flex-none rounded-full"
              style={{
                background: "var(--good)",
                boxShadow: "0 0 0 3px var(--good-soft)",
              }}
            />
            <span>{address}</span>
            <span className="ml-auto text-text-3">{money(balance)} USDC</span>
          </div>

          {/* Disconnect action — the ONLY thing that actually disconnects. */}
          <Button
            variant="ghost"
            block
            className="mt-2"
            onClick={() => {
              disconnect();
              setMenuOpen(false);
            }}
          >
            {t.disconnect}
          </Button>
        </div>
      )}
    </div>
  );
}
