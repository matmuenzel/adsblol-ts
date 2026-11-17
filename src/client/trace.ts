import type { Aircraft, AircraftSourceType } from "./types.js";

/**
 * One raw trace position as readsb writes it: a positional array.
 * Index: 0 seconds after `timestamp`, 1 latitude (degrees), 2 longitude (degrees),
 * 3 barometric altitude (ft or `"ground"`), 4 ground speed (kt), 5 track (degrees),
 * 6 flags bitfield, 7 vertical rate (ft/min), 8 extra aircraft details, 9 position source,
 * 10 geometric altitude (ft), 11 geometric vertical rate (ft/min), 12 indicated airspeed (kt),
 * 13 roll angle (degrees). Older files have only 8 entries; any of 3 to 13 can be `null`.
 */
export type RawTracePoint = [
  number,
  number,
  number,
  number | "ground" | null,
  number | null,
  number | null,
  number,
  number | null,
  (Record<string, unknown> | null)?,
  (string | null)?,
  (number | null)?,
  (number | null)?,
  (number | null)?,
  (number | null)?,
];

/** One aircraft's stored trace as returned by `/1/trace/{full,recent}/{icao_hex}`. */
export interface RawTrace {
  /** ICAO 24-bit address, 6 lowercase hex digits. */
  icao: string;
  /** Unix time of the first point, in seconds. Point offsets are relative to this. */
  timestamp: number;
  /** One entry per stored position. */
  trace: RawTracePoint[];
  /** Registration from the aircraft database. */
  r?: string;
  /** ICAO type code from the aircraft database. */
  t?: string;
  /** Database flags bitfield. */
  dbFlags?: number;
  /** Long type name from the aircraft database. */
  desc?: string;
  /** Registered owner or operator from the aircraft database. */
  ownOp?: string;
  /** Year of manufacture from the aircraft database. */
  year?: string;
  /** Observed as a readsb build string; the spec declares an integer ADS-B version. */
  version?: string | number;
}

/** One trace position as an object. Absent values are `undefined`. */
export interface TracePoint {
  /** Time of this position as Unix time in milliseconds. */
  time: number;
  /** Latitude in decimal degrees (WGS84). */
  lat: number;
  /** Longitude in decimal degrees (WGS84). */
  lon: number;
  /** Barometric altitude in feet, or `"ground"`. */
  altitudeFt?: number | "ground";
  /** Ground speed in knots. */
  groundSpeedKt?: number;
  /** True track over ground in degrees; true heading when `altitudeFt` is `"ground"`. */
  trackDeg?: number;
  /** The position is stale (flag bit 1). */
  stale: boolean;
  /** This point starts a new leg (flag bit 2). */
  newLeg: boolean;
  /** `verticalRateFpm` is geometric rather than barometric (flag bit 4). */
  geometricVerticalRate: boolean;
  /** `altitudeFt` is geometric rather than barometric (flag bit 8). */
  geometricAltitude: boolean;
  /** Vertical rate in feet per minute. */
  verticalRateFpm?: number;
  /** Extra aircraft details in the `aircraft.json` shape (a copy of the raw object). */
  details?: Partial<Aircraft>;
  /** Source of this position. Unknown values are passed through as strings. */
  source?: AircraftSourceType;
  /** Geometric altitude in feet. */
  geomAltitudeFt?: number;
  /** Geometric vertical rate in feet per minute. */
  geomVerticalRateFpm?: number;
  /** Indicated airspeed in knots. */
  iasKt?: number;
  /** Roll angle in degrees. */
  rollDeg?: number;
}

/** A parsed trace of one aircraft. */
export interface Trace {
  /** ICAO 24-bit address, 6 lowercase hex digits. */
  hex: string;
  /** Registration from the aircraft database. */
  registration?: string;
  /** ICAO type code from the aircraft database. */
  type?: string;
  /** Long type name from the aircraft database. */
  description?: string;
  /** Registered owner or operator from the aircraft database. */
  ownerOperator?: string;
  /** Year of manufacture from the aircraft database. */
  year?: string;
  /** Readsb build string as observed; the spec says ADS-B version. */
  version?: string | number;
  /** Database flags bitfield (1 military, 2 interesting, 4 PIA, 8 LADD). */
  dbFlags?: number;
  /** Unix time of the first point in milliseconds. */
  startTime: number;
  /** Positions in recorded order. */
  points: TracePoint[];
}

function orUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function parsePoint(p: RawTracePoint, timestamp: number): TracePoint {
  const flags = p[6] ?? 0;
  const details = p[8];
  return {
    time: Math.round((timestamp + p[0]) * 1000),
    lat: p[1],
    lon: p[2],
    altitudeFt: orUndefined(p[3]),
    groundSpeedKt: orUndefined(p[4]),
    trackDeg: orUndefined(p[5]),
    stale: (flags & 1) !== 0,
    newLeg: (flags & 2) !== 0,
    geometricVerticalRate: (flags & 4) !== 0,
    geometricAltitude: (flags & 8) !== 0,
    verticalRateFpm: orUndefined(p[7]),
    details: details ? ({ ...details } as Partial<Aircraft>) : undefined,
    source: orUndefined(p[9]),
    geomAltitudeFt: orUndefined(p[10]),
    geomVerticalRateFpm: orUndefined(p[11]),
    iasKt: orUndefined(p[12]),
    rollDeg: orUndefined(p[13]),
  };
}

/**
 * Translates a raw readsb trace into objects with named, unit-suffixed fields.
 * Also works for files from `globe_history`. Does not mutate the input.
 *
 * @example
 * const trace = parseTrace(rawJson);
 * trace.points[0]?.altitudeFt;
 */
export function parseTrace(raw: RawTrace): Trace {
  return {
    hex: raw.icao,
    registration: raw.r,
    type: raw.t,
    description: raw.desc,
    ownerOperator: raw.ownOp,
    year: raw.year,
    version: raw.version,
    dbFlags: raw.dbFlags,
    startTime: Math.round(raw.timestamp * 1000),
    points: raw.trace.map((p) => parsePoint(p, raw.timestamp)),
  };
}
