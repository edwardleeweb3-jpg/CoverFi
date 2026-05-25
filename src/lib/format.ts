/**
 * Short form like `0x1234…5678` for display in headers and pills.
 * Returns "" for falsy input so callers can pass undefined safely.
 */
export function shortAddress(addr: string | undefined | null): string {
  if (!addr || addr.length < 10) return addr ?? "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * USDC display formatter — "1,234.56" style, always 2 decimals + en-US
 * thousands separators. Matches the prototype's `money()`. Real on-chain
 * amounts will be `bigint` wei in a later step; this stays as the
 * display layer regardless.
 */
export function money(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Percentage formatter for k display — "31%" style. Rounds to integer. */
export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
