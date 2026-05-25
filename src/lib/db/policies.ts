import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Order, OptionEn, OptionZh, Policy, PolicyStatus } from "@/lib/mock";

/**
 * Data-access layer for the `policies` table.
 *
 * This step (segment 3 / step 3) covers WRITES only: when the
 * review-and-pay flow completes, the new policy is recorded here.
 * Reads (the /policies overview, the policy detail page) still go
 * through `useSimulationStore` — switching them to Supabase is the
 * next step.
 *
 * Field mapping (frontend `Policy` ↔ DB column) lives in
 * `insertPolicy()` below. Numeric columns are written as plain JS
 * numbers (supabase-js serialises losslessly on the way in); the
 * read-side `numeric`-as-string gotcha noted in `supabase/schema.sql`
 * only matters once we start reading, so the mapper for that lands
 * in the next step.
 */

export interface InsertPolicyInput {
  /** Candidate policy ID, e.g. "CF-00232". Must be unique in the table. */
  id: string;
  /** Investor's wallet address (any case — normalized to lowercase here). */
  ownerAddress: string;
  /** Source Signa order — provides market/option text + signa_order_id + a. */
  order: Order;
  /** Premium paid (USDC), captured at mint. */
  premium: number;
  /** Implied probability snapshot k = optTVL/mktTVL at mint (PRD §3.2). */
  k: number;
}

/**
 * Tagged result so the caller can distinguish the three meaningful
 * outcomes:
 *   - `id-taken`              → the candidate `id` collided on the PK;
 *                               retry with the next CF-XXXXX.
 *   - `order-already-insured` → another session has already minted on
 *                               this Signa order (PRD §3.1 "one order
 *                               → at most one policy", enforced by
 *                               the `signa_order_id` unique
 *                               constraint). TERMINAL — do not retry.
 *   - `other`                 → network / unexpected failure; surface
 *                               the message to the user.
 */
export type InsertPolicyResult =
  | { ok: true }
  | { ok: false; reason: "id-taken" }
  | { ok: false; reason: "order-already-insured" }
  | { ok: false; reason: "other"; message: string };

/**
 * Insert a freshly-minted policy. `claimed` falls back to its column
 * default (0); `created_at` to `now()`; `settled_at` / `voided_at`
 * stay NULL until the lifecycle advances.
 *
 * The owner_address is lowercased before insert — the DB has a
 * `check (owner_address = lower(...))` constraint and will reject
 * mixed-case strings outright.
 */
export async function insertPolicy(
  input: InsertPolicyInput,
): Promise<InsertPolicyResult> {
  const { error } = await supabase.from("policies").insert({
    id: input.id,
    owner_address: input.ownerAddress.toLowerCase(),
    signa_order_id: input.order.id,
    category_en: input.order.catEn,
    category_zh: input.order.catZh,
    market_en: input.order.mEn,
    market_zh: input.order.mZh,
    option_en: input.order.optEn,
    option_zh: input.order.optZh,
    principal: input.order.a,
    k_snapshot: input.k,
    premium: input.premium,
    status: "active",
  });

  if (!error) return { ok: true };
  return classifyError(error);
}

/**
 * Map a PostgrestError to our tagged result.
 *
 * `23505` is PostgreSQL `unique_violation`. We disambiguate the two
 * unique constraints on this table by the constraint name carried in
 * the error message:
 *   - "policies_pkey"               → PK clash on `id` (retry-able)
 *   - "policies_signa_order_id_key" → unique clash on `signa_order_id`
 *                                     (terminal — already insured)
 *
 * Everything else collapses to `other` so the UI can surface a
 * generic "try again" prompt.
 */
function classifyError(error: PostgrestError): InsertPolicyResult {
  if (error.code === "23505") {
    if (error.message.includes("policies_pkey")) {
      return { ok: false, reason: "id-taken" };
    }
    return { ok: false, reason: "order-already-insured" };
  }
  return { ok: false, reason: "other", message: error.message };
}

// ====================================================================
// Read paths
// ====================================================================

/** Tagged result for the list query. */
export type ListPoliciesResult =
  | { ok: true; policies: Policy[] }
  | { ok: false; message: string };

/** Tagged result for the single-policy fetch. `policy: null` means
 *  the id doesn't exist OR doesn't belong to the requesting wallet
 *  (the page treats these the same — both are "not found for you"). */
export type GetPolicyResult =
  | { ok: true; policy: Policy | null }
  | { ok: false; message: string };

/**
 * List policies owned by a wallet, newest first. Address is
 * lowercased to match the DB's canonical-lowercase storage (PK index
 * is plain b-tree on the column).
 */
export async function listPoliciesByOwner(
  ownerAddress: string,
): Promise<ListPoliciesResult> {
  const { data, error } = await supabase
    .from("policies")
    .select("*")
    .eq("owner_address", ownerAddress.toLowerCase())
    .order("created_at", { ascending: false });
  if (error) return { ok: false, message: error.message };
  return { ok: true, policies: (data ?? []).map(rowToPolicy) };
}

