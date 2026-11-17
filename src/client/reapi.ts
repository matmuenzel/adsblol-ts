/**
 * Query builder for the adsb.lol re-api (readsb's query interface).
 *
 * The re-api is configured through a query string such as
 * `/?circle=51.47,-0.45,10&filter_mil&jv2`. Lists are joined with a literal
 * comma and flags are written without `=`. Every query ends with `&jv2` so the
 * response has the same shape as the regular API.
 *
 * This module is internal and is not re-exported from the package entry point.
 * Invalid input throws a {@link ValidationError} with status `undefined`, so no
 * request is made. Issues are located at `["query", <parameter name>]`.
 */

import { ValidationError } from "../errors/index.js";
import {
  assertLat,
  assertLon,
  assertRadiusNm,
  assertSquawk,
  normalizeAircraftType,
  normalizeCallsign,
  normalizeHex,
  normalizeRegistration,
} from "./validate.js";

/** Issue type used for all problems detected on the client. */
const CLIENT_VALIDATION_TYPE = "client_validation";
/** Maximum number of values in one list (readsb limit for `find_*` queries). */
const MAX_LIST_LENGTH = 1000;
/** Characters that would break the query syntax if left in a value. */
const FORBIDDEN_VALUE_CHARS = /[,&=#]/;

/**
 * Filters applied on top of a base query.
 *
 * `military`, `pia` and `ladd` are OR-ed with each other: an aircraft matching
 * any enabled one of them is kept. All other filters are AND-ed with each
 * other and with that group. Flags set to `false` or `undefined` add nothing.
 */
export interface ReApiFilter {
  /** Keep only aircraft whose callsign equals one of these (max 1000 entries, no `,` `&` `=` `#`). */
  callsignExact?: string[];
  /** Keep only aircraft whose callsign starts with this prefix, e.g. `"UAL"`. */
  callsignPrefix?: string;
  /** Keep only aircraft squawking one of these codes, four octal digits each, e.g. `"7700"`. */
  squawks?: string[];
  /** Keep only aircraft of these ICAO type designators, e.g. `"A320"` (max 1000 entries). */
  types?: string[];
  /** If `true`, keep only aircraft with a known position. */
  withPosition?: boolean;
  /** Keep only aircraft above this barometric altitude in whole feet. `ground` counts as 0 ft. */
  aboveAltBaroFt?: number;
  /** Keep only aircraft below this barometric altitude in whole feet. `ground` counts as 0 ft. */
  belowAltBaroFt?: number;
  /** If `true`, include aircraft flagged as military (OR-ed with `pia` and `ladd`). */
  military?: boolean;
  /** If `true`, include aircraft using a Privacy ICAO Address (OR-ed with `military` and `ladd`). */
  pia?: boolean;
  /** If `true`, include aircraft on the LADD list (OR-ed with `military` and `pia`). */
  ladd?: boolean;
}

/**
 * A rectangular search area in degrees.
 *
 * `west > east` is allowed and describes a box that crosses the antimeridian
 * (longitude 180). `south <= north` is required.
 */
export interface BoxQuery {
  /** Southern edge in degrees latitude, -90 to 90. Must be at most `north`. */
  south: number;
  /** Northern edge in degrees latitude, -90 to 90. */
  north: number;
  /** Western edge in degrees longitude, -180 to 180. May be greater than `east` (antimeridian). */
  west: number;
  /** Eastern edge in degrees longitude, -180 to 180. */
  east: number;
}

/** The base query of a re-api request. */
export type ReApiBase =
  | {
      /** `circle` returns all aircraft in the area, `closest` only the nearest one. */
      kind: "circle" | "closest";
      /** Latitude of the centre in degrees, -90 to 90. */
      lat: number;
      /** Longitude of the centre in degrees, -180 to 180. */
      lon: number;
      /** Radius in nautical miles, integer from 0 to 250. */
      radiusNm: number;
    }
  | {
      /** Aircraft inside a rectangular box. */
      kind: "box";
      /** The box edges in degrees. */
      box: BoxQuery;
    }
  | {
      /** Every aircraft the server knows about. */
      kind: "all";
      /** If `true`, only aircraft with a known position (`all_with_pos`). */
      withPosition: boolean;
    }
  | {
      /** Look up aircraft by identifier. */
      kind: "find_hex" | "find_callsign" | "find_reg" | "find_type" | "find_squawk";
      /** One to 1000 identifiers, validated per kind; no `,` `&` `=` `#`. */
      values: string[];
    };

/**
 * Throws a ValidationError located in the query.
 *
 * @param param - Parameter name, second element of `loc`.
 * @param msg - Short description of the allowed value.
 */
function fail(param: string, msg: string): never {
  throw new ValidationError(
    msg,
    [{ loc: ["query", param], msg, type: CLIENT_VALIDATION_TYPE }],
    undefined,
  );
}

/**
 * Runs a 0.1 validator and moves its issues from the path to the query.
 *
 * @param fn - Validator call.
 * @param param - Replacement parameter name; defaults to the validator's own name.
 * @returns The validator's result.
 */
function inQuery<T>(fn: () => T, param?: string): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new ValidationError(
        err.message,
        err.issues.map((i) => ({ ...i, loc: ["query", param ?? String(i.loc[1])] })),
        undefined,
        { cause: err },
      );
    }
    throw err;
  }
}

/**
 * Rejects values that would break the query syntax and percent-encodes the rest.
 *
 * @param value - Already validated value.
 * @param param - Parameter name for the error.
 * @returns The encoded value.
 */
function encodeValue(value: string, param: string): string {
  if (value.length === 0 || FORBIDDEN_VALUE_CHARS.test(value)) {
    fail(param, `${param} must not be empty or contain ",", "&", "=" or "#"`);
  }
  return encodeURIComponent(value);
}

