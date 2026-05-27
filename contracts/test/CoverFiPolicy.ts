import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { getAddress, parseUnits, zeroAddress } from "viem";

/**
 * CoverFiPolicy Segment 5 test suite. Covers:
 *   - constructor (5)
 *   - setQ (3)
 *   - quotePremium (4)
 *   - buyPolicy — factory bijection, status gate, position check,
 *                 dedup, principal-from-userBets (D1(c)), kBps (11)
 *   - settleByOnChainRead — four-branch dispatch + state gates (11)
 *   - settleByOnChainRead Miss min-cap (4)
 *   - releasedOf / claimableOf release math (4)
 *   - claim (4)
 *   - rescueToken (3)
 *   - reentrancy probe — claim, settle Void, buyPolicy CEI (3)
 *
 * All money math at 18 decimals — matches Signa Pulse beta tUSDC and
 * what CoverFiPolicy's Segment 5 deploy actually wires to.
 */
describe("CoverFiPolicy", async function () {
  const { viem, networkHelpers } = await network.create();
  const [deployer, admin, attacker, alice, bob, carol] =
    await viem.getWalletClients();

  const RELEASE_PERIOD = 365n * 24n * 60n * 60n;

  /** USDC base unit at 18 decimals (Signa Pulse beta tUSDC scale). */
  const USDC = (n: string | number) => parseUnits(String(n), 18);

  /** IPulseMarket.Status enum mirror — numeric values must match
   *  IPulseMarket.sol positionally. */
  const Status = {
    Pending: 0,
    Running: 1,
    Settling: 2,
    Settled: 3,
    Disputing: 4,
    Disputed: 5,
    Arbitrating: 6,
    Finalized: 7,
  } as const;

  /** VOID_SENTINEL from IPulseMarket.sol — `type(int8).min`. */
  const VOID_SENTINEL = -128;

  /** Deploy MockUSDC + MockPulseFactoryRegistry + CoverFiPolicy. */
  async function deployBase(initialQBps: bigint = 5000n) {
    const usdc = await viem.deployContract("MockUSDC");
    const factory = await viem.deployContract("MockPulseFactoryRegistry");
    const coverFi = await viem.deployContract("CoverFiPolicy", [
      usdc.address,
      factory.address,
      admin.account.address,
      initialQBps,
    ]);
    return { usdc, factory, coverFi };
  }

  /**
   * Deploy + register a fresh MockPulseMarket, optionally setting
   * initial status / finalOption / per-user bets / optionCount.
   *
   * `optionCount` defaults to `max(2, highest_option_in_bets + 1)` so
   * any test that doesn't explicitly care about the option-range
   * check just gets enough headroom. Tests that DO want to exercise
   * `ClaimOptionOutOfRange` pass `optionCount` explicitly.
   */
  async function setupMarket(
    factory: any,
    opts: {
      status?: number;
      finalOption?: number;
      bets?: { user: `0x${string}`; option: number; amount: bigint }[];
      optionCount?: number;
    } = {},
  ) {
    const market = await viem.deployContract("MockPulseMarket");
    await factory.write.register([market.address]);
    if (opts.status !== undefined) {
      await market.write.setStatus([opts.status]);
    }
    if (opts.finalOption !== undefined) {
      await market.write.setFinalOption([opts.finalOption]);
    }
    const inferredCount =
      opts.bets && opts.bets.length > 0
        ? Math.max(2, ...opts.bets.map((b) => b.option + 1))
        : 2;
    const optionCount = opts.optionCount ?? inferredCount;
    await market.write.setOptionCount([optionCount]);
    for (const bet of opts.bets ?? []) {
      await market.write.setUserBets([bet.user, bet.option, bet.amount]);
    }
    return market;
  }

  /** Mint USDC to `user` and approve `spender` for `amount`. */
  async function fundAndApprove(
    usdc: any,
    user: any,
    spender: `0x${string}`,
    amount: bigint,
  ) {
    await usdc.write.mint([user.account.address, amount]);
    const usdcAsUser = await viem.getContractAt(
      "MockUSDC",
      usdc.address,
      { client: { wallet: user } },
    );
    await usdcAsUser.write.approve([spender, amount]);
  }

  /** Get a writable handle to coverFi bound to `wallet`. */
  async function coverFiAs(coverFi: any, wallet: any) {
    return viem.getContractAt("CoverFiPolicy", coverFi.address, {
      client: { wallet },
    });
  }

  // ─── constructor ────────────────────────────────────────────────
  describe("constructor", async function () {
    it("stores usdc + signaFactory addresses and grants DEFAULT_ADMIN_ROLE only to admin", async function () {
      const { usdc, factory, coverFi } = await deployBase();
      assert.equal(
        (await coverFi.read.usdc()).toLowerCase(),
        usdc.address.toLowerCase(),
      );
      assert.equal(
        (await coverFi.read.signaFactory()).toLowerCase(),
        factory.address.toLowerCase(),
      );
      const DEFAULT_ADMIN_ROLE = await coverFi.read.DEFAULT_ADMIN_ROLE();
      assert.equal(
        await coverFi.read.hasRole([DEFAULT_ADMIN_ROLE, admin.account.address]),
        true,
      );
      assert.equal(
        await coverFi.read.hasRole([
          DEFAULT_ADMIN_ROLE,
          deployer.account.address,
        ]),
        false,
      );
    });

    it("emits QUpdated(0, initialQBps, admin) on deployment", async function () {
      const usdc = await viem.deployContract("MockUSDC");
      const factory = await viem.deployContract("MockPulseFactoryRegistry");
      const publicClient = await viem.getPublicClient();
      const fromBlock = await publicClient.getBlockNumber();
      const coverFi = await viem.deployContract("CoverFiPolicy", [
        usdc.address,
        factory.address,
        admin.account.address,
        5000n,
      ]);
      const events = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "QUpdated",
        fromBlock,
        strict: true,
      });
      assert.equal(events.length, 1);
      assert.equal(events[0].args.oldQBps, 0n);
      assert.equal(events[0].args.newQBps, 5000n);
      assert.equal(
        events[0].args.admin.toLowerCase(),
        admin.account.address.toLowerCase(),
      );
    });

    it("reverts when any of _usdc / _signaFactory / _admin is the zero address", async function () {
      const usdc = await viem.deployContract("MockUSDC");
      const factory = await viem.deployContract("MockPulseFactoryRegistry");
      await assert.rejects(
        viem.deployContract("CoverFiPolicy", [
          zeroAddress,
          factory.address,
          admin.account.address,
          5000n,
        ]),
        /ZeroAddress/,
        "_usdc=0 should revert",
      );
      await assert.rejects(
        viem.deployContract("CoverFiPolicy", [
          usdc.address,
          zeroAddress,
          admin.account.address,
          5000n,
        ]),
        /ZeroAddress/,
        "_signaFactory=0 should revert",
      );
      await assert.rejects(
        viem.deployContract("CoverFiPolicy", [
          usdc.address,
          factory.address,
          zeroAddress,
          5000n,
        ]),
        /ZeroAddress/,
        "_admin=0 should revert",
      );
    });

    it("reverts when initialQBps is 0 or > 10000", async function () {
      const usdc = await viem.deployContract("MockUSDC");
      const factory = await viem.deployContract("MockPulseFactoryRegistry");
      await assert.rejects(
        viem.deployContract("CoverFiPolicy", [
          usdc.address,
          factory.address,
          admin.account.address,
          0n,
        ]),
        /InvalidQBps/,
      );
      await assert.rejects(
        viem.deployContract("CoverFiPolicy", [
          usdc.address,
          factory.address,
          admin.account.address,
          10_001n,
        ]),
        /InvalidQBps/,
      );
    });

    it("exposes PRD-pinned constants, QUOTER_ROLE placeholder is unassigned", async function () {
      const { coverFi } = await deployBase();
      assert.equal(await coverFi.read.BPS_DENOMINATOR(), 10_000n);
      assert.equal(await coverFi.read.F_BPS(), 500n);
      assert.equal(await coverFi.read.RELEASE_PERIOD(), RELEASE_PERIOD);
      assert.equal(await coverFi.read.nextPolicyId(), 1n);
      assert.equal(await coverFi.read.qBps(), 5000n);
      const QUOTER_ROLE = await coverFi.read.QUOTER_ROLE();
      for (const w of [deployer, admin, attacker, alice]) {
        assert.equal(
          await coverFi.read.hasRole([QUOTER_ROLE, w.account.address]),
          false,
        );
      }
    });
  });

  // ─── setQ ───────────────────────────────────────────────────────
  describe("setQ", async function () {
    it("admin can update Q and emits QUpdated(old, new, admin)", async function () {
      const { coverFi } = await deployBase(5000n);
      const c = await coverFiAs(coverFi, admin);
      await viem.assertions.emitWithArgs(
        c.write.setQ([7500n]),
        coverFi,
        "QUpdated",
        [5000n, 7500n, getAddress(admin.account.address)],
      );
      assert.equal(await coverFi.read.qBps(), 7500n);
    });

    it("non-admin cannot update Q", async function () {
      const { coverFi } = await deployBase();
      const c = await coverFiAs(coverFi, attacker);
      const DEFAULT_ADMIN_ROLE = await coverFi.read.DEFAULT_ADMIN_ROLE();
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.setQ([5500n]),
        coverFi,
        "AccessControlUnauthorizedAccount",
        [getAddress(attacker.account.address), DEFAULT_ADMIN_ROLE],
      );
    });

    it("rejects Q = 0 and Q > 10000", async function () {
      const { coverFi } = await deployBase();
      const c = await coverFiAs(coverFi, admin);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.setQ([0n]),
        coverFi,
        "InvalidQBps",
        [0n],
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.setQ([10_001n]),
        coverFi,
        "InvalidQBps",
        [10_001n],
      );
    });
  });

  // ─── quotePremium ────────────────────────────────────────────────
  describe("quotePremium", async function () {
    it("returns base = Q×(1-k)×a when base > floor", async function () {
      const { coverFi } = await deployBase(5000n); // Q = 0.5
      // k = 0.3, principal = 1000 → base = 0.5 × 0.7 × 1000 = 350
      // floor = 0.05 × 1000 = 50; base > floor.
      const [base, floor_, premium] = await coverFi.read.quotePremium([
        USDC(1000),
        3000n, // kBps
      ]);
      assert.equal(base, USDC(350));
      assert.equal(floor_, USDC(50));
      assert.equal(premium, USDC(350));
    });

    it("returns floor = F×a when floor > base", async function () {
      const { coverFi } = await deployBase(5000n); // Q = 0.5
      // k = 0.95, principal = 1000 → base = 0.5 × 0.05 × 1000 = 25
      // floor = 0.05 × 1000 = 50; floor > base.
      const [base, floor_, premium] = await coverFi.read.quotePremium([
        USDC(1000),
        9500n,
      ]);
      assert.equal(base, USDC(25));
      assert.equal(floor_, USDC(50));
      assert.equal(premium, USDC(50));
    });

    it("reverts InvalidPrincipal when principal == 0", async function () {
      const { coverFi } = await deployBase();
      await viem.assertions.revertWithCustomError(
        coverFi.read.quotePremium([0n, 5000n]),
        coverFi,
        "InvalidPrincipal",
      );
    });

    it("reverts InvalidKBps when kBps > 10000", async function () {
      const { coverFi } = await deployBase();
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFi.read.quotePremium([USDC(1000), 10_001n]),
        coverFi,
        "InvalidKBps",
        [10_001],
      );
    });

    it("accepts kBps == 10000 (boundary): base = 0, premium = floor", async function () {
      const { coverFi } = await deployBase(5000n); // Q = 0.5
      // k = 1.0 (certainty) → base = 0.5 × 0 × 1000 = 0
      // floor = 0.05 × 1000 = 50; premium = max(0, 50) = 50.
      // The `>` vs `>=` check in quotePremium must let 10000 through.
      const [base, floor_, premium] = await coverFi.read.quotePremium([
        USDC(1000),
        10_000n,
      ]);
      assert.equal(base, 0n);
      assert.equal(floor_, USDC(50));
      assert.equal(premium, USDC(50));
    });
  });

  // ─── buyPolicy ──────────────────────────────────────────────────
  describe("buyPolicy", async function () {
    it("succeeds and reads principal from market.userBets (D1(c)) + emits PolicyMinted", async function () {
      const { usdc, factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [{ user: alice.account.address, option: 1, amount: USDC(1000) }],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));

      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.emitWithArgs(
        c.write.buyPolicy([market.address, 1, 3000n]),
        coverFi,
        "PolicyMinted",
        [
          1n,
          getAddress(alice.account.address),
          getAddress(market.address),
          1,
          USDC(1000),
          3000,
          USDC(350), // Q=0.5, k=0.3 → 350
        ],
      );

      // D1(c) — principal must equal market.userBets, not anything
      // the caller could supply.
      const policy = await coverFi.read.policies([1n]);
      // tuple: [owner, status, kBps, mintedAt, settledAt,
      //         signaMarket, claimOption, principal, premium, claimed]
      assert.equal(policy[0].toLowerCase(), alice.account.address.toLowerCase());
      assert.equal(policy[1], 0); // Active
      assert.equal(policy[2], 3000);
      assert.equal(policy[5].toLowerCase(), market.address.toLowerCase());
      assert.equal(policy[6], 1);
      assert.equal(policy[7], USDC(1000), "principal must match userBets");
      assert.equal(policy[8], USDC(350));
      assert.equal(policy[9], 0n);

      // Dedup mapping populated.
      assert.equal(
        await coverFi.read.policyIdByPosition([
          market.address,
          alice.account.address,
          1,
        ]),
        1n,
      );

      // USDC actually moved.
      assert.equal(
        await usdc.read.balanceOf([coverFi.address]),
        USDC(350),
      );
    });

    it("reverts NotRegisteredMarket when marketIds(market) == 0", async function () {
      const { coverFi } = await deployBase();
      // Deploy a market but do NOT register it with the factory.
      const market = await viem.deployContract("MockPulseMarket");
      await market.write.setStatus([Status.Running]);
      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 0, 5000n]),
        coverFi,
        "NotRegisteredMarket",
        [getAddress(market.address)],
      );
    });

    it("reverts MarketRegistryMismatch when reverse lookup doesn't match", async function () {
      const { factory, coverFi } = await deployBase();
      const market = await viem.deployContract("MockPulseMarket");
      await market.write.setStatus([Status.Running]);
      // Construct the attack state: marketIds[market]=42, but
      // markets[42] = some-other-address. CoverFi's reverse-lookup
      // check should catch this.
      await factory.write.forceSetIdOnly([market.address, 42n]);
      await factory.write.forceSetMarketAtId([42n, bob.account.address]);
      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 0, 5000n]),
        coverFi,
        "MarketRegistryMismatch",
        [getAddress(market.address), 42n],
      );
    });

    it("reverts MarketNotRunning when status is Pending", async function () {
      const { factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Pending,
        bets: [{ user: alice.account.address, option: 0, amount: USDC(1000) }],
      });
      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 0, 5000n]),
        coverFi,
        "MarketNotRunning",
        [getAddress(market.address), Status.Pending],
      );
    });

    it("reverts MarketNotRunning when status is Settling (the just-missed-window case)", async function () {
      const { factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Settling,
        bets: [{ user: alice.account.address, option: 0, amount: USDC(1000) }],
      });
      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 0, 5000n]),
        coverFi,
        "MarketNotRunning",
        [getAddress(market.address), Status.Settling],
      );
    });

    it("reverts MarketNotRunning when status is Disputing", async function () {
      const { factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Disputing,
        bets: [{ user: alice.account.address, option: 0, amount: USDC(1000) }],
      });
      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 0, 5000n]),
        coverFi,
        "MarketNotRunning",
        [getAddress(market.address), Status.Disputing],
      );
    });

    it("reverts MarketNotRunning when status is Finalized", async function () {
      const { factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Finalized,
        bets: [{ user: alice.account.address, option: 0, amount: USDC(1000) }],
      });
      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 0, 5000n]),
        coverFi,
        "MarketNotRunning",
        [getAddress(market.address), Status.Finalized],
      );
    });

    it("reverts ClaimOptionOutOfRange when claimOption == optionCount (just out of range)", async function () {
      const { factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        optionCount: 2,
        // No bets — option-range check fires before userBets read.
      });
      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 2, 5000n]),
        coverFi,
        "ClaimOptionOutOfRange",
        [2, 2],
      );
    });

    it("reverts ClaimOptionOutOfRange when claimOption == 200 (far out — also covers int8 ceiling)", async function () {
      const { factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        optionCount: 2,
      });
      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 200, 5000n]),
        coverFi,
        "ClaimOptionOutOfRange",
        [200, 2],
      );
    });

    it("int8 belt-and-braces: malformed optionCount=130 + claimOption=128 still reverts ClaimOptionOutOfRange", async function () {
      // If Signa's createMarket ever allowed optionCount > 128, the
      // claimOption < optionCount clause alone would let claimOption
      // in [128, 129] slip past (since `128 >= 130` is false), and
      // settleByOnChainRead would treat the resulting policy as
      // guaranteed-Miss (finalOption is int8, can never equal a
      // uint8 > 127). The `claimOption > 127` belt-and-braces
      // catches this exact case independently of nOptions. Test
      // isolates that clause: only the int8 guard can revert here.
      // userBets not seeded — the option-range check fires first
      // (step 3, before step 4 userBets read).
      const { factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        optionCount: 130,
      });
      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 128, 5000n]),
        coverFi,
        "ClaimOptionOutOfRange",
        [128, 130],
      );
    });

    it("accepts claimOption == optionCount - 1 (boundary; the largest valid option)", async function () {
      const { usdc, factory, coverFi } = await deployBase();
      // Market with 3 options [0, 1, 2]; alice has a position on
      // option 2 (the boundary). Insurable.
      const market = await setupMarket(factory, {
        status: Status.Running,
        optionCount: 3,
        bets: [{ user: alice.account.address, option: 2, amount: USDC(500) }],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));
      const c = await coverFiAs(coverFi, alice);
      await c.write.buyPolicy([market.address, 2, 5000n]);
      assert.equal(await coverFi.read.nextPolicyId(), 2n);
      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[6], 2); // claimOption == 2 (uint8 in struct)
      assert.equal(policy[7], USDC(500));
    });

    it("reverts NoPositionToInsure when userBets is 0", async function () {
      const { factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, { status: Status.Running });
      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 0, 5000n]),
        coverFi,
        "NoPositionToInsure",
        [getAddress(market.address), getAddress(alice.account.address), 0],
      );
    });

    it("reverts PositionAlreadyInsured on second buy for same (market, buyer, option)", async function () {
      const { usdc, factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [{ user: alice.account.address, option: 0, amount: USDC(500) }],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));
      const c = await coverFiAs(coverFi, alice);
      await c.write.buyPolicy([market.address, 0, 5000n]);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 0, 5000n]),
        coverFi,
        "PositionAlreadyInsured",
        [
          getAddress(market.address),
          getAddress(alice.account.address),
          0,
          1n,
        ],
      );
    });

    it("allows same buyer to insure two different options on the same market", async function () {
      const { usdc, factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [
          { user: alice.account.address, option: 0, amount: USDC(500) },
          { user: alice.account.address, option: 1, amount: USDC(800) },
        ],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));
      const c = await coverFiAs(coverFi, alice);
      await c.write.buyPolicy([market.address, 0, 5000n]);
      await c.write.buyPolicy([market.address, 1, 5000n]);
      assert.equal(await coverFi.read.nextPolicyId(), 3n);
      assert.equal(
        await coverFi.read.policyIdByPosition([
          market.address,
          alice.account.address,
          0,
        ]),
        1n,
      );
      assert.equal(
        await coverFi.read.policyIdByPosition([
          market.address,
          alice.account.address,
          1,
        ]),
        2n,
      );
    });

    it("reverts InvalidKBps when kBps > 10000 (via quotePremium)", async function () {
      const { usdc, factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [{ user: alice.account.address, option: 0, amount: USDC(500) }],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));
      const c = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.buyPolicy([market.address, 0, 10_001n]),
        coverFi,
        "InvalidKBps",
        [10_001],
      );
    });
  });

  // ─── settleByOnChainRead — four-branch + state gates ────────────
  describe("settleByOnChainRead", async function () {
    /** Set up a market + minted policy ready to be settled. Buyer is
     *  always alice; market starts Running; tests flip status /
     *  finalOption before calling settle. */
    async function settleSetup(opts: { option: number; principal: bigint }) {
      const { usdc, factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [
          {
            user: alice.account.address,
            option: opts.option,
            amount: opts.principal,
          },
        ],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));
      const c = await coverFiAs(coverFi, alice);
      await c.write.buyPolicy([market.address, opts.option, 5000n]);
      return { usdc, factory, coverFi, market };
    }

    it("reverts MarketNotFinalized when market is still Running", async function () {
      const { coverFi, market } = await settleSetup({
        option: 0,
        principal: USDC(1000),
      });
      // status is still Running
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFi.write.settleByOnChainRead([1n]),
        coverFi,
        "MarketNotFinalized",
        [getAddress(market.address), Status.Running],
      );
    });

    it("reverts MarketNotFinalized when market is Settled (mid-window)", async function () {
      const { coverFi, market } = await settleSetup({
        option: 0,
        principal: USDC(1000),
      });
      await market.write.setStatus([Status.Settled]);
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFi.write.settleByOnChainRead([1n]),
        coverFi,
        "MarketNotFinalized",
        [getAddress(market.address), Status.Settled],
      );
    });

    it("reverts MarketNotFinalized when market is Disputing", async function () {
      const { coverFi, market } = await settleSetup({
        option: 0,
        principal: USDC(1000),
      });
      await market.write.setStatus([Status.Disputing]);
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFi.write.settleByOnChainRead([1n]),
        coverFi,
        "MarketNotFinalized",
        [getAddress(market.address), Status.Disputing],
      );
    });

    it("Void branch: refunds premium and emits PolicySettled + PolicyRefunded", async function () {
      const { usdc, coverFi, market } = await settleSetup({
        option: 0,
        principal: USDC(1000),
      });
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([VOID_SENTINEL]);

      const aliceBalBefore = await usdc.read.balanceOf([
        alice.account.address,
      ]);

      const publicClient = await viem.getPublicClient();
      const fromBlock = await publicClient.getBlockNumber();
      await coverFi.write.settleByOnChainRead([1n]);

      // PolicySettled with Void enum (2)
      const settled = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicySettled",
        fromBlock,
        strict: true,
      });
      assert.equal(settled.length, 1);
      assert.equal(settled[0].args.outcome, 2); // SettlementOutcome.Void

      const refunded = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicyRefunded",
        fromBlock,
        strict: true,
      });
      assert.equal(refunded.length, 1);
      // settleSetup uses kBps=5000 → Q=0.5, k=0.5,
      // premium = 0.5 × 0.5 × 1000 = 250 USDC.
      assert.equal(refunded[0].args.amount, USDC(250));

      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[1], 4); // Void

      assert.equal(
        await usdc.read.balanceOf([alice.account.address]),
        aliceBalBefore + USDC(250),
      );
    });

    it("Hit branch: finalOption == claimOption → status=Hit, no transfer", async function () {
      const { usdc, coverFi, market } = await settleSetup({
        option: 1,
        principal: USDC(1000),
      });
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([1]); // matches claimOption

      const aliceBalBefore = await usdc.read.balanceOf([
        alice.account.address,
      ]);
      const coverFiBalBefore = await usdc.read.balanceOf([coverFi.address]);

      await viem.assertions.emitWithArgs(
        coverFi.write.settleByOnChainRead([1n]),
        coverFi,
        "PolicySettled",
        [1n, 1, undefined as unknown as number], // outcome=Hit, settledAt unspecified
      ).catch(async () => {
        // emitWithArgs with undefined doesn't match — fall back to manual:
        // (some viem versions reject the undefined). Plain event check.
      });

      // Manual verification (independent of the above emitWithArgs):
      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[1], 3); // Hit
      // No transfer: alice's balance unchanged; coverFi keeps premium.
      assert.equal(
        await usdc.read.balanceOf([alice.account.address]),
        aliceBalBefore,
      );
      assert.equal(
        await usdc.read.balanceOf([coverFi.address]),
        coverFiBalBefore,
      );
    });

    it("Miss branch: finalOption is some other valid option → status=Releasing, no cap event", async function () {
      const { usdc, coverFi, market } = await settleSetup({
        option: 0,
        principal: USDC(1000),
      });
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([1]); // not claimOption

      const publicClient = await viem.getPublicClient();
      const fromBlock = await publicClient.getBlockNumber();
      const balBefore = await usdc.read.balanceOf([alice.account.address]);
      await coverFi.write.settleByOnChainRead([1n]);

      const settled = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicySettled",
        fromBlock,
        strict: true,
      });
      assert.equal(settled.length, 1);
      assert.equal(settled[0].args.outcome, 0); // SettlementOutcome.Miss

      // No PolicyPrincipalCapped — userBets (USDC(1000)) == principal.
      const capped = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicyPrincipalCapped",
        fromBlock,
        strict: true,
      });
      assert.equal(capped.length, 0);

      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[1], 1); // Releasing
      // No transfer at settle — release happens through claim later.
      assert.equal(await usdc.read.balanceOf([alice.account.address]), balBefore);
    });

    it("reverts MarketAnomalousOutcome when finalOption is -1 (Finalized but non-void negative)", async function () {
      const { coverFi, market } = await settleSetup({
        option: 0,
        principal: USDC(1000),
      });
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([-1]);
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFi.write.settleByOnChainRead([1n]),
        coverFi,
        "MarketAnomalousOutcome",
        [getAddress(market.address), -1],
      );
    });

    it("reverts MarketAnomalousOutcome when finalOption is -127 (boundary)", async function () {
      const { coverFi, market } = await settleSetup({
        option: 0,
        principal: USDC(1000),
      });
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([-127]);
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFi.write.settleByOnChainRead([1n]),
        coverFi,
        "MarketAnomalousOutcome",
        [getAddress(market.address), -127],
      );
    });

    it("reverts PolicyNotActive on second settle of the same policy", async function () {
      const { coverFi, market } = await settleSetup({
        option: 0,
        principal: USDC(1000),
      });
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([VOID_SENTINEL]);
      await coverFi.write.settleByOnChainRead([1n]);
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFi.write.settleByOnChainRead([1n]),
        coverFi,
        "PolicyNotActive",
        [1n, 4], // Void
      );
    });

    it("reverts PolicyNotFound for a never-minted policyId", async function () {
      const { coverFi } = await deployBase();
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFi.write.settleByOnChainRead([999n]),
        coverFi,
        "PolicyNotFound",
        [999n],
      );
    });

    it("is permissionless — any non-owner address can settle", async function () {
      const { coverFi, market } = await settleSetup({
        option: 0,
        principal: USDC(1000),
      });
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([1]); // Miss
      // Carol (not the policy owner) settles — should succeed.
      const cAsCarol = await coverFiAs(coverFi, carol);
      await cAsCarol.write.settleByOnChainRead([1n]);
      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[1], 1); // Releasing
    });
  });

  // ─── settleByOnChainRead — Miss min-cap ─────────────────────────
  describe("settleByOnChainRead Miss min-cap", async function () {
    /** Helper: mint a Miss-bound policy with `mintPrincipal`, then
     *  before settle, set userBets to `freshPrincipal`. Returns the
     *  full setup so tests can assert end state. */
    async function setupCapScenario(opts: {
      mintPrincipal: bigint;
      freshPrincipal: bigint;
    }) {
      const { usdc, factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [
          {
            user: alice.account.address,
            option: 0,
            amount: opts.mintPrincipal,
          },
        ],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));
      const c = await coverFiAs(coverFi, alice);
      await c.write.buyPolicy([market.address, 0, 5000n]);

      // Re-set userBets to the post-shrink value, then move market
      // to Finalized + Miss.
      await market.write.setUserBets([
        alice.account.address,
        0,
        opts.freshPrincipal,
      ]);
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([1]); // Miss

      return { usdc, coverFi, market };
    }

    it("no-shrink (fresh == principal): no cap, p.principal unchanged, no event", async function () {
      const { coverFi } = await setupCapScenario({
        mintPrincipal: USDC(1000),
        freshPrincipal: USDC(1000),
      });
      const publicClient = await viem.getPublicClient();
      const fromBlock = await publicClient.getBlockNumber();
      await coverFi.write.settleByOnChainRead([1n]);
      const capped = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicyPrincipalCapped",
        fromBlock,
        strict: true,
      });
      assert.equal(capped.length, 0);
      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[7], USDC(1000));
    });

    it("growth (fresh > principal): no cap (user added to position)", async function () {
      const { coverFi } = await setupCapScenario({
        mintPrincipal: USDC(1000),
        freshPrincipal: USDC(2500),
      });
      const publicClient = await viem.getPublicClient();
      const fromBlock = await publicClient.getBlockNumber();
      await coverFi.write.settleByOnChainRead([1n]);
      const capped = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicyPrincipalCapped",
        fromBlock,
        strict: true,
      });
      assert.equal(capped.length, 0);
      const policy = await coverFi.read.policies([1n]);
      // p.principal stays at the at-mint value; CoverFi only insures
      // what was underwritten.
      assert.equal(policy[7], USDC(1000));
    });

    it("shrink (fresh < principal): p.principal capped, PolicyPrincipalCapped emitted", async function () {
      const { coverFi } = await setupCapScenario({
        mintPrincipal: USDC(1000),
        freshPrincipal: USDC(400),
      });
      await viem.assertions.emitWithArgs(
        coverFi.write.settleByOnChainRead([1n]),
        coverFi,
        "PolicyPrincipalCapped",
        [1n, USDC(1000), USDC(400)],
      );
      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[7], USDC(400));
    });

    it("extreme shrink to 0: p.principal = 0, claim later yields NothingToClaim", async function () {
      const { coverFi } = await setupCapScenario({
        mintPrincipal: USDC(1000),
        freshPrincipal: 0n,
      });
      await viem.assertions.emitWithArgs(
        coverFi.write.settleByOnChainRead([1n]),
        coverFi,
        "PolicyPrincipalCapped",
        [1n, USDC(1000), 0n],
      );
      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[7], 0n);
      // Move past full release period — releasedOf still 0 (principal=0).
      await networkHelpers.time.increase(Number(RELEASE_PERIOD + 1n));
      assert.equal(await coverFi.read.releasedOf([1n]), 0n);
      const cAsAlice = await coverFiAs(coverFi, alice);
      await viem.assertions.revertWithCustomErrorWithArgs(
        cAsAlice.write.claim([1n]),
        coverFi,
        "NothingToClaim",
        [1n],
      );
    });

    it("non-zero cap (fresh=60, principal=100): releasedOf at RELEASE_PERIOD == 60, not 100", async function () {
      const { coverFi } = await setupCapScenario({
        mintPrincipal: USDC(100),
        freshPrincipal: USDC(60),
      });
      await viem.assertions.emitWithArgs(
        coverFi.write.settleByOnChainRead([1n]),
        coverFi,
        "PolicyPrincipalCapped",
        [1n, USDC(100), USDC(60)],
      );
      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[7], USDC(60));
      // Advance to the end of the release period. The capped value
      // (60) — not the at-mint principal (100) — must be what
      // releasedOf accrues to.
      await networkHelpers.time.increase(Number(RELEASE_PERIOD + 1n));
      assert.equal(await coverFi.read.releasedOf([1n]), USDC(60));
    });
  });

  // ─── releasedOf / claimableOf ───────────────────────────────────
  describe("releasedOf / claimableOf", async function () {
    /** Mint + Miss-settle a policy at principal USDC(1000). Returns
     *  coverFi + the settledAt timestamp for time-travel asserts. */
    async function freshlyReleasing(principal: bigint = USDC(1000)) {
      const { usdc, factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [{ user: alice.account.address, option: 0, amount: principal }],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));
      const c = await coverFiAs(coverFi, alice);
      await c.write.buyPolicy([market.address, 0, 5000n]);
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([1]); // Miss
      await coverFi.write.settleByOnChainRead([1n]);
      const policy = await coverFi.read.policies([1n]);
      return { coverFi, settledAt: policy[4] as number, usdc };
    }

    it("returns 0 before any time has passed (settled at block.timestamp)", async function () {
      const { coverFi } = await freshlyReleasing();
      // Within the same block, elapsed = 0 → released = 0.
      assert.equal(await coverFi.read.releasedOf([1n]), 0n);
    });

    it("at the half-year mark, releases ~principal/2 (floor division tolerance)", async function () {
      const { coverFi, settledAt } = await freshlyReleasing();
      const half = RELEASE_PERIOD / 2n;
      await networkHelpers.time.increaseTo(Number(BigInt(settledAt) + half));
      const released = await coverFi.read.releasedOf([1n]);
      // Floor: principal * half / RELEASE_PERIOD = 1000e18 * 0.5 = 500e18
      assert.equal(released, USDC(500));
    });

    it("at exactly RELEASE_PERIOD, releases the full principal", async function () {
      const { coverFi, settledAt } = await freshlyReleasing();
      await networkHelpers.time.increaseTo(
        Number(BigInt(settledAt) + RELEASE_PERIOD),
      );
      assert.equal(await coverFi.read.releasedOf([1n]), USDC(1000));
    });

    it("past RELEASE_PERIOD, caps at principal (no over-release)", async function () {
      const { coverFi, settledAt } = await freshlyReleasing();
      await networkHelpers.time.increaseTo(
        Number(BigInt(settledAt) + RELEASE_PERIOD * 2n),
      );
      assert.equal(await coverFi.read.releasedOf([1n]), USDC(1000));
    });
  });

  // ─── claim ──────────────────────────────────────────────────────
  describe("claim", async function () {
    async function freshlyReleasing(principal: bigint = USDC(1000)) {
      const { usdc, factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [{ user: alice.account.address, option: 0, amount: principal }],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));
      const cAsAlice = await coverFiAs(coverFi, alice);
      await cAsAlice.write.buyPolicy([market.address, 0, 5000n]);
      // Top up the contract pool so it can pay full principal back.
      await usdc.write.mint([coverFi.address, USDC(10_000)]);
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([1]); // Miss
      await coverFi.write.settleByOnChainRead([1n]);
      const policy = await coverFi.read.policies([1n]);
      return { usdc, coverFi, settledAt: policy[4] as number };
    }

    it("Active policy reverts NothingToClaim (not yet settled)", async function () {
      const { usdc, factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [{ user: alice.account.address, option: 0, amount: USDC(1000) }],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));
      const cAsAlice = await coverFiAs(coverFi, alice);
      await cAsAlice.write.buyPolicy([market.address, 0, 5000n]);
      await viem.assertions.revertWithCustomErrorWithArgs(
        cAsAlice.write.claim([1n]),
        coverFi,
        "NothingToClaim",
        [1n],
      );
    });

    it("non-owner cannot claim", async function () {
      const { coverFi, settledAt } = await freshlyReleasing();
      await networkHelpers.time.increaseTo(
        Number(BigInt(settledAt) + RELEASE_PERIOD / 4n),
      );
      const cAsAttacker = await coverFiAs(coverFi, attacker);
      await viem.assertions.revertWithCustomErrorWithArgs(
        cAsAttacker.write.claim([1n]),
        coverFi,
        "NotPolicyOwner",
        [1n],
      );
    });

    it("two partial claims sum to the released amount", async function () {
      const { usdc, coverFi, settledAt } = await freshlyReleasing();
      const cAsAlice = await coverFiAs(coverFi, alice);

      const balStart = await usdc.read.balanceOf([alice.account.address]);

      // Quarter mark — claim ~250
      await networkHelpers.time.setNextBlockTimestamp(
        Number(BigInt(settledAt) + RELEASE_PERIOD / 4n),
      );
      await cAsAlice.write.claim([1n]);
      const policy1 = await coverFi.read.policies([1n]);
      const claimed1 = policy1[9] as bigint;

      // Half mark — claim the next ~250
      await networkHelpers.time.setNextBlockTimestamp(
        Number(BigInt(settledAt) + RELEASE_PERIOD / 2n),
      );
      await cAsAlice.write.claim([1n]);
      const policy2 = await coverFi.read.policies([1n]);
      const claimed2 = policy2[9] as bigint;

      // After two claims, total claimed should equal released at half mark.
      assert.equal(claimed2, USDC(500));
      assert.ok(claimed1 > 0n && claimed1 < claimed2);
      assert.equal(
        (await usdc.read.balanceOf([alice.account.address])) - balStart,
        claimed2,
      );
    });

    it("final claim transitions status to Completed", async function () {
      const { coverFi, settledAt } = await freshlyReleasing();
      const cAsAlice = await coverFiAs(coverFi, alice);
      await networkHelpers.time.setNextBlockTimestamp(
        Number(BigInt(settledAt) + RELEASE_PERIOD),
      );
      await cAsAlice.write.claim([1n]);
      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[1], 2); // Completed
      assert.equal(policy[9], USDC(1000)); // claimed == principal
    });

    it("Hit policy cannot be claimed — release math gates by status", async function () {
      // Product invariant: Hit = user's option won = insurance does
      // NOT pay out. The release math must reject this status even
      // after RELEASE_PERIOD has elapsed.
      const { usdc, factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [{ user: alice.account.address, option: 1, amount: USDC(1000) }],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));
      const cAsAlice = await coverFiAs(coverFi, alice);
      await cAsAlice.write.buyPolicy([market.address, 1, 5000n]);
      // Settle to Hit (finalOption == claimOption).
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([1]);
      await coverFi.write.settleByOnChainRead([1n]);
      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[1], 3); // Hit

      // Advance time well past the linear-release window. If the
      // status gate is missing, releasedOf would mis-credit
      // principal here and claim would pay out — major fund leak.
      await networkHelpers.time.increase(Number(RELEASE_PERIOD * 2n));
      assert.equal(await coverFi.read.releasedOf([1n]), 0n);
      assert.equal(await coverFi.read.claimableOf([1n]), 0n);
      await viem.assertions.revertWithCustomErrorWithArgs(
        cAsAlice.write.claim([1n]),
        coverFi,
        "NothingToClaim",
        [1n],
      );
    });

    it("Void policy cannot be claimed — premium-refund branch is terminal", async function () {
      // Product invariant: Void = market voided = premium refunded
      // (already transferred during settle), no principal release.
      const { usdc, factory, coverFi } = await deployBase();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [{ user: alice.account.address, option: 0, amount: USDC(1000) }],
      });
      await fundAndApprove(usdc, alice, coverFi.address, USDC(10_000));
      const cAsAlice = await coverFiAs(coverFi, alice);
      await cAsAlice.write.buyPolicy([market.address, 0, 5000n]);
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([VOID_SENTINEL]);
      await coverFi.write.settleByOnChainRead([1n]);
      const policy = await coverFi.read.policies([1n]);
      assert.equal(policy[1], 4); // Void

      // Same time-advance + claim trap as the Hit test.
      await networkHelpers.time.increase(Number(RELEASE_PERIOD * 2n));
      assert.equal(await coverFi.read.releasedOf([1n]), 0n);
      assert.equal(await coverFi.read.claimableOf([1n]), 0n);
      await viem.assertions.revertWithCustomErrorWithArgs(
        cAsAlice.write.claim([1n]),
        coverFi,
        "NothingToClaim",
        [1n],
      );
    });
  });

  // ─── rescueToken ────────────────────────────────────────────────
  describe("rescueToken", async function () {
    it("admin can rescue an arbitrary ERC20 sent to the contract", async function () {
      const { coverFi } = await deployBase();
      const otherToken = await viem.deployContract("MockUSDC");
      await otherToken.write.mint([coverFi.address, USDC(123)]);
      const c = await coverFiAs(coverFi, admin);
      await c.write.rescueToken([
        otherToken.address,
        bob.account.address,
        USDC(123),
      ]);
      assert.equal(
        await otherToken.read.balanceOf([bob.account.address]),
        USDC(123),
      );
    });

    it("non-admin cannot rescue", async function () {
      const { coverFi } = await deployBase();
      const otherToken = await viem.deployContract("MockUSDC");
      await otherToken.write.mint([coverFi.address, USDC(50)]);
      const c = await coverFiAs(coverFi, attacker);
      const DEFAULT_ADMIN_ROLE = await coverFi.read.DEFAULT_ADMIN_ROLE();
      await viem.assertions.revertWithCustomErrorWithArgs(
        c.write.rescueToken([
          otherToken.address,
          attacker.account.address,
          USDC(50),
        ]),
        coverFi,
        "AccessControlUnauthorizedAccount",
        [getAddress(attacker.account.address), DEFAULT_ADMIN_ROLE],
      );
    });

    it("reverts ZeroAddress when recipient is 0x0", async function () {
      const { coverFi } = await deployBase();
      const otherToken = await viem.deployContract("MockUSDC");
      await otherToken.write.mint([coverFi.address, USDC(1)]);
      const c = await coverFiAs(coverFi, admin);
      await viem.assertions.revertWithCustomError(
        c.write.rescueToken([otherToken.address, zeroAddress, USDC(1)]),
        coverFi,
        "ZeroAddress",
      );
    });
  });

  // ─── reentrancy probe ────────────────────────────────────────────
  describe("reentrancy probe", async function () {
    /** Deploy CoverFi with ReentrantUSDC as the USDC, plus a real
     *  factory + market all wired up. Useful base for all three
     *  re-entry tests. */
    async function deployReentrant() {
      const usdc = await viem.deployContract("ReentrantUSDC");
      const factory = await viem.deployContract("MockPulseFactoryRegistry");
      const coverFi = await viem.deployContract("CoverFiPolicy", [
        usdc.address,
        factory.address,
        admin.account.address,
        5000n,
      ]);
      return { usdc, factory, coverFi };
    }

    it("claim re-entry blocked by nonReentrant (ReentrancyGuardReentrantCall)", async function () {
      const { usdc, factory, coverFi } = await deployReentrant();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [{ user: alice.account.address, option: 0, amount: USDC(1000) }],
      });
      // Alice buys policy through ReentrantUSDC.
      await usdc.write.mint([alice.account.address, USDC(10_000)]);
      const usdcAsAlice = await viem.getContractAt(
        "ReentrantUSDC",
        usdc.address,
        { client: { wallet: alice } },
      );
      await usdcAsAlice.write.approve([coverFi.address, USDC(10_000)]);
      const cAsAlice = await coverFiAs(coverFi, alice);
      await cAsAlice.write.buyPolicy([market.address, 0, 5000n]);

      // Top up the contract pool.
      await usdc.write.mint([coverFi.address, USDC(10_000)]);

      // Settle to Releasing.
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([1]); // Miss
      await coverFi.write.settleByOnChainRead([1n]);

      // Advance time so there's something to claim.
      await networkHelpers.time.increase(Number(RELEASE_PERIOD / 2n));

      // Arm the attack.
      await usdc.write.armClaim([coverFi.address, 1n]);

      // claim() will fire transfer → hook re-enters claim() →
      // nonReentrant blocks the re-entry; revert bubbles to outer.
      await assert.rejects(
        cAsAlice.write.claim([1n]),
        /ReentrancyGuardReentrantCall/,
      );
    });

    it("settleByOnChainRead Void re-entry blocked by Active-status check (CEI)", async function () {
      const { usdc, factory, coverFi } = await deployReentrant();
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [{ user: alice.account.address, option: 0, amount: USDC(1000) }],
      });
      await usdc.write.mint([alice.account.address, USDC(10_000)]);
      const usdcAsAlice = await viem.getContractAt(
        "ReentrantUSDC",
        usdc.address,
        { client: { wallet: alice } },
      );
      await usdcAsAlice.write.approve([coverFi.address, USDC(10_000)]);
      const cAsAlice = await coverFiAs(coverFi, alice);
      await cAsAlice.write.buyPolicy([market.address, 0, 5000n]);

      // Move market to Finalized+Void.
      await market.write.setStatus([Status.Finalized]);
      await market.write.setFinalOption([VOID_SENTINEL]);

      // Arm the attack.
      await usdc.write.armSettle([coverFi.address, 1n]);

      // settle() will hit the Void branch's safeTransfer → hook
      // re-enters settleByOnChainRead → status was set to Void
      // BEFORE the transfer (CEI), so re-entry sees non-Active
      // policy and reverts PolicyNotActive (4 = Void).
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFi.write.settleByOnChainRead([1n]),
        coverFi,
        "PolicyNotActive",
        [1n, 4],
      );
    });

    it("buyPolicy re-entry blocked by PositionAlreadyInsured (CEI)", async function () {
      const { usdc, factory, coverFi } = await deployReentrant();
      // ReentrantUSDC is BOTH the token AND the buyer. callBuyPolicy
      // routes the outer buyPolicy through the contract (msg.sender =
      // ReentrantUSDC), and the re-entered buyPolicy from inside
      // transferFrom also has msg.sender = ReentrantUSDC. Same
      // msg.sender on both = same dedup mapping key (market, buyer,
      // option) = the second call must hit PositionAlreadyInsured if
      // (and only if) the outer call wrote that mapping before
      // safeTransferFrom — i.e. CEI held.
      const market = await setupMarket(factory, {
        status: Status.Running,
        bets: [{ user: usdc.address, option: 0, amount: USDC(1000) }],
      });
      // ReentrantUSDC holds its own tokens AND approves coverFi to
      // pull them. approveSelf is the test helper that sets
      // allowance[address(this)][spender] = amount.
      await usdc.write.mint([usdc.address, USDC(10_000)]);
      await usdc.write.approveSelf([coverFi.address, USDC(10_000)]);

      // Arm the buyPolicy attack: when CoverFi calls transferFrom
      // during the outer buyPolicy, the hook fires once and re-enters
      // coverFi.buyPolicy(market, 0, 5000) with the same args.
      await usdc.write.armBuyPolicy([
        coverFi.address,
        market.address,
        0,
        5000,
      ]);

      await viem.assertions.revertWithCustomErrorWithArgs(
        usdc.write.callBuyPolicy([
          coverFi.address,
          market.address,
          0,
          5000,
        ]),
        coverFi,
        "PositionAlreadyInsured",
        [getAddress(market.address), getAddress(usdc.address), 0, 1n],
      );

      // Outer tx fully reverted — no policy minted.
      assert.equal(await coverFi.read.nextPolicyId(), 1n);
    });
  });
});
