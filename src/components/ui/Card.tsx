import { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Matches prototype `.card` — surface + line border + rounded-m. */
export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div className={`card ${className ?? ""}`} {...rest}>
      {children}
    </div>
  );
}
