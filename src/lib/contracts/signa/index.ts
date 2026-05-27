import type { Address, Client } from "viem";
import { readContract } from "viem/actions";

import { IPulseMarketAbi } from "./IPulseMarket";
import { IPulseFactoryRegistryAbi } from "./IPulseFactoryRegistry";
import {
  SignaStatus,
  VOID_SENTINEL,
  type SignaStatusValue,
} from "./PulseTypes";

/**
 * Entry point for the Signa-side reads CoverFi performs from the
 * frontend. Two helpers cover the load-bearing cases:
 *
 *   - `verifyMarket` — factory-registry 防伪 (D1); the off-chain
 *     mirror of the check `buyPolicy` will do on chain. UI gate so we
 *     never even surface non-Signa markets to users.
 *
 *   - `readSignaMarket` — lifecycle snapshot for the policy detail
 *     page (`status` / `finalOption` decide whether the "Settle"
 *     button is live and what outcome it'll resolve to).
 *
 * On-chain reads for `userBets` and trickier flows go directly through
 * `IPulseMarketAbi` from a wagmi `useReadContract` or viem
 * `readContract` — keeping helpers narrow avoids re-implementing the
 * already-typed viem call surface for one-off uses.
 */

export * from "./addresses";
export * from "./PulseTypes";
export { IPulseMarketAbi } from "./IPulseMarket";
export { IPulseFactoryRegistryAbi } from "./IPulseFactoryRegistry";

/**
 * What the policy detail page / settle button needs: where the
 * market is in its lifecycle, and (if final) which way it landed.
 *
 * `isFinal` is the boolean form of `status === Finalized` for cheap
 * `if (snapshot.isFinal) { ... }` branching. `isVoid` is the
 * `finalOption === VOID_SENTINEL` precondition gated on `isFinal`
 * (a non-final market's `finalOption` is meaningless).
 */
export type SignaMarketSnapshot = {
  status: SignaStatusValue;
  finalOption: number;
  isFinal: boolean;
  isVoid: boolean;
};

export async function readSignaMarket(
  client: Client,
  market: Address,
): Promise<SignaMarketSnapshot> {
  const [statusRaw, finalOption] = await Promise.all([
    readContract(client, {
      address: market,
      abi: IPulseMarketAbi,
      functionName: "status",
    }),
    readContract(client, {
      address: market,
      abi: IPulseMarketAbi,
      functionName: "finalOption",
    }),
  ]);
  const status = statusRaw as SignaStatusValue;
  const isFinal = status === SignaStatus.Finalized;
  return {
    status,
    finalOption,
    isFinal,
    isVoid: isFinal && finalOption === VOID_SENTINEL,
  };
}

/**
 * True iff `market` is registered in `factory` AND the reverse lookup
 * confirms the same address — the bijection check from D1 防伪.
 *
 * Sentinel: `marketIds` returns 0 for unregistered addresses;
 * `markets(0)` is `0x0` on the beta factory (probe-signa.ts confirms
 * markets ≥ 5 are also 0x0). Combined, this rejects:
 *   - non-Signa addresses (`marketIds` = 0 → early false)
 *   - addresses that match an existing id but where the reverse
 *     lookup points elsewhere (no known attack on `mapping` storage
 *     but the check costs ~3k gas / 2 RPC reads and is the symmetric
 *     mirror of the future on-chain `buyPolicy` guard)
 */
export async function verifyMarket(
  client: Client,
  factory: Address,
  market: Address,
): Promise<boolean> {
  const id = await readContract(client, {
    address: factory,
    abi: IPulseFactoryRegistryAbi,
    functionName: "marketIds",
    args: [market],
  });
  if (id === 0n) return false;
  const reverse = await readContract(client, {
    address: factory,
    abi: IPulseFactoryRegistryAbi,
    functionName: "markets",
    args: [id],
  });
  return reverse.toLowerCase() === market.toLowerCase();
}
