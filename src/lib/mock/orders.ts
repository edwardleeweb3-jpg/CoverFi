/**
 * Mock insurable Signa orders. Seeded verbatim from the prototype
 * (_docs/prototype.html, the `ORDERS` array).
 *
 * Real source — Signa adapter (PRD §7). Once that's wired up, this file
 * is replaced by an async `getOrdersByAddress()` call; the row shape
 * already mirrors the adapter contract from PRD §7.1.
 */

export type OptionEn = "Yes" | "No";
export type OptionZh = "是" | "否";

export interface Order {
  /** Signa order ID — primary key from upstream. */
  id: string;

  /** Category label (bilingual). */
  catEn: string;
  catZh: string;

  /** Market title (bilingual). */
  mEn: string;
  mZh: string;

  /** The option the user bet on (bilingual labels). */
  optEn: OptionEn;
  optZh: OptionZh;

  /**
   * Principal (`a`) in USDC. Float for the simulated layer; once
   * contracts are wired this becomes `bigint` wei (PRD §3.2 precision).
   */
  a: number;

  /** TVL on the user's chosen option (USDC). Used in `k = optTVL / mktTVL`. */
  optTVL: number;

  /** Total TVL across all options in the market (USDC). */
  mktTVL: number;

  /** Days remaining until the market closes for new bets. */
  closes: number;
}

export const ORDERS: readonly Order[] = [
  {
    id: "SGA-7741",
    catEn: "Macro",
    catZh: "宏观",
    mEn: "The Fed cuts its policy rate at the Q3 meeting",
    mZh: "美联储在三季度会议上下调政策利率",
    optEn: "Yes",
    optZh: "是",
    a: 512.40,
    mktTVL: 1240000,
    optTVL: 384400,
    closes: 18,
  },
  {
    id: "SGA-7720",
    catEn: "Crypto",
    catZh: "加密",
    mEn: "ETH closes above $4,000 on Jun 30",
    mZh: "ETH 在 6 月 30 日收于 4,000 美元上方",
    optEn: "Yes",
    optZh: "是",
    a: 283.75,
    mktTVL: 880000,
    optTVL: 545600,
    closes: 9,
  },
  {
    id: "SGA-7698",
    catEn: "Technology",
    catZh: "科技",
    mEn: "A major AI lab ships a new flagship model in Q3",
    mZh: "某主要 AI 实验室在三季度发布新旗舰模型",
    optEn: "Yes",
    optZh: "是",
    a: 874.20,
    mktTVL: 2100000,
    optTVL: 1953000,
    closes: 34,
  },
  {
    id: "SGA-7655",
    catEn: "Climate",
    catZh: "气候",
    mEn: "Global average temperature sets a yearly record",
    mZh: "全球年平均气温创下纪录",
    optEn: "No",
    optZh: "否",
    a: 146.80,
    mktTVL: 610000,
    optTVL: 134200,
    closes: 52,
  },
  {
    id: "SGA-7642",
    catEn: "Crypto",
    catZh: "加密",
    mEn: "Total stablecoin supply exceeds $300B by year-end",
    mZh: "稳定币总供应量年底前突破 3000 亿美元",
    optEn: "Yes",
    optZh: "是",
    a: 1240.00,
    mktTVL: 1500000,
    optTVL: 735000,
    closes: 120,
  },
];
