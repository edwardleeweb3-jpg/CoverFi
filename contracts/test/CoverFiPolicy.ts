import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { getAddress } from "viem";

/**
 * CoverFiPolicy — B2 skeleton coverage.
 *
 * Scope here is constructor + roles + setQ + the QUpdated event;
 * buyPolicy / triggerSettlement / claim land in B3 / B4 / B5 and get
 * their own coverage there.
 */
describe("CoverFiPolicy", async function () {
  const { viem } = await network.create();
  const [deployer, admin, settler, attacker] = await viem.getWalletClients();

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
});
