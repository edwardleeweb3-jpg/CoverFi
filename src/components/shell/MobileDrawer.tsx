"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/hooks/useT";
import { useThemeStore } from "@/stores/theme";
import { useWalletStore } from "@/stores/wallet";
import { useToast } from "@/stores/toast";
import { shortAddress } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { IconName } from "@/components/ui/icon-paths";

interface DrawerNav {
  href: string;
  labelKey: keyof Pick<Dict, "navHome" | "navInsure" | "navPortfolio">;
  icon: IconName;
}

const NAV_ITEMS: DrawerNav[] = [
  { href: "/", labelKey: "navHome", icon: "home" },
  { href: "/insurance", labelKey: "navInsure", icon: "shield" },
  { href: "/policies", labelKey: "navPortfolio", icon: "doc" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Mobile-only drawer (CSS hides it on ≥681px). Rendered as a sibling of the
 * <header>. Slides in from the left when burger is tapped.
 *
 * - Closes on: Esc, backdrop click, nav link click.
 * - Locks body scroll while open.
 * - Connect closes the drawer first, then opens the wagmi picker.
 * - Disconnect closes the drawer, calls wagmi disconnect, fires toast.
 *
 * Balance display is intentionally omitted at this step — once we have
 * USDC token-contract integration (PRD-driven later step) we'll show
 * the real balance here. Native BNB balance would be misleading.
 */
export function MobileDrawer({ open, onClose }: Props) {
  const { lang, setLang } = useLocale();
  const t = useT();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const openPicker = useWalletStore((s) => s.openPicker);
  const showToast = useToast();
  const pathname = usePathname();

  // Stable ref to onClose to avoid resubscribing effects on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Close drawer whenever the route changes (catches Link clicks AND
  // back/forward navigation).
  useEffect(() => {
    onCloseRef.current();
  }, [pathname]);

  // Esc closes; body scroll locked while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const connected = isConnected;

  return (
    <div
      className={`drawer ${open ? "open" : ""}`}
      onClick={onClose}
      role="presentation"
      aria-hidden={!open}
    >
      <aside
        className="drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.menu}
      >
        <div className="d-sec">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const showLock = !connected && item.href !== "/";
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`dnav ${active ? "on" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="dn-ic">
                  <Icon name={item.icon} size={18} />
                </span>
                <span className="dn-l">{t[item.labelKey]}</span>
                {showLock && (
                  <span className="dlk">
                    <Icon name="lock" size={13} />
                  </span>
                )}
                <span className="dn-arr">
                  <Icon name="arrow" size={15} />
                </span>
              </Link>
            );
          })}
        </div>

        <div className="d-divider" />

        <div className="d-row">
          <span className="d-row-l">{t.langLabel}</span>
          <div className="seg">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={lang === "en" ? "on" : undefined}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang("zh")}
              className={lang === "zh" ? "on" : undefined}
            >
              中文
            </button>
          </div>
        </div>

        <div className="d-row">
          <span className="d-row-l">{t.themeLabel}</span>
          <div className="seg">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={theme === "light" ? "on" : undefined}
            >
              {t.themeLight}
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={theme === "dark" ? "on" : undefined}
            >
              {t.themeDark}
            </button>
          </div>
        </div>

        <div className="d-foot">
          {connected ? (
            <>
              <div className="d-wallet">
                <span className="live" />
                <span>{shortAddress(address)}</span>
              </div>
              <Button
                variant="ghost"
                block
                onClick={() => {
                  onClose();
                  disconnect();
                  showToast(t.disconnected);
                }}
              >
                {t.disconnect}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              block
              onClick={() => {
                onClose();
                openPicker();
              }}
            >
              {t.connect}
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}
