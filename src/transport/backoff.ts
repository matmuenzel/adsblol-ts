/**
 * Computes the wait before a retry using exponential backoff with full jitter.
 *
 * @param retryIndex - Zero-based index of the retry (0 = wait before the second attempt).
 * @param opts - `baseDelayMs`: delay base in milliseconds; `maxDelayMs`: upper bound in milliseconds.
 * @param random - Random source returning a number in `[0, 1]`.
 * @returns Delay in milliseconds, between 0 and `min(maxDelayMs, baseDelayMs * 2 ** retryIndex)`.
 */
export function computeBackoffMs(
  retryIndex: number,
  opts: { baseDelayMs: number; maxDelayMs: number },
  random: () => number,
): number {
  return random() * Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** retryIndex);
}

/**
 * Parses a `Retry-After` header value.
 *
 * @param header - Raw header value (delta seconds or HTTP date), or `null` if absent.
 * @param nowMs - Current time in milliseconds since the epoch, used for HTTP dates.
 * @returns Wait time in milliseconds (never negative), or `undefined` if the value is unusable.
 */
export function parseRetryAfter(header: string | null, nowMs: number): number | undefined {
  if (header === null) return undefined;
  const value = header.trim();
  if (value === "") return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * 1000;
  // Date.parse would accept bare numbers such as "-5"; HTTP dates always contain letters.
  if (!/[a-z]/i.test(value)) return undefined;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - nowMs);
}
