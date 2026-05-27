/**
 * Minimal ABI for Signa Pulse v1's `PulseMarket` — only the view
 * functions CoverFi consumes directly:
 *
 *   - `status()` → lifecycle gate for `buyPolicy` (only Running is
 *     insurable per D1(a)) and `settleByOnChainRead` (only Finalized
 *     can settle a policy).
 *   - `finalOption()` → drives the Hit / Miss / Void mapping in
 *     `settleByOnChainRead`.
 *   - `userBets(addr, opt)` → the buyer's actual chain-truth principal
 *     (per D1(c)); `buyPolicy` reads this instead of trusting a
 *     caller-supplied number, and the frontend uses it to display
 *     "what's your insurable position".
 *   - `hasBet(addr)` → cheap precheck for the discovery flow ("does
 *     this address have anything at all in this market").
 *
 * Selectors confirmed against the BSC Testnet beta factory's four
 * registered markets by `contracts/scripts/probe-signa.ts` at
 * 2026-05-27. The full Pulse v1 ABI has many more functions (admin,
 * settlement, claim, dispute) — they belong to Signa-side users, not
 * to CoverFi, so they're deliberately excluded here.
 */
export const IPulseMarketAbi = [
  {
    type: "function",
    name: "status",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "finalOption",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "int8" }],
  },
  {
    type: "function",
    name: "userBets",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "option", type: "uint8" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "hasBet",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;
