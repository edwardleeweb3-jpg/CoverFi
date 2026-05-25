/**
 * Business-logic helpers for premium pricing and linear principal release.
 *
 * Formulas mirror PRD §3.2 (premium) and §3.3 (release) exactly. Each
 * function carries an inline pointer to the PRD section it implements.
 *
 * ──────────────────────────────────────────────────────────────────────
 * PRECISION CAVEAT — PRD §3.2 warning
 *
 *   Production contract interactions MUST use `bigint` arithmetic at the
 *   token's smallest unit (wei). The implementations below use `number`
 *   (float USDC) to mirror the prototype's simulated UX. When wagmi /
 *   contract calls are wired in, swap each `number` amount to `bigint`
 *   wei and rewrite the float operations as integer math (e.g. encode
 *   Q and k in basis points). Display formatting stays where it is.
 * ──────────────────────────────────────────────────────────────────────
 */

import { F, Q_DEFAULT, RELEASE_DAYS } from "./config";
import type { Order, Policy } from "./mock";

/**
 * Implied probability `k` of the user's chosen option — PRD §3.2.
 *
 *   k = TVL of user's chosen option ÷ total TVL of all options
 *
 * Range [0, 1]. Higher k means the market thinks that option is more
 * likely to hit ⇒ lower base premium (because `(1 − k)` shrinks).
 *
 * Returns 0 (not NaN) if the market has no TVL yet, so downstream
 * pricing degrades gracefully.
 */
export function kOf(order: Pick<Order, "optTVL" | "mktTVL">): number {
  if (order.mktTVL <= 0) return 0;
  return order.optTVL / order.mktTVL;
}

/** Breakdown returned by `premiumOf()` — all USDC amounts. */
export interface PremiumBreakdown {
  /** `Q × (1 − k) × a`. */
  base: number;
  /** `F × a` (5% of principal). */
  floor: number;
  /** `max(base, floor)` — what the user actually pays. */
  payable: number;
  /** True when `floor > base` (so the review page can show the hint). */
  floored: boolean;
}

/**
 * Premium calculation — PRD §3.2.
 *
 *   base premium    = Q × (1 − k) × a
 *   premium floor   = F × a              (F = 5% per PRD)
 *   actual payable  = max(base, floor)
 *
 * The pricing dial `q` defaults to `Q_DEFAULT` from `config.ts`. Pass an
 * override once a live Q from the admin store is available (PRD §4A.6);
 * the static default and a runtime parameter let us swap in admin-driven
 * Q without changing call-site signatures.
 *
 * Policies snapshot the result at mint time (`Policy.premium`); this
 * helper is only used for live quote display (the review page), never
 * for recomputing values on existing policies.
 */
export function premiumOf(
  principal: number,
  k: number,
  q: number = Q_DEFAULT,
): PremiumBreakdown {
  const base = q * (1 - k) * principal;
  const floor = F * principal;
  const payable = Math.max(base, floor);
  return {
    base,
    floor,
    payable,
    floored: floor > base,
  };
}

/**
 * Released principal at this moment — PRD §3.3.
 *
 *   released = a × min(d / 365, 1)        where d = days since settlement
 *
 * Only meaningful for policies in `releasing` (still releasing) or
 * `completed` (fully released) states. For other statuses returns 0 —
 * there's no payout in motion to release.
 */
export function releasedOf(
  policy: Pick<Policy, "status" | "a" | "settledDaysAgo">,
): number {
  if (policy.status !== "releasing" && policy.status !== "completed") return 0;
  const d = policy.settledDaysAgo ?? 0;
  return policy.a * Math.min(d / RELEASE_DAYS, 1);
}

/**
 * Claimable amount right now — PRD §3.3.
 *
 *   claimable = released − already claimed
 *
 * Clamped to ≥ 0 so a stale `claimed` overrun doesn't surface negatives.
 * Multiple claims accumulate against `policy.claimed` so the difference
 * is always "what's available since last withdrawal."
 */
export function claimableOf(
  policy: Pick<Policy, "status" | "a" | "settledDaysAgo" | "claimed">,
): number {
  return Math.max(0, releasedOf(policy) - (policy.claimed ?? 0));
}

/**
 * Lifecycle bucket — coarse grouping used by the My Policies page.
 *
 *   active                → 'covered'  (Coverage active, pre-settlement)
 *   releasing             → 'paying'   (Paying out, claim possible)
 *   completed             → 'paid'     (Reimbursed in full, terminal)
 *   hit / void            → 'nopay'    (No payout, terminal)
 *
 * The UI orders sections paying → paid → covered → nopay (claim first).
 * This helper only assigns the bucket; ordering is a UI concern.
 */
export type PolicyBucket = "covered" | "paying" | "paid" | "nopay";

export function bucketOf(policy: Pick<Policy, "status">): PolicyBucket {
  switch (policy.status) {
    case "active":
      return "covered";
    case "releasing":
      return "paying";
    case "completed":
      return "paid";
    case "hit":
    case "void":
      return "nopay";
  }
}