/**
 * Validates, encodes and joins a list of values with literal commas.
 *
 * @param values - One to 1000 values.
 * @param field - Name of the list for list-level errors.
 * @param validate - Per-value validator from `validate.ts`.
 * @param param - Name used for forbidden characters in a value.
 * @returns Comma-joined, percent-encoded values.
 */
function encodeList(
  values: unknown,
  field: string,
  validate: (v: string) => string,
  param: string,
): string {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_LIST_LENGTH) {
    fail(field, `${field} must be an array of 1 to ${MAX_LIST_LENGTH} values`);
  }
  // Array.from visits holes in sparse arrays (as undefined), unlike .map.
  return Array.from(values as string[], (v) =>
    encodeValue(
      inQuery(() => validate(v)),
      param,
    ),
  ).join(",");
}

/**
 * Checks that an altitude is a safe integer number of feet.
 *
 * @param value - Altitude in feet (barometric).
 * @param param - Parameter name for the error.
 * @returns The value as a string.
 */
function altitude(value: unknown, param: string): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    fail(param, `${param} must be a whole number of feet`);
  }
  return String(value);
}

/**
 * Builds the base part of the query.
 *
 * @param base - Base query description.
 * @returns The part after `/?`, without filters and `jv2`.
 */
function baseQuery(base: ReApiBase): string {
  if (typeof base !== "object" || base === null) {
    fail("query", "query must be an object");
  }
  switch (base.kind) {
    case "circle":
    case "closest": {
      const lat = inQuery(() => assertLat(base.lat));
      const lon = inQuery(() => assertLon(base.lon));
      const radius = inQuery(() => assertRadiusNm(base.radiusNm));
      return `${base.kind}=${lat},${lon},${radius}`;
    }
    case "box": {
      const b = base.box;
      if (typeof b !== "object" || b === null) {
        fail("box", "box must be an object with south, north, west and east");
      }
      const south = inQuery(() => assertLat(b.south), "south");
      const north = inQuery(() => assertLat(b.north), "north");
      const west = inQuery(() => assertLon(b.west), "west");
      const east = inQuery(() => assertLon(b.east), "east");
      if (south > north) {
        fail("south", "south must be less than or equal to north");
      }
      return `box=${south},${north},${west},${east}`;
    }
    case "all":
      return base.withPosition ? "all_with_pos" : "all";
    case "find_hex":
      return `find_hex=${encodeList(base.values, "values", normalizeHex, "hex")}`;
    case "find_callsign":
      return `find_callsign=${encodeList(base.values, "values", normalizeCallsign, "callsign")}`;
    case "find_reg":
      return `find_reg=${encodeList(base.values, "values", normalizeRegistration, "registration")}`;
    case "find_type":
      return `find_type=${encodeList(base.values, "values", normalizeAircraftType, "type")}`;
    case "find_squawk":
      return `find_squawk=${encodeList(base.values, "values", assertSquawk, "squawk")}`;
    default:
      return fail("kind", "unknown query kind");
  }
}

/**
 * Builds the filter parts in the fixed order of the {@link ReApiFilter} fields.
 *
 * @param filter - Optional filter.
 * @returns Query parts such as `filter_mil`, each without a leading `&`.
 */
function filterParts(filter: ReApiFilter | undefined): string[] {
  if (filter === undefined) {
    return [];
  }
  if (typeof filter !== "object" || filter === null) {
    fail("filter", "filter must be an object");
  }
  const parts: string[] = [];
  if (filter.callsignExact !== undefined) {
    const list = encodeList(filter.callsignExact, "callsignExact", normalizeCallsign, "callsign");
    parts.push(`filter_callsign_exact=${list}`);
  }
  if (filter.callsignPrefix !== undefined) {
    const prefix = inQuery(
      () => normalizeCallsign(filter.callsignPrefix as string),
      "callsignPrefix",
    );
    parts.push(`filter_callsign_prefix=${encodeValue(prefix, "callsignPrefix")}`);
  }
  if (filter.squawks !== undefined) {
    parts.push(`filter_squawk=${encodeList(filter.squawks, "squawks", assertSquawk, "squawk")}`);
  }
  if (filter.types !== undefined) {
    parts.push(`filter_type=${encodeList(filter.types, "types", normalizeAircraftType, "type")}`);
  }
  if (filter.withPosition === true) {
    parts.push("filter_with_pos");
  }
  if (filter.aboveAltBaroFt !== undefined) {
    parts.push(`above_alt_baro=${altitude(filter.aboveAltBaroFt, "aboveAltBaroFt")}`);
  }
  if (filter.belowAltBaroFt !== undefined) {
    parts.push(`below_alt_baro=${altitude(filter.belowAltBaroFt, "belowAltBaroFt")}`);
  }
  if (filter.military === true) {
    parts.push("filter_mil");
  }
  if (filter.pia === true) {
    parts.push("filter_pia");
  }
  if (filter.ladd === true) {
    parts.push("filter_ladd");
  }
  return parts;
}

/**
 * Builds a re-api query string.
 *
 * @param base - Base query: area, all aircraft, or a lookup list.
 * @param filter - Optional filters, applied in the fixed order of {@link ReApiFilter}.
 * @returns A string starting with `/?` and ending with `&jv2`,
 *   e.g. `/?circle=51.47,-0.45,10&filter_mil&jv2`.
 * @throws {ValidationError} If any input is invalid; issues are located at `["query", name]`.
 */
export function buildReApiQuery(base: ReApiBase, filter?: ReApiFilter): string {
  return `/?${[baseQuery(base), ...filterParts(filter), "jv2"].join("&")}`;
}
