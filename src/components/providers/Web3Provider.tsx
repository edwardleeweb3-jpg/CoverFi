"use client";

import { ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * Wraps the app with wagmi (chain config + connectors) and react-query
 * (wagmi's data-fetching layer). Mounted once at the top of AppProviders
 * so every component inside can consume wallet hooks.
 *
 * `useState` initializer keeps the QueryClient referentially stable across
 * re-renders — re-creating it on every render would invalidate every cache
 * subscription.
 */
export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
