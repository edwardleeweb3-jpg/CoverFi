// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Testnet stand-in for real USDC. Six decimals (matches real
///         USDC on every chain it exists on — Ethereum, Polygon, BSC,
///         Arbitrum, etc.), with an open public `mint()` so any wallet
///         can faucet itself test funds without gating.
/// @dev    NOT FOR PRODUCTION. The unrestricted mint is a deliberate
///         testnet-faucet design — real USDC has minter roles. The
///         `CoverFiPolicy` contract takes the USDC address as a
///         constructor argument, so mainnet just swaps this token for
///         the real USDC; nothing about the protocol logic changes.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    /// @dev Six decimals to mirror real USDC. Pinning this keeps the
    ///      wei↔display conversion identical between testnet and
    ///      whatever the mainnet token uses, so the frontend's
    ///      bigint math doesn't need a per-network adjustment.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Open faucet. Mints `amount` to `to` from any caller —
    ///         no auth gating. Testnet-only convenience.
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
