// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPulseMarket} from "../signa/IPulseMarket.sol";

/// @title  MockPulseMarket
/// @notice TEST-ONLY stand-in for a Signa Pulse market. Implements
///         `IPulseMarket`'s four view functions plus public setters
///         so individual tests can drive the market through any
///         lifecycle state, final outcome, or per-user bet
///         configuration without needing a real Signa deploy.
/// @dev    NEVER deploy. Lives under `src/test/`.
contract MockPulseMarket is IPulseMarket {
    IPulseMarket.Status private _status;
    int8 private _finalOption;
    mapping(address => mapping(uint8 => uint256)) private _userBets;
    mapping(address => bool) private _hasBet;

    function status() external view override returns (IPulseMarket.Status) {
        return _status;
    }

    function finalOption() external view override returns (int8) {
        return _finalOption;
    }

    function userBets(address user, uint8 option)
        external
        view
        override
        returns (uint256)
    {
        return _userBets[user][option];
    }

    function hasBet(address user) external view override returns (bool) {
        return _hasBet[user];
    }

    /// @notice Drive the market to any lifecycle state.
    function setStatus(IPulseMarket.Status s) external {
        _status = s;
    }

    /// @notice Set `finalOption`; only meaningful once `status` is
    ///         `Finalized`. `int8` so tests can pass `VOID_SENTINEL`
    ///         (-128) and anomalous negatives.
    function setFinalOption(int8 f) external {
        _finalOption = f;
    }

    /// @notice Set the buyer's net bet on a given option. CoverFi
    ///         reads this in `buyPolicy` to derive principal and in
    ///         `settleByOnChainRead`'s Miss branch for the min-cap.
    function setUserBets(address user, uint8 option, uint256 amount)
        external
    {
        _userBets[user][option] = amount;
    }

    /// @notice Independently set the `hasBet` flag (not derived from
    ///         `userBets` automatically; CoverFi doesn't read it, so
    ///         tests don't need it accurate by default).
    function setHasBet(address user, bool v) external {
        _hasBet[user] = v;
    }
}
