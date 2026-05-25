/**
 * Mock recent activity feed. Seeded verbatim from the prototype
 * (_docs/prototype.html, the `ACTIVITY` array).
 *
 * Real source — `activities` table indexed from on-chain events
 * (PRD §5.3): mint / claim / void records.
 */

/** Three activity kinds we surface in the "Recent activity" panel. */
export type ActivityType =
  | "mint" // Premium paid, policy minted
  | "claim" // Released principal claimed
  | "void"; // Market voided — refund happened

export interface Activity {
  type: ActivityType;
  /** Related policy ID (e.g. `CF-00176`). */
  id: string;
  /** Amount moved (USDC). 0 for `void` entries (premium refund is implicit). */
  amt: number;
  /** Market title shown beside the policy ID (bilingual). */
  mkt: { mEn: string; mZh: string };
  /** Days since the event; 0 means "just now". */
  ago: number;
}

export const ACTIVITY: readonly Activity[] = [
  {
    type: "claim",
    id: "CF-00176",
    amt: 73.50,
    mkt: {
      mEn: "A top-5 exchange lists a new spot ETF product",
      mZh: "某前五交易所上线新的现货 ETF 产品",
    },
    ago: 3,
  },
  {
    type: "mint",
    id: "CF-00231",
    amt: 188.36,
    mkt: {
      mEn: "BTC network hashrate sets a new all-time high in Q3",
      mZh: "BTC 全网算力在三季度创历史新高",
    },
    ago: 6,
  },
  {
    type: "claim",
    id: "CF-00198",
    amt: 35.00,
    mkt: {
      mEn: "Q2 GDP growth comes in above the consensus forecast",
      mZh: "二季度 GDP 增速高于市场一致预期",
    },
    ago: 11,
  },
  {
    type: "mint",
    id: "CF-00221",
    amt: 245.61,
    mkt: {
      mEn: "Headline CPI prints below 3.0% for the month",
      mZh: "当月 CPI 同比低于 3.0%",
    },
    ago: 14,
  },
  {
    type: "void",
    id: "CF-00087",
    amt: 0,
    mkt: {
      mEn: "A regional weather index closes above its threshold",
      mZh: "某区域气象指数收于阈值上方",
    },
    ago: 21,
  },
  {
    type: "claim",
    id: "CF-00150",
    amt: 120.00,
    mkt: {
      mEn: "Average ETH gas stays below 8 gwei through May",
      mZh: "5 月 ETH 平均 gas 持续低于 8 gwei",
    },
    ago: 40,
  },
];
