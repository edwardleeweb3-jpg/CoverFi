import { create } from "zustand";
import { ACTIVITY, POLICIES } from "@/lib/mock";
import type { Activity, Order, Policy } from "@/lib/mock";

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
}));
