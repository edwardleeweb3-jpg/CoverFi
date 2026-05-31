import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  getContract,
  http,
  parseEventLogs,
  parseUnits,
  type Hex,
} from "viem";
import { bscTestnet } from "viem/chains";
import CoverFiArtifact from "../artifacts/src/CoverFiPolicy.sol/CoverFiPolicy.json" with { type: "json" };

/**
 * Segment 5 Phase 5A.4 integration test — Phase 3 (settle + verify).
 *
 * State-driven: reads scripts/5a4-state.json (written by Phase 1) for
 * the (label / market / policyId / expectedOutcome / premiumWei)
 * triple per market. No on-chain identifiers are hardcoded here.
 *
 * Per market, status-gated and independent (Signa may settle markets
 * at different times; script is safe to re-run as each market's
 * dispute window passes):
 *   1. Read M.status(); skip the market if != Finalized (Signa hasn't
 *      reached terminal yet).
 *   2. Read policy.status. If Active, we call settleByOnChainRead.
 *      If already terminal (someone else settled — permissionless),
 *      we verify the final state without trying to settle again
 *      (that would revert PolicyNotActive — harmless but noisy).
 *   3. All post-settle reads pinned to settleReceipt.blockNumber
 *      (post) or blockNumber-1 (pre) — race-free balance / state
 *      reconstruction (same discipline as Phase 1).
 *   4. Branch on expectedOutcome (Hit / Miss / Void) and assert
 *      finalOption, policy.status, balance delta, plus events emitted
 *      from our settle tx (skipped for pre-settled markets — final
 *      state covers it).
 *
 * Out of scope: claim(). Per agreement, claim is covered by 5B.5
 * unit tests; Phase 3 only proves the three settleByOnChainRead
 * branches end-to-end.
 *
 * Idempotency: settleByOnChainRead reverts PolicyNotActive on a
 * second call, so a re-run can't double-move money even without our
 * status check. The status check just keeps output clean.
 *
 * Usage:
 *   cd contracts
 *   node scripts/it-5a4-settle-and-verify.ts
 *
 * Requires in .env: PRIVATE_KEY (project EOA), BSC_TESTNET_RPC_URL.
 */

// ─── Constants ────────────────────────────────────────────────────
const COVER_FI = "0x93F92688C5feA2C5530cddeaf796b40b4Fab72f2" as const;
const TUSDC = "0xc03d7EA305485421e444070260D68ee598C1719c" as const;
const SIGNA_FACTORY = "0xD23323a906F6d6d28224a37Cc963d55678AA7E65" as const;
const EXPECTED_DEPLOYER =
  "0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827" as const;

// IPulseMarket.Status enum (positional, per contract).
const SIGNA_STATUS_FINALIZED = 7;
// VOID_SENTINEL from IPulseMarket.sol — type(int8).min.
const VOID_SENTINEL = -128;

// PolicyStatus enum (positional).
const POLICY_STATUS_ACTIVE = 0;
const POLICY_STATUS_RELEASING = 1;
const POLICY_STATUS_HIT = 3;
const POLICY_STATUS_VOID = 4;
const POLICY_STATUS_NAMES = [
  "Active",
  "Releasing",
  "Completed",
  "Hit",
  "Void",
];

// SettlementOutcome enum (positional, per CoverFiPolicy.sol):
//   { Miss=0, Hit=1, Void=2 }
const OUTCOME_ENUM = { Miss: 0, Hit: 1, Void: 2 } as const;

const MIN_TBNB_WEI = parseUnits("0.05", 18);
const STATE_PATH = fileURLToPath(new URL("./5a4-state.json", import.meta.url));

// ─── Minimal ABIs ─────────────────────────────────────────────────
const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const pulseAbi = [
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
] as const;

// ─── State JSON shape ─────────────────────────────────────────────
type PolicyEntry = {
  label: string;
  market: `0x${string}`;
  expectedOutcome: "Hit" | "Miss" | "Void";
  effectiveBetWei: string;
  betTx: Hex;
  policyId: string;
  premiumWei: string;
  buyTx: Hex;
};
type State = {
  createdAt: string;
  owner: `0x${string}`;
  kBps: number;
  betAmountWei: string;
  policies: PolicyEntry[];
};

function loadState(): State {
  if (!existsSync(STATE_PATH)) {
    fail(`state JSON not found at ${STATE_PATH} — run Phase 1 first.`);
  }
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
  } catch (e) {
    fail(`state JSON cannot parse: ${(e as Error).message}`);
  }
}

