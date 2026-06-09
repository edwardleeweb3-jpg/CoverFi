# CoverFi

Onchain principal insurance for Signa prediction-market positions on
BSC Testnet. If the insured option settles as a miss, the protocol
returns 100% of the principal to the investor, released linearly over
365 days. Premium and payouts run through `CoverFiPolicy` on chain.

Live: **https://cover-fi.vercel.app**

## Current handoff status

- Target environment: BSC Testnet only. This is not mainnet-ready.
- Frontend: Next.js 16 + React 19 + wagmi/viem + Supabase mirror.
- Contracts: Hardhat 3 + Solidity 0.8.28. The active BSC Testnet
  `CoverFiPolicy` is the Signa Pulse-aware v2 deployment recorded in
  `src/lib/contracts/addresses.ts`.
- Verification baseline before engineering handoff:
  - `npm.cmd run lint`
  - `npm.cmd run build`
  - `cd contracts && npm.cmd test`

For professional handoff, start with
[`_docs/HANDOFF_FOR_ENGINEERING_TEAM.md`](./_docs/HANDOFF_FOR_ENGINEERING_TEAM.md).
For architecture, project structure, contract addresses, and working
conventions, see [`CLAUDE.md`](./CLAUDE.md).
