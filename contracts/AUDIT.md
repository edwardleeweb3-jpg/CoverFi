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
| **High** | `rescueToken` (admin escape hatch) was missing — mis-sent tokens would be permanently stuck, and PRD §8.2's project-side payout-pool was un-rebalanceable | Fixed — added `rescueToken(IERC20, address, uint256)` gated by `DEFAULT_ADMIN_ROLE`, with zero-address check and `TokenRescued` event | `87d1a9b` | `rescueToken › admin can rescue the protocol's own USDC`, `… rescue an unrelated ERC20`, `… non-admin caller is rejected`, `… reverts when to is the zero address` |
| **High** | `rescueToken` deliberately accepts `token == usdc` → admin can drain the payout pool, including funds backing live policies | **Accepted (v1 scope).** The capability is required for testnet payout-pool management and protocol wind-down. **Mitigation: mainnet `DEFAULT_ADMIN_ROLE` MUST be held by a multisig.** Strongly recommend layering a timelock (e.g. 24-48h) on top before any mainnet promotion. Tracked in `README.md` "Known limitations" and contract NatSpec on `rescueToken` | `87d1a9b` | n/a — operational mitigation, not a code change |
| **High** | No on-chain solvency guarantee — premiums collected are << maximum payout (100% principal). PRD §9.1 explicitly notes this | **Accepted (known / out of v1 scope).** Testnet uses pre-funded payout pool via `rescueToken`'s inverse (project deposits USDC directly to the contract). Mainnet requires a separate solvency mechanism (capital pool, reinsurance, parametric caps) — design lives outside the contract layer. Per PRD §9.1 and CLAUDE.md §8 | n/a | n/a |
| **High** | Settlement authority concentrated in `SETTLER_ROLE` (v1 = a project EOA); a compromised / malicious settler can falsely settle policies to Hit (no payout) or trigger refunds. AND `buyPolicy` accepts caller-supplied `kBps` at face value (no signed quote). AND `orderHash` is not verified against the actual Signa order. **Combined**, these mean v1 cannot safely hold real user funds: the integrity of the insurance product depends entirely on off-chain trust in the settler + on the frontend honestly computing k + on a not-yet-built Signa adapter | **Accepted (known / v1 scope).** v1 ships as a testnet demonstration; real insurance integrity is delivered by **Segment 5** (Signa adapter migration: `grantRole(SETTLER_ROLE, signaAdapter)` + `revokeRole(SETTLER_ROLE, projectEOA)`) plus the **pre-mainnet signed-quote upgrade** (the `QUOTER_ROLE` constant is already present in the v1 ABI for this exact purpose). Documented in contract NatSpec on `triggerSettlement`, `buyPolicy`, and `QUOTER_ROLE` | n/a | n/a |
| **Low** | `pragma solidity ^0.8.28` was a floating range — a contributor on a newer 0.8.x toolchain could compile against a different compiler than the one we tested and verified on BscScan | Fixed — pinned to `pragma solidity 0.8.28` across `CoverFiPolicy.sol`, `MockUSDC.sol`, `src/test/ReentrantUSDC.sol` | `87d1a9b` | All 63 tests still pass on the pinned version |
| **Low** | Constructor lacked zero-address validation. `_usdc` would lock the contract into an unusable state (every transfer reverts); `_admin == 0` would orphan admin authority forever; `_settler == 0` would block all settlements | Fixed — added `ZeroAddress()` custom error and three pre-checks at the top of the constructor | `87d1a9b` | `constructor + roles › reverts when _usdc is the zero address`, `… _admin …`, `… _settler …` |
| **Low** | File-level NatSpec on `CoverFiPolicy.sol` still described the contract as a "B2 skeleton" with business actions "land[ing] in Phases B3 / B4 / B5", which became stale once B3–B5 actually shipped | Fixed — rewrote the file-level header to describe the contract as it now exists | `87d1a9b` | n/a (doc only) |
| **Info** | No `nonReentrant` on `buyPolicy` or `triggerSettlement`. Strict CEI mitigates reentrancy in practice (state writes + events before the external `safeTransferFrom`/`safeTransfer`), and MockUSDC / real USDC don't have transfer hooks | **Evaluated, deferred past v1.** Defense-in-depth would add the modifier (~2k gas per call) and reduce reasoning load if a future change introduces a non-CEI path. Tracked as a pre-mainnet hardening item | n/a | n/a |
| **Info** | `buyPolicy` lacks a `maxPremium` slippage guard. A racing `setQ` between quote-time and tx-mine-time could change `qBps`, surprising the buyer with a higher premium | **Evaluated, deferred past v1.** v1 attack surface is low — Q changes are admin-driven and infrequent. Pre-mainnet upgrade can add a `maxPremium` argument to `buyPolicy` (or fold it into the signed quote model alongside `QUOTER_ROLE` work) | n/a | n/a |
| **Info** | `MockUSDC` has a permissionless `mint()` (anyone can self-faucet) | **Accepted (by design).** Testnet faucet convenience. Never deployed to mainnet — `CoverFiPolicy`'s `usdc` constructor arg swaps to real USDC there | n/a | `MockUSDC › mint() is permissionless — any wallet can faucet anyone` |
| **Info** | Fee-on-transfer and rebasing ERC20 tokens would break premium / payout accounting. The contract assumes "amount transferred == amount recorded" | **Out of scope.** Real USDC and MockUSDC are plain ERC20s. Documented in `README.md` "Design pointers" — `usdc` constructor arg is expected to be a vanilla ERC20 |  n/a | n/a |
| **Info** | A USDC-blacklisted owner cannot receive `claim` payouts (the `safeTransfer` reverts). This is USDC's policy, not a CoverFi bug, but worth noting for ops | **Accepted (USDC behaviour).** No code change. Operationally we'd `rescueToken` the trapped funds and reissue off-chain | n/a | n/a |
| **Info** | Miner manipulation of `block.timestamp` (±15s) on the settlement timestamp shifts release start. Over a 365-day linear release that's ~5×10⁻⁵ % — negligible | **Accepted (no code change).** Within the protocol's tolerance | n/a | n/a |

## Phase 5B.6 — Segment 5 audit pass

**Scope:** post-Segment-5 contract surface — `CoverFiPolicy.sol`
(buyPolicy redesign + settleByOnChainRead + min-cap +
SETTLER_ROLE removal) and the new Signa interface dependencies
(`signa/IPulseMarket.sol`, `signa/IPulseFactoryRegistry.sol`).
Two new mocks under `src/test/` reviewed for test-correctness,
excluded from production-readiness.

**Methodology:** independent code-trace audit across (a) Signa
trust assumptions, (b) buyPolicy bypass attempts, (c)
settleByOnChainRead griefing + four-branch exhaustiveness, (d)
per-policy and aggregate solvency walk-through, (e) rescueToken
reach, (f) access-control surface, (g) standard footguns
(reentry, overflow, release-math bounds, ctor).

**Outcome:** one new HIGH (option-range guaranteed-Miss drain)
plus one doc cleanup — both fixed in 5B.6. Two prior High items
resolved by Segment 5 contract changes.

| Severity | Finding | Status | Fix commit | Verification |
|---|---|---|---|---|
| **High** | `buyPolicy` accepted `uint8 claimOption` without checking it against the market's option count. For any `claimOption` not in `[0, optionCount-1]` — whether out-of-range by Signa's `placeBet` enforcement, by `optionCount > 128` (where `finalOption`'s int8 ceiling blocks Hit), or by the trivial `claimOption > 127` case — `settleByOnChainRead`'s `uint8(fin) == claimOption` comparison can never succeed. The Hit branch becomes unreachable, so any non-Void / non-Anomalous Finalized state routes to Miss. An attacker who can place a bet on such an option insures a guaranteed-loser position, collects near-full principal back via Miss release, and pays only the ~5% floor premium — money-printer attack against the payout pool, scalable with attacker capital. | **Fixed in 5B.6** — added `error ClaimOptionOutOfRange(uint8 claimOption, uint8 optionCount)` and a `claimOption < market.optionCount()` check in `buyPolicy` between the status gate and the userBets read. The check happens AFTER the factory bijection so we only call `optionCount()` into a verified Signa market. Closes both subsets (type-impossible `>127` and market-impossible `[optionCount, 127]`) without depending on Signa's `placeBet` validation. | TBD on commit | `buyPolicy › reverts ClaimOptionOutOfRange when claimOption == optionCount (just out of range)`, `… == 200 (far out — also covers int8 ceiling)`, `… accepts claimOption == optionCount - 1 (boundary; the largest valid option)` |
| **Low** | Several NatSpec lines went stale across Segment 5: `quotePremium` comments still said "6 decimals on testnet" (Segment 5 switched to 18-decimal tUSDC); `QUOTER_ROLE` doc described the signed-quote payload as `(orderHash, kBps, expiry)` (orderHash was removed in 5B.1). Doc-only drift. | **Fixed in 5B.6** — `quotePremium` overflow note updated to 18 decimals + reworked the safety bound (1e30 principal × 1e8 numerator factor ≪ uint256 max); `QUOTER_ROLE` doc generalized to "the canonical position descriptor + (kBps, expiry)". | TBD on commit | n/a (doc only) |

### Items resolved by Segment 5

The prior table's two related High items are now closed:

- **Settler authority concentrated** → resolved by 5B.4
  (`SETTLER_ROLE` + `triggerSettlement` deleted; settlement is
  now permissionless via `settleByOnChainRead`, with the outcome
  deterministic from on-chain Signa state). Commit `563fe0d`
  (also `570fd1a` introduced the replacement).
- **`orderHash` not verified against Signa** → resolved by 5B.1
  + 5B.2 (`orderHash` removed entirely; the insured position is
  identified by `(signaMarket, buyer, claimOption)` and verified
  at mint time via factory bijection + `market.status() ==
  Running` + `market.optionCount() > claimOption` +
  `market.userBets(buyer, option) > 0`). The `kBps`
  trust-the-caller residue remains on the pre-mainnet QUOTER_ROLE
  roadmap. Commit `586a66e` (option-count check added in 5B.6).

### Newly accepted Segment-5 risks

| Item | Disposition |
|---|---|
| Signa market never reaches `Finalized` → policy stuck Active forever | **Accepted v1.** Tracked in CLAUDE.md §9 as the "Signa stuck" item; pre-mainnet needs a multisig + timelock emergency-settle entrypoint. |
| Signa factory is UUPS-upgradable; an enum-reorder or ABI shift in a future upgrade would silently mis-read | **Accepted v1.** Mitigated by Signa's stated SemVer commitment (FAQ §F). Worst case is DoS for new policies; existing policies are unaffected (release math is internal to CoverFi). |
| Internal AI audit only (this audit included) | **Accepted v1.** Pre-mainnet requires a professional third-party engagement (already in the v1 audit list). |

## Phase D / E follow-through (now executed)

Both phases have shipped since the audit. Verifying the items above held up:

- **Mainnet multisig + timelock requirement** remains tracked — v1 testnet
  uses the project EOA at `0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827`,
  documented as such in `../CLAUDE.md` §5. No mainnet deploy yet.
- **Constructor pre-checks held up cleanly at deploy time** — the D3
  Ignition module passed valid args first try; the pre-deploy
  `scripts/check-deployer.ts` script provides additional address
  verification before any chain interaction.
- **`nonReentrant` on `rescueToken`** has not been exercised in practice
  (no rescue calls made on testnet), but the guard is in place.
- **`QUOTER_ROLE` constant** is in the v1 ABI; no holder, no call sites.
  The pre-mainnet signed-quote upgrade is tracked as a v1.x hardening
  item in `../CLAUDE.md` §8.

## Segment 5 / pre-mainnet upgrade map

How each accepted-as-known item gets resolved later:

| Item | Resolved by | Mechanism |
|---|---|---|
| Settler authority concentrated (v1 = project EOA) | **Resolved in 5B.4** | `SETTLER_ROLE` + `triggerSettlement` deleted; `settleByOnChainRead` is permissionless and deterministic from on-chain Signa state. Commit `563fe0d`. |
| `orderHash` not verified against Signa | **Resolved in 5B.1 + 5B.2 + 5B.6** | `orderHash` removed; position = (market, buyer, option), verified at mint time via factory bijection + status + optionCount + userBets. Commits `586a66e` + 5B.6 option-count check. |
| `kBps` trusted from caller | **Pre-mainnet upgrade** | Activate `QUOTER_ROLE`: backend signs `(orderHash, kBps, expiry)`; `buyPolicy` adds a `verifyQuote(...)` step. Contract change → new deploy → re-audit. |
| `rescueToken` can drain payout pool | **Mainnet operations** | `DEFAULT_ADMIN_ROLE` → multisig (e.g. 3-of-5) + 24–48h timelock. No code change. |
| No on-chain solvency guarantee | **Mainnet design** | Capital pool, reinsurance, or parametric caps — design lives outside the contract layer. Out of v1 scope (PRD §9.1). |
| No professional audit | **Pre-mainnet** | Engage a security firm; address findings; re-deploy if needed. |
| `nonReentrant` not on buyPolicy / triggerSettlement | **Pre-mainnet defense-in-depth** | Add modifier (~2k gas/call); low priority while CEI holds. |
| `buyPolicy` lacks `maxPremium` slippage guard | **Pre-mainnet upgrade** | Either standalone `maxPremium` arg, or fold into the signed-quote payload. |
