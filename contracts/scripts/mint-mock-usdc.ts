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
 * D2 — mint 1,000,000 MockUSDC to the project address. Run AFTER the
 * Ignition deploy.
 *
 * Pulls the freshly-deployed address + recipient + amount from env /
 * constants below; reports tx hash and post-balance.
 */

const MOCK_USDC = "0xb1DC4F171091D2b3d94a8B14be8cc663fD994e73" as const;
const RECIPIENT = "0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827" as const;
const AMOUNT_USDC = 1_000_000n;
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
  `Minting ${AMOUNT_USDC.toLocaleString()} USDC (= ${amountRaw} raw units) to ${RECIPIENT}…`,
);

const txHash = await usdc.write.mint([RECIPIENT, amountRaw]);
console.log("Mint tx hash:", txHash);

const receipt = await publicClient.waitForTransactionReceipt({
  hash: txHash,
});
console.log("Mined in block:", receipt.blockNumber, "status:", receipt.status);

const balance = (await usdc.read.balanceOf([RECIPIENT])) as bigint;
console.log(
  `${RECIPIENT} MockUSDC balance: ${formatUnits(balance, DECIMALS)} USDC`,
);
