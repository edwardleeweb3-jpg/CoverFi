"use client";

import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { useT } from "@/hooks/useT";

type Props =
  | { variant: "no-orders" }
  | { variant: "no-match"; onClear: () => void };

/**
 * Empty / no-match state for the insurance list. Two variants:
 * - `no-orders`: ORDERS array is empty (no insurable orders exist at all)
 * - `no-match`:  current search/filter yielded zero rows; offers a "Clear" CTA
 */
export function EmptyState(props: Props) {
  const t = useT();

  if (props.variant === "no-orders") {
    return (
      <div className="empty2">
        <div className="e-ic">
          <Icon name="empty" size={20} />
        </div>
        <div className="e-t">{t.emptyOrdersT}</div>
        <div className="e-d">{t.emptyOrdersD}</div>
      </div>
    );
  }

  return (
    <div className="empty2">
      <div className="e-ic">
        <Icon name="search" size={20} />
      </div>
      <div className="e-t">{t.noMatch}</div>
      <div className="e-d">{t.noMatchD}</div>
      <Button variant="ghost" size="sm" onClick={props.onClear}>
        {t.clearFilters}
      </Button>
    </div>
  );
}
