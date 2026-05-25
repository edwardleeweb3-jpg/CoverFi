# CoverFi contracts

`CoverFiPolicy` + `MockUSDC` for BSC Testnet — Segment 4 of the CoverFi
build (root project handoff in `../CLAUDE.md`).

Standalone Hardhat 3 subproject. The root Next.js app consumes the
compiled ABIs via `src/lib/contracts/` (wired up in Phase E, not yet
written at the time of this readme).

## Toolchain

| Piece                                 | Version |
|---------------------------------------|---------|
| Solidity compiler                     | `0.8.28` |
| EVM target                            | `cancun` (BSC Tycho-compatible) |
| Hardhat                               | `3.5.1` (ESM, `defineConfig`) |
| `@nomicfoundation/hardhat-toolbox-viem` | `5.0.6` (viem + node:test + Ignition + verify + network-helpers) |
| `@openzeppelin/contracts`             | `5.6.1` (AccessControl, ReentrancyGuard, ERC20, SafeERC20) |

Hardhat 3 ships with `--coverage` and `--gas-stats` flags natively — no
external `solidity-coverage` or `hardhat-gas-reporter` plugins.

## Layout

```
contracts/
  hardhat.config.ts            Solidity 0.8.28 / cancun + bscTestnet
  package.json                 Standalone npm project (ESM)
  tsconfig.json                node20 / es2023
  .env.example                 Copy → .env; never commit a real key
  src/
    CoverFiPolicy.sol          Core protocol — buyPolicy / triggerSettlement / claim
    MockUSDC.sol               6-decimal ERC20 with permissionless mint (testnet faucet)
    test/
      ReentrantUSDC.sol        TEST-ONLY malicious ERC20 for the reentrancy probe
  test/
    MockUSDC.ts                ERC20 sanity (4 tests)
    CoverFiPolicy.ts           Skeleton + premium + buyPolicy + settlement + claim
                               + release math + reentrancy (52 tests)
```

`paths.sources` is overridden to `src/` so we don't get the default
`contracts/contracts/` nesting (we live INSIDE `contracts/` already).

## Local commands

All commands run from `contracts/` (this directory):

```bash
npm install                    # one-time, after cloning
npm run compile                # solc + ABI artifacts → artifacts/
npm test                       # 56 tests via node:test runner
npm run test:gas               # tests + per-function gas table
npm run test:coverage          # tests + line/statement coverage report
                               #   HTML report → coverage/html/
```

`npx hardhat <task>` works for anything not wrapped in a script — see
`npx hardhat --help`.

## Environment

Create `contracts/.env` (gitignored) from `.env.example`:

```
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
PRIVATE_KEY=0x<dedicated dev wallet, NEVER reuse a wallet with value>
BSCSCAN_API_KEY=<from https://bscscan.com/myapikey>
```

The local hardhat-simulated network (`hardhatMainnet`) doesn't need any
of these — they're only consumed when targeting `bscTestnet`.

## Deployment (Phase D, scaffolded here)

Two scripts are pre-defined in `package.json`:

```bash
npm run deploy:testnet         # Hardhat Ignition module deploy
npm run verify:testnet         # Verify contracts on BscScan
```

The Ignition module (`ignition/modules/Deploy.ts`) is added in Phase D;
the scripts above will be ready to use once it lands.

## Design pointers

- **`CoverFiPolicy.sol`** is the only contract that goes to mainnet.
  See its top-of-file NatSpec for the design contract.
- **Roles** (OZ AccessControl):
  - `DEFAULT_ADMIN_ROLE` — tunes Q (`setQ`), grants/revokes other roles.
  - `SETTLER_ROLE` — calls `triggerSettlement`. v1 = a project EOA;
    Segment 5 migrates this to a Signa adapter contract (no code change,
    just `grantRole`/`revokeRole`).
  - `QUOTER_ROLE` — placeholder for the future signed-quote model
    (pre-mainnet upgrade). Constant ships in the v1 ABI so the swap is
    straightforward later.
- **`orderHash`** is `keccak256(utf8(signa_order_id))` — opaque `bytes32`
  on-chain. The exact hashing rule lives in the frontend so Signa's
  real id format (still TBD per PRD §7.2) can land without a contract
  change.
- **`option`** is event-only (`bytes32` in `PolicyMinted`), not stored
  in the `Policy` struct. The contract never reads it; the settler
  resolves Hit/Miss off-chain.
- **Money** lives in `numeric` token base units (6 decimals on testnet
  via MockUSDC; 6 decimals matches real USDC across every chain). All
  premium / release math is bps-integer (PRD §3.2 "no floats for
  money").
- **Settlement events:** `PolicySettled` always fires; `PolicyRefunded`
  fires only on Void; `PolicyClaimed` fires only on `claim` (the user
  action). Distinct event topics = no `isRefund` flags for the indexer
  to disambiguate.

## Known limitations (v1 testnet)

- `buyPolicy` trusts the caller's `kBps` — see plan "已知边界 #1" and
  the `QUOTER_ROLE` placeholder. Pre-mainnet must add a signed-quote
  flow.
- Payout pool is **project pre-funded** (PRD §8.2). The contract holds
  premiums plus an admin-deposited reserve; mainnet needs a real
  solvency mechanism (PRD §9.1).
- No professional audit yet — only an AI audit (Phase C). PRD §9.2
  requires a real audit before mainnet.

## Status snapshot

- **B1–B5 complete:** MockUSDC, CoverFiPolicy skeleton, premium quoting
  + buyPolicy, three-outcome triggerSettlement, claim + linear release
  math + reentrancy guard.
- **56 tests pass.**
- **Coverage:** `CoverFiPolicy.sol` and `MockUSDC.sol` both 100% line +
  statement (the test-only `ReentrantUSDC.sol` shows ~78% — only the
  attack branch is exercised; expected).
- **Gas (avg):** `buyPolicy` 184k, `claim` 70k, `triggerSettlement` 34k
  (Hit/Miss) ↔ 48k (Void, includes refund transfer), `setQ` 31k.
- **Bytecode size:** `CoverFiPolicy` 8.6 KB (Spurious Dragon limit
  24 KB).

Phase C (AI audit) → Phase D (BSC Testnet deploy) → Phase E (frontend
wire-up) are next per `../CLAUDE.md` §8.
