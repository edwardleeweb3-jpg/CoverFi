import type { PostgrestError } from "@supabase/supabase-js";
import { formatUnits, type Hex } from "viem";
import { supabase } from "@/lib/supabase";
import type { Order, OptionEn, OptionZh, Policy, PolicyStatus } from "@/lib/mock";

/**
 * Data-access layer for the `policies` table.
 *
 * Writes: the review-and-pay flow inserts a new row after a successful
 * on-chain `buyPolicy` (Phase E3). The row carries both the human-
 * readable `id` and the on-chain `chain_policy_id` (uint256 → numeric
 * string), plus the tx hash so we can deep-link to BscScan and let a
 * future event indexer reconcile.
 *
 * Reads: `listPoliciesByOwner` + `getPolicyById` already in place for
 * the /policies + detail pages.
 *
 * Field mapping (frontend `Policy` ↔ DB column) lives in
 * `insertPolicy()` + `rowToPolicy()` below. USDC amounts cross the
 * boundary as bigint wei on the contract side and decimal USDC strings
 * on the DB side — we use `formatUnits(wei, 6)` at the boundary so
 * the existing `numeric(20, 6)` columns store exact decimal USDC
 * (round-tripped via `Number(row.principal)` on read).
 */

/** USDC has 6 decimals across every chain it lives on. */
const USDC_DECIMALS = 6;

export interface InsertPolicyInput {
  /** Human-readable policy id, e.g. "CF-0000232". Derived via
   *  `formatPolicyId(chainPolicyId)` — caller is responsible for the
   *  derivation so both fields are consistently 1:1. */
  id: string;
  /** uint256 policy id from `PolicyMinted.policyId`. Stored as numeric. */
  chainPolicyId: bigint;
  /** `buyPolicy()` tx hash. Stored as text for BscScan deep-links. */
  txHash: Hex;
  /** Investor's wallet address (any case — normalised to lowercase here). */
  ownerAddress: string;
  /** Source Signa order — provides market/option text + signa_order_id + a. */
  order: Order;
  /** Premium paid in token base units (wei). Converted to a decimal-USDC
   *  string for the `numeric(20, 6)` column. */
  premium: bigint;
  /** Implied probability snapshot at mint, in bps (0..10_000). Stored
   *  as a 0..1 decimal in `k_snapshot` so existing read paths keep
   *  working unchanged. */
  kBps: number;
}

/**
 * Tagged result. `id-taken` survives from B3's retry strategy even
 * though it can't happen now (chain-derived id collides only if the
 * contract's `nextPolicyId` rewinds, which it can't) — keeping it
 * lets callers stay defensive at a near-zero cost.
 */
export type InsertPolicyResult =
  | { ok: true }
  | { ok: false; reason: "id-taken" }
  | { ok: false; reason: "order-already-insured" }
  | { ok: false; reason: "other"; message: string };

/**
 * Insert a freshly-minted policy. `claimed` defaults to 0; `created_at`
 * to `now()`; `settled_at` / `voided_at` stay NULL until the lifecycle
 * advances.
 *
 * The owner_address is lowercased before insert — the DB has a
 * `check (owner_address = lower(...))` constraint and will reject
 * mixed-case strings outright.
 *
 * bigint → DB conversion notes:
 *   - `premium`  : `formatUnits(wei, 6)` → "295.000000" string, exact
 *                  decimal for the `numeric(20, 6)` column.
 *   - `principal`: same treatment from `order.a` (still a number from
 *                  the seed; converted via `parseUnits` round-trip
 *                  through `formatUnits` for consistency).
 *   - `chain_policy_id`: `bigint.toString()` (numeric column).
 */
export async function insertPolicy(
  input: InsertPolicyInput,
): Promise<InsertPolicyResult> {
  const principalUsdc = input.order.a.toFixed(USDC_DECIMALS);
  const premiumUsdc = formatUnits(input.premium, USDC_DECIMALS);
  // bps → 0..1 decimal preserves existing read-side semantics
  // (Number(row.k_snapshot) returns the 0..1 probability as before).
  const kDecimal = (input.kBps / 10_000).toFixed(6);

  const { error } = await supabase.from("policies").insert({
    id: input.id,
    chain_policy_id: input.chainPolicyId.toString(),
    tx_hash: input.txHash,
    owner_address: input.ownerAddress.toLowerCase(),
    signa_order_id: input.order.id,
    category_en: input.order.catEn,
    category_zh: input.order.catZh,
    market_en: input.order.mEn,
    market_zh: input.order.mZh,
    option_en: input.order.optEn,
    option_zh: input.order.optZh,
    principal: principalUsdc,
    k_snapshot: kDecimal,
    premium: premiumUsdc,
    status: "active",
  });

  if (!error) return { ok: true };
  return classifyError(error);
}

/**
 * Map a PostgrestError to our tagged result.
 *
 * `23505` is PostgreSQL `unique_violation`. Three unique constraints
 * live on this table now:
 *   - "policies_pkey"                     → PK clash on `id`.
 *   - "policies_chain_policy_id_key"      → clash on `chain_policy_id`.
 *   - "policies_signa_order_id_key"       → clash on `signa_order_id`.
 *
 * `id` and `chain_policy_id` are derived from the same chain value,
 * so a clash on either means "this exact policy already has a row" —
 * an idempotency-style replay of the post-mint save. Both collapse
 * to `id-taken`. A `signa_order_id` clash means a *different* mint
 * already used the same Signa order, which is terminal.
 */
function classifyError(error: PostgrestError): InsertPolicyResult {
  if (error.code === "23505") {
    if (
      error.message.includes("policies_pkey") ||
      error.message.includes("chain_policy_id")
    ) {
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
 * Persist a single-policy claim. Scoped to
 * (chain_policy_id, owner_address) so the request can never touch
 * another wallet's row — even if a caller passes a foreign id, the
 * UPDATE will simply match 0 rows and we surface `not-found`.
 *
 * `chain_policy_id` is the authoritative lookup key (E3+ guarantees
 * it's NOT NULL on every row); `owner_address` is a defense-in-depth
 * scope. The human-readable `id` is derived from `chainPolicyId`
 * elsewhere and isn't part of the WHERE.
 *
 * The two writable fields:
 *   - `claimed`: post-claim cumulative claimed (read fresh from chain
 *                via `policies(id).claimed` after the claim tx confirms).
 *                Comes in as wei; converted to "X.XXXXXX" string for
 *                the numeric(20,6) column.
 *   - `status`:  current chain status (read fresh via
 *                `policies(id).status` after the claim tx). The
 *                caller maps the uint8 enum to the PolicyStatus
 *                string before passing in.
 */
export async function updatePolicyClaim(input: {
  chainPolicyId: bigint;
  ownerAddress: string;
  claimedWei: bigint;
  status: PolicyStatus;
}): Promise<UpdatePolicyClaimResult> {
  const claimedUsdc = formatUnits(input.claimedWei, USDC_DECIMALS);
  const { data, error } = await supabase
    .from("policies")
    .update({ claimed: claimedUsdc, status: input.status })
    .eq("chain_policy_id", input.chainPolicyId.toString())
    .eq("owner_address", input.ownerAddress.toLowerCase())
    .select("chain_policy_id");
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
  /** Migration 0001 — NOT NULL after E3. May arrive as `string` (the
   *  numeric column path) or `number` (if supabase-js managed to
   *  coerce a small enough value); BigInt() handles both. */
  chain_policy_id: string | number;
  /** Migration 0001 — NOT NULL after E3. */
  tx_hash: string;
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
    chainPolicyId: BigInt(row.chain_policy_id),
    txHash: row.tx_hash,
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
