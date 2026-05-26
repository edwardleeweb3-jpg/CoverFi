import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, formatEther } from "viem";
import { bscTestnet } from "viem/chains";

/**
 * Pre-deploy safety check — derives the deployer address from .env's
 * PRIVATE_KEY (auto-prefixing 0x if missing, same rule as
 * hardhat.config.ts) and reports the BSC Testnet tBNB balance.
 *
 * NEVER prints the private key itself. Only the derived address.
 */

const raw = (process.env.PRIVATE_KEY ?? "").trim();
if (raw === "") {
  console.error("PRIVATE_KEY is not set in .env — aborting.");
  process.exit(1);
}
const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;

const account = privateKeyToAccount(pk);
console.log("Derived deployer address:", account.address);

const rpcUrl =
  process.env.BSC_TESTNET_RPC_URL ||
  "https://data-seed-prebsc-1-s1.binance.org:8545/";
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(rpcUrl),
});

const balance = await client.getBalance({ address: account.address });
console.log(`BSC Testnet tBNB balance: ${formatEther(balance)} tBNB`);
