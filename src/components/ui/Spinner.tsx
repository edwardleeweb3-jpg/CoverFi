interface SpinnerProps {
  size?: "sm" | "md";
  className?: string;
}

/** Matches prototype `.spinner` and `.spinner-sm`. */
export function Spinner({ size = "md", className }: SpinnerProps) {
  return <div className={`spinner ${size === "sm" ? "spinner-sm" : ""} ${className ?? ""}`} />;
}
