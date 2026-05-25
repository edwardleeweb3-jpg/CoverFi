import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { BrandSvgDefs } from "@/components/brand-svg-defs";
import { AppProviders } from "@/components/providers/AppProviders";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { SiteFooter } from "@/components/shell/SiteFooter";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CoverFi Protocol",
  description: "The coverage layer for onchain prediction markets",
};

/**
 * Runs before first paint. Sets data-theme on <html> from localStorage
 * (manual override) or prefers-color-scheme. Prevents theme flash on load.
 */
const themeBootstrap = `(function(){try{var s=localStorage.getItem('coverfi-theme');var t=(s==='dark'||s==='light')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      {/* min-h-dvh is what anchors the sticky-footer chain to the viewport.
          (See globals.css body rule for why this lives here as a utility
          instead of in the body block.) */}
      <body className="min-h-dvh">
        <BrandSvgDefs />
        <AppProviders>
          <SiteHeader />
          <main className="site-main">{children}</main>
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  );
}
