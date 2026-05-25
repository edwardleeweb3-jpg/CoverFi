import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { getAddress, keccak256, parseUnits, toHex } from "viem";

/**
 * CoverFiPolicy — B2 (constructor + roles + setQ) and B3 (quotePremium
 * + buyPolicy) coverage. triggerSettlement / claim get added in B4 / B5.
 */
describe("CoverFiPolicy", async function () {
  const { viem } = await network.create();
  const [deployer, admin, settler, attacker, alice] =
    await viem.getWalletClients();

  /** USDC base unit at 6 decimals. */
  const USDC = (n: string | number) => parseUnits(String(n), 6);
  /** Convenience: hash a string as a bytes32 (orderHash, option). */
  const hash32 = (s: string) => keccak256(toHex(s));

  /** Deploy a fresh USDC + CoverFiPolicy pair. */
  async function deploy(initialQBps: bigint = 5000n) {
    const usdc = await viem.deployContract("MockUSDC");
    const coverFi = await viem.deployContract("CoverFiPolicy", [
      usdc.address,
      admin.account.address,
      settler.account.address,
      initialQBps,
    ]);
    return { usdc, coverFi };
  }

  describe("constructor + roles", async function () {
    it("stores the USDC token address", async function () {
      const { usdc, coverFi } = await deploy();
      assert.equal(
        (await coverFi.read.usdc()).toLowerCase(),
        usdc.address.toLowerCase(),
      );
    });

    it("grants DEFAULT_ADMIN_ROLE to the admin address only", async function () {
      const { coverFi } = await deploy();
      const DEFAULT_ADMIN_ROLE = await coverFi.read.DEFAULT_ADMIN_ROLE();
      assert.equal(
        await coverFi.read.hasRole([DEFAULT_ADMIN_ROLE, admin.account.address]),
        true,
      );
      assert.equal(
        await coverFi.read.hasRole([DEFAULT_ADMIN_ROLE, deployer.account.address]),
        false,
      );
      assert.equal(
        await coverFi.read.hasRole([DEFAULT_ADMIN_ROLE, settler.account.address]),
        false,
      );
    });

    it("grants SETTLER_ROLE to the settler address only", async function () {
      const { coverFi } = await deploy();
      const SETTLER_ROLE = await coverFi.read.SETTLER_ROLE();
      assert.equal(
        await coverFi.read.hasRole([SETTLER_ROLE, settler.account.address]),
        true,
      );
      assert.equal(
        await coverFi.read.hasRole([SETTLER_ROLE, admin.account.address]),
        false,
      );
    });

    it("does NOT grant QUOTER_ROLE to anyone at deploy (it's a forward-compat placeholder)", async function () {
      const { coverFi } = await deploy();
      const QUOTER_ROLE = await coverFi.read.QUOTER_ROLE();
      for (const w of [deployer, admin, settler, attacker]) {
        assert.equal(
          await coverFi.read.hasRole([QUOTER_ROLE, w.account.address]),
          false,
          `${w.account.address} should not hold QUOTER_ROLE`,
        );
      }
    });

    it("seeds qBps from the constructor argument", async function () {
      const { coverFi } = await deploy(4200n);
      assert.equal(await coverFi.read.qBps(), 4200n);
    });

    it("sets nextPolicyId to 1 (0 reserved for 'no policy')", async function () {
      const { coverFi } = await deploy();
      assert.equal(await coverFi.read.nextPolicyId(), 1n);
    });

    it("exposes the PRD-pinned constants", async function () {
      const { coverFi } = await deploy();
      assert.equal(await coverFi.read.BPS_DENOMINATOR(), 10_000n);
      assert.equal(await coverFi.read.F_BPS(), 500n);
      assert.equal(await coverFi.read.RELEASE_PERIOD(), 365n * 24n * 60n * 60n);
    });

    it("emits QUpdated(0, initialQBps, admin) on deployment", async function () {
      const usdc = await viem.deployContract("MockUSDC");
      const publicClient = await viem.getPublicClient();
      const fromBlock = await publicClient.getBlockNumber();
      const coverFi = await viem.deployContract("CoverFiPolicy", [
        usdc.address,
        admin.account.address,
        settler.account.address,
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

    it("reverts when initialQBps is 0", async function () {
      const usdc = await viem.deployContract("MockUSDC");
      await assert.rejects(
        viem.deployContract("CoverFiPolicy", [
          usdc.address,
          admin.account.address,
          settler.account.address,
          0n,
        ]),
        /InvalidQBps/,
      );
    });

    it("reverts when initialQBps > 10000", async function () {
      const usdc = await viem.deployContract("MockUSDC");
      await assert.rejects(
        viem.deployContract("CoverFiPolicy", [
          usdc.address,
          admin.account.address,
          settler.account.address,
          10_001n,
        ]),
        /InvalidQBps/,
      );
    });
  });

  describe("setQ", async function () {
    it("admin can update Q and emits QUpdated(old, new, admin)", async function () {
      const { coverFi } = await deploy(5000n);
      const coverFiAsAdmin = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: admin } },
      );
      await viem.assertions.emitWithArgs(
        coverFiAsAdmin.write.setQ([7500n]),
        coverFi,
        "QUpdated",
        [5000n, 7500n, getAddress(admin.account.address)],
      );
      assert.equal(await coverFi.read.qBps(), 7500n);
    });

    it("non-admin cannot update Q", async function () {
      const { coverFi } = await deploy();
      const coverFiAsAttacker = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: attacker } },
      );
      const DEFAULT_ADMIN_ROLE = await coverFi.read.DEFAULT_ADMIN_ROLE();
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFiAsAttacker.write.setQ([5500n]),
        coverFi,
        "AccessControlUnauthorizedAccount",
        [getAddress(attacker.account.address), DEFAULT_ADMIN_ROLE],
      );
    });

    it("settler cannot update Q (separate role)", async function () {
      const { coverFi } = await deploy();
      const coverFiAsSettler = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: settler } },
      );
      const DEFAULT_ADMIN_ROLE = await coverFi.read.DEFAULT_ADMIN_ROLE();
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFiAsSettler.write.setQ([5500n]),
        coverFi,
        "AccessControlUnauthorizedAccount",
        [getAddress(settler.account.address), DEFAULT_ADMIN_ROLE],
      );
    });

    it("rejects Q = 0", async function () {
      const { coverFi } = await deploy();
      const coverFiAsAdmin = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: admin } },
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFiAsAdmin.write.setQ([0n]),
        coverFi,
        "InvalidQBps",
        [0n],
      );
    });

    it("rejects Q > 10000", async function () {
      const { coverFi } = await deploy();
      const coverFiAsAdmin = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: admin } },
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFiAsAdmin.write.setQ([10_001n]),
        coverFi,
        "InvalidQBps",
        [10_001n],
      );
    });

    it("accepts Q = 10000 (boundary)", async function () {
      const { coverFi } = await deploy(5000n);
      const coverFiAsAdmin = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: admin } },
      );
      await coverFiAsAdmin.write.setQ([10_000n]);
      assert.equal(await coverFi.read.qBps(), 10_000n);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // quotePremium — PRD §3.2 formula, exercised with exact numbers
  // independently computed below. Source for each expected value:
  //
  //   With Q = 0.5, F = 0.05, principal = 1000 USDC = 1_000_000_000 wei
  //     k = 0.41  → base = 0.5 × 0.59 × 1000 = 295        floor = 50    → premium = 295
  //     k = 0.95  → base = 0.5 × 0.05 × 1000 =  25        floor = 50    → premium =  50  (floor)
  //     k = 0     → base = 0.5 × 1.00 × 1000 = 500        floor = 50    → premium = 500
  //     k = 1     → base = 0.5 × 0.00 × 1000 =   0        floor = 50    → premium =  50  (floor)
  // ────────────────────────────────────────────────────────────────
  describe("quotePremium", async function () {
    it("middling k — base above floor → premium = base", async function () {
      const { coverFi } = await deploy(5000n);
      const [base, floor, premium] = await coverFi.read.quotePremium([
        USDC(1000),
        4100,
      ]);
      assert.equal(base, USDC(295));
      assert.equal(floor, USDC(50));
      assert.equal(premium, USDC(295));
    });

    it("high k — base below floor → premium = floor", async function () {
      const { coverFi } = await deploy(5000n);
      const [base, floor, premium] = await coverFi.read.quotePremium([
        USDC(1000),
        9500,
      ]);
      assert.equal(base, USDC(25));
      assert.equal(floor, USDC(50));
      assert.equal(premium, USDC(50));
    });

    it("k = 0 (boundary) — base maximal", async function () {
      const { coverFi } = await deploy(5000n);
      const [base, , premium] = await coverFi.read.quotePremium([
        USDC(1000),
        0,
      ]);
      assert.equal(base, USDC(500));
      assert.equal(premium, USDC(500));
    });

    it("k = 10_000 (boundary) — base zero, floor wins", async function () {
      const { coverFi } = await deploy(5000n);
      const [base, floor, premium] = await coverFi.read.quotePremium([
        USDC(1000),
        10_000,
      ]);
      assert.equal(base, 0n);
      assert.equal(floor, USDC(50));
      assert.equal(premium, USDC(50));
    });

    it("rejects principal = 0", async function () {
      const { coverFi } = await deploy();
      await viem.assertions.revertWithCustomError(
        coverFi.read.quotePremium([0n, 4100]),
        coverFi,
        "InvalidPrincipal",
      );
    });

    it("rejects kBps > 10_000", async function () {
      const { coverFi } = await deploy();
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFi.read.quotePremium([USDC(1000), 10_001]),
        coverFi,
        "InvalidKBps",
        [10_001],
      );
    });
  });

  // ────────────────────────────────────────────────────────────────
  // buyPolicy — covers the happy path, all five revert paths, and
  // verifies CEI: balances + storage updated only on success, and
  // the orderHash dedup mark survives even though it was written
  // before the external transfer.
  // ────────────────────────────────────────────────────────────────
  describe("buyPolicy", async function () {
    /**
     * Helper: deploy, mint USDC to a buyer, approve CoverFiPolicy
     * for the buyer's balance.
     */
    async function setup(
      buyerBalance: bigint = USDC(10_000),
      initialQBps: bigint = 5000n,
    ) {
      const { usdc, coverFi } = await deploy(initialQBps);
      await usdc.write.mint([alice.account.address, buyerBalance]);
      const usdcAsAlice = await viem.getContractAt(
        "MockUSDC",
        usdc.address,
        { client: { wallet: alice } },
      );
      await usdcAsAlice.write.approve([coverFi.address, buyerBalance]);
      const coverFiAsAlice = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: alice } },
      );
      return { usdc, coverFi, usdcAsAlice, coverFiAsAlice };
    }

    it("mints policy id 1 first; storage + balances + event correct", async function () {
      const { usdc, coverFi, coverFiAsAlice } = await setup();
      const orderHash = hash32("SGA-7611");
      const option = hash32("Yes");
      const expectedPremium = USDC(295);

      await viem.assertions.emitWithArgs(
        coverFiAsAlice.write.buyPolicy([
          orderHash,
          USDC(1000),
          4100,
          option,
        ]),
        coverFi,
        "PolicyMinted",
        [
          1n,
          getAddress(alice.account.address),
          orderHash,
          USDC(1000),
          4100,
          expectedPremium,
          option,
        ],
      );

      // Storage: policy 1 populated, status Active, claimed 0.
      const p = await coverFi.read.policies([1n]);
      // viem returns struct as tuple: [owner, status, kBps, mintedAt,
      // settledAt, orderHash, principal, premium, claimed]
      assert.equal(p[0].toLowerCase(), alice.account.address.toLowerCase());
      assert.equal(p[1], 0); // PolicyStatus.Active
      assert.equal(p[2], 4100);
      assert.ok(p[3] > 0); // mintedAt is set
      assert.equal(p[4], 0); // settledAt unset
      assert.equal(p[5], orderHash);
      assert.equal(p[6], USDC(1000));
      assert.equal(p[7], expectedPremium);
      assert.equal(p[8], 0n);

      // orderHash dedup mark written.
      assert.equal(
        await coverFi.read.policyIdByOrderHash([orderHash]),
        1n,
      );

      // nextPolicyId advanced.
      assert.equal(await coverFi.read.nextPolicyId(), 2n);

      // USDC moved buyer → contract.
      assert.equal(
        await usdc.read.balanceOf([alice.account.address]),
        USDC(10_000) - expectedPremium,
      );
      assert.equal(
        await usdc.read.balanceOf([coverFi.address]),
        expectedPremium,
      );
    });

    it("charges the floor premium when base < floor", async function () {
      const { usdc, coverFiAsAlice, coverFi } = await setup();
      const orderHash = hash32("SGA-7612");
      // k = 0.95 → base = 25, floor = 50 → premium = 50.
      await coverFiAsAlice.write.buyPolicy([
        orderHash,
        USDC(1000),
        9500,
        hash32("No"),
      ]);

      assert.equal(
        await usdc.read.balanceOf([coverFi.address]),
        USDC(50),
      );
      const p = await coverFi.read.policies([1n]);
      assert.equal(p[7], USDC(50));
    });

    it("rejects a duplicate orderHash with OrderAlreadyInsured", async function () {
      const { coverFi, coverFiAsAlice } = await setup();
      const orderHash = hash32("SGA-7613");
      await coverFiAsAlice.write.buyPolicy([
        orderHash,
        USDC(1000),
        4100,
        hash32("Yes"),
      ]);

      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFiAsAlice.write.buyPolicy([
          orderHash,
          USDC(500),
          3000,
          hash32("Yes"),
        ]),
        coverFi,
        "OrderAlreadyInsured",
        [orderHash, 1n],
      );
    });

    it("accepts k = 0 (boundary)", async function () {
      const { usdc, coverFi, coverFiAsAlice } = await setup();
      await coverFiAsAlice.write.buyPolicy([
        hash32("SGA-7614"),
        USDC(1000),
        0,
        hash32("Yes"),
      ]);
      // base = 500, floor = 50, premium = 500.
      assert.equal(
        await usdc.read.balanceOf([coverFi.address]),
        USDC(500),
      );
    });

    it("accepts k = 10_000 (boundary)", async function () {
      const { usdc, coverFi, coverFiAsAlice } = await setup();
      await coverFiAsAlice.write.buyPolicy([
        hash32("SGA-7615"),
        USDC(1000),
        10_000,
        hash32("Yes"),
      ]);
      // base = 0, floor = 50, premium = 50.
      assert.equal(
        await usdc.read.balanceOf([coverFi.address]),
        USDC(50),
      );
    });

    it("rejects kBps > 10_000", async function () {
      const { coverFi, coverFiAsAlice } = await setup();
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFiAsAlice.write.buyPolicy([
          hash32("SGA-7616"),
          USDC(1000),
          10_001,
          hash32("Yes"),
        ]),
        coverFi,
        "InvalidKBps",
        [10_001],
      );
    });

    it("rejects principal = 0", async function () {
      const { coverFi, coverFiAsAlice } = await setup();
      await viem.assertions.revertWithCustomError(
        coverFiAsAlice.write.buyPolicy([
          hash32("SGA-7617"),
          0n,
          4100,
          hash32("Yes"),
        ]),
        coverFi,
        "InvalidPrincipal",
      );
    });

    it("reverts when buyer hasn't approved USDC (no state change)", async function () {
      // Bypass `setup` so we DON'T pre-approve.
      const { usdc, coverFi } = await deploy();
      await usdc.write.mint([alice.account.address, USDC(10_000)]);
      const coverFiAsAlice = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: alice } },
      );
      const orderHash = hash32("SGA-7618");

      await assert.rejects(
        coverFiAsAlice.write.buyPolicy([
          orderHash,
          USDC(1000),
          4100,
          hash32("Yes"),
        ]),
        /ERC20InsufficientAllowance|InsufficientAllowance|allowance/i,
      );

      // CEI sanity: the whole tx reverted → no policy, no dedup mark,
      // counter unchanged.
      assert.equal(
        await coverFi.read.policyIdByOrderHash([orderHash]),
        0n,
      );
      assert.equal(await coverFi.read.nextPolicyId(), 1n);
      assert.equal(
        await usdc.read.balanceOf([coverFi.address]),
        0n,
      );
    });
  });

  // ────────────────────────────────────────────────────────────────
  // triggerSettlement — three outcome branches + permission + dup +
  // missing-id reverts. Each branch verifies status, settledAt, and
  // event emission; the Void branch additionally verifies the premium
  // refund actually moved USDC back to the owner.
  // ────────────────────────────────────────────────────────────────
  describe("triggerSettlement", async function () {
    /** Standard fixture: a fresh deploy + 1 active policy (id 1) for
     *  Alice on order SGA-7700, principal 1000 USDC, k=0.41 → premium
     *  295 USDC. Returns everything tests need. */
    async function withActivePolicy() {
      const { usdc, coverFi } = await deploy();
      // Faucet + approve + mint policy.
      await usdc.write.mint([alice.account.address, USDC(10_000)]);
      const usdcAsAlice = await viem.getContractAt(
        "MockUSDC",
        usdc.address,
        { client: { wallet: alice } },
      );
      await usdcAsAlice.write.approve([coverFi.address, USDC(10_000)]);
      const coverFiAsAlice = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: alice } },
      );
      const orderHash = hash32("SGA-7700");
      await coverFiAsAlice.write.buyPolicy([
        orderHash,
        USDC(1000),
        4100,
        hash32("Yes"),
      ]);
      const coverFiAsSettler = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: settler } },
      );
      return {
        usdc,
        coverFi,
        coverFiAsAlice,
        coverFiAsSettler,
        policyId: 1n,
        premium: USDC(295),
      };
    }

    /** Outcome enum values — must match `enum SettlementOutcome` order. */
    const Outcome = { Miss: 0, Hit: 1, Void: 2 } as const;
    /** PolicyStatus enum values — match PRD §2.2 order. */
    const Status = {
      Active: 0,
      Releasing: 1,
      Completed: 2,
      Hit: 3,
      Void: 4,
    } as const;

    it("Miss → Releasing, settledAt set, emits PolicySettled(Miss)", async function () {
      const { coverFi, coverFiAsSettler, policyId } = await withActivePolicy();

      const publicClient = await viem.getPublicClient();
      const txHash = await coverFiAsSettler.write.triggerSettlement([
        policyId,
        Outcome.Miss,
      ]);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      const block = await publicClient.getBlock({
        blockNumber: receipt.blockNumber,
      });

      const p = await coverFi.read.policies([policyId]);
      assert.equal(p[1], Status.Releasing);
      assert.equal(BigInt(p[4]), block.timestamp);

      const events = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicySettled",
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        strict: true,
      });
      assert.equal(events.length, 1);
      assert.equal(events[0].args.policyId, policyId);
      assert.equal(events[0].args.outcome, Outcome.Miss);
      assert.equal(BigInt(events[0].args.settledAt), block.timestamp);
    });

    it("Hit → terminal Hit, settledAt set, emits PolicySettled(Hit), no token movement", async function () {
      const { usdc, coverFi, coverFiAsSettler, policyId, premium } =
        await withActivePolicy();

      const aliceBefore = await usdc.read.balanceOf([alice.account.address]);
      const contractBefore = await usdc.read.balanceOf([coverFi.address]);

      const publicClient = await viem.getPublicClient();
      const txHash = await coverFiAsSettler.write.triggerSettlement([
        policyId,
        Outcome.Hit,
      ]);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      const p = await coverFi.read.policies([policyId]);
      assert.equal(p[1], Status.Hit);
      assert.ok(p[4] > 0, "settledAt should be non-zero");

      // No refund, no payout — balances unchanged either side.
      assert.equal(
        await usdc.read.balanceOf([alice.account.address]),
        aliceBefore,
      );
      assert.equal(
        await usdc.read.balanceOf([coverFi.address]),
        contractBefore,
      );
      // And contract still holds the premium it took at mint.
      assert.equal(contractBefore, premium);

      const settled = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicySettled",
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        strict: true,
      });
      assert.equal(settled.length, 1);
      assert.equal(settled[0].args.outcome, Outcome.Hit);

      // No refund event either.
      const refunded = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicyRefunded",
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        strict: true,
      });
      assert.equal(refunded.length, 0);
    });

    it("Void → terminal Void, premium refunded to owner, both events emitted", async function () {
      const { usdc, coverFi, coverFiAsSettler, policyId, premium } =
        await withActivePolicy();

      const aliceBefore = await usdc.read.balanceOf([alice.account.address]);
      const contractBefore = await usdc.read.balanceOf([coverFi.address]);
      assert.equal(contractBefore, premium); // sanity

      const publicClient = await viem.getPublicClient();
      const txHash = await coverFiAsSettler.write.triggerSettlement([
        policyId,
        Outcome.Void,
      ]);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      // Status flipped, settledAt set.
      const p = await coverFi.read.policies([policyId]);
      assert.equal(p[1], Status.Void);
      assert.ok(p[4] > 0, "settledAt should be non-zero");

      // Premium moved contract → owner.
      assert.equal(
        await usdc.read.balanceOf([alice.account.address]),
        aliceBefore + premium,
      );
      assert.equal(await usdc.read.balanceOf([coverFi.address]), 0n);

      // PolicySettled fired with Void.
      const settled = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicySettled",
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        strict: true,
      });
      assert.equal(settled.length, 1);
      assert.equal(settled[0].args.outcome, Outcome.Void);
      assert.equal(settled[0].args.policyId, policyId);

      // PolicyRefunded fired independently.
      const refunded = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicyRefunded",
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        strict: true,
      });
      assert.equal(refunded.length, 1);
      assert.equal(refunded[0].args.policyId, policyId);
      assert.equal(
        refunded[0].args.owner.toLowerCase(),
        alice.account.address.toLowerCase(),
      );
      assert.equal(refunded[0].args.amount, premium);

      // PolicyClaimed should NOT fire on Void (refund is a distinct event).
      const claimed = await publicClient.getContractEvents({
        address: coverFi.address,
        abi: coverFi.abi,
        eventName: "PolicyClaimed",
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        strict: true,
      });
      assert.equal(claimed.length, 0);
    });

    it("rejects callers without SETTLER_ROLE", async function () {
      const { coverFi, policyId } = await withActivePolicy();
      const coverFiAsAttacker = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: attacker } },
      );
      const SETTLER_ROLE = await coverFi.read.SETTLER_ROLE();
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFiAsAttacker.write.triggerSettlement([policyId, Outcome.Miss]),
        coverFi,
        "AccessControlUnauthorizedAccount",
        [getAddress(attacker.account.address), SETTLER_ROLE],
      );
    });

    it("admin (without SETTLER_ROLE) is also rejected", async function () {
      // DEFAULT_ADMIN_ROLE can grant SETTLER_ROLE but doesn't hold it
      // itself by default — verify it can't bypass the gate.
      const { coverFi, policyId } = await withActivePolicy();
      const coverFiAsAdmin = await viem.getContractAt(
        "CoverFiPolicy",
        coverFi.address,
        { client: { wallet: admin } },
      );
      const SETTLER_ROLE = await coverFi.read.SETTLER_ROLE();
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFiAsAdmin.write.triggerSettlement([policyId, Outcome.Miss]),
        coverFi,
        "AccessControlUnauthorizedAccount",
        [getAddress(admin.account.address), SETTLER_ROLE],
      );
    });

    it("double-settle reverts with PolicyNotActive showing the current status", async function () {
      const { coverFi, coverFiAsSettler, policyId } = await withActivePolicy();
      await coverFiAsSettler.write.triggerSettlement([
        policyId,
        Outcome.Miss,
      ]);

      // Second attempt — current status is Releasing (=1).
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFiAsSettler.write.triggerSettlement([policyId, Outcome.Hit]),
        coverFi,
        "PolicyNotActive",
        [policyId, Status.Releasing],
      );
    });

    it("rejects an unknown policyId with PolicyNotFound", async function () {
      const { coverFi, coverFiAsSettler } = await withActivePolicy();
      // Policy 999 was never minted; owner slot defaults to address(0).
      await viem.assertions.revertWithCustomErrorWithArgs(
        coverFiAsSettler.write.triggerSettlement([999n, Outcome.Miss]),
        coverFi,
        "PolicyNotFound",
        [999n],
      );
    });
  });
});
