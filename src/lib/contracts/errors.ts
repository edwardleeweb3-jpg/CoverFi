import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
} from "viem";

/**
 * Classifiers for the wagmi / viem error shapes thrown by
 * `useWriteContract` and `waitForTransactionReceipt`. Wallet
 * interactions throw a small number of well-known error types
 * nested inside `BaseError`; these helpers walk the cause chain
 * and surface the answer as a plain boolean / string.
 */

/** User explicitly rejected the signature prompt in the wallet. */
export function isUserRejection(err: unknown): boolean {
  if (!(err instanceof BaseError)) return false;
  return err.walk((e) => e instanceof UserRejectedRequestError) !== null;
}

/**
 * Extract the name of a custom error thrown by a contract revert
 * (e.g. "OrderAlreadyInsured", "InvalidKBps"), or null if the error
 * isn't a contract revert with a recognised custom-error payload.
 */
export function revertedWith(err: unknown): string | null {
  if (!(err instanceof BaseError)) return null;
  const cause = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(cause instanceof ContractFunctionRevertedError)) return null;
  return cause.data?.errorName ?? null;
}
