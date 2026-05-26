/**
 * Mock CoverFi policies. Seeded verbatim from the prototype
 * (_docs/prototype.html, the `POLICIES` array).
 *
 * Real source — `policies` table indexed from on-chain events (PRD §5.2).
 */

import type { OptionEn, OptionZh } from "./orders";

/** Lifecycle status — PRD §2.2 (unified term, must not be reworded). */
export type PolicyStatus =
  | "active" // Coverage active — pre-settlement
  | "releasing" // Paying out — linear release in progress
  | "completed" // Reimbursed in full — terminal
  | "hit" // Option won — terminal, premium retained
  | "void"; // Market voided — terminal, premium refunded

export interface Policy {
  /** Policy number, e.g. `CF-00231`. */
  id: string;

  /** Linked Signa order ID. */
  order: string;

  /** Category + market title (bilingual). */
  catEn: string;
  catZh: string;
  mEn: string;
  mZh: string;

  /** The insured option. */
  optEn: OptionEn;
  optZh: OptionZh;

  /** Principal `a` (USDC). */
  a: number;

  /** Implied probability snapshot at mint time — frozen per PRD §3.2. */
  k: number;

  /** Premium paid at mint (USDC). Locked snapshot. */
  premium: number;

  status: PolicyStatus;

  /** Days since the policy was minted — present for `active` policies. */
  mintedDaysAgo?: number;

  /**
   * Days since the underlying market settled — present for `releasing`
   * (still releasing principal), `completed` (release period ended), and
   * `hit` (closed without payout) states. Used by `releasedOf()` to
   * compute current linear-release progress.
   */
  settledDaysAgo?: number;

  /** Days since the market was voided — present for `void` policies. */
  voidedDaysAgo?: number;

  /** Cumulative amount already claimed (USDC). Defaults to 0 if absent. */
  claimed?: number;

  /**
   * uint256 policy id from `CoverFiPolicy.PolicyMinted.policyId`,
   * populated by the DB-row mapper when reading from Supabase
   * (Segment 4 / Phase E). The on-chain authority for everything
   * dynamic (status, claimed, releasedOf, claimableOf); the
   * `id` above is the human-readable mirror.
   */
  chainPolicyId?: bigint;

  /** `buyPolicy()` tx hash. Used for BscScan deep-links from the
   *  detail page. Same provenance as `chainPolicyId`. */
  txHash?: string;
}

export const POLICIES: readonly Policy[] = [
  {
    id: "CF-00231",
    order: "SGA-7611",
    catEn: "Crypto",
    catZh: "加密",
    mEn: "BTC network hashrate sets a new all-time high in Q3",
    mZh: "BTC 全网算力在三季度创历史新高",
    optEn: "Yes",
    optZh: "是",
    a: 638.50,
    k: 0.41,
    premium: 188.36,
    status: "active",
    mintedDaysAgo: 6,
  },
  {
    id: "CF-00221",
    order: "SGA-7588",
    catEn: "Macro",
    catZh: "宏观",
    mEn: "Headline CPI prints below 3.0% for the month",
    mZh: "当月 CPI 同比低于 3.0%",
    optEn: "Yes",
    optZh: "是",
    a: 792.30,
    k: 0.38,
    premium: 245.61,
    status: "active",
    mintedDaysAgo: 2,
  },
  {
    id: "CF-00198",
    order: "SGA-7540",
    catEn: "Macro",
    catZh: "宏观",
    mEn: "Q2 GDP growth comes in above the consensus forecast",
    mZh: "二季度 GDP 增速高于市场一致预期",
    optEn: "Yes",
    optZh: "是",
    a: 417.60,
    k: 0.35,
    premium: 135.72,
    status: "releasing",
    settledDaysAgo: 78,
    claimed: 35.00,
  },
  {
    id: "CF-00176",
    order: "SGA-7470",
    catEn: "Crypto",
    catZh: "加密",
    mEn: "A top-5 exchange lists a new spot ETF product",
    mZh: "某前五交易所上线新的现货 ETF 产品",
    optEn: "No",
    optZh: "否",
    a: 529.90,
    k: 0.46,
    premium: 143.07,
    status: "releasing",
    settledDaysAgo: 205,
    claimed: 180.00,
  },
  {
    id: "CF-00150",
    order: "SGA-7388",
    catEn: "Crypto",
    catZh: "加密",
    mEn: "Average ETH gas stays below 8 gwei through May",
    mZh: "5 月 ETH 平均 gas 持续低于 8 gwei",
    optEn: "Yes",
    optZh: "是",
    a: 364.25,
    k: 0.28,
    premium: 131.13,
    status: "completed",
    settledDaysAgo: 400,
    claimed: 364.25,
  },
  {
    id: "CF-00112",
    order: "SGA-7301",
    catEn: "Crypto",
    catZh: "加密",
    mEn: "A new stablecoin reaches $1B supply within 90 days",
    mZh: "某新稳定币在 90 天内供应量达 10 亿美元",
    optEn: "Yes",
    optZh: "是",
    a: 455.80,
    k: 0.44,
    premium: 127.62,
    status: "hit",
    settledDaysAgo: 60,
  },
  {
    id: "CF-00087",
    order: "SGA-7155",
    catEn: "Climate",
    catZh: "气候",
    mEn: "A regional weather index closes above its threshold",
    mZh: "某区域气象指数收于阈值上方",
    optEn: "Yes",
    optZh: "是",
    a: 208.40,
    k: 0.50,
    premium: 52.10,
    status: "void",
    voidedDaysAgo: 21,
  },
];
