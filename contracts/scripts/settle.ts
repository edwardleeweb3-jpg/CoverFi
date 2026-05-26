import "dotenv/config";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http,
  parseEventLogs,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import CoverFiArtifact from "../artifacts/src/CoverFiPolicy.sol/CoverFiPolicy.json" with { type: "json" };

/**
 * E6 — testnet settlement script.
 *
 * Calls `CoverFiPolicy.triggerSettlement(policyId, outcome)` as the
 * SETTLER_ROLE holder (the project EOA) and keeps the Supabase row
 * in sync. The frontend handles its own DB writes for the user-side
 * flows (buyPolicy, claim); this script is the only path that fires
 * settlement, so it owns the corresponding DB update.
 *
 * When Segment 5 connects a real Signa adapter, the role gets
 * granted to the adapter contract and this script retires.
 *
 * Usage:
 *   cd contracts
 *   node scripts/settle.ts --policy <chain_policy_id> --outcome miss|hit|void
 *
 * Examples:
 *   node scripts/settle.ts --policy 1 --outcome miss
 *   node scripts/settle.ts --policy 2 --outcome hit
 *   node scripts/settle.ts --policy 3 --outcome void
 *
 * Requires in .env: PRIVATE_KEY (SETTLER), BSC_TESTNET_RPC_URL,
 * SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.
 */

// ─── Deployment constants (D3) ────────────────────────────────────
const COVER_FI = "0xEbdd8f124EaD6DABd7C5F3893E2A244280fE5b19" as const;

/** Mirrors `enum SettlementOutcome { Miss, Hit, Void }` in CoverFiPolicy.sol. */
const OUTCOME_ENUM = { miss: 0, hit: 1, void: 2 } as const;
type OutcomeLabel = keyof typeof OUTCOME_ENUM;

/** Mirrors `enum PolicyStatus` for the DB write. */
const POLICY_STATUS = {
  miss: "releasing", // Miss → starts 365-day linear release
  hit: "hit",
  void: "void",
} as const;

// ─── CLI ──────────────────────────────────────────────────────────
let policyArg: string | undefined;
let outcomeArg: string | undefined;
try {
  ({
    values: { policy: policyArg, outcome: outcomeArg },
  } = parseArgs({
    options: {
      policy: { type: "string" },
      outcome: { type: "string" },
    },
  }));
} catch (e) {
  console.error(
    "Usage: node scripts/settle.ts --policy <id> --outcome miss|hit|void",
  );
  console.error((e as Error).message);
  process.exit(1);
}

if (!policyArg || !/^\d+$/.test(policyArg)) {
  console.error(
    "--policy must be a positive integer (chain_policy_id, e.g. 1).",
  );
  process.exit(1);
}
if (!outcomeArg || !(outcomeArg in OUTCOME_ENUM)) {
  console.error("--outcome must be one of: miss, hit, void");
  process.exit(1);
}

const chainPolicyId = BigInt(policyArg);
const outcome = outcomeArg as OutcomeLabel;
const outcomeEnum = OUTCOME_ENUM[outcome];
const newStatus = POLICY_STATUS[outcome];

// ─── Env ──────────────────────────────────────────────────────────
const rawKey = (process.env.PRIVATE_KEY ?? "").trim();
if (!rawKey) {
  console.error("PRIVATE_KEY is not set in .env.");
  process.exit(1);
}
const pk = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;
const account = privateKeyToAccount(pk);

const rpcUrl =
  process.env.BSC_TESTNET_RPC_URL ||
  "https://data-seed-prebsc-1-s1.binance.org:8545/";

const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim();
const supabaseKey = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
if (!supabaseUrl || !supabaseKey) {
  console.error(
    "SUPABASE_URL and/or SUPABASE_PUBLISHABLE_KEY missing from .env — see .env.example.",
  );
  process.exit(1);
}

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

