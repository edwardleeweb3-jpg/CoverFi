/**
 * Bigint-integer pricing helpers — 1:1 mirror of CoverFiPolicy's
 * on-chain math.
 *
 * Strict contract:
 *   - All inputs / outputs are `bigint` in the relevant base unit
 *     (USDC wei at 6 decimals for amounts, seconds for time, bps for
 *     rates).
 *   - All arithmetic exactly mirrors `contracts/src/CoverFiPolicy.sol`
 *     line-for-line: same operations, same order, same `*` before `/`,
 *     same floor-division semantics. NOT a "close-enough float
 *     translation".
 *
 * The legacy `src/lib/pricing.ts` (number / float) stays in place for
 * the live premium-quote display in /insurance — switching that path
 * is the next phase. This file is the source of truth for any code
 * that will actually call the contract.
 *
 * PRD anchors:
 *   §3.2 premium = max(Q × (1 − k) × a, F × a)
 *   §3.3 released = a × min(elapsed / 365days, 1); claimable = released − claimed
 */

import type { PolicyStatus } from "./mock";

// ─── Constants (mirror CoverFiPolicy.sol) ────────────────────────

/** PRD §3.2 bps denominator. */
export const BPS_DENOMINATOR = 10_000n;

/** PRD §3.2 premium floor as bps of principal (5% = 500 bps). */
export const F_BPS = 500n;

/** PRD §3.3 linear-release period in seconds (365 days). */
export const RELEASE_PERIOD_SECONDS = 365n * 24n * 60n * 60n; // 31_536_000n

// ─── Premium ──────────────────────────────────────────────────────

export interface PremiumQuote {
  /** `qBps × (1 − kBps) × principal`, floor-divided. */
  base: bigint;
  /** `F_BPS × principal`, floor-divided. */
  floor: bigint;
  /** `max(base, floor)` — what `buyPolicy` will charge. */
  premium: bigint;
}

/**
 * Mirror of `CoverFiPolicy.quotePremium(principal, kBps)`. `qBps`
 * is passed explicitly here because the contract reads it from
 * mutable storage; on the frontend it comes from a `qBps()` read.
 *
 * @throws RangeError on `principal === 0n` or `kBps > 10000n` — same
 *         conditions the contract reverts on (`InvalidPrincipal` /
 *         `InvalidKBps`). Surfacing them as exceptions here lets the
 *         caller fail fast in the same shape.
 */
export function premiumOf(input: {
  principal: bigint;
  kBps: bigint;
  qBps: bigint;
}): PremiumQuote {
  const { principal, kBps, qBps } = input;
  if (principal === 0n) {
    throw new RangeError("premiumOf: principal must be > 0 (mirrors InvalidPrincipal)");
  }
  if (kBps < 0n || kBps > BPS_DENOMINATOR) {
    throw new RangeError(
      `premiumOf: kBps must be in [0, ${BPS_DENOMINATOR}] (mirrors InvalidKBps), got ${kBps}`,
    );
  }
  if (qBps <= 0n || qBps > BPS_DENOMINATOR) {
    throw new RangeError(
      `premiumOf: qBps must be in (0, ${BPS_DENOMINATOR}] (mirrors InvalidQBps), got ${qBps}`,
    );
  }

  // Multiply-before-divide, matching Solidity's:
  //   base = (qBps * (BPS_DENOMINATOR - kBps) * principal)
  //          / (BPS_DENOMINATOR * BPS_DENOMINATOR)
  const base =
    (qBps * (BPS_DENOMINATOR - kBps) * principal) /
    (BPS_DENOMINATOR * BPS_DENOMINATOR);
  const floor = (F_BPS * principal) / BPS_DENOMINATOR;
  const premium = base > floor ? base : floor;

  return { base, floor, premium };
}

// ─── Linear release ──────────────────────────────────────────────

/**
 * Mirror of `CoverFiPolicy.releasedOf(policyId)`. Returns 0 for any
 * status that isn't Releasing or Completed — matches the contract's
 * status guard at the top of the function.
 *
 * `nowSeconds` is the current block timestamp (or `Math.floor(Date.now()/1000)`
 * for a UI quote); explicit so the function stays pure and testable.
 */
export function releasedOf(input: {
  status: PolicyStatus;
  principal: bigint;
  /** Unix timestamp (seconds) when triggerSettlement(Miss) fired. */
  settledAt: bigint;
  /** Current chain time (seconds). */
  nowSeconds: bigint;
}): bigint {
  const { status, principal, settledAt, nowSeconds } = input;
  if (status !== "releasing" && status !== "completed") return 0n;

  // The contract subtracts `settledAt` from `block.timestamp`
  // unconditionally; on uint256 underflow would revert. We guard
  // because the frontend might briefly hold a settledAt slightly in
  // the future (clock skew during a fresh settle); treat as elapsed 0.
  if (nowSeconds <= settledAt) return 0n;

  const elapsed = nowSeconds - settledAt;
  if (elapsed >= RELEASE_PERIOD_SECONDS) return principal;
  return (principal * elapsed) / RELEASE_PERIOD_SECONDS;
}

/**
 * Mirror of `CoverFiPolicy.claimableOf(policyId)`. Defensive `<=`
 * keeps the result ≥ 0 if `claimed` ever exceeds `released`
 * (impossible on-chain today, but cheap to keep the same guard).
 */
export function claimableOf(input: {
  status: PolicyStatus;
  principal: bigint;
  settledAt: bigint;
  claimed: bigint;
  nowSeconds: bigint;
}): bigint {
  const released = releasedOf(input);
  if (released <= input.claimed) return 0n;
  return released - input.claimed;
}
