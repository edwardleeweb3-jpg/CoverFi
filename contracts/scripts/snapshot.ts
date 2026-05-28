import "dotenv/config";
import { createPublicClient, formatUnits, getContract, http } from "viem";
import { bscTestnet } from "viem/chains";
import { createClient } from "@supabase/supabase-js";
import CoverFiArtifact from "../artifacts/src/CoverFiPolicy.sol/CoverFiPolicy.json" with { type: "json" };

/**
 * Read-only diagnostic — prints chain state for every minted policy
 * plus the matching Supabase rows. Handy any time chain ↔ DB sync
 * needs eyeballing.
 *
 * Scope (Segment 5): inspects the NEW CoverFi deployment only. The
 * v1 policies (CF-0000001..3) and their DB rows are not surfaced
 * here — the database cutover that drops/archives them happens in
 * the 5C frontend cutover, not in 5B.
 *
 *   cd contracts
 *   npm run snapshot
 */

// ⚠ Set this to the deployed CoverFiPolicy address after 5B.8 step 2.
const COVER_FI = "0x0000000000000000000000000000000000000000" as `0x${string}`;

const DECIMALS = 18;
const STATUS_BY_ENUM = ["active", "releasing", "completed", "hit", "void"];

if (COVER_FI === "0x0000000000000000000000000000000000000000") {
  console.error(
    "CoverFiPolicy address not set yet. Edit COVER_FI in " +
      "scripts/snapshot.ts after the 5B.8 deploy step.",
  );
  process.exit(1);
}

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
// Segment-5 Policy struct layout (10 fields):
//   [0] owner [1] status [2] kBps [3] mintedAt [4] settledAt
//   [5] signaMarket [6] claimOption [7] principal [8] premium [9] claimed
if (nextPolicyId > 1n) {
  const released1 = await coverFi.read.releasedOf([1n]);
  const claimable1 = await coverFi.read.claimableOf([1n]);
  const tuple1 = await coverFi.read.policies([1n]);
  const claimed1 = tuple1[9] as bigint;
  console.log(
    `\npolicy 1 release math (${DECIMALS}-decimal tUSDC):` +
      `\n  released  = ${released1}  (${formatUnits(released1, DECIMALS)} tUSDC)` +
      `\n  claimed   = ${claimed1}  (${formatUnits(claimed1, DECIMALS)} tUSDC)` +
      `\n  claimable = ${claimable1}  (${formatUnits(claimable1, DECIMALS)} tUSDC)`,
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
