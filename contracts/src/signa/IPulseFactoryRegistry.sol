// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title  IPulseFactoryRegistry — Signa Pulse v1 factory's market registry
/// @notice Minimal subset CoverFi uses to verify that a market address
///         was actually deployed by the canonical Signa factory before
///         trusting any state it returns (防伪, D1). The full factory
///         ABI has create / upgrade / role-management methods that are
///         Signa-team-only and intentionally excluded here.
/// @dev    `markets(id)` and `marketIds(addr)` form a bijection:
///
///             id = factory.marketIds(market);    // 0 ⇒ not registered
///             require(id != 0 && factory.markets(id) == market);
///
///         The reverse-lookup check (second clause) is defense-in-depth:
///         it's symmetric with the off-chain check `verifyMarket()` does
///         in the frontend, and it costs only a second mapping read.
///         Source + verification: see IPulseMarket.sol's header.
interface IPulseFactoryRegistry {
    /// @notice id → market address. Returns `address(0)` for any id
    ///         that hasn't been assigned. id 0 is the sentinel.
    function markets(uint256 id) external view returns (address);

    /// @notice market address → id. Returns 0 for any address not
    ///         registered by this factory.
    function marketIds(address market) external view returns (uint256);
}
