# CoverFi contracts

`CoverFiPolicy` + `MockUSDC` for BSC Testnet — Segment 4 of the CoverFi
build (root project handoff in `../CLAUDE.md`).

Standalone Hardhat 3 subproject. The root Next.js app consumes the
compiled ABIs via `src/lib/contracts/`; the on-chain flow (mint,
claim, settle, balance, releasedOf/claimableOf) is wired through
wagmi+viem hooks in production.

## Toolchain

| Piece                                 | Version |
|---------------------------------------|---------|
| Solidity compiler                     | `0.8.28` |
| EVM target                            | `cancun` (BSC Tycho-compatible) |
| Hardhat                               | `3.5.1` (ESM, `defineConfig`) |
| `@nomicfoundation/hardhat-toolbox-viem` | `5.0.6` (viem + node:test + Ignition + verify + network-helpers) |
| `@openzeppelin/contracts`             | `5.6.1` (AccessControl, ReentrancyGuard, ERC20, SafeERC20) |
| `@supabase/supabase-js`               | `^2.106` (used by `settle.ts` + `snapshot.ts` for DB sync) |

Hardhat 3 ships with `--coverage` and `--gas-stats` flags natively — no
external `solidity-coverage` or `hardhat-gas-reporter` plugins.

## Layout

```
contracts/
  hardhat.config.ts            Solidity 0.8.28 / cancun + bscTestnet + verify config
  package.json                 Standalone npm project (ESM)
  tsconfig.json                node20 / es2023
  .env.example                 Copy → .env; never commit a real key
  AUDIT.md                     AI security review + accepted v1 limitations
  src/
    CoverFiPolicy.sol          Core protocol — buyPolicy / triggerSettlement /
                               claim / setQ / rescueToken
    MockUSDC.sol               6-decimal ERC20 with permissionless mint (testnet faucet)
    test/
      ReentrantUSDC.sol        TEST-ONLY malicious ERC20 for the reentrancy probe
  test/
    MockUSDC.ts                ERC20 sanity (4 tests)
    CoverFiPolicy.ts           Constructor + setQ + premium + buyPolicy +
                               settlement + claim + release math + reentrancy
                               + rescueToken (59 tests)
  ignition/
    modules/
      MockUSDC.ts              D2 deploy module
      CoverFiPolicy.ts         D3 deploy module (constructor args baked in)
  scripts/
    check-deployer.ts          Pre-deploy safety check (derive address from
                               .env private key, print BSC Testnet tBNB balance)
    sync-abi.mjs               Refresh `src/lib/contracts/abi/*.ts` after a
                               contract change
    mint-mock-usdc.ts          D2 helper — mint 1M MockUSDC to deployer
    transfer-payout-pool.ts    D3 helper — seed CoverFiPolicy with 100k MockUSDC
    verify-coverfi-config.ts   D3 readback — confirms deployed config (USDC
                               address, qBps, role grants)
    settle.ts                  Phase E6 — SETTLER-keyed CLI to call
                               triggerSettlement; also writes DB mirror.
                               Retires when Segment 5 adapter lands.
    snapshot.ts                Read-only chain ↔ DB diagnostic. Prints every
                               minted policy's chain status, policy-1 release
                               math, and Supabase row state.
```

`paths.sources` is overridden to `src/` so we don't get the default
`contracts/contracts/` nesting (we live INSIDE `contracts/` already).

## Local commands

All commands run from `contracts/`:

```bash
npm install                    # one-time, after cloning
npm run compile                # solc + ABI artifacts → artifacts/
npm test                       # 63 tests via node:test runner
npm run test:gas               # tests + per-function gas table
npm run test:coverage          # tests + line/statement coverage report
                               #   HTML report → coverage/html/
npm run snapshot               # read-only chain ↔ DB state diagnostic
```

`npx hardhat <task>` works for anything not wrapped in a script — see
`npx hardhat --help`.

## Environment

Create `contracts/.env` (gitignored) from `.env.example`:

```
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
PRIVATE_KEY=<raw 64-hex from MetaMask Account Details — hardhat.config.ts auto-prefixes 0x>
BSCSCAN_API_KEY=<from https://bscscan.com/myapikey>
SUPABASE_URL=<same as root .env.local>
SUPABASE_PUBLISHABLE_KEY=<same as root .env.local>
```

Use a **dedicated dev wallet** that holds only testnet funds — never
a wallet with real assets. Supabase vars are only consumed by
`settle.ts` + `snapshot.ts`; the publishable key is public-safe
(RLS gates writes).

The local `hardhatMainnet` simulated network needs none of these.

## Deployed addresses (BSC Testnet, chainId 97)

| Contract       | Address                                                                                                                  | BscScan |
|----------------|--------------------------------------------------------------------------------------------------------------------------|---------|
| MockUSDC       | `0xb1DC4F171091D2b3d94a8B14be8cc663fD994e73`                                                                             | [verified](https://testnet.bscscan.com/address/0xb1DC4F171091D2b3d94a8B14be8cc663fD994e73#code) |
| CoverFiPolicy  | `0xEbdd8f124EaD6DABd7C5F3893E2A244280fE5b19`                                                                             | [verified](https://testnet.bscscan.com/address/0xEbdd8f124EaD6DABd7C5F3893E2A244280fE5b19#code) |

Deployer / `DEFAULT_ADMIN_ROLE` / `SETTLER_ROLE`:
`0x06AdF68BDFAE3BEF1a2C065594C563B7066e3827` (project EOA — v1
testnet only; mainnet must be a multisig per AUDIT.md).

## Deployment + verification commands

The full Phase D sequence:

```bash
node scripts/check-deployer.ts                # confirm deployer address + tBNB balance
npx hardhat ignition deploy ignition/modules/MockUSDC.ts --network bscTestnet
node scripts/mint-mock-usdc.ts                # mint 1M mUSDC to deployer
npx hardhat ignition deploy ignition/modules/CoverFiPolicy.ts --network bscTestnet
node scripts/verify-coverfi-config.ts         # readback constructor args + roles
node scripts/transfer-payout-pool.ts          # seed 100k mUSDC into CoverFiPolicy
npm run verify:testnet -- <address> <constructor-args...>
                                              # `verify:testnet` wraps `verify etherscan`
                                              # with --build-profile production
                                              # (Ignition deploys with the production
                                              # profile by default; default profile
                                              # bytecode won't match)
```

## Settlement script (Phase E6)

```
node scripts/settle.ts --policy <chain_policy_id> --outcome miss|hit|void
```

The settler-keyed CLI calls `CoverFiPolicy.triggerSettlement(id,
outcome)` and writes the matching Supabase row (`status` +
`settled_at` for Miss/Hit; `voided_at` for Void). Three policies
have been settled this way: policy 1 → Miss, policy 2 → Hit,
policy 3 → Void. Segment 5 retires this script in favour of an
on-chain Signa adapter that holds `SETTLER_ROLE`.

## Design pointers

- **`CoverFiPolicy.sol`** is the only contract that goes to mainnet.
  See its top-of-file NatSpec for the design contract.
- **Roles** (OZ AccessControl):
  - `DEFAULT_ADMIN_ROLE` — tunes Q (`setQ`), grants/revokes other
    roles, can `rescueToken`. **Must be a multisig in production.**
  - `SETTLER_ROLE` — calls `triggerSettlement`. v1 = project EOA;
    Segment 5 migrates this to a Signa adapter contract via
    `grantRole` + `revokeRole` (no contract change).
  - `QUOTER_ROLE` — placeholder for the future signed-quote model
    (pre-mainnet upgrade). Constant ships in the v1 ABI so the
    swap is straightforward later.
- **`orderHash`** is `keccak256(utf8(signa_order_id))` — opaque
  `bytes32` on-chain. The hashing rule lives in
  `src/lib/contracts/index.ts` (`orderHashOf`), so Signa's real id
  format (still TBD per PRD §7.2) lands without a contract change.
- **`option`** is event-only (`bytes32` in `PolicyMinted`), not
  stored in the `Policy` struct. The contract never reads it; the
  settler resolves Hit/Miss off-chain.
- **Money** lives in `numeric` token base units (6 decimals on
  testnet via MockUSDC; 6 decimals matches real USDC across every
  chain). All premium / release math is bps-integer (PRD §3.2 "no
  floats for money"). The frontend mirror lives in
  `src/lib/pricing.bigint.ts` — strict 1:1 with the contract.
- **Settlement events:** `PolicySettled` always fires; `PolicyRefunded`
  fires only on Void; `PolicyClaimed` fires only on `claim` (the user
  action). Distinct event topics = no `isRefund` flags for the
  indexer to disambiguate.

## Known limitations (v1 testnet)

- `buyPolicy` trusts the caller's `kBps` — see AUDIT.md "Settlement
  authority concentrated…" High finding and the `QUOTER_ROLE`
  placeholder. Pre-mainnet must add a signed-quote flow.
- Payout pool is **project pre-funded** (PRD §8.2). The contract
  holds premiums plus an admin-deposited reserve; mainnet needs a
  real solvency mechanism (PRD §9.1).
- No professional audit yet — only an AI audit (Phase C). PRD §9.2
  requires a real audit before mainnet.
- No event indexer yet — DB mirror is kept in sync only by the same
  code paths that write the chain side. See root `CLAUDE.md` §9.

## Status snapshot

- **Phases B–F complete.**
- **63 tests pass** (`npm test`).
- **Coverage:** `CoverFiPolicy.sol` and `MockUSDC.sol` both 100% line +
  statement (the test-only `ReentrantUSDC.sol` shows ~78% — only the
  attack branch is exercised; expected).
- **Gas (avg):** `buyPolicy` 184k, `claim` 70k, `triggerSettlement`
  34k (Hit/Miss) ↔ 48k (Void, includes refund transfer), `setQ` 31k,
  `rescueToken` ~50k.
- **Bytecode size:** `CoverFiPolicy` ~9 KB (Spurious Dragon limit 24 KB).

Next: Segment 5 (Signa adapter) — see root `CLAUDE.md` §8.
