"use client";

import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useT } from "@/hooks/useT";
import { useWalletStore } from "@/stores/wallet";
import { F, RELEASE_DAYS } from "@/lib/config";
import { pct } from "@/lib/format";

/**
 * Locked-preview view shown when the user is not connected. Mirrors
 * prototype's `.gate` pattern: blurred page structure (page-head + list
 * bar + 4 skeleton rows) sits behind a centered card that asks the user
 * to connect their wallet.
 *
 * The blurred section uses real layout (not just a single blur image)
 * so dimensions match the unlocked page — switching to the live list
 * after connecting feels continuous.
 */
export function GatedView() {
  const t = useT();
  const openPicker = useWalletStore((s) => s.openPicker);

  return (
    <div className="gate">
      <div className="gate-blur" aria-hidden="true">
        <div className="page wrap">
          <div className="page-head">
            <div className="pagetitle">{t.insureTitle}</div>
            <p className="pagesub">{t.insureSub}</p>
            <div className="paramline">
              <span>
                <b>{t.pfloor}</b> {pct(F)}
              </span>
              <span>
                <b>{t.pperiod}</b> {RELEASE_DAYS}d {t.linear}
              </span>
            </div>
          </div>

          <div className="listbar">
            <div className="lb-search">
              <Icon name="search" size={15} />
              <input
                type="text"
                placeholder={t.searchPh}
                disabled
                aria-hidden="true"
              />
            </div>
            <select className="sortsel" disabled aria-hidden="true">
              <option>{t.sortClosesSoon}</option>
              <option>{t.sortPremiumLo}</option>
              <option>{t.sortPremiumHi}</option>
              <option>{t.sortPrincipalHi}</option>
            </select>
          </div>

          <div>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkelRow key={i} />
            ))}
          </div>
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

function SkelRow() {
  return (
    <div className="skel-row">
      <div className="sk-main">
        <Skeleton className="skel-line" width="34%" />
        <Skeleton className="skel-line" width="72%" height={14} />
        <Skeleton className="skel-line" width="50%" />
      </div>
      <div className="sk-end">
        <Skeleton className="skel-line" width={54} height={9} />
        <Skeleton className="skel-line" width={78} height={18} />
      </div>
    </div>
  );
}
