import { describe, expect, it } from "vitest";
import { computeBackoffMs, parseRetryAfter } from "../../src/transport/backoff.js";

const opts = { baseDelayMs: 500, maxDelayMs: 8000 };

describe("computeBackoffMs", () => {
  it("uses the base delay for the first retry at full jitter", () => {
    expect(computeBackoffMs(0, opts, () => 1)).toBe(500);
  });
  it("doubles per retry", () => {
    expect(computeBackoffMs(3, opts, () => 1)).toBe(4000);
  });
  it("caps at maxDelayMs", () => {
    expect(computeBackoffMs(10, opts, () => 1)).toBe(8000);
  });
  it("returns 0 when random is 0", () => {
    expect(computeBackoffMs(2, opts, () => 0)).toBe(0);
  });
});

describe("parseRetryAfter", () => {
  it("parses delta seconds", () => {
    expect(parseRetryAfter("3", 0)).toBe(3000);
  });
  it("parses an HTTP date relative to now", () => {
    expect(
      parseRetryAfter("Wed, 28 Oct 2026 07:52:00 GMT", Date.parse("Wed, 28 Oct 2026 07:51:55 GMT")),
    ).toBe(5000);
  });
  it("returns 0 for a date in the past", () => {
    expect(
      parseRetryAfter("Wed, 28 Oct 2026 07:51:00 GMT", Date.parse("Wed, 28 Oct 2026 07:51:55 GMT")),
    ).toBe(0);
  });
  it("returns undefined for nonsense and null", () => {
    expect(parseRetryAfter("abc", 0)).toBeUndefined();
    expect(parseRetryAfter(null, 0)).toBeUndefined();
    expect(parseRetryAfter("-5", 0)).toBeUndefined();
  });
});
