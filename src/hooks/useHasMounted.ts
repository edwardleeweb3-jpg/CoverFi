"use client";

import { useEffect, useState } from "react";

/**
 * Returns false on the SSR pass and the first client paint (matching SSR
 * to avoid hydration mismatch), then flips to true after `useEffect`
 * fires on the client.
 *
 * Used by the gated pages so we can defer the "connected vs. disconnected"
 * decision by one tick — wagmi's persisted-connection reconnect is async,
 * and rendering the Connect-wallet prompt before that resolves causes a
 * visible flash for users who are in fact already connected.
 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
