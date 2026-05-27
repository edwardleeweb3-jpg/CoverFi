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

**Segments 2 + 3 + 4 are complete.** Production app at
[cover-fi.vercel.app](https://cover-fi.vercel.app) runs against real
BSC Testnet contracts and the Supabase mirror. Three real policies
exist on-chain (one Releasing, one Hit, one Void). Segment 5 (Signa
adapter) is the next major segment — see §8.

### Segment 4 — deployed contracts (BSC Testnet, chainId 97)

| Contract       | Address                                                                                                                  | Source |
|----------------|--------------------------------------------------------------------------------------------------------------------------|--------|
| MockUSDC       | [`0xb1DC4F171091D2b3d94a8B14be8cc663fD994e73`](https://testnet.bscscan.com/address/0xb1DC4F171091D2b3d94a8B14be8cc663fD994e73#code) | verified |
| CoverFiPolicy  | [`0xEbdd8f124EaD6DABd7C5F3893E2A244280fE5b19`](https://testnet.bscscan.com/address/0xEbdd8f124EaD6DABd7C5F3893E2A244280fE5b19#code) | verified |

Deployer / `DEFAULT_ADMIN_ROLE` / `SETTLER_ROLE`:
`0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827` (project EOA, v1 testnet
only — mainnet must be a multisig per `contracts/AUDIT.md`).

Initial deploy state: project wallet held 900,000 mUSDC after
seeding 100,000 mUSDC into CoverFiPolicy as the payout pool
(PRD §8.2); `qBps = 5000`. The frontend reads the addresses
from `src/lib/contracts/addresses.ts`; `qBps` is read live
from chain per render (admin-tunable via `setQ`).

Run `cd contracts && npm run snapshot` for a read-only chain ↔ DB
diagnostic any time.

**Segment 4 commits:**

```
# Phase B — contracts
9f10a23 feat: contracts — Hardhat 3 project scaffold
2dd125d feat: contracts — MockUSDC faucet token
460e6ab feat: contracts — CoverFiPolicy skeleton
7cdccd4 feat: contracts — buyPolicy and premium quoting
2ecadda feat: contracts — triggerSettlement (three-outcome settlement)
bf14829 feat: contracts — claim and linear release math
6c4bc91 feat: contracts — NatSpec, README and gas/coverage polish

# Phase C — AI security audit
87d1a9b feat: contracts — security audit fixes and rescueToken

# Phase D — BSC Testnet deploy + verification
03624c7 feat: contracts — BSC Testnet deployment modules and scripts
983765a feat: contracts — BscScan verification config
46761c6 fix: exclude contracts/ from root tsconfig
9a8f337 feat: record BSC Testnet contract addresses

# Phase E — frontend wires to chain
8547fb0 feat: frontend — contract ABIs, typed viem access, ABI sync
83d7e89 feat: frontend — bigint pricing helpers mirroring the contract
86a74e6 feat: frontend — real on-chain buyPolicy wiring + migration
41cc6f0 feat: contracts — temporary settlement script
ff64f4c feat: frontend — on-chain claim wiring

# Phase F — Void copy + chain-read consistency
8740cb0 fix: frontend — Void policies were displayed as if premium was kept
dd4f285 fix: /policies — three Phase F-3 follow-ups
cb70df5 fix: /policies — PolicyRow + ReleaseBlock chain reads (F3 cleanup)

# Phase G — docs + small polish
f6b83e4 chore: polish — list-row decimal alignment + snapshot script + root readme
```

**Segment 3 commits (5 steps — database):**

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

**Next: Segment 5 — Signa adapter.** Replace `lib/mock/orders.ts`
with real Signa-sourced orders behind the adapter interface stubbed
in PRD §7.1, then migrate `SETTLER_ROLE` from the project EOA to a
Signa-aware adapter contract (no code change on CoverFiPolicy —
just `grantRole` / `revokeRole`). The `markets` table (PRD §5.1)
likely lands here too. See §8 for the full handoff.

### Deployment

Live at **https://cover-fi.vercel.app** (verified: pages render and
Supabase reads/writes work in production).

- **Host:** Vercel project connected to this GitHub repo.
- **Auto-deploy:** every push to `main` triggers a Production
  rebuild; PR branches get Preview deploys.
- **Env vars (set in Vercel project settings, scoped to Production
  + Preview):**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

  These mirror local `.env.local` exactly — both are public-safe
  (RLS gates real access). Service-role keys, if ever introduced,
  must stay server-only and unprefixed.
- **Build command / output:** Next.js defaults (`next build`,
  `.next/`). No custom Vercel config file in repo.

### Where each piece lives (post-Segment-4)

| Piece                            | Source of truth                                                                       |
|----------------------------------|---------------------------------------------------------------------------------------|
| Policy create (mint)             | **Chain** (`CoverFiPolicy.buyPolicy`) → frontend optimistic-writes the DB mirror.     |
| Policy claim                     | **Chain** (`CoverFiPolicy.claim`) → frontend writes the DB mirror after tx confirms.  |
| Policy settlement (Miss/Hit/Void)| **Chain** (`CoverFiPolicy.triggerSettlement`) via `contracts/scripts/settle.ts` (project EOA holds `SETTLER_ROLE`); the same script writes the DB mirror. Segment 5 replaces with a Signa-adapter contract. |
| Policy list page (status / static fields) | DB (`listPoliciesByOwner`).                                                  |
| Policy list page (per-row released / claimable on `paying` rows) | **Chain** — `PolicyRow` runs `useReadContract` per row for `releasedOf(id)` + `claimableOf(id)`. |
| Policy detail page (status / released / claimable / claimed) | **Chain** via three `useReadContract` hooks against `policies(id)` + `releasedOf(id)` + `claimableOf(id)`. DB is consulted for static fields only (principal, owner, market text). |
| Policy overview header (released / claimable totals) | **Chain** via batched `useReadContracts` across all releasing/completed policies. DB for the static three cards. |
| User USDC balance                | **Chain** via `useReadContract(MockUSDC.balanceOf)`.                                  |
| Activity feed                    | Hidden — `useSimulationStore.activities` initialised `[]`; on-chain event indexer is deferred (PRD §5.3 / see §9). |
| Markets / Signa orders           | Still seed (`lib/mock/orders.ts`) — Segment 5.                                        |
| Wallet connection                | Real wagmi (BSC Testnet, MetaMask injected).                                          |

DB is **the index mirror** for chain state — sufficient for fast list
queries and offline reads, refreshed by the same code path that wrote
chain (mint / claim / settle scripts). No automatic event indexer
yet; if the mirror diverges, `npm run snapshot` from `contracts/`
prints chain ↔ DB side by side.

End-to-end happy path: connect wallet → browse seeded Signa orders →
review (live `qBps` from chain + bigint premium quote) → approve
USDC → buyPolicy → policy minted on chain → frontend inserts DB
mirror row → detail page reads chain for live status + released +
claimable → claim → DB row updated. Settle is offline:
`node scripts/settle.ts --policy <id> --outcome miss|hit|void` from
`contracts/` advances the lifecycle and syncs the DB.

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
- **Chain is the source of truth, DB is the mirror.** Mint, claim,
  and settlement all run real BSC Testnet transactions. The
  Supabase `policies` table is an index of those events, kept in
  sync by the same code path that wrote the chain side (frontend
  optimistic-writes for mint/claim; `settle.ts` for settlement).
  Working conventions that follow from this:
  - Never mutate the DB mirror before the matching chain tx
    confirms; on chain failure the DB stays untouched.
  - For released / claimable amounts on /policies and the detail
    page, read live from the contract via `useReadContract` —
    they're time-derived (per-second accrual) and any
    `Math.floor(days)` approximation underreports. List page can
    rely on DB `status`; the detail page reads even `status` from
    chain (`policies(id).status`) for full freshness.
  - Money math uses `bigint` wei and bps integer arithmetic
    (`src/lib/pricing.bigint.ts`); the legacy float helpers in
    `src/lib/pricing.ts` remain only because the dead
    `useSimulationStore.claimPolicy / claimAll` actions still
    import them. See §9 for the cleanup TODO.
  - New DB fields need a migration under `supabase/migrations/`
    AND the matching update in `supabase/schema.sql` (single
    source of truth for fresh deploys).
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
- **Commit messages.** The user provides the commit message;
  conventional-commit style with a scope —
  `feat: <scope> — <short label>`, `fix: <scope> — …`,
  `chore: …`, `docs: …`. (Early Segment 2 commits used a
  `feat: step N — …` format tied to that segment's 11-step plan;
  current segments don't have numbered steps so the convention
  dropped the "step N" prefix.) Co-Authored-By trailer added by
  Claude Code. Push to `main` only after the user explicitly asks.

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
                             (orders still seed-only — Segment 5 replaces;
                             `policies.ts` type defs are still load-bearing —
                             actual policy rows come from Supabase mirror of
                             chain; `activity.ts` seed is no longer loaded
                             into the store — see §9 deferred work)
    db/
      policies.ts            Supabase data-access layer: insertPolicy(),
                             listPoliciesByOwner(), getPolicyById(),
                             updatePolicyClaim() + DB-row → Policy mapper
                             (numeric → number, chain_policy_id → bigint,
                             timestamptz → days-ago, tx_hash passthrough).
                             All writes lowercase the wallet address; reads
                             scope by owner_address; updatePolicyClaim
                             scoped by chain_policy_id.
    contracts/
      abi/                   AUTOGENERATED `as const` ABI exports
                             (MockUSDC.ts, CoverFiPolicy.ts).
                             Refresh via `node contracts/scripts/sync-abi.mjs`.
      addresses.ts           Chain-id → deployed-address map; `getContractAddresses()`
                             helper. Currently BSC Testnet (97) only.
      index.ts               Typed viem `getContract` factories +
                             `orderHashOf(orderId)` / `optionHashOf(label)` /
                             `formatPolicyId(chainPolicyId)` helpers.
      errors.ts              wagmi/viem error classifiers: `isUserRejection(e)`,
                             `revertedWith(e) → string | null`.
    config.ts                Q_DEFAULT, F, RELEASE_DAYS, getPricingQ() async stub
                             (legacy — `qBps` is now read live from chain).
    pricing.ts               kOf, premiumOf, releasedOf, claimableOf, bucketOf
                             (float helpers — `releasedOf`/`claimableOf` are
                             dead in UI paths after Phase F, kept only because
                             retired `simulation.ts` actions still import. §9 cleanup).
    pricing.bigint.ts        Strict 1:1 mirror of CoverFiPolicy.sol's integer
                             math — `premiumOf({principal, kBps, qBps})`,
                             `releasedOf({...})`, `claimableOf({...})`.
                             Used by the review page's bigint quote path.
    pricing.bigint.test.ts   24 deterministic unit tests via Node's built-in
                             `node:test`. Run: `node --test src/lib/pricing.bigint.test.ts`.
    wagmi.ts                 BSC Testnet + injected() config
    supabase.ts              Singleton Supabase client (browser SDK only —
                             no @supabase/ssr; identity is the wallet
                             address, not Supabase Auth)
    format.ts                shortAddress, money, pct

public/wallets/metamask.svg   official MetaMask fox SVG (used in picker)

supabase/
  schema.sql                  Single source of truth for the DB schema —
                              `policies` table (PRD §5.2), CHECK constraints,
                              owner_address index, chain_policy_id unique,
                              tx_hash NOT NULL, demo-phase RLS policies.
                              Apply via the Supabase SQL editor for fresh deploys.
  migrations/
    0001_chain_link.sql       Migration on top of baseline: truncate + add
                              `tx_hash` + `chain_policy_id` columns + the
                              unique constraint. Ran once via Supabase
                              SQL editor at E3.

contracts/                    Standalone Hardhat 3 subproject — CoverFiPolicy
                              + MockUSDC. Self-contained npm project (its
                              own `package.json`, `node_modules`, `.env`).
                              See `contracts/README.md` for toolchain,
                              local commands, deployment + verify scripts,
                              and `contracts/AUDIT.md` for the AI security
                              review and accepted v1 limitations.
                              `contracts/scripts/snapshot.ts` is the
                              chain↔DB diagnostic — `npm run snapshot`.

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
- The simulation store is in **partial retirement**. The
  `markInsured(orderId)` action is still load-bearing — /insurance
  uses `insuredOrderIds` to hide just-bought orders within the
  session. The other action slices (`mintPolicy` / `claimPolicy` /
  `claimAll` + `balance` + `activities` + `nextPolicyCounter`) are
  all dead after Phase E (no callers); they still exist because the
  refactor to gut them is its own task — tracked in §9.
- Mint flow today: review page → `coverFi.approve` → `coverFi.buyPolicy`
  → wait receipt → parse `PolicyMinted` event → `insertPolicy()`
  (DB mirror) → `markInsured(orderId)` (in-session hide).
- Claim flow today: detail page → `coverFi.claim(chainPolicyId)` →
  wait receipt → refetch chain reads → `updatePolicyClaim({
  chainPolicyId, claimedWei, status })` (DB mirror with fresh chain
  values).
- Settle flow today: `contracts/scripts/settle.ts --policy <id>
  --outcome miss|hit|void` from a settler-keyed CLI (project EOA);
  the script also writes the DB mirror. Segment 5 retires this in
  favour of an on-chain Signa adapter.
- `globals.css` is large but organised top-to-bottom by feature.
  Search for the section comment (e.g. `/* === Portfolio ... */`)
  before adding new CSS. Always honor the "one @media block per
  breakpoint" rule.

## 8. Remaining segments

Per PRD §10, the broader v1 scope still has these segments ahead.
Segments 2 (frontend), 3 (database), 4 (smart contracts) — all
done; see §5.

- **Segment 5 — Signa adapter (next).** PRD §7. Once Signa testnet
  documentation lands, two parallel tracks:
  - Frontend / data: replace `lib/mock/orders.ts` with real
    Signa-sourced orders behind the `SignaAdapter` interface
    stubbed in PRD §7.1; add the `markets` whitelist table
    (PRD §5.1) and migrate the denormalised bilingual
    market/option columns on `policies` to a proper FK.
  - Contracts: write a `SignaAdapter.sol` that reads Signa
    settlement state and calls `CoverFiPolicy.triggerSettlement`.
    Migrate the role with `grantRole(SETTLER_ROLE, signaAdapter)`
    + `revokeRole(SETTLER_ROLE, projectEOA)` — **CoverFiPolicy
    itself doesn't change**. `contracts/scripts/settle.ts`
    retires at this point.
- **Segment 6 — Admin backend** (PRD §4A). Dedicated `/admin/*`
  routes for tuning `Q` and managing the market whitelist; plus
  a `config` table per PRD §4A.5. `lib/config.ts` exposes
  `getPricingQ()` as an async stub — currently a no-op fallback
  since `qBps` is read directly from the chain, but the admin
  backend can drive that read off a hybrid (chain truth +
  mirrored audit log).

### Segment 4 → Segment 5 handoff

**What Segment 4 delivered:**
- `CoverFiPolicy.sol` + `MockUSDC.sol` deployed and verified on BSC
  Testnet (addresses in §5).
- Three real on-chain policies exercised end-to-end: policy 1
  Releasing (Miss settled, partially claimed), policy 2 Hit, policy 3
  Void (premium refund auto-fired).
- Frontend mint / claim / status / balance all read & write the
  chain; DB is the index mirror, kept in sync by the same code paths.
- AI security audit (`contracts/AUDIT.md`) — High items all fixed
  or accepted-with-mitigation; QUOTER_ROLE placeholder + multisig
  requirement noted for pre-mainnet.
- `settle.ts` script holds `SETTLER_ROLE` via the project EOA —
  the role hook Segment 5 needs.

**What Segment 5 starts from:**
1. Get Signa testnet contract addresses + developer docs (PRD §7.2
   open items — none answered yet).
2. Write `SignaAdapter.sol`: minimal facade implementing PRD §7.1's
   `getOrdersByAddress` / `getOrderById` / `getMarketSettlement`,
   either as on-chain reads against Signa or off-chain via a backend
   service the adapter trusts. Add the corresponding
   `triggerSettlement` call when Signa emits a settlement event the
   adapter is listening to.
3. Frontend: swap `lib/mock/orders.ts` → `lib/signa.ts` (calls
   adapter); update `InsuranceList` / `OrderCard` / `ReviewPage`
   accordingly. `orderHashOf()` already abstracts the on-chain
   identifier — only the upstream id format changes.
4. Add `markets` table per PRD §5.1; migrate `policies.{category_en,
   category_zh, market_en, market_zh, option_en, option_zh}` to a
   `market_id` FK (with a backfill step for the three existing
   policies).
5. Role migration: `coverFi.grantRole(SETTLER_ROLE, signaAdapter)`
   then `coverFi.revokeRole(SETTLER_ROLE, projectEOA)`. Delete
   `contracts/scripts/settle.ts` and the `SUPABASE_URL` /
   `SUPABASE_PUBLISHABLE_KEY` env vars in `contracts/.env` (no
   longer needed once the script is gone).

**Pre-mainnet items NOT in Segment 5 scope but tracked:**
- `QUOTER_ROLE` signed-quote upgrade (the `kBps` trust-the-caller
  acceptance from `contracts/AUDIT.md`).
- Mainnet `DEFAULT_ADMIN_ROLE` → multisig + timelock.
- Professional security audit (current is AI-only).
- Solvency mechanism (currently project-pre-funded payout pool).

## 9. Deferred TODOs

Concrete cleanup / hardening items deliberately deferred past
Segment 4 — listed here so they don't get lost when sessions roll
over.

- **Event-indexer for activities table.** PRD §5.3 reserves an
  `activities` table; today `useSimulationStore.activities` is
  initialised `[]` and the /policies "Recent activity" panel is
  hidden via the existing length-guard. Wire a Supabase Edge
  Function or Vercel cron to subscribe to `PolicyMinted` /
  `PolicySettled` / `PolicyRefunded` / `PolicyClaimed` and insert
  rows; flip the panel back on with `ActivityFeed` reading from DB.
- **Retire `useSimulationStore` dead methods.** `claimPolicy` /
  `claimAll` / `mintPolicy` actions + `balance` / `activities` /
  `nextPolicyCounter` / in-memory `policies` slice — all unreachable
  after Phase E. Removing them lets `lib/pricing.ts`'s float
  `releasedOf` / `claimableOf` go too (their only remaining
  importers). Keep `markInsured` + `insuredOrderIds` — still used
  by /insurance to hide just-bought orders within a session.
- **Batch `Claim All`.** Currently disabled with an inline hint
  ("open each policy to claim individually"). Needs either a new
  `CoverFiPolicy.claimMultiple(uint256[])` method (contract upgrade
  + re-deploy + re-verify) or a Multicall3 integration on the
  frontend. Defer until user demand is clear.
- **Curve x-axis cap precision.** `ReleaseCurve` uses
  `policy.settledDaysAgo` (integer days from the DB row) for its
  cap position, while the relrow below it shows live chain values
  with full precision. Visual mismatch within the first 24h. Fix
  by deriving a fractional cap from the chain `released / principal`
  ratio or by piping `releasedWei` directly into ReleaseCurve.
- **`mintedDaysAgo` / `voidedDaysAgo` precision.** `rowToPolicy`
  still uses `Math.floor` days; only the StatusTimeline detail
  text consumes them. Low impact, low priority — bundle with the
  ReleaseCurve fix if you're already in there.
- **kBps signed-quote model.** Pre-mainnet hardening (audit High
  finding). Activate `QUOTER_ROLE`; require a quote signature in
  `buyPolicy`. Contract upgrade — needs new deploy + re-audit.
