# CoverFi

Onchain principal insurance for Signa prediction-market positions on
BSC Testnet. If the insured option settles as a miss, the protocol
returns 100% of the principal to the investor, released linearly over
365 days. Premium and payouts run through `CoverFiPolicy` on chain.

Live: **https://cover-fi.vercel.app**

For architecture, project structure, contract addresses, and
working conventions, see [`CLAUDE.md`](./CLAUDE.md).
