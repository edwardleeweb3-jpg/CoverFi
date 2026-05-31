import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
  zeroAddress,
  type Hex,
} from "viem";
import { bscTestnet } from "viem/chains";
import CoverFiArtifact from "../artifacts/src/CoverFiPolicy.sol/CoverFiPolicy.json" with { type: "json" };

/**
 * Segment 5 Phase 5A.4 integration test — Phase 1 (bet + buyPolicy).
 *
 * Drives the three Signa Pulse beta test markets through:
 *   1. tUSDC.approve(market, bet)
 *   2. market.bet(option=0, bet, referrer=0x0)
 *   3. read effectiveBet = market.userBets(us, 0)  (= post-fee net)
 *   4. quotePremium(effectiveBet, kBps=5000)
 *   5. tUSDC.approve(CoverFiPolicy, premium)
 *   6. coverFi.buyPolicy(market, 0, 5000) — captures policyId
 *   7. 8-field policy struct readback + dedup mapping + balance deltas
 *
 * Each market's outcome is persisted to scripts/5a4-state.json after
 * a successful buyPolicy so re-runs skip markets already done
 * (resumable on RPC blips / single-market failures; the dedup mapping
 * would PositionAlreadyInsured-revert without this).
 *
 * Phase 2 (settleByCreator + advanceStatus to Finalized) is Signa's
 * job, not ours. Phase 3 (settleByOnChainRead + outcome verification)
 * is a separate script written after Phase 1 ships + Signa settles.
 *
 * Usage:
 *   cd contracts
 *   node scripts/it-5a4-bet-and-buy.ts
 *
 * Requires in .env: PRIVATE_KEY (project EOA), BSC_TESTNET_RPC_URL.
 */

// ─── Constants ────────────────────────────────────────────────────
const COVER_FI = "0x93F92688C5feA2C5530cddeaf796b40b4Fab72f2" as const;
const TUSDC = "0xc03d7EA305485421e444070260D68ee598C1719c" as const;
const SIGNA_FACTORY = "0xD23323a906F6d6d28224a37Cc963d55678AA7E65" as const;
const EXPECTED_DEPLOYER =
  "0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827" as const;

const MARKETS = [
  {
    label: "A",
    address: "0x372D0637Db517b4C3b5E71ed8ACDE62947c8cf4f",
    expectedOutcome: "Hit",
  },
  {
    label: "B",
    address: "0x17aa19Fb1EbA830a4369065a6a5D0970C95f3f42",
    expectedOutcome: "Miss",
  },
  {
    label: "C",
    address: "0x8a855581Da8ABff55DF37DA73B6A44f46D0Dd7Dc",
    expectedOutcome: "Void",
  },
] as const;

const BET_AMOUNT_WEI = parseUnits("100", 18); // 100 tUSDC per market
const K_BPS = 5000;
const CLAIM_OPTION = 0;
const REFERRER = zeroAddress;

// Pre-flight thresholds
const MIN_TBNB_WEI = parseUnits("0.05", 18);
const MIN_TUSDC_WEI = parseUnits("400", 18); // 3×bet + 3×premium + buffer
const BETTING_CLOSE_BUFFER_SEC = 300n;

const STATE_PATH = fileURLToPath(new URL("./5a4-state.json", import.meta.url));

// ─── Minimal ABIs ─────────────────────────────────────────────────
const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
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
    name: "bettingCloseTime",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "userBets",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "option", type: "uint8" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "bet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "option", type: "uint8" },
      { name: "amount", type: "uint256" },
      { name: "referrer", type: "address" },
    ],
    outputs: [],
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

function loadState(): State | null {
  if (!existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
  } catch (e) {
    fail(`state JSON exists but cannot parse: ${(e as Error).message}`);
  }
}
function saveState(s: State) {
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + "\n");
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
  client: { public: publicClient, wallet: walletClient },
});
const coverFi = getContract({
  address: COVER_FI,
  abi: CoverFiArtifact.abi,
  client: { public: publicClient, wallet: walletClient },
});

// ─── Header ───────────────────────────────────────────────────────
console.log("=== Phase 5A.4 / Phase 1 — bet + buyPolicy ===");
console.log(`Deployer:       ${account.address}`);
console.log(`CoverFiPolicy:  ${COVER_FI}`);
console.log(`tUSDC:          ${TUSDC}`);
console.log(
  `Per market:     ${formatUnits(BET_AMOUNT_WEI, 18)} tUSDC bet, kBps=${K_BPS}, claimOption=${CLAIM_OPTION}`,
);
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

const tUsdcBal = (await tUsdc.read.balanceOf([account.address])) as bigint;
check(
  tUsdcBal >= MIN_TUSDC_WEI,
  `tUSDC balance ≥ ${formatUnits(MIN_TUSDC_WEI, 18)} (3 bet + 3 premium + buffer)`,
  `actual: ${formatUnits(tUsdcBal, 18)} tUSDC`,
);

