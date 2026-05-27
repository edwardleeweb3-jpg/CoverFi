// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPulseFactoryRegistry} from "../signa/IPulseFactoryRegistry.sol";

/// @title  MockPulseFactoryRegistry
/// @notice TEST-ONLY stand-in for the Signa Pulse factory's market
///         registry. `register(market)` is the normal path — assigns
///         the next id (starting at 1, since 0 is the not-registered
///         sentinel) and writes both directions of the bijection.
///         The two `forceSet*` back doors let tests construct the
///         "id != 0 but reverse-lookup mismatches" attack scenario
///         that exercises CoverFi's bidirectional registry check
///         (`MarketRegistryMismatch`).
/// @dev    NEVER deploy. Lives under `src/test/`.
contract MockPulseFactoryRegistry is IPulseFactoryRegistry {
    mapping(uint256 => address) public override markets;
    mapping(address => uint256) public override marketIds;
    uint256 public nextId = 1;

    /// @notice Normal-path registration. Assigns the next id and
    ///         writes both directions of the bijection.
    function register(address market) external returns (uint256 id) {
        id = nextId;
        nextId = id + 1;
        markets[id] = market;
        marketIds[market] = id;
    }

    /// @notice Test-only back door: write `marketIds[market] = id`
    ///         WITHOUT touching `markets[id]`. Used to construct the
    ///         "id is non-zero but `markets(id) != market`" attack
    ///         scenario exercising CoverFi's reverse-lookup check.
    function forceSetIdOnly(address market, uint256 id) external {
        marketIds[market] = id;
    }

    /// @notice Test-only back door: write `markets[id] = market`
    ///         WITHOUT touching `marketIds[market]`. Symmetric
    ///         counterpart to `forceSetIdOnly`.
    function forceSetMarketAtId(uint256 id, address market) external {
        markets[id] = market;
    }
}
