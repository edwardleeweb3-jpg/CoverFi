"use client";

import { ReactNode } from "react";
import { Web3Provider } from "./Web3Provider";
import { ThemeEffects } from "./ThemeEffects";
import { LocaleEffects } from "./LocaleEffects";
import { ToastHost } from "./ToastHost";
import { WalletFlow } from "./WalletFlow";

/**
 * Wraps the app with all mount-time effects + global UI hosts.
 *
 * - Web3Provider: WagmiProvider + QueryClientProvider (wallet hooks
 *   require both). All wallet-aware components must be inside this.
 * - ThemeEffects / LocaleEffects: no render, install observers/listeners.
 * - WalletFlow: renders the picker modal + connecting-status modal driven
 *   by the WalletStore's `flow` field.
 * - ToastHost: renders the global toast.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Web3Provider>
      <ThemeEffects />
      <LocaleEffects />
      {children}
      <WalletFlow />
      <ToastHost />
    </Web3Provider>
  );
}
