interface SkeletonProps {
  className?: string;
  /** Convenience: pass to style.width (e.g. "60%", 200). */
  width?: number | string;
  /** Convenience: pass to style.height. Defaults to a typical line height. */
  height?: number | string;
}

/** Matches prototype `.skel` — shimmer placeholder. */
export function Skeleton({ className, width, height }: SkeletonProps) {
  const style: Record<string, string | number> = {};
  if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;
  return <div className={`skel ${className ?? ""}`} style={style} />;
}
