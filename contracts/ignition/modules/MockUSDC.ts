import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * D2 — deploy the testnet faucet token only. CoverFiPolicy is its
 * own separate module (lands in D3) so we can verify MockUSDC on
 * BscScan and pre-fund balances independently.
 */
export default buildModule("MockUSDCModule", (m) => {
  const mockUSDC = m.contract("MockUSDC");
  return { mockUSDC };
});
