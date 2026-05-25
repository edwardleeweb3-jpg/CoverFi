import { ThemeToggleDebug } from "@/components/theme-toggle-debug";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 100 100" className="h-9 w-9 text-text">
          <use href="#mk" />
        </svg>
        <h1 className="text-5xl font-semibold tracking-[-0.035em] sm:text-6xl">
          CoverFi <span className="font-normal text-text-3">Protocol</span>
        </h1>
      </div>

      <p className="mt-6 max-w-md text-base leading-relaxed text-text-2">
        链上预测市场的本金保障层 — <span className="font-mono">step 1 ok</span>
      </p>

      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-text-3">
        design tokens · fonts · brand svg · theme bootstrap
      </p>

      <ThemeToggleDebug />
    </main>
  );
}
