// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal CoverFi slices needed to re-enter from this token.
interface IClaimTarget {
    function claim(uint256 policyId) external;
}
interface ISettleTarget {
    function settleByOnChainRead(uint256 policyId) external;
}
interface IBuyTarget {
    function buyPolicy(
        address signaMarket,
        uint8 claimOption,
        uint16 kBps
    ) external returns (uint256);
}

/// @title  ReentrantUSDC
/// @notice TEST-ONLY ERC20 whose `transfer` and `transferFrom` hooks
///         re-enter CoverFiPolicy once per arm. Three attack modes
///         cover the three CoverFi paths that touch USDC:
///
///           - armClaim     → `transfer` hook re-enters `claim`;
///                            blocked by `nonReentrant`.
///           - armSettle    → `transfer` hook re-enters
///                            `settleByOnChainRead`; blocked by the
///                            Active-status check (CEI: status write
///                            happens before transfer, so the re-entry
///                            sees a non-Active policy and reverts
///                            `PolicyNotActive`).
///           - armBuyPolicy → `transferFrom` hook re-enters
///                            `buyPolicy`; blocked by
///                            `PositionAlreadyInsured` (CEI: the
///                            position-dedup mapping is written before
///                            `safeTransferFrom`, so the re-entry
///                            finds it occupied).
///
///         All three are one-shot — each `arm*` flips a flag that the
///         hook clears on first fire, so a future bug that lets the
///         guard through still can't recurse to infinity.
/// @dev    18 decimals — matches MockUSDC + Signa Pulse beta tUSDC.
///         NEVER deploy. Lives under `src/test/` and is excluded from
///         production paths by convention.
contract ReentrantUSDC is ERC20 {
    address public target;

    bool public claimArmed;
    uint256 public claimAttackId;

    bool public settleArmed;
    uint256 public settleAttackId;

    bool public buyArmed;
    address public buyMarket;
    uint8 public buyOption;
    uint16 public buyKBps;

    constructor() ERC20("Reentrant USDC", "rUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    /// @notice Aim the next `transfer` hook fired by target at
    ///         `target.claim(policyId)`. One-shot.
    function armClaim(address target_, uint256 policyId) external {
        target = target_;
        claimArmed = true;
        claimAttackId = policyId;
    }

    /// @notice Aim the next `transfer` hook at
    ///         `target.settleByOnChainRead(policyId)`. One-shot.
    ///         Note: only fires from the Void branch (which is the
    ///         only branch that does `safeTransfer`).
    function armSettle(address target_, uint256 policyId) external {
        target = target_;
        settleArmed = true;
        settleAttackId = policyId;
    }

    /// @notice Aim the next `transferFrom` hook at
    ///         `target.buyPolicy(market, option, kBps)`. One-shot.
    ///         For the dedup CEI test, the test setup arranges that
    ///         the outer `buyPolicy` and the re-entered `buyPolicy`
    ///         have the SAME `msg.sender` (this contract acts as both
    ///         the USDC and the buyer), so the dedup mapping key
    ///         lines up.
    function armBuyPolicy(
        address target_,
        address market,
        uint8 option,
        uint16 kBps
    ) external {
        target = target_;
        buyArmed = true;
        buyMarket = market;
        buyOption = option;
        buyKBps = kBps;
    }

    /// @notice Wrapper so this contract itself can be the buyer in
    ///         the buyPolicy CEI test. The re-entry's `msg.sender`
    ///         will equal this address — same as the outer call's
    ///         `msg.sender` — so the dedup mapping comparison is
    ///         apples-to-apples.
    function callBuyPolicy(
        address coverFi,
        address market,
        uint8 option,
        uint16 kBps
    ) external returns (uint256) {
        return IBuyTarget(coverFi).buyPolicy(market, option, kBps);
    }

    /// @notice Set `allowance[address(this)][spender] = amount`.
    ///         Needed because the standard `approve` would set
    ///         `allowance[msg.sender][spender]` — and the buyPolicy
    ///         CEI test needs CoverFi to be approved to pull from
    ///         THIS contract's balance, not from the test EOA.
    function approveSelf(address spender, uint256 amount) external {
        _approve(address(this), spender, amount);
    }

    /// @dev Hooks claim + settle attacks (both ride `transfer`).
    function transfer(address to, uint256 amount)
        public
        override
        returns (bool)
    {
        if (msg.sender == target) {
            if (claimArmed) {
                claimArmed = false;
                IClaimTarget(target).claim(claimAttackId);
            } else if (settleArmed) {
                settleArmed = false;
                ISettleTarget(target).settleByOnChainRead(settleAttackId);
            }
        }
        return super.transfer(to, amount);
    }

    /// @dev Hooks the buyPolicy attack (rides `transferFrom`).
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        if (msg.sender == target && buyArmed) {
            buyArmed = false;
            IBuyTarget(target).buyPolicy(buyMarket, buyOption, buyKBps);
        }
        return super.transferFrom(from, to, amount);
    }
}
