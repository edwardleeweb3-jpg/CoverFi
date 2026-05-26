import {
  getContract,
  keccak256,
  toHex,
  type Address,
  type Client,
  type Hex,
} from "viem";

import { coverFiPolicyAbi } from "./abi/CoverFiPolicy";
import { mockUsdcAbi } from "./abi/MockUSDC";
import { BSC_TESTNET_CHAIN_ID, getContractAddresses } from "./addresses";

/**
 * Typed contract handles for the frontend.
 *
 * Two layers:
 *
 *   1. Raw ABIs (`coverFiPolicyAbi`, `mockUsdcAbi`) — `as const`
 *      literals so viem's type inference can derive every function /
 *      event / error signature. Used directly by wagmi hooks
 *      (`useReadContract({ abi, functionName, args })`) when you don't
 *      need a full contract instance.
 *
 *   2. Factory functions (`getCoverFiPolicyContract`,
 *      `getMockUsdcContract`) — wrap viem's `getContract` with the
 *      right address from `./addresses` already plugged in. Used in
 *      imperative paths (scripts, services, post-tx event polling)
 *      where you want `c.read.releasedOf([id])` instead of building
 *      the call shape per-site.
 *
 * Both wagmi-hook reads and imperative reads will type-check against
 * the same source-of-truth ABI; the bytes on-chain match what these
 * ABIs encode because they're generated from the compiled artifact
 * via `contracts/scripts/sync-abi.mjs` (run that after any contract
 * change to refresh).
 */

export { coverFiPolicyAbi, mockUsdcAbi };

export {
  BSC_TESTNET_CHAIN_ID,
  CONTRACT_ADDRESSES,
  getContractAddresses,
} from "./addresses";
export type { DeployedContracts } from "./addresses";

/**
 * Typed handle for the deployed CoverFiPolicy on `chainId`. Pass a
 * `PublicClient` to get `.read.*`; pass a `WalletClient` to get
 * `.write.*`. For both at once (rare outside server scripts), call
 * viem's `getContract` directly with `client: { public, wallet }` —
 * viem's overload there has stricter typing than a generic wrapper
 * can comfortably expose.
 *
 * Defaults to BSC Testnet (chainId 97).
 */
export function getCoverFiPolicyContract(
  client: Client,
  chainId: number = BSC_TESTNET_CHAIN_ID,
) {
  const address: Address = getContractAddresses(chainId).coverFiPolicy;
  return getContract({ address, abi: coverFiPolicyAbi, client });
}

/**
 * Typed handle for the deployed MockUSDC on `chainId`. Same client
 * conventions as `getCoverFiPolicyContract`.
 */
export function getMockUsdcContract(
  client: Client,
  chainId: number = BSC_TESTNET_CHAIN_ID,
) {
  const address: Address = getContractAddresses(chainId).mockUSDC;
  return getContract({ address, abi: mockUsdcAbi, client });
}

// ─── Hashing helpers ─────────────────────────────────────────────

/**
 * Canonical mapping `signa_order_id` → `bytes32 orderHash` used by
 * `CoverFiPolicy.buyPolicy`. Lives here (not in a util file) so the
 * single source-of-truth is co-located with the contract abi: any
 * future tweak to the hashing scheme can only happen alongside an
 * ABI change.
 *
 * Scheme: `keccak256(utf8Bytes(orderId))`. Picked in plan answer (a)
 * — opaque, format-agnostic, forward-compatible with whatever Signa
 * eventually uses as their id format.
 */
export function orderHashOf(signaOrderId: string): Hex {
  return keccak256(toHex(signaOrderId));
}

/**
 * `option` label → `bytes32` for the `PolicyMinted` event. The
 * contract never reads option (it's event-only), so the hashing
 * scheme is purely a convention between frontend and indexer.
 *
 * We hash the English label (e.g. "Yes" / "No") for cross-locale
 * consistency — "是" and "Yes" represent the same option but only
 * one of them can be the canonical on-chain identifier.
 */
export function optionHashOf(englishLabel: string): Hex {
  return keccak256(toHex(englishLabel));
}

// ─── ID format ───────────────────────────────────────────────────

/**
 * On-chain `policyId` (uint256) → human-readable `id` ("CF-0000232").
 * Used for the DB `id` column and the `/policies/[id]` route.
 *
 * Seven-digit zero-padding preserves the visual style established
 * by the prototype's pre-contract demo (CF-00xxx with five digits)
 * while extending capacity headroom — by the time we exceed 9.99M
 * policies the format is the least of our concerns.
 */
export function formatPolicyId(chainPolicyId: bigint): string {
  return `CF-${chainPolicyId.toString().padStart(7, "0")}`;
}