const usdcOnChain = await coverFi.read.usdc();
check(eqAddr(usdcOnChain as string, TUSDC), `CoverFi.usdc() == Signa tUSDC`);
const factoryOnChain = await coverFi.read.signaFactory();
check(
  eqAddr(factoryOnChain as string, SIGNA_FACTORY),
  `CoverFi.signaFactory() == Signa beta factory`,
);

const nowSec = BigInt(Math.floor(Date.now() / 1000));
for (const m of MARKETS) {
  console.log(`  market ${m.label} (${m.address}):`);
  const market = getContract({
    address: m.address as `0x${string}`,
    abi: pulseAbi,
    client: { public: publicClient },
  });
  const status = (await market.read.status()) as number;
  check(status === 1, `    status == Running`, `got ${status}`);
  const close = (await market.read.bettingCloseTime()) as bigint;
  check(
    close > nowSec + BETTING_CLOSE_BUFFER_SEC,
    `    bettingCloseTime > now + ${BETTING_CLOSE_BUFFER_SEC}s`,
    `close=${new Date(Number(close) * 1000).toISOString()}, now=${new Date(Number(nowSec) * 1000).toISOString()}`,
  );
}

// ─── Init / load state ────────────────────────────────────────────
let state = loadState();
if (state) {
  console.log("\n─── State JSON found — verifying consistency ──────────");
  check(
    eqAddr(state.owner, account.address),
    `state.owner matches current deployer`,
    `state=${state.owner}, current=${account.address}`,
  );
  check(
    state.kBps === K_BPS,
    `state.kBps matches`,
    `state=${state.kBps}, script=${K_BPS}`,
  );
  check(
    state.betAmountWei === BET_AMOUNT_WEI.toString(),
    `state.betAmountWei matches`,
    `state=${state.betAmountWei}, script=${BET_AMOUNT_WEI}`,
  );
  console.log(`  found ${state.policies.length} existing policy entries`);
} else {
  state = {
    createdAt: new Date().toISOString(),
    owner: account.address,
    kBps: K_BPS,
    betAmountWei: BET_AMOUNT_WEI.toString(),
    policies: [],
  };
}

