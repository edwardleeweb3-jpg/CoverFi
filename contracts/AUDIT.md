# CoverFi contracts — security audit log

**Scope:** `src/CoverFiPolicy.sol`, `src/MockUSDC.sol`. The test-only
`src/test/ReentrantUSDC.sol` is reviewed for test-correctness but
excluded from production-readiness assessment (never deployed).

**Methodology:** two independent passes — one by an external technical
mentor, one by Claude — across the dimensions: reentrancy, integer /
precision, permissions, orderHash reuse, ERC20 edge cases,
`block.timestamp`, fund safety. Findings are deduplicated below.

**Outcome:** all "fix" items shipped before the BSC Testnet deploy.
The remaining items are explicit v1-scope acceptances or items
deferred to a post-v1 hardening pass; none are blockers for a no-real-
funds testnet.

| Severity | Finding | Status | Fix commit | Verification |
|---|---|---|---|---|
| **High** | `rescueToken` (admin escape hatch) was missing — mis-sent tokens would be permanently stuck, and PRD §8.2's project-side payout-pool was un-rebalanceable | Fixed — added `rescueToken(IERC20, address, uint256)` gated by `DEFAULT_ADMIN_ROLE`, with zero-address check and `TokenRescued` event | (this commit) | `rescueToken › admin can rescue the protocol's own USDC`, `… rescue an unrelated ERC20`, `… non-admin caller is rejected`, `… reverts when to is the zero address` |
| **High** | `rescueToken` deliberately accepts `token == usdc` → admin can drain the payout pool, including funds backing live policies | **Accepted (v1 scope).** The capability is required for testnet payout-pool management and protocol wind-down. **Mitigation: mainnet `DEFAULT_ADMIN_ROLE` MUST be held by a multisig.** Strongly recommend layering a timelock (e.g. 24-48h) on top before any mainnet promotion. Tracked in `README.md` "Known limitations" and contract NatSpec on `rescueToken` | (this commit) | n/a — operational mitigation, not a code change |
| **High** | No on-chain solvency guarantee — premiums collected are << maximum payout (100% principal). PRD §9.1 explicitly notes this | **Accepted (known / out of v1 scope).** Testnet uses pre-funded payout pool via `rescueToken`'s inverse (project deposits USDC directly to the contract). Mainnet requires a separate solvency mechanism (capital pool, reinsurance, parametric caps) — design lives outside the contract layer. Per PRD §9.1 and CLAUDE.md §8 | n/a | n/a |
| **High** | Settlement authority concentrated in `SETTLER_ROLE` (v1 = a project EOA); a compromised / malicious settler can falsely settle policies to Hit (no payout) or trigger refunds. AND `buyPolicy` accepts caller-supplied `kBps` at face value (no signed quote). AND `orderHash` is not verified against the actual Signa order. **Combined**, these mean v1 cannot safely hold real user funds: the integrity of the insurance product depends entirely on off-chain trust in the settler + on the frontend honestly computing k + on a not-yet-built Signa adapter | **Accepted (known / v1 scope).** v1 ships as a testnet demonstration; real insurance integrity is delivered by **Segment 5** (Signa adapter migration: `grantRole(SETTLER_ROLE, signaAdapter)` + `revokeRole(SETTLER_ROLE, projectEOA)`) plus the **pre-mainnet signed-quote upgrade** (the `QUOTER_ROLE` constant is already present in the v1 ABI for this exact purpose). Documented in contract NatSpec on `triggerSettlement`, `buyPolicy`, and `QUOTER_ROLE` | n/a | n/a |
| **Low** | `pragma solidity ^0.8.28` was a floating range — a contributor on a newer 0.8.x toolchain could compile against a different compiler than the one we tested and verified on BscScan | Fixed — pinned to `pragma solidity 0.8.28` across `CoverFiPolicy.sol`, `MockUSDC.sol`, `src/test/ReentrantUSDC.sol` | (this commit) | All 63 tests still pass on the pinned version |
| **Low** | Constructor lacked zero-address validation. `_usdc` would lock the contract into an unusable state (every transfer reverts); `_admin == 0` would orphan admin authority forever; `_settler == 0` would block all settlements | Fixed — added `ZeroAddress()` custom error and three pre-checks at the top of the constructor | (this commit) | `constructor + roles › reverts when _usdc is the zero address`, `… _admin …`, `… _settler …` |
| **Low** | File-level NatSpec on `CoverFiPolicy.sol` still described the contract as a "B2 skeleton" with business actions "land[ing] in Phases B3 / B4 / B5", which became stale once B3–B5 actually shipped | Fixed — rewrote the file-level header to describe the contract as it now exists | (this commit) | n/a (doc only) |
| **Info** | No `nonReentrant` on `buyPolicy` or `triggerSettlement`. Strict CEI mitigates reentrancy in practice (state writes + events before the external `safeTransferFrom`/`safeTransfer`), and MockUSDC / real USDC don't have transfer hooks | **Evaluated, deferred past v1.** Defense-in-depth would add the modifier (~2k gas per call) and reduce reasoning load if a future change introduces a non-CEI path. Tracked as a pre-mainnet hardening item | n/a | n/a |
| **Info** | `buyPolicy` lacks a `maxPremium` slippage guard. A racing `setQ` between quote-time and tx-mine-time could change `qBps`, surprising the buyer with a higher premium | **Evaluated, deferred past v1.** v1 attack surface is low — Q changes are admin-driven and infrequent. Pre-mainnet upgrade can add a `maxPremium` argument to `buyPolicy` (or fold it into the signed quote model alongside `QUOTER_ROLE` work) | n/a | n/a |
| **Info** | `MockUSDC` has a permissionless `mint()` (anyone can self-faucet) | **Accepted (by design).** Testnet faucet convenience. Never deployed to mainnet — `CoverFiPolicy`'s `usdc` constructor arg swaps to real USDC there | n/a | `MockUSDC › mint() is permissionless — any wallet can faucet anyone` |
| **Info** | Fee-on-transfer and rebasing ERC20 tokens would break premium / payout accounting. The contract assumes "amount transferred == amount recorded" | **Out of scope.** Real USDC and MockUSDC are plain ERC20s. Documented in `README.md` "Design pointers" — `usdc` constructor arg is expected to be a vanilla ERC20 |  n/a | n/a |
| **Info** | A USDC-blacklisted owner cannot receive `claim` payouts (the `safeTransfer` reverts). This is USDC's policy, not a CoverFi bug, but worth noting for ops | **Accepted (USDC behaviour).** No code change. Operationally we'd `rescueToken` the trapped funds and reissue off-chain | n/a | n/a |
| **Info** | Miner manipulation of `block.timestamp` (±15s) on the settlement timestamp shifts release start. Over a 365-day linear release that's ~5×10⁻⁵ % — negligible | **Accepted (no code change).** Within the protocol's tolerance | n/a | n/a |

## Notes for the Phase D deploy + Phase E wire-up

- **The mainnet `DEFAULT_ADMIN_ROLE` holder is a multisig.** Non-negotiable; the rescue capability + Q-tuning power require it. A 24–48h timelock on top is strongly recommended.
- The constructor's `_initialQBps`, `_admin`, `_settler`, and `_usdc` are all checked at deploy time — the deploy script will fail clearly rather than producing a half-broken contract.
- `nonReentrant` on `rescueToken` matches `claim`'s defensive style — adding it now means a future change can introduce another non-CEI path here without re-auditing the reentrancy stance.
- The `QUOTER_ROLE` constant ships in the v1 ABI even though no code currently checks it. This keeps the post-v1 signed-quote upgrade a one-contract-edit rather than an ABI-breaking re-deploy.
