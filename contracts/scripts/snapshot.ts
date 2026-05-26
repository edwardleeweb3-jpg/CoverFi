import "dotenv/config";
import { createPublicClient, formatUnits, getContract, http } from "viem";
import { bscTestnet } from "viem/chains";
import { createClient } from "@supabase/supabase-js";
import CoverFiArtifact from "../artifacts/src/CoverFiPolicy.sol/CoverFiPolicy.json" with { type: "json" };

/**
 * Read-only diagnostic — prints chain state for every minted policy
 * plus the matching Supabase rows. Handy any time chain ↔ DB sync
 * needs eyeballing (e.g. after running settle.ts, after testing a
 * new claim flow, before a Phase boundary review).
 *
 * Does not mutate anything; safe to run as often as you like.
 *
 *   cd contracts
 *   npm run snapshot              # or: node scripts/snapshot.ts
 */

const COVER_FI = "0xEbdd8f124EaD6DABd7C5F3893E2A244280fE5b19" as const;
const STATUS_BY_ENUM = ["active", "releasing", "completed", "hit", "void"];

const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(
    process.env.BSC_TESTNET_RPC_URL ??
      "https://data-seed-prebsc-1-s1.binance.org:8545/",
  ),
});
const coverFi = getContract({
  address: COVER_FI,
  abi: CoverFiArtifact.abi,
  client: publicClient,
});

console.log("─── Chain side ───────────────────────────────────────");
const nextPolicyId = await coverFi.read.nextPolicyId();
console.log(`CoverFiPolicy.nextPolicyId(): ${nextPolicyId}`);

// Iterate every minted id (1..nextPolicyId-1). The first never-minted
// id is `nextPolicyId` itself; ids below that always have a Policy
// struct populated (buyPolicy is monotonic + no delete path).
for (let id = 1n; id < nextPolicyId; id++) {
  const tuple = await coverFi.read.policies([id]);
  const statusIdx = Number(tuple[1]);
  console.log(
    `policy ${id}: status=${statusIdx} (${STATUS_BY_ENUM[statusIdx] ?? "?"})`,
  );
}

// Policy 1 gets the full release-math breakdown — handy as a sanity
// check that releasedOf / claimableOf / policies(id).claimed are
// internally consistent. Skip cleanly if no policies exist yet.
if (nextPolicyId > 1n) {
  const released1 = await coverFi.read.releasedOf([1n]);
  const claimable1 = await coverFi.read.claimableOf([1n]);
  const tuple1 = await coverFi.read.policies([1n]);
  const claimed1 = tuple1[8] as bigint;
  console.log(
    `\npolicy 1 release math (6-decimal USDC):` +
      `\n  released  = ${released1}  (${formatUnits(released1, 6)} USDC)` +
      `\n  claimed   = ${claimed1}  (${formatUnits(claimed1, 6)} USDC)` +
      `\n  claimable = ${claimable1}  (${formatUnits(claimable1, 6)} USDC)`,
  );
}

console.log("\n─── DB side (Supabase policies) ──────────────────────");
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_PUBLISHABLE_KEY!,
);
const { data, error } = await supabase
  .from("policies")
  .select("id, chain_policy_id, status, settled_at, voided_at")
  .order("chain_policy_id", { ascending: true });

if (error) {
  console.error("Supabase error:", error);
  process.exit(1);
}
for (const row of data ?? []) {
  console.log(JSON.stringify(row));
}
