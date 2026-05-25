import { ReactNode } from "react";

type BadgeVariant = "default" | "signal" | "good";

interface BadgeProps {
  variant?: BadgeVariant;
  /** Whether to show the leading colored dot. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

/** Matches prototype `.badge` + `.b-sig` / `.b-good`. Inner dot is `<span class="d" />`. */
export function Badge({ variant = "default", dot = true, className, children }: BadgeProps) {
  const classes = ["badge"];
  if (variant === "signal") classes.push("b-sig");
  else if (variant === "good") classes.push("b-good");
  if (className) classes.push(className);

  return (
    <span className={classes.join(" ")}>
      {dot && <span className="d" />}
      {children}
    </span>
  );
}
