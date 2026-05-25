"use client";

import { useToastStore } from "@/stores/toast";

/** Renders the global toast UI. Class structure mirrors prototype `.toast`. */
export function ToastHost() {
  const msg = useToastStore((s) => s.msg);
  const sub = useToastStore((s) => s.sub);
  const kind = useToastStore((s) => s.kind);
  const visible = useToastStore((s) => s.visible);

  const classes = ["toast"];
  if (visible) classes.push("show");
  if (kind === "info") classes.push("t-info");
  else if (kind === "err") classes.push("t-err");

  return (
    <div className={classes.join(" ")} role="status" aria-live="polite">
      <span className="tdot" />
      <span className="tbody">
        <span className="tmain">{msg}</span>
        {sub && <span className="tsub">{sub}</span>}
      </span>
    </div>
  );
}
