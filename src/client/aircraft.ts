import type { Aircraft } from "./types.js";

/** Bits of `Aircraft.dbFlags` verified against the API. */
export const DbFlag = { Military: 1, Pia: 4, Ladd: 8 } as const;

function hasFlag(a: Pick<Aircraft, "dbFlags">, flag: number): boolean {
  return ((a.dbFlags ?? 0) & flag) !== 0;
}

/** True if the aircraft is flagged as military. */
export function isMilitary(a: Pick<Aircraft, "dbFlags">): boolean {
  return hasFlag(a, DbFlag.Military);
}

/** True if the aircraft uses a Privacy ICAO Address (PIA). */
export function isPia(a: Pick<Aircraft, "dbFlags">): boolean {
  return hasFlag(a, DbFlag.Pia);
}

/** True if the aircraft is on the LADD (Limiting Aircraft Data Displayed) list. */
export function isLadd(a: Pick<Aircraft, "dbFlags">): boolean {
  return hasFlag(a, DbFlag.Ladd);
}

/** True if the barometric altitude is reported as `"ground"`. */
export function isOnGround(a: Pick<Aircraft, "alt_baro">): boolean {
  return a.alt_baro === "ground";
}

/** Barometric altitude in feet, or `undefined` when on the ground or unknown. */
export function altitudeFt(a: Pick<Aircraft, "alt_baro">): number | undefined {
  return typeof a.alt_baro === "number" ? a.alt_baro : undefined;
}

/** Trimmed callsign, or `undefined` when absent or blank. */
export function callsign(a: Pick<Aircraft, "flight">): string | undefined {
  const trimmed = a.flight?.trim();
  return trimmed ? trimmed : undefined;
}

/** Converts a millisecond Unix timestamp (such as `AircraftResponse.now`) to a `Date`. */
export function toDate(ms: number): Date {
  return new Date(ms);
}
