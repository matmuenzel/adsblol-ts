/**
 * Combines several abort signals into one that aborts as soon as any input aborts.
 *
 * Uses `AbortSignal.any` (Node.js 22 and later, all current browsers). The abort
 * reason of the first aborting signal is propagated.
 *
 * @param signals - Signals to combine; `undefined` entries are ignored.
 * @returns The combined signal, or `undefined` if no signal was given.
 */
export function combineSignals(signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const present = signals.filter((s): s is AbortSignal => s !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return AbortSignal.any(present);
}
