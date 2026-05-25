import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUnits } from "viem";

import { network } from "hardhat";

/**
 * MockUSDC sanity coverage — decimals, mint, faucet semantics,
 * transfer. Real ERC20 invariants (zero-address checks, allowance
 * mechanics, etc.) come from OpenZeppelin and are covered upstream;
 * these tests only assert the things that are *ours*: the 6-decimal
 * override and the permissionless mint.
 */
describe("MockUSDC", async function () {
  const { viem } = await network.create();
  const [, alice, bob] = await viem.getWalletClients();

  it("uses 6 decimals to match real USDC", async function () {
    const usdc = await viem.deployContract("MockUSDC");
    assert.equal(await usdc.read.decimals(), 6);
  });

  it("mint() credits the target address and bumps totalSupply", async function () {
    const usdc = await viem.deployContract("MockUSDC");
    const amount = parseUnits("1000", 6); // 1,000 USDC in wei

    await usdc.write.mint([alice.account.address, amount]);

    assert.equal(await usdc.read.balanceOf([alice.account.address]), amount);
    assert.equal(await usdc.read.totalSupply(), amount);
  });

  it("mint() is permissionless — any wallet can faucet anyone", async function () {
    const usdc = await viem.deployContract("MockUSDC");
    const amount = parseUnits("500", 6);

    // Bob (not the deployer) mints to Alice. The whole point of the
    // testnet faucet is no auth — this should succeed.
    const usdcAsBob = await viem.getContractAt("MockUSDC", usdc.address, {
      client: { wallet: bob },
    });
    await usdcAsBob.write.mint([alice.account.address, amount]);

    assert.equal(await usdc.read.balanceOf([alice.account.address]), amount);
  });

  it("transfer() moves balance from sender to recipient", async function () {
    const usdc = await viem.deployContract("MockUSDC");
    const minted = parseUnits("100", 6);
    const sent = parseUnits("30", 6);

    await usdc.write.mint([alice.account.address, minted]);

    const usdcAsAlice = await viem.getContractAt("MockUSDC", usdc.address, {
      client: { wallet: alice },
    });
    await usdcAsAlice.write.transfer([bob.account.address, sent]);

    assert.equal(
      await usdc.read.balanceOf([alice.account.address]),
      minted - sent,
    );
    assert.equal(await usdc.read.balanceOf([bob.account.address]), sent);
  });
});
