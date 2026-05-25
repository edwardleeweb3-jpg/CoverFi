"use client";

import { ReactNode } from "react";
import { ThemeEffects } from "./ThemeEffects";
import { LocaleEffects } from "./LocaleEffects";
import { ToastHost } from "./ToastHost";
import { WalletFlow } from "./WalletFlow";

/**
 * Wraps the app with all mount-time effects + global UI hosts.
 *
 * - ThemeEffects / LocaleEffects: no render, install observers/listeners.
 * - WalletFlow: renders the picker modal + connecting-status modal driven
 *   by the WalletStore's `flow` field.
 * - ToastHost: renders the global toast.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <ThemeEffects />
      <LocaleEffects />
      {children}
      <WalletFlow />
      <ToastHost />
    </>
  );
}
