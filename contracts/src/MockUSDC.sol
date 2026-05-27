// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Test-only ERC20 mirroring Signa Pulse beta's tUSDC
///         (`0xc03d7E…`) at 18 decimals — the token CoverFi's
///         Segment-5 deploy actually wires to. Open public `mint()`
///         so any wallet can faucet itself test funds.
/// @dev    NOT FOR PRODUCTION. Segment 5 production deploys point
///         CoverFiPolicy at Signa's real tUSDC; this contract is
///         the unit-test stand-in. Six-decimal historical comment
///         removed — Segment 5 dropped the "match real USDC across
///         every chain" rationale (Signa Pulse beta picked 18
///         decimals for its testnet token, and CoverFi matches that
///         so payouts don't need decimal-bridging).
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    /// @dev 18 decimals to match Signa Pulse beta's tUSDC, which is
    ///      what CoverFiPolicy reads from `market.userBets()` and
    ///      uses for premium / payout transfers. Pinning here keeps
    ///      every numeric assertion in the test suite at one
    ///      consistent wei-scale.
    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /// @notice Open faucet. Mints `amount` to `to` from any caller —
    ///         no auth gating. Test-only convenience.
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
