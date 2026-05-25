"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  BrandMark,
  Button,
  Card,
  Chip,
  Icon,
  Modal,
  Panel,
  SignaMark,
  Skeleton,
  Spinner,
  Tag,
  type IconName,
} from "@/components/ui";
import { useLocale } from "@/hooks/useT";
import { useThemeStore } from "@/stores/theme";
import { useToast } from "@/stores/toast";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";

const ALL_ICONS: IconName[] = [
  "shield",
  "code",
  "doc",
  "layer",
  "arrow",
  "empty",
  "lock",
  "sun",
  "moon",
  "search",
  "home",
  "fStep1",
  "fStep2",
  "fStep3",
];

export default function PreviewPage() {
  // Hydration-safe: skip rendering language/theme-dependent UI until mounted,
  // so SSR (always en/dark) doesn't mismatch the client's preferred lang/theme.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <Gallery />;
}

function Gallery() {
  const { lang, t, setLang } = useLocale();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const showToast = useToast();
  const [modalOpen, setModalOpen] = useState(false);

  const L = (en: string, zh: string) => (lang === "zh" ? zh : en);

  return (
    <div className="min-h-screen">
      {/* ── Sticky top bar ─────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b border-line backdrop-blur-md"
        style={{ background: "var(--header-bg)" }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
          <div className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em]">
            <BrandMark size={25} className="text-text" />
            <span>
              CoverFi <span className="font-normal text-text-3">Protocol</span>
            </span>
          </div>
          <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.08em] text-text-3">
            · {L("step 2 preview", "步骤 2 预览")}
          </span>

          <div className="flex-1" />

          {/* Language */}
          <div className="flex overflow-hidden rounded-s border border-line-2">
            <button
              onClick={() => setLang("en")}
              className={`px-3.5 py-2 font-mono text-[13px] transition ${lang === "en" ? "bg-surface-2 text-text" : "text-text-3"}`}
            >
              EN
            </button>
            <button
              onClick={() => setLang("zh")}
              className={`px-3.5 py-2 font-mono text-[13px] transition ${lang === "zh" ? "bg-surface-2 text-text" : "text-text-3"}`}
            >
              中
            </button>
          </div>

          {/* Theme */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-s border border-line-2 text-text-2 transition hover:border-line-3 hover:text-text"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
          </button>

          {/* Wallet — encapsulates Connect button / address pill / disconnect popover.
              Reusable by step 3's SiteHeader. min-w + popover lives inside. */}
          <WalletConnectButton />
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl space-y-16 px-6 py-12">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-3">
            {L(
              "providers wired · ui primitives ready",
              "providers 已就绪 · ui 原子完成",
            )}
          </p>
          <p className="mt-2 text-text-2">
            {L(
              "Toggle language, theme, and wallet status in the header above — they read through Zustand stores. Each section below is a 1:1 visual port of a prototype primitive.",
              "顶部切换语言、主题、钱包状态 —— 它们都走 Zustand store。下方每个区块都是原型对应原子的 1:1 视觉还原。",
            )}
          </p>
        </div>

        <Section num="01" en="Buttons" zh="按钮">
          <Row>
            <Button variant="primary">{L("Primary", "主要按钮")}</Button>
            <Button variant="primary">
              {L("With icon", "带图标")} <Icon name="arrow" size={14} />
            </Button>
            <Button variant="primary" size="sm">
              {L("Primary sm", "小号")}
            </Button>
            <Button variant="primary" disabled>
              {L("Disabled", "禁用")}
            </Button>
          </Row>
          <Row>
            <Button variant="ghost">{L("Ghost", "次要按钮")}</Button>
            <Button variant="ghost">
              {L("With icon", "带图标")} <Icon name="arrow" size={14} />
            </Button>
            <Button variant="ghost" size="sm">
              {L("Ghost sm", "小号")}
            </Button>
            <Button variant="ghost" disabled>
              {L("Disabled", "禁用")}
            </Button>
          </Row>
          <Row>
            <div className="w-full max-w-sm space-y-2.5">
              <Button variant="primary" block>
                {L("Primary block (full width)", "主要 · 撑满宽度")}
              </Button>
              <Button variant="ghost" block>
                {L("Ghost block (full width)", "次要 · 撑满宽度")}
              </Button>
            </div>
          </Row>
        </Section>

        <Section num="02" en="Badges" zh="状态标识">
          <Row>
            <Badge>{t.stsActive}</Badge>
            <Badge variant="signal">{t.stsReleasing}</Badge>
            <Badge variant="good">{t.stsCompleted}</Badge>
            <Badge>{t.stsHit}</Badge>
            <Badge>{t.stsVoid}</Badge>
          </Row>
          <Row>
            <Badge dot={false}>{L("no dot", "无圆点")}</Badge>
            <Badge variant="signal" dot={false}>
              {L("signal", "强调")}
            </Badge>
            <Badge variant="good" dot={false}>
              {L("good", "成功")}
            </Badge>
          </Row>
        </Section>

        <Section num="03" en="Chips & Tags" zh="信息标签">
          <Row>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-3">
              chip:
            </span>
            <Chip>{t.principal} · 512.40 USDC</Chip>
            <Chip>{t.insuredOption} · Yes</Chip>
            <Chip>{L("closes in 18d", "剩余 18 天")}</Chip>
          </Row>
          <Row>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-3">
              tag:
            </span>
            <Tag>Macro</Tag>
            <Tag>Yes</Tag>
            <Tag>
              {t.principal} 512.40
            </Tag>
          </Row>
        </Section>

        <Section num="04" en="Icons" zh="图标">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-3">
            {ALL_ICONS.map((n) => (
              <div
                key={n}
                className="flex flex-col items-center gap-2 rounded-m border border-line-2 bg-surface p-3 transition hover:border-line-3"
              >
                <Icon name={n} size={20} className="text-text-2" />
                <span className="font-mono text-[10px] text-text-3">{n}</span>
              </div>
            ))}
          </div>
          <Row>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-3">
              brand:
            </span>
            <BrandMark size={32} className="text-text" />
            <BrandMark size={24} className="text-text-2" />
            <BrandMark size={18} className="text-signal" />
            <SignaMark size={32} className="text-text" />
            <SignaMark size={24} className="text-text-2" />
          </Row>
        </Section>

        <Section num="05" en="Card & Panel" zh="卡片与面板">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-text-3">
                CARD · plain
              </div>
              <div className="mt-2 text-[15px] font-semibold tracking-[-0.01em]">
                {L("Surface + line border + rounded-m", "面+边线+小圆角")}
              </div>
              <p className="mt-1 text-[13px] text-text-2">
                {L(
                  "The base card. No padding — caller decides spacing.",
                  "最基础的卡片。不带 padding,内边距由外部决定。",
                )}
              </p>
            </Card>
            <Panel title={L("Sample panel", "示例面板")}>
              <p className="text-[13.5px] text-text-2">
                {L(
                  "Panel = card + 24px padding + the mono h4 title with leading swatch and trailing rule.",
                  "面板 = 卡片 + 24px 内边距 + 等宽小标题(前置图章 + 后置分隔线)。",
                )}
              </p>
            </Panel>
          </div>
        </Section>

        <Section num="06" en="Modal" zh="弹窗">
          <Row>
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              {L("Open modal", "打开弹窗")}
            </Button>
            <span className="font-mono text-[11px] text-text-3">
              {L("Esc / click backdrop to close · mobile: bottom sheet", "Esc / 点遮罩关闭 · 移动端为底部 sheet")}
            </span>
          </Row>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title={t.walletModalT}
            description={t.walletModalP}
          >
            <div className="space-y-2">
              <div className="rounded-m border border-line-2 p-3 text-[13px] text-text-2">
                {L("This is a sample modal body. Step 5 will fill in the real wallet picker.", "示例弹窗内容。第 5 步会接入真实钱包选择器。")}
              </div>
              <Button variant="ghost" block onClick={() => setModalOpen(false)}>
                {t.dismiss}
              </Button>
            </div>
          </Modal>
        </Section>

        <Section num="07" en="Skeleton" zh="骨架屏">
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <Skeleton width={48} height={48} />
              <div className="flex-1 space-y-2">
                <Skeleton height={11} width="34%" />
                <Skeleton height={14} width="72%" />
                <Skeleton height={11} width="50%" />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Skeleton width={54} height={9} />
                <Skeleton width={78} height={18} />
              </div>
            </div>
          </Card>
        </Section>

        <Section num="08" en="Spinner" zh="加载指示器">
          <Row>
            <div className="flex items-center gap-3">
              <Spinner size="sm" />
              <span className="font-mono text-[11px] text-text-3">sm · 13px</span>
            </div>
            <div className="flex items-center gap-3">
              <Spinner />
              <span className="font-mono text-[11px] text-text-3">md · 32px</span>
            </div>
          </Row>
        </Section>

        <Section num="09" en="Toast" zh="提示条">
          <Row>
            <Button variant="ghost" size="sm" onClick={() => showToast(L("Saved", "已保存"))}>
              {L("Show ok", "ok 提示")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                showToast(t.minted("CF-00232"), {
                  kind: "info",
                  sub: "0x7a3f…9c2e",
                })
              }
            >
              {L("Show info (with sub)", "info(带副标)")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                showToast(t.errInsufTitle, {
                  kind: "err",
                  sub: L("Insufficient balance", "余额不足"),
                  long: true,
                })
              }
            >
              {L("Show err (long)", "err(长时)")}
            </Button>
          </Row>
        </Section>

        <div className="border-t border-line pt-8 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-text-3">
          {L("end of step 2 preview", "步骤 2 预览结束")}
        </div>
      </main>
    </div>
  );
}

function Section({
  num,
  en,
  zh,
  children,
}: {
  num: string;
  en: string;
  zh: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <span className="font-mono text-[11px] tracking-[0.14em] text-text-3">
          {num}
        </span>
        <h2 className="text-[19px] font-semibold tracking-[-0.025em]">
          <SectionTitle en={en} zh={zh} />
        </h2>
        <span className="h-px flex-1 bg-line-2" />
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SectionTitle({ en, zh }: { en: string; zh: string }) {
  const lang = useLocale().lang;
  return <>{lang === "zh" ? zh : en}</>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}
