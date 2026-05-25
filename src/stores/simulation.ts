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
   * Mint a policy on a Signa order. Deducts the premium from balance,
   * prepends an activity entry, marks the order as insured, increments
   * the policy counter. Returns the new policy's id (`CF-00XXX`).
   *
   * Caller is responsible for verifying `balance >= premium` before
   * calling — this action does not re-check (it gets called from the
   * pay-button handler which already validated).
   */
  mintPolicy: (order: Order, premium: number, k: number) => string;

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

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  balance: INITIAL_BALANCE,
  policies: [...POLICIES],
  activities: [...ACTIVITY],
  insuredOrderIds: new Set<string>(),
  nextPolicyCounter: INITIAL_POLICY_COUNTER,

  mintPolicy: (order, premium, k) => {
    const counter = get().nextPolicyCounter;
    const id = `CF-00${counter}`;

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
      return {
        balance: s.balance - premium,
        policies: [newPolicy, ...s.policies],
        activities: [newActivity, ...s.activities],
        insuredOrderIds: nextInsured,
        nextPolicyCounter: counter + 1,
      };
    });

    return id;
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
