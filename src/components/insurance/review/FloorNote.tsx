"use client";

import { useT } from "@/hooks/useT";
import { money } from "@/lib/format";

interface Props {
  floored: boolean;
  base: number;
  floor: number;
}

/**
 * Note shown below the terms table.
 *
 * - When the 5% floor kicked in (i.e., base premium < floor): blue-tinted
 *   "Floor applied" message explaining the swap.
 * - Otherwise: neutral note clarifying that payable = max(base, floor).
 *
 * Uses i18n function-keys `floorOn(base, floor)` / `floorOff(floor)` so
 * the explanation reads naturally in both languages.
 */
export function FloorNote({ floored, base, floor }: Props) {
  const t = useT();
  return (
    <div className={`notebox${floored ? " on" : ""}`}>
      {floored ? t.floorOn(money(base), money(floor)) : t.floorOff(money(floor))}
    </div>
  );
}
