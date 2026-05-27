import { parseAbiItem } from "viem";

/**
 * Cross-cutting types and constants for Signa Pulse — the enum
 * `IPulseMarket.status()` returns, the sentinel its `finalOption()`
 * uses for void markets, and event signatures CoverFi cares about.
 *
 * Sources:
 *   - FAQ `_docs/2026-05-26-signa-pulse-integration-faq.md` §C (state
 *     machine) and §C "Settlement / Final 事件签名"
 *   - `PulseTypes.sol` in the Signa v1 repo (per FAQ §A) for the
 *     enum + VOID_SENTINEL definitions.
 *
 * 5A.1 verified the enum mapping on-chain (markets 2/3/4 returned
 * status 1/7/7 — Running, Finalized, Finalized — exactly as labelled
 * below). Event signatures are not yet on-chain-verified because the
 * 5A.1 probe couldn't reach BetPlaced through public RPC; see 5A.3
 * Slack ask. Treat them as ABI-correct-by-construction (from FAQ)
 * until a tx round-trip confirms.
 */

/**
 * `IPulseMarket.status()` returns one of these uint8s. Numeric values
 * match the on-chain `Status` enum exactly (positional).
 */
export const SignaStatus = {
  Pending: 0,
  Running: 1,
  Settling: 2,
  Settled: 3,
  Disputing: 4,
  Disputed: 5,
  Arbitrating: 6,
  Finalized: 7,
} as const;
export type SignaStatusValue = (typeof SignaStatus)[keyof typeof SignaStatus];

/** Human-readable name lookup: `SIGNA_STATUS_NAMES[status]`. */
export const SIGNA_STATUS_NAMES = [
  "Pending",
  "Running",
  "Settling",
  "Settled",
  "Disputing",
  "Disputed",
  "Arbitrating",
  "Finalized",
] as const satisfies readonly string[];

/**
 * `IPulseMarket.finalOption()` returns this when the market is voided
 * (`type(int8).min = -128`). Bettors recover principal on the Signa
 * side via `claimRefund()`; CoverFi maps to its own `void` policy
 * status with a premium refund.
 */
export const VOID_SENTINEL = -128;

// ─── Event signatures (per FAQ §C) ───────────────────────────────
// CoverFi will index `BetPlaced` (for the "list user positions"
// flow if/when the Signa-side data source falls back to us — see
// 5A.3 ask + D8) and `MarketFinalized` (for the user-facing
// "settle me" prompt). The rest are included for completeness so
// the indexer can disambiguate lifecycle transitions later.

export const BetPlacedEvent = parseAbiItem(
  "event BetPlaced(address indexed bettor, uint8 indexed option, uint256 grossAmount, uint256 netAmount, address referrer)",
);
export const StatusChangedEvent = parseAbiItem(
  "event StatusChanged(uint8 indexed oldStatus, uint8 indexed newStatus)",
);
export const MarketFinalizedEvent = parseAbiItem(
  "event MarketFinalized(int8 finalOption, string resolution)",
);
export const ClaimedEvent = parseAbiItem(
  "event Claimed(address indexed user, uint256 amount, bool isRefund)",
);
