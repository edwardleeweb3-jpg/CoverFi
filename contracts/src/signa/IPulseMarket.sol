// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title  IPulseMarket — minimal view interface for Signa Pulse v1 markets
/// @notice Subset CoverFi reads directly. Source: Signa Pulse v1
///         (`PulseMarket.sol`, per the FAQ in
///         `_docs/2026-05-26-signa-pulse-integration-faq.md` §B & §C).
///         Selectors verified against the BSC Testnet beta factory's
///         four registered markets by `contracts/scripts/probe-signa.ts`
///         at 2026-05-27.
/// @dev    The Signa-side write surface (placeBet, settle, dispute,
///         arbitrate, claim …) is deliberately omitted — CoverFi
///         never originates those calls; the user does, through
///         Signa's own UI / SDK.
interface IPulseMarket {
    /// @notice Lifecycle states. Order MUST match Signa's `PulseTypes.sol`
    ///         enum positionally — the on-chain `status()` getter returns
    ///         the underlying uint8 and CoverFi compares against
    ///         `Status.Running` / `Status.Finalized` typed values.
    enum Status {
        Pending,
        Running,
        Settling,
        Settled,
        Disputing,
        Disputed,
        Arbitrating,
        Finalized
    }

    /// @notice Current lifecycle state. CoverFi gates `buyPolicy` on
    ///         `== Running` (only undecided markets are insurable, D1(a))
    ///         and `settleByOnChainRead` on `== Finalized` (only final
    ///         markets can settle a policy, D1).
    function status() external view returns (Status);

    /// @notice Final winning option once the market is `Finalized`.
    ///         `VOID_SENTINEL` (= -128) means the market was voided
    ///         (refund branch); other values are the winning option
    ///         index.
    function finalOption() external view returns (int8);

    /// @notice Net bet (post-entry-fee) `user` placed on `option`.
    ///         CoverFi reads this in `buyPolicy` to derive `principal`
    ///         (the only chain-truth source — D1(c)) and in
    ///         `settleByOnChainRead` to bound payout by the current
    ///         live position (D1 follow-up).
    function userBets(address user, uint8 option)
        external
        view
        returns (uint256);

    /// @notice Cheap "does this address have any position in this
    ///         market" precheck. Useful for discovery flows; CoverFi
    ///         does not rely on it for `buyPolicy` (which calls
    ///         `userBets` directly).
    function hasBet(address user) external view returns (bool);

    /// @notice Number of options the market exposes. Indices are
    ///         `0..optionCount-1`. CoverFi uses this in `buyPolicy`
    ///         to reject `claimOption >= optionCount` — without this
    ///         check, insuring an option index the market will never
    ///         finalize on (whether out-of-range by Signa's own
    ///         enforcement or by the int8 ceiling on `finalOption`)
    ///         routes straight to the Miss branch at settle time,
    ///         making CoverFi pay full principal on a position that
    ///         was guaranteed-to-lose at mint time.
    ///         Return type is `uint8` per Signa Pulse's verified ABI
    ///         (BscScan testnet 0x0eea815bb…, function selector
    ///         0xe32fe90b).
    function optionCount() external view returns (uint8);
}

// Sentinel `IPulseMarket.finalOption()` returns when the market was
// voided (`type(int8).min = -128`). Per FAQ §C and Signa's
// `PulseTypes.sol`. File-level so any consumer can compare against it
// without an interface qualifier; @notice doesn't apply to file-level
// constants in Solidity 0.8.x.
int8 constant VOID_SENTINEL = type(int8).min;
