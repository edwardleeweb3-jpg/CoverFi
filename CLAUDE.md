@AGENTS.md

# CoverFi — Project Handoff

This file is the entry point for any new Claude Code session on this repo.
Read it top to bottom before writing any code.

## 1. Project

**CoverFi** is an onchain principal-insurance protocol layered on top of
prediction markets (Signa). Users insure their Signa orders; if a position
settles as a miss, **100% of principal is returned**, released linearly over
365 days. This repo is the **v1 frontend** rebuild from a single-file demo
prototype into a real Next.js app.

## 2. Tech stack

- **Next.js 16** with App Router — pre-release; APIs may differ from
  training data (see AGENTS.md note at the top of this file).
- **TypeScript** strict mode.
- **Tailwind CSS v4** with `@theme inline` to bridge CSS-variable design
  tokens to utility classes.
- **CSS variables** drive both the design system AND the light / dark
  theme — `<html data-theme="light|dark">` swaps the token values.
- **Zustand** for state (5 stores under `src/stores/`).
- **wagmi v3 + viem** for real wallet connection — single chain
  (BSC Testnet, chainId 97), `injected()` connector only, no
  WalletConnect / project IDs.
- **@tanstack/react-query** as wagmi's peer.
- **next/font** for IBM Plex Sans / Mono; Noto Sans SC via `<link>`.
- **No 3rd-party UI library.** Every component is hand-built to match the
  prototype.

## 3. Reference docs (load-bearing)

- **`_docs/PRD.md`** — product requirements + economic model.
  - **§3.2** premium formula `base = Q × (1 − k) × a`, floor `F × a`,
    payable = `max(base, floor)`.
  - **§3.3** linear release `a × min(d / 365, 1)`; claimable = released −
    claimed; cumulative claims accumulate.
  - **§2.2** the 5 unified status strings (`active` / `releasing` /
    `completed` / `hit` / `void`).
  - **§4A** admin backend — explicitly deferred; `lib/config.ts` already
    exposes `getPricingQ()` as an async stub so the future fetch is a
    one-line swap.
- **`_docs/prototype.html`** — single-file demo with all five views.
  This is the **1:1 visual / interaction baseline**. When in doubt about
  styling, copy, or behavior, the prototype wins over our intuition.

## 4. Implementation plan (11 steps)

The rebuild is decomposed into 11 sequential steps. Each step ships a
browser-visible result; user reviews and approves before the next step
starts.

1. **Foundation & design tokens** — CSS vars (light + dark palettes),
   Tailwind theme bridge, font loading, brand SVG defs, anti-FOUC theme
   bootstrap inline `<script>`.
2. **Providers & UI primitives** — 4 Zustand stores + 4 effect/host
   components; 10 UI atoms (Button / Badge / Chip / Tag / Icon +
   BrandMark + SignaMark / Card / Panel / Modal / Skeleton / Spinner);
   full bilingual dictionary ported from prototype.
3. **Site shell** — `SiteHeader` / `MobileDrawer` / `SiteFooter` (slim
   single-row brand + © copy), wired into root layout. Real Next.js
   routes for `/`, `/insurance`, `/insurance/review/[orderId]`,
   `/policies`, `/policies/[policyId]` with placeholder pages.
4. **Real home page** — Hero + HeroMotif (diagonal-stacked policy
   cards), MetricBand with count-up, HowItWorks 3-step flow with
   sequentially lit accent lines, CoverageValues, SupportedMarkets,
   FAQ accordion. Scroll-reveal via `useInView` hook.
5. **Real wallet connection** — wagmi config (BSC Testnet, injected
   only), `Web3Provider`, gut-rebuild of `WalletFlow` to use real
   `useConnect()`, chain ID validation with switch-network CTA,
   MetaMask-only picker with install-link fallback when not detected
   (uses official MetaMask SVG logo in `public/wallets/metamask.svg`).
6. **Mock data + business-logic helpers** — `lib/mock/{orders,policies,
   activity}.ts` seeded from prototype; `lib/pricing.ts` with `kOf` /
   `premiumOf` / `releasedOf` / `claimableOf` / `bucketOf` (formulas
   pinned to PRD §3.2 / §3.3 with inline section pointers);
   `lib/config.ts` centralises `Q_DEFAULT` / `F` / `RELEASE_DAYS` and
   reserves the admin-backend hook.
