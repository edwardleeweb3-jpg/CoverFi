import type { CSSProperties } from "react";

interface SkeletonProps {
  className?: string;
  /** Convenience: pass to style.width (e.g. "60%", 200). */
  width?: number | string;
  /** Convenience: pass to style.height. */
  height?: number | string;
  /** Escape hatch for one-off flex / margin / etc. Merged with width/height. */
  style?: CSSProperties;
}

/** Matches prototype `.skel` — shimmer placeholder. */
export function Skeleton({ className, width, height, style }: SkeletonProps) {
  const computed: CSSProperties = { ...style };
  if (width !== undefined) computed.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) computed.height = typeof height === "number" ? `${height}px` : height;
  return <div className={`skel ${className ?? ""}`} style={computed} />;
}
