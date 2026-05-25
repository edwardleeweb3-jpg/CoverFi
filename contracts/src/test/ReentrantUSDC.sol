// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal slice of CoverFiPolicy needed to re-enter from this token.
interface IClaimable {
    function claim(uint256 policyId) external;
}

/// @title ReentrantUSDC
/// @notice TEST-ONLY ERC20 whose `transfer()` re-enters a configured
///         target contract's `claim()` once. Used by the reentrancy
///         probe in CoverFiPolicy tests to prove `nonReentrant` + CEI
///         actually block the attack — passing the test means the
///         re-entry hits OZ's `ReentrancyGuardReentrantCall` and the
///         outer claim reverts. NEVER deploy.
///
/// @dev    Decimals match real USDC (6) so this token is a drop-in
///         substitute for MockUSDC in test setups.
contract ReentrantUSDC is ERC20 {
    address public target;
    uint256 public attackPolicyId;
    bool public armed;

    constructor() ERC20("Reentrant USDC", "rUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Open faucet — same shape as MockUSDC so test setup
    ///         code can swap one for the other.
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    /// @notice Aim the next attack at `target.claim(policyId)`. The
    ///         attack fires once on the very next call to `transfer`
    ///         where msg.sender == target, then disarms — preventing
    ///         infinite recursion if a future bug ever let the guard
    ///         through.
    function arm(address _target, uint256 _policyId) public {
        target = _target;
        attackPolicyId = _policyId;
        armed = true;
    }

    /// @dev If armed AND the caller is our designated target (i.e.
    ///      CoverFiPolicy.claim is currently mid-execution and just
    ///      hit safeTransfer), reach back into `target.claim` to
    ///      attempt a second payout in the same transaction. The
    ///      target's `nonReentrant` modifier should revert this
    ///      re-entry; that revert bubbles up and rolls back the
    ///      whole outer claim.
    function transfer(address to, uint256 amount)
        public
        override
        returns (bool)
    {
        if (armed && msg.sender == target) {
            armed = false;
            IClaimable(target).claim(attackPolicyId);
        }
        return super.transfer(to, amount);
    }
}
