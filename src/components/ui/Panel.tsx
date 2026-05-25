import { ReactNode } from "react";

interface PanelProps {
  /** Mono-styled section title (gets the ::before swatch + ::after rule from prototype). */
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Matches prototype `.card.panel` — a Card with internal padding + the h4 title decoration. */
export function Panel({ title, className, children }: PanelProps) {
  return (
    <div className={`card panel ${className ?? ""}`}>
      {title && <h4 className="panel-h">{title}</h4>}
      {children}
    </div>
  );
}
