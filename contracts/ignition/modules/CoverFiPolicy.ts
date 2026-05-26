import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * D3 — deploy CoverFiPolicy with the testnet wiring:
 *   _usdc        = MockUSDC address from D2
 *   _admin       = project deployer address
 *   _settler     = project deployer address (v1: same wallet)
 *   _initialQBps = 5000  (PRD §3.2 default Q = 0.5)
 *
 * The post-deploy USDC transfer (project-side payout-pool injection)
 * happens out-of-module via scripts/transfer-payout-pool.ts so we
 * don't bake a particular reserve size into the deployment record.
 */
const USDC_ADDRESS = "0xb1DC4F171091D2b3d94a8B14be8cc663fD994e73";
const PROJECT_ADDRESS = "0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827";
const INITIAL_Q_BPS = 5000n;

export default buildModule("CoverFiPolicyModule", (m) => {
  const coverFi = m.contract("CoverFiPolicy", [
    USDC_ADDRESS,
    PROJECT_ADDRESS,
    PROJECT_ADDRESS,
    INITIAL_Q_BPS,
  ]);
  return { coverFi };
});
