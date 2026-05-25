import { Hero } from "@/components/home/Hero";
import { MetricBand } from "@/components/home/MetricBand";
import { HowItWorks } from "@/components/home/HowItWorks";
import { CoverageValues } from "@/components/home/CoverageValues";
import { SupportedMarkets } from "@/components/home/SupportedMarkets";
import { FAQ } from "@/components/home/FAQ";

/**
 * Home page — 1:1 reconstruction of prototype's `views.home`.
 * Each section is its own client component with its own scroll-reveal /
 * count-up effects; this server-rendered shell just composes them in
 * order so the page itself can stay static.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <MetricBand />
      <HowItWorks />
      <CoverageValues />
      <SupportedMarkets />
      <FAQ />
    </>
  );
}