/**
 * Fetch a single policy by id, scoped to the requesting wallet.
 * Returns `policy: null` if either the id is unknown or the row
 * exists but belongs to a different address — the detail page treats
 * both as "not found", which matches user expectation (you can only
 * see your own policies).
 */
export async function getPolicyById(
  id: string,
  ownerAddress: string,
): Promise<GetPolicyResult> {
  const { data, error } = await supabase
    .from("policies")
    .select("*")
    .eq("id", id)
    .eq("owner_address", ownerAddress.toLowerCase())
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  return { ok: true, policy: data ? rowToPolicy(data) : null };
}

// ====================================================================
// Claim write
// ====================================================================

/** Tagged result for `updatePolicyClaim()`. */
export type UpdatePolicyClaimResult =
  | { ok: true }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "other"; message: string };

/**
 * Persist a single-policy claim. Scoped to (id, owner_address) so
 * the request can never touch another wallet's row — even if a
 * caller passes a foreign id, the UPDATE will simply match 0 rows
 * and we surface `not-found`.
 *
 * Writes only the fields the in-memory claim mutation actually
 * changes today (see `applyClaimMutation` in PoliciesPage.tsx):
 *
 *   - `claimed`: bumped to `releasedOf(policy)` at claim time.
 *   - `status`:  flips to `'completed'` once released ≈ principal
 *                (within the 0.01-USDC epsilon used in the
 *                simulation); otherwise unchanged.
 *
 * Balance + activity are deliberately NOT touched here — they don't
 * have DB tables yet (PRD §5 only defines `markets` / `policies` /
 * `activities` / `config`; `activities` is out of scope for this
 * segment and balance is on-chain in the contract phase).
 *
 * `.select("id")` lets us distinguish "row did not exist (or wasn't
 * yours)" from a true error — without it, supabase-js reports the
 * 0-row case as success.
 */
export async function updatePolicyClaim(input: {
  id: string;
  ownerAddress: string;
  claimed: number;
  status: PolicyStatus;
}): Promise<UpdatePolicyClaimResult> {
  const { data, error } = await supabase
    .from("policies")
    .update({ claimed: input.claimed, status: input.status })
    .eq("id", input.id)
    .eq("owner_address", input.ownerAddress.toLowerCase())
    .select("id");
  if (error) return { ok: false, reason: "other", message: error.message };
  if (!data || data.length === 0) return { ok: false, reason: "not-found" };
  return { ok: true };
}

// ====================================================================
// DB-row → frontend `Policy` mapper
// ====================================================================

/** Raw row shape as it comes back from supabase-js. `numeric` columns
 *  arrive as STRING — see `supabase/schema.sql` header for why. */
interface PolicyRow {
  id: string;
  owner_address: string;
  signa_order_id: string;
  category_en: string;
  category_zh: string;
  market_en: string;
  market_zh: string;
  option_en: string;
  option_zh: string;
  principal: string;
  k_snapshot: string;
  premium: string;
  claimed: string;
  status: string;
  created_at: string;          // ISO timestamp
  settled_at: string | null;
  voided_at: string | null;
}

/**
 * Map a DB row to the in-memory `Policy` shape consumed by pricing
 * helpers (releasedOf / claimableOf / bucketOf) and detail/list UI.
 *
 * Two conversions matter:
 *   1. `numeric` columns (string in JSON) → `Number(...)` for plain
 *      JS-number arithmetic. Safe at USDC magnitudes; will be re-
 *      thought when wei lands (CLAUDE.md §8).
 *   2. `timestamptz` columns (ISO string) → relative-day fields
 *      (`mintedDaysAgo` / `settledDaysAgo` / `voidedDaysAgo`). The
 *      Policy type uses days-since rather than absolute dates because
 *      that's what the pricing + timeline helpers consume.
 *
 * `claimed` is only attached when non-zero (mirrors the mock seed's
 * convention of omitting the field for not-yet-claimed policies).
 */
function rowToPolicy(row: PolicyRow): Policy {
  const now = Date.now();
  const policy: Policy = {
    id: row.id,
    order: row.signa_order_id,
    catEn: row.category_en,
    catZh: row.category_zh,
    mEn: row.market_en,
    mZh: row.market_zh,
    optEn: row.option_en as OptionEn,
    optZh: row.option_zh as OptionZh,
    a: Number(row.principal),
    k: Number(row.k_snapshot),
    premium: Number(row.premium),
    status: row.status as PolicyStatus,
    mintedDaysAgo: daysBetween(row.created_at, now),
  };
  if (row.settled_at) {
    policy.settledDaysAgo = daysBetween(row.settled_at, now);
  }
  if (row.voided_at) {
    policy.voidedDaysAgo = daysBetween(row.voided_at, now);
  }
  const claimedNum = Number(row.claimed);
  if (claimedNum > 0) {
    policy.claimed = claimedNum;
  }
  return policy;
}

/** Whole-day floor of (now − iso). Clamped to ≥ 0 so a slightly-
 *  future server clock doesn't surface negatives. */
function daysBetween(iso: string, nowMs: number): number {
  const t = new Date(iso).getTime();
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}
