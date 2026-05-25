"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useT } from "@/hooks/useT";
import { useWalletStore } from "@/stores/wallet";

/**
 * Locked preview shown to disconnected users on /policies. Same gate
 * pattern as /insurance — blurred dashboard skeleton + centered prompt.
 * Structure mirrors the unlocked page (hero strip + a few placeholder
 * rows) so the transition after connect feels continuous.
 */
export function GatedView() {
  const t = useT();
  const openPicker = useWalletStore((s) => s.openPicker);

  return (
    <div className="gate">
      <div className="gate-blur" aria-hidden="true">
        <div className="page wrap">
          <div className="page-head">
            <div className="pagetitle">{t.pfTitle}</div>
            <p className="pagesub">{t.pfSub}</p>
          </div>

          <div className="ov-lbl">{t.ovTitle}</div>

          <div className="skel-dash">
            <div className="skel-dash-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <DashCell key={i} lead={i === 0} />
              ))}
            </div>
            <div className="skel-dash-bar">
              <Skeleton className="skel-line" width={90} height={9} />
              <Skeleton className="skel-line" style={{ flex: 1 }} height={6} />
              <Skeleton className="skel-line" width={70} height={9} />
            </div>
          </div>

          {Array.from({ length: 3 }).map((_, i) => (
            <SkelRow key={i} />
          ))}
        </div>
      </div>

      <div className="gate-veil">
        <div className="gate-card">
          <div className="gi">
            <Icon name="lock" size={22} />
          </div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--text-3)",
              letterSpacing: "0.06em",
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            {t.previewNote}
          </div>
          <h3>{t.gateT}</h3>
          <p>{t.gateP}</p>
          <Button variant="primary" block onClick={() => openPicker()}>
            {t.gateBtn}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DashCell({ lead }: { lead: boolean }) {
  return (
    <div className={`skel-dash-cell${lead ? " lead" : ""}`}>
      <Skeleton className="skel-line" width={lead ? "58%" : "70%"} height={9} />
      <Skeleton
        className="skel-line"
        width={lead ? "74%" : "52%"}
        height={lead ? 24 : 20}
      />
      <Skeleton className="skel-line" width="46%" height={9} />
    </div>
  );
}

function SkelRow() {
  return (
    <div className="skel-row">
      <div className="sk-main">
        <Skeleton className="skel-line" width="30%" />
        <Skeleton className="skel-line" width="62%" height={15} />
        <Skeleton className="skel-line" width="45%" />
      </div>
    </div>
  );
}
