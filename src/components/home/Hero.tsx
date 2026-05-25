"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/hooks/useT";
import { HeroMotif } from "./HeroMotif";

/**
 * Top-of-page hero — eyebrow chip, headline, lede, two CTAs, and the
 * diagonal-stacked policy-cards motif on the right. Subtle grid backdrop
 * radially fades out. Mobile hides the motif and stacks copy full-width.
 */
export function Hero() {
  const t = useT();

  return (
    <div className="hero">
      <div className="hero-grid-bg" aria-hidden="true" />
      <div className="wrap">
        <div className="hero-cols">
          <div className="hero-in rise">
            <span className="hero-eyebrow">
              <span className="he-dot" />
              {t.heroEyebrow}
            </span>
            <h1 className="h1">{t.heroTitle}</h1>
            <p className="lede">{t.heroLede}</p>
            <div className="cta-row">
              <Link href="/insurance" className="btn btn-primary">
                {t.navInsure} <Icon name="arrow" size={14} />
              </Link>
              <Link href="/policies" className="btn btn-ghost">
                {t.navPortfolio}
              </Link>
            </div>
          </div>
          <div className="hero-visual rise-2">
            <HeroMotif />
          </div>
        </div>
      </div>
    </div>
  );
}