7. **`/insurance` list page** — gated preview for disconnected users,
   `ListBar` (search + sort), `OrderCard` grid with live premium
   quotes, empty / no-match states.
8. **`/insurance/review/[orderId]`** — `PayCoverStripe`, `TermsTable`,
   `FloorNote`, `TermsChecklist`, `WalletPayBox`; simulated mint (1.2 s
   spinner → `useSimulationStore.mintPolicy`) → redirect to
   `/policies/[id]`; insufficient-balance error modal.
9. **`/policies` overview** — `PolicyOverview` 4-cell hero + release
   progress bar + Claim All; `PolicyFilterBar` (search + 5 chips);
   `PolicyLedger` grouped by bucket (paying / paid / covered / nopay)
   with bucket-coloured left edges; `ActivityFeed`; batch claim flow.
10. **`/policies/[policyId]` detail** — `PolicyCertificate`,
    status-branched body (active / hit / void = text; releasing /
    completed = `ReleaseCurve` interactive SVG + relrow + progress +
    claim button or fully-reimbursed note), `StatusTimeline`. Single
    Claim simulated flow.
11. **Responsive QA + polish** — 680 / 430 / 860 / 1180 / 1680
    breakpoint sweep across every page; `prefers-reduced-motion`
    global check; URL deep-link / refresh / back-forward verification;
    skeleton-loading polish; edge-case patches.

## 5. Current status

**Segment 3 (database / Supabase) is complete.** Combined with Segment 2,
that's frontend + persistent storage shipped and on `main`.

**Segment 3 commits (5 steps):**

```
4ee795a feat: db step 5 — persist claims to Supabase
49fe117 feat: db step 4 — read policies from Supabase
695bd4f feat: db step 3 — persist new policies to Supabase
a9e84c7 feat: db step 2 — add policies table schema
fd70946 feat: db step 1 — install Supabase client and connection config
```

**Segment 2 commits (11 steps):**

```
2ed93b2 feat: step 11 — responsive QA and finishing polish
0de8e27 feat: step 10 — policy detail page
1f9bfda feat: step 9 — policies overview page
ba12aad feat: step 8 — insurance review and confirm page
950bb58 feat: step 7 — insurance order list page
e6cd46e feat: step 6 — mock data and pricing logic helpers
b5f22de feat: step 5 — real wallet connection (wagmi + viem, MetaMask, BSC Testnet)
a1ad480 feat: step 4 — real homepage (hero, metrics, how it works, coverage, markets, faq)
91d2490 feat: step 3 — site shell + minimal footer
f8cf7f4 feat: step 2 — providers and UI primitives
076adf9 feat: step 1 — design tokens, fonts, theme system
```

**Next: Segment 4 — Smart contracts.** See §8 for scope. Segments 2 + 3
are closed unless a specific issue surfaces.

### Simulation vs. real — current boundary

| Piece                         | Where it lives now              |
|-------------------------------|---------------------------------|
| Policy create / read / claim  | **Supabase `policies` table**   |
| User balance                  | In-memory `useSimulationStore` (no DB table) |
| Activity feed                 | In-memory `useSimulationStore` (no DB table; PRD §5.3 reserved for later) |
| Markets / Signa orders        | Seed data in `lib/mock/{orders,policies}.ts` (PRD §5.1 / §7 reserved for later) |
| Wallet connection             | Real wagmi (BSC Testnet, MetaMask injected) |
| On-chain mint / claim         | Not wired — Segment 4 |

End-to-end happy path: connect wallet → browse seeded Signa orders →
review → pay → policy row inserted into Supabase → land on detail page
(reads row back from DB) → claim → DB row's `claimed` + `status`
updated → refresh persists everything except balance / activity (which
reset to seed on reload, by design until those tables land).

## 6. Working conventions (HARD requirements)

- **One step at a time.** Do exactly the step the user names. Stop and
  wait for explicit verification ("第 N 步通过 / ok / 验收通过") before
  starting step N+1. Do not pre-execute. Do not roll work from a future
  step into the current one to "save time."
- **Strict 1:1 with the prototype.** Visual / layout / copy /
  interaction parity is non-negotiable. The prototype's CSS structure
  and class names win over our preferences. When deviating, get user
  sign-off first.
