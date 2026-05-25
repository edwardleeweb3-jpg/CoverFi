"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Chip } from "@/components/ui/Chip";
import { useLocale, useT } from "@/hooks/useT";
import { kOf, premiumOf } from "@/lib/pricing";
import { money } from "@/lib/format";
import type { Order } from "@/lib/mock";

interface Props {
  order: Order;
  /** Position in the rendered list — drives staggered .rise animation delay. */
  index: number;
}

/**
 * One row in the insurable-orders list. The entire card is a Next.js Link
 * to `/insurance/review/[orderId]`. The "Insure" button on the right is a
 * `<span>` styled like a button so we don't nest `<button>` inside `<a>`
 * (which is invalid HTML).
 *
 * Premium is computed live from current pricing helpers (PRD §3.2). The
 * value won't be locked until the user confirms on the review page.
 */
export function OrderCard({ order, index }: Props) {
  const t = useT();
  const { lang } = useLocale();

  const k = kOf(order);
  const pr = premiumOf(order.a, k);

  const cat = lang === "zh" ? order.catZh : order.catEn;
  const mkt = lang === "zh" ? order.mZh : order.mEn;
  const opt = lang === "zh" ? order.optZh : order.optEn;
  const closesLabel =
    lang === "zh" ? `剩余 ${order.closes} 天` : `closes in ${order.closes}d`;

  return (
    <Link
      href={`/insurance/review/${order.id}`}
      className="card row-card clk rise"
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      <div className="main">
        <div className="cat">
          {cat} · {order.id}
        </div>
        <div className="mkt">{mkt}</div>
        <div className="sub">
          <Chip>
            {t.insuredOption} · {opt}
          </Chip>
          <Chip>
            {t.principal} · {money(order.a)} USDC
          </Chip>
          <Chip>{closesLabel}</Chip>
        </div>
      </div>
      <div className="endcol">
        <div className="el">{t.estPremium}</div>
        <div className="ev">{money(pr.payable)}</div>
        <div className="eu">
          USDC{pr.floored ? ` · ${t.floor}` : ""}
        </div>
      </div>
      <span className="btn btn-primary btn-sm">
        {t.insure} <Icon name="arrow" size={13} />
      </span>
    </Link>
  );
}
