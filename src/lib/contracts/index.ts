import { getContract, type Address, type Client } from "viem";

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
