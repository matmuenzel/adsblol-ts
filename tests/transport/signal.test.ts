import { describe, expect, it } from "vitest";
import { combineSignals } from "../../src/transport/signal.js";

describe("combineSignals", () => {
  it("returns undefined when there are no signals", () => {
    expect(combineSignals([undefined, undefined])).toBeUndefined();
  });

  it("returns the single signal unchanged", () => {
    const c = new AbortController();
    expect(combineSignals([undefined, c.signal])).toBe(c.signal);
  });

  it("aborts when either signal aborts", () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combineSignals([a.signal, b.signal])!;
    expect(combined.aborted).toBe(false);
    b.abort(new Error("b"));
    expect(combined.aborted).toBe(true);
  });

  it("propagates the reason of the aborting signal", () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combineSignals([a.signal, b.signal])!;
    const reason = new Error("stop");
    a.abort(reason);
    expect(combined.reason).toBe(reason);
  });

  it("is aborted immediately if an input is already aborted", () => {
    const a = new AbortController();
    a.abort();
    expect(combineSignals([new AbortController().signal, a.signal])!.aborted).toBe(true);
  });
});
