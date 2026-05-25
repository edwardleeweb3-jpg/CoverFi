"use client";

import { Icon } from "@/components/ui/Icon";
import { useT } from "@/hooks/useT";

/** Sort keys mirror prototype's `state.ordSort` values. */
export type SortKey = "closes" | "premiumLo" | "premiumHi" | "principalHi";

interface Props {
  search: string;
  sort: SortKey;
  count: number;
  onSearch: (s: string) => void;
  onSort: (s: SortKey) => void;
}

/**
 * Search input + sort select + result count strip above the order grid.
 * Matches prototype's `.listbar`.
 */
export function ListBar({ search, sort, count, onSearch, onSort }: Props) {
  const t = useT();

  // Order matches prototype: closing-soonest first.
  const sorts: { key: SortKey; label: string }[] = [
    { key: "closes", label: t.sortClosesSoon },
    { key: "premiumLo", label: t.sortPremiumLo },
    { key: "premiumHi", label: t.sortPremiumHi },
    { key: "principalHi", label: t.sortPrincipalHi },
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
      <select
        className="sortsel"
        value={sort}
        onChange={(e) => onSort(e.target.value as SortKey)}
        aria-label="sort"
      >
        {sorts.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <span className="listcount">{t.resultCount(count)}</span>
    </div>
  );
}
