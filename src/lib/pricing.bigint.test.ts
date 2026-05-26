/**
 * Determinism tests for pricing.bigint.ts — every expected value is
 * derived independently from PRD §3.2 / §3.3, NOT from the function
 * under test. Numbers are deliberately the same anchors used in the
 * Solidity tests (B3 / B5) so any contract-vs-frontend math drift
 * surfaces here too.
 *
 * Run with:  node --test src/lib/pricing.bigint.test.ts
 * (Node 24+ runs TS directly; no extra deps required.)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BPS_DENOMINATOR,
  F_BPS,
  RELEASE_PERIOD_SECONDS,
  claimableOf,
  premiumOf,
  releasedOf,
} from "./pricing.bigint.ts";

/** USDC base unit at 6 decimals — `USDC(1000n)` → 1_000_000_000n. */
const USDC = (n: bigint): bigint => n * 1_000_000n;

const Q = 5000n; // PRD default Q = 0.5
const PRINCIPAL = USDC(1000n); // 1000 USDC

describe("constants mirror the contract", () => {
  it("BPS_DENOMINATOR = 10_000", () => {
    assert.equal(BPS_DENOMINATOR, 10_000n);
  });
  it("F_BPS = 500 (5% floor)", () => {
    assert.equal(F_BPS, 500n);
  });
  it("RELEASE_PERIOD_SECONDS = 365 days in seconds", () => {
    assert.equal(RELEASE_PERIOD_SECONDS, 31_536_000n);
  });
});

describe("premiumOf — PRD §3.2 (Q=0.5, a=1000 USDC, F=0.05)", () => {
  it("k=0.41 → base=295, floor=50, premium=295 (base wins)", () => {
    const r = premiumOf({ principal: PRINCIPAL, kBps: 4100n, qBps: Q });
    assert.equal(r.base, USDC(295n));
    assert.equal(r.floor, USDC(50n));
    assert.equal(r.premium, USDC(295n));
  });

  it("k=0.95 → base=25, floor=50, premium=50 (floor wins)", () => {
    const r = premiumOf({ principal: PRINCIPAL, kBps: 9500n, qBps: Q });
    assert.equal(r.base, USDC(25n));
    assert.equal(r.floor, USDC(50n));
    assert.equal(r.premium, USDC(50n));
  });

  it("k=0 boundary → base=500, premium=500 (= Q × a)", () => {
    const r = premiumOf({ principal: PRINCIPAL, kBps: 0n, qBps: Q });
    assert.equal(r.base, USDC(500n));
    assert.equal(r.premium, USDC(500n));
  });

  it("k=10000 boundary → base=0, premium=50 (floor)", () => {
    const r = premiumOf({ principal: PRINCIPAL, kBps: 10_000n, qBps: Q });
    assert.equal(r.base, 0n);
    assert.equal(r.floor, USDC(50n));
    assert.equal(r.premium, USDC(50n));
  });

  it("rejects principal = 0", () => {
    assert.throws(
      () => premiumOf({ principal: 0n, kBps: 4100n, qBps: Q }),
      /InvalidPrincipal|principal must be > 0/,
    );
  });

  it("rejects kBps > 10_000", () => {
    assert.throws(
      () => premiumOf({ principal: PRINCIPAL, kBps: 10_001n, qBps: Q }),
      /InvalidKBps|kBps must be/,
    );
  });

  it("rejects qBps out of (0, 10_000]", () => {
    assert.throws(
      () => premiumOf({ principal: PRINCIPAL, kBps: 4100n, qBps: 0n }),
      /InvalidQBps|qBps must be/,
    );
    assert.throws(
      () => premiumOf({ principal: PRINCIPAL, kBps: 4100n, qBps: 10_001n }),
      /InvalidQBps|qBps must be/,
    );
  });
});

