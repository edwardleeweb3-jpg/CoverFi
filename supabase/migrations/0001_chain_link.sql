-- ============================================================
-- Migration 0001 — chain link
-- Applied: on top of the baseline supabase/schema.sql
-- Purpose: prepare the `policies` table for on-chain backing.
-- ============================================================
--
-- Adds two new columns to record where a policy lives on-chain:
--
--   tx_hash          (text, NOT NULL) — the buyPolicy() tx hash,
--                                       for BscScan deep-links and
--                                       future event re-indexing.
--   chain_policy_id  (numeric, NOT NULL, unique) — the uint256 policy
--                                        id emitted by PolicyMinted.
--                                        Numeric (not bigint) because
--                                        Postgres bigint is signed
--                                        64-bit and uint256 doesn't
--                                        fit; numeric handles arbitrary
--                                        precision.
--
-- Both NEW columns are NOT NULL — every policy from E3 onward is
-- backed by an on-chain mint, so both fields are always populated by
-- `insertPolicy()`. The truncate above empties the table first, so
-- the NOT NULL alter has nothing to backfill.
--
-- The human-readable `id` column (text PK, e.g. "CF-0000232") stays as
-- it is — it's derived by zero-padding `chain_policy_id` in the
-- frontend (`formatPolicyId()`), so the two columns are 1:1.
--
-- TRUNCATE wipes the demo rows from B3 that have no on-chain backing
-- (their CF-00xxx ids were minted before contracts existed and the
-- DB schema didn't know about chain_policy_id at all). Per decision
-- in the E3 plan: "Q3 = (α) clean start".
--
-- ============================================================
-- IMPORTANT — RUN ORDER
-- ============================================================
-- 1. TRUNCATE first (no rows to migrate).
-- 2. ALTER to add columns.
-- 3. UNIQUE constraint after the ALTER (no NULL chain_policy_ids
--    can exist because table is empty).
-- ============================================================

truncate table policies;

alter table policies
  add column tx_hash text not null;

alter table policies
  add column chain_policy_id numeric not null;

-- One row per on-chain mint.
alter table policies
  add constraint policies_chain_policy_id_key unique (chain_policy_id);

-- Plain b-tree index isn't needed on top of the unique constraint
-- (it creates one implicitly) but worth noting that owner-scoped
-- queries still go through `policies_owner_address_idx`.
