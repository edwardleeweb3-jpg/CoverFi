-- ============================================================
-- CoverFi — Supabase schema
-- Segment 3 / Step 2: `policies` table.
--
-- Designed to 1:1 carry the current frontend `Policy` interface
-- (src/lib/mock/policies.ts). Source-of-truth references:
--   PRD §2.2  status terms       (must not be reworded)
--   PRD §3.2  premium / k        (k frozen at mint)
--   PRD §3.3  linear release     (claimed accumulates)
--   PRD §5.2  documented schema  (this table extends it slightly:
--             bilingual market/option text are denormalised here for
--             the simulation phase — they'll move to a `markets` FK
--             once the whitelist table lands in a later step)
--
-- NOT yet included (deferred to later DB steps with a clear trigger):
--   - market_id FK        → arrives with the `markets` whitelist table
--   - tx_hash             → arrives with real on-chain mint integration
--   - `markets` table     → next DB step
--   - `activities` table  → DB step after that
-- ============================================================

-- ----------------------------------------------------------------
-- Amount-column type choice — IMPORTANT
-- ----------------------------------------------------------------
-- All monetary columns (`principal`, `premium`, `claimed`) and the
-- probability snapshot (`k_snapshot`) use `numeric(p, s)` rather than
-- `double precision` or `bigint`. Reasons:
--
--   1. PRD §3.2 explicitly forbids floating-point for money — float
--      drift would corrupt audit trails over time.
--   2. The frontend currently uses plain JS `number` (USDC, not wei)
--      — see CLAUDE.md §6 "Simulation, not contracts". `numeric`
--      round-trips cleanly: write a JS number → store exact decimal
--      → read back a string → `Number(s)` at the data-access layer.
--   3. When real contracts wire up (CLAUDE.md §8), these columns
--      will migrate to `numeric(78, 0)` holding wei as integer
--      strings — `numeric` -> `numeric` is a non-breaking width
--      change; the column name stays the same.
--
-- supabase-js gotcha: `numeric` is returned as STRING (the driver
-- refuses to lossy-convert to JS number for arbitrary-precision
-- decimals). Every read path must do `Number(row.principal)` etc.
-- We'll centralise that in a `lib/db/policies.ts` mapper next step.
-- ----------------------------------------------------------------

create table if not exists policies (
  -- Policy number, e.g. "CF-00231". Human-readable, app-assigned
  -- (current mock uses a monotonic counter; real flow will derive
  -- this from the on-chain mint event).
  id              text primary key,

  -- Investor's wallet address. Stored lowercase (the check below
  -- enforces it) so a plain b-tree index can answer "my policies"
  -- queries without `lower()` at read time.
  owner_address   text not null
                  check (owner_address = lower(owner_address)),

  -- Linked Signa order, e.g. "SGA-7611". One order → at most one
  -- policy (PRD §3.1), enforced by the unique constraint below.
  signa_order_id  text not null unique,

  -- Market info — bilingual, denormalised here for the simulation
  -- phase. Moves to a `markets` FK once that table exists.
  category_en     text not null,
  category_zh     text not null,
  market_en       text not null,
  market_zh       text not null,

  -- Insured option (bilingual label). Kept as plain text — future
  -- multi-option markets may go beyond Yes/No, so no check here.
  option_en       text not null,
  option_zh       text not null,

  -- Principal `a` (USDC). > 0.
  principal       numeric(20, 6) not null check (principal > 0),

  -- Implied probability snapshot at mint time (PRD §3.2). 0..1.
  k_snapshot      numeric(10, 6) not null
                  check (k_snapshot >= 0 and k_snapshot <= 1),

  -- Premium paid at mint (USDC). Locked snapshot. > 0.
  premium         numeric(20, 6) not null check (premium > 0),

  -- Cumulative amount the investor has already claimed (USDC).
  -- Monotonically increasing; cannot exceed principal.
  claimed         numeric(20, 6) not null default 0
                  check (claimed >= 0 and claimed <= principal),

  -- Lifecycle status (PRD §2.2 — the 5 unified terms). Text + check
  -- rather than a PG enum, so adding/renaming values later is a
  -- one-line alter instead of a type migration.
  status          text not null
                  check (status in (
                    'active',     -- coverage active, pre-settlement
                    'releasing',  -- paying out, linear release in progress
                    'completed',  -- reimbursed in full (terminal)
                    'hit',        -- option won; premium retained (terminal)
                    'void'        -- market voided; premium refundable (terminal)
                  )),

  -- Timestamps — replace the mock's `mintedDaysAgo` /
  -- `settledDaysAgo` / `voidedDaysAgo` relative-day fields. Days
  -- since X are computed at read time from these. All `timestamptz`
  -- so timezones don't bite us.
  created_at      timestamptz not null default now(),
  settled_at      timestamptz,   -- set when status moves to releasing/completed/hit
  voided_at       timestamptz    -- set when status moves to void
);

-- Primary query path: "give me wallet X's policies".
create index if not exists policies_owner_address_idx
  on policies (owner_address);

-- ----------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------
-- DEMO-PHASE policy: anon can do everything on this table.
--
-- Rationale: in the current segment there is no Supabase Auth, no
-- real money, and identity is the wallet address. The DB can't
-- verify wallet ownership on its own — that requires a signed
-- nonce verified inside a server-side API route (which is on the
-- roadmap, not this step). Until then, the table is intentionally
-- open from the publishable key.
--
-- BEFORE PRODUCTION: replace these policies with ones that gate
-- writes on a verified-address claim (e.g. a JWT issued by our
-- API after checking a SIWE-style signature) and lock reads to
-- the matching `owner_address`. Tracked in CLAUDE.md §8.
-- ----------------------------------------------------------------

alter table policies enable row level security;

create policy policies_demo_select
  on policies for select
  to anon
  using (true);

create policy policies_demo_insert
  on policies for insert
  to anon
  with check (true);

create policy policies_demo_update
  on policies for update
  to anon
  using (true)
  with check (true);
