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

  describe("without AbortSignal.any", () => {
    it("still aborts when one signal aborts, and propagates the reason", () => {
      const original = Object.getOwnPropertyDescriptor(AbortSignal, "any");
      try {
        Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
        const a = new AbortController();
        const b = new AbortController();
        const combined = combineSignals([a.signal, b.signal])!;
        expect(combined.aborted).toBe(false);
        const reason = new Error("stop");
        a.abort(reason);
        expect(combined.aborted).toBe(true);
        expect(combined.reason).toBe(reason);
      } finally {
        if (original) Object.defineProperty(AbortSignal, "any", original);
      }
    });

    it("is aborted immediately if an input is already aborted", () => {
      const original = Object.getOwnPropertyDescriptor(AbortSignal, "any");
      try {
        Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
        const a = new AbortController();
        a.abort();
        const combined = combineSignals([new AbortController().signal, a.signal])!;
        expect(combined.aborted).toBe(true);
      } finally {
        if (original) Object.defineProperty(AbortSignal, "any", original);
      }
    });
  });
});
