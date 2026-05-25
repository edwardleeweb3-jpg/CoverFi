import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/mock";

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
