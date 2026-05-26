import { create } from "zustand";
import { ACTIVITY, POLICIES } from "@/lib/mock";
import type { Activity, Order, Policy, PolicyStatus } from "@/lib/mock";
import { claimableOf, releasedOf } from "@/lib/pricing";

/**
 * Simulated user state — balance + owned policies + activity feed.
 *
 * This is the "what the user owns" layer for the prototype-fidelity
 * simulation. Real contract integration in a later step will replace:
 *   - balance       → on-chain USDC balance (via useBalance)
 *   - policies      → indexed policy events from the contract
 *   - activities    → indexed transaction logs
 *   - mintPolicy    → CoverFiPolicy.buyPolicy(...) tx call
 *
 * Until then, state is purely in-memory and ephemeral (resets on reload).
 *
 * NOTE on currency: PRD §1.3 says BSC Testnet uses BNB, but the prototype
 * (and our UI) displays USDC for fidelity. Real on-chain units (wei) come
 * with contract integration — see `[[project_decisions]]` memory.
 */

interface SimulationStore {
  /** USDC balance the user has available to spend on premiums. */
  balance: number;

  /** Policies the user owns — seed + ones minted via /insurance/review. */
  policies: Policy[];

  /** Recent activity feed (mint / claim / void events). */
  activities: Activity[];

  /** Order IDs already insured by the user — InsuranceList filters these out. */
  insuredOrderIds: ReadonlySet<string>;

  /** Counter for the next minted policy's id (CF-00XXX). */
  nextPolicyCounter: number;

  /**
   * Commit a freshly-minted policy to the in-memory store. Deducts
   * the premium from balance, prepends an activity entry, marks the
   * order as insured, and advances `nextPolicyCounter` past the just-
   * confirmed id.
   *
   * The id is supplied externally (by the review-page flow, which
   * confirms uniqueness against the Supabase `policies` table before
   * calling). Caller is also responsible for verifying `balance >=
   * premium` before calling — this action does not re-check.
   */
  mintPolicy: (id: string, order: Order, premium: number, k: number) => void;

  /**
   * Mark a Signa order as insured by the current session. Lightweight
   * counterpart to `mintPolicy` for the Phase E flow where the source
   * of truth lives on-chain + in Supabase — the only piece the store
   * still owns is the per-session `insuredOrderIds` set that the
   * `/insurance` list filters by. Balance + activity feed don't need
   * the imaginary debit anymore because balance is read from the
   * chain via wagmi `useBalance`.
   */
  markInsured: (signaOrderId: string) => void;

  /**
   * Claim everything released-so-far on a single policy. Updates that
   * policy's `claimed` to its current `releasedOf()`, flips status to
   * `completed` if fully released (within a 0.01 epsilon to match the
   * prototype's floor-tolerance), credits the balance, prepends a claim
   * activity. Returns the amount claimed (0 if nothing was claimable).
   */
  claimPolicy: (policyId: string) => number;

  /**
   * Batch-claim across every policy with `claimableOf > 0`. Single set
   * of state changes (one balance increment, one activities prepend) so
   * the UI re-renders once. Returns `{ total, count }` for the toast.
   */
  claimAll: () => { total: number; count: number };
}

const INITIAL_BALANCE = 2450;
/** Matches prototype's `polCounter = 232` — next mint is CF-00232. */
const INITIAL_POLICY_COUNTER = 232;

/**
 * Parse the numeric counter from a "CF-00XXX" id, or null if the id
 * is foreign. Used to keep `nextPolicyCounter` past any externally-
 * confirmed id (the review-page flow may bump past a few collisions
 * before the DB accepts an insert).
 */
function parsePolicyCounter(id: string): number | null {
  const m = id.match(/^CF-00(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  balance: INITIAL_BALANCE,
  policies: [...POLICIES],
  activities: [...ACTIVITY],
  insuredOrderIds: new Set<string>(),
  nextPolicyCounter: INITIAL_POLICY_COUNTER,

  markInsured: (signaOrderId) => {
    set((s) => {
      if (s.insuredOrderIds.has(signaOrderId)) return {};
      const next = new Set(s.insuredOrderIds);
      next.add(signaOrderId);
      return { insuredOrderIds: next };
    });
  },

  mintPolicy: (id, order, premium, k) => {
    const newPolicy: Policy = {
      id,
      order: order.id,
      catEn: order.catEn,
      catZh: order.catZh,
      mEn: order.mEn,
      mZh: order.mZh,
      optEn: order.optEn,
      optZh: order.optZh,
      a: order.a,
      k,
      premium,
      status: "active",
      mintedDaysAgo: 0,
    };

    const newActivity: Activity = {
      type: "mint",
      id,
      amt: premium,
      mkt: { mEn: order.mEn, mZh: order.mZh },
      ago: 0,
    };

    set((s) => {
      const nextInsured = new Set(s.insuredOrderIds);
      nextInsured.add(order.id);
      // Counter advances past the just-confirmed id but never
      // backwards — keeps it monotonic if ids arrive out of sequence
      // (e.g. after a retry burst).
      const fromId = parsePolicyCounter(id);
      const nextCounter = Math.max(
        s.nextPolicyCounter,
        fromId !== null ? fromId + 1 : s.nextPolicyCounter + 1,
      );
      return {
        balance: s.balance - premium,
        policies: [newPolicy, ...s.policies],
        activities: [newActivity, ...s.activities],
        insuredOrderIds: nextInsured,
        nextPolicyCounter: nextCounter,
      };
    });
  },

  claimPolicy: (policyId) => {
    const policy = get().policies.find((p) => p.id === policyId);
    if (!policy) return 0;
    const claimable = claimableOf(policy);
    if (claimable <= 0) return 0;

    const released = releasedOf(policy);
    const fullyClaimed = released >= policy.a - 0.01;
    const newStatus: PolicyStatus = fullyClaimed ? "completed" : policy.status;

    const newActivity: Activity = {
      type: "claim",
      id: policyId,
      amt: claimable,
      mkt: { mEn: policy.mEn, mZh: policy.mZh },
      ago: 0,
    };

    set((s) => ({
      balance: s.balance + claimable,
      policies: s.policies.map((p) =>
        p.id === policyId ? { ...p, claimed: released, status: newStatus } : p,
      ),
      activities: [newActivity, ...s.activities],
    }));

    return claimable;
  },

  claimAll: () => {
    const claimablePolicies = get().policies.filter((p) => claimableOf(p) > 0);
    if (claimablePolicies.length === 0) return { total: 0, count: 0 };

    let total = 0;
    const newActivities: Activity[] = [];

    for (const p of claimablePolicies) {
      const c = claimableOf(p);
      total += c;
      newActivities.push({
        type: "claim",
        id: p.id,
        amt: c,
        mkt: { mEn: p.mEn, mZh: p.mZh },
        ago: 0,
      });
    }

    set((s) => ({
      balance: s.balance + total,
      policies: s.policies.map((p) => {
        if (claimableOf(p) <= 0) return p;
        const released = releasedOf(p);
        const fullyClaimed = released >= p.a - 0.01;
        const newStatus: PolicyStatus = fullyClaimed ? "completed" : p.status;
        return { ...p, claimed: released, status: newStatus };
      }),
      activities: [...newActivities, ...s.activities],
    }));

    return { total, count: claimablePolicies.length };
  },
}));
