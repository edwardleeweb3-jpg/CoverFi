import "dotenv/config";
import {
  createPublicClient,
  http,
  type Address,
} from "viem";
import { bscTestnet } from "viem/chains";

/**
 * Signa Pulse beta — long-running chain probe.
 *
 * Read-only diagnostic that empirically verifies the parts of the
 * FAQ (_docs/2026-05-26-signa-pulse-integration-faq.md) that CoverFi
 * directly depends on: factory registry shape (defines the 防伪
 * check), market view-function ABI (status / finalOption / userBets
 * / hasBet), and the testnet USDC's claimed 18-decimal precision.
 *
 * Re-run at any time; no writes.
 *   cd contracts && node scripts/probe-signa.ts
 *
 * What this probe used to test but no longer does:
 *   getLogs feasibility for BetPlaced. The 2026-05-27 run proved
 *   the BSC testnet public RPC pool blanket-rejects eth_getLogs
 *   for historical ranges (even 100 blocks fails), and the one
 *   working endpoint (publicnode) caps at ~50k blocks AND has
 *   shallow archive coverage — useless for finding a user's
 *   historical bets. That investigation is preserved in the
 *   git history of this file; the production decision is to
 *   source the "list user's positions" data from a Signa-provided
 *   API instead of building our own indexer (D8 / 5A.3 ask).
 *
 * If you want to rerun the getLogs probe to confirm conditions
 * haven't changed, the prior commit can be restored.
 */

// Kept in sync with src/lib/contracts/signa/addresses.ts manually
// (this script is in the standalone contracts/ subproject and can't
// import from the root project's TS).
const SIGNA_FACTORY: Address = "0xD23323a906F6d6d28224a37Cc963d55678AA7E65";
const SIGNA_USDC: Address = "0xc03d7EA305485421e444070260D68ee598C1719c";
const FACTORY_DEPLOY_BLOCK = 106_095_419n;
// CoverFi project EOA — a probe address with no expected bets, used
// only to confirm the userBets/hasBet ABI shape (calls succeed even
// though the answer is zero/false).
const PROBE_ADDRESS: Address = "0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827";
const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
const VOID_SENTINEL = -128;

const STATUS_NAMES = [
  "Pending",
  "Running",
  "Settling",
  "Settled",
  "Disputing",
  "Disputed",
  "Arbitrating",
  "Finalized",
] as const;

const factoryAbi = [
  {
    type: "function",
    name: "marketIds",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

const marketAbi = [
  {
    type: "function",
    name: "status",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "finalOption",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "int8" }],
  },
  {
    type: "function",
    name: "userBets",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "uint8" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "hasBet",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(
    process.env.BSC_TESTNET_RPC_URL ??
      "https://data-seed-prebsc-1-s1.binance.org:8545/",
  ),
});

console.log("=== Signa Pulse Beta Probe ===");
console.log(`Chain:                BSC Testnet (97)`);
console.log(`Factory:              ${SIGNA_FACTORY}`);
console.log(`Signa USDC:           ${SIGNA_USDC}`);
console.log(`Factory deploy block: ${FACTORY_DEPLOY_BLOCK} (per FAQ)`);

const currentBlock = await client.getBlockNumber();
console.log(`Current block:        ${currentBlock}`);

// ─── 1. Factory registry walk ──────────────────────────────────────
console.log("\n─── 1. Factory registry walk ─────────────────────────");
const markets: { id: number; address: Address }[] = [];
const MAX_PROBE = 200;
let consecutiveZeros = 0;
for (let id = 1; id <= MAX_PROBE; id++) {
  let addr: Address;
  try {
    addr = (await client.readContract({
      address: SIGNA_FACTORY,
      abi: factoryAbi,
      functionName: "markets",
      args: [BigInt(id)],
    })) as Address;
  } catch (e) {
    console.log(`markets(${id}) reverted: ${(e as Error).message.slice(0, 100)}`);
    break;
  }
  if (addr === ZERO_ADDRESS) {
    consecutiveZeros++;
    if (consecutiveZeros >= 5) {
      console.log(
        `(stopped at id=${id} after ${consecutiveZeros} consecutive zeros)`,
      );
      break;
    }
    continue;
  }
  consecutiveZeros = 0;
  let reverseId: bigint;
  try {
    reverseId = (await client.readContract({
      address: SIGNA_FACTORY,
      abi: factoryAbi,
      functionName: "marketIds",
      args: [addr],
    })) as bigint;
  } catch {
    reverseId = -1n;
  }
  const ok = reverseId === BigInt(id);
  console.log(
    `markets(${id}) = ${addr}  | marketIds reverse = ${reverseId} ${ok ? "✓" : "✗ MISMATCH"}`,
  );
  markets.push({ id, address: addr });
}
console.log(`Total registered markets found: ${markets.length}`);

// ─── 2. Sample market reads ────────────────────────────────────────
console.log("\n─── 2. Sample market reads ───────────────────────────");
if (markets.length === 0) {
  console.log("(skip: no markets registered)");
} else {
  for (const sample of [...markets].reverse().slice(0, 3)) {
    console.log(`\nMarket ${sample.id} @ ${sample.address}`);
    try {
      const status = (await client.readContract({
        address: sample.address,
        abi: marketAbi,
        functionName: "status",
      })) as number;
      const finalOption = (await client.readContract({
        address: sample.address,
        abi: marketAbi,
        functionName: "finalOption",
      })) as number;
      const hasBet = (await client.readContract({
        address: sample.address,
        abi: marketAbi,
        functionName: "hasBet",
        args: [PROBE_ADDRESS],
      })) as boolean;
      const probeBet = (await client.readContract({
        address: sample.address,
        abi: marketAbi,
        functionName: "userBets",
        args: [PROBE_ADDRESS, 0],
      })) as bigint;
      console.log(`  status():            ${status} (${STATUS_NAMES[status] ?? "?"})`);
      console.log(
        `  finalOption():       ${finalOption}${finalOption === VOID_SENTINEL ? " (VOID_SENTINEL)" : ""}`,
      );
      console.log(`  hasBet(probe):       ${hasBet}`);
      console.log(`  userBets(probe, 0):  ${probeBet}`);
    } catch (e) {
      console.log(`  read failed: ${(e as Error).message.slice(0, 160)}`);
    }
  }
}

// ─── 3. Signa USDC ─────────────────────────────────────────────────
console.log("\n─── 3. Signa testnet USDC ────────────────────────────");
try {
  const [name, symbol, decimals] = await Promise.all([
    client.readContract({
      address: SIGNA_USDC,
      abi: erc20Abi,
      functionName: "name",
    }),
    client.readContract({
      address: SIGNA_USDC,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    client.readContract({
      address: SIGNA_USDC,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);
  console.log(`name:     ${name}`);
  console.log(`symbol:   ${symbol}`);
  console.log(`decimals: ${decimals}`);
} catch (e) {
  console.log(`USDC read failed: ${(e as Error).message.slice(0, 200)}`);
}

console.log("\n=== Probe complete ===");
