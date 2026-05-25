import { ReactNode } from "react";

/** Matches prototype `.chip` — mono-cased rounded tag used in order row metadata. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`chip ${className ?? ""}`}>{children}</span>;
}
