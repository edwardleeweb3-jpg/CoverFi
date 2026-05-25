/**
 * Short form like `0x1234…5678` for display in headers and pills.
 * Returns "" for falsy input so callers can pass undefined safely.
 */
export function shortAddress(addr: string | undefined | null): string {
  if (!addr || addr.length < 10) return addr ?? "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
