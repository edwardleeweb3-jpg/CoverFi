import type { Address } from "viem";

import { SIGNA_CONTRACTS } from "./signa/addresses";

/**
 * Deployed CoverFi contract addresses, keyed by chainId.
 *
 * Single source of truth for the frontend — `useReadContract` /
 * `useWriteContract` hooks pull addresses from here so a future
 * mainnet deploy is a one-key addition (and the wagmi-side `chainId`
 * picks the right entry without per-component branching).
 *
 * Provenance: originally deployed in Segment 4 / Phase D (see
 * CLAUDE.md §5) via Hardhat Ignition, verified on BscScan with source
 * code public. Segment 5 / Phase 5B.8 redeploy swapped
 * `coverFiPolicy` to a Signa Pulse-aware v2; the legacy `mockUSDC`
 * field is retained as a placeholder until 5C.4 removes the
 * consumer side (see field comment below).
 *
 * 97 = BSC Testnet (chapel). Mainnet entries land later, alongside
 * a real audit + the solvency mechanism from PRD §9.1.
 */

/** Set of contracts deployed at one chainId. */
export interface DeployedContracts {
  /**
   * LEGACY (Segment 4 / pre-5B.8) — kept for type-compat with
   * `getMockUsdcContract()` and ReviewPage's MockUSDC balance/approve
   * reads. Segment 5 `buyPolicy` pulls premiums in Signa tUSDC (see
   * `signaTUsdc`), so this field is no longer the production USDC
   * and the address it holds is the now-orphaned v1 MockUSDC.
   * Removed in 5C.4 alongside the consumer-side rewrite.
   */
  mockUSDC: Address;
  coverFiPolicy: Address;
  /**
   * Signa Pulse beta tUSDC — the ERC-20 the Segment 5 `buyPolicy`
   * pulls premiums in. Mirrors `SIGNA_CONTRACTS[chainId].usdc` so
   * the Signa-side and CoverFi-side address tables stay in lockstep
   * from a single source.
   */
  signaTUsdc: Address;
}

export const CONTRACT_ADDRESSES: Record<number, DeployedContracts> = {
  97: {
    mockUSDC: "0xb1DC4F171091D2b3d94a8B14be8cc663fD994e73",
    coverFiPolicy: "0x93F92688C5feA2C5530cddeaf796b40b4Fab72f2",
    signaTUsdc: SIGNA_CONTRACTS[97].usdc,
  },
} as const;

/** BSC Testnet chainId (matches `wagmi/chains.bscTestnet.id`). */
export const BSC_TESTNET_CHAIN_ID = 97 as const;

/** Convenience accessor — defaults to BSC Testnet for v1. */
export function getContractAddresses(
  chainId: number = BSC_TESTNET_CHAIN_ID,
): DeployedContracts {
  const entry = CONTRACT_ADDRESSES[chainId];
  if (!entry) {
    throw new Error(
      `[contracts/addresses] No deployment recorded for chainId ${chainId}. ` +
        `Known chainIds: ${Object.keys(CONTRACT_ADDRESSES).join(", ")}.`,
    );
  }
  return entry;
}
