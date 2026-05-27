/**
 * Minimal ABI for the Signa Pulse v1 factory's market registry —
 * only the bijection accessors CoverFi needs for 防伪 (D1).
 *
 *   `markets(id) → address` and `marketIds(address) → id` form a
 *   two-way mapping; reading one and reverse-checking the other is
 *   how we confirm a `market` address is a real Signa deployment and
 *   not an attacker-supplied lookalike.
 *
 *   id 0 is the sentinel "not registered". `marketIds` returns 0 for
 *   any unregistered address, so the check is:
 *
 *     id = factory.marketIds(market);
 *     require(id != 0 && factory.markets(id) == market);
 *
 * Empirically verified by `contracts/scripts/probe-signa.ts` at
 * 2026-05-27 against markets 1..4 — bijection holds, id=0 sentinel
 * works (markets ≥ 5 are 0x0). The full factory ABI has create /
 * upgrade / role-management methods that are Signa-team-only; we
 * deliberately exclude them.
 */
export const IPulseFactoryRegistryAbi = [
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "marketIds",
    stateMutability: "view",
    inputs: [{ name: "market", type: "address" }],
    outputs: [{ name: "id", type: "uint256" }],
  },
] as const;
