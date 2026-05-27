import type { Address } from "viem";

/**
 * Signa Pulse beta deployment, keyed by chainId.
 *
 * Per FAQ (`_docs/2026-05-26-signa-pulse-integration-faq.md` §A),
 * Signa Pulse is deployed on BSC mainnet/testnet just like us, so
 * the integration is pure on-chain — no cross-chain bridging, no
 * adapter contract. CoverFi reads Signa state directly through
 * `IPulseMarket` and `IPulseFactoryRegistry` views.
 *
 * Beta vs dev: beta has the complete arbitrator set (Single +
 * Collective) and isn't periodically wiped. Dev is for Signa
 * internal test cycles. We target beta exclusively.
 *
 * Empirically verified by `contracts/scripts/probe-signa.ts` at
 * 2026-05-27: factory walk yielded 4 registered markets (ids 1–4),
 * `marketIds` ↔ `markets` bijection holds, `tUSDC` confirmed as
 * 18 decimals.
 *
 * Mainnet (Signa prod) addresses are in the FAQ but unused until
 * CoverFi itself has a mainnet deploy (post-Segment-5 pre-mainnet
 * hardening; see CLAUDE.md §8). Add the chainId-56 entry then.
 */

export interface SignaContracts {
  factory: Address;
  usdc: Address;
  /** First block where Signa Pulse beta was live; lower bound for any
   *  market scan. Per FAQ §A; spot-checked by probe-signa.ts.
   *
   *  Currently unreferenced — D8 chose the Signa-provided data source
   *  for the "list a user's positions" flow, so CoverFi does not run
   *  its own BetPlaced indexer. Kept here only for the contingency
   *  path where Signa can't deliver the data and we fall back to
   *  building an indexer + provisioning a paid BSC RPC (5A.3 ask). */
  factoryDeployBlock: bigint;
}

export const SIGNA_CONTRACTS: Record<number, SignaContracts> = {
  97: {
    factory: "0xD23323a906F6d6d28224a37Cc963d55678AA7E65",
    usdc: "0xc03d7EA305485421e444070260D68ee598C1719c",
    factoryDeployBlock: 106_095_419n,
  },
} as const;

export function getSignaContracts(chainId: number = 97): SignaContracts {
  const entry = SIGNA_CONTRACTS[chainId];
  if (!entry) {
    throw new Error(
      `[signa/addresses] No Signa Pulse deployment recorded for chainId ${chainId}. ` +
        `Known chainIds: ${Object.keys(SIGNA_CONTRACTS).join(", ")}.`,
    );
  }
  return entry;
}
