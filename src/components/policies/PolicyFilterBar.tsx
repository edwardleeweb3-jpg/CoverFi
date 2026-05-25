"use client";

import { Icon } from "@/components/ui/Icon";
import { useT } from "@/hooks/useT";
import type { PolicyBucket } from "@/lib/pricing";

export type FilterKey = "all" | PolicyBucket;

interface Props {
  search: string;
  filter: FilterKey;
  onSearch: (s: string) => void;
  onFilter: (f: FilterKey) => void;
}

/**
 * Search input + 5 filter chips (All / Paying / Covered / Paid / Nopay).
 * Filter chips highlight (signal-soft bg + signal-2 text) when active.
 */
export function PolicyFilterBar({ search, filter, onSearch, onFilter }: Props) {
  const t = useT();
  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: t.filterAll },
    { key: "paying", label: t.gPaying },
    { key: "covered", label: t.gCovered },
    { key: "paid", label: t.gPaid },
    { key: "nopay", label: t.gNopay },
  ];

  return (
    <div className="listbar">
      <div className="lb-search">
        <Icon name="search" size={15} />
        <input
          type="text"
          placeholder={t.searchPh}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          autoComplete="off"
          aria-label={t.searchPh}
        />
      </div>
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          className={`fbtn${filter === f.key ? " on" : ""}`}
          onClick={() => onFilter(f.key)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
