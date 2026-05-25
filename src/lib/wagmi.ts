import { createConfig, http, injected } from "wagmi";
import { bscTestnet } from "wagmi/chains";

/**
 * Target chain for v1 — BSC Testnet (PRD §1.3). Switching to mainnet
 * is a one-line change here once we're ready.
 */
export const TARGET_CHAIN = bscTestnet;

/**
 * wagmi config — single-chain (BSC Testnet) + injected connector only.
 *
 * `injected()` covers EIP-1193 browser-extension wallets (MetaMask, Rabby,
 * Trust, Coinbase Wallet, etc.) and auto-detects EIP-6963 announcements,
 * so each installed wallet shows up as its own named connector in the
 * picker. We deliberately skip WalletConnect at this step to avoid the
 * extra project-ID configuration.
 */
export const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [injected()],
  transports: {
    [bscTestnet.id]: http(),
  },
});
