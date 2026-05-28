import "dotenv/config";
import { createPublicClient, http, getContract } from "viem";
import { bscTestnet } from "viem/chains";
import CoverFiArtifact from "../artifacts/src/CoverFiPolicy.sol/CoverFiPolicy.json" with { type: "json" };

/**
 * Segment 5 — read-back configuration check. Verifies the freshly-
 * deployed CoverFiPolicy has the expected immutable wiring and role
 * grants. Run BEFORE seeding the payout pool — a misconfigured
 * contract is a money trap.
 *
 *   node scripts/verify-coverfi-config.ts
 *
 * Exits non-zero on any mismatch.
 */

// Deployed in 5B.8 Phase B (block 109,977,745, tx
// 0xad222c1950aa95c6c7f067ea77b28c1998868742591ba644b4a834d9a0c58aaa).
const COVER_FI = "0x93F92688C5feA2C5530cddeaf796b40b4Fab72f2" as `0x${string}`;

// Expected immutables / config — Segment 5.
// Source: src/lib/contracts/signa/addresses.ts + ignition/modules/CoverFiPolicy.ts
const EXPECTED_USDC = "0xc03d7EA305485421e444070260D68ee598C1719c" as const;
const EXPECTED_SIGNA_FACTORY =
  "0xD23323a906F6d6d28224a37Cc963d55678AA7E65" as const;
const EXPECTED_ADMIN = "0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827" as const;
const EXPECTED_QBPS = 5000n;

if (COVER_FI === "0x0000000000000000000000000000000000000000") {
  console.error(
    "CoverFiPolicy address not set yet. Edit COVER_FI in " +
      "scripts/verify-coverfi-config.ts after the 5B.8 deploy step.",
  );
  process.exit(1);
}

const rpcUrl =
  process.env.BSC_TESTNET_RPC_URL ||
  "https://data-seed-prebsc-1-s1.binance.org:8545/";
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(rpcUrl),
});

const coverFi = getContract({
  address: COVER_FI,
  abi: CoverFiArtifact.abi,
  client,
});

const usdc = (await coverFi.read.usdc()) as `0x${string}`;
const signaFactory = (await coverFi.read.signaFactory()) as `0x${string}`;
const qBps = (await coverFi.read.qBps()) as bigint;
const DEFAULT_ADMIN_ROLE =
  (await coverFi.read.DEFAULT_ADMIN_ROLE()) as `0x${string}`;
const adminHasRole = (await coverFi.read.hasRole([
  DEFAULT_ADMIN_ROLE,
  EXPECTED_ADMIN,
])) as boolean;
const nextPolicyId = (await coverFi.read.nextPolicyId()) as bigint;

const usdcMatches = usdc.toLowerCase() === EXPECTED_USDC.toLowerCase();
const signaFactoryMatches =
  signaFactory.toLowerCase() === EXPECTED_SIGNA_FACTORY.toLowerCase();
const qBpsMatches = qBps === EXPECTED_QBPS;
const idFresh = nextPolicyId === 1n;

console.log("─── CoverFiPolicy config readback (Segment 5) ───");
console.log(`address                ${COVER_FI}`);
console.log(
  `usdc()                 ${usdc}   ${usdcMatches ? "✓" : "✗ MISMATCH"}`,
);
console.log(
  `signaFactory()         ${signaFactory}   ${signaFactoryMatches ? "✓" : "✗ MISMATCH"}`,
);
console.log(
  `qBps()                 ${qBps}                                   ${qBpsMatches ? "✓" : "✗ MISMATCH"}`,
);
console.log(
  `nextPolicyId()         ${nextPolicyId}                                      ${idFresh ? "✓" : "✗ (not fresh)"}`,
);
console.log(
  `admin has DEFAULT_ADMIN_ROLE   ${adminHasRole ? "✓" : "✗"}   (${EXPECTED_ADMIN})`,
);

if (!usdcMatches || !signaFactoryMatches || !qBpsMatches || !adminHasRole || !idFresh) {
  console.error("\nFAILED — see ✗ above. Do NOT proceed to payout-pool seeding.");
  process.exit(1);
}
console.log("\nAll checks passed. Safe to run transfer-payout-pool.ts.");
