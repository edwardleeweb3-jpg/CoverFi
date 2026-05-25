// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CoverFiPolicy
/// @notice Principal insurance on Signa prediction-market orders.
///         This file is the B2 skeleton — storage, roles, constructor,
///         setQ admin action, and event placeholders. The business
///         actions (buyPolicy / triggerSettlement / claim) land in
///         Phases B3 / B4 / B5.
/// @dev    All economic math here is bps-based integer arithmetic to
///         satisfy PRD §3.2's "no floats for money" rule. Q, k, F are
///         stored / passed as basis points out of `BPS_DENOMINATOR`.
contract CoverFiPolicy is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Enums ───────────────────────────────────────────────────

    /// @notice Policy lifecycle states. Order MUST match PRD §2.2:
    ///   0 → "active"     (Coverage active, pre-settlement)
    ///   1 → "releasing"  (Paying out, linear release in progress)
    ///   2 → "completed"  (Reimbursed in full, terminal)
    ///   3 → "hit"        (Option won, premium retained, terminal)
    ///   4 → "void"       (Market voided, premium refunded, terminal)
    /// Frontend / backend are responsible for the uint8↔string mapping.
    enum PolicyStatus {
        Active,
        Releasing,
        Completed,
        Hit,
        Void
    }

    /// @notice Outcome arg for triggerSettlement (Phase B4). `Miss` is
    ///         the only outcome that moves a policy into payout; `Hit`
    ///         and `Void` are terminal.
    enum SettlementOutcome {
        Miss,
        Hit,
        Void
    }

    // ─── Structs ─────────────────────────────────────────────────

    /// @dev Storage layout — 5 slots per policy:
    ///   slot 1: owner (20B) | status (1B) | kBps (2B) | mintedAt (4B) | settledAt (4B) = 31B
    ///   slot 2: orderHash (32B)
    ///   slot 3: principal (32B)
    ///   slot 4: premium (32B)
    ///   slot 5: claimed (32B)
    /// `uint32` timestamps cap at 2106-02-07 — far enough for any
    /// horizon this v1 testnet contract will ever see.
    struct Policy {
        address owner;
        PolicyStatus status;
        uint16 kBps;
        uint32 mintedAt;
        uint32 settledAt;
        bytes32 orderHash;
        uint256 principal;
        uint256 premium;
        uint256 claimed;
    }

    // ─── Roles ───────────────────────────────────────────────────

    /// @notice Authority that may move a policy out of `Active` via
    ///         `triggerSettlement` (Phase B4). Held by a project-owned
    ///         EOA in v1 testnet; migrates to a Signa adapter contract
    ///         in Segment 5 by `grantRole(SETTLER_ROLE, adapter)` +
    ///         `revokeRole(SETTLER_ROLE, oldEOA)` — no contract change.
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    /// @notice Placeholder for the future signed-quote model (see plan
    ///         "已知边界 #1"). v1 trusts the caller's kBps; a pre-
    ///         mainnet upgrade will require this role's signature over
    ///         (orderHash, kBps, expiry). The constant ships in the v1
    ///         ABI so downstream code can prepare the grant ahead of
    ///         the verification logic landing.
    bytes32 public constant QUOTER_ROLE = keccak256("QUOTER_ROLE");

    // ─── Constants ───────────────────────────────────────────────

    /// @notice Denominator for all basis-point quantities (Q, k, F).
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Premium floor as bps of principal — PRD §3.2: 5% = 500.
    ///         Immutable on purpose: the floor is part of the protocol
    ///         contract, not an operations dial.
    uint256 public constant F_BPS = 500;

    /// @notice Linear-release period (PRD §3.3).
    uint256 public constant RELEASE_PERIOD = 365 days;

    // ─── Storage ─────────────────────────────────────────────────

    /// @notice The ERC20 used for premiums + payouts. MockUSDC on
    ///         testnet; swap to real USDC at mainnet deploy time.
    IERC20 public immutable usdc;

    /// @notice Current pricing dial Q (bps) — PRD §3.2. Admin-tunable
    ///         via `setQ`; existing policies keep their locked-snapshot
    ///         premium and are unaffected by changes.
    uint256 public qBps;

    /// @notice Next policy id to assign. Starts at 1 so a 0 lookup in
    ///         `policyIdByOrderHash` unambiguously means "no policy".
    uint256 public nextPolicyId;

    /// @notice id → Policy.
    mapping(uint256 id => Policy) public policies;

    /// @notice Signa orderHash → policy id. Enforces PRD §3.1's
    ///         "one order → at most one policy" — `buyPolicy` (Phase B3)
    ///         reverts when this returns non-zero for the given hash.
    mapping(bytes32 orderHash => uint256 id) public policyIdByOrderHash;

    // ─── Errors ──────────────────────────────────────────────────

    /// @notice Thrown when Q would be set to 0 or > BPS_DENOMINATOR.
    error InvalidQBps(uint256 qBps);

    /// @notice Thrown when `buyPolicy` is called with principal == 0.
    error InvalidPrincipal();

    /// @notice Thrown when `buyPolicy` is called with kBps > BPS_DENOMINATOR
    ///         (PRD §3.2: k is a probability, 0..1).
    error InvalidKBps(uint16 kBps);

    /// @notice Thrown when `buyPolicy` is called with an orderHash that
    ///         already has a policy minted against it (PRD §3.1: one
    ///         Signa order → at most one policy).
    error OrderAlreadyInsured(bytes32 orderHash, uint256 existingPolicyId);

    /// @notice Thrown when `triggerSettlement` is called with a
    ///         policyId that was never minted (owner == address(0)).
    error PolicyNotFound(uint256 policyId);

    /// @notice Thrown when `triggerSettlement` is called on a policy
    ///         that has already left the Active state. The current
    ///         status is included so the settler can diagnose without
    ///         a second RPC call.
    error PolicyNotActive(uint256 policyId, PolicyStatus currentStatus);

    /// @notice Thrown when `claim` is called by an address other than
    ///         the policy's owner.
    error NotPolicyOwner(uint256 policyId);

    /// @notice Thrown when `claim` is called and `claimableOf` returns 0.
    ///         Covers: Active (not yet settled), Hit / Void (terminal,
    ///         no payout), Completed (already fully claimed), Releasing
    ///         but not enough time has elapsed since the last claim.
    error NothingToClaim(uint256 policyId);

    // ─── Events ──────────────────────────────────────────────────

    /// @notice Emitted on every successful `buyPolicy`. `option` is the
    ///         keccak256 of the insured option label (e.g. keccak256("Yes"))
    ///         and is event-only — not stored on-chain. The contract
    ///         doesn't need it for any business rule (settler resolves
    ///         hit/miss off-chain by comparing option against the market
    ///         outcome); the event carries it so indexers and the
    ///         frontend can display it without a separate lookup.
    event PolicyMinted(
        uint256 indexed policyId,
        address indexed owner,
        bytes32 indexed orderHash,
        uint256 principal,
        uint16 kBps,
        uint256 premium,
        bytes32 option
    );

    /// @notice Emitted when `triggerSettlement` (Phase B4) moves a
    ///         policy out of Active into releasing / hit / void.
    event PolicySettled(
        uint256 indexed policyId,
        SettlementOutcome outcome,
        uint32 settledAt
    );

    /// @notice Emitted on every successful claim of released principal
    ///         (Phase B5). Claims and refunds are distinct cash-flow
    ///         types and get distinct events — see `PolicyRefunded`.
    event PolicyClaimed(
        uint256 indexed policyId,
        address indexed owner,
        uint256 amount
    );

    /// @notice Emitted on the one-shot premium refund at Void
    ///         settlement (PRD §3.4). Independent from `PolicyClaimed`
    ///         so event indexers can route refunds and claims
    ///         separately without an in-payload flag.
    event PolicyRefunded(
        uint256 indexed policyId,
        address indexed owner,
        uint256 amount
    );

    /// @notice Emitted on every Q change, including the bootstrap value
    ///         set in the constructor (oldQBps = 0 in that case).
    event QUpdated(uint256 oldQBps, uint256 newQBps, address indexed admin);

    // ─── Constructor ─────────────────────────────────────────────

    /// @param _usdc         ERC20 used for premium + payout transfers.
    /// @param _admin        Account that receives DEFAULT_ADMIN_ROLE
    ///                      (may call `setQ`, grant/revoke other roles).
    /// @param _settler      Account that receives SETTLER_ROLE (may call
    ///                      `triggerSettlement` once it ships in B4).
    /// @param _initialQBps  Initial pricing dial in bps. Same range rule
    ///                      as `setQ` — must be > 0 and <= 10000. PRD
    ///                      recommends 5000 (= Q=0.5).
    constructor(
        IERC20 _usdc,
        address _admin,
        address _settler,
        uint256 _initialQBps
    ) {
        if (_initialQBps == 0 || _initialQBps > BPS_DENOMINATOR) {
            revert InvalidQBps(_initialQBps);
        }
        usdc = _usdc;
        qBps = _initialQBps;
        nextPolicyId = 1;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(SETTLER_ROLE, _settler);

        emit QUpdated(0, _initialQBps, _admin);
    }

    // ─── Admin: setQ ─────────────────────────────────────────────

    /// @notice Update the pricing dial Q. PRD §3.2 + §4A.1: operations
    ///         can tune Q without a redeploy. The change affects only
    ///         future `buyPolicy` calls — existing policies keep their
    ///         snapshot premium.
    /// @param newQBps  New Q in bps. Must be > 0 and <= 10000.
    function setQ(uint256 newQBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newQBps == 0 || newQBps > BPS_DENOMINATOR) {
            revert InvalidQBps(newQBps);
        }
        uint256 oldQBps = qBps;
        qBps = newQBps;
        emit QUpdated(oldQBps, newQBps, msg.sender);
    }

    // ─── Pricing ─────────────────────────────────────────────────

    /// @notice Live premium quote for a given (principal, kBps) pair —
    ///         PRD §3.2:
    ///           base    = Q × (1 − k) × a
    ///           floor   = F × a
    ///           premium = max(base, floor)
    ///
    /// All quantities are integers in bps × wei (USDC base units, 6
    /// decimals on testnet — F_BPS and qBps cancel out the BPS scaling).
    /// Multiplications happen before the divisions to keep intermediate
    /// precision on Solidity's floor-division integer math.
    ///
    /// Overflow safety: with qBps ≤ 10_000 and kBps ≤ 10_000 (both
    /// enforced), the worst-case numerator is 10_000 × 10_000 × principal
    /// = 1e8 × principal. principal lives in USDC wei (6-decimal token);
    /// even an absurd 1e18 principal stays well below uint256 max.
    ///
    /// Reverts:
    ///   InvalidPrincipal — principal == 0
    ///   InvalidKBps      — kBps > BPS_DENOMINATOR
    ///
    /// @return base    Q × (1 − k) × a, in token base units.
    /// @return floor_  F × a, in token base units (the 5% floor).
    /// @return premium max(base, floor_), what `buyPolicy` will charge.
    function quotePremium(uint256 principal, uint16 kBps)
        public
        view
        returns (uint256 base, uint256 floor_, uint256 premium)
    {
        if (principal == 0) revert InvalidPrincipal();
        if (kBps > BPS_DENOMINATOR) revert InvalidKBps(kBps);

        // (BPS_DENOMINATOR - kBps) is safe — kBps ≤ BPS_DENOMINATOR
        // is guaranteed by the check above, so no underflow on uint256.
        base =
            (qBps * (BPS_DENOMINATOR - uint256(kBps)) * principal) /
            (BPS_DENOMINATOR * BPS_DENOMINATOR);
        floor_ = (F_BPS * principal) / BPS_DENOMINATOR;
        premium = base > floor_ ? base : floor_;
    }

    // ─── User: buyPolicy ─────────────────────────────────────────

    /// @notice Mint a policy on a Signa order. Pulls `premium` USDC from
    ///         msg.sender (requires prior `approve`) and records the
    ///         policy in storage. Enforces PRD §3.1 by reverting if the
    ///         orderHash already has a policy.
    ///
    ///         v1 trust model: caller-supplied `kBps` is accepted at face
    ///         value (see plan "已知边界 #1"). Pre-mainnet upgrade will
    ///         require a QUOTER_ROLE-signed quote; the QUOTER_ROLE
    ///         constant is already declared so the ABI stays stable.
    ///
    ///         Strict checks-effects-interactions: every state write
    ///         (including the orderHash dedup mark) happens before the
    ///         external `safeTransferFrom`, so even a hypothetical
    ///         malicious ERC20 with a transfer hook cannot re-enter into
    ///         a state where this order looks uninsured.
    ///
    /// @param orderHash  keccak256 of the upstream Signa order id (the
    ///                   exact hashing scheme is the frontend's
    ///                   responsibility — see plan answer to question (a)).
    /// @param principal  Insured amount `a` in USDC base units.
    /// @param kBps       Implied probability snapshot in bps. 0..10_000.
    /// @param option     keccak256 of the insured option label. Event-
    ///                   only; not stored. The contract never reads it.
    /// @return policyId  The freshly-minted policy's id.
    function buyPolicy(
        bytes32 orderHash,
        uint256 principal,
        uint16 kBps,
        bytes32 option
    ) external returns (uint256 policyId) {
        // ─ CHECKS ─
        // quotePremium also validates principal > 0 and kBps ≤ 10_000;
        // calling it first means we don't duplicate those checks here.
        (, , uint256 premium) = quotePremium(principal, kBps);

        uint256 existing = policyIdByOrderHash[orderHash];
        if (existing != 0) {
            revert OrderAlreadyInsured(orderHash, existing);
        }

        // ─ EFFECTS ─
        policyId = nextPolicyId;
        unchecked {
            // Solidity 0.8 default-checks the ++; nextPolicyId is a
            // free-running uint256 counter, no realistic overflow.
            nextPolicyId = policyId + 1;
        }
        policyIdByOrderHash[orderHash] = policyId;
        policies[policyId] = Policy({
            owner: msg.sender,
            status: PolicyStatus.Active,
            kBps: kBps,
            mintedAt: uint32(block.timestamp),
            settledAt: 0,
            orderHash: orderHash,
            principal: principal,
            premium: premium,
            claimed: 0
        });

        emit PolicyMinted(
            policyId,
            msg.sender,
            orderHash,
            principal,
            kBps,
            premium,
            option
        );

        // ─ INTERACTIONS ─
        usdc.safeTransferFrom(msg.sender, address(this), premium);
    }

    // ─── Settler: triggerSettlement ──────────────────────────────

    /// @notice Move a policy out of the Active state per the Signa
    ///         market result. Authority is gated by SETTLER_ROLE — in
    ///         v1 testnet this is a project EOA; Segment 5 hands the
    ///         role to a Signa-aware adapter contract via grant/revoke
    ///         (the contract itself doesn't need to change for that).
    ///
    ///         Three outcomes (enum `SettlementOutcome` — PRD §2.2):
    ///           Miss → policy enters `Releasing`; 365-day linear
    ///                  release starts from `settledAt`. Payout flow
    ///                  lives in `claim` (Phase B5).
    ///           Hit  → policy enters terminal `Hit`; premium retained
    ///                  by the protocol, no payout (PRD §3.4).
    ///           Void → policy enters terminal `Void`; premium is
    ///                  refunded to the owner in this same call
    ///                  (PRD §3.4). Refund emits `PolicyRefunded`,
    ///                  separate from `PolicyClaimed` so indexers can
    ///                  route the two cash-flow types independently.
    ///
    ///         `settledAt = block.timestamp` is written in all three
    ///         branches — it's the "when did the market settle"
    ///         timestamp, useful as a record regardless of branch; the
    ///         Releasing branch additionally uses it as the linear
    ///         release origin.
    ///
    ///         Strict CEI is preserved in the Void branch: status flip
    ///         + both events emit before the `safeTransfer`, so a
    ///         hostile ERC20 with a transfer hook can't see this
    ///         policy as still Active and try to settle it again.
    ///
    /// @param policyId  Id from a prior `buyPolicy`.
    /// @param outcome   Miss / Hit / Void per PRD §2.2.
    function triggerSettlement(uint256 policyId, SettlementOutcome outcome)
        external
        onlyRole(SETTLER_ROLE)
    {
        Policy storage p = policies[policyId];

        // ─ CHECKS ─
        // Policy 0 is reserved (nextPolicyId starts at 1), and a
        // never-minted slot has owner == address(0).
        if (p.owner == address(0)) revert PolicyNotFound(policyId);
        if (p.status != PolicyStatus.Active) {
            revert PolicyNotActive(policyId, p.status);
        }

        // ─ EFFECTS ─
        uint32 settledAt = uint32(block.timestamp);
        p.settledAt = settledAt;

        if (outcome == SettlementOutcome.Miss) {
            p.status = PolicyStatus.Releasing;
            emit PolicySettled(policyId, outcome, settledAt);
        } else if (outcome == SettlementOutcome.Hit) {
            p.status = PolicyStatus.Hit;
            emit PolicySettled(policyId, outcome, settledAt);
        } else {
            // Void — refund the original premium back to the owner.
            p.status = PolicyStatus.Void;
            address owner_ = p.owner;
            uint256 refund = p.premium;
            emit PolicySettled(policyId, outcome, settledAt);
            emit PolicyRefunded(policyId, owner_, refund);

            // ─ INTERACTIONS (Void only) ─
            usdc.safeTransfer(owner_, refund);
        }
    }

    // ─── Views: release math ─────────────────────────────────────

    /// @notice Released principal at the current block.timestamp —
    ///         PRD §3.3. Returns 0 for policies not in Releasing or
    ///         Completed (Active = pre-settlement; Hit / Void are
    ///         terminal with no payout).
    ///
    ///         Math is `principal * elapsed / RELEASE_PERIOD` with
    ///         integer floor division, capped at `principal` once
    ///         elapsed reaches RELEASE_PERIOD. The multiply-before-
    ///         divide order matches PRD §3.2's "no float, no
    ///         precision loss" rule.
    function releasedOf(uint256 policyId) public view returns (uint256) {
        Policy storage p = policies[policyId];
        if (
            p.status != PolicyStatus.Releasing &&
            p.status != PolicyStatus.Completed
        ) {
            return 0;
        }
        // `settledAt` was written when the status moved to Releasing
        // (or Completed, which is reached only via that path), so
        // `block.timestamp >= settledAt` is guaranteed.
        uint256 elapsed = block.timestamp - uint256(p.settledAt);
        if (elapsed >= RELEASE_PERIOD) {
            return p.principal;
        }
        return (p.principal * elapsed) / RELEASE_PERIOD;
    }

    /// @notice Amount the owner can `claim` right now — PRD §3.3.
    ///         Defensive `≤` so a hypothetical `claimed` overrun
    ///         surfaces as 0 (and `claim` rejects with NothingToClaim)
    ///         rather than reverting on uint underflow.
    function claimableOf(uint256 policyId) public view returns (uint256) {
        uint256 released = releasedOf(policyId);
        uint256 already = policies[policyId].claimed;
        if (released <= already) return 0;
        return released - already;
    }

    // ─── Owner: claim ────────────────────────────────────────────

    /// @notice Withdraw any newly-released principal. Multiple claims
    ///         over a policy's lifetime accumulate against `claimed`,
    ///         which is bounded by `principal`. Once `claimed` reaches
    ///         `principal` the policy transitions to `Completed`.
    ///
    ///         nonReentrant + strict CEI: all state mutations (claimed
    ///         bump, status transition, event emit) happen before the
    ///         `safeTransfer`, so a hostile ERC20 with a transfer hook
    ///         cannot re-enter into a state where it gets paid twice.
    ///         The reentrancy guard catches even subtle race paths the
    ///         CEI alone might miss.
    ///
    /// @param policyId  Id from a prior `buyPolicy`.
    function claim(uint256 policyId) external nonReentrant {
        Policy storage p = policies[policyId];

        // ─ CHECKS ─
        if (p.owner == address(0)) revert PolicyNotFound(policyId);
        if (msg.sender != p.owner) revert NotPolicyOwner(policyId);

        uint256 amount = claimableOf(policyId);
        if (amount == 0) revert NothingToClaim(policyId);

        // ─ EFFECTS ─
        uint256 newClaimed = p.claimed + amount;
        p.claimed = newClaimed;
        // Transition to terminal Completed exactly once: only when
        // we've just credited the final wei AND we're currently in
        // the in-progress state. Guards against accidental
        // re-transition if claim were ever entered with status
        // already Completed (impossible today — claimableOf would be
        // 0 — but cheap insurance).
        if (
            newClaimed >= p.principal &&
            p.status == PolicyStatus.Releasing
        ) {
            p.status = PolicyStatus.Completed;
        }

        emit PolicyClaimed(policyId, msg.sender, amount);

        // ─ INTERACTIONS ─
        usdc.safeTransfer(msg.sender, amount);
    }
}
