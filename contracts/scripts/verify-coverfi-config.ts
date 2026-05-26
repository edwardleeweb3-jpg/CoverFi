import "dotenv/config";
import { createPublicClient, http, getContract } from "viem";
import { bscTestnet } from "viem/chains";
import CoverFiArtifact from "../artifacts/src/CoverFiPolicy.sol/CoverFiPolicy.json" with { type: "json" };

/**
 * D3 — read-back configuration check. Verifies the just-deployed
 * CoverFiPolicy has the expected USDC address, Q dial, and role grants.
 */

const COVER_FI = "0xEbdd8f124EaD6DABd7C5F3893E2A244280fE5b19" as const;
const EXPECTED_USDC = "0xb1DC4F171091D2b3d94a8B14be8cc663fD994e73" as const;
const EXPECTED_ADMIN = "0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827" as const;
const EXPECTED_SETTLER = "0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827" as const;
const EXPECTED_QBPS = 5000n;

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
const qBps = (await coverFi.read.qBps()) as bigint;
const DEFAULT_ADMIN_ROLE = (await coverFi.read.DEFAULT_ADMIN_ROLE()) as `0x${string}`;
const SETTLER_ROLE = (await coverFi.read.SETTLER_ROLE()) as `0x${string}`;
const adminHasRole = (await coverFi.read.hasRole([
  DEFAULT_ADMIN_ROLE,
  EXPECTED_ADMIN,
])) as boolean;
const settlerHasRole = (await coverFi.read.hasRole([
  SETTLER_ROLE,
  EXPECTED_SETTLER,
])) as boolean;
const nextPolicyId = (await coverFi.read.nextPolicyId()) as bigint;

const usdcMatches = usdc.toLowerCase() === EXPECTED_USDC.toLowerCase();
const qBpsMatches = qBps === EXPECTED_QBPS;

console.log("─── CoverFiPolicy config readback ───");
console.log(`address          ${COVER_FI}`);
console.log(`usdc()           ${usdc}            ${usdcMatches ? "✓" : "✗ MISMATCH"}`);
console.log(`qBps()           ${qBps}                                   ${qBpsMatches ? "✓" : "✗ MISMATCH"}`);
console.log(`nextPolicyId()   ${nextPolicyId}                                      ${nextPolicyId === 1n ? "✓" : "✗"}`);
console.log(`admin has DEFAULT_ADMIN_ROLE   ${adminHasRole ? "✓" : "✗"}  (${EXPECTED_ADMIN})`);
console.log(`settler has SETTLER_ROLE       ${settlerHasRole ? "✓" : "✗"}  (${EXPECTED_SETTLER})`);

if (!usdcMatches || !qBpsMatches || !adminHasRole || !settlerHasRole || nextPolicyId !== 1n) {
  console.error("\nFAILED — see ✗ above");
  process.exit(1);
}
console.log("\nAll checks passed.");
