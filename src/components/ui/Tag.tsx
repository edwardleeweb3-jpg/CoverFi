import { ReactNode } from "react";

/** Matches prototype `.tag` — slimmer than Chip; used in policy ledger row metadata. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`tag ${className ?? ""}`}>{children}</span>;
}
