import "dotenv/config";
import { parseArgs } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  getContract,
  type Hex,
} from "viem";
import { bscTestnet } from "viem/chains";

/**
 * Segment 5 — project-side payout-pool injection (PRD §8.2).
 * Transfers `--amount` Signa Pulse beta tUSDC from the project
 * deployer wallet to the freshly-deployed CoverFiPolicy, then reports
 * both balances.
 *
 * Run AFTER `scripts/verify-coverfi-config.ts` confirms the deployed
 * contract's `usdc` + `signaFactory` immutables are wired correctly —
 * don't transfer real money into a misconfigured contract.
 *
 *   node scripts/transfer-payout-pool.ts --amount 100000
 *
 * Requires in .env: PRIVATE_KEY (project deployer), BSC_TESTNET_RPC_URL.
 */

// ─── Constants ────────────────────────────────────────────────────
// Signa Pulse beta tUSDC (18 decimals). Confirmed via probe-signa.ts
// + _docs/2026-05-26-signa-pulse-integration-faq.md §A + §E.
const SIGNA_USDC = "0xc03d7EA305485421e444070260D68ee598C1719c" as const;
const DECIMALS = 18;

// Deployed in 5B.8 Phase B (block 109,977,745, tx
// 0xad222c1950aa95c6c7f067ea77b28c1998868742591ba644b4a834d9a0c58aaa).
const COVER_FI = "0x93F92688C5feA2C5530cddeaf796b40b4Fab72f2" as `0x${string}`;

if (COVER_FI === "0x0000000000000000000000000000000000000000") {
  console.error(
    "CoverFiPolicy address not set yet. Edit COVER_FI in " +
      "scripts/transfer-payout-pool.ts after the 5B.8 deploy step.",
  );
  process.exit(1);
}

// ─── CLI ──────────────────────────────────────────────────────────
let amountArg: string | undefined;
try {
  ({
    values: { amount: amountArg },
  } = parseArgs({
    options: { amount: { type: "string" } },
  }));
} catch (e) {
  console.error("Usage: node scripts/transfer-payout-pool.ts --amount <USDC>");
  console.error((e as Error).message);
  process.exit(1);
}
if (!amountArg || !/^\d+$/.test(amountArg)) {
  console.error(
    "--amount must be a positive integer in USDC (e.g. --amount 100000).",
  );
  process.exit(1);
}
const amountUsdc = BigInt(amountArg);
const amountWei = parseUnits(amountUsdc.toString(), DECIMALS);

// ─── Env ──────────────────────────────────────────────────────────
const raw = (process.env.PRIVATE_KEY ?? "").trim();
if (raw === "") {
  console.error("PRIVATE_KEY is not set in .env.");
  process.exit(1);
}
const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
const account = privateKeyToAccount(pk);

const rpcUrl =
  process.env.BSC_TESTNET_RPC_URL ||
  "https://data-seed-prebsc-1-s1.binance.org:8545/";

// ─── Clients ──────────────────────────────────────────────────────
const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(rpcUrl),
});
const walletClient = createWalletClient({
  account,
  chain: bscTestnet,
  transport: http(rpcUrl),
});

// Minimal ERC20 ABI — avoids importing MockUSDC's artifact (which is
// test-only post-Segment-5; Signa tUSDC is a vanilla ERC20).
const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const usdc = getContract({
  address: SIGNA_USDC,
  abi: erc20Abi,
  client: { public: publicClient, wallet: walletClient },
});

// ─── Transfer ─────────────────────────────────────────────────────
console.log(
  `Transferring ${amountUsdc.toLocaleString()} tUSDC ` +
    `(= ${amountWei} wei @ ${DECIMALS} dec) → ${COVER_FI}…`,
);

const txHash = await usdc.write.transfer([COVER_FI, amountWei]);
console.log("Transfer tx:", txHash);

const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
console.log("Mined block:", receipt.blockNumber, "status:", receipt.status);
if (receipt.status !== "success") {
  console.error("Tx reverted.");
  process.exit(1);
}

const projectBal = (await usdc.read.balanceOf([account.address])) as bigint;
const coverBal = (await usdc.read.balanceOf([COVER_FI])) as bigint;
console.log(
  `\nProject (${account.address}) tUSDC: ${formatUnits(projectBal, DECIMALS)}`,
);
console.log(
  `CoverFiPolicy (${COVER_FI}) tUSDC: ${formatUnits(coverBal, DECIMALS)}`,
);
