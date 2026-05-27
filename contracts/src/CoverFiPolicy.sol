// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPulseMarket, VOID_SENTINEL} from "./signa/IPulseMarket.sol";
import {IPulseFactoryRegistry} from "./signa/IPulseFactoryRegistry.sol";

/// @title CoverFiPolicy
/// @notice Principal insurance on Signa Pulse positions. Users
///         `buyPolicy` against a Signa market option they already
///         hold; on a Miss settlement the policy enters 365-day
///         linear payout claimable via `claim`; on Hit the premium is
///         retained; on Void the premium is refunded. See `AUDIT.md`
///         for the v1 trust model and items deferred past mainnet.
/// @dev    Integrates with Signa Pulse on-chain (BSC, same chain as
///         CoverFi). The factory registry passed at construction
///         time is the single source of truth for which market
///         addresses are real; `buyPolicy` enforces this bijection
///         before reading any market state. All economic math is
///         bps-based integer arithmetic per PRD §3.2's "no floats
///         for money" rule. Q, k, F are stored and passed in basis
///         points out of `BPS_DENOMINATOR`. Admin-tunable Q lives
///         on-chain; existing policies snapshot their premium at
///         mint time and are immune to later Q changes.
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
    ///   slot 2: signaMarket (20B) | claimOption (1B) = 21B (11B free)
    ///   slot 3: principal (32B)
    ///   slot 4: premium (32B)
    ///   slot 5: claimed (32B)
    /// `uint32` timestamps cap at 2106-02-07 — far enough for any
    /// horizon this v1 testnet contract will ever see.
    /// `signaMarket` + `claimOption` are the on-chain handle for the
    /// position this policy insures; `triggerSettlement` /
    /// `settleByOnChainRead` (Segment 5) read live state from them.
    struct Policy {
        address owner;
        PolicyStatus status;
        uint16 kBps;
        uint32 mintedAt;
        uint32 settledAt;
        address signaMarket;
        uint8 claimOption;
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

    /// @notice The ERC20 used for premiums + payouts. Segment 5 wires
    ///         this to the same testnet USDC Signa Pulse beta uses
    ///         (`0xc03d7E…`, 18 decimals) so a future Signa-sourced
    ///         payout flow doesn't need decimal-bridging.
    IERC20 public immutable usdc;

    /// @notice Signa Pulse factory registry. Immutable so the trust
    ///         anchor for "is this market real" can't be replaced
    ///         post-deploy. `buyPolicy` does a bidirectional
    ///         registration check against it before touching market
    ///         state — see `NotRegisteredMarket` /
    ///         `MarketRegistryMismatch`.
    IPulseFactoryRegistry public immutable signaFactory;

    /// @notice Current pricing dial Q (bps) — PRD §3.2. Admin-tunable
    ///         via `setQ`; existing policies keep their locked-snapshot
    ///         premium and are unaffected by changes.
    uint256 public qBps;

    /// @notice Next policy id to assign. Starts at 1 so a 0 lookup in
    ///         `policyIdByPosition` unambiguously means "no policy".
    uint256 public nextPolicyId;

    /// @notice id → Policy.
    mapping(uint256 id => Policy) public policies;

    /// @notice (signaMarket, buyer, claimOption) → policy id. Enforces
    ///         "one buyer-position → at most one policy" — the
    ///         Segment 5 analogue of PRD §3.1's per-order rule, now
    ///         that a Signa "position" is identified by the triple
    ///         rather than an opaque order id. `buyPolicy` reverts
    ///         when this returns non-zero. Known limitation: if the
    ///         buyer later tops up their Signa bet, they cannot
    ///         insure the increment via a second policy (CLAUDE.md §9).
    mapping(address market => mapping(address buyer => mapping(uint8 option => uint256 policyId)))
        public policyIdByPosition;

    // ─── Errors ──────────────────────────────────────────────────

    /// @notice Thrown when Q would be set to 0 or > BPS_DENOMINATOR.
    error InvalidQBps(uint256 qBps);

    /// @notice Thrown when `buyPolicy` is called with principal == 0.
    error InvalidPrincipal();

    /// @notice Thrown when `buyPolicy` is called with kBps > BPS_DENOMINATOR
    ///         (PRD §3.2: k is a probability, 0..1).
    error InvalidKBps(uint16 kBps);

    /// @notice Thrown by `buyPolicy` when the given `market` is not
    ///         in the Signa factory's registry (`marketIds(market) == 0`).
    error NotRegisteredMarket(address market);

    /// @notice Thrown by `buyPolicy` when the factory's reverse
    ///         lookup `markets(id)` does not match the caller-supplied
    ///         `market`. Defensive — shouldn't occur on a well-formed
    ///         factory, but the bijection check is symmetric with the
    ///         frontend's `verifyMarket()`.
    error MarketRegistryMismatch(address market, uint256 id);

    /// @notice Thrown by `buyPolicy` when the Signa market is not in
    ///         `Running` status — only undecided markets are insurable
    ///         (D1(a)). `actualStatus` is the underlying uint8 of
    ///         `IPulseMarket.Status` so the caller can diagnose
    ///         without a second RPC.
    error MarketNotRunning(address market, uint8 actualStatus);

    /// @notice Thrown by `buyPolicy` when the caller has no chain-side
    ///         bet on the requested (market, option) — `userBets`
    ///         returned 0. Enforces D1(b): the buyer must already hold
    ///         the position they want to insure.
    error NoPositionToInsure(address market, address buyer, uint8 option);

    /// @notice Thrown by `buyPolicy` when the caller has already
    ///         insured the exact (market, buyer, option) position.
    ///         Replaces v1's `OrderAlreadyInsured` (orderHash-keyed)
    ///         with the new position-keyed dedup.
    error PositionAlreadyInsured(
        address market,
        address buyer,
        uint8 option,
        uint256 existingPolicyId
    );

    /// @notice Thrown by `settleByOnChainRead` when the Signa market
    ///         hasn't reached `Finalized` yet. CoverFi only acts on
    ///         terminal Signa state — intermediate states (Settling /
    ///         Settled / Disputing / Disputed / Arbitrating) are still
    ///         in motion and could flip; we refuse to settle until the
    ///         market is provably terminal.
    error MarketNotFinalized(address market, uint8 actualStatus);

    /// @notice Thrown by `settleByOnChainRead` when the Signa market
    ///         reports `Finalized` but a `finalOption` that is neither
    ///         `VOID_SENTINEL` nor a non-negative option index (i.e.
    ///         some int8 in [-127, -1]). Per Signa's spec this can't
    ///         happen — Finalized markets carry only valid option
    ///         indices or the void sentinel. If it does, Signa's
    ///         oracle is self-contradictory; the right reaction is
    ///         to stop and not pay out (don't silently misread as
    ///         Miss). The policy stays Active and falls under
    ///         CLAUDE.md §9's "Signa stuck" pre-mainnet emergency-
    ///         settle path.
    error MarketAnomalousOutcome(address market, int8 finalOption);

    /// @notice Thrown when `triggerSettlement` / `settleByOnChainRead`
    ///         / `claim` is called with a policyId that was never
    ///         minted (owner == address(0)).
    error PolicyNotFound(uint256 policyId);

    /// @notice Thrown when `triggerSettlement` or `settleByOnChainRead`
    ///         is called on a policy that has already left the Active
    ///         state. The current status is included so the caller
    ///         can diagnose without a second RPC.
    error PolicyNotActive(uint256 policyId, PolicyStatus currentStatus);

    /// @notice Thrown when `claim` is called by an address other than
    ///         the policy's owner.
    error NotPolicyOwner(uint256 policyId);

    /// @notice Thrown when `claim` is called and `claimableOf` returns 0.
    ///         Covers: Active (not yet settled), Hit / Void (terminal,
    ///         no payout), Completed (already fully claimed), Releasing
    ///         but not enough time has elapsed since the last claim.
    error NothingToClaim(uint256 policyId);

    /// @notice Thrown when a constructor parameter or `rescueToken`
    ///         recipient is the zero address.
    error ZeroAddress();

    // ─── Events ──────────────────────────────────────────────────

    /// @notice Emitted on every successful `buyPolicy`. `signaMarket`
    ///         is indexed so indexers can filter for "all policies
    ///         against market X" without scanning every log; `owner`
    ///         is indexed for the per-user views. `claimOption` and
    ///         the economic fields are inline (non-indexed) since
    ///         they're rarely filter targets.
    event PolicyMinted(
        uint256 indexed policyId,
        address indexed owner,
        address indexed signaMarket,
        uint8 claimOption,
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

    /// @notice Emitted by `settleByOnChainRead`'s Miss branch when
    ///         the buyer's current Signa position is smaller than the
    ///         insured principal at mint time. The cap value
    ///         (`cappedPrincipal = userBets at settle time`) becomes
    ///         the new `Policy.principal` and the release / claim
    ///         basis. Under Signa's no-shrink guarantee this never
    ///         fires; emission marks the guarantee as violated for
    ///         that policy (Signa allowed a partial cancel or some
    ///         other edge), and we paid the cost of catching it.
    event PolicyPrincipalCapped(
        uint256 indexed policyId,
        uint256 originalPrincipal,
        uint256 cappedPrincipal
    );

    /// @notice Emitted on every Q change, including the bootstrap value
    ///         set in the constructor (oldQBps = 0 in that case).
    event QUpdated(uint256 oldQBps, uint256 newQBps, address indexed admin);

    /// @notice Emitted when an admin rescues stuck or surplus tokens
    ///         via `rescueToken`. `token` may be the protocol's own
    ///         `usdc` — see `rescueToken` NatSpec.
    event TokenRescued(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    // ─── Constructor ─────────────────────────────────────────────

    /// @param _usdc          ERC20 used for premium + payout transfers.
    ///                       Must match Signa Pulse's base token so
    ///                       payouts don't need decimal-bridging.
    /// @param _signaFactory  Signa Pulse factory registry. Immutable;
    ///                       trust anchor for `buyPolicy`'s bijection
    ///                       check (D1 防伪).
    /// @param _admin         Account that receives DEFAULT_ADMIN_ROLE
    ///                       (may call `setQ`, grant/revoke other roles,
    ///                       `rescueToken`).
    /// @param _settler       Account that receives SETTLER_ROLE (calls
    ///                       `triggerSettlement`). Retained through
    ///                       Segment 5 Phase 5B.3+; deleted in 5B.4
    ///                       when `settleByOnChainRead` takes over.
    /// @param _initialQBps   Initial pricing dial in bps. Same range
    ///                       rule as `setQ` — must be > 0 and <= 10000.
    ///                       PRD recommends 5000 (= Q=0.5).
    constructor(
        IERC20 _usdc,
        IPulseFactoryRegistry _signaFactory,
        address _admin,
        address _settler,
        uint256 _initialQBps
    ) {
        // Zero-address checks — once these slots are baked in (usdc
        // and signaFactory are immutable; the admin/settler role
        // grants can be revoked but not undone retroactively) there's
        // no clean recovery, so we refuse the deploy outright.
        if (address(_usdc) == address(0)) revert ZeroAddress();
        if (address(_signaFactory) == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        if (_settler == address(0)) revert ZeroAddress();
        if (_initialQBps == 0 || _initialQBps > BPS_DENOMINATOR) {
            revert InvalidQBps(_initialQBps);
        }
        usdc = _usdc;
        signaFactory = _signaFactory;
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
    /// @param principal Insured amount `a`, in token base units.
    /// @param kBps      Implied probability snapshot in bps. 0..10_000.
    /// @return base     Q × (1 − k) × a, in token base units.
    /// @return floor_   F × a, in token base units (the 5% floor).
    /// @return premium  max(base, floor_), what `buyPolicy` will charge.
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

    /// @notice Mint a policy on the caller's existing Signa Pulse
    ///         position. Pulls `premium` USDC from msg.sender (requires
    ///         prior `approve`) and records the policy in storage.
    ///
    ///         Validation order (every check before any storage write):
    ///           1. Signa factory bijection — `market` is registered
    ///              (id != 0) AND the reverse lookup matches (D1).
    ///           2. Market is `Running` — only undecided markets are
    ///              insurable (D1(a)); pre-decided markets would let
    ///              the buyer arbitrage a known outcome.
    ///           3. Caller has a position — `userBets(msg.sender,
    ///              claimOption) > 0` (D1(b)). The returned value
    ///              becomes the insured `principal` — chain truth, no
    ///              caller-supplied number (D1(c)).
    ///           4. Position not already insured — at most one policy
    ///              per (market, buyer, option).
    ///           5. Premium quote — `quotePremium` validates kBps
    ///              range; `principal > 0` is already guaranteed by
    ///              step 3.
    ///
    ///         v1 trust model: caller-supplied `kBps` is still accepted
    ///         at face value pending the QUOTER_ROLE signed-quote model
    ///         (AUDIT.md pre-mainnet item). `principal` is no longer
    ///         caller-supplied — the chain-read `userBets` value is the
    ///         single source of truth, which closes the AUDIT High item
    ///         "orderHash not verified against Signa".
    ///
    ///         Strict checks-effects-interactions: every state write
    ///         (including the dedup mark) happens before the external
    ///         `safeTransferFrom`. The Signa factory + market reads in
    ///         steps 1–3 are view calls (no reentry); CEI is what
    ///         protects against a malicious USDC.
    ///
    /// @param  signaMarket  Address of a Signa Pulse market the buyer
    ///                      already has a position in. Must be
    ///                      registered with `signaFactory`.
    /// @param  claimOption  The market option index this policy insures.
    /// @param  kBps         Implied probability snapshot in bps. 0..10_000.
    /// @return policyId     The freshly-minted policy's id.
    function buyPolicy(
        address signaMarket,
        uint8 claimOption,
        uint16 kBps
    ) external returns (uint256 policyId) {
        // ─ CHECKS ─
        // 1. Factory bijection (防伪).
        uint256 marketId = signaFactory.marketIds(signaMarket);
        if (marketId == 0) revert NotRegisteredMarket(signaMarket);
        if (signaFactory.markets(marketId) != signaMarket) {
            revert MarketRegistryMismatch(signaMarket, marketId);
        }

        // 2. Only undecided markets are insurable.
        IPulseMarket.Status currentStatus =
            IPulseMarket(signaMarket).status();
        if (currentStatus != IPulseMarket.Status.Running) {
            revert MarketNotRunning(signaMarket, uint8(currentStatus));
        }

        // 3. Buyer must have a real position — and that position IS
        //    the insured principal. No caller-supplied principal.
        uint256 principal = IPulseMarket(signaMarket).userBets(
            msg.sender,
            claimOption
        );
        if (principal == 0) {
            revert NoPositionToInsure(signaMarket, msg.sender, claimOption);
        }

        // 4. One policy per (market, buyer, option).
        uint256 existing =
            policyIdByPosition[signaMarket][msg.sender][claimOption];
        if (existing != 0) {
            revert PositionAlreadyInsured(
                signaMarket,
                msg.sender,
                claimOption,
                existing
            );
        }

        // 5. quotePremium validates kBps ≤ BPS_DENOMINATOR; principal
        //    > 0 is already guaranteed by step 3.
        (, , uint256 premium) = quotePremium(principal, kBps);

        // ─ EFFECTS ─
        policyId = nextPolicyId;
        unchecked {
            // Solidity 0.8 default-checks the ++; nextPolicyId is a
            // free-running uint256 counter, no realistic overflow.
            nextPolicyId = policyId + 1;
        }
        policyIdByPosition[signaMarket][msg.sender][claimOption] = policyId;
        policies[policyId] = Policy({
            owner: msg.sender,
            status: PolicyStatus.Active,
            kBps: kBps,
            mintedAt: uint32(block.timestamp),
            settledAt: 0,
            signaMarket: signaMarket,
            claimOption: claimOption,
            principal: principal,
            premium: premium,
            claimed: 0
        });

        emit PolicyMinted(
            policyId,
            msg.sender,
            signaMarket,
            claimOption,
            principal,
            kBps,
            premium
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

    // ─── Public: settleByOnChainRead ─────────────────────────────

    /// @notice Settle a policy by directly reading the linked Signa
    ///         market's terminal state. Permissionless — anyone can
    ///         call. The outcome is deterministic from chain state,
    ///         so the caller has no influence over the result;
    ///         griefing amounts to paying gas to advance someone
    ///         else's policy.
    ///
    ///         Replaces v1's trust-the-settler model: 5B.4 deletes
    ///         `SETTLER_ROLE` + `triggerSettlement` entirely, leaving
    ///         this as the only settlement entrypoint.
    ///
    ///         Exhaustive four-branch dispatch on
    ///         `market.finalOption()`:
    ///           1. fin == VOID_SENTINEL                        → Void
    ///           2. fin >= 0 && uint8(fin) == claimOption       → Hit
    ///           3. fin >= 0                                    → Miss
    ///           4. else  (fin < 0 and fin != VOID_SENTINEL)    → revert
    ///                                                            MarketAnomalousOutcome
    ///
    ///         Branch 4 is reachable only if Signa returns a negative
    ///         `finalOption` other than `VOID_SENTINEL`. Per Signa's
    ///         spec it can't happen; if it does, the oracle is
    ///         self-contradictory and the correct reaction is to stop
    ///         and not pay out (rather than silently misreading as
    ///         Miss and over-paying). The §9 "Signa stuck" pre-
    ///         mainnet emergency-settle entrypoint is what would
    ///         unstick a policy in this state.
    ///
    ///         Miss-branch min-cap (D1 follow-up): if the buyer's
    ///         current chain position (`userBets(p.owner, claimOption)`)
    ///         is smaller than the insured `principal` from mint time,
    ///         `p.principal` is shrunk to the live value and
    ///         `PolicyPrincipalCapped` is emitted. Under Signa's
    ///         no-shrink guarantee this never fires; it's the
    ///         verification step that turns the assumption into a
    ///         hard guarantee.
    ///
    ///         CEI: in the Void branch the status flip + both events
    ///         happen before `safeTransfer`. The Signa reads are
    ///         STATICCALL views — no reentry path. Branches 2 and 3
    ///         don't transfer.
    ///
    /// @param policyId  Id from a prior `buyPolicy`.
    function settleByOnChainRead(uint256 policyId) external {
        Policy storage p = policies[policyId];

        // ─ CHECKS ─
        if (p.owner == address(0)) revert PolicyNotFound(policyId);
        if (p.status != PolicyStatus.Active) {
            revert PolicyNotActive(policyId, p.status);
        }

        IPulseMarket market = IPulseMarket(p.signaMarket);
        IPulseMarket.Status mStatus = market.status();
        if (mStatus != IPulseMarket.Status.Finalized) {
            revert MarketNotFinalized(p.signaMarket, uint8(mStatus));
        }

        int8 fin = market.finalOption();
        uint8 claimOption_ = p.claimOption;

        // ─ EFFECTS ─
        uint32 settledAt = uint32(block.timestamp);
        p.settledAt = settledAt;

        if (fin == VOID_SENTINEL) {
            // Branch 1: Void — refund the original premium.
            p.status = PolicyStatus.Void;
            address owner_ = p.owner;
            uint256 refund = p.premium;
            emit PolicySettled(policyId, SettlementOutcome.Void, settledAt);
            emit PolicyRefunded(policyId, owner_, refund);
            // ─ INTERACTIONS (Void only) ─
            usdc.safeTransfer(owner_, refund);
        } else if (fin >= 0 && uint8(fin) == claimOption_) {
            // Branch 2: Hit — buyer's option won; premium retained.
            p.status = PolicyStatus.Hit;
            emit PolicySettled(policyId, SettlementOutcome.Hit, settledAt);
        } else if (fin >= 0) {
            // Branch 3: Miss — apply min-cap then transition to
            // Releasing. (fin >= 0 here AND fin != claimOption_ by
            // elimination from branch 2.)
            uint256 freshUserBets = market.userBets(p.owner, claimOption_);
            if (freshUserBets < p.principal) {
                uint256 oldPrincipal = p.principal;
                p.principal = freshUserBets;
                emit PolicyPrincipalCapped(
                    policyId,
                    oldPrincipal,
                    freshUserBets
                );
            }
            p.status = PolicyStatus.Releasing;
            emit PolicySettled(policyId, SettlementOutcome.Miss, settledAt);
        } else {
            // Branch 4: anomalous — fin < 0 and fin != VOID_SENTINEL.
            // Signa promised no such state on Finalized markets;
            // refuse to pay out. The settledAt write above is rolled
            // back by the revert (Solidity tx-atomic).
            revert MarketAnomalousOutcome(p.signaMarket, fin);
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
    ///
    /// @param  policyId Id of the policy to read.
    /// @return amount   Released principal in token base units.
    function releasedOf(uint256 policyId)
        public
        view
        returns (uint256 amount)
    {
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
    ///
    /// @param  policyId Id of the policy to read.
    /// @return amount   Claimable amount in token base units.
    function claimableOf(uint256 policyId)
        public
        view
        returns (uint256 amount)
    {
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

    // ─── Admin: rescueToken ──────────────────────────────────────

    /// @notice Sweep ERC20 tokens out of the contract. Used for:
    ///         (a) draining mis-sent / airdropped tokens that aren't
    ///         part of the protocol; (b) re-balancing or winding down
    ///         the testnet payout pool of `usdc` itself.
    ///
    /// @dev    DELIBERATELY accepts `token == usdc`. The protocol's
    ///         own USDC reserve is project-controlled (PRD §8.2 testnet
    ///         pre-fund; mainnet solvency mechanism per PRD §9.1 is a
    ///         separate decision). Concentrating this power on
    ///         DEFAULT_ADMIN_ROLE means **the mainnet admin MUST be a
    ///         multisig**, and a timelock on top is strongly
    ///         recommended — see AUDIT.md.
    ///
    ///         The owner of an active policy could theoretically have
    ///         their payout drained by a compromised / malicious
    ///         admin. The multisig requirement is the social /
    ///         operational mitigation; there is no on-chain
    ///         escrow-style guard in v1.
    ///
    ///         `nonReentrant` matches `claim`'s defensive style — if a
    ///         hostile rescued token tried to re-enter, the guard
    ///         catches it. CEI: emit before transfer.
    ///
    /// @param token   ERC20 to sweep. Pass the protocol `usdc` to
    ///                drain payout-pool surplus.
    /// @param to      Recipient. Must not be the zero address.
    /// @param amount  Amount in token base units.
    function rescueToken(
        IERC20 token,
        address to,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        emit TokenRescued(address(token), to, amount);
        token.safeTransfer(to, amount);
    }
}