// ─── Assertion helpers ────────────────────────────────────────────
function fail(msg: string): never {
  console.error("ABORT: " + msg);
  process.exit(1);
}
function check(cond: boolean, label: string, ctx?: string) {
  if (!cond) {
    console.error(`  ✗ ${label}`);
    if (ctx) console.error(`     ${ctx}`);
    process.exit(1);
  }
  console.log(`  ✓ ${label}`);
}
function eqAddr(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

// ─── Env + clients ────────────────────────────────────────────────
const rawKey = (process.env.PRIVATE_KEY ?? "").trim();
if (!rawKey) fail("PRIVATE_KEY not set in .env");
const pk = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex;
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

const tUsdc = getContract({
  address: TUSDC,
  abi: erc20Abi,
  client: { public: publicClient },
});
const coverFi = getContract({
  address: COVER_FI,
  abi: CoverFiArtifact.abi,
  client: { public: publicClient, wallet: walletClient },
});

// ─── Header ───────────────────────────────────────────────────────
console.log("=== Phase 5A.4 / Phase 3 — settle + verify ===");
console.log(`Deployer:       ${account.address}`);
console.log(`CoverFiPolicy:  ${COVER_FI}`);
console.log(`tUSDC:          ${TUSDC}`);
console.log(`State file:     ${STATE_PATH}`);

// ─── Pre-flight ───────────────────────────────────────────────────
console.log("\n─── Pre-flight ────────────────────────────────────────");

check(
  eqAddr(account.address, EXPECTED_DEPLOYER),
  "Deployer == project EOA",
  `expected ${EXPECTED_DEPLOYER}, got ${account.address}`,
);

const tBnb = await publicClient.getBalance({ address: account.address });
check(
  tBnb >= MIN_TBNB_WEI,
  `tBNB balance ≥ ${formatUnits(MIN_TBNB_WEI, 18)} (gas)`,
  `actual: ${formatUnits(tBnb, 18)} tBNB`,
);

const usdcOnChain = await coverFi.read.usdc();
check(eqAddr(usdcOnChain as string, TUSDC), `CoverFi.usdc() == Signa tUSDC`);
const factoryOnChain = await coverFi.read.signaFactory();
check(
  eqAddr(factoryOnChain as string, SIGNA_FACTORY),
  `CoverFi.signaFactory() == Signa beta factory`,
);

const state = loadState();
check(
  eqAddr(state.owner, account.address),
  `state.owner matches current deployer`,
  `state=${state.owner}, current=${account.address}`,
);
console.log(`  loaded ${state.policies.length} policy entries from state JSON`);

// ─── Per-market loop ──────────────────────────────────────────────
const verified: string[] = [];
const skipped: string[] = [];
const alreadySettled: string[] = [];

for (const e of state.policies) {
  console.log(
    `\n─── Phase 3 / Market ${e.label} (${e.market}) → expected ${e.expectedOutcome} ───`,
  );

  const market = getContract({
    address: e.market,
    abi: pulseAbi,
    client: { public: publicClient },
  });

  // ── 1. Signa status gate (latest read; OK if stale — worst case
  //      = this run skips, next run picks up) ──
  const signaStatus = (await market.read.status()) as number;
  if (signaStatus !== SIGNA_STATUS_FINALIZED) {
    console.log(
      `  skip — Signa status = ${signaStatus} (not Finalized=${SIGNA_STATUS_FINALIZED}). Re-run after Signa finalizes ${e.label}.`,
    );
    skipped.push(e.label);
    continue;
  }
  console.log(`  ✓ Signa status == Finalized (${signaStatus})`);

  // ── 2. Decide: settle ourselves, or already-settled by someone else? ──
  const policyId = BigInt(e.policyId);
  const prePolicy = (await coverFi.read.policies([policyId])) as readonly [
    `0x${string}`,
    number,
    number,
    number,
    number,
    `0x${string}`,
    number,
    bigint,
    bigint,
    bigint,
  ];
  const prePolicyStatus = prePolicy[1];

  let settleBlock: bigint;
  let settledByUs: boolean;
  let settleReceiptLogs: readonly { topics: readonly Hex[]; data: Hex; address: `0x${string}` }[] = [];

  if (prePolicyStatus === POLICY_STATUS_ACTIVE) {
    // We settle.
    const settleTx = await coverFi.write.settleByOnChainRead([policyId]);
    const settleReceipt = await publicClient.waitForTransactionReceipt({
      hash: settleTx,
    });
    check(
      settleReceipt.status === "success",
      `coverFi.settleByOnChainRead(${policyId})  tx ${settleTx}`,
    );
    settleBlock = settleReceipt.blockNumber;
    settledByUs = true;
    settleReceiptLogs = settleReceipt.logs as typeof settleReceiptLogs;
    console.log(
      `     settled at block ${settleBlock} (tx ${settleTx})`,
    );
  } else {
    // Already settled by someone else (permissionless). Verify state
    // at current block; can't verify the original settle receipt
    // events (don't have the receipt), but final state is canonical.
    const latestBlock = await publicClient.getBlockNumber();
    settleBlock = latestBlock;
    settledByUs = false;
    console.log(
      `  policy already settled by another caller (status=${POLICY_STATUS_NAMES[prePolicyStatus]}=${prePolicyStatus}); verifying final state at block ${latestBlock}`,
    );
    alreadySettled.push(e.label);
  }

  // ── 3. Pin-read everything at the same block pair (race-free) ──
  const beforeBlock = settleBlock - 1n;
  const afterBlock = settleBlock;
  const [finalOption, policyTuple, usPost, coverPost, usPre, coverPre] =
    (await Promise.all([
      market.read.finalOption({ blockNumber: afterBlock }),
      coverFi.read.policies([policyId], { blockNumber: afterBlock }),
      tUsdc.read.balanceOf([account.address], { blockNumber: afterBlock }),
      tUsdc.read.balanceOf([COVER_FI], { blockNumber: afterBlock }),
      tUsdc.read.balanceOf([account.address], { blockNumber: beforeBlock }),
      tUsdc.read.balanceOf([COVER_FI], { blockNumber: beforeBlock }),
    ])) as [
      number,
      readonly [
        `0x${string}`,
        number,
        number,
        number,
        number,
        `0x${string}`,
        number,
        bigint,
        bigint,
        bigint,
      ],
      bigint,
      bigint,
      bigint,
      bigint,
    ];

  const policyStatus = policyTuple[1];
  const settledAt = policyTuple[4];
  const policyPrincipal = policyTuple[7];
  const policyPremium = policyTuple[8];

  console.log(
    `     finalOption @ ${afterBlock} = ${finalOption}; policy.status = ${policyStatus} (${POLICY_STATUS_NAMES[policyStatus]}); settledAt = ${settledAt}`,
  );

  // ── 4. Universal assert: settledAt > 0 ──
  check(settledAt > 0, `policy.settledAt > 0`, `got ${settledAt}`);

  // ── 5. Branch asserts ──
  const expectedPremium = BigInt(e.premiumWei);
  const expectedBet = BigInt(e.effectiveBetWei);

  if (e.expectedOutcome === "Hit") {
    check(
      finalOption === 0,
      `finalOption == 0 (== claimOption)`,
      `got ${finalOption}`,
    );
    check(
      policyStatus === POLICY_STATUS_HIT,
      `policy.status == Hit (${POLICY_STATUS_HIT})`,
      `got ${policyStatus} (${POLICY_STATUS_NAMES[policyStatus]})`,
    );
    check(
      usPost === usPre,
      `us tUSDC unchanged (no Hit payout)`,
      `pre=${usPre}, post=${usPost}, delta=${usPost - usPre}`,
    );
    check(
      coverPost === coverPre,
      `coverFi tUSDC unchanged (premium retained)`,
      `pre=${coverPre}, post=${coverPost}, delta=${coverPost - coverPre}`,
    );
    check(
      policyPrincipal === expectedBet,
      `policy.principal unchanged from mint`,
      `mint=${expectedBet}, now=${policyPrincipal}`,
    );
  } else if (e.expectedOutcome === "Miss") {
    check(
      finalOption === 1,
      `finalOption == 1 (!= claimOption=0)`,
      `got ${finalOption}`,
    );
    check(
      policyStatus === POLICY_STATUS_RELEASING,
      `policy.status == Releasing (${POLICY_STATUS_RELEASING})`,
      `got ${policyStatus} (${POLICY_STATUS_NAMES[policyStatus]})`,
    );
    check(
      usPost === usPre,
      `us tUSDC unchanged at settle (release happens through claim later)`,
      `pre=${usPre}, post=${usPost}, delta=${usPost - usPre}`,
    );
    check(
      coverPost === coverPre,
      `coverFi tUSDC unchanged at settle`,
      `pre=${coverPre}, post=${coverPost}, delta=${coverPost - coverPre}`,
    );
    check(
      policyPrincipal === expectedBet,
      `policy.principal unchanged (no-shrink → no min-cap)`,
      `mint=${expectedBet}, now=${policyPrincipal}`,
    );
  } else {
    // Void
    check(
      finalOption === VOID_SENTINEL,
      `finalOption == VOID_SENTINEL (${VOID_SENTINEL})`,
      `got ${finalOption}`,
    );
    check(
      policyStatus === POLICY_STATUS_VOID,
      `policy.status == Void (${POLICY_STATUS_VOID})`,
      `got ${policyStatus} (${POLICY_STATUS_NAMES[policyStatus]})`,
    );
    check(
      usPost - usPre === expectedPremium,
      `us tUSDC delta == +premium (refund)  (block ${beforeBlock} → ${afterBlock})`,
      `delta=${usPost - usPre}, premium=${expectedPremium}`,
    );
    check(
      coverPre - coverPost === expectedPremium,
      `coverFi tUSDC delta == -premium (refund out)  (block ${beforeBlock} → ${afterBlock})`,
      `delta=${coverPre - coverPost}, premium=${expectedPremium}`,
    );
    check(
      policyPremium === expectedPremium,
      `policy.premium matches state.json (sanity)`,
      `policy=${policyPremium}, state=${expectedPremium}`,
    );
  }

  // ── 6. Event asserts — only when we have the settle receipt ──
  if (settledByUs) {
    const settledEvents = parseEventLogs({
      abi: CoverFiArtifact.abi,
      eventName: "PolicySettled",
      logs: settleReceiptLogs as never,
    });
    check(
      settledEvents.length === 1,
      `PolicySettled emitted once`,
      `got ${settledEvents.length}`,
    );
    const outcomeEnum = OUTCOME_ENUM[e.expectedOutcome];
    const emittedOutcome = (settledEvents[0] as { args: { outcome: number } })
      .args.outcome;
    check(
      emittedOutcome === outcomeEnum,
      `PolicySettled.outcome == ${e.expectedOutcome} (${outcomeEnum})`,
      `got ${emittedOutcome}`,
    );

    const cappedEvents = parseEventLogs({
      abi: CoverFiArtifact.abi,
      eventName: "PolicyPrincipalCapped",
      logs: settleReceiptLogs as never,
    });
    check(
      cappedEvents.length === 0,
      `no PolicyPrincipalCapped (no-shrink path)`,
      `got ${cappedEvents.length}`,
    );

    const refundEvents = parseEventLogs({
      abi: CoverFiArtifact.abi,
      eventName: "PolicyRefunded",
      logs: settleReceiptLogs as never,
    });
    if (e.expectedOutcome === "Void") {
      check(
        refundEvents.length === 1,
        `PolicyRefunded emitted once (Void)`,
        `got ${refundEvents.length}`,
      );
      const refundAmount = (refundEvents[0] as { args: { amount: bigint } })
        .args.amount;
      check(
        refundAmount === expectedPremium,
        `PolicyRefunded.amount == premium`,
        `event=${refundAmount}, premium=${expectedPremium}`,
      );
    } else {
      check(
        refundEvents.length === 0,
        `no PolicyRefunded (only Void refunds)`,
        `got ${refundEvents.length}`,
      );
    }
  } else {
    console.log(
      `  (event asserts skipped — no settle receipt because we didn't settle this one)`,
    );
  }

  verified.push(e.label);
}

// ─── Summary ──────────────────────────────────────────────────────
console.log("\n=== Phase 3 summary ===");
console.log(`Verified:        ${verified.length}  [${verified.join(", ")}]`);
if (alreadySettled.length > 0) {
  console.log(
    `  of which already-settled by others (state verified only): [${alreadySettled.join(", ")}]`,
  );
}
if (skipped.length > 0) {
  console.log(
    `Skipped:         ${skipped.length}  [${skipped.join(", ")}]  — Signa not yet Finalized; re-run after dispute window closes`,
  );
} else {
  console.log(`Skipped:         0`);
}

if (skipped.length === 0 && verified.length === state.policies.length) {
  console.log(
    "\n✓ All three Signa outcomes (Hit / Miss / Void) round-tripped end-to-end through CoverFi.",
  );
}