describe("releasedOf — PRD §3.3 (a=1000 USDC, period=365d)", () => {
  const SETTLED_AT = 1_700_000_000n; // arbitrary anchor

  it("elapsed=0 → 0", () => {
    const r = releasedOf({
      status: "releasing",
      principal: PRINCIPAL,
      settledAt: SETTLED_AT,
      nowSeconds: SETTLED_AT,
    });
    assert.equal(r, 0n);
  });

  it("elapsed=period/2 → 500 USDC (1e9 × 15_768_000 / 31_536_000 = 5e8)", () => {
    const r = releasedOf({
      status: "releasing",
      principal: PRINCIPAL,
      settledAt: SETTLED_AT,
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS / 2n,
    });
    assert.equal(r, USDC(500n));
  });

  it("elapsed=period → 1000 USDC (cap)", () => {
    const r = releasedOf({
      status: "releasing",
      principal: PRINCIPAL,
      settledAt: SETTLED_AT,
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS,
    });
    assert.equal(r, PRINCIPAL);
  });

  it("elapsed=period×2 → still 1000 USDC (still capped)", () => {
    const r = releasedOf({
      status: "releasing",
      principal: PRINCIPAL,
      settledAt: SETTLED_AT,
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS * 2n,
    });
    assert.equal(r, PRINCIPAL);
  });

  it("status=Completed at full period → principal (matches contract)", () => {
    const r = releasedOf({
      status: "completed",
      principal: PRINCIPAL,
      settledAt: SETTLED_AT,
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS,
    });
    assert.equal(r, PRINCIPAL);
  });

  it("status=Active → 0 regardless of elapsed", () => {
    const r = releasedOf({
      status: "active",
      principal: PRINCIPAL,
      settledAt: SETTLED_AT,
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS,
    });
    assert.equal(r, 0n);
  });

  it("status=Hit → 0", () => {
    const r = releasedOf({
      status: "hit",
      principal: PRINCIPAL,
      settledAt: SETTLED_AT,
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS,
    });
    assert.equal(r, 0n);
  });

  it("status=Void → 0", () => {
    const r = releasedOf({
      status: "void",
      principal: PRINCIPAL,
      settledAt: SETTLED_AT,
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS,
    });
    assert.equal(r, 0n);
  });

  it("nowSeconds in the past (clock skew) → 0, no underflow", () => {
    const r = releasedOf({
      status: "releasing",
      principal: PRINCIPAL,
      settledAt: SETTLED_AT,
      nowSeconds: SETTLED_AT - 10n,
    });
    assert.equal(r, 0n);
  });
});

describe("claimableOf — released − claimed, clamped at 0", () => {
  const SETTLED_AT = 1_700_000_000n;
  const base = {
    status: "releasing" as const,
    principal: PRINCIPAL,
    settledAt: SETTLED_AT,
  };

  it("nothing claimed at 50% → claimable = 500 USDC", () => {
    const c = claimableOf({
      ...base,
      claimed: 0n,
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS / 2n,
    });
    assert.equal(c, USDC(500n));
  });

  it("already claimed full 50% at 50% → claimable = 0", () => {
    const c = claimableOf({
      ...base,
      claimed: USDC(500n),
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS / 2n,
    });
    assert.equal(c, 0n);
  });

  it("claimed 500 at 100% → claimable = 500 (the remaining half)", () => {
    const c = claimableOf({
      ...base,
      claimed: USDC(500n),
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS,
    });
    assert.equal(c, USDC(500n));
  });

  it("claimed full principal at 100% → claimable = 0", () => {
    const c = claimableOf({
      ...base,
      claimed: PRINCIPAL,
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS,
    });
    assert.equal(c, 0n);
  });

  it("claimed > released (defensive) → 0, no underflow", () => {
    const c = claimableOf({
      ...base,
      claimed: USDC(999n), // way more than 50% released
      nowSeconds: SETTLED_AT + RELEASE_PERIOD_SECONDS / 2n,
    });
    assert.equal(c, 0n);
  });
});
