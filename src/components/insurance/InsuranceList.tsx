"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useLocale, useT } from "@/hooks/useT";
import { ORDERS } from "@/lib/mock";
import { kOf, premiumOf } from "@/lib/pricing";
import { F, RELEASE_DAYS } from "@/lib/config";
import { pct } from "@/lib/format";
import { useSimulationStore } from "@/stores/simulation";
import { ListBar, type SortKey } from "./ListBar";
import { OrderCard } from "./OrderCard";
import { EmptyState } from "./EmptyState";
import { GatedView } from "./GatedView";

/**
 * Top-level client component for /insurance. Owns local search + sort
 * state (resets on navigation away — matches typical list UX), and gates
 * the real list behind the wagmi connection state.
 *
 * Filter / sort logic mirrors prototype `filteredOrders()` exactly.
 */
export function InsuranceList() {
  const t = useT();
  const { lang } = useLocale();
  const { isConnected, status } = useAccount();
  const mounted = useHasMounted();
  const insuredOrderIds = useSimulationStore((s) => s.insuredOrderIds);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("closes");

  /** Orders still available — excludes ones the user has minted this session. */
  const availableOrders = useMemo(
    () => ORDERS.filter((o) => !insuredOrderIds.has(o.id)),
    [insuredOrderIds],
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = availableOrders.filter((o) => {
      if (!q) return true;
      const mkt = lang === "zh" ? o.mZh : o.mEn;
      return mkt.toLowerCase().includes(q) || o.id.toLowerCase().includes(q);
    });
    // .slice() so we don't mutate the array from useMemo.
    return filtered.slice().sort((a, b) => {
      switch (sort) {
        case "premiumHi":
          return premiumOf(b.a, kOf(b)).payable - premiumOf(a.a, kOf(a)).payable;
        case "premiumLo":
          return premiumOf(a.a, kOf(a)).payable - premiumOf(b.a, kOf(b)).payable;
        case "principalHi":
          return b.a - a.a;
        case "closes":
        default:
          return a.closes - b.closes;
      }
    });
  }, [availableOrders, search, sort, lang]);

  // Defer the gate decision until wagmi has finished its initial reconnect
  // attempt — otherwise users who are in fact connected briefly see the
  // Connect-wallet prompt before the page swaps to real content.
  if (!mounted || status === "connecting" || status === "reconnecting") {
    return <GatedView hideCard />;
  }
  if (!isConnected) {
    return <GatedView />;
  }

  const hasSearch = search.trim().length > 0;

  return (
    <div className="page wrap">
      <div className="page-head rise">
        <div className="pagetitle">{t.insureTitle}</div>
        <p className="pagesub">{t.insureSub}</p>
        <div className="paramline">
          <span>
            <b>{t.pfloor}</b> {pct(F)}
          </span>
          <span>
            <b>{t.pperiod}</b> {RELEASE_DAYS}d {t.linear}
          </span>
          <span className="liveupd">
            <span className="lu-dot" />
            <LiveTimestamp />
          </span>
        </div>
      </div>

      {availableOrders.length === 0 ? (
        <EmptyState variant="no-orders" />
      ) : (
        <>
          <ListBar
            search={search}
            sort={sort}
            count={filteredOrders.length}
            onSearch={setSearch}
            onSort={setSort}
          />
          {filteredOrders.length === 0 ? (
            hasSearch ? (
              <EmptyState
                variant="no-match"
                onClear={() => {
                  setSearch("");
                  setSort("closes");
                }}
              />
            ) : (
              <EmptyState variant="no-orders" />
            )
          ) : (
            <div className="order-grid">
              {filteredOrders.map((order, i) => (
                <OrderCard key={order.id} order={order} index={i} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Cosmetic "updated Ns ago" indicator that cycles 3 → 6 → 9 → 3 every 3
 * seconds. Same fake-live ticker the prototype uses to suggest the order
 * list is fresh. No real polling.
 */
function LiveTimestamp() {
  const t = useT();
  const [s, setS] = useState(3);
  useEffect(() => {
    const id = setInterval(() => {
      setS((cur) => (cur >= 9 ? 3 : cur + 3));
    }, 3000);
    return () => clearInterval(id);
  }, []);
  return <>{t.liveUpdated(s)}</>;
}
