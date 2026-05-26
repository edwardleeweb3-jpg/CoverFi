import "dotenv/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

/**
 * Hardhat 3 config for the CoverFi contracts subproject.
 *
 * - Solidity 0.8.28 (latest stable at bootstrap). Optimizer enabled
 *   on the `production` profile only, so local test runs stay fast
 *   and stack-trace-friendly.
 * - Toolbox-viem: matches the root app's wagmi+viem stack so contract
 *   tests use the same client/type machinery as the frontend.
 * - Source paths overridden to `src/` so the layout matches CLAUDE.md
 *   §7 (we don't want a nested `contracts/contracts/`).
 * - BSC Testnet reads RPC URL / deployer key / BscScan key from `.env`
 *   (see `.env.example`). Missing values are tolerated for local
 *   `hardhatMainnet`-simulated work — only `bscTestnet` operations
 *   need them populated.
 */

const RPC_URL =
  process.env.BSC_TESTNET_RPC_URL ||
  "https://data-seed-prebsc-1-s1.binance.org:8545";

/**
 * Normalise the deployer key so a raw MetaMask export (64 hex chars,
 * no 0x prefix — that's exactly what Account Details → Show Private
 * Key gives you) works without manual prefix-fiddling. Returns
 * `undefined` when no key is set so the bscTestnet network just has
 * an empty `accounts` array (local hardhat work still runs).
 */
function normalizePrivateKey(raw: string): `0x${string}` | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return withPrefix as `0x${string}`;
}

const PRIVATE_KEY = normalizePrivateKey(process.env.PRIVATE_KEY ?? "");

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          // BSC Mainnet enabled Cancun-equivalent opcodes via the Tycho
          // hardfork (2024-03-12); BSC Testnet was ahead of it. So
          // TLOAD/TSTORE, MCOPY, BLOBHASH, EIP-6780 SELFDESTRUCT
          // semantics are all live on both. Pinning explicitly so a
          // future solc-default bump can't silently shift the target.
          evmVersion: "cancun",
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },
  paths: {
    sources: "src",
    tests: "test",
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    bscTestnet: {
      type: "http",
      chainType: "l1",
      url: RPC_URL,
      chainId: 97,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
});
