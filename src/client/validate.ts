/**
 * Client-side validation and normalization of request parameters.
 *
 * Every function here runs before a request is sent. Invalid input throws a
 * {@link ValidationError} with status `undefined`, so no network call is made.
 * This module is internal and is not re-exported from the package entry point.
 */

import { ValidationError, type ValidationIssue } from "../errors/index.js";

/** Issue type used for all problems detected on the client. */
const CLIENT_VALIDATION_TYPE = "client_validation";

/** Latitude limit in degrees. */
const LAT_MAX_DEG = 90;
/** Longitude limit in degrees. */
const LON_MAX_DEG = 180;
/** Maximum search radius in nautical miles. */
const RADIUS_MAX_NM = 250;

/** ICAO 24-bit address: optional `~` prefix (non-ICAO), then six hex digits. */
const HEX_PATTERN = /^~?[0-9a-f]{6}$/;
/** Squawk code: four octal digits. */
const SQUAWK_PATTERN = /^[0-7]{4}$/;
/** ICAO airport code: four alphanumeric characters. */
const AIRPORT_ICAO_PATTERN = /^[A-Za-z0-9]{4}$/;

/**
 * Throws a ValidationError for one parameter.
 *
 * @param param - Parameter name, used as the second element of `loc`.
 * @param msg - Short description of the allowed value, starting with the parameter name.
 */
function fail(param: string, msg: string): never {
  const issue: ValidationIssue = { loc: ["path", param], msg, type: CLIENT_VALIDATION_TYPE };
  throw new ValidationError(msg, [issue], undefined);
}

/**
 * Checks that a value is a finite number within `[min, max]`.
 *
 * @param value - Value to check; any runtime type is accepted and rejected if not a number.
 * @param param - Parameter name for the error.
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @returns The value, unchanged.
 */
