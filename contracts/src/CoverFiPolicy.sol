// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title CoverFiPolicy
/// @notice Principal insurance on Signa prediction-market orders.
///         This file is the B2 skeleton — storage, roles, constructor,
///         setQ admin action, and event placeholders. The business
///         actions (buyPolicy / triggerSettlement / claim) land in
///         Phases B3 / B4 / B5.
/// @dev    All economic math here is bps-based integer arithmetic to
///         satisfy PRD §3.2's "no floats for money" rule. Q, k, F are
///         stored / passed as basis points out of `BPS_DENOMINATOR`.
contract CoverFiPolicy is AccessControl {
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

    // ─── Events ──────────────────────────────────────────────────

    /// @notice Emitted on every successful `buyPolicy` (Phase B3).
    event PolicyMinted(
        uint256 indexed policyId,
        address indexed owner,
        bytes32 indexed orderHash,
        uint256 principal,
        uint16 kBps,
        uint256 premium
    );

    /// @notice Emitted when `triggerSettlement` (Phase B4) moves a
    ///         policy out of Active into releasing / hit / void.
    event PolicySettled(
        uint256 indexed policyId,
        SettlementOutcome outcome,
        uint32 settledAt
    );

    /// @notice Emitted on every successful claim and on the one-shot
    ///         premium refund that fires at Void settlement (PRD §3.4).
    ///         `isRefund = true` distinguishes the refund case.
    event PolicyClaimed(
        uint256 indexed policyId,
        address indexed owner,
        uint256 amount,
        bool isRefund
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
}
