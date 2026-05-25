"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark, Icon } from "@/components/ui/Icon";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import { useLocale, useT } from "@/hooks/useT";
import { useThemeStore } from "@/stores/theme";
import { useWalletStore } from "@/stores/wallet";
import { MobileDrawer } from "./MobileDrawer";
import type { Dict } from "@/lib/i18n";

interface NavItem {
  href: string;
  labelKey: keyof Pick<Dict, "navHome" | "navInsure" | "navPortfolio">;
}

/** Routes follow PRD §4.1 — /, /insurance, /policies. */
const NAV_ITEMS: NavItem[] = [
  { href: "/", labelKey: "navHome" },
  { href: "/insurance", labelKey: "navInsure" },
  { href: "/policies", labelKey: "navPortfolio" },
];

/**
 * Global sticky header. Desktop: brand + inline nav + right-side controls.
 * Mobile (≤680px): burger replaces inline nav + desktop-only controls; the
 * wallet button stays in the bar. The burger toggles the MobileDrawer
 * rendered as a sibling below.
 */
export function SiteHeader() {
  const { lang, setLang } = useLocale();
  const t = useT();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const connected = useWalletStore((s) => s.connected);
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      <header className="site">
        <div className="bar wrap">
          <button
            type="button"
            className="burger"
            onClick={() => setDrawerOpen(true)}
            aria-label={t.menu}
            aria-expanded={drawerOpen}
          >
            <span />
          </button>

          <Link href="/" className="brand">
            <BrandMark size={25} />
            <span className="txt">
              CoverFi <span className="p">Protocol</span>
            </span>
          </Link>

          <nav className="navlinks" aria-label="primary">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              const showLock = !connected && item.href !== "/";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "on" : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  {t[item.labelKey]}
                  {showLock && (
                    <span className="lk">
                      <Icon name="lock" size={12} />
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="grow" />

          <div className="nav-right">
            <div className="seg seg-desktop">
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
                中
              </button>
            </div>

            <button
              type="button"
              className="iconbtn iconbtn-desktop"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={t.themeLabel}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
            </button>

            <WalletConnectButton />
          </div>
        </div>
      </header>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