function assertNumberInRange(value: unknown, param: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(param, `${param} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

/**
 * Checks that a value is a string and returns it trimmed.
 *
 * @param value - Value to check; non-string runtime values are rejected.
 * @param param - Parameter name for the error.
 * @returns The trimmed string.
 */
function trimmedString(value: unknown, param: string): string {
  if (typeof value !== "string") {
    fail(param, `${param} must be a string`);
  }
  return value.trim();
}

/**
 * Checks that a value is a non-empty string after trimming, and returns it trimmed.
 *
 * @param value - Value to check.
 * @param param - Parameter name for the error.
 * @returns The trimmed, non-empty string.
 */
function nonEmptyTrimmed(value: unknown, param: string): string {
  const trimmed = trimmedString(value, param);
  if (trimmed.length === 0) {
    fail(param, `${param} must not be empty`);
  }
  return trimmed;
}

/**
 * Validates a latitude.
 *
 * @param lat - Latitude in degrees, from -90 (south pole) to 90 (north pole).
 * @returns The latitude, unchanged.
 * @throws {ValidationError} If `lat` is not a finite number in `[-90, 90]`.
 */
export function assertLat(lat: number): number {
  return assertNumberInRange(lat, "lat", -LAT_MAX_DEG, LAT_MAX_DEG);
}

/**
 * Validates a longitude.
 *
 * @param lon - Longitude in degrees, from -180 to 180.
 * @returns The longitude, unchanged.
 * @throws {ValidationError} If `lon` is not a finite number in `[-180, 180]`.
 */
export function assertLon(lon: number): number {
  return assertNumberInRange(lon, "lon", -LON_MAX_DEG, LON_MAX_DEG);
}

/**
 * Validates a search radius.
 *
 * @param radiusNm - Integer nautical miles, from 0 to 250.
 * @returns The radius, unchanged.
 * @throws {ValidationError} If `radiusNm` is not an integer in `[0, 250]`.
 */
export function assertRadiusNm(radiusNm: number): number {
  if (
    typeof radiusNm !== "number" ||
    !Number.isInteger(radiusNm) ||
    radiusNm < 0 ||
    radiusNm > RADIUS_MAX_NM
  ) {
    fail("radiusNm", "radiusNm must be an integer between 0 and 250 (nautical miles)");
  }
  return radiusNm;
}

/**
 * Normalizes an ICAO 24-bit hex address for use in a path.
 *
 * Trims whitespace and lowercases the value. An optional leading `~` (used for
 * non-ICAO addresses) is kept.
 *
 * @param hex - Six hex digits, optionally prefixed with `~`, e.g. `"4CA87C"` or `"~2C1A3B"`.
 * @returns The normalized address, e.g. `"4ca87c"` or `"~2c1a3b"`.
 * @throws {ValidationError} If the value is not a string of six hex digits after trimming.
 */
export function normalizeHex(hex: string): string {
  const normalized = trimmedString(hex, "hex").toLowerCase();
  if (!HEX_PATTERN.test(normalized)) {
    fail("hex", "hex must be 6 hex digits, optionally prefixed with ~");
  }
  return normalized;
}

/**
 * Validates a transponder squawk code.
 *
 * @param squawk - Four octal digits, each 0 to 7, e.g. `"7700"`.
 * @returns The squawk code, unchanged.
 * @throws {ValidationError} If the value is not exactly four digits from 0 to 7.
 */
export function assertSquawk(squawk: string): string {
  if (typeof squawk !== "string" || !SQUAWK_PATTERN.test(squawk)) {
    fail("squawk", "squawk must be 4 octal digits (0-7)");
  }
  return squawk;
}

/**
 * Normalizes a callsign by trimming surrounding whitespace.
 *
 * @param callsign - Flight callsign, e.g. `"UAL958  "`.
 * @returns The trimmed callsign, e.g. `"UAL958"`.
 * @throws {ValidationError} If the value is not a string or is empty after trimming.
 */
export function normalizeCallsign(callsign: string): string {
  return nonEmptyTrimmed(callsign, "callsign");
}

/**
 * Normalizes an aircraft registration by trimming surrounding whitespace.
 *
 * @param reg - Registration, e.g. `" G-KELS "`.
 * @returns The trimmed registration, e.g. `"G-KELS"`.
 * @throws {ValidationError} If the value is not a string or is empty after trimming.
 */
export function normalizeRegistration(reg: string): string {
  return nonEmptyTrimmed(reg, "registration");
}

/**
 * Normalizes an aircraft type designator by trimming surrounding whitespace.
 *
 * @param type - Type designator, e.g. `" A320 "`.
 * @returns The trimmed type designator, e.g. `"A320"`.
 * @throws {ValidationError} If the value is not a string or is empty after trimming.
 */
export function normalizeAircraftType(type: string): string {
  return nonEmptyTrimmed(type, "type");
}

/**
 * Normalizes an ICAO airport code.
 *
 * Trims whitespace and uppercases the value. The API treats airport codes
 * case-sensitively, so the uppercase form is always sent.
 *
 * @param icao - Four alphanumeric characters, e.g. `"egll"`.
 * @returns The uppercase code, e.g. `"EGLL"`.
 * @throws {ValidationError} If the value is not four alphanumeric characters after trimming.
 */
export function normalizeAirportIcao(icao: string): string {
  const normalized = trimmedString(icao, "icao");
  if (!AIRPORT_ICAO_PATTERN.test(normalized)) {
    fail("icao", "icao must be 4 alphanumeric characters");
  }
  return normalized.toUpperCase();
}

/**
 * Encodes a value for use as one URL path segment.
 *
 * Applies `encodeURIComponent` to the string form of the value, so `/` and
 * spaces cannot change the request path.
 *
 * @param value - Path parameter, e.g. a registration or an address.
 * @returns The percent-encoded path segment, e.g. `"A%20B%2FC"` for `"A B/C"`.
 */
export function pathSegment(value: string | number): string {
  return encodeURIComponent(String(value));
}
