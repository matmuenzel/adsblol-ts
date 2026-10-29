/**
 * Combines several abort signals into one that aborts as soon as any input aborts.
 *
 * Uses `AbortSignal.any` where available and falls back to an `AbortController`
 * otherwise. The abort reason of the first aborting signal is propagated.
 *
 * @param signals - Signals to combine; `undefined` entries are ignored.
 * @returns The combined signal, or `undefined` if no signal was given.
 */
export function combineSignals(signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const present = signals.filter((s): s is AbortSignal => s !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(present);

  const controller = new AbortController();
  const listeners: [AbortSignal, () => void][] = [];
  const cleanup = (): void => {
    for (const [signal, listener] of listeners) signal.removeEventListener("abort", listener);
  };
  for (const signal of present) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      cleanup();
      return controller.signal;
    }
    const listener = (): void => {
      controller.abort(signal.reason);
      cleanup();
    };
    signal.addEventListener("abort", listener, { once: true });
    listeners.push([signal, listener]);
  }
  return controller.signal;
}