const coverFi = getContract({
  address: COVER_FI,
  abi: CoverFiArtifact.abi,
  client: { public: publicClient, wallet: walletClient },
});

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Chain side ───────────────────────────────────────────────────
console.log(
  `Settling policy chain_policy_id=${chainPolicyId} with outcome=${outcome}`,
);
console.log(`  CoverFiPolicy: ${COVER_FI}`);
console.log(`  Settler:       ${account.address}`);

let txHash: Hex;
try {
  txHash = await coverFi.write.triggerSettlement([chainPolicyId, outcomeEnum]);
} catch (e) {
  console.error("triggerSettlement reverted or failed to submit:");
  console.error((e as Error).message ?? e);
  process.exit(1);
}

console.log(`\nTx submitted: ${txHash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
console.log(
  `Mined at block ${receipt.blockNumber} (status: ${receipt.status}).`,
);
if (receipt.status !== "success") {
  console.error("Tx mined but reverted — DB NOT updated.");
  process.exit(1);
}

// ─── Parse events ────────────────────────────────────────────────
const settledLogs = parseEventLogs({
  abi: CoverFiArtifact.abi,
  eventName: "PolicySettled",
  logs: receipt.logs,
});
if (settledLogs.length === 0) {
  console.error(
    "PolicySettled event not found in receipt logs — bailing out without DB update.",
  );
  process.exit(1);
}
const settledAtUnix = Number(settledLogs[0].args.settledAt);
const settledAtIso = new Date(settledAtUnix * 1000).toISOString();
console.log(
  `\nPolicySettled: outcome=${outcomeArg}, settledAt=${settledAtUnix} (${settledAtIso})`,
);

if (outcome === "void") {
  const refundLogs = parseEventLogs({
    abi: CoverFiArtifact.abi,
    eventName: "PolicyRefunded",
    logs: receipt.logs,
  });
  if (refundLogs.length > 0) {
    const r = refundLogs[0].args;
    console.log(
      `PolicyRefunded: amount=${r.amount} (${Number(r.amount) / 1_000_000} USDC) → ${r.owner}`,
    );
  } else {
    console.warn("PolicyRefunded expected on Void but not found in receipt.");
  }
}

// ─── DB sync ──────────────────────────────────────────────────────
// Schema convention:
//   Miss / Hit → write `settled_at` (the chain timestamp).
//   Void       → write `voided_at`; leave `settled_at` NULL.
// This matches the DB row mapper (rowToPolicy in src/lib/db/policies.ts)
// which derives mintedDaysAgo / settledDaysAgo / voidedDaysAgo from the
// respective columns.
const dbPatch: Record<string, unknown> = { status: newStatus };
if (outcome === "void") {
  dbPatch.voided_at = settledAtIso;
} else {
  dbPatch.settled_at = settledAtIso;
}

console.log(
  `\nUpdating DB row WHERE chain_policy_id=${chainPolicyId} → ${JSON.stringify(dbPatch)}`,
);
const { data, error } = await supabase
  .from("policies")
  .update(dbPatch)
  .eq("chain_policy_id", chainPolicyId.toString())
  .select("id, chain_policy_id, status, settled_at, voided_at, tx_hash");

if (error) {
  console.error(
    "DB UPDATE failed — chain is settled but DB is now out of sync.",
  );
  console.error(`  Reason: ${error.message}`);
  console.error(`  Manual fix: UPDATE policies SET ${
    Object.entries(dbPatch)
      .map(([k, v]) => `${k} = '${v}'`)
      .join(", ")
  } WHERE chain_policy_id = ${chainPolicyId};`);
  process.exit(1);
}
if (!data || data.length === 0) {
  console.error(
    `DB UPDATE matched 0 rows — chain_policy_id=${chainPolicyId} not in policies table. Chain is settled; DB needs manual insert.`,
  );
  process.exit(1);
}

console.log("\nDB updated. Final row state:");
console.log(JSON.stringify(data[0], null, 2));
console.log("\n✓ Settlement complete (chain + DB).");
