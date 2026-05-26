import type { Address } from "viem";

/**
 * Deployed CoverFi contract addresses, keyed by chainId.
 *
 * Single source of truth for the frontend — `useReadContract` /
 * `useWriteContract` hooks pull addresses from here so a future
 * mainnet deploy is a one-key addition (and the wagmi-side `chainId`
 * picks the right entry without per-component branching).
 *
 * Provenance: deployed in Segment 4 / Phase D (see CLAUDE.md §5)
 * via Hardhat Ignition, verified on BscScan with source code public.
 *
 * 97 = BSC Testnet (chapel). Mainnet entries land later, alongside
 * a real audit + the solvency mechanism from PRD §9.1.
 */

/** Set of contracts deployed at one chainId. */
export interface DeployedContracts {
  mockUSDC: Address;
  coverFiPolicy: Address;
}

export const CONTRACT_ADDRESSES: Record<number, DeployedContracts> = {
  97: {
    mockUSDC: "0xb1DC4F171091D2b3d94a8B14be8cc663fD994e73",
    coverFiPolicy: "0xEbdd8f124EaD6DABd7C5F3893E2A244280fE5b19",
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
