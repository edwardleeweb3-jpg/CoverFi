/**
 * Global protocol parameters — sourced from PRD §3.2 / §3.3.
 *
 * Two layers:
 *   1. Static constants here (`Q_DEFAULT`, `F`, `RELEASE_DAYS`) — what
 *      pricing.ts reads today.
 *   2. `getPricingQ()` — async accessor reserved for the admin backend
 *      (PRD §4A). When `/api/admin/config` ships, the body of this
 *      function swaps to a fetch; callers that already awaited it
 *      don't need to change.
 *
 * The split exists because PRD §4A.6 explicitly warns against hard-
 * coding `Q` in the contracts/pricing path — admin must be able to
 * tune it at runtime once the backend is live.
 */

/**
 * Pricing dial Q — PRD §3.2.
 * Range (0, 1]. Higher Q = higher premiums overall. Admin-tunable.
 * Pricing helpers default to this constant; pass an override at
 * call-time once a live Q from the admin store is available.
 */
export const Q_DEFAULT = 0.5;

/**
 * Premium floor as a fraction of principal — PRD §3.2.
 * Always applied as a minimum so users never pay less than 5% of `a`.
 */
export const F = 0.05;

/**
 * Linear release period in days — PRD §3.3.
 * Used by `releasedOf()` to compute `a × min(d / 365, 1)`.
 */
export const RELEASE_DAYS = 365;

/**
 * Shape of a row in the `config` table — PRD §5.5.
 * Returned by `GET /api/admin/config` once the admin backend (§4A) ships.
 */
export interface ConfigEntry {
  /** Parameter name, e.g. `pricing_Q`. */
  key: string;
  /** Stringified value (parsed by callers — admin stores as text). */
  value: string;
  /** Address / handle of the operator who last touched it. */
  updated_by: string;
  /** ISO-8601 timestamp. */
  updated_at: string;
}

/**
 * Currently-effective pricing Q. Step 6 returns the static default;
 * step 4A (admin backend) swaps the body for:
 *
 *   const res = await fetch('/api/admin/config?key=pricing_Q');
 *   const row = (await res.json()) as ConfigEntry;
 *   return parseFloat(row.value);
 *
 * Async on purpose so the future fetch is a body-only change.
 */
export async function getPricingQ(): Promise<number> {
  return Q_DEFAULT;
}