// ─── Per-market loop ──────────────────────────────────────────────
for (const m of MARKETS) {
  console.log(`\n─── Phase 1 / Market ${m.label} (${m.address}) ───`);

  // Resume guard — skip if already done.
  const existing = state.policies.find((p) => p.label === m.label);
  if (existing && existing.policyId && existing.policyId !== "") {
    console.log(
      `  skip — already done (policyId=${existing.policyId}, buyTx=${existing.buyTx})`,
    );
    continue;
  }

  const market = getContract({
    address: m.address as `0x${string}`,
    abi: pulseAbi,
    client: { public: publicClient, wallet: walletClient },
  });

  // 1. approve tUSDC for the Signa market
  const approveBetTx = await tUsdc.write.approve([
    m.address as `0x${string}`,
    BET_AMOUNT_WEI,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: approveBetTx });
  console.log(
    `  ✓ tUSDC.approve(market, ${formatUnits(BET_AMOUNT_WEI, 18)} tUSDC)  tx ${approveBetTx}`,
  );

  // 2. place bet
  const betTx = await market.write.bet([
    CLAIM_OPTION,
    BET_AMOUNT_WEI,
    REFERRER,
  ]);
  const betReceipt = await publicClient.waitForTransactionReceipt({
    hash: betTx,
  });
  check(
    betReceipt.status === "success",
    `market.bet(${CLAIM_OPTION}, ${formatUnits(BET_AMOUNT_WEI, 18)}, 0x0)  tx ${betTx}`,
  );

  // 3. read effectiveBet (net of entry fee per FAQ §B) — pin to
  //    betReceipt.blockNumber so a load-balanced RPC backend can't
  //    serve a stale "latest" that misses our bet.
  const effectiveBet = (await market.read.userBets(
    [account.address, CLAIM_OPTION],
    { blockNumber: betReceipt.blockNumber },
  )) as bigint;
  console.log(
    `     userBets(us, ${CLAIM_OPTION}) @ block ${betReceipt.blockNumber} = ${effectiveBet}  (${formatUnits(effectiveBet, 18)} tUSDC)`,
  );
  check(
    effectiveBet > 0n,
    `effectiveBet > 0  (D1(b) precondition for buyPolicy)`,
  );

  // 4. quotePremium (pure view — block tag not needed; Q is immutable
  //    snapshot to caller's view of the moment).
  const [baseAmt, floorAmt, premium] = (await coverFi.read.quotePremium([
    effectiveBet,
    K_BPS,
  ])) as readonly [bigint, bigint, bigint];
  console.log(
    `     quotePremium: base=${formatUnits(baseAmt, 18)}, floor=${formatUnits(floorAmt, 18)}, premium=${formatUnits(premium, 18)} tUSDC`,
  );

  // 5. approve tUSDC for CoverFi (exact)
  const approvePremTx = await tUsdc.write.approve([COVER_FI, premium]);
  await publicClient.waitForTransactionReceipt({ hash: approvePremTx });
  console.log(
    `  ✓ tUSDC.approve(coverFi, ${formatUnits(premium, 18)} tUSDC)  tx ${approvePremTx}`,
  );

  // 6. buyPolicy — no pre-read; balance deltas reconstructed below
  //    via blockNumber pinning, race-free.
  const buyTx = await coverFi.write.buyPolicy([
    m.address as `0x${string}`,
    CLAIM_OPTION,
    K_BPS,
  ]);
  const buyReceipt = await publicClient.waitForTransactionReceipt({
    hash: buyTx,
  });
  check(
    buyReceipt.status === "success",
    `coverFi.buyPolicy(market, ${CLAIM_OPTION}, ${K_BPS})  tx ${buyTx}`,
  );

  // 7. parse PolicyMinted → policyId
  const mintedLogs = parseEventLogs({
    abi: CoverFiArtifact.abi,
    eventName: "PolicyMinted",
    logs: buyReceipt.logs,
  });
  check(mintedLogs.length === 1, `PolicyMinted event emitted once`);
  const policyId = (mintedLogs[0] as any).args.policyId as bigint;
  console.log(`     policyId = ${policyId}  @ block ${buyReceipt.blockNumber}`);

  // 8. policy struct readback (all 8 load-bearing fields) — pinned to
  //    buyReceipt.blockNumber.
  // tuple layout: [owner, status, kBps, mintedAt, settledAt,
  //                signaMarket, claimOption, principal, premium, claimed]
  const tup = (await coverFi.read.policies(
    [policyId],
    { blockNumber: buyReceipt.blockNumber },
  )) as readonly [
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
  check(eqAddr(tup[0], account.address), `policy.owner == us`);
  check(tup[1] === 0, `policy.status == Active (0)`);
  check(tup[2] === K_BPS, `policy.kBps == ${K_BPS}`);
  check(eqAddr(tup[5], m.address), `policy.signaMarket == market`);
  check(tup[6] === CLAIM_OPTION, `policy.claimOption == ${CLAIM_OPTION}`);
  check(
    tup[7] === effectiveBet,
    `policy.principal == effectiveBet  (D1(c) chain link)`,
    `policy=${tup[7]}, userBets=${effectiveBet}`,
  );
  check(
    tup[8] === premium,
    `policy.premium == quotePremium`,
    `policy=${tup[8]}, quoted=${premium}`,
  );
  check(tup[9] === 0n, `policy.claimed == 0`);

  // 9. dedup mapping — pinned to buyReceipt.blockNumber.
  const lookupId = (await coverFi.read.policyIdByPosition(
    [m.address as `0x${string}`, account.address, CLAIM_OPTION],
    { blockNumber: buyReceipt.blockNumber },
  )) as bigint;
  check(
    lookupId === policyId,
    `policyIdByPosition[m][us][${CLAIM_OPTION}] == ${policyId}`,
  );

  // 10. balance deltas — read at deterministic block pair so a
  //     load-balanced RPC can't show two reads on different heights.
  //     before = buyReceipt.blockNumber - 1 (state just after the
  //     approve receipt + before buyPolicy was mined);
  //     after  = buyReceipt.blockNumber (state including buyPolicy).
  const beforeBlock = buyReceipt.blockNumber - 1n;
  const afterBlock = buyReceipt.blockNumber;
  const [usBalBefore, coverBalBefore, usBalAfter, coverBalAfter] =
    (await Promise.all([
      tUsdc.read.balanceOf([account.address], { blockNumber: beforeBlock }),
      tUsdc.read.balanceOf([COVER_FI], { blockNumber: beforeBlock }),
      tUsdc.read.balanceOf([account.address], { blockNumber: afterBlock }),
      tUsdc.read.balanceOf([COVER_FI], { blockNumber: afterBlock }),
    ])) as [bigint, bigint, bigint, bigint];
  check(
    usBalBefore - usBalAfter === premium,
    `us tUSDC delta == -premium  (block ${beforeBlock} → ${afterBlock})`,
    `delta=${usBalBefore - usBalAfter}, premium=${premium}`,
  );
  check(
    coverBalAfter - coverBalBefore === premium,
    `coverFi tUSDC delta == +premium  (block ${beforeBlock} → ${afterBlock})`,
    `delta=${coverBalAfter - coverBalBefore}, premium=${premium}`,
  );

  // 11. persist (overwrite any prior partial entry with this label)
  const entry: PolicyEntry = {
    label: m.label,
    market: m.address as `0x${string}`,
    expectedOutcome: m.expectedOutcome,
    effectiveBetWei: effectiveBet.toString(),
    betTx,
    policyId: policyId.toString(),
    premiumWei: premium.toString(),
    buyTx,
  };
  state.policies = [
    ...state.policies.filter((p) => p.label !== m.label),
    entry,
  ];
  saveState(state);
  console.log(`  written to ${STATE_PATH}  (${state.policies.length} entries)`);
}

// ─── Summary ──────────────────────────────────────────────────────
console.log("\n=== Phase 1 complete ===");
console.log("Tell Signa to settle:");
for (const p of state.policies) {
  console.log(`  - ${p.label} (${p.market}) → ${p.expectedOutcome}`);
}
console.log("\nWhen Signa reports settle done + dispute windows passed,");
console.log("Phase 3 will run settleByOnChainRead + verify outcomes.");