- **PRD is the source of truth for economics.** Don't reinvent the
  premium / release / claim formulas. `lib/pricing.ts` has inline PRD
  section pointers (`§3.2`, `§3.3`) — keep them current if helpers
  change.
- **Simulation, not contracts.** Wallet connection is real, and
  policy rows now persist to Supabase (Segment 3). But balance /
  Activity remain in-memory in `useSimulationStore`, and no on-chain
  transaction is ever sent — mint / claim are simulated "payments"
  that just write to the DB. Real on-chain calls are Segment 4. Do
  NOT prematurely:
  - switch `number` USDC amounts to `bigint` wei
  - read real USDC balance via `useBalance`
  - introduce token-contract addresses
- **Bilingual everywhere.** All user-facing text comes from
  `src/lib/i18n/{en,zh}.ts` via `useT()`. New text adds keys in both
  files (TypeScript enforces shape match via the `Dict` type derived
  from `en`).
- **Light + dark themes.** Use existing CSS variables (`--ink`,
  `--surface`, `--text`, `--signal`, etc.). Don't introduce new hex
  colours — extend tokens if a new shade is genuinely needed.
- **Reuse UI primitives.** Don't build parallel versions of Button /
  Modal / Panel / Badge / Chip / Tag / Skeleton / Spinner / Icon.
- **DO NOT start the dev server.** The user keeps `npm run dev`
  running in a separate terminal. Only edit files; the user verifies
  in their own browser. Type checks via `npx tsc --noEmit` are fine
  and welcome.
- **Lightning CSS gotcha in `globals.css`.** Keep ONE `@media` block
  per breakpoint. Multiple blocks for the same `(max-width: Xpx)`
  query cause Lightning CSS to silently dedup and drop ~hundreds of
  lines of rules between them. There's a comment block above the
  responsive section warning about this — heed it.
- **Commit messages.** Each step commits with a message provided by
  the user, format `feat: step N — short label`. Co-Authored-By
  trailer added by Claude Code. Push to `main` only after the user
  explicitly asks.

## 7. Repo orientation

```
src/
  app/                     Next.js App Router
    layout.tsx               root: html attrs, fonts, brand SVG defs, AppProviders, header/footer
    page.tsx                 /                    (home)
    globals.css              ~3300 lines: tokens + base + every component's CSS
    insurance/
      page.tsx               /insurance           (list)
      review/[orderId]/      /insurance/review/*  (review-and-pay)
    policies/
      page.tsx               /policies            (overview)
      [policyId]/page.tsx    /policies/*          (detail)

  components/
    providers/               AppProviders, Web3Provider (wagmi + react-query),
                             ThemeEffects, LocaleEffects, ToastHost, WalletFlow
    shell/                   SiteHeader, MobileDrawer, SiteFooter
    ui/                      Button, Badge, Chip, Tag, Card, Panel, Modal,
                             Skeleton, Spinner, Icon (+ BrandMark, SignaMark)
    wallet/                  WalletConnectButton (header pill + disconnect popover)
    home/                    Hero, HeroMotif, MetricBand, CountUp, HowItWorks,
                             CoverageValues, SupportedMarkets, FAQ
    insurance/               InsuranceList, ListBar, OrderCard, EmptyState, GatedView
      review/                ReviewPage + PayCoverStripe, TermsTable, FloorNote,
                             TermsChecklist, WalletPayBox
    policies/                PoliciesPage, PolicyOverview, PolicyFilterBar,
                             PolicyLedger, PolicyRow, ActivityFeed, GatedView
      detail/                PolicyDetailPage, PolicyCertificate, ReleaseBlock,
                             ReleaseCurve, StatusBlock, StatusTimeline
    brand-svg-defs.tsx       hidden <svg> with #mk and #signa symbol defs

  stores/                    theme, locale, wallet (UI flow only), toast, simulation
  hooks/                     useT, useInView, useHasMounted
  lib/
    i18n/                    en.ts (source of truth), zh.ts, types.ts, index.ts
    mock/                    orders.ts, policies.ts, activity.ts, index.ts
                             (orders + activity still seed-only; `policies.ts`
                             type defs are still load-bearing — actual policy
                             rows now come from Supabase, not this seed)
    db/
      policies.ts            Supabase data-access layer: insertPolicy(),
                             listPoliciesByOwner(), getPolicyById(),
                             updatePolicyClaim() + DB-row → Policy mapper
                             (numeric → number, timestamptz → days-ago).
                             All writes lowercase the wallet address; reads
                             scope by owner_address.
    config.ts                Q_DEFAULT, F, RELEASE_DAYS, getPricingQ() async stub
    pricing.ts               kOf, premiumOf, releasedOf, claimableOf, bucketOf
    wagmi.ts                 BSC Testnet + injected() config
    supabase.ts              Singleton Supabase client (browser SDK only —
                             no @supabase/ssr; identity is the wallet
                             address, not Supabase Auth)
    format.ts                shortAddress, money, pct

public/wallets/metamask.svg   official MetaMask fox SVG (used in picker)

supabase/
  schema.sql                  Single source of truth for the DB schema —
                              `policies` table (PRD §5.2), CHECK constraints,
                              owner_address index, demo-phase RLS policies.
                              Apply via the Supabase SQL editor.

_docs/                        PRD.md + prototype.html (1:1 baseline)
memory/                       In-session Claude Code memory artifacts from the
                              original build. NOT auto-loaded by new sessions
                              and NOT part of the application. The rules they
                              contain are already mirrored in §6 above — read
                              §6, ignore memory/.

.env.local                    (NOT in git — `.gitignore` covers `.env*`)
                              Required to run locally. Two vars:
                                NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
                                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
                              Both are public-safe (RLS gates real access).
                              Ask the project owner for current values.
```

