import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  getContract,
} from "viem";
import { bscTestnet } from "viem/chains";
import MockUSDCArtifact from "../artifacts/src/MockUSDC.sol/MockUSDC.json" with { type: "json" };

/**
 * D3 — project-side payout-pool injection (PRD §8.2). Transfers
 * 100,000 MockUSDC from the project deployer wallet to the freshly-
 * deployed CoverFiPolicy, then reports both balances.
 */

const MOCK_USDC = "0xb1DC4F171091D2b3d94a8B14be8cc663fD994e73" as const;
const COVER_FI = "0xEbdd8f124EaD6DABd7C5F3893E2A244280fE5b19" as const;
const AMOUNT_USDC = 100_000n;
const DECIMALS = 6;

const raw = (process.env.PRIVATE_KEY ?? "").trim();
const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
const account = privateKeyToAccount(pk);

const rpcUrl =
  process.env.BSC_TESTNET_RPC_URL ||
  "https://data-seed-prebsc-1-s1.binance.org:8545/";

const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(rpcUrl),
});
const walletClient = createWalletClient({
  account,
  chain: bscTestnet,
  transport: http(rpcUrl),
});

const usdc = getContract({
  address: MOCK_USDC,
  abi: MockUSDCArtifact.abi,
  client: { public: publicClient, wallet: walletClient },
});

const amountRaw = parseUnits(AMOUNT_USDC.toString(), DECIMALS);
console.log(
  `Transferring ${AMOUNT_USDC.toLocaleString()} USDC (= ${amountRaw} raw) → ${COVER_FI}…`,
);

const txHash = await usdc.write.transfer([COVER_FI, amountRaw]);
console.log("Transfer tx:", txHash);

const receipt = await publicClient.waitForTransactionReceipt({
  hash: txHash,
});
console.log("Mined block:", receipt.blockNumber, "status:", receipt.status);

const projectBal = (await usdc.read.balanceOf([account.address])) as bigint;
const coverBal = (await usdc.read.balanceOf([COVER_FI])) as bigint;
console.log(
  `\nProject (${account.address}) USDC: ${formatUnits(projectBal, DECIMALS)}`,
);
console.log(`CoverFiPolicy (${COVER_FI}) USDC: ${formatUnits(coverBal, DECIMALS)}`);
