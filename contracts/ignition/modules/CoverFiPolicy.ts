import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Segment 5 deploy of CoverFiPolicy. Constructor wiring:
 *   _usdc         = 0xc03d7E… (Signa Pulse beta tUSDC, 18 decimals)
 *   _signaFactory = 0xD23323… (Signa Pulse beta factory registry)
 *   _admin        = 0x06AdF… (project EOA — mainnet requires multisig
 *                  + 24-48h timelock per AUDIT.md)
 *   _initialQBps  = 5000 (PRD §3.2 default Q = 0.5)
 *
 * Post-deploy payout-pool seeding happens out-of-module via
 * scripts/transfer-payout-pool.ts so the reserve size isn't baked
 * into the deployment record.
 *
 * Addresses cross-checked against:
 *   - _docs/2026-05-26-signa-pulse-integration-faq.md §A + §E + §F
 *   - src/lib/contracts/signa/addresses.ts (SIGNA_CONTRACTS[97])
 *
 * Deploy under a fresh deployment-id (`--deployment-id
 * segment5-bsctestnet`) to keep v1's `chain-97/` Ignition record
 * intact as history; `package.json`'s `deploy:testnet` script bakes
 * that flag in.
 */
const SIGNA_USDC = "0xc03d7EA305485421e444070260D68ee598C1719c";
const SIGNA_FACTORY = "0xD23323a906F6d6d28224a37Cc963d55678AA7E65";
const PROJECT_ADDRESS = "0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827";
const INITIAL_Q_BPS = 5000n;

export default buildModule("CoverFiPolicyModule", (m) => {
  const coverFi = m.contract("CoverFiPolicy", [
    SIGNA_USDC,
    SIGNA_FACTORY,
    PROJECT_ADDRESS,
    INITIAL_Q_BPS,
  ]);
  return { coverFi };
});