Notes:
- The wallet store **only tracks UI flow** (`idle` / `picker` /
  `connecting`). Real connection state (`isConnected`, `address`,
  `chainId`) comes from wagmi's `useAccount` / `useChainId`.
- The simulation store still owns `balance` (default 2450 USDC),
  `activities`, `insuredOrderIds`, `nextPolicyCounter` (starts at
  232) and the in-memory `policies` slice. The policies slice is
  **no longer read by /policies or the detail page** (they read
  from Supabase via `lib/db/policies.ts`); it's kept around so the
  store-side `claimPolicy` / `claimAll` mirrors can update balance
  + activity for in-session-minted rows. Mint flow: `insertPolicy()`
  (DB) → `mintPolicy(id, …)` (store). Claim flow: `updatePolicyClaim()`
  (DB) → `claimPolicy(id)` / `claimAll()` (store mirror).
- `globals.css` is large but organised top-to-bottom by feature.
  Search for the section comment (e.g. `/* === Portfolio ... */`)
  before adding new CSS. Always honor the "one @media block per
  breakpoint" rule.

## 8. Remaining segments

Per PRD §10, the broader v1 scope still has these segments ahead of us.
Segments 2 (frontend) and 3 (database) are done — see §5.

- **Segment 4 — Smart contracts (next).** `CoverFiPolicy.sol` per
  PRD §8: `buyPolicy`, `triggerSettlement`, `claim`. Deployed to
  BSC Testnet, AI-audited per PRD §8.3. Then **real contract
  wiring** — replace the simulated mint / claim "payments" with
  wagmi `useWriteContract` calls; the DB persistence layer added
  in Segment 3 becomes the indexer for emitted events instead of
  the primary writer. **Switch all `number` USDC amounts to
  `bigint` wei** per PRD §3.2 precision requirement; `lib/pricing.ts`
  will need bigint variants of `premiumOf` / `releasedOf` /
  `claimableOf`. Also: pull real USDC balance via `useBalance`,
  retire the in-memory `balance` slice.
- **Segment 5 — Signa adapter** (PRD §7) — once Signa documentation
  lands. Replaces `lib/mock/orders.ts` with real Signa-sourced
  orders behind the adapter interface stubbed in PRD §7.1. The
  `markets` table (PRD §5.1) likely lands here too, replacing the
  denormalised bilingual market/option columns currently on
  `policies` with a proper FK.
- **Segment 6 — Admin backend** (PRD §4A) — dedicated `/admin/*`
  routes for tuning `Q` and managing the market whitelist (and a
  `config` table per PRD §4A.5). `lib/config.ts` exposes
  `getPricingQ()` as an async stub so the swap is one line at the
  call sites.
- **Activity persistence** — PRD §5.3 reserves an `activities` table;
  the in-memory activity feed gets backed by it (probably alongside
  Segment 4 so it indexes real on-chain events).

Segment boundaries are negotiable as priorities shift, but the
"contracts next" call is firm — everything else is easier to wire
up once the on-chain truth exists.
